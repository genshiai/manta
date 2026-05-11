from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from ...db import get_db
from ...security import get_current_user
from ..auth.models import User
from ..common.audit import log_audit
from ..common.models import AuditLog
from ..common.time import TOKYO_TZ
from ..master_data.models import PrescriptionCatalogMaster
from ..master_data.services import get_reservation_slot_master_or_404
from .models import ChartNote, LabOrder, Observation, Patient, PrescriptionOrder, Reservation
from ..master_data.schemas import ChartOrderMasterRead
from .schemas import (
    ChartSaveRequest,
    ChartWorkspaceRead,
    ImagingOrderCreateRequest,
    ImagingOrderItem,
    LabLongTrendItem,
    LabOrderCreateRequest,
    LabOrderRead,
    PatientContextRead,
    PatientContextUpdateRequest,
    PatientStatusUpdateRequest,
    PatientSummaryRead,
    PrescriptionCopyLastRead,
    PrescriptionCopyLastRequest,
    PrescriptionCopyPreviewRead,
    PrescriptionCopySkippedItem,
    PrescriptionCreateRequest,
    PrescriptionHistoryGroupRead,
    PrescriptionRead,
    PrescriptionTimelineGroupRead,
    ProcedureOrderCreateRequest,
    ProcedureOrderItem,
    ReservationRead,
    ReservationUpsertRequest,
)
from .services import (
    build_lab_long_trends,
    build_prescription_copy_preview,
    build_prescription_history,
    build_prescription_timeline,
    build_prescription_safety_warnings,
    build_warning_details,
    catalog_by_drug_name,
    copy_skip_reason,
    get_chart_order_masters_read,
    get_long_term_listed_drug_for_catalog,
    get_patient_or_404,
    get_pmda_interaction_matches,
    get_pmda_interactions_for_catalog,
    get_pmda_sections_for_catalog,
    get_transitional_drugs_for_catalog,
    patient_context_to_read,
    patient_to_read,
    prescription_local_date,
    prescription_today,
    select_copy_source_group,
)


router = APIRouter()


@router.get("/api/masters/chart-order-config", response_model=ChartOrderMasterRead)
def get_chart_order_config(
    include_inactive: bool = Query(default=False),
    department: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChartOrderMasterRead:
    if include_inactive and current_user.role != "管理者":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    return get_chart_order_masters_read(db, include_inactive=include_inactive, department=department)


@router.get("/api/patients", response_model=list[PatientSummaryRead])
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


@router.get("/api/patients/{patient_id}/chart", response_model=ChartWorkspaceRead)
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


@router.get("/api/patients/{patient_id}/lab-trends", response_model=list[LabLongTrendItem])
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


@router.get("/api/patients/{patient_id}/prescription-history", response_model=list[PrescriptionHistoryGroupRead])
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


@router.get("/api/patients/{patient_id}/prescription-timeline", response_model=list[PrescriptionTimelineGroupRead])
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
        catalog_by_drug=catalog_by_drug_name(db),
    )


@router.post("/api/patients/{patient_id}/prescriptions/copy-preview", response_model=PrescriptionCopyPreviewRead)
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
        catalog_by_drug=catalog_by_drug_name(db),
    )


@router.post("/api/patients/{patient_id}/prescriptions/copy-last", response_model=PrescriptionCopyLastRead)
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
    catalog_by_drug = catalog_by_drug_name(db)
    timeline = build_prescription_timeline(
        patient=patient,
        prescriptions=prescriptions,
        catalog_by_drug=catalog_by_drug,
    )
    source_group = select_copy_source_group(timeline, source_date=payload.source_date)

    today = prescription_today()
    todays_drug_names = {
        prescription.drug_name
        for prescription in prescriptions
        if prescription_local_date(prescription) == today
    }
    copied_orders: list[PrescriptionOrder] = []
    skipped_items: list[PrescriptionCopySkippedItem] = []

    for source_item in source_group.items:
        reason = copy_skip_reason(
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


@router.put("/api/patients/{patient_id}/context", response_model=PatientContextRead)
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


@router.post("/api/patients/{patient_id}/chart/save")
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


@router.post("/api/patients/{patient_id}/prescriptions", response_model=PrescriptionRead)
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


@router.post("/api/patients/{patient_id}/lab-orders", response_model=LabOrderRead)
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


@router.post("/api/patients/{patient_id}/imaging-orders", response_model=ImagingOrderItem)
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


@router.post("/api/patients/{patient_id}/procedure-orders", response_model=ProcedureOrderItem)
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


@router.post("/api/patients/{patient_id}/reservation", response_model=ReservationRead)
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


@router.post("/api/patients/{patient_id}/status", response_model=PatientSummaryRead)
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
