from __future__ import annotations

from datetime import date, datetime, timezone
import re

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ...drug_import import build_pmda_drug_info_url
from ..common.time import TOKYO_TZ, format_lab_date
from ..master_data.models import (
    ChartTemplateMaster,
    LabSetMaster,
    PmdaDrugInteraction,
    PmdaDrugInteractionMatch,
    PmdaPackageInsertSection,
    PrescriptionCatalogMaster,
    PrescriptionSetMaster,
    ReceiptLongTermListedDrug,
    ReceiptTransitionalDrug,
    ReservationSlotMaster,
    StandardUsageMaster,
)
from ..master_data.schemas import (
    ChartOrderMasterRead,
    ChartTemplateRead,
    LabSetOptionRead,
    PrescriptionCatalogItemRead,
    PrescriptionSetMasterRead,
    ReservationSlotRead,
    StandardUsageMasterRead,
)
from .models import Observation, Patient, PrescriptionOrder, Reservation
from .schemas import (
    LabLongTrendItem,
    LabLongTrendPoint,
    PatientContextRead,
    PatientSummaryRead,
    PrescriptionCopyPreviewRead,
    PrescriptionCopySkippedItem,
    PrescriptionDiffItem,
    PrescriptionHistoryGroupRead,
    PrescriptionRead,
    PrescriptionTimelineGroupRead,
    PrescriptionTimelineItemRead,
)




def get_patient_or_404(db: Session, patient_id: str) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return patient


def patient_age_label(patient: Patient) -> str:
    """birth_date から年齢を算出して "68歳" 形式で返す。無ければ保存済み文字列。

    seed の age 文字列は固定で経年更新されないため、birth_date があれば毎回算出する。
    """
    if patient.birth_date is not None:
        today = date.today()
        years = (
            today.year
            - patient.birth_date.year
            - ((today.month, today.day) < (patient.birth_date.month, patient.birth_date.day))
        )
        return f"{years}歳"
    return patient.age


def patient_to_read(patient: Patient) -> PatientSummaryRead:
    return PatientSummaryRead(
        id=patient.id,
        name=patient.name,
        kana=patient.kana,
        age=patient_age_label(patient),
        sex=patient.sex,
        department=patient.department,
        doctor=patient.doctor,
        reception_number=patient.reception_number,
        reservation_time=patient.reservation_time,
        reception_time=patient.reception_time,
        status=patient.status,
        elapsed=patient.elapsed,
        lab_progress=patient.lab_progress,
        same_name_duplicate_count=patient.same_name_duplicate_count,
        comment=patient.comment,
        demographics=patient.demographics,
        alerts=patient.alerts,
    )


def patient_context_to_read(patient: Patient) -> PatientContextRead:
    return PatientContextRead(
        patient_profile=patient.profile_items,
        problems=patient.problems,
    )


def resolve_pmda_info_url(pmda_info_url: str | None, yj_code: str | None) -> str | None:
    return pmda_info_url or build_pmda_drug_info_url(yj_code, audience="medical")


def build_prescription_history(
    prescriptions: list[PrescriptionOrder],
) -> tuple[list[PrescriptionOrder], list[PrescriptionHistoryGroupRead]]:
    latest_by_drug: dict[str, PrescriptionOrder] = {}
    grouped: dict[str, list[PrescriptionRead]] = {}
    ordered_dates: list[str] = []

    for prescription in prescriptions:
        if prescription.drug_name not in latest_by_drug:
            latest_by_drug[prescription.drug_name] = prescription

        local_date = prescription.created_at.astimezone(TOKYO_TZ).strftime("%Y/%m/%d")
        if local_date not in grouped:
            grouped[local_date] = []
            ordered_dates.append(local_date)
        grouped[local_date].append(PrescriptionRead.model_validate(prescription))

    current_prescriptions = list(latest_by_drug.values())
    current_prescriptions.sort(key=lambda item: item.created_at, reverse=True)

    history_groups = [
        PrescriptionHistoryGroupRead(
            date=local_date,
            label=f"{local_date} 処方",
            is_latest=index == 0,
            item_count=len(grouped[local_date]),
            items=grouped[local_date],
        )
        for index, local_date in enumerate(ordered_dates)
    ]

    return current_prescriptions, history_groups


