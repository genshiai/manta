from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select, true as sa_true
from sqlalchemy.orm import Session

from ...db import get_db
from ...security import get_current_user
from ..auth.models import User
from ..common.audit import log_audit
from ..common.time import utcnow
from ..inpatient.models import InpatientDischargePlan, InpatientInstruction
from ..inpatient.services import (
    add_inpatient_event,
    build_discharge_plan_defaults,
    get_admission_or_404,
)
from ..karte.models import LabOrder, PrescriptionOrder
from ..karte.services import get_patient_or_404
from .models import ClaimDraft, ClaimLineAdjustment, FacilityClaimRule
from .schemas import ClaimDraftRead, ClaimDraftUpdateRequest, ClaimLineAdjustmentUpdateRequest
from .services import (
    build_claim_draft_lines,
    build_claim_review_issues,
    build_claim_rule_adjustments,
    claim_draft_to_read,
    claim_total_points,
    recalculate_claim_draft_total_points,
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
        db=db,
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


@router.patch("/api/claim-line-adjustments/{adjustment_id}", response_model=ClaimDraftRead)
def update_claim_line_adjustment(
    adjustment_id: int,
    payload: ClaimLineAdjustmentUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClaimDraftRead:
    adjustment = db.get(ClaimLineAdjustment, adjustment_id)
    if adjustment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim line adjustment not found")
    draft = db.get(ClaimDraft, adjustment.claim_draft_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim draft not found")

    patient = get_patient_or_404(db, draft.patient_id)
    adjustment.status = payload.status
    db.flush()
    draft.total_points = recalculate_claim_draft_total_points(db, draft.id)
    draft.updated_at = utcnow()
    if draft.admission_id is not None:
        status_label = "採用" if payload.status == "accepted" else "無視" if payload.status == "ignored" else "提案へ戻す"
        add_inpatient_event(
            db,
            admission_id=draft.admission_id,
            event_type="claim_adjustment_updated",
            title="請求点数調整",
            detail=f"{status_label}: {adjustment.reason} ({adjustment.points_delta:+}点)",
            actor=current_user.display_name,
        )
    log_audit(
        db,
        actor=current_user.display_name,
        action="請求点数調整",
        scope="billing",
        detail=f"{adjustment.reason} を {payload.status} に更新しました。合計 {draft.total_points}点。",
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
