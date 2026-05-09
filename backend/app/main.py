from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
import re
import unicodedata
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import case, desc, func, or_, select, true as sa_true
from sqlalchemy.orm import Session

from .config import get_settings
from .db import SessionLocal, get_db
from .drug_import import build_pmda_drug_info_url
from .fhir.router import router as fhir_router
from .migrations import run_migrations
from .models import (
    Admission,
    AuditLog,
    BedMaster,
    ChartNote,
    DiagnosisAliasMaster,
    DiagnosisMaster,
    InpatientDocument,
    InpatientAiSummaryReview,
    InpatientDischargePlan,
    InpatientEvent,
    InpatientInstruction,
    InpatientPathwayAssignment,
    InpatientPathwayMaster,
    InpatientPathwayTask,
    InpatientPathwayTaskMaster,
    LabOrder,
    NursingNote,
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
    WardMaster,
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
    AdmissionCreateRequest,
    AdmissionDischargeRequest,
    AdmissionRead,
    AdmissionTransferRequest,
    BedBoardItemRead,
    BedStatusUpdateRequest,
    ChartOrderMasterRead,
    ChartTemplateCreateRequest,
    ChartTemplateRead,
    ChartTemplateUpdateRequest,
    ChartSaveRequest,
    ChartWorkspaceRead,
    DiagnosisMasterRead,
    ImagingOrderCreateRequest,
    ImagingOrderItem,
    InpatientInstructionCreateRequest,
    InpatientDocumentCreateRequest,
    InpatientDocumentRead,
    InpatientDocumentUpdateRequest,
    InpatientAiSummaryReviewCreateRequest,
    InpatientAiSummaryReviewRead,
    InpatientDischargePlanRead,
    InpatientDischargePlanUpdateRequest,
    InpatientEventRead,
    InpatientInstructionRead,
    InpatientInstructionUpdateRequest,
    InpatientPathwayCreateRequest,
    InpatientPathwayMasterRead,
    InpatientPathwayRead,
    InpatientPathwayTaskMasterRead,
    InpatientPathwayTaskRead,
    InpatientPathwayTaskUpdateRequest,
    InpatientProgressDateRow,
    InpatientProgressRead,
    InpatientSummaryDraftRead,
    LabLongTrendItem,
    LabLongTrendPoint,
    LabSetOptionCreateRequest,
    LabOrderCreateRequest,
    LabOrderRead,
    LabSetOptionRead,
    LabSetOptionUpdateRequest,
    LoginRequest,
    NursingNoteCreateRequest,
    NursingNoteRead,
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


def add_inpatient_event(
    db: Session,
    *,
    admission_id: int,
    event_type: str,
    title: str,
    actor: str,
    detail: str | None = None,
) -> None:
    db.add(
        InpatientEvent(
            admission_id=admission_id,
            event_type=event_type,
            title=title,
            detail=detail,
            actor=actor,
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


def get_admission_or_404(db: Session, admission_id: int) -> Admission:
    admission = db.get(Admission, admission_id)
    if admission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admission not found")
    return admission


def get_ward_or_404(db: Session, ward_id: str) -> WardMaster:
    ward = db.get(WardMaster, ward_id)
    if ward is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ward not found")
    return ward


def get_bed_or_404(db: Session, bed_id: str) -> BedMaster:
    bed = db.get(BedMaster, bed_id)
    if bed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bed not found")
    return bed


def get_inpatient_instruction_or_404(db: Session, instruction_id: int) -> InpatientInstruction:
    instruction = db.get(InpatientInstruction, instruction_id)
    if instruction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inpatient instruction not found")
    return instruction


def get_inpatient_document_or_404(db: Session, document_id: int) -> InpatientDocument:
    document = db.get(InpatientDocument, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inpatient document not found")
    return document


def get_inpatient_pathway_task_or_404(db: Session, task_id: int) -> InpatientPathwayTask:
    task = db.get(InpatientPathwayTask, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inpatient pathway task not found")
    return task


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


def _format_progress_date(value: datetime | None) -> str:
    if value is None:
        return "日付未設定"
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


def build_inpatient_progress(
    *,
    admission: Admission,
    observations: list[Observation],
    prescriptions: list[PrescriptionOrder],
    lab_orders: list[LabOrder],
    instructions: list[InpatientInstruction],
    nursing_notes: list[NursingNote],
) -> InpatientProgressRead:
    rows_by_date: dict[str, dict[str, list[str]]] = {}

    def row_for(date_key: str) -> dict[str, list[str]]:
        return rows_by_date.setdefault(
            date_key,
            {
                "vitals": [],
                "labs": [],
                "prescriptions": [],
                "lab_orders": [],
                "instructions": [],
                "nursing_notes": [],
            },
        )

    for observation in observations:
        date_key = _format_progress_date(observation.effective_datetime)
        label = observation.code_text or observation.code_display or observation.code or "観察"
        value = _format_lab_value(observation)
        if observation.category == "vital-signs":
            row_for(date_key)["vitals"].append(f"{label}: {value}".strip())
        elif observation.category == "laboratory":
            row_for(date_key)["labs"].append(f"{label}: {value}".strip())

    for prescription in prescriptions:
        date_key = _format_progress_date(prescription.created_at)
        row_for(date_key)["prescriptions"].append(
            f"{prescription.drug_name} {prescription.dosage} / {prescription.days}"
        )

    for order in lab_orders:
        date_key = _format_progress_date(order.created_at)
        urgency = f"{order.urgency} " if order.urgency else ""
        row_for(date_key)["lab_orders"].append(f"{urgency}{order.category}: {', '.join(order.items)}")

    for instruction in instructions:
        date_key = _format_progress_date(instruction.due_at or instruction.created_at)
        row_for(date_key)["instructions"].append(
            f"[{instruction.status}] {instruction.category}: {instruction.title}"
        )

    for note in nursing_notes:
        date_key = _format_progress_date(note.recorded_at)
        focus = f"{note.focus}: " if note.focus else ""
        row_for(date_key)["nursing_notes"].append(f"{focus}{note.assessment or note.plan or note.objective}")

    sorted_dates = sorted(
        rows_by_date,
        key=lambda value: datetime.strptime(value, "%Y/%m/%d") if value != "日付未設定" else datetime.min,
        reverse=True,
    )
    return InpatientProgressRead(
        admission_id=admission.id,
        patient_id=admission.patient_id,
        rows=[
            InpatientProgressDateRow(date=date_key, **rows_by_date[date_key])
            for date_key in sorted_dates
        ],
    )


INPATIENT_DOCUMENT_TITLES = {
    "admission_care_plan": "入院診療計画書",
    "discharge_summary": "退院サマリ",
    "discharge_instruction": "退院時指導文書",
}


def _format_document_date(value: datetime | None) -> str:
    if value is None:
        return "未設定"
    return value.astimezone(TOKYO_TZ).strftime("%Y/%m/%d")


def _patient_active_problem_labels(patient: Patient) -> list[str]:
    labels: list[str] = []
    for problem in patient.problems or []:
        if not isinstance(problem, dict):
            continue
        name = problem.get("name")
        problem_status = problem.get("status")
        if isinstance(name, str) and name and problem_status != "resolved":
            labels.append(name)
    return labels


def _latest_inpatient_records(
    db: Session,
    *,
    admission: Admission,
) -> tuple[list[InpatientInstruction], list[NursingNote], list[PrescriptionOrder], list[LabOrder]]:
    instructions = db.scalars(
        select(InpatientInstruction)
        .where(InpatientInstruction.admission_id == admission.id)
        .order_by(desc(InpatientInstruction.created_at))
        .limit(8)
    ).all()
    nursing_notes = db.scalars(
        select(NursingNote)
        .where(NursingNote.admission_id == admission.id)
        .order_by(desc(NursingNote.recorded_at), desc(NursingNote.id))
        .limit(6)
    ).all()
    prescriptions = db.scalars(
        select(PrescriptionOrder)
        .where(PrescriptionOrder.patient_id == admission.patient_id)
        .order_by(desc(PrescriptionOrder.created_at))
        .limit(8)
    ).all()
    lab_orders = db.scalars(
        select(LabOrder)
        .where(LabOrder.patient_id == admission.patient_id)
        .order_by(desc(LabOrder.created_at))
        .limit(6)
    ).all()
    return instructions, nursing_notes, prescriptions, lab_orders


def build_inpatient_document_body(
    db: Session,
    *,
    admission: Admission,
    patient: Patient,
    document_type: str,
) -> str:
    instructions, nursing_notes, prescriptions, lab_orders = _latest_inpatient_records(db, admission=admission)
    diagnosis = admission.primary_diagnosis or ", ".join(_patient_active_problem_labels(patient)[:3]) or "未設定"
    admission_period = f"{_format_document_date(admission.admitted_at or admission.requested_at)} - {_format_document_date(admission.discharged_at)}"
    ward = db.get(WardMaster, admission.ward_id) if admission.ward_id else None
    bed = db.get(BedMaster, admission.bed_id) if admission.bed_id else None
    ward_label = " ".join(
        item
        for item in [
            ward.name if ward else None,
            bed.bed_label if bed else None,
        ]
        if item
    ) or "未設定"
    latest_note = nursing_notes[0] if nursing_notes else None
    latest_note_summary = (
        f"{latest_note.focus or latest_note.note_type}: {latest_note.assessment or latest_note.plan or latest_note.objective}"
        if latest_note
        else "看護記録なし"
    )
    instruction_lines = [
        f"- [{item.status}] {item.category}: {item.title}"
        for item in instructions[:5]
    ] or ["- 指示なし"]
    prescription_lines = [
        f"- {item.drug_name} {item.dosage} / {item.days}"
        for item in prescriptions[:5]
    ] or ["- 処方なし"]
    lab_order_lines = [
        f"- {item.category}: {', '.join(item.items)}"
        for item in lab_orders[:4]
    ] or ["- 検査オーダなし"]

    if document_type == "admission_care_plan":
        return "\n".join(
            [
                "【患者情報】",
                f"患者: {patient.name} ({patient.id}) / {patient.age} / {patient.sex}",
                f"病棟・病床: {ward_label}",
                f"主治医: {admission.attending_doctor}",
                "",
                "【入院目的・主病名】",
                f"主病名: {diagnosis}",
                f"入院目的: {admission.note or diagnosis}",
                "",
                "【治療計画】",
                *instruction_lines,
                "",
                "【検査・観察計画】",
                *lab_order_lines,
                "",
                "【看護計画】",
                f"- {latest_note_summary}",
                f"- 看護必要度・ケア区分: {admission.care_level or '未設定'}",
                "",
                "【退院目標】",
                "- 症状安定、内服・生活指導の理解、退院後フォロー方針の確認",
            ]
        )

    if document_type == "discharge_instruction":
        return "\n".join(
            [
                "【退院後の方針】",
                f"患者: {patient.name} ({patient.id})",
                f"主病名: {diagnosis}",
                "",
                "【服薬】",
                *prescription_lines,
                "",
                "【生活上の注意】",
                "- 発熱、呼吸苦、強い疼痛、食事摂取困難、意識変容があれば早めに受診",
                "- 次回受診日、検査予定、訪問看護・介護連携の有無を確認",
                "",
                "【連絡・再診】",
                f"- 主治医: {admission.attending_doctor}",
                "- 緊急時は救急外来または地域連携窓口へ連絡",
            ]
        )

    return "\n".join(
        [
            "【入院概要】",
            f"患者: {patient.name} ({patient.id}) / {patient.age} / {patient.sex}",
            f"入院期間: {admission_period}",
            f"主病名: {diagnosis}",
            f"担当: {admission.attending_doctor} / {admission.team or 'チーム未設定'}",
            "",
            "【入院経過】",
            f"- {latest_note_summary}",
            *(f"- {item.assessment or item.plan or item.objective}" for item in nursing_notes[1:4]),
            "",
            "【主な指示・処置】",
            *instruction_lines,
            "",
            "【処方】",
            *prescription_lines,
            "",
            "【検査】",
            *lab_order_lines,
            "",
            "【退院時方針】",
            f"- {admission.note or '退院後フォロー、服薬継続、必要時再診を確認'}",
        ]
    )


def build_inpatient_summary_draft(
    *,
    admission: Admission,
    patient: Patient,
    observations: list[Observation],
    prescriptions: list[PrescriptionOrder],
    lab_orders: list[LabOrder],
    instructions: list[InpatientInstruction],
    nursing_notes: list[NursingNote],
    days: int,
) -> InpatientSummaryDraftRead:
    generated_at = utcnow()
    since = generated_at - timedelta(days=days)
    period_start = max(admission.admitted_at or admission.requested_at, since)
    period_label = f"{_format_document_date(period_start)} - {_format_document_date(generated_at)}"
    diagnosis = admission.primary_diagnosis or ", ".join(_patient_active_problem_labels(patient)[:3]) or "未設定"
    latest_notes = nursing_notes[:5]
    latest_labs = [
        observation
        for observation in observations
        if observation.category == "laboratory"
    ][:6]
    latest_vitals = [
        observation
        for observation in observations
        if observation.category == "vital-signs"
    ][:4]
    active_instructions = [instruction for instruction in instructions if instruction.status == "pending"]
    done_instructions = [instruction for instruction in instructions if instruction.status == "done"]
    key_events: list[str] = []
    if admission.admitted_at:
        key_events.append(f"{_format_document_date(admission.admitted_at)} 入院")
    if admission.discharge_permitted_at:
        key_events.append(f"{_format_document_date(admission.discharge_permitted_at)} 退院許可")
    if admission.discharged_at:
        key_events.append(f"{_format_document_date(admission.discharged_at)} 退院")
    key_events.extend(
        f"{_format_document_date(note.recorded_at)} {note.focus or note.note_type}: {note.assessment or note.plan or note.objective}"
        for note in latest_notes[:3]
        if note.assessment or note.plan or note.objective
    )
    note_lines = [
        f"- {_format_document_date(note.recorded_at)} {note.focus or note.note_type}: {note.assessment or note.plan or note.objective}"
        for note in latest_notes
    ] or ["- 看護記録なし"]
    lab_lines = [
        f"- {_format_document_date(item.effective_datetime)} {item.code_text or item.code_display or item.code or '検査'}: {_format_lab_value(item)}"
        for item in latest_labs
    ] or ["- 検査結果なし"]
    vital_lines = [
        f"- {_format_document_date(item.effective_datetime)} {item.code_text or item.code_display or item.code or 'バイタル'}: {_format_lab_value(item)}"
        for item in latest_vitals
    ] or ["- バイタルなし"]
    prescription_lines = [
        f"- {_format_document_date(item.created_at)} {item.drug_name} {item.dosage} / {item.days}"
        for item in prescriptions[:8]
    ] or ["- 処方なし"]
    instruction_lines = [
        f"- 未実施: {item.category} / {item.title}"
        for item in active_instructions[:6]
    ] or ["- 未実施指示なし"]
    done_instruction_lines = [
        f"- 実施済: {item.category} / {item.title}"
        for item in done_instructions[:4]
    ]
    body = "\n".join(
        [
            "【入院経過要約案】",
            f"患者: {patient.name} ({patient.id})",
            f"対象期間: {period_label}",
            f"主病名: {diagnosis}",
            f"担当: {admission.attending_doctor} / {admission.team or 'チーム未設定'}",
            "",
            "【経過】",
            *note_lines,
            "",
            "【検査・バイタル】",
            *vital_lines,
            *lab_lines,
            "",
            "【処方】",
            *prescription_lines,
            "",
            "【指示】",
            *instruction_lines,
            *done_instruction_lines,
            "",
            "【評価と方針】",
            f"- {latest_notes[0].assessment if latest_notes and latest_notes[0].assessment else admission.note or '経過安定性、退院可否、外来フォローを確認'}",
            "- この要約案は記録からの機械的抽出です。医師が確認してから文書へ確定してください。",
        ]
    )
    return InpatientSummaryDraftRead(
        admission_id=admission.id,
        patient_id=patient.id,
        title=f"{patient.name} 入院経過要約案",
        period_label=period_label,
        source_counts={
            "nursing_notes": len(nursing_notes),
            "observations": len(observations),
            "prescriptions": len(prescriptions),
            "lab_orders": len(lab_orders),
            "instructions": len(instructions),
        },
        key_events=key_events[:8],
        body=body,
        generated_at=generated_at,
    )


STANDARD_PATHWAY_TASKS = [
    (0, "入院", "入院時評価、持参薬確認、転倒リスク評価"),
    (0, "検査", "入院時採血・画像・感染症確認"),
    (1, "治療", "初期治療反応と指示内容の再評価"),
    (2, "看護", "セルフケア、疼痛、栄養、排泄状況の評価"),
    (3, "退院支援", "退院目標、家族説明、地域連携の確認"),
    (5, "退院支援", "退院時処方、指導文書、次回外来の確認"),
]


def inpatient_pathway_to_read(
    assignment: InpatientPathwayAssignment,
    tasks: list[InpatientPathwayTask],
) -> InpatientPathwayRead:
    return InpatientPathwayRead(
        id=assignment.id,
        admission_id=assignment.admission_id,
        pathway_master_id=assignment.pathway_master_id,
        pathway_name=assignment.pathway_name,
        status=assignment.status,
        started_on=assignment.started_on,
        assigned_by=assignment.assigned_by,
        created_at=assignment.created_at,
        updated_at=assignment.updated_at,
        tasks=[InpatientPathwayTaskRead.model_validate(task) for task in tasks],
    )


def inpatient_pathway_master_to_read(
    master: InpatientPathwayMaster,
    tasks: list[InpatientPathwayTaskMaster],
) -> InpatientPathwayMasterRead:
    return InpatientPathwayMasterRead(
        id=master.id,
        sort_order=master.sort_order,
        is_active=master.is_active,
        name=master.name,
        department=master.department,
        primary_diagnosis=master.primary_diagnosis,
        expected_days=master.expected_days,
        note=master.note,
        tasks=[InpatientPathwayTaskMasterRead.model_validate(task) for task in tasks],
    )


def get_pathway_master_or_404(db: Session, master_id: str) -> InpatientPathwayMaster:
    master = db.get(InpatientPathwayMaster, master_id)
    if master is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inpatient pathway master not found")
    return master


def build_discharge_plan_defaults(
    *,
    admission: Admission,
    prescriptions: list[PrescriptionOrder],
    instructions: list[InpatientInstruction],
) -> tuple[str, list[dict[str, str]], str]:
    latest_by_drug: dict[str, PrescriptionOrder] = {}
    for prescription in prescriptions:
        latest_by_drug.setdefault(prescription.drug_name, prescription)
    medication_note = "\n".join(
        f"- {item.drug_name} {item.dosage} / {item.days}"
        for item in latest_by_drug.values()
    ) or "- 退院時処方候補なし"
    candidates = [
        {
            "category": "入院基本料",
            "label": f"{admission.ward_id or '病棟未設定'} 入院日数 {_admission_stay_days(admission)}日",
            "source": "admission",
        },
        {
            "category": "退院支援",
            "label": "退院支援・退院時指導の算定候補を確認",
            "source": "discharge",
        },
    ]
    if prescriptions:
        candidates.append({"category": "投薬", "label": "退院時処方料・薬剤料候補", "source": "prescription"})
    if any(instruction.status == "done" for instruction in instructions):
        candidates.append({"category": "処置/指導", "label": "実施済み入院指示から算定候補を確認", "source": "instruction"})
    follow_up = admission.note or "退院後外来、再診、検査予定、地域連携の確認"
    return medication_note, candidates, follow_up


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


def _admission_stay_days(admission: Admission) -> int:
    start = admission.admitted_at or admission.requested_at
    end = admission.discharged_at or utcnow()
    start_date = start.astimezone(TOKYO_TZ).date()
    end_date = end.astimezone(TOKYO_TZ).date()
    return max((end_date - start_date).days + 1, 1)


def admission_to_read(
    db: Session,
    admission: Admission,
    *,
    patient: Patient | None = None,
    ward: WardMaster | None = None,
    bed: BedMaster | None = None,
) -> AdmissionRead:
    patient = patient or get_patient_or_404(db, admission.patient_id)
    ward = ward if ward is not None else (db.get(WardMaster, admission.ward_id) if admission.ward_id else None)
    bed = bed if bed is not None else (db.get(BedMaster, admission.bed_id) if admission.bed_id else None)
    pending_instruction_count = int(
        db.scalar(
            select(func.count(InpatientInstruction.id)).where(
                InpatientInstruction.admission_id == admission.id,
                InpatientInstruction.status == "pending",
            )
        )
        or 0
    )
    latest_nursing_note = db.scalar(
        select(NursingNote)
        .where(NursingNote.admission_id == admission.id)
        .order_by(desc(NursingNote.recorded_at), desc(NursingNote.id))
    )

    return AdmissionRead(
        id=admission.id,
        patient=patient_to_read(patient),
        status=admission.status,  # type: ignore[arg-type]
        requested_at=admission.requested_at,
        admitted_at=admission.admitted_at,
        discharge_permitted_at=admission.discharge_permitted_at,
        discharged_at=admission.discharged_at,
        ward=ward,
        bed=bed,
        attending_doctor=admission.attending_doctor,
        team=admission.team,
        primary_diagnosis=admission.primary_diagnosis,
        care_level=admission.care_level,
        note=admission.note,
        stay_days=_admission_stay_days(admission),
        pending_instruction_count=pending_instruction_count,
        latest_nursing_note=latest_nursing_note,
        updated_at=admission.updated_at,
    )


def bed_board_item_to_read(
    db: Session,
    *,
    bed: BedMaster,
    ward: WardMaster,
    admission: Admission | None,
    patient: Patient | None,
) -> BedBoardItemRead:
    return BedBoardItemRead(
        bed=bed,
        ward=ward,
        current_admission_id=admission.id if admission else None,
        current_patient=patient_to_read(patient) if patient else None,
        stay_days=_admission_stay_days(admission) if admission else None,
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


@app.get("/api/inpatient/beds", response_model=list[BedBoardItemRead])
def list_inpatient_beds(
    ward_id: str | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BedBoardItemRead]:
    active_admission = (
        select(Admission)
        .where(Admission.bed_id == BedMaster.id)
        .where(Admission.status.in_(["active", "discharge_permitted"]))
        .correlate(BedMaster)
        .lateral()
    )
    query = (
        select(BedMaster, WardMaster, active_admission.c.id)
        .join(WardMaster, BedMaster.ward_id == WardMaster.id)
        .outerjoin(active_admission, sa_true())
    )
    if ward_id:
        query = query.where(BedMaster.ward_id == ward_id)
    if not include_inactive:
        query = query.where(BedMaster.is_active.is_(True), WardMaster.is_active.is_(True))
    query = query.order_by(WardMaster.sort_order, BedMaster.sort_order)

    rows = db.execute(query).all()
    admission_ids = [admission_id for _, _, admission_id in rows if admission_id is not None]
    admissions_by_id = {
        admission.id: admission
        for admission in db.scalars(select(Admission).where(Admission.id.in_(admission_ids))).all()
    } if admission_ids else {}
    patient_ids = [admission.patient_id for admission in admissions_by_id.values()]
    patients_by_id = {
        patient.id: patient
        for patient in db.scalars(select(Patient).where(Patient.id.in_(patient_ids))).all()
    } if patient_ids else {}

    return [
        bed_board_item_to_read(
            db,
            bed=bed,
            ward=ward,
            admission=admissions_by_id.get(admission_id),
            patient=patients_by_id.get(admissions_by_id[admission_id].patient_id)
            if admission_id in admissions_by_id
            else None,
        )
        for bed, ward, admission_id in rows
    ]


@app.patch("/api/inpatient/beds/{bed_id}", response_model=BedBoardItemRead)
def update_bed_status(
    bed_id: str,
    payload: BedStatusUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BedBoardItemRead:
    bed = get_bed_or_404(db, bed_id)
    ward = get_ward_or_404(db, bed.ward_id)
    active_admission = db.scalar(
        select(Admission).where(
            Admission.bed_id == bed_id,
            Admission.status.in_(["active", "discharge_permitted"]),
        )
    )
    if active_admission is not None and payload.status != "occupied":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot free occupied bed")
    if payload.status == "occupied" and active_admission is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Occupied bed requires admission")

    bed.status = payload.status
    bed.note = payload.note
    log_audit(
        db,
        actor=current_user.display_name,
        action="病床状態更新",
        scope="system",
        detail=f"{ward.name} {bed.bed_label} を {payload.status} に更新しました。",
    )
    db.commit()
    db.refresh(bed)
    patient = get_patient_or_404(db, active_admission.patient_id) if active_admission else None
    return bed_board_item_to_read(db, bed=bed, ward=ward, admission=active_admission, patient=patient)


@app.get("/api/inpatient/admissions", response_model=list[AdmissionRead])
def list_inpatient_admissions(
    status_filter: str | None = Query(default="active", alias="status"),
    ward_id: str | None = Query(default=None),
    search: str | None = Query(default=None),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AdmissionRead]:
    query = select(Admission, Patient, WardMaster, BedMaster).join(Patient, Admission.patient_id == Patient.id)
    query = query.outerjoin(WardMaster, Admission.ward_id == WardMaster.id).outerjoin(
        BedMaster, Admission.bed_id == BedMaster.id
    )
    if status_filter and status_filter != "all":
        query = query.where(Admission.status == status_filter)
    if ward_id:
        query = query.where(Admission.ward_id == ward_id)
    if search:
        like = f"%{search}%"
        query = query.where(
            or_(
                Patient.id.ilike(like),
                Patient.name.ilike(like),
                Patient.kana.ilike(like),
                Admission.attending_doctor.ilike(like),
                Admission.team.ilike(like),
                Admission.primary_diagnosis.ilike(like),
                WardMaster.name.ilike(like),
                BedMaster.bed_label.ilike(like),
            )
        )
    query = query.order_by(WardMaster.sort_order, BedMaster.sort_order, Admission.admitted_at)
    rows = db.execute(query).all()
    return [
        admission_to_read(db, admission, patient=patient, ward=ward, bed=bed)
        for admission, patient, ward, bed in rows
    ]


@app.post("/api/patients/{patient_id}/admissions", response_model=AdmissionRead, status_code=status.HTTP_201_CREATED)
def create_admission(
    patient_id: str,
    payload: AdmissionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AdmissionRead:
    patient = get_patient_or_404(db, patient_id)
    active_admission = db.scalar(
        select(Admission).where(
            Admission.patient_id == patient_id,
            Admission.status.in_(["planned", "active", "discharge_permitted"]),
        )
    )
    if active_admission is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Active admission already exists")

    ward = get_ward_or_404(db, payload.ward_id) if payload.ward_id else None
    bed = get_bed_or_404(db, payload.bed_id) if payload.bed_id else None
    if bed and ward and bed.ward_id != ward.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bed does not belong to ward")
    if bed and bed.status == "occupied":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bed already occupied")

    admission = Admission(
        patient_id=patient_id,
        status=payload.status,
        admitted_at=payload.admitted_at or (utcnow() if payload.status == "active" else None),
        ward_id=payload.ward_id,
        bed_id=payload.bed_id,
        attending_doctor=payload.attending_doctor,
        team=payload.team,
        primary_diagnosis=payload.primary_diagnosis,
        care_level=payload.care_level,
        note=payload.note,
        updated_at=utcnow(),
    )
    db.add(admission)
    if bed and payload.status in ("active", "discharge_permitted"):
        bed.status = "occupied"
    db.flush()
    add_inpatient_event(
        db,
        admission_id=admission.id,
        event_type="admission_created",
        title="入院エピソード作成",
        detail=f"{ward.name if ward else '病棟未定'} {bed.bed_label if bed else ''}".strip() or None,
        actor=current_user.display_name,
    )
    log_audit(
        db,
        actor=current_user.display_name,
        action="入院申込",
        scope="patient",
        detail=f"{payload.primary_diagnosis or '入院'} の入院エピソードを作成しました。",
        patient=patient,
    )
    db.commit()
    db.refresh(admission)
    return admission_to_read(db, admission)


@app.post("/api/inpatient/admissions/{admission_id}/transfer", response_model=AdmissionRead)
def transfer_admission(
    admission_id: int,
    payload: AdmissionTransferRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AdmissionRead:
    admission = get_admission_or_404(db, admission_id)
    patient = get_patient_or_404(db, admission.patient_id)
    ward = get_ward_or_404(db, payload.ward_id)
    bed = get_bed_or_404(db, payload.bed_id)
    if bed.ward_id != ward.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bed does not belong to ward")
    if bed.status == "occupied" and bed.id != admission.bed_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bed already occupied")

    if admission.bed_id and admission.bed_id != bed.id:
        previous_bed = db.get(BedMaster, admission.bed_id)
        if previous_bed is not None:
            previous_bed.status = "cleaning"
    admission.ward_id = ward.id
    admission.bed_id = bed.id
    admission.status = "active" if admission.status == "planned" else admission.status
    admission.admitted_at = admission.admitted_at or utcnow()
    admission.note = payload.note or admission.note
    admission.updated_at = utcnow()
    bed.status = "occupied"
    add_inpatient_event(
        db,
        admission_id=admission.id,
        event_type="transfer",
        title="転棟・転床",
        detail=f"{ward.name} {bed.bed_label} へ移動しました。",
        actor=current_user.display_name,
    )
    log_audit(
        db,
        actor=current_user.display_name,
        action="転棟・転床",
        scope="patient",
        detail=f"{ward.name} {bed.bed_label} へ移動しました。",
        patient=patient,
    )
    db.commit()
    db.refresh(admission)
    return admission_to_read(db, admission)


@app.post("/api/inpatient/admissions/{admission_id}/permit-discharge", response_model=AdmissionRead)
def permit_discharge(
    admission_id: int,
    payload: AdmissionDischargeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AdmissionRead:
    admission = get_admission_or_404(db, admission_id)
    patient = get_patient_or_404(db, admission.patient_id)
    admission.status = "discharge_permitted"
    admission.discharge_permitted_at = utcnow()
    admission.note = payload.note or admission.note
    admission.updated_at = utcnow()
    add_inpatient_event(
        db,
        admission_id=admission.id,
        event_type="discharge_permitted",
        title="退院許可",
        detail=payload.note,
        actor=current_user.display_name,
    )
    log_audit(
        db,
        actor=current_user.display_name,
        action="退院許可",
        scope="patient",
        detail=payload.note or "退院許可を登録しました。",
        patient=patient,
    )
    db.commit()
    db.refresh(admission)
    return admission_to_read(db, admission)


@app.post("/api/inpatient/admissions/{admission_id}/discharge", response_model=AdmissionRead)
def discharge_admission(
    admission_id: int,
    payload: AdmissionDischargeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AdmissionRead:
    admission = get_admission_or_404(db, admission_id)
    patient = get_patient_or_404(db, admission.patient_id)
    admission.status = "discharged"
    admission.discharged_at = utcnow()
    admission.note = payload.note or admission.note
    admission.updated_at = utcnow()
    if admission.bed_id:
        bed = db.get(BedMaster, admission.bed_id)
        if bed is not None:
            bed.status = "cleaning"
    add_inpatient_event(
        db,
        admission_id=admission.id,
        event_type="discharged",
        title="退院実施",
        detail=payload.note,
        actor=current_user.display_name,
    )
    log_audit(
        db,
        actor=current_user.display_name,
        action="退院実施",
        scope="patient",
        detail=payload.note or "退院を実施しました。",
        patient=patient,
    )
    db.commit()
    db.refresh(admission)
    return admission_to_read(db, admission)


@app.get("/api/inpatient/admissions/{admission_id}/instructions", response_model=list[InpatientInstructionRead])
def list_inpatient_instructions(
    admission_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[InpatientInstructionRead]:
    get_admission_or_404(db, admission_id)
    return db.scalars(
        select(InpatientInstruction)
        .where(InpatientInstruction.admission_id == admission_id)
        .order_by(InpatientInstruction.status, InpatientInstruction.due_at, InpatientInstruction.id)
    ).all()


@app.get("/api/inpatient/admissions/{admission_id}/progress", response_model=InpatientProgressRead)
def get_inpatient_progress(
    admission_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InpatientProgressRead:
    admission = get_admission_or_404(db, admission_id)
    observations = db.scalars(
        select(Observation)
        .where(
            Observation.patient_id == admission.patient_id,
            Observation.category.in_(["vital-signs", "laboratory"]),
        )
        .order_by(desc(Observation.effective_datetime))
    ).all()
    prescriptions = db.scalars(
        select(PrescriptionOrder)
        .where(PrescriptionOrder.patient_id == admission.patient_id)
        .order_by(desc(PrescriptionOrder.created_at))
    ).all()
    lab_orders = db.scalars(
        select(LabOrder)
        .where(LabOrder.patient_id == admission.patient_id)
        .order_by(desc(LabOrder.created_at))
    ).all()
    instructions = db.scalars(
        select(InpatientInstruction)
        .where(InpatientInstruction.admission_id == admission_id)
        .order_by(desc(InpatientInstruction.created_at))
    ).all()
    nursing_notes = db.scalars(
        select(NursingNote)
        .where(NursingNote.admission_id == admission_id)
        .order_by(desc(NursingNote.recorded_at))
    ).all()
    return build_inpatient_progress(
        admission=admission,
        observations=observations,
        prescriptions=prescriptions,
        lab_orders=lab_orders,
        instructions=instructions,
        nursing_notes=nursing_notes,
    )


@app.get("/api/inpatient/admissions/{admission_id}/summary-draft", response_model=InpatientSummaryDraftRead)
def get_inpatient_summary_draft(
    admission_id: int,
    days: int = Query(default=14, ge=1, le=120),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InpatientSummaryDraftRead:
    admission = get_admission_or_404(db, admission_id)
    patient = get_patient_or_404(db, admission.patient_id)
    since = utcnow() - timedelta(days=days)
    observations = db.scalars(
        select(Observation)
        .where(
            Observation.patient_id == admission.patient_id,
            Observation.category.in_(["vital-signs", "laboratory"]),
            or_(Observation.effective_datetime.is_(None), Observation.effective_datetime >= since),
        )
        .order_by(desc(Observation.effective_datetime))
    ).all()
    prescriptions = db.scalars(
        select(PrescriptionOrder)
        .where(PrescriptionOrder.patient_id == admission.patient_id, PrescriptionOrder.created_at >= since)
        .order_by(desc(PrescriptionOrder.created_at))
    ).all()
    lab_orders = db.scalars(
        select(LabOrder)
        .where(LabOrder.patient_id == admission.patient_id, LabOrder.created_at >= since)
        .order_by(desc(LabOrder.created_at))
    ).all()
    instructions = db.scalars(
        select(InpatientInstruction)
        .where(InpatientInstruction.admission_id == admission_id)
        .where(or_(InpatientInstruction.created_at >= since, InpatientInstruction.due_at >= since))
        .order_by(desc(InpatientInstruction.created_at))
    ).all()
    nursing_notes = db.scalars(
        select(NursingNote)
        .where(NursingNote.admission_id == admission_id, NursingNote.recorded_at >= since)
        .order_by(desc(NursingNote.recorded_at), desc(NursingNote.id))
    ).all()
    return build_inpatient_summary_draft(
        admission=admission,
        patient=patient,
        observations=observations,
        prescriptions=prescriptions,
        lab_orders=lab_orders,
        instructions=instructions,
        nursing_notes=nursing_notes,
        days=days,
    )


@app.get("/api/inpatient/admissions/{admission_id}/events", response_model=list[InpatientEventRead])
def list_inpatient_events(
    admission_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[InpatientEventRead]:
    admission = get_admission_or_404(db, admission_id)
    events = db.scalars(
        select(InpatientEvent)
        .where(InpatientEvent.admission_id == admission_id)
        .order_by(desc(InpatientEvent.occurred_at), desc(InpatientEvent.id))
    ).all()
    if events:
        return events
    return [
        InpatientEventRead(
            id=0,
            admission_id=admission.id,
            event_type="admission_created",
            title="入院エピソード作成",
            detail=admission.note,
            actor=admission.attending_doctor,
            occurred_at=admission.requested_at,
        )
    ]


@app.get("/api/inpatient/admissions/{admission_id}/pathway", response_model=InpatientPathwayRead | None)
def get_inpatient_pathway(
    admission_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InpatientPathwayRead | None:
    get_admission_or_404(db, admission_id)
    assignment = db.scalar(
        select(InpatientPathwayAssignment)
        .where(InpatientPathwayAssignment.admission_id == admission_id)
        .order_by(desc(InpatientPathwayAssignment.created_at), desc(InpatientPathwayAssignment.id))
    )
    if assignment is None:
        return None
    tasks = db.scalars(
        select(InpatientPathwayTask)
        .where(InpatientPathwayTask.pathway_assignment_id == assignment.id)
        .order_by(InpatientPathwayTask.day_offset, InpatientPathwayTask.id)
    ).all()
    return inpatient_pathway_to_read(assignment, tasks)


@app.get("/api/inpatient/pathway-masters", response_model=list[InpatientPathwayMasterRead])
def list_inpatient_pathway_masters(
    department: str | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[InpatientPathwayMasterRead]:
    query = select(InpatientPathwayMaster)
    if department:
        query = query.where(
            or_(InpatientPathwayMaster.department == department, InpatientPathwayMaster.department == "共通")
        )
    if not include_inactive:
        query = query.where(InpatientPathwayMaster.is_active.is_(True))
    masters = db.scalars(query.order_by(InpatientPathwayMaster.sort_order, InpatientPathwayMaster.id)).all()
    master_ids = [master.id for master in masters]
    tasks_by_master: dict[str, list[InpatientPathwayTaskMaster]] = {master_id: [] for master_id in master_ids}
    if master_ids:
        tasks = db.scalars(
            select(InpatientPathwayTaskMaster)
            .where(InpatientPathwayTaskMaster.pathway_master_id.in_(master_ids))
            .order_by(
                InpatientPathwayTaskMaster.pathway_master_id,
                InpatientPathwayTaskMaster.day_offset,
                InpatientPathwayTaskMaster.sort_order,
            )
        ).all()
        for task in tasks:
            tasks_by_master.setdefault(task.pathway_master_id, []).append(task)
    return [inpatient_pathway_master_to_read(master, tasks_by_master.get(master.id, [])) for master in masters]


@app.post(
    "/api/inpatient/admissions/{admission_id}/pathway",
    response_model=InpatientPathwayRead,
    status_code=status.HTTP_201_CREATED,
)
def create_inpatient_pathway(
    admission_id: int,
    payload: InpatientPathwayCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InpatientPathwayRead:
    admission = get_admission_or_404(db, admission_id)
    patient = get_patient_or_404(db, admission.patient_id)
    pathway_master = get_pathway_master_or_404(db, payload.pathway_master_id) if payload.pathway_master_id else None
    existing = db.scalar(
        select(InpatientPathwayAssignment).where(
            InpatientPathwayAssignment.admission_id == admission_id,
            InpatientPathwayAssignment.status == "active",
        )
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Active pathway already exists")
    now = utcnow()
    assignment = InpatientPathwayAssignment(
        admission_id=admission_id,
        pathway_master_id=pathway_master.id if pathway_master else None,
        pathway_name=pathway_master.name if pathway_master else payload.pathway_name,
        status="active",
        started_on=payload.started_on or (admission.admitted_at or now).astimezone(TOKYO_TZ).date(),
        assigned_by=current_user.display_name,
        created_at=now,
        updated_at=now,
    )
    db.add(assignment)
    db.flush()
    started_on = assignment.started_on
    master_tasks = []
    if pathway_master is not None:
        master_tasks = db.scalars(
            select(InpatientPathwayTaskMaster)
            .where(InpatientPathwayTaskMaster.pathway_master_id == pathway_master.id)
            .order_by(InpatientPathwayTaskMaster.day_offset, InpatientPathwayTaskMaster.sort_order)
        ).all()
    tasks = [
        InpatientPathwayTask(
            pathway_assignment_id=assignment.id,
            day_offset=task.day_offset if pathway_master else task[0],
            category=task.category if pathway_master else task[1],
            title=task.title if pathway_master else task[2],
            role=task.role if pathway_master else None,
            due_on=started_on + timedelta(days=task.day_offset if pathway_master else task[0]),
            due_time=task.due_time if pathway_master else None,
            status="pending",
            updated_at=now,
        )
        for task in (master_tasks if pathway_master else STANDARD_PATHWAY_TASKS)
    ]
    db.add_all(tasks)
    add_inpatient_event(
        db,
        admission_id=admission_id,
        event_type="pathway_started",
        title="クリティカルパス開始",
        detail=assignment.pathway_name,
        actor=current_user.display_name,
    )
    log_audit(
        db,
        actor=current_user.display_name,
        action="クリティカルパス開始",
        scope="chart",
        detail=f"{assignment.pathway_name} を開始しました。",
        patient=patient,
    )
    db.commit()
    db.refresh(assignment)
    return inpatient_pathway_to_read(assignment, tasks)


@app.patch("/api/inpatient/pathway-tasks/{task_id}", response_model=InpatientPathwayTaskRead)
def update_inpatient_pathway_task(
    task_id: int,
    payload: InpatientPathwayTaskUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InpatientPathwayTaskRead:
    task = get_inpatient_pathway_task_or_404(db, task_id)
    assignment = db.get(InpatientPathwayAssignment, task.pathway_assignment_id)
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inpatient pathway not found")
    admission = get_admission_or_404(db, assignment.admission_id)
    patient = get_patient_or_404(db, admission.patient_id)
    task.status = payload.status
    task.variance_note = payload.variance_note
    task.updated_by = current_user.display_name
    task.updated_at = utcnow()
    if payload.status == "variance":
        add_inpatient_event(
            db,
            admission_id=assignment.admission_id,
            event_type="pathway_variance",
            title=f"パス逸脱: {task.title}",
            detail=payload.variance_note,
            actor=current_user.display_name,
        )
    log_audit(
        db,
        actor=current_user.display_name,
        action="パスタスク更新",
        scope="chart",
        detail=f"{task.title} を {payload.status} に更新しました。",
        patient=patient,
    )
    db.commit()
    db.refresh(task)
    return task


@app.post(
    "/api/inpatient/admissions/{admission_id}/instructions",
    response_model=InpatientInstructionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_inpatient_instruction(
    admission_id: int,
    payload: InpatientInstructionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InpatientInstructionRead:
    admission = get_admission_or_404(db, admission_id)
    patient = get_patient_or_404(db, admission.patient_id)
    instruction = InpatientInstruction(
        admission_id=admission_id,
        category=payload.category,
        title=payload.title,
        status="pending",
        due_at=payload.due_at,
        created_by=current_user.display_name,
    )
    db.add(instruction)
    log_audit(
        db,
        actor=current_user.display_name,
        action="入院指示追加",
        scope="order",
        detail=f"{payload.category}: {payload.title}",
        patient=patient,
    )
    db.commit()
    db.refresh(instruction)
    return instruction


@app.patch("/api/inpatient/instructions/{instruction_id}", response_model=InpatientInstructionRead)
def update_inpatient_instruction(
    instruction_id: int,
    payload: InpatientInstructionUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InpatientInstructionRead:
    instruction = get_inpatient_instruction_or_404(db, instruction_id)
    admission = get_admission_or_404(db, instruction.admission_id)
    patient = get_patient_or_404(db, admission.patient_id)
    instruction.status = payload.status
    log_audit(
        db,
        actor=current_user.display_name,
        action="入院指示更新",
        scope="order",
        detail=f"{instruction.title} を {payload.status} に更新しました。",
        patient=patient,
    )
    db.commit()
    db.refresh(instruction)
    return instruction


@app.get("/api/inpatient/admissions/{admission_id}/nursing-notes", response_model=list[NursingNoteRead])
def list_nursing_notes(
    admission_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[NursingNoteRead]:
    get_admission_or_404(db, admission_id)
    return db.scalars(
        select(NursingNote)
        .where(NursingNote.admission_id == admission_id)
        .order_by(desc(NursingNote.recorded_at), desc(NursingNote.id))
    ).all()


@app.post(
    "/api/inpatient/admissions/{admission_id}/nursing-notes",
    response_model=NursingNoteRead,
    status_code=status.HTTP_201_CREATED,
)
def create_nursing_note(
    admission_id: int,
    payload: NursingNoteCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NursingNoteRead:
    admission = get_admission_or_404(db, admission_id)
    patient = get_patient_or_404(db, admission.patient_id)
    note = NursingNote(
        admission_id=admission_id,
        note_type=payload.note_type,
        focus=payload.focus,
        subjective=payload.subjective,
        objective=payload.objective,
        assessment=payload.assessment,
        plan=payload.plan,
        recorded_by=current_user.display_name,
    )
    db.add(note)
    log_audit(
        db,
        actor=current_user.display_name,
        action="看護記録追加",
        scope="chart",
        detail=f"{payload.note_type}: {payload.focus or 'フォーカス未設定'}",
        patient=patient,
    )
    db.commit()
    db.refresh(note)
    return note


@app.get("/api/inpatient/admissions/{admission_id}/documents", response_model=list[InpatientDocumentRead])
def list_inpatient_documents(
    admission_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[InpatientDocumentRead]:
    get_admission_or_404(db, admission_id)
    return db.scalars(
        select(InpatientDocument)
        .where(InpatientDocument.admission_id == admission_id)
        .order_by(desc(InpatientDocument.updated_at), desc(InpatientDocument.id))
    ).all()


@app.post(
    "/api/inpatient/admissions/{admission_id}/documents",
    response_model=InpatientDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_inpatient_document(
    admission_id: int,
    payload: InpatientDocumentCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InpatientDocumentRead:
    admission = get_admission_or_404(db, admission_id)
    patient = get_patient_or_404(db, admission.patient_id)
    title = payload.title or INPATIENT_DOCUMENT_TITLES[payload.document_type]
    body = payload.body or build_inpatient_document_body(
        db,
        admission=admission,
        patient=patient,
        document_type=payload.document_type,
    )
    now = utcnow()
    document = InpatientDocument(
        admission_id=admission_id,
        document_type=payload.document_type,
        title=title,
        status="draft",
        body=body,
        created_by=current_user.display_name,
        created_at=now,
        updated_at=now,
    )
    db.add(document)
    add_inpatient_event(
        db,
        admission_id=admission_id,
        event_type="document_created",
        title=f"文書作成: {title}",
        detail=payload.document_type,
        actor=current_user.display_name,
    )
    log_audit(
        db,
        actor=current_user.display_name,
        action="入院文書作成",
        scope="chart",
        detail=f"{title} を作成しました。",
        patient=patient,
    )
    db.commit()
    db.refresh(document)
    return document


@app.patch("/api/inpatient/documents/{document_id}", response_model=InpatientDocumentRead)
def update_inpatient_document(
    document_id: int,
    payload: InpatientDocumentUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InpatientDocumentRead:
    document = get_inpatient_document_or_404(db, document_id)
    admission = get_admission_or_404(db, document.admission_id)
    patient = get_patient_or_404(db, admission.patient_id)
    if payload.title is not None:
        document.title = payload.title
    if payload.body is not None:
        document.body = payload.body
    if payload.status is not None:
        document.status = payload.status
    document.updated_at = utcnow()
    if payload.status == "signed":
        add_inpatient_event(
            db,
            admission_id=document.admission_id,
            event_type="document_signed",
            title=f"文書署名: {document.title}",
            detail=document.document_type,
            actor=current_user.display_name,
        )
    log_audit(
        db,
        actor=current_user.display_name,
        action="入院文書更新",
        scope="chart",
        detail=f"{document.title} を更新しました。",
        patient=patient,
    )
    db.commit()
    db.refresh(document)
    return document


@app.get("/api/inpatient/admissions/{admission_id}/summary-reviews", response_model=list[InpatientAiSummaryReviewRead])
def list_inpatient_summary_reviews(
    admission_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[InpatientAiSummaryReviewRead]:
    get_admission_or_404(db, admission_id)
    return db.scalars(
        select(InpatientAiSummaryReview)
        .where(InpatientAiSummaryReview.admission_id == admission_id)
        .order_by(desc(InpatientAiSummaryReview.created_at), desc(InpatientAiSummaryReview.id))
    ).all()


@app.post(
    "/api/inpatient/admissions/{admission_id}/summary-reviews",
    response_model=InpatientAiSummaryReviewRead,
    status_code=status.HTTP_201_CREATED,
)
def create_inpatient_summary_review(
    admission_id: int,
    payload: InpatientAiSummaryReviewCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InpatientAiSummaryReviewRead:
    admission = get_admission_or_404(db, admission_id)
    patient = get_patient_or_404(db, admission.patient_id)
    review = InpatientAiSummaryReview(
        admission_id=admission_id,
        summary_title=payload.summary_title,
        summary_body=payload.summary_body,
        status=payload.status,
        source_counts=payload.source_counts,
        reviewed_by=current_user.display_name,
        review_note=payload.review_note,
    )
    db.add(review)
    add_inpatient_event(
        db,
        admission_id=admission_id,
        event_type=f"summary_{payload.status}",
        title=f"要約案{ '採用' if payload.status == 'accepted' else '差し戻し' }",
        detail=payload.review_note,
        actor=current_user.display_name,
    )
    log_audit(
        db,
        actor=current_user.display_name,
        action="AI要約レビュー",
        scope="chart",
        detail=f"{payload.summary_title} を {payload.status} にしました。",
        patient=patient,
    )
    db.commit()
    db.refresh(review)
    return review


@app.get("/api/inpatient/admissions/{admission_id}/discharge-plan", response_model=InpatientDischargePlanRead)
def get_inpatient_discharge_plan(
    admission_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InpatientDischargePlanRead:
    admission = get_admission_or_404(db, admission_id)
    plan = db.scalar(
        select(InpatientDischargePlan)
        .where(InpatientDischargePlan.admission_id == admission_id)
        .order_by(desc(InpatientDischargePlan.updated_at), desc(InpatientDischargePlan.id))
    )
    if plan is not None:
        return plan
    prescriptions = db.scalars(
        select(PrescriptionOrder)
        .where(PrescriptionOrder.patient_id == admission.patient_id)
        .order_by(desc(PrescriptionOrder.created_at))
        .limit(20)
    ).all()
    instructions = db.scalars(
        select(InpatientInstruction)
        .where(InpatientInstruction.admission_id == admission_id)
        .order_by(desc(InpatientInstruction.created_at))
    ).all()
    medication_note, candidates, follow_up = build_discharge_plan_defaults(
        admission=admission,
        prescriptions=prescriptions,
        instructions=instructions,
    )
    now = utcnow()
    return InpatientDischargePlanRead(
        id=0,
        admission_id=admission_id,
        status="draft",
        discharge_medication_note=medication_note,
        billing_candidates=candidates,
        follow_up_note=follow_up,
        reviewed_by=current_user.display_name,
        reviewed_at=now,
        updated_at=now,
    )


@app.put("/api/inpatient/admissions/{admission_id}/discharge-plan", response_model=InpatientDischargePlanRead)
def upsert_inpatient_discharge_plan(
    admission_id: int,
    payload: InpatientDischargePlanUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InpatientDischargePlanRead:
    admission = get_admission_or_404(db, admission_id)
    patient = get_patient_or_404(db, admission.patient_id)
    plan = db.scalar(
        select(InpatientDischargePlan)
        .where(InpatientDischargePlan.admission_id == admission_id)
        .order_by(desc(InpatientDischargePlan.updated_at), desc(InpatientDischargePlan.id))
    )
    if plan is None:
        medication_note, candidates, follow_up = build_discharge_plan_defaults(
            admission=admission,
            prescriptions=db.scalars(
                select(PrescriptionOrder)
                .where(PrescriptionOrder.patient_id == admission.patient_id)
                .order_by(desc(PrescriptionOrder.created_at))
                .limit(20)
            ).all(),
            instructions=db.scalars(
                select(InpatientInstruction).where(InpatientInstruction.admission_id == admission_id)
            ).all(),
        )
        plan = InpatientDischargePlan(
            admission_id=admission_id,
            status=payload.status,
            discharge_medication_note=payload.discharge_medication_note or medication_note,
            billing_candidates=payload.billing_candidates or candidates,
            follow_up_note=payload.follow_up_note or follow_up,
            reviewed_by=current_user.display_name,
        )
        db.add(plan)
    else:
        plan.status = payload.status
        if payload.discharge_medication_note is not None:
            plan.discharge_medication_note = payload.discharge_medication_note
        if payload.billing_candidates is not None:
            plan.billing_candidates = payload.billing_candidates
        if payload.follow_up_note is not None:
            plan.follow_up_note = payload.follow_up_note
        plan.reviewed_by = current_user.display_name
        plan.reviewed_at = utcnow()
        plan.updated_at = utcnow()
    add_inpatient_event(
        db,
        admission_id=admission_id,
        event_type="discharge_plan_reviewed",
        title="退院計画レビュー",
        detail=f"状態: {payload.status}",
        actor=current_user.display_name,
    )
    log_audit(
        db,
        actor=current_user.display_name,
        action="退院計画レビュー",
        scope="chart",
        detail=f"退院計画を {payload.status} に更新しました。",
        patient=patient,
    )
    db.commit()
    db.refresh(plan)
    return plan


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
        select(DiagnosisAliasMaster)
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
            DiagnosisAliasMaster.management_number,
        )
        .limit(limit * 3)
    )
    alias_rows = db.scalars(alias_statement).all()
    alias_target_ids = {
        alias.target_management_number or alias.management_number
        for alias in alias_rows
        if alias.target_management_number or alias.management_number
    }
    alias_source_ids = {alias.management_number for alias in alias_rows}
    alias_targets = {
        item.management_number: item
        for item in db.scalars(
            select(DiagnosisMaster)
            .where(DiagnosisMaster.management_number.in_(alias_target_ids))
            .where(DiagnosisMaster.is_deleted.is_(False))
        ).all()
    }
    alias_sources = {
        item.management_number: item
        for item in db.scalars(select(DiagnosisMaster).where(DiagnosisMaster.management_number.in_(alias_source_ids))).all()
    }

    items_by_management_number: dict[str, DiagnosisMaster] = {}
    search_meta_by_management_number: dict[str, dict[str, str | None]] = {}
    for item in direct_items:
        items_by_management_number.setdefault(item.management_number, item)
    for alias in alias_rows:
        target_id = alias.target_management_number or alias.management_number
        target = alias_targets.get(target_id)
        if target is None:
            continue
        items_by_management_number.setdefault(target.management_number, target)
        source = alias_sources.get(alias.management_number)
        if target.management_number not in search_meta_by_management_number:
            search_meta_by_management_number[target.management_number] = {
                "matched_alias": alias.alias,
                "migration_source_management_number": alias.management_number if alias.target_management_number else None,
                "migration_source_name": source.disease_name if source and alias.target_management_number else None,
            }

    items = list(items_by_management_number.values())[:limit]
    return [
        DiagnosisMasterRead.model_validate(item).model_copy(
            update=search_meta_by_management_number.get(item.management_number, {})
        )
        for item in items
    ]


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