def prescription_local_date(prescription: PrescriptionOrder) -> str:
    return prescription.created_at.astimezone(TOKYO_TZ).strftime("%Y/%m/%d")


def prescription_today() -> str:
    return datetime.now(TOKYO_TZ).strftime("%Y/%m/%d")


def _patient_problem_names(patient: Patient) -> set[str]:
    names: set[str] = set()
    for problem in patient.problems or []:
        if not isinstance(problem, dict):
            continue
        name = problem.get("name")
        if isinstance(name, str) and name:
            names.add(name)
    return names


def _patient_alert_labels(patient: Patient) -> set[str]:
    labels: set[str] = set()
    for alert in patient.alerts or []:
        if not isinstance(alert, dict):
            continue
        label = alert.get("label")
        if isinstance(label, str) and label:
            labels.add(label)
    return labels


def catalog_by_drug_name(db: Session) -> dict[str, PrescriptionCatalogMaster]:
    rows = db.scalars(select(PrescriptionCatalogMaster)).all()
    return {row.drug_name: row for row in rows}


def _parse_prescription_days(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"\d+", value)
    if match is None:
        return None
    return int(match.group(0))


def build_prescription_safety_warnings(
    *,
    patient: Patient,
    drug_name: str,
    dosage: str,
    days: str,
    catalog: PrescriptionCatalogMaster | None,
    latest_duplicate: PrescriptionOrder | None = None,
    current_prescriptions: list[PrescriptionOrder] | None = None,
    pmda_sections: list[PmdaPackageInsertSection] | None = None,
    pmda_interactions: list[PmdaDrugInteraction] | None = None,
    pmda_interaction_matches: dict[int, list[PmdaDrugInteractionMatch]] | None = None,
    current_catalogs_by_drug: dict[str, PrescriptionCatalogMaster] | None = None,
    transitional_drugs: list[ReceiptTransitionalDrug] | None = None,
    long_term_listed_drug: ReceiptLongTermListedDrug | None = None,
) -> list[str]:
    warnings: list[str] = []
    active_problem_names = _patient_problem_names(patient)
    patient_alert_labels = _patient_alert_labels(patient)

    if (
        latest_duplicate is not None
        and latest_duplicate.created_at.astimezone(TOKYO_TZ).date() == datetime.now(TOKYO_TZ).date()
    ):
        warnings.append("本日すでに同一薬剤を処方済み")

    if catalog:
        if (
            catalog.allergy_conflict_label
            and any(catalog.allergy_conflict_label in label for label in patient_alert_labels if label)
        ):
            warnings.append(f"{catalog.allergy_conflict_label} に注意")

        if catalog.related_problem and catalog.related_problem not in active_problem_names:
            warnings.append(f"関連病名 {catalog.related_problem} を確認")

        if catalog.dosage_options and dosage not in catalog.dosage_options:
            warnings.append("選択した用法が薬剤マスタの標準用法候補にありません")

        requested_days = _parse_prescription_days(days)
        default_days = _parse_prescription_days(catalog.default_days)
        if requested_days is not None and default_days is not None and requested_days > default_days * 2:
            warnings.append(f"処方日数が標準日数 {catalog.default_days} を大きく超えています")

        warnings.extend(
            build_receipt_drug_policy_warnings(
                transitional_drugs=transitional_drugs or [],
                long_term_listed_drug=long_term_listed_drug,
            )
        )
    elif drug_name:
        warnings.append("薬剤マスタ未登録のため安全チェックが限定されています")

    warnings.extend(
        build_pmda_safety_warnings(
            patient=patient,
            current_prescriptions=current_prescriptions or [],
            pmda_sections=pmda_sections or [],
            pmda_interactions=pmda_interactions or [],
            pmda_interaction_matches=pmda_interaction_matches or {},
            current_catalogs_by_drug=current_catalogs_by_drug or {},
        )
    )

    return warnings


