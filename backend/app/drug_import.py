from __future__ import annotations

import csv
import hashlib
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Literal

from sqlalchemy.orm import Session

from .models import PrescriptionCatalogMaster

DrugCategory = Literal["内服", "外用", "頓服"]
PMDA_BASE_URL = "https://www.pmda.go.jp/PmdaSearch/rdSearch/02"
VALID_YJ_CODE_PATTERN = re.compile(r"^[0-9A-Z]{12}$")


def normalize_header(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).strip().replace(" ", "")
    return normalized.translate(str.maketrans({"‐": "-", "‑": "-", "−": "-", "–": "-", "—": "-", "―": "-"})).lower()


HEADER_ALIASES = {
    "id": "id",
    "識別子": "id",
    "薬剤id": "id",
    "sort_order": "sort_order",
    "表示順": "sort_order",
    "is_active": "is_active",
    "公開状態": "is_active",
    "active": "is_active",
    "drug_name": "drug_name",
    "医薬品名": "drug_name",
    "販売名": "drug_name",
    "category": "category",
    "区分": "category",
    "generic_name": "generic_name",
    "一般名": "generic_name",
    "name_kana": "name_kana",
    "カナ": "name_kana",
    "販売名カナ": "name_kana",
    "aliases": "aliases",
    "別名": "aliases",
    "検索語": "aliases",
    "yj_code": "yj_code",
    "yjコード": "yj_code",
    "hot_code": "hot_code",
    "hotコード": "hot_code",
    "dosage_form": "dosage_form",
    "剤形": "dosage_form",
    "strength": "strength",
    "規格": "strength",
    "dosage_options": "dosage_options",
    "用法候補": "dosage_options",
    "standard_usage_code": "standard_usage_code",
    "標準用法コード": "standard_usage_code",
    "default_days": "default_days",
    "既定日数": "default_days",
    "pmda_info_url": "pmda_info_url",
    "pmdaリンク": "pmda_info_url",
    "related_problem": "related_problem",
    "関連病名": "related_problem",
    "allergy_conflict_label": "allergy_conflict_label",
    "禁忌ラベル": "allergy_conflict_label",
}

REQUIRED_FIELDS = {"drug_name"}


@dataclass
class DrugImportRecord:
    id: str
    sort_order: int
    is_active: bool
    drug_name: str
    category: DrugCategory
    dosage_options: list[str]
    generic_name: str | None
    name_kana: str | None
    aliases: list[str]
    yj_code: str | None
    hot_code: str | None
    dosage_form: str | None
    strength: str | None
    standard_usage_code: str | None
    default_days: str | None
    pmda_info_url: str | None
    allergy_conflict_label: str | None
    related_problem: str | None


@dataclass(frozen=True)
class DrugImportSummary:
    total: int
    created: int
    updated: int
    unchanged: int
    deactivated: int
    dry_run: bool = False


def build_pmda_drug_info_url(yj_code: str | None, *, audience: Literal["medical", "consumer"] = "medical") -> str | None:
    if not yj_code:
        return None

    normalized = unicodedata.normalize("NFKC", yj_code).strip().upper()
    if not VALID_YJ_CODE_PATTERN.fullmatch(normalized):
        return None

    user = "1" if audience == "medical" else "2"
    return f"{PMDA_BASE_URL}/{normalized}?user={user}"


def _read_csv_rows(file_path: Path) -> list[list[str]]:
    last_error: UnicodeDecodeError | None = None
    for encoding in ("utf-8-sig", "cp932"):
        try:
            with file_path.open("r", encoding=encoding, newline="") as handle:
                reader = csv.reader(handle)
                return [row for row in reader if row]
        except UnicodeDecodeError as error:
            last_error = error

    assert last_error is not None
    raise last_error


def _resolve_headers(title_row: list[str]) -> dict[int, str]:
    resolved: dict[int, str] = {}
    for index, raw_header in enumerate(title_row):
        normalized = normalize_header(raw_header)
        if normalized in HEADER_ALIASES:
            resolved[index] = HEADER_ALIASES[normalized]

    missing = REQUIRED_FIELDS - set(resolved.values())
    if missing:
        missing_names = ", ".join(sorted(missing))
        raise ValueError(f"drug master csv is missing required fields: {missing_names}")

    return resolved


def _split_multi_value_field(value: str) -> list[str]:
    return [item.strip() for item in re.split(r"[\r\n|;,、]+", value) if item.strip()]


def _normalize_category(value: str | None) -> DrugCategory:
    if value in ("内服", "外用", "頓服"):
        return value
    return "内服"


def _normalize_bool(value: str | None, *, default: bool = True) -> bool:
    if value is None:
        return default

    normalized = unicodedata.normalize("NFKC", value).strip().lower()
    if normalized in {"", "-"}:
        return default
    if normalized in {"1", "true", "yes", "on", "active", "公開", "有効"}:
        return True
    if normalized in {"0", "false", "no", "off", "inactive", "非公開", "無効"}:
        return False
    return default


def _normalize_sort_order(value: str | None, *, fallback: int) -> int:
    if value is None:
        return fallback
    try:
        return int(value)
    except ValueError:
        return fallback


def _generate_master_id(*, drug_name: str, yj_code: str | None, hot_code: str | None) -> str:
    if yj_code:
        return f"yj-{yj_code.lower()}"
    if hot_code:
        return f"hot-{hot_code.lower()}"

    digest = hashlib.sha1(drug_name.encode("utf-8")).hexdigest()[:12]
    return f"drug-{digest}"


