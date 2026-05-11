from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, or_, select, true as sa_true
from sqlalchemy.orm import Session

from ...db import get_db
from ..auth.models import User
from ..karte.models import LabOrder, Observation, Patient, PrescriptionOrder
from .models import (
    Admission,
    BedMaster,
    InpatientAiSummaryReview,
    InpatientDischargePlan,
    InpatientDocument,
    InpatientEvent,
    InpatientInstruction,
    InpatientPathwayAssignment,
    InpatientPathwayMaster,
    InpatientPathwayTask,
    InpatientPathwayTaskMaster,
    NursingNote,
    WardMaster,
)
from ...security import get_current_user
from ..common.audit import log_audit
from ..common.time import TOKYO_TZ, utcnow
from ..karte.services import get_patient_or_404
from .schemas import (
    AdmissionCreateRequest,
    AdmissionDischargeRequest,
    AdmissionRead,
    AdmissionTransferRequest,
    BedBoardItemRead,
    BedStatusUpdateRequest,
    InpatientAiSummaryReviewCreateRequest,
    InpatientAiSummaryReviewRead,
    InpatientDischargePlanRead,
    InpatientDischargePlanUpdateRequest,
    InpatientDocumentCreateRequest,
    InpatientDocumentRead,
    InpatientDocumentUpdateRequest,
    InpatientEventRead,
    InpatientInstructionCreateRequest,
    InpatientInstructionRead,
    InpatientInstructionUpdateRequest,
    InpatientPathwayCreateRequest,
    InpatientPathwayMasterRead,
    InpatientPathwayRead,
    InpatientPathwayTaskRead,
    InpatientPathwayTaskUpdateRequest,
    InpatientProgressRead,
    InpatientSummaryDraftRead,
    NursingNoteCreateRequest,
    NursingNoteRead,
)
from .services import (
    INPATIENT_DOCUMENT_TITLES,
    STANDARD_PATHWAY_TASKS,
    add_inpatient_event,
    admission_to_read,
    bed_board_item_to_read,
    build_discharge_plan_defaults,
    build_inpatient_document_body,
    build_inpatient_progress,
    build_inpatient_summary_draft,
    get_admission_or_404,
    get_bed_or_404,
    get_inpatient_document_or_404,
    get_inpatient_instruction_or_404,
    get_inpatient_pathway_task_or_404,
    get_pathway_master_or_404,
    get_ward_or_404,
    inpatient_pathway_master_to_read,
    inpatient_pathway_to_read,
)


router = APIRouter()


@router.get("/api/inpatient/beds", response_model=list[BedBoardItemRead])
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


@router.patch("/api/inpatient/beds/{bed_id}", response_model=BedBoardItemRead)
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


@router.get("/api/inpatient/admissions", response_model=list[AdmissionRead])
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


@router.post("/api/patients/{patient_id}/admissions", response_model=AdmissionRead, status_code=status.HTTP_201_CREATED)
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


@router.post("/api/inpatient/admissions/{admission_id}/transfer", response_model=AdmissionRead)
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


@router.post("/api/inpatient/admissions/{admission_id}/permit-discharge", response_model=AdmissionRead)
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


@router.post("/api/inpatient/admissions/{admission_id}/discharge", response_model=AdmissionRead)
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


@router.get("/api/inpatient/admissions/{admission_id}/instructions", response_model=list[InpatientInstructionRead])
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


@router.get("/api/inpatient/admissions/{admission_id}/progress", response_model=InpatientProgressRead)
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


@router.get("/api/inpatient/admissions/{admission_id}/summary-draft", response_model=InpatientSummaryDraftRead)
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


@router.get("/api/inpatient/admissions/{admission_id}/events", response_model=list[InpatientEventRead])
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


@router.get("/api/inpatient/admissions/{admission_id}/pathway", response_model=InpatientPathwayRead | None)
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


@router.get("/api/inpatient/pathway-masters", response_model=list[InpatientPathwayMasterRead])
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


@router.post(
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


@router.patch("/api/inpatient/pathway-tasks/{task_id}", response_model=InpatientPathwayTaskRead)
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


@router.post(
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


@router.patch("/api/inpatient/instructions/{instruction_id}", response_model=InpatientInstructionRead)
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


@router.get("/api/inpatient/admissions/{admission_id}/nursing-notes", response_model=list[NursingNoteRead])
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


@router.post(
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


@router.get("/api/inpatient/admissions/{admission_id}/documents", response_model=list[InpatientDocumentRead])
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


@router.post(
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


@router.patch("/api/inpatient/documents/{document_id}", response_model=InpatientDocumentRead)
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


@router.get("/api/inpatient/admissions/{admission_id}/summary-reviews", response_model=list[InpatientAiSummaryReviewRead])
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


@router.post(
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


@router.get("/api/inpatient/admissions/{admission_id}/discharge-plan", response_model=InpatientDischargePlanRead)
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
    lab_orders = db.scalars(
        select(LabOrder)
        .where(LabOrder.patient_id == admission.patient_id)
        .order_by(desc(LabOrder.created_at))
        .limit(10)
    ).all()
    medication_note, candidates, follow_up = build_discharge_plan_defaults(
        db,
        admission=admission,
        prescriptions=prescriptions,
        instructions=instructions,
        lab_orders=lab_orders,
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


@router.put("/api/inpatient/admissions/{admission_id}/discharge-plan", response_model=InpatientDischargePlanRead)
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
            db,
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
            lab_orders=db.scalars(
                select(LabOrder)
                .where(LabOrder.patient_id == admission.patient_id)
                .order_by(desc(LabOrder.created_at))
                .limit(10)
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