def _patient_safety_keywords(patient: Patient) -> set[str]:
    keywords: set[str] = set()
    for value in [*_patient_problem_names(patient), *_patient_alert_labels(patient)]:
        normalized = re.sub(r"^#\d+\s*", "", value).strip()
        if normalized:
            keywords.add(normalized)
    for item in patient.profile_items or []:
        if not isinstance(item, dict):
            continue
        value = item.get("value")
        if isinstance(value, str) and value:
            keywords.add(value)
    return keywords


def _format_receipt_date(value: str | None) -> str | None:
    if not value or len(value) != 8 or not value.isdigit():
        return value
    return f"{value[:4]}/{value[4:6]}/{value[6:8]}"


def build_receipt_drug_policy_warnings(
    *,
    transitional_drugs: list[ReceiptTransitionalDrug],
    long_term_listed_drug: ReceiptLongTermListedDrug | None,
) -> list[str]:
    warnings: list[str] = []
    today = datetime.now(TOKYO_TZ).date()
    earliest_by_code: dict[str, ReceiptTransitionalDrug] = {}
    for row in transitional_drugs:
        current = earliest_by_code.get(row.receipt_drug_code)
        if current is None or row.transitional_expiry < current.transitional_expiry:
            earliest_by_code[row.receipt_drug_code] = row

    for row in earliest_by_code.values():
        label = _format_receipt_date(row.transitional_expiry)
        expiry_date: date | None = None
        if row.transitional_expiry and row.transitional_expiry.isdigit() and len(row.transitional_expiry) == 8:
            expiry_date = date(
                int(row.transitional_expiry[:4]),
                int(row.transitional_expiry[4:6]),
                int(row.transitional_expiry[6:8]),
            )
        if expiry_date is not None and expiry_date < today:
            warnings.append(f"経過措置期限切れ: {row.name} / {label}")
        else:
            warnings.append(f"経過措置対象: {row.name} / 使用期限 {label}")

    if long_term_listed_drug is not None:
        code_note = []
        if long_term_listed_drug.medical_necessity_receipt_code:
            code_note.append(f"医療上必要 {long_term_listed_drug.medical_necessity_receipt_code}")
        if long_term_listed_drug.patient_request_receipt_code:
            code_note.append(f"患者希望 {long_term_listed_drug.patient_request_receipt_code}")
        suffix = f" / {' / '.join(code_note)}" if code_note else ""
        name = long_term_listed_drug.medical_necessity_name or long_term_listed_drug.patient_request_name or ""
        warnings.append(f"長期収載品・選定療養対象: {name}{suffix}")

    return warnings


def _has_patient_keyword(patient: Patient, patterns: tuple[str, ...]) -> bool:
    haystack = " ".join(_patient_safety_keywords(patient))
    return any(pattern in haystack for pattern in patterns)


def _pmda_text_excerpt(text: str, max_length: int = 56) -> str:
    normalized = " ".join(text.split())
    return normalized if len(normalized) <= max_length else f"{normalized[:max_length]}..."


