from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .modules.master_data.models import (
    HotDrugCodeMapping,
    PmdaDrugInteraction,
    PmdaDrugInteractionMatch,
    PrescriptionCatalogMaster,
    ReceiptDrugMaster,
)


@dataclass(frozen=True)
class DrugMatchCandidate:
    yj_code: str
    drug_name: str
    source: str
    source_code: str | None
    normalized_names: tuple[str, ...]


@dataclass(frozen=True)
class PmdaInteractionMatchRecord:
    interaction_id: int
    interacting_drug_normalized: str
    matched_yj_code: str
    matched_drug_name: str
    match_source: str
    match_confidence: int
    source_code: str | None


@dataclass(frozen=True)
class PmdaInteractionMatchSummary:
    interactions: int
    created: int
    deleted: int
    dry_run: bool = False


def normalize_interaction_name(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKC", value).lower()
    normalized = re.sub(r"【般】|\\(局\\)|（局）|局方品|配合剤|製剤|薬剤|薬", "", normalized)
    normalized = re.sub(r"[\\s\\u3000・･/／,，、。\\[\\]（）()「」『』<>＜＞:：;；]+", "", normalized)
    normalized = re.sub(r"(錠|細粒|散|カプセル|cap|徐放|OD|口腔内崩壊|注|注射|点滴|液|ゲル|テープ|パップ|軟膏|クリーム)$", "", normalized)
    return normalized.strip()


def _candidate_names(*values: str | None) -> tuple[str, ...]:
    names = []
    seen: set[str] = set()
    for value in values:
        normalized = normalize_interaction_name(value)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        names.append(normalized)
    return tuple(names)


def _catalog_candidates(db: Session) -> list[DrugMatchCandidate]:
    rows = db.scalars(select(PrescriptionCatalogMaster).where(PrescriptionCatalogMaster.yj_code.is_not(None))).all()
    candidates: list[DrugMatchCandidate] = []
    for row in rows:
        names = _candidate_names(row.drug_name, row.generic_name, *(row.aliases or []))
        if row.yj_code and names:
            candidates.append(
                DrugMatchCandidate(
                    yj_code=row.yj_code,
                    drug_name=row.drug_name,
                    source="catalog",
                    source_code=row.id,
                    normalized_names=names,
                )
            )
    return candidates


def _hot_candidates(db: Session) -> list[DrugMatchCandidate]:
    rows = db.scalars(select(HotDrugCodeMapping).where(HotDrugCodeMapping.yj_code.is_not(None))).all()
    candidates: list[DrugMatchCandidate] = []
    for row in rows:
        names = _candidate_names(row.brand_name, row.listed_name, row.dispensing_package_name)
        if row.yj_code and names:
            candidates.append(
                DrugMatchCandidate(
                    yj_code=row.yj_code,
                    drug_name=row.brand_name,
                    source="hot",
                    source_code=row.dispensing_package_code,
                    normalized_names=names,
                )
            )
    return candidates


def _receipt_candidates(db: Session) -> list[DrugMatchCandidate]:
    rows = db.scalars(select(ReceiptDrugMaster).where(ReceiptDrugMaster.yj_code.is_not(None))).all()
    candidates: list[DrugMatchCandidate] = []
    for row in rows:
        names = _candidate_names(row.name, row.base_name, row.generic_prescription_text)
        if row.yj_code and names:
            candidates.append(
                DrugMatchCandidate(
                    yj_code=row.yj_code,
                    drug_name=row.name,
                    source="receipt",
                    source_code=row.receipt_drug_code,
                    normalized_names=names,
                )
            )
    return candidates


def build_drug_match_candidates(db: Session) -> list[DrugMatchCandidate]:
    return [*_catalog_candidates(db), *_hot_candidates(db), *_receipt_candidates(db)]


def _candidate_confidence(interacting_name: str, candidate_name: str, source: str) -> int | None:
    if not interacting_name or not candidate_name:
        return None
    if interacting_name == candidate_name:
        return {"catalog": 100, "hot": 94, "receipt": 90}.get(source, 80)
    if len(interacting_name) >= 4 and interacting_name in candidate_name:
        return {"catalog": 88, "hot": 84, "receipt": 80}.get(source, 72)
    if len(candidate_name) >= 4 and candidate_name in interacting_name:
        return {"catalog": 86, "hot": 82, "receipt": 78}.get(source, 70)
    return None


def resolve_pmda_interaction_matches(
    interactions: list[PmdaDrugInteraction],
    candidates: list[DrugMatchCandidate],
) -> list[PmdaInteractionMatchRecord]:
    records: list[PmdaInteractionMatchRecord] = []
    for interaction in interactions:
        interacting_name = normalize_interaction_name(interaction.interacting_drug)
        best_by_yj: dict[str, PmdaInteractionMatchRecord] = {}
        for candidate in candidates:
            best_confidence = None
            for candidate_name in candidate.normalized_names:
                confidence = _candidate_confidence(interacting_name, candidate_name, candidate.source)
                if confidence is not None and (best_confidence is None or confidence > best_confidence):
                    best_confidence = confidence
            if best_confidence is None:
                continue
            current = best_by_yj.get(candidate.yj_code)
            record = PmdaInteractionMatchRecord(
                interaction_id=interaction.id,
                interacting_drug_normalized=interacting_name,
                matched_yj_code=candidate.yj_code,
                matched_drug_name=candidate.drug_name,
                match_source=candidate.source,
                match_confidence=best_confidence,
                source_code=candidate.source_code,
            )
            if current is None or record.match_confidence > current.match_confidence:
                best_by_yj[candidate.yj_code] = record
        records.extend(sorted(best_by_yj.values(), key=lambda item: (-item.match_confidence, item.matched_yj_code))[:10])
    return records


def sync_pmda_interaction_matches(
    db: Session,
    *,
    interactions: list[PmdaDrugInteraction] | None = None,
    dry_run: bool = False,
) -> PmdaInteractionMatchSummary:
    interaction_rows = interactions or db.scalars(select(PmdaDrugInteraction).order_by(PmdaDrugInteraction.id)).all()
    interaction_ids = [row.id for row in interaction_rows]
    deleted = 0
    if interaction_ids:
        if dry_run:
            deleted = db.query(PmdaDrugInteractionMatch).filter(
                PmdaDrugInteractionMatch.interaction_id.in_(interaction_ids)
            ).count()
        else:
            result = db.execute(
                delete(PmdaDrugInteractionMatch).where(PmdaDrugInteractionMatch.interaction_id.in_(interaction_ids))
            )
            deleted = result.rowcount or 0

    records = resolve_pmda_interaction_matches(interaction_rows, build_drug_match_candidates(db))
    if not dry_run:
        for record in records:
            db.add(PmdaDrugInteractionMatch(**record.__dict__))
    return PmdaInteractionMatchSummary(
        interactions=len(interaction_rows),
        created=len(records),
        deleted=deleted,
        dry_run=dry_run,
    )
