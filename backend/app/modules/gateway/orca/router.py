from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from ....db import get_db
from ....security import get_current_user
from ...auth.models import User
from ...common.audit import log_audit
from ...common.time import utcnow
from ...inpatient.services import add_inpatient_event
from ...karte.services import get_patient_or_404
from ...rececon.models import ClaimDraft, ClaimDraftLine, ClaimReturnEvent, ClaimReviewIssue
from ...rececon.router import create_return_event_from_transmission
from ...rececon.schemas import ClaimTransmissionRead
from .client import build_orca_claim_payload, normalize_orca_response, submit_orca_claim
from .models import OrcaAdapterSetting, OrcaResponseSample
from .schemas import (
    OrcaResponseAnalysisRead,
    OrcaResponseAnalysisRequest,
    OrcaResponseMappingDiffRead,
    OrcaResponseSampleCreateRequest,
    OrcaResponseSampleEventRequest,
    OrcaResponseSampleRead,
)


router = APIRouter()


def _current_orca_mappings(db: Session) -> list[dict[str, object]]:
    setting = db.get(OrcaAdapterSetting, "default")
    return setting.response_mappings if setting and setting.response_mappings else []


def _analyze_orca_response(
    *,
    status_code: int,
    payload: dict[str, object],
    mappings: list[dict[str, object]],
) -> OrcaResponseAnalysisRead:
    normalized = normalize_orca_response(status_code, payload, mappings)
    reasons = normalized.get("reasons", [])
    reason_count = len(reasons) if isinstance(reasons, list) else 0
    mapped_reason_count = 0
    if isinstance(reasons, list):
        mapped_reason_count = sum(1 for reason in reasons if isinstance(reason, dict) and reason.get("category"))
    return OrcaResponseAnalysisRead(
        status_code=status_code,
        normalized=normalized,
        reason_count=reason_count,
        mapping_count=mapped_reason_count,
    )


def _reason_key(reason: dict[str, object]) -> str:
    return "|".join(
        [
            str(reason.get("message") or ""),
            str(reason.get("reason_code") or ""),
            str(reason.get("severity") or ""),
        ]
    )


def _orca_reason_diff(
    baseline: OrcaResponseAnalysisRead,
    candidate: OrcaResponseAnalysisRead,
) -> OrcaResponseMappingDiffRead:
    baseline_reasons = [
        reason
        for reason in baseline.normalized.get("reasons", [])
        if isinstance(reason, dict)
    ]
    candidate_reasons = [
        reason
        for reason in candidate.normalized.get("reasons", [])
        if isinstance(reason, dict)
    ]
    baseline_by_message = {str(reason.get("message") or ""): reason for reason in baseline_reasons}
    candidate_by_message = {str(reason.get("message") or ""): reason for reason in candidate_reasons}
    baseline_keys = {_reason_key(reason) for reason in baseline_reasons}
    candidate_keys = {_reason_key(reason) for reason in candidate_reasons}
    changed_reasons: list[dict[str, object]] = []
    for message, candidate_reason in candidate_by_message.items():
        baseline_reason = baseline_by_message.get(message)
        if baseline_reason is None:
            continue
        if (
            baseline_reason.get("reason_code") != candidate_reason.get("reason_code")
            or baseline_reason.get("severity") != candidate_reason.get("severity")
            or baseline_reason.get("category") != candidate_reason.get("category")
        ):
            changed_reasons.append({"message": message, "before": baseline_reason, "after": candidate_reason})
    return OrcaResponseMappingDiffRead(
        baseline=baseline,
        candidate=candidate,
        added_reasons=[reason for reason in candidate_reasons if _reason_key(reason) not in baseline_keys],
        removed_reasons=[reason for reason in baseline_reasons if _reason_key(reason) not in candidate_keys],
        changed_reasons=changed_reasons,
        summary={
            "baseline_mapping_count": baseline.mapping_count,
            "candidate_mapping_count": candidate.mapping_count,
            "mapping_count_delta": candidate.mapping_count - baseline.mapping_count,
            "baseline_status": baseline.normalized.get("status"),
            "candidate_status": candidate.normalized.get("status"),
        },
    )


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