def build_pmda_safety_warnings(
    *,
    patient: Patient,
    current_prescriptions: list[PrescriptionOrder],
    pmda_sections: list[PmdaPackageInsertSection],
    pmda_interactions: list[PmdaDrugInteraction],
    pmda_interaction_matches: dict[int, list[PmdaDrugInteractionMatch]],
    current_catalogs_by_drug: dict[str, PrescriptionCatalogMaster],
) -> list[str]:
    warnings: list[str] = []
    patient_keywords = _patient_safety_keywords(patient)
    has_pregnancy_context = _has_patient_keyword(patient, ("妊娠", "妊婦", "妊娠中"))
    has_renal_context = _has_patient_keyword(patient, ("腎", "CKD", "eGFR", "クレアチニン"))
    current_drug_names = {item.drug_name for item in current_prescriptions}
    current_yj_codes = {
        catalog.yj_code
        for drug_name, catalog in current_catalogs_by_drug.items()
        if drug_name in current_drug_names and catalog.yj_code
    }

    for section in pmda_sections:
        text = section.text
        if section.section_code == "contraindications":
            if any(keyword and keyword in text for keyword in patient_keywords):
                warnings.append(f"PMDA禁忌: {_pmda_text_excerpt(text)}")
            continue

        if section.section_code == "pregnancy" and has_pregnancy_context:
            warnings.append(f"PMDA妊婦注意: {_pmda_text_excerpt(text)}")
            continue

        if section.section_code == "renal_impairment" and has_renal_context:
            warnings.append(f"PMDA腎機能注意: {_pmda_text_excerpt(text)}")
            continue

    for interaction in pmda_interactions:
        resolved_matches = pmda_interaction_matches.get(interaction.id, [])
        resolved_yj_codes = {match.matched_yj_code for match in resolved_matches}
        has_resolved_match = bool(current_yj_codes & resolved_yj_codes)
        has_name_match = any(
            name and (name in interaction.interacting_drug or interaction.interacting_drug in name)
            for name in current_drug_names
        )
        if has_resolved_match or has_name_match:
            evidence = _pmda_text_excerpt(interaction.clinical_effects or interaction.mechanism or "")
            if has_resolved_match:
                matched_names = sorted(
                    {
                        match.matched_drug_name
                        for match in resolved_matches
                        if match.matched_yj_code in current_yj_codes
                    }
                )
                evidence = f"照合: {', '.join(matched_names[:3])} / {evidence}"
            warnings.append(
                f"PMDA相互作用: {interaction.interacting_drug} / "
                f"{evidence}"
            )

    return list(dict.fromkeys(warnings))


def get_pmda_sections_for_catalog(
    db: Session, catalog: PrescriptionCatalogMaster | None
) -> list[PmdaPackageInsertSection]:
    if catalog is None or not catalog.yj_code:
        return []
    return db.scalars(
        select(PmdaPackageInsertSection)
        .where(PmdaPackageInsertSection.yj_code == catalog.yj_code)
        .where(
            PmdaPackageInsertSection.section_code.in_(
                ["contraindications", "pregnancy", "renal_impairment", "interactions"]
            )
        )
        .order_by(PmdaPackageInsertSection.section_code, PmdaPackageInsertSection.id)
    ).all()


def get_pmda_interactions_for_catalog(
    db: Session, catalog: PrescriptionCatalogMaster | None
) -> list[PmdaDrugInteraction]:
    if catalog is None or not catalog.yj_code:
        return []
    return db.scalars(
        select(PmdaDrugInteraction)
        .where(PmdaDrugInteraction.yj_code == catalog.yj_code)
        .order_by(PmdaDrugInteraction.interacting_drug, PmdaDrugInteraction.id)
    ).all()


def get_pmda_interaction_matches(
    db: Session,
    interactions: list[PmdaDrugInteraction],
) -> dict[int, list[PmdaDrugInteractionMatch]]:
    interaction_ids = [interaction.id for interaction in interactions]
    if not interaction_ids:
        return {}
    rows = db.scalars(
        select(PmdaDrugInteractionMatch)
        .where(PmdaDrugInteractionMatch.interaction_id.in_(interaction_ids))
        .order_by(PmdaDrugInteractionMatch.match_confidence.desc(), PmdaDrugInteractionMatch.matched_drug_name)
    ).all()
    grouped: dict[int, list[PmdaDrugInteractionMatch]] = {}
    for row in rows:
        grouped.setdefault(row.interaction_id, []).append(row)
    return grouped


def get_transitional_drugs_for_catalog(
    db: Session,
    catalog: PrescriptionCatalogMaster | None,
) -> list[ReceiptTransitionalDrug]:
    if catalog is None or not catalog.yj_code:
        return []
    return db.scalars(
        select(ReceiptTransitionalDrug)
        .where(ReceiptTransitionalDrug.yj_code == catalog.yj_code)
        .order_by(ReceiptTransitionalDrug.transitional_expiry, ReceiptTransitionalDrug.receipt_drug_code)
    ).all()


def get_long_term_listed_drug_for_catalog(
    db: Session,
    catalog: PrescriptionCatalogMaster | None,
) -> ReceiptLongTermListedDrug | None:
    if catalog is None or not catalog.yj_code:
        return None
    return db.get(ReceiptLongTermListedDrug, catalog.yj_code)


