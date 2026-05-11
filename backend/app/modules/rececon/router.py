from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select, true as sa_true
from sqlalchemy.orm import Session

from ...db import get_db
from ...models import (
    ClaimDraft,
    FacilityClaimRule,
    InpatientDischargePlan,
    InpatientInstruction,
    LabOrder,
    PrescriptionOrder,
    User,
)
from ...schemas import (
    ClaimDraftRead,
    ClaimDraftUpdateRequest,
    ClaimTransmissionRead,
)
from ...security import get_current_user
from ..common.audit import log_audit
from ..common.time import utcnow
from ..gateway.orca.client import submit_orca_claim
from ..inpatient.services import (
    add_inpatient_event,
    build_discharge_plan_defaults,
    get_admission_or_404,
)
from ..karte.services import get_patient_or_404
from .services import (
    build_claim_draft_lines,
    build_claim_review_issues,
    build_claim_rule_adjustments,
    claim_draft_to_read,
    claim_total_points,
)


router = APIRouter()


@router.get("/api/inpatient/admissions/{admission_id}/claim-draft", response_model=ClaimDraftRead | None)
def get_inpatient_claim_draft(
    admission_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClaimDraftRead | None:
    get_admission_or_404(db, admission_id)
    draft = db.scalar(
        select(ClaimDraft)
        .where(ClaimDraft.admission_id == admission_id)
        .order_by(desc(ClaimDraft.updated_at), desc(ClaimDraft.id))
    )
    if draft is None:
        return None
    return claim_draft_to_read(db, draft)


@router.post(
    "/api/inpatient/admissions/{admission_id}/claim-draft",
    response_model=ClaimDraftRead,
    status_code=status.HTTP_201_CREATED,
)
def create_inpatient_claim_draft(
    admission_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClaimDraftRead:
    admission = get_admission_or_404(db, admission_id)
    patient = get_patient_or_404(db, admission.patient_id)
    plan = db.scalar(
        select(InpatientDischargePlan)
        .where(InpatientDischargePlan.admission_id == admission_id)
        .order_by(desc(InpatientDischargePlan.updated_at), desc(InpatientDischargePlan.id))
    )
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
    if plan is None:
        _, candidates, _ = build_discharge_plan_defaults(
            db,
            admission=admission,
            prescriptions=prescriptions,
            instructions=instructions,
            lab_orders=lab_orders,
        )
    else:
        candidates = plan.billing_candidates
    draft = ClaimDraft(
        patient_id=admission.patient_id,
        admission_id=admission_id,
        status="draft",
        source_type="inpatient_discharge",
        billing_candidates=candidates,
        total_points=claim_total_points(candidates, admission),
        created_by=current_user.display_name,
    )
    db.add(draft)
    db.flush()
    lines = build_claim_draft_lines(
        claim_draft_id=draft.id,
        admission=admission,
        candidates=candidates,
        prescriptions=prescriptions,
        instructions=instructions,
        lab_orders=lab_orders,
    )
    draft.total_points = sum(line.points * line.quantity for line in lines)
    for line in lines:
        db.add(line)
    db.flush()
    for issue in build_claim_review_issues(
        db=db,
        claim_draft_id=draft.id,
        admission=admission,
        patient=patient,
        candidates=candidates,
        prescriptions=prescriptions,
        instructions=instructions,
        lab_orders=lab_orders,
    ):
        db.add(issue)
    rules = db.scalars(
        select(FacilityClaimRule)
        .where(FacilityClaimRule.is_active == sa_true())
        .order_by(FacilityClaimRule.sort_order, FacilityClaimRule.id)
    ).all()
    adjustments, rule_issues = build_claim_rule_adjustments(
        claim_draft_id=draft.id,
        patient=patient,
        lines=lines,
        rules=rules,
    )
    for adjustment in adjustments:
        db.add(adjustment)
    for issue in rule_issues:
        db.add(issue)
    add_inpatient_event(
        db,
        admission_id=admission_id,
        event_type="claim_draft_created",
        title="請求ドラフト作成",
        detail=f"候補 {len(candidates)}件 / 合計 {draft.total_points}点",
        actor=current_user.display_name,
    )
    log_audit(
        db,
        actor=current_user.display_name,
        action="請求ドラフト作成",
        scope="billing",
        detail=f"退院計画から請求ドラフトを作成しました。候補 {len(candidates)}件。",
        patient=patient,
    )
    db.commit()
    db.refresh(draft)
    return claim_draft_to_read(db, draft)


@router.patch("/api/claim-drafts/{claim_draft_id}", response_model=ClaimDraftRead)
def update_claim_draft(
    claim_draft_id: int,
    payload: ClaimDraftUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClaimDraftRead:
    draft = db.get(ClaimDraft, claim_draft_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim draft not found")
    patient = get_patient_or_404(db, draft.patient_id)
    draft.status = payload.status
    draft.updated_at = utcnow()
    if draft.admission_id is not None:
        add_inpatient_event(
            db,
            admission_id=draft.admission_id,
            event_type="claim_draft_updated",
            title="請求ドラフト更新",
            detail=f"状態: {payload.status}",
            actor=current_user.display_name,
        )
    log_audit(
        db,
        actor=current_user.display_name,
        action="請求ドラフト更新",
        scope="billing",
        detail=f"請求ドラフトを {payload.status} に更新しました。",
        patient=patient,
    )
    db.commit()
    db.refresh(draft)
    return claim_draft_to_read(db, draft)


@router.post(
    "/api/claim-drafts/{claim_draft_id}/transmissions/orca",
    response_model=ClaimTransmissionRead,
    status_code=status.HTTP_201_CREATED,
)
def submit_claim_draft_to_orca(
    claim_draft_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClaimTransmissionRead:
    draft = db.get(ClaimDraft, claim_draft_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim draft not found")
    patient = get_patient_or_404(db, draft.patient_id)
    transmission = submit_orca_claim(db, draft=draft, patient=patient, current_user=current_user)
    db.add(transmission)
    draft.updated_at = utcnow()
    if draft.admission_id is not None:
        add_inpatient_event(
            db,
            admission_id=draft.admission_id,
            event_type="claim_orca_transmission",
            title="ORCA送信試行",
            detail=f"adapter=orca / status={transmission.status}",
            actor=current_user.display_name,
        )
    log_audit(
        db,
        actor=current_user.display_name,
        action="ORCA送信試行",
        scope="billing",
        detail=f"請求ドラフト {draft.id} を ORCA adapter に送信しました。status={transmission.status}",
        patient=patient,
    )
    db.commit()
    db.refresh(transmission)
    return transmission