def iter_drug_master_records(*, csv_file: Path) -> Iterable[DrugImportRecord]:
    rows = _read_csv_rows(csv_file)
    if not rows:
        raise ValueError("drug master csv is empty")

    headers = _resolve_headers(rows[0])
    for fallback_sort_order, row in enumerate(rows[1:], start=1):
        values = {
            field_name: (row[index].strip() if index < len(row) else "")
            for index, field_name in headers.items()
        }
        if not values.get("drug_name"):
            continue

        yj_code = values.get("yj_code") or None
        hot_code = values.get("hot_code") or None
        yield DrugImportRecord(
            id=values.get("id") or _generate_master_id(drug_name=values["drug_name"], yj_code=yj_code, hot_code=hot_code),
            sort_order=_normalize_sort_order(values.get("sort_order"), fallback=fallback_sort_order * 10),
            is_active=_normalize_bool(values.get("is_active"), default=True),
            drug_name=values["drug_name"],
            category=_normalize_category(values.get("category")),
            dosage_options=_split_multi_value_field(values.get("dosage_options", "")),
            generic_name=values.get("generic_name") or None,
            name_kana=values.get("name_kana") or None,
            aliases=_split_multi_value_field(values.get("aliases", "")),
            yj_code=yj_code,
            hot_code=hot_code,
            dosage_form=values.get("dosage_form") or None,
            strength=values.get("strength") or None,
            standard_usage_code=values.get("standard_usage_code") or None,
            default_days=values.get("default_days") or None,
            pmda_info_url=values.get("pmda_info_url") or build_pmda_drug_info_url(yj_code, audience="medical"),
            allergy_conflict_label=values.get("allergy_conflict_label") or None,
            related_problem=values.get("related_problem") or None,
        )


def upsert_drug_master_records(db: Session, records: Iterable[DrugImportRecord]) -> tuple[int, int]:
    created = 0
    updated = 0

    for record in records:
        existing = db.get(PrescriptionCatalogMaster, record.id)
        payload = {
            "sort_order": record.sort_order,
            "is_active": record.is_active,
            "drug_name": record.drug_name,
            "category": record.category,
            "dosage_options": record.dosage_options,
            "generic_name": record.generic_name,
            "name_kana": record.name_kana,
            "aliases": record.aliases,
            "yj_code": record.yj_code,
            "hot_code": record.hot_code,
            "dosage_form": record.dosage_form,
            "strength": record.strength,
            "standard_usage_code": record.standard_usage_code,
            "default_days": record.default_days,
            "pmda_info_url": record.pmda_info_url,
            "allergy_conflict_label": record.allergy_conflict_label,
            "related_problem": record.related_problem,
        }

        if existing is None:
            db.add(PrescriptionCatalogMaster(id=record.id, **payload))
            created += 1
            continue

        has_changed = any(getattr(existing, key) != value for key, value in payload.items())
        if not has_changed:
            continue

        for key, value in payload.items():
            setattr(existing, key, value)
        updated += 1

    return created, updated


def _record_payload(record: DrugImportRecord) -> dict[str, object]:
    return {
        "sort_order": record.sort_order,
        "is_active": record.is_active,
        "drug_name": record.drug_name,
        "category": record.category,
        "dosage_options": record.dosage_options,
        "generic_name": record.generic_name,
        "name_kana": record.name_kana,
        "aliases": record.aliases,
        "yj_code": record.yj_code,
        "hot_code": record.hot_code,
        "dosage_form": record.dosage_form,
        "strength": record.strength,
        "standard_usage_code": record.standard_usage_code,
        "default_days": record.default_days,
        "pmda_info_url": record.pmda_info_url,
        "allergy_conflict_label": record.allergy_conflict_label,
        "related_problem": record.related_problem,
    }


def sync_drug_master_records(
    db: Session,
    records: Iterable[DrugImportRecord],
    *,
    dry_run: bool = False,
    deactivate_missing: bool = False,
    managed_id_prefixes: tuple[str, ...] = ("yj-", "hot-"),
) -> DrugImportSummary:
    """Continuously sync a HOT/YJ-derived master file into the local catalog.

    `upsert_drug_master_records` is kept for simple imports. This function is
    intended for recurring jobs: it can dry-run and optionally deactivate rows
    that disappeared from a full managed import file.
    """

    record_list = list(records)
    incoming_ids = {record.id for record in record_list}
    created = updated = unchanged = deactivated = 0

    for record in record_list:
        existing = db.get(PrescriptionCatalogMaster, record.id)
        payload = _record_payload(record)

        if existing is None:
            created += 1
            if not dry_run:
                db.add(PrescriptionCatalogMaster(id=record.id, **payload))
            continue

        has_changed = any(getattr(existing, key) != value for key, value in payload.items())
        if not has_changed:
            unchanged += 1
            continue

        updated += 1
        if not dry_run:
            for key, value in payload.items():
                setattr(existing, key, value)

    if deactivate_missing:
        managed_rows = db.query(PrescriptionCatalogMaster).filter(PrescriptionCatalogMaster.is_active.is_(True)).all()
        for row in managed_rows:
            if row.id in incoming_ids or not row.id.startswith(managed_id_prefixes):
                continue
            deactivated += 1
            if not dry_run:
                row.is_active = False

    return DrugImportSummary(
        total=len(record_list),
        created=created,
        updated=updated,
        unchanged=unchanged,
        deactivated=deactivated,
        dry_run=dry_run,
    )