def build_warning_details(warnings: list[str]) -> list[dict[str, str | None]]:
    details: list[dict[str, str | None]] = []
    for warning in warnings:
        if warning.startswith("PMDA禁忌"):
            source = "PMDA 電子添文 / 禁忌"
            severity = "contraindication"
            evidence = warning.removeprefix("PMDA禁忌: ").strip() or warning
        elif warning.startswith("PMDA妊婦注意"):
            source = "PMDA 電子添文 / 妊婦"
            severity = "warning"
            evidence = warning.removeprefix("PMDA妊婦注意: ").strip() or warning
        elif warning.startswith("PMDA腎機能注意"):
            source = "PMDA 電子添文 / 腎機能"
            severity = "warning"
            evidence = warning.removeprefix("PMDA腎機能注意: ").strip() or warning
        elif warning.startswith("PMDA相互作用"):
            source = "PMDA 電子添文 / 相互作用"
            severity = "warning"
            evidence = warning.removeprefix("PMDA相互作用: ").strip() or warning
        elif warning.startswith("経過措置期限切れ"):
            source = "支払基金 基本マスター / 経過措置"
            severity = "danger"
            evidence = warning.removeprefix("経過措置期限切れ: ").strip() or warning
        elif warning.startswith("経過措置対象"):
            source = "支払基金 基本マスター / 経過措置"
            severity = "warning"
            evidence = warning.removeprefix("経過措置対象: ").strip() or warning
        elif warning.startswith("長期収載品・選定療養対象"):
            source = "支払基金 基本マスター / 長期収載品・選定療養"
            severity = "warning"
            evidence = warning.removeprefix("長期収載品・選定療養対象: ").strip() or warning
        elif warning.startswith("PMDA"):
            source = "PMDA 電子添文"
            severity = "warning"
            evidence = warning
        else:
            source = "Manta safety rule"
            severity = "warning"
            evidence = warning
        details.append({"message": warning, "source": source, "severity": severity, "evidence": evidence})
    return details


def build_prescription_timeline(
    *,
    patient: Patient,
    prescriptions: list[PrescriptionOrder],
    catalog_by_drug: dict[str, PrescriptionCatalogMaster],
) -> list[PrescriptionTimelineGroupRead]:
    latest_by_drug: dict[str, PrescriptionOrder] = {}
    for prescription in prescriptions:
        if prescription.drug_name not in latest_by_drug:
            latest_by_drug[prescription.drug_name] = prescription

    today = prescription_today()
    grouped: dict[str, list[PrescriptionTimelineItemRead]] = {}
    ordered_dates: list[str] = []
    pmda_sections_by_yj: dict[str, list[PmdaPackageInsertSection]] = {}
    for catalog in catalog_by_drug.values():
        if catalog.yj_code and catalog.yj_code not in pmda_sections_by_yj:
            pmda_sections_by_yj[catalog.yj_code] = []

    for prescription in prescriptions:
        local_date = prescription_local_date(prescription)
        if local_date not in grouped:
            grouped[local_date] = []
            ordered_dates.append(local_date)

        catalog = catalog_by_drug.get(prescription.drug_name)
        if catalog and catalog.yj_code and not pmda_sections_by_yj[catalog.yj_code]:
            pmda_sections_by_yj[catalog.yj_code] = []
        warnings = build_prescription_safety_warnings(
            patient=patient,
            drug_name=prescription.drug_name,
            dosage=prescription.dosage,
            days=prescription.days,
            catalog=catalog,
            current_prescriptions=prescriptions,
            pmda_sections=pmda_sections_by_yj.get(catalog.yj_code, []) if catalog and catalog.yj_code else [],
            pmda_interactions=[],
            pmda_interaction_matches={},
            current_catalogs_by_drug=catalog_by_drug,
            transitional_drugs=[],
            long_term_listed_drug=None,
        )
        if local_date == today:
            warnings.append("本日処方済み")

        grouped[local_date].append(
            PrescriptionTimelineItemRead(
                **PrescriptionRead.model_validate(prescription).model_dump(exclude={"warnings", "warning_details"}),
                is_current=latest_by_drug.get(prescription.drug_name) is prescription,
                catalog_id=catalog.id if catalog else None,
                pmda_info_url=resolve_pmda_info_url(
                    catalog.pmda_info_url if catalog else None,
                    catalog.yj_code if catalog else None,
                ),
                warnings=warnings,
            )
        )

    return [
        PrescriptionTimelineGroupRead(
            date=local_date,
            label=f"{local_date} 処方",
            is_latest=index == 0,
            is_today=local_date == today,
            copyable=local_date != today,
            item_count=len(grouped[local_date]),
            warning_count=sum(len(item.warnings) for item in grouped[local_date]),
            items=grouped[local_date],
        )
        for index, local_date in enumerate(ordered_dates)
    ]