@router.get("/api/claim-drafts/{claim_draft_id}/transmissions/orca/dry-run", response_model=dict[str, object])
def dry_run_claim_draft_orca_payload(
    claim_draft_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    payload = preview_claim_draft_orca_payload(claim_draft_id, current_user, db)
    validation = payload.get("validation", {})
    claim_payload = payload.get("claim", {})
    items = claim_payload.get("items", []) if isinstance(claim_payload, dict) else []
    payload["dry_run"] = {
        "checked_by": current_user.display_name,
        "mapping_count": len(_current_orca_mappings(db)),
        "line_count": len(items) if isinstance(items, list) else 0,
        "blocking": not bool(validation.get("can_submit")) if isinstance(validation, dict) else True,
    }
    return payload


@router.post("/api/orca/response/analyze", response_model=OrcaResponseAnalysisRead)
def analyze_orca_response(
    payload: OrcaResponseAnalysisRequest,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrcaResponseAnalysisRead:
    return _analyze_orca_response(
        status_code=payload.status_code,
        payload=payload.payload,
        mappings=payload.response_mappings if payload.response_mappings is not None else _current_orca_mappings(db),
    )


@router.post("/api/orca/response-mappings/test", response_model=OrcaResponseAnalysisRead)
def test_orca_response_mappings(
    payload: OrcaResponseAnalysisRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrcaResponseAnalysisRead:
    if current_user.role != "管理者":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="ORCA mapping test requires admin role")
    return _analyze_orca_response(
        status_code=payload.status_code,
        payload=payload.payload,
        mappings=payload.response_mappings or [],
    )


@router.post("/api/orca/response-mappings/diff", response_model=OrcaResponseMappingDiffRead)
def diff_orca_response_mappings(
    payload: OrcaResponseAnalysisRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrcaResponseMappingDiffRead:
    if current_user.role != "管理者":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="ORCA mapping diff requires admin role")
    baseline = _analyze_orca_response(
        status_code=payload.status_code,
        payload=payload.payload,
        mappings=_current_orca_mappings(db),
    )
    candidate = _analyze_orca_response(
        status_code=payload.status_code,
        payload=payload.payload,
        mappings=payload.response_mappings or [],
    )
    return _orca_reason_diff(baseline, candidate)


@router.get("/api/orca/response-samples", response_model=list[OrcaResponseSampleRead])
def list_orca_response_samples(
    limit: int = 40,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[OrcaResponseSampleRead]:
    return db.scalars(select(OrcaResponseSample).order_by(desc(OrcaResponseSample.created_at)).limit(limit)).all()


@router.post("/api/orca/response-samples", response_model=OrcaResponseSampleRead, status_code=status.HTTP_201_CREATED)
def create_orca_response_sample(
    payload: OrcaResponseSampleCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrcaResponseSampleRead:
    analysis = _analyze_orca_response(
        status_code=payload.status_code,
        payload=payload.payload,
        mappings=payload.response_mappings if payload.response_mappings is not None else _current_orca_mappings(db),
    )
    sample = OrcaResponseSample(
        claim_draft_id=payload.claim_draft_id,
        name=payload.name.strip() or "ORCA response sample",
        status_code=payload.status_code,
        payload=payload.payload,
        normalized=analysis.normalized,
        created_by=current_user.display_name,
    )
    db.add(sample)
    log_audit(
        db,
        actor=current_user.display_name,
        action="ORCAレスポンスサンプル保存",
        scope="billing",
        detail=f"{sample.name} / status={analysis.normalized.get('status')}",
    )
    db.commit()
    db.refresh(sample)
    return sample


@router.post("/api/orca/response-samples/{sample_id}/return-event", response_model=dict[str, object])
def create_return_event_from_orca_sample(
    sample_id: int,
    payload: OrcaResponseSampleEventRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    sample = db.get(OrcaResponseSample, sample_id)
    if sample is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORCA response sample not found")
    draft = db.get(ClaimDraft, payload.claim_draft_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim draft not found")
    patient = get_patient_or_404(db, draft.patient_id)
    normalized = sample.normalized or {}
    reasons = normalized.get("reasons", [])
    message = " / ".join(str(reason.get("message", "")) for reason in reasons[:5] if isinstance(reason, dict))
    first_reason = reasons[0] if isinstance(reasons, list) and reasons and isinstance(reasons[0], dict) else {}
    event = ClaimReturnEvent(
        claim_draft_id=draft.id,
        event_type="assessment" if first_reason.get("reason_code") == "assessment" else "return",
        severity="error" if first_reason.get("severity") == "error" else "warning",
        status="open",
        title=payload.title.strip() or "ORCAレスポンスサンプル解析",
        message=message or str(normalized.get("error_message") or "ORCAレスポンスサンプルの確認が必要です。"),
        reason_code=str(first_reason.get("reason_code") or normalized.get("status") or "orca_sample"),
        payer="ORCA",
        raw_payload={"sample_id": sample.id, "payload": sample.payload, "normalized": normalized},
        created_by=current_user.display_name,
    )
    db.add(event)
    log_audit(
        db,
        actor=current_user.display_name,
        action="ORCAサンプル返戻査定イベント化",
        scope="billing",
        detail=f"sample={sample.id} / claim_draft={draft.id}",
        patient=patient,
    )
    db.commit()
    db.refresh(event)
    return {"event_id": event.id, "claim_draft_id": draft.id, "reason_code": event.reason_code}


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
    db.flush()
    create_return_event_from_transmission(
        db,
        draft=draft,
        transmission=transmission,
        actor=current_user.display_name,
    )
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
