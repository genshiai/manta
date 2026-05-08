from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
import re
import unicodedata
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import case, desc, func, or_, select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import SessionLocal, get_db
from .drug_import import build_pmda_drug_info_url
from .fhir.router import router as fhir_router
from .migrations import run_migrations
from .models import (
    AuditLog,
    ChartNote,
    DiagnosisAliasMaster,
    DiagnosisMaster,
    LabOrder,
    Observation,
    Patient,
    PmdaDrugInteraction,
    PmdaDrugInteractionMatch,
    PmdaPackageInsertSection,
    PrescriptionOrder,
    ReceiptLongTermListedDrug,
    ReceiptTransitionalDrug,
    Reservation,
    User,
)
from .models import (
    ChartTemplateMaster,
    LabSetMaster,
    PrescriptionCatalogMaster,
    PrescriptionSetMaster,
    ReservationSlotMaster,
    StandardUsageMaster,
)
from .schemas import (
    AuditLogRead,
    AuthTokenRead,
    ChartOrderMasterRead,
    ChartTemplateCreateRequest,
    ChartTemplateRead,
    ChartTemplateUpdateRequest,
    ChartSaveRequest,
    ChartWorkspaceRead,
    DiagnosisMasterRead,
    ImagingOrderCreateRequest,
    ImagingOrderItem,
    LabLongTrendItem,
    LabLongTrendPoint,
    LabSetOptionCreateRequest,
    LabOrderCreateRequest,
    LabOrderRead,
    LabSetOptionRead,
    LabSetOptionUpdateRequest,
    LoginRequest,
    PatientStatusUpdateRequest,
    PatientSummaryRead,
    PatientContextRead,
    PatientContextUpdateRequest,
    PrescriptionCatalogItemCreateRequest,
    PrescriptionCatalogItemRead,
    PrescriptionSetMasterCreateRequest,
    PrescriptionSetMasterRead,
    PrescriptionSetMasterUpdateRequest,
    PrescriptionCatalogItemUpdateRequest,
    PrescriptionCreateRequest,
    PrescriptionCopyPreviewRead,
    PrescriptionDiffItem,
    PrescriptionCopyLastRead,
    PrescriptionCopyLastRequest,
    PrescriptionCopySkippedItem,
    PrescriptionHistoryGroupRead,
    PrescriptionRead,
    PrescriptionTimelineGroupRead,
    PrescriptionTimelineItemRead,
    ProcedureOrderCreateRequest,
    ProcedureOrderItem,
    ReservationSlotCreateRequest,
    ReservationSlotRead,
    ReservationSlotUpdateRequest,
    ReservationRead,
    ReservationUpsertRequest,
    StandardUsageMasterCreateRequest,
    StandardUsageMasterRead,
    StandardUsageMasterUpdateRequest,
    UserCreateRequest,
    UserPasswordResetRequest,
    UserSummaryRead,
    UserSessionRead,
    UserUpdateRequest,
)
from .security import (
    AuthenticatedContext,
    create_access_token,
    get_current_auth,
    get_current_user,
    hash_password,
    password_needs_upgrade,
    require_role,
    verify_password,
)
from .seed import seed_demo_data


@asynccontextmanager
async def lifespan(_: FastAPI):
    run_migrations()
    with SessionLocal() as db:
        seed_demo_data(db)
    yield


settings = get_settings()
app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(fhir_router)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


TOKYO_TZ = ZoneInfo("Asia/Tokyo")


def log_audit(
    db: Session,
    *,
    actor: str,
    action: str,
    scope: str,
    detail: str,
    patient: Patient | None = None,
) -> None:
    db.add(
        AuditLog(
            actor=actor,
            action=action,
            scope=scope,
            detail=detail,
            patient_id=patient.id if patient else None,
            patient_name=patient.name if patient else None,
        )
    )