def select_copy_source_group(
    timeline: list[PrescriptionTimelineGroupRead],
    *,
    source_date: str | None,
) -> PrescriptionTimelineGroupRead:
    if source_date:
        selected = next((group for group in timeline if group.date == source_date), None)
        if selected is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prescription source date not found")
        return selected

    non_today = next((group for group in timeline if not group.is_today), None)
    if non_today is not None:
        return non_today
    if timeline:
        return timeline[0]
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prescription history not found")


def copy_skip_reason(
    *,
    patient: Patient,
    source_item: PrescriptionTimelineItemRead,
    todays_drug_names: set[str],
) -> str | None:
    if source_item.drug_name in todays_drug_names:
        return "本日すでに同一薬剤が処方されています"
    if "ペニシリンアレルギー" in _patient_alert_labels(patient) and "アモキシシリン" in source_item.drug_name:
        return "ペニシリンアレルギーに該当します"
    if any("に注意" in warning for warning in source_item.warnings):
        return "アレルギー・禁忌ラベルを確認してください"
    return None


def build_prescription_copy_preview(
    *,
    patient: Patient,
    prescriptions: list[PrescriptionOrder],
    source_date: str | None,
    catalog_by_drug: dict[str, PrescriptionCatalogMaster],
) -> PrescriptionCopyPreviewRead:
    timeline = build_prescription_timeline(
        patient=patient,
        prescriptions=prescriptions,
        catalog_by_drug=catalog_by_drug,
    )
    source_group = select_copy_source_group(timeline, source_date=source_date)
    today = prescription_today()
    todays_prescriptions = [
        prescription for prescription in prescriptions if prescription_local_date(prescription) == today
    ]
    todays_by_drug = {prescription.drug_name: prescription for prescription in todays_prescriptions}
    todays_drug_names = set(todays_by_drug)
    planned_items: list[PrescriptionTimelineItemRead] = []
    skipped_items: list[PrescriptionCopySkippedItem] = []
    diff_items: list[PrescriptionDiffItem] = []
    source_drug_names = {item.drug_name for item in source_group.items}

    for source_item in source_group.items:
        current = todays_by_drug.get(source_item.drug_name)
        reason = copy_skip_reason(
            patient=patient,
            source_item=source_item,
            todays_drug_names=todays_drug_names,
        )
        if reason:
            skipped_items.append(PrescriptionCopySkippedItem(drug_name=source_item.drug_name, reason=reason))
            if current and (current.dosage != source_item.dosage or current.days != source_item.days):
                status_label = "用法・日数変更"
                status_value = "changed"
            else:
                status_label = "スキップ"
                status_value = "skipped"
            diff_items.append(
                PrescriptionDiffItem(
                    drug_name=source_item.drug_name,
                    status=status_value,
                    label=status_label,
                    source_dosage=f"{source_item.dosage} / {source_item.days}",
                    current_dosage=f"{current.dosage} / {current.days}" if current else None,
                    reason=reason,
                )
            )
            continue

        planned_items.append(source_item)
        diff_items.append(
            PrescriptionDiffItem(
                drug_name=source_item.drug_name,
                status="to_copy",
                label="追加予定",
                source_dosage=f"{source_item.dosage} / {source_item.days}",
            )
        )

    for current in todays_prescriptions:
        if current.drug_name in source_drug_names:
            continue
        diff_items.append(
            PrescriptionDiffItem(
                drug_name=current.drug_name,
                status="added",
                label="今回追加済み",
                current_dosage=f"{current.dosage} / {current.days}",
            )
        )

    return PrescriptionCopyPreviewRead(
        source_date=source_group.date,
        planned_count=len(planned_items),
        skipped_count=len(skipped_items),
        planned_items=planned_items,
        skipped_items=skipped_items,
        diff_items=diff_items,
    )


