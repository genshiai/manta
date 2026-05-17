from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ....db import get_db
from ....security import get_current_user
from ...auth.models import User
from ...common.audit import log_audit
from ...common.time import utcnow
from ...inpatient.services import add_inpatient_event
from ...karte.services import get_patient_or_404
from ...rececon.models import ClaimDraft, ClaimDraftLine, ClaimReviewIssue
from ...rececon.schemas import ClaimTransmissionRead
from .client import build_orca_claim_payload, submit_orca_claim


router = APIRouter()


@router.get("/api/claim-drafts/{claim_draft_id}/transmissions/orca/preview", response_model=dict[str, object])
def preview_claim_draft_orca_payload(
    claim_draft_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    draft = db.get(ClaimDraft, claim_draft_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim draft not found")
    patient = get_patient_or_404(db, draft.patient_id)
    lines = db.scalars(
        select(ClaimDraftLine)
        .where(ClaimDraftLine.claim_draft_id == draft.id)
        .order_by(ClaimDraftLine.id)
    ).all()
    payload = build_orca_claim_payload(draft, patient, lines)
    open_issues = db.scalars(
        select(ClaimReviewIssue).where(
            ClaimReviewIssue.claim_draft_id == draft.id,
            ClaimReviewIssue.status == "open",
        )
    ).all()
    claim_payload = payload.get("claim", {})
    summary = claim_payload.get("summary", {}) if isinstance(claim_payload, dict) else {}
    unresolved_count = summary.get("unresolved_count", 0) if isinstance(summary, dict) else 0
    open_error_count = sum(1 for issue in open_issues if issue.severity == "error")
    open_warning_count = sum(1 for issue in open_issues if issue.severity == "warning")
    payload["validation"] = {
        "can_submit": open_error_count == 0 and unresolved_count == 0,
        "open_error_count": open_error_count,
        "open_warning_count": open_warning_count,
        "unresolved_count": unresolved_count,
    }
    return payload


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