def patient_to_read(patient: Patient) -> PatientSummaryRead:
    return PatientSummaryRead(
        id=patient.id,
        name=patient.name,
        kana=patient.kana,
        age=patient.age,
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


def user_to_session(user: User, *, logged_in_at: datetime) -> UserSessionRead:
    return UserSessionRead(
        user_id=user.id,
        display_name=user.display_name,
        department=user.department,
        role=user.role,
        logged_in_at=logged_in_at,
        password_expires_at=user.password_expires_at,
    )


def user_to_summary(user: User) -> UserSummaryRead:
    return UserSummaryRead(
        user_id=user.id,
        display_name=user.display_name,
        department=user.department,
        role=user.role,
        password_expires_at=user.password_expires_at,
    )


def get_patient_or_404(db: Session, patient_id: str) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return patient


def get_user_or_404(db: Session, user_id: str) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def get_prescription_catalog_master_or_404(db: Session, master_id: str) -> PrescriptionCatalogMaster:
    master = db.get(PrescriptionCatalogMaster, master_id)
    if master is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prescription catalog not found")
    return master


def get_standard_usage_master_or_404(db: Session, master_id: str) -> StandardUsageMaster:
    master = db.get(StandardUsageMaster, master_id)
    if master is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Standard usage not found")
    return master


def get_prescription_set_master_or_404(db: Session, master_id: str) -> PrescriptionSetMaster:
    master = db.get(PrescriptionSetMaster, master_id)
    if master is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prescription set not found")
    return master


def get_lab_set_master_or_404(db: Session, master_id: str) -> LabSetMaster:
    master = db.get(LabSetMaster, master_id)
    if master is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab set not found")
    return master


def get_reservation_slot_master_or_404(db: Session, master_id: str) -> ReservationSlotMaster:
    master = db.get(ReservationSlotMaster, master_id)
    if master is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation slot not found")
    return master


def get_chart_template_master_or_404(db: Session, master_id: str) -> ChartTemplateMaster:
    master = db.get(ChartTemplateMaster, master_id)
    if master is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chart template not found")
    return master


def resolve_pmda_info_url(pmda_info_url: str | None, yj_code: str | None) -> str | None:
    return pmda_info_url or build_pmda_drug_info_url(yj_code, audience="medical")


def normalize_diagnosis_search_query(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).strip()
    return normalized.replace("　", " ")


def to_katakana(value: str) -> str:
    chars = []
    for char in value:
        if "ぁ" <= char <= "ゖ":
            chars.append(chr(ord(char) + 0x60))
        else:
            chars.append(char)
    return "".join(chars)


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


def _prescription_local_date(prescription: PrescriptionOrder) -> str:
    return prescription.created_at.astimezone(TOKYO_TZ).strftime("%Y/%m/%d")


def _prescription_today() -> str:
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


def _catalog_by_drug_name(db: Session) -> dict[str, PrescriptionCatalogMaster]:
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


def get_pmda_sections_for_catalog(db: Session, catalog: PrescriptionCatalogMaster | None) -> list[PmdaPackageInsertSection]:
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


def get_pmda_interactions_for_catalog(db: Session, catalog: PrescriptionCatalogMaster | None) -> list[PmdaDrugInteraction]:
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

    today = _prescription_today()
    grouped: dict[str, list[PrescriptionTimelineItemRead]] = {}
    ordered_dates: list[str] = []
    pmda_sections_by_yj: dict[str, list[PmdaPackageInsertSection]] = {}
    for catalog in catalog_by_drug.values():
        if catalog.yj_code and catalog.yj_code not in pmda_sections_by_yj:
            pmda_sections_by_yj[catalog.yj_code] = []

    for prescription in prescriptions:
        local_date = _prescription_local_date(prescription)
        if local_date not in grouped:
            grouped[local_date] = []
            ordered_dates.append(local_date)

        catalog = catalog_by_drug.get(prescription.drug_name)
        if catalog and catalog.yj_code and not pmda_sections_by_yj[catalog.yj_code]:
            # Timeline checks are best-effort; create endpoint performs authoritative DB lookup.
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


def _select_copy_source_group(
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


def _copy_skip_reason(
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
    source_group = _select_copy_source_group(timeline, source_date=source_date)
    today = _prescription_today()
    todays_prescriptions = [
        prescription for prescription in prescriptions if _prescription_local_date(prescription) == today
    ]
    todays_by_drug = {prescription.drug_name: prescription for prescription in todays_prescriptions}
    todays_drug_names = set(todays_by_drug)
    planned_items: list[PrescriptionTimelineItemRead] = []
    skipped_items: list[PrescriptionCopySkippedItem] = []
    diff_items: list[PrescriptionDiffItem] = []
    source_drug_names = {item.drug_name for item in source_group.items}

    for source_item in source_group.items:
        current = todays_by_drug.get(source_item.drug_name)
        reason = _copy_skip_reason(
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


def _format_lab_date(value: datetime | None) -> str:
    if value is None:
        return ""
    return value.astimezone(TOKYO_TZ).strftime("%Y/%m/%d")


def _format_lab_value(row: Observation) -> str:
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
                date=_format_lab_date(row.effective_datetime),
                value=_format_lab_value(row),
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
    capacity = max(slot.capacity or 1, 0)
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


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/login", response_model=AuthTokenRead)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthTokenRead:
    user = db.get(User, payload.user_id)
    if user is None:
        log_audit(
            db,
            actor=payload.user_id or "unknown",
            action="ログイン失敗",
            scope="auth",
            detail="存在しない利用者 ID が入力されました。",
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(payload.password, user.password):
        log_audit(
            db,
            actor=user.display_name,
            action="ログイン失敗",
            scope="auth",
            detail="パスワード照合に失敗しました。",
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user.password_expires_at < date.today():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Password expired")

    if password_needs_upgrade(user.password):
        user.password = hash_password(payload.password)

    log_audit(
        db,
        actor=user.display_name,
        action="ログイン成功",
        scope="auth",
        detail=f"{user.department} / {user.role} としてログインしました。",
    )
    db.commit()
    return AuthTokenRead(
        access_token=create_access_token(user_id=user.id, role=user.role),
        user=user_to_session(user, logged_in_at=utcnow()),
    )


@app.get("/api/auth/me", response_model=UserSessionRead)
def get_authenticated_user(
    current_auth: AuthenticatedContext = Depends(get_current_auth),
) -> UserSessionRead:
    logged_in_at = current_auth.issued_at or utcnow()
    return user_to_session(current_auth.user, logged_in_at=logged_in_at)


@app.get("/api/masters/chart-order-config", response_model=ChartOrderMasterRead)
def get_chart_order_config(
    include_inactive: bool = Query(default=False),
    department: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChartOrderMasterRead:
    if include_inactive and current_user.role != "管理者":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    return get_chart_order_masters_read(db, include_inactive=include_inactive, department=department)


@app.get("/api/masters/diagnoses/search", response_model=list[DiagnosisMasterRead])
def search_diagnosis_masters(
    q: str = Query(min_length=1),
    limit: int = Query(default=20, ge=1, le=50),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DiagnosisMasterRead]:
    normalized_query = normalize_diagnosis_search_query(q)
    if not normalized_query:
        return []

    normalized_code_query = normalized_query.replace(" ", "").upper()
    kana_query = to_katakana(normalized_query)
    name_prefix = f"{normalized_query}%"
    kana_prefix = f"{kana_query}%"
    name_contains = f"%{normalized_query}%"
    kana_contains = f"%{kana_query}%"
    code_prefix = f"{normalized_code_query}%"

    direct_statement = (
        select(DiagnosisMaster)
        .where(DiagnosisMaster.is_deleted.is_(False))
        .where(
            or_(
                DiagnosisMaster.disease_name.ilike(name_contains),
                DiagnosisMaster.disease_name_kana.ilike(kana_contains),
                DiagnosisMaster.icd10_code.ilike(code_prefix),
                DiagnosisMaster.claim_code.ilike(code_prefix),
                DiagnosisMaster.exchange_code.ilike(code_prefix),
            )
        )
        .order_by(
            case(
                (DiagnosisMaster.disease_name == normalized_query, 0),
                (DiagnosisMaster.disease_name.ilike(name_prefix), 1),
                (DiagnosisMaster.disease_name_kana.ilike(kana_prefix), 2),
                (DiagnosisMaster.disease_name.ilike(name_contains), 3),
                (DiagnosisMaster.disease_name_kana.ilike(kana_contains), 4),
                (DiagnosisMaster.icd10_code.ilike(code_prefix), 5),
                else_=6,
            ),
            DiagnosisMaster.disease_name,
            DiagnosisMaster.management_number,
        )
        .limit(limit * 2)
    )
    direct_items = db.scalars(direct_statement).all()

    alias_statement = (
        select(DiagnosisMaster)
        .join(DiagnosisAliasMaster, DiagnosisAliasMaster.management_number == DiagnosisMaster.management_number)
        .where(DiagnosisMaster.is_deleted.is_(False))
        .where(DiagnosisAliasMaster.is_deleted.is_(False))
        .where(
            or_(
                DiagnosisAliasMaster.alias.ilike(name_contains),
                DiagnosisAliasMaster.alias_kana.ilike(kana_contains),
            )
        )
        .order_by(
            case(
                (DiagnosisAliasMaster.alias == normalized_query, 0),
                (DiagnosisAliasMaster.alias.ilike(name_prefix), 1),
                (DiagnosisAliasMaster.alias_kana.ilike(kana_prefix), 2),
                (DiagnosisAliasMaster.alias.ilike(name_contains), 3),
                (DiagnosisAliasMaster.alias_kana.ilike(kana_contains), 4),
                else_=5,
            ),
            DiagnosisAliasMaster.alias,
            DiagnosisMaster.disease_name,
            DiagnosisMaster.management_number,
        )
        .limit(limit * 2)
    )
    alias_items = db.scalars(alias_statement).all()

    items_by_management_number: dict[str, DiagnosisMaster] = {}
    for item in [*direct_items, *alias_items]:
        items_by_management_number.setdefault(item.management_number, item)

    items = list(items_by_management_number.values())[:limit]
    return [DiagnosisMasterRead.model_validate(item) for item in items]


@app.post(
    "/api/admin/masters/prescription-catalog",
    response_model=PrescriptionCatalogItemRead,
    status_code=status.HTTP_201_CREATED,
)
def create_prescription_catalog_item(
    payload: PrescriptionCatalogItemCreateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> PrescriptionCatalogItemRead:
    if db.get(PrescriptionCatalogMaster, payload.id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Prescription catalog already exists")

    master = PrescriptionCatalogMaster(
        id=payload.id,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
        drug_name=payload.drug_name,
        category=payload.category,
        dosage_options=payload.dosage_options,
        generic_name=payload.generic_name,
        name_kana=payload.name_kana,
        aliases=payload.aliases,
        yj_code=payload.yj_code,
        hot_code=payload.hot_code,
        dosage_form=payload.dosage_form,
        strength=payload.strength,
        standard_usage_code=payload.standard_usage_code,
        default_days=payload.default_days,
        pmda_info_url=resolve_pmda_info_url(payload.pmda_info_url, payload.yj_code),
        allergy_conflict_label=payload.allergy_conflict_label,
        related_problem=payload.related_problem,
        manufacturer=payload.manufacturer,
        drug_price=payload.drug_price,
        generic_reimbursement_flag=payload.generic_reimbursement_flag,
        brand_flag=payload.brand_flag,
        has_generic=payload.has_generic,
        transitional_expiry=payload.transitional_expiry,
        source_note=payload.source_note,
    )
    db.add(master)
    log_audit(
        db,
        actor=current_user.display_name,
        action="処方候補作成",
        scope="system",
        detail=f"処方候補 {payload.id} / {payload.drug_name} を作成しました。",
    )
    db.commit()
    db.refresh(master)
    return PrescriptionCatalogItemRead.model_validate(master)


@app.patch("/api/admin/masters/prescription-catalog/{master_id}", response_model=PrescriptionCatalogItemRead)
def update_prescription_catalog_item(
    master_id: str,
    payload: PrescriptionCatalogItemUpdateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> PrescriptionCatalogItemRead:
    master = get_prescription_catalog_master_or_404(db, master_id)
    master.sort_order = payload.sort_order
    master.is_active = payload.is_active
    master.drug_name = payload.drug_name
    master.category = payload.category
    master.dosage_options = payload.dosage_options
    master.generic_name = payload.generic_name
    master.name_kana = payload.name_kana
    master.aliases = payload.aliases
    master.yj_code = payload.yj_code
    master.hot_code = payload.hot_code
    master.dosage_form = payload.dosage_form
    master.strength = payload.strength
    master.standard_usage_code = payload.standard_usage_code
    master.default_days = payload.default_days
    master.pmda_info_url = resolve_pmda_info_url(payload.pmda_info_url, payload.yj_code)
    master.allergy_conflict_label = payload.allergy_conflict_label
    master.related_problem = payload.related_problem
    master.manufacturer = payload.manufacturer
    master.drug_price = payload.drug_price
    master.generic_reimbursement_flag = payload.generic_reimbursement_flag
    master.brand_flag = payload.brand_flag
    master.has_generic = payload.has_generic
    master.transitional_expiry = payload.transitional_expiry
    master.source_note = payload.source_note
    log_audit(
        db,
        actor=current_user.display_name,
        action="処方候補更新",
        scope="system",
        detail=f"処方候補 {master_id} を更新しました。",
    )
    db.commit()
    db.refresh(master)
    return PrescriptionCatalogItemRead.model_validate(master)


@app.post("/api/admin/masters/standard-usages", response_model=StandardUsageMasterRead, status_code=status.HTTP_201_CREATED)
def create_standard_usage(
    payload: StandardUsageMasterCreateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> StandardUsageMasterRead:
    if db.get(StandardUsageMaster, payload.id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Standard usage already exists")

    master = StandardUsageMaster(
        id=payload.id,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
        label=payload.label,
        category=payload.category,
        instruction=payload.instruction,
        default_days=payload.default_days,
        note=payload.note,
    )
    db.add(master)
    log_audit(
        db,
        actor=current_user.display_name,
        action="標準用法作成",
        scope="system",
        detail=f"標準用法 {payload.id} / {payload.label} を作成しました。",
    )
    db.commit()
    db.refresh(master)
    return StandardUsageMasterRead.model_validate(master)


@app.patch("/api/admin/masters/standard-usages/{master_id}", response_model=StandardUsageMasterRead)
def update_standard_usage(
    master_id: str,
    payload: StandardUsageMasterUpdateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> StandardUsageMasterRead:
    master = get_standard_usage_master_or_404(db, master_id)
    master.sort_order = payload.sort_order
    master.is_active = payload.is_active
    master.label = payload.label
    master.category = payload.category
    master.instruction = payload.instruction
    master.default_days = payload.default_days
    master.note = payload.note
    log_audit(
        db,
        actor=current_user.display_name,
        action="標準用法更新",
        scope="system",
        detail=f"標準用法 {master_id} を更新しました。",
    )
    db.commit()
    db.refresh(master)
    return StandardUsageMasterRead.model_validate(master)


@app.post("/api/admin/masters/prescription-sets", response_model=PrescriptionSetMasterRead, status_code=status.HTTP_201_CREATED)
def create_prescription_set(
    payload: PrescriptionSetMasterCreateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> PrescriptionSetMasterRead:
    if db.get(PrescriptionSetMaster, payload.id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Prescription set already exists")

    master = PrescriptionSetMaster(
        id=payload.id,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
        label=payload.label,
        department=payload.department,
        related_problem=payload.related_problem,
        note=payload.note,
        items=[item.model_dump() for item in payload.items],
        included_set_ids=payload.included_set_ids,
    )
    db.add(master)
    log_audit(
        db,
        actor=current_user.display_name,
        action="処方セット作成",
        scope="system",
        detail=f"処方セット {payload.id} / {payload.label} を作成しました。",
    )
    db.commit()
    db.refresh(master)
    return PrescriptionSetMasterRead.model_validate(master)


@app.patch("/api/admin/masters/prescription-sets/{master_id}", response_model=PrescriptionSetMasterRead)
def update_prescription_set(
    master_id: str,
    payload: PrescriptionSetMasterUpdateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> PrescriptionSetMasterRead:
    master = get_prescription_set_master_or_404(db, master_id)
    master.sort_order = payload.sort_order
    master.is_active = payload.is_active
    master.label = payload.label
    master.department = payload.department
    master.related_problem = payload.related_problem
    master.note = payload.note
    master.items = [item.model_dump() for item in payload.items]
    master.included_set_ids = payload.included_set_ids
    log_audit(
        db,
        actor=current_user.display_name,
        action="処方セット更新",
        scope="system",
        detail=f"処方セット {master_id} を更新しました。",
    )
    db.commit()
    db.refresh(master)
    return PrescriptionSetMasterRead.model_validate(master)


@app.post("/api/admin/masters/lab-sets", response_model=LabSetOptionRead, status_code=status.HTTP_201_CREATED)
def create_lab_set(
    payload: LabSetOptionCreateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> LabSetOptionRead:
    if db.get(LabSetMaster, payload.id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Lab set already exists")

    master = LabSetMaster(
        id=payload.id,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
        label=payload.label,
        items=payload.items,
        included_set_ids=payload.included_set_ids,
    )
    db.add(master)
    log_audit(
        db,
        actor=current_user.display_name,
        action="検査セット作成",
        scope="system",
        detail=f"検査セット {payload.id} / {payload.label} を作成しました。",
    )
    db.commit()
    db.refresh(master)
    return LabSetOptionRead.model_validate(master)


@app.patch("/api/admin/masters/lab-sets/{master_id}", response_model=LabSetOptionRead)
def update_lab_set(
    master_id: str,
    payload: LabSetOptionUpdateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> LabSetOptionRead:
    master = get_lab_set_master_or_404(db, master_id)
    master.sort_order = payload.sort_order
    master.is_active = payload.is_active
    master.label = payload.label
    master.items = payload.items
    master.included_set_ids = payload.included_set_ids
    log_audit(
        db,
        actor=current_user.display_name,
        action="検査セット更新",
        scope="system",
        detail=f"検査セット {master_id} を更新しました。",
    )
    db.commit()
    db.refresh(master)
    return LabSetOptionRead.model_validate(master)


@app.post(
    "/api/admin/masters/reservation-slots",
    response_model=ReservationSlotRead,
    status_code=status.HTTP_201_CREATED,
)
def create_reservation_slot(
    payload: ReservationSlotCreateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> ReservationSlotRead:
    if db.get(ReservationSlotMaster, payload.id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Reservation slot already exists")

    master = ReservationSlotMaster(
        id=payload.id,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
        date=payload.date,
        time=payload.time,
        department=payload.department,
        doctor=payload.doctor,
        state=payload.state,
        capacity=max(payload.capacity, 0),
    )
    db.add(master)
    log_audit(
        db,
        actor=current_user.display_name,
        action="予約枠作成",
        scope="system",
        detail=f"予約枠 {payload.id} / {payload.date} {payload.time} を作成しました。",
    )
    db.commit()
    db.refresh(master)
    return reservation_slot_to_read(master)


@app.patch("/api/admin/masters/reservation-slots/{master_id}", response_model=ReservationSlotRead)
def update_reservation_slot(
    master_id: str,
    payload: ReservationSlotUpdateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> ReservationSlotRead:
    master = get_reservation_slot_master_or_404(db, master_id)
    master.sort_order = payload.sort_order
    master.is_active = payload.is_active
    master.date = payload.date
    master.time = payload.time
    master.department = payload.department
    master.doctor = payload.doctor
    master.state = payload.state
    master.capacity = max(payload.capacity, 0)
    log_audit(
        db,
        actor=current_user.display_name,
        action="予約枠更新",
        scope="system",
        detail=f"予約枠 {master_id} を更新しました。",
    )
    db.commit()
    db.refresh(master)
    booked_count = get_reservation_slot_counts(db, [master.id]).get(master.id, 0)
    return reservation_slot_to_read(master, booked_count=booked_count)


@app.post("/api/admin/masters/chart-templates", response_model=ChartTemplateRead, status_code=status.HTTP_201_CREATED)
def create_chart_template(
    payload: ChartTemplateCreateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> ChartTemplateRead:
    if db.get(ChartTemplateMaster, payload.id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Chart template already exists")

    master = ChartTemplateMaster(
        id=payload.id,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
        label=payload.label,
        department=payload.department,
        subjective=payload.subjective,
        objective=payload.objective,
        assessment=payload.assessment,
        plan=payload.plan,
    )
    db.add(master)
    log_audit(
        db,
        actor=current_user.display_name,
        action="カルテテンプレート作成",
        scope="system",
        detail=f"カルテテンプレート {payload.id} / {payload.label} を作成しました。",
    )
    db.commit()
    db.refresh(master)
    return ChartTemplateRead.model_validate(master)


@app.patch("/api/admin/masters/chart-templates/{master_id}", response_model=ChartTemplateRead)
def update_chart_template(
    master_id: str,
    payload: ChartTemplateUpdateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> ChartTemplateRead:
    master = get_chart_template_master_or_404(db, master_id)
    master.sort_order = payload.sort_order
    master.is_active = payload.is_active
    master.label = payload.label
    master.department = payload.department
    master.subjective = payload.subjective
    master.objective = payload.objective
    master.assessment = payload.assessment
    master.plan = payload.plan
    log_audit(
        db,
        actor=current_user.display_name,
        action="カルテテンプレート更新",
        scope="system",
        detail=f"カルテテンプレート {master_id} を更新しました。",
    )
    db.commit()
    db.refresh(master)
    return ChartTemplateRead.model_validate(master)


@app.get("/api/admin/users", response_model=list[UserSummaryRead])
def list_users(
    _: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> list[UserSummaryRead]:
    users = db.scalars(select(User).order_by(User.department, User.display_name)).all()
    return [user_to_summary(user) for user in users]


@app.post("/api/admin/users", response_model=UserSummaryRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> UserSummaryRead:
    if db.get(User, payload.user_id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

    user = User(
        id=payload.user_id,
        password=hash_password(payload.password),
        display_name=payload.display_name,
        department=payload.department,
        role=payload.role,
        password_expires_at=payload.password_expires_at,
    )
    db.add(user)
    log_audit(
        db,
        actor=current_user.display_name,
        action="利用者作成",
        scope="system",
        detail=f"利用者 {payload.user_id} / {payload.role} / {payload.department} を作成しました。",
    )
    db.commit()
    return user_to_summary(user)


@app.patch("/api/admin/users/{user_id}", response_model=UserSummaryRead)
def update_user(
    user_id: str,
    payload: UserUpdateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> UserSummaryRead:
    user = get_user_or_404(db, user_id)
    user.display_name = payload.display_name
    user.department = payload.department
    user.role = payload.role
    user.password_expires_at = payload.password_expires_at
    log_audit(
        db,
        actor=current_user.display_name,
        action="利用者更新",
        scope="system",
        detail=f"利用者 {user_id} の所属・権限・有効期限を更新しました。",
    )
    db.commit()
    db.refresh(user)
    return user_to_summary(user)


@app.post("/api/admin/users/{user_id}/reset-password")
def reset_user_password(
    user_id: str,
    payload: UserPasswordResetRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    user = get_user_or_404(db, user_id)
    user.password = hash_password(payload.password)
    log_audit(
        db,
        actor=current_user.display_name,
        action="パスワード再設定",
        scope="system",
        detail=f"利用者 {user_id} のパスワードを再設定しました。",
    )
    db.commit()
    return {"user_id": user_id, "status": "updated"}


@app.get("/api/patients", response_model=list[PatientSummaryRead])
def list_patients(
    search: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    department: str | None = Query(default=None),
    sort: str = Query(default="receptionNumber"),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PatientSummaryRead]:
    query = select(Patient)

    if status_filter:
        query = query.where(Patient.status == status_filter)
    if department:
        query = query.where(Patient.department == department)
    if search:
        like = f"%{search}%"
        query = query.where(
            Patient.id.ilike(like)
            | Patient.name.ilike(like)
            | Patient.kana.ilike(like)
            | Patient.department.ilike(like)
            | Patient.doctor.ilike(like)
            | Patient.status.ilike(like)
        )

    sort_column = {
        "elapsed": desc(func.regexp_replace(Patient.elapsed, r"\\D", "", "g")),
        "reservationTime": Patient.reservation_time,
        "receptionNumber": Patient.reception_number,
    }.get(sort, Patient.reception_number)
    query = query.order_by(sort_column)

    patients = db.scalars(query).all()
    return [patient_to_read(patient) for patient in patients]


@app.get("/api/patients/{patient_id}/chart", response_model=ChartWorkspaceRead)
def get_chart_workspace(
    patient_id: str,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChartWorkspaceRead:
    patient = get_patient_or_404(db, patient_id)
    versions = db.scalars(
        select(ChartNote).where(ChartNote.patient_id == patient_id).order_by(desc(ChartNote.version))
    ).all()
    latest_note = versions[0] if versions else None
    patient_prescriptions = db.scalars(
        select(PrescriptionOrder)
        .where(PrescriptionOrder.patient_id == patient_id)
        .order_by(desc(PrescriptionOrder.created_at))
    ).all()
    current_prescriptions, prescription_history = build_prescription_history(patient_prescriptions)
    patient_lab_orders = db.scalars(
        select(LabOrder).where(LabOrder.patient_id == patient_id).order_by(desc(LabOrder.created_at))
    ).all()
    reservation = db.scalar(select(Reservation).where(Reservation.patient_id == patient_id))
    audit_logs = db.scalars(
        select(AuditLog).where(AuditLog.patient_id == patient_id).order_by(desc(AuditLog.created_at)).limit(20)
    ).all()

    return ChartWorkspaceRead(
        patient=patient_to_read(patient),
        latest_note=latest_note,
        versions=versions,
        prescriptions=current_prescriptions,
        prescription_history=prescription_history,
        lab_orders=patient_lab_orders,
        reservation=reservation,
        audit_logs=audit_logs,
        patient_profile=patient.profile_items,
        problems=patient.problems,
        visit_history=patient.visit_history,
        vitals=patient.vitals,
        lab_results=patient.lab_results,
        chart_history=patient.chart_history,
        imaging_orders=patient.imaging_orders,
        procedure_orders=patient.procedure_orders,
    )


@app.get("/api/patients/{patient_id}/lab-trends", response_model=list[LabLongTrendItem])
def get_lab_long_trends(
    patient_id: str,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LabLongTrendItem]:
    get_patient_or_404(db, patient_id)
    rows = db.scalars(
        select(Observation)
        .where(
            Observation.patient_id == patient_id,
            Observation.category == "laboratory",
        )
        .order_by(Observation.code_text, Observation.effective_datetime)
    ).all()
    return build_lab_long_trends(rows)


@app.get("/api/patients/{patient_id}/prescription-history", response_model=list[PrescriptionHistoryGroupRead])
def get_prescription_history(
    patient_id: str,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PrescriptionHistoryGroupRead]:
    get_patient_or_404(db, patient_id)
    patient_prescriptions = db.scalars(
        select(PrescriptionOrder)
        .where(PrescriptionOrder.patient_id == patient_id)
        .order_by(desc(PrescriptionOrder.created_at))
    ).all()
    _, prescription_history = build_prescription_history(patient_prescriptions)
    return prescription_history


@app.get("/api/patients/{patient_id}/prescription-timeline", response_model=list[PrescriptionTimelineGroupRead])
def get_prescription_timeline(
    patient_id: str,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PrescriptionTimelineGroupRead]:
    patient = get_patient_or_404(db, patient_id)
    prescriptions = db.scalars(
        select(PrescriptionOrder)
        .where(PrescriptionOrder.patient_id == patient_id)
        .order_by(desc(PrescriptionOrder.created_at))
    ).all()
    return build_prescription_timeline(
        patient=patient,
        prescriptions=prescriptions,
        catalog_by_drug=_catalog_by_drug_name(db),
    )


@app.post("/api/patients/{patient_id}/prescriptions/copy-preview", response_model=PrescriptionCopyPreviewRead)
def preview_copy_last_prescriptions(
    patient_id: str,
    payload: PrescriptionCopyLastRequest,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PrescriptionCopyPreviewRead:
    patient = get_patient_or_404(db, patient_id)
    prescriptions = db.scalars(
        select(PrescriptionOrder)
        .where(PrescriptionOrder.patient_id == patient_id)
        .order_by(desc(PrescriptionOrder.created_at))
    ).all()
    return build_prescription_copy_preview(
        patient=patient,
        prescriptions=prescriptions,
        source_date=payload.source_date,
        catalog_by_drug=_catalog_by_drug_name(db),
    )


@app.post("/api/patients/{patient_id}/prescriptions/copy-last", response_model=PrescriptionCopyLastRead)
def copy_last_prescriptions(
    patient_id: str,
    payload: PrescriptionCopyLastRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PrescriptionCopyLastRead:
    patient = get_patient_or_404(db, patient_id)
    prescriptions = db.scalars(
        select(PrescriptionOrder)
        .where(PrescriptionOrder.patient_id == patient_id)
        .order_by(desc(PrescriptionOrder.created_at))
    ).all()
    catalog_by_drug = _catalog_by_drug_name(db)
    timeline = build_prescription_timeline(
        patient=patient,
        prescriptions=prescriptions,
        catalog_by_drug=catalog_by_drug,
    )
    source_group = _select_copy_source_group(timeline, source_date=payload.source_date)

    today = _prescription_today()
    todays_drug_names = {
        prescription.drug_name
        for prescription in prescriptions
        if _prescription_local_date(prescription) == today
    }
    copied_orders: list[PrescriptionOrder] = []
    skipped_items: list[PrescriptionCopySkippedItem] = []

    for source_item in source_group.items:
        reason = _copy_skip_reason(
            patient=patient,
            source_item=source_item,
            todays_drug_names=todays_drug_names,
        )
        if reason:
            skipped_items.append(
                PrescriptionCopySkippedItem(drug_name=source_item.drug_name, reason=reason)
            )
            continue

        order = PrescriptionOrder(
            patient_id=patient_id,
            type=source_item.type,
            days=source_item.days,
            drug_name=source_item.drug_name,
            dosage=source_item.dosage,
        )
        db.add(order)
        db.flush()
        copied_orders.append(order)
        todays_drug_names.add(order.drug_name)

    if copied_orders:
        log_audit(
            db,
            actor=current_user.display_name,
            action="前回処方一括複写",
            scope="order",
            detail=f"{source_group.label} から {len(copied_orders)} 剤を複写しました。",
            patient=patient,
        )
    elif skipped_items:
        log_audit(
            db,
            actor=current_user.display_name,
            action="前回処方一括複写スキップ",
            scope="order",
            detail=f"{source_group.label} は全件スキップされました。",
            patient=patient,
        )

    db.commit()
    for order in copied_orders:
        db.refresh(order)

    refreshed_prescriptions = db.scalars(
        select(PrescriptionOrder)
        .where(PrescriptionOrder.patient_id == patient_id)
        .order_by(desc(PrescriptionOrder.created_at))
    ).all()
    refreshed_timeline = build_prescription_timeline(
        patient=patient,
        prescriptions=refreshed_prescriptions,
        catalog_by_drug=catalog_by_drug,
    )

    return PrescriptionCopyLastRead(
        source_date=source_group.date,
        copied_count=len(copied_orders),
        skipped_count=len(skipped_items),
        copied_items=[PrescriptionRead.model_validate(order) for order in copied_orders],
        skipped_items=skipped_items,
        timeline=refreshed_timeline,
    )


@app.put("/api/patients/{patient_id}/context", response_model=PatientContextRead)
def save_patient_context(
    patient_id: str,
    payload: PatientContextUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PatientContextRead:
    patient = get_patient_or_404(db, patient_id)
    patient.profile_items = [item.model_dump() for item in payload.patient_profile]
    patient.problems = [item.model_dump(exclude_none=True) for item in payload.problems]
    log_audit(
        db,
        actor=current_user.display_name,
        action="患者情報更新",
        scope="patient",
        detail=f"患者プロファイルとプロブレムリストを更新しました。件数: profile {len(payload.patient_profile)} / problem {len(payload.problems)}。",
        patient=patient,
    )
    db.commit()
    db.refresh(patient)
    return patient_context_to_read(patient)


@app.post("/api/patients/{patient_id}/chart/save")
def save_chart_note(
    patient_id: str,
    payload: ChartSaveRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, int | str]:
    patient = get_patient_or_404(db, patient_id)
    current_max_version = db.scalar(
        select(func.max(ChartNote.version)).where(ChartNote.patient_id == patient_id)
    )
    next_version = (current_max_version or 0) + 1
    note = ChartNote(
        patient_id=patient_id,
        subjective=payload.subjective,
        objective=payload.objective,
        assessment=payload.assessment,
        plan=payload.plan,
        version=next_version,
        saved_by=current_user.display_name,
    )
    db.add(note)
    log_audit(
        db,
        actor=current_user.display_name,
        action="カルテ保存",
        scope="chart",
        detail=f"SOAP を版管理して保存しました。版数 v{next_version}。",
        patient=patient,
    )
    db.commit()
    db.refresh(note)
    return {"version": next_version, "saved_at": note.saved_at.isoformat()}


@app.post("/api/patients/{patient_id}/prescriptions", response_model=PrescriptionRead)
def create_prescription(
    patient_id: str,
    payload: PrescriptionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PrescriptionRead:
    patient = get_patient_or_404(db, patient_id)
    catalog = db.scalars(
        select(PrescriptionCatalogMaster).where(PrescriptionCatalogMaster.drug_name == payload.drug_name)
    ).first()
    latest_duplicate = db.scalar(
        select(PrescriptionOrder)
        .where(
            PrescriptionOrder.patient_id == patient_id,
            PrescriptionOrder.drug_name == payload.drug_name,
        )
        .order_by(desc(PrescriptionOrder.created_at))
    )
    if (
        latest_duplicate is not None
        and latest_duplicate.created_at.astimezone(TOKYO_TZ).date() == datetime.now(TOKYO_TZ).date()
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Duplicate prescription")
    current_prescriptions = db.scalars(
        select(PrescriptionOrder)
        .where(PrescriptionOrder.patient_id == patient_id)
        .order_by(desc(PrescriptionOrder.created_at))
    ).all()
    pmda_sections = get_pmda_sections_for_catalog(db, catalog)
    pmda_interactions = get_pmda_interactions_for_catalog(db, catalog)
    pmda_interaction_matches = get_pmda_interaction_matches(db, pmda_interactions)
    transitional_drugs = get_transitional_drugs_for_catalog(db, catalog)
    long_term_listed_drug = get_long_term_listed_drug_for_catalog(db, catalog)
    current_drug_names = {prescription.drug_name for prescription in current_prescriptions}
    current_catalogs_by_drug = {
        item.drug_name: item
        for item in db.scalars(
            select(PrescriptionCatalogMaster).where(PrescriptionCatalogMaster.drug_name.in_(current_drug_names))
        ).all()
    }
    warnings = build_prescription_safety_warnings(
        patient=patient,
        drug_name=payload.drug_name,
        dosage=payload.dosage,
        days=payload.days,
        catalog=catalog,
        latest_duplicate=latest_duplicate,
        current_prescriptions=current_prescriptions,
        pmda_sections=pmda_sections,
        pmda_interactions=pmda_interactions,
        pmda_interaction_matches=pmda_interaction_matches,
        current_catalogs_by_drug=current_catalogs_by_drug,
        transitional_drugs=transitional_drugs,
        long_term_listed_drug=long_term_listed_drug,
    )
    if any("アレルギー" in warning for warning in warnings):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Allergy conflict")

    order = PrescriptionOrder(
        patient_id=patient_id,
        type=payload.type,
        days=payload.days,
        drug_name=payload.drug_name,
        dosage=payload.dosage,
    )
    db.add(order)
    log_audit(
        db,
        actor=current_user.display_name,
        action="処方追加",
        scope="order",
        detail=f"{payload.drug_name} を追加しました。警告: {len(warnings)}件。",
        patient=patient,
    )
    db.commit()
    db.refresh(order)
    return PrescriptionRead.model_validate(order).model_copy(
        update={"warnings": warnings, "warning_details": build_warning_details(warnings)}
    )


@app.post("/api/patients/{patient_id}/lab-orders", response_model=LabOrderRead)
def create_lab_order(
    patient_id: str,
    payload: LabOrderCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LabOrderRead:
    patient = get_patient_or_404(db, patient_id)
    existing_orders = db.scalars(select(LabOrder).where(LabOrder.patient_id == patient_id)).all()
    if any(any(item in order.items for item in payload.items) for order in existing_orders):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Duplicate lab order")

    order = LabOrder(
        patient_id=patient_id,
        category=payload.category,
        status="pending",
        urgency=payload.urgency,
        items=payload.items,
    )
    db.add(order)
    log_audit(
        db,
        actor=current_user.display_name,
        action="検査追加",
        scope="order",
        detail=f"{payload.category} を追加しました。",
        patient=patient,
    )
    db.commit()
    db.refresh(order)
    return order


@app.post("/api/patients/{patient_id}/imaging-orders", response_model=ImagingOrderItem)
def create_imaging_order(
    patient_id: str,
    payload: ImagingOrderCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ImagingOrderItem:
    patient = get_patient_or_404(db, patient_id)
    imaging_orders = list(patient.imaging_orders or [])
    imaging_orders.insert(
        0,
        {
            "category": payload.category,
            "status": payload.status,
            "scheduled_at": payload.scheduled_at,
            "note": payload.note,
        },
    )
    patient.imaging_orders = imaging_orders
    log_audit(
        db,
        actor=current_user.display_name,
        action="画像追加",
        scope="order",
        detail=f"{payload.category} を追加しました。",
        patient=patient,
    )
    db.commit()
    db.refresh(patient)
    return ImagingOrderItem(**patient.imaging_orders[0])


@app.post("/api/patients/{patient_id}/procedure-orders", response_model=ProcedureOrderItem)
def create_procedure_order(
    patient_id: str,
    payload: ProcedureOrderCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProcedureOrderItem:
    patient = get_patient_or_404(db, patient_id)
    procedure_orders = list(patient.procedure_orders or [])
    procedure_orders.insert(
        0,
        {
            "title": payload.title,
            "status": payload.status,
            "note": payload.note,
        },
    )
    patient.procedure_orders = procedure_orders
    log_audit(
        db,
        actor=current_user.display_name,
        action="処置追加",
        scope="order",
        detail=f"{payload.title} を追加しました。",
        patient=patient,
    )
    db.commit()
    db.refresh(patient)
    return ProcedureOrderItem(**patient.procedure_orders[0])


@app.post("/api/patients/{patient_id}/reservation", response_model=ReservationRead)
def upsert_reservation(
    patient_id: str,
    payload: ReservationUpsertRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReservationRead:
    patient = get_patient_or_404(db, patient_id)
    reservation = db.scalar(select(Reservation).where(Reservation.patient_id == patient_id))
    if payload.slot_id:
        slot = get_reservation_slot_master_or_404(db, payload.slot_id)
        if not slot.is_active:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Reservation slot inactive")
        booked_count = db.scalar(
            select(func.count(Reservation.id)).where(
                Reservation.slot_id == payload.slot_id,
                Reservation.patient_id != patient_id,
            )
        )
        if int(booked_count or 0) >= max(slot.capacity or 1, 0):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Reservation slot full")
    if reservation is None:
        reservation = Reservation(
            patient_id=patient_id,
            slot_id=payload.slot_id,
            scheduled_for=payload.scheduled_for,
            department=payload.department,
            doctor=payload.doctor,
            note=payload.note,
        )
        db.add(reservation)
    else:
        reservation.slot_id = payload.slot_id
        reservation.scheduled_for = payload.scheduled_for
        reservation.department = payload.department
        reservation.doctor = payload.doctor
        reservation.note = payload.note

    log_audit(
        db,
        actor=current_user.display_name,
        action="再診予約更新",
        scope="reservation",
        detail=f"{payload.scheduled_for} に再診予約を更新しました。",
        patient=patient,
    )
    db.commit()
    db.refresh(reservation)
    return reservation


@app.post("/api/patients/{patient_id}/status", response_model=PatientSummaryRead)
def update_patient_status(
    patient_id: str,
    payload: PatientStatusUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PatientSummaryRead:
    patient = get_patient_or_404(db, patient_id)
    patient.status = payload.status
    log_audit(
        db,
        actor=current_user.display_name,
        action="受付状態更新",
        scope="patient",
        detail=payload.detail,
        patient=patient,
    )
    db.commit()
    db.refresh(patient)
    return patient_to_read(patient)


@app.get("/api/audit-logs", response_model=list[AuditLogRead])
def list_audit_logs(
    limit: int = Query(default=20, le=100),
    scope: str | None = Query(default=None),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AuditLogRead]:
    query = select(AuditLog).order_by(desc(AuditLog.created_at))
    if scope:
        query = query.where(AuditLog.scope == scope)
    return db.scalars(query.limit(limit)).all()