def format_lab_value(row: Observation) -> str:
    if row.value_quantity_value is not None:
        value = row.value_quantity_value.normalize()
        value_text = format(value, "f")
        if "." in value_text:
            value_text = value_text.rstrip("0").rstrip(".")
        return f"{value_text} {row.value_quantity_unit}".strip()
    return row.value_string or ""


def _lab_numeric_value(row: Observation) -> float | None:
    if row.value_quantity_value is None:
        return None
    return float(row.value_quantity_value)


def _lab_flag(row: Observation) -> str:
    return "high" if row.interpretation_code in {"H", "HH", "A"} else "normal"


def _delta_label(delta: float | None) -> str:
    if delta is None:
        return "比較不可"
    if delta == 0:
        return "±0.0"
    return f"{delta:+.1f}"


def build_lab_long_trends(rows: list[Observation]) -> list[LabLongTrendItem]:
    grouped: dict[str, list[Observation]] = {}
    for row in rows:
        item = row.code_text or row.code_display or row.code or "未分類"
        grouped.setdefault(item, []).append(row)

    trends: list[LabLongTrendItem] = []
    for item, item_rows in grouped.items():
        ordered = sorted(
            item_rows,
            key=lambda row: row.effective_datetime or datetime.min.replace(tzinfo=timezone.utc),
        )
        points = [
            LabLongTrendPoint(
                date=format_lab_date(row.effective_datetime),
                value=format_lab_value(row),
                numeric_value=_lab_numeric_value(row),
                unit=row.value_quantity_unit,
                flag=_lab_flag(row),  # type: ignore[arg-type]
                observation_id=row.id,
            )
            for row in ordered
        ]
        numeric_points = [point for point in points if point.numeric_value is not None]
        latest = points[-1] if points else None
        previous = points[-2] if len(points) >= 2 else None
        latest_numeric = numeric_points[-1].numeric_value if numeric_points else None
        previous_numeric = numeric_points[-2].numeric_value if len(numeric_points) >= 2 else None
        delta = (
            latest_numeric - previous_numeric
            if latest_numeric is not None and previous_numeric is not None
            else None
        )
        first_row = ordered[-1] if ordered else None
        trends.append(
            LabLongTrendItem(
                item=item,
                code=first_row.code if first_row else None,
                display=first_row.code_display if first_row else None,
                baseline=first_row.reference_range_text if first_row else None,
                latest_value=latest.value if latest else None,
                previous_value=previous.value if previous else None,
                latest_date=latest.date if latest else None,
                delta=delta,
                delta_label=_delta_label(delta),
                abnormal_count=sum(1 for point in points if point.flag == "high"),
                point_count=len(points),
                points=points,
            )
        )

    return sorted(trends, key=lambda item: (item.abnormal_count == 0, item.item))


def computed_reservation_slot_state(*, capacity: int, booked_count: int) -> str:
    if capacity <= 0 or booked_count >= capacity:
        return "full"
    remaining_count = capacity - booked_count
    few_threshold = max(1, capacity // 4)
    if booked_count > 0 and remaining_count <= few_threshold:
        return "few"
    return "available"


def get_reservation_slot_counts(db: Session, slot_ids: list[str]) -> dict[str, int]:
    if not slot_ids:
        return {}
    rows = db.execute(
        select(Reservation.slot_id, func.count(Reservation.id))
        .where(Reservation.slot_id.in_(slot_ids))
        .group_by(Reservation.slot_id)
    ).all()
    return {str(slot_id): int(count) for slot_id, count in rows if slot_id is not None}


def reservation_slot_to_read(slot: ReservationSlotMaster, *, booked_count: int = 0) -> ReservationSlotRead:
    # capacity=0（受付停止）を 1 に化けさせないため or を使わない。
    capacity = slot.capacity if slot.capacity is not None else 1
    remaining_count = max(capacity - booked_count, 0)
    return ReservationSlotRead(
        id=slot.id,
        sort_order=slot.sort_order,
        is_active=slot.is_active,
        date=slot.date,
        time=slot.time,
        department=slot.department,
        doctor=slot.doctor,
        state=computed_reservation_slot_state(capacity=capacity, booked_count=booked_count),
        capacity=capacity,
        booked_count=booked_count,
        remaining_count=remaining_count,
    )


def get_chart_order_masters_read(
    db: Session,
    *,
    include_inactive: bool = False,
    department: str | None = None,
) -> ChartOrderMasterRead:
    prescription_catalog_query = select(PrescriptionCatalogMaster).order_by(
        PrescriptionCatalogMaster.sort_order, PrescriptionCatalogMaster.id
    )
    if not include_inactive:
        prescription_catalog_query = prescription_catalog_query.where(PrescriptionCatalogMaster.is_active.is_(True))
    prescription_catalog = db.scalars(prescription_catalog_query).all()

    standard_usage_query = select(StandardUsageMaster).order_by(StandardUsageMaster.sort_order, StandardUsageMaster.id)
    if not include_inactive:
        standard_usage_query = standard_usage_query.where(StandardUsageMaster.is_active.is_(True))
    standard_usage_masters = db.scalars(standard_usage_query).all()

    prescription_set_query = select(PrescriptionSetMaster).order_by(
        PrescriptionSetMaster.sort_order, PrescriptionSetMaster.id
    )
    if not include_inactive:
        prescription_set_query = prescription_set_query.where(PrescriptionSetMaster.is_active.is_(True))
    if department:
        prescription_set_query = prescription_set_query.where(
            or_(PrescriptionSetMaster.department == department, PrescriptionSetMaster.department == "共通")
        )
    prescription_sets = db.scalars(prescription_set_query).all()

    lab_set_options_query = select(LabSetMaster).order_by(LabSetMaster.sort_order, LabSetMaster.id)
    if not include_inactive:
        lab_set_options_query = lab_set_options_query.where(LabSetMaster.is_active.is_(True))
    lab_set_options = db.scalars(lab_set_options_query).all()

    reservation_slots_query = select(ReservationSlotMaster).order_by(
        ReservationSlotMaster.sort_order, ReservationSlotMaster.id
    )
    if not include_inactive:
        reservation_slots_query = reservation_slots_query.where(ReservationSlotMaster.is_active.is_(True))
    if department:
        reservation_slots_query = reservation_slots_query.where(ReservationSlotMaster.department == department)
    reservation_slots = db.scalars(reservation_slots_query).all()
    reservation_slot_counts = get_reservation_slot_counts(db, [slot.id for slot in reservation_slots])

    chart_templates_query = select(ChartTemplateMaster).order_by(
        ChartTemplateMaster.sort_order, ChartTemplateMaster.id
    )
    if not include_inactive:
        chart_templates_query = chart_templates_query.where(ChartTemplateMaster.is_active.is_(True))
    if department:
        chart_templates_query = chart_templates_query.where(
            or_(ChartTemplateMaster.department == department, ChartTemplateMaster.department == "共通")
        )
    chart_templates = db.scalars(chart_templates_query).all()

    return ChartOrderMasterRead(
        prescription_catalog=[PrescriptionCatalogItemRead.model_validate(item) for item in prescription_catalog],
        standard_usage_masters=[StandardUsageMasterRead.model_validate(item) for item in standard_usage_masters],
        prescription_sets=[PrescriptionSetMasterRead.model_validate(item) for item in prescription_sets],
        lab_set_options=[LabSetOptionRead.model_validate(item) for item in lab_set_options],
        reservation_slots=[
            reservation_slot_to_read(item, booked_count=reservation_slot_counts.get(item.id, 0))
            for item in reservation_slots
        ],
        chart_templates=[ChartTemplateRead.model_validate(item) for item in chart_templates],
    )
