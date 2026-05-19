from __future__ import annotations

from datetime import datetime, timedelta, timezone
import csv
from io import StringIO

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import desc, func, or_, select, true as sa_true
from sqlalchemy.orm import Session

from ...db import get_db
from ...security import get_current_user
from ..auth.models import User
from ..common.audit import log_audit
from ..common.time import utcnow
from ..inpatient.models import Admission, InpatientDischargePlan, InpatientInstruction
from ..inpatient.services import (
    add_inpatient_event,
    build_discharge_plan_defaults,
    get_admission_or_404,
)
from ..karte.models import LabOrder, Patient, PrescriptionOrder
from ..karte.services import get_patient_or_404
from ..master_data.models import ReceiptMedicalPracticeMaster
from .models import (
    ClaimDraft,
    ClaimDraftLine,
    ClaimLineAdjustment,
    ClaimReturnEvent,
    ClaimReviewIssue,
    ClaimSlaSetting,
    ClaimTransmission,
    FacilityClaimRule,
    MonthlyClaimClose,
)
from .schemas import (
    ClaimDraftLineReceiptCodeUpdateRequest,
    ClaimDraftRead,
    ClaimDraftSummaryRead,
    ClaimDraftUpdateRequest,
    ClaimLineAdjustmentUpdateRequest,
    ClaimReturnEventCreateRequest,
    ClaimReturnAnalyticsComparisonRead,
    ClaimReturnAnalyticsRead,
    ClaimReturnEventAssignRequest,
    ClaimReturnAssigneeSlaRead,
    ClaimReturnReasonBucketRead,
    ClaimReturnReasonDeltaRead,
    ClaimReturnSlaAlertRead,
    ClaimReturnSlaEscalationRead,
    ClaimReturnSlaEscalationRequest,
    ClaimSlaNotificationDryRunRead,
    ClaimSlaSettingRead,
    ClaimSlaSettingUpdateRequest,
    ClaimReturnSlaSummaryRead,
    ClaimReturnTrendPointRead,
    ClaimReturnEventRead,
    ClaimReturnEventSummaryRead,
    ClaimReturnEventUpdateRequest,
    ClaimTransmissionSummaryRead,
    MonthlyCloseBucketRead,
    MonthlyCloseSummaryRead,
    MonthlyClaimCloseApprovalRequest,
    MonthlyClaimCloseCancelRequest,
    MonthlyClaimCloseRead,
    MonthlyClaimCloseRequest,
    ReceiptCodeCandidateRead,
)
from .services import (
    build_claim_draft_lines,
    build_claim_line_code_issues,
    build_claim_review_issues,
    build_claim_rule_adjustments,
    claim_draft_to_read,
    claim_total_points,
    recalculate_claim_draft_total_points,
)


router = APIRouter()


def _default_sla_destinations() -> list[dict[str, object]]:
    return [
        {"type": "in_app", "label": "医事管理者", "target": "billing-admin"},
        {"type": "audit", "label": "監査ログ", "target": "billing"},
    ]


def _default_sla_rules() -> list[dict[str, object]]:
    return [
        {"severity": "overdue", "assignee": "管理者", "include_due_soon": False},
        {"severity": "due_soon", "assignee": "管理者", "include_due_soon": True},
    ]


def _get_or_create_sla_setting(db: Session) -> ClaimSlaSetting:
    setting = db.get(ClaimSlaSetting, "default")
    if setting is not None:
        return setting
    setting = ClaimSlaSetting(
        id="default",
        due_soon_hours=48,
        include_no_due=True,
        escalation_assignee="管理者",
        notify_destinations=_default_sla_destinations(),
        escalation_rules=_default_sla_rules(),
        updated_by="system",
    )
    db.add(setting)
    db.flush()
    return setting


def _month_range(month: str) -> tuple[datetime, datetime]:
    try:
        start = datetime.strptime(f"{month}-01", "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="month must be YYYY-MM") from exc
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end


def _line_code_issue_evidence(line: ClaimDraftLine) -> str:
    return f"{line.line_type} / {line.source_type} / source_id={line.source_id or '-'}"


def _resolve_receipt_code_issues(db: Session, *, draft_id: int, line: ClaimDraftLine) -> None:
    issue_types = {"claim_line_unresolved_receipt_code", "missing_receipt_code"}
    evidence = _line_code_issue_evidence(line)
    issues = db.scalars(
        select(ClaimReviewIssue).where(
            ClaimReviewIssue.claim_draft_id == draft_id,
            ClaimReviewIssue.status == "open",
            ClaimReviewIssue.issue_type.in_(issue_types),
        )
    ).all()
    remaining_missing_lines = db.scalars(
        select(ClaimDraftLine).where(
            ClaimDraftLine.claim_draft_id == draft_id,
            ClaimDraftLine.id != line.id,
            ClaimDraftLine.receipt_code.is_(None),
        )
    ).all()
    for issue in issues:
        if issue.issue_type == "claim_line_unresolved_receipt_code" and issue.evidence == evidence:
            issue.status = "resolved"
        elif issue.issue_type == "missing_receipt_code" and not remaining_missing_lines:
            issue.status = "resolved"


def _sync_claim_draft_code_issues(db: Session, draft: ClaimDraft) -> list[ClaimDraftLine]:
    lines = db.scalars(
        select(ClaimDraftLine).where(ClaimDraftLine.claim_draft_id == draft.id).order_by(ClaimDraftLine.id)
    ).all()
    existing_code_issues = db.scalars(
        select(ClaimReviewIssue).where(
            ClaimReviewIssue.claim_draft_id == draft.id,
            ClaimReviewIssue.issue_type == "claim_line_unresolved_receipt_code",
        )
    ).all()
    open_issue_evidence = {issue.evidence for issue in existing_code_issues if issue.status == "open"}

    for line in lines:
        evidence = _line_code_issue_evidence(line)
        if line.receipt_code:
            for issue in existing_code_issues:
                if issue.evidence == evidence and issue.status == "open":
                    issue.status = "resolved"
            continue
        if evidence not in open_issue_evidence:
            db.add(
                ClaimReviewIssue(
                    claim_draft_id=draft.id,
                    issue_type="claim_line_unresolved_receipt_code",
                    severity="error",
                    message=f"{line.label} のレセ電コードが未解決です。",
                    evidence=evidence,
                )
            )
            open_issue_evidence.add(evidence)

    if all(line.receipt_code for line in lines):
        for issue in db.scalars(
            select(ClaimReviewIssue).where(
                ClaimReviewIssue.claim_draft_id == draft.id,
                ClaimReviewIssue.issue_type == "missing_receipt_code",
                ClaimReviewIssue.status == "open",
            )
        ).all():
            issue.status = "resolved"

    db.flush()
    open_error_count = db.scalar(
        select(ClaimReviewIssue)
        .where(
            ClaimReviewIssue.claim_draft_id == draft.id,
            ClaimReviewIssue.status == "open",
            ClaimReviewIssue.severity == "error",
        )
        .limit(1)
    )
    draft.total_points = recalculate_claim_draft_total_points(db, draft.id)
    if draft.status != "submitted":
        draft.status = "error" if open_error_count is not None else "ready"
    draft.updated_at = utcnow()
    return lines


def _receipt_candidate_to_read(item: ReceiptMedicalPracticeMaster) -> ReceiptCodeCandidateRead:
    return ReceiptCodeCandidateRead(
        receipt_code=item.receipt_code,
        receipt_name=item.name,
        points=item.points,
        unit=item.unit_name,
        category=item.category,
    )


def _build_monthly_close_summary(db: Session, month: str) -> MonthlyCloseSummaryRead:
    start, end = _month_range(month)
    drafts = db.scalars(
        select(ClaimDraft)
        .where(ClaimDraft.created_at >= start, ClaimDraft.created_at < end)
        .order_by(ClaimDraft.updated_at.desc(), ClaimDraft.id.desc())
    ).all()
    draft_ids = [draft.id for draft in drafts]
    close = db.get(MonthlyClaimClose, month)
    if not draft_ids:
        return MonthlyCloseSummaryRead(
            month=month,
            claim_count=0,
            total_points=0,
            unsubmitted_count=0,
            submitted_count=0,
            open_return_count=0,
            assessment_count=0,
            reclaim_waiting_count=0,
            unresolved_issue_count=0,
            assignee_buckets=[],
            status_buckets=[],
            close=MonthlyClaimCloseRead.model_validate(close) if close else None,
        )

    open_return_events = db.scalars(
        select(ClaimReturnEvent).where(
            ClaimReturnEvent.claim_draft_id.in_(draft_ids),
            ClaimReturnEvent.status.in_(["open", "in_progress"]),
        )
    ).all()
    unresolved_issue_count = db.scalar(
        select(func.count(ClaimReviewIssue.id)).where(
            ClaimReviewIssue.claim_draft_id.in_(draft_ids),
            ClaimReviewIssue.status == "open",
        )
    ) or 0
    status_buckets = [
        MonthlyCloseBucketRead(
            key=status_key,
            label=status_key,
            count=len([draft for draft in drafts if draft.status == status_key]),
            total_points=sum(draft.total_points for draft in drafts if draft.status == status_key),
        )
        for status_key in ["draft", "reviewed", "ready", "submitted", "error"]
    ]
    assignee_map: dict[str, int] = {}
    for event in open_return_events:
        key = event.assignee or "未割当"
        assignee_map[key] = assignee_map.get(key, 0) + 1
    return MonthlyCloseSummaryRead(
        month=month,
        claim_count=len(drafts),
        total_points=sum(draft.total_points for draft in drafts),
        unsubmitted_count=len([draft for draft in drafts if draft.status != "submitted"]),
        submitted_count=len([draft for draft in drafts if draft.status == "submitted"]),
        open_return_count=len([event for event in open_return_events if event.event_type == "return"]),
        assessment_count=len([event for event in open_return_events if event.event_type == "assessment"]),
        reclaim_waiting_count=len(open_return_events),
        unresolved_issue_count=int(unresolved_issue_count),
        assignee_buckets=[
            MonthlyCloseBucketRead(key=key, label=key, count=count, total_points=0)
            for key, count in sorted(assignee_map.items())
        ],
        status_buckets=status_buckets,
        close=MonthlyClaimCloseRead.model_validate(close) if close else None,
    )


@router.get("/api/billing/monthly-close", response_model=MonthlyCloseSummaryRead)
def get_monthly_close_summary(
    month: str,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MonthlyCloseSummaryRead:
    return _build_monthly_close_summary(db, month)


@router.get("/api/billing/monthly-close/{month}/report", response_model=dict[str, object])
def get_monthly_close_report(
    month: str,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    summary = _build_monthly_close_summary(db, month)
    analytics = _build_claim_return_event_analytics(db, month)
    transmissions = list_claim_transmissions(month=month, status_filter="all", search="", reclaim_only=False, limit=200, _=_, db=db)
    return {
        "month": month,
        "generated_at": utcnow().isoformat(),
        "summary": summary.model_dump(mode="json"),
        "return_analytics": analytics.model_dump(mode="json"),
        "transmission_count": len(transmissions),
        "reclaim_count": len([item for item in transmissions if item.is_reclaim]),
        "accepted_count": len([item for item in transmissions if item.status == "accepted"]),
        "rejected_or_error_count": len([item for item in transmissions if item.status in {"rejected", "error"}]),
        "transmissions": [item.model_dump(mode="json") for item in transmissions],
    }


def _apply_monthly_close_snapshot(
    close: MonthlyClaimClose,
    *,
    summary: MonthlyCloseSummaryRead,
    actor: str,
) -> None:
    close.claim_count = summary.claim_count
    close.total_points = summary.total_points
    close.unsubmitted_count = summary.unsubmitted_count
    close.open_return_count = summary.reclaim_waiting_count
    close.unresolved_issue_count = summary.unresolved_issue_count
    close.snapshot = summary.model_dump(mode="json", exclude={"close"})
    close.closed_by = actor
    close.closed_at = utcnow()
    close.updated_at = utcnow()


def _monthly_close_blocker_count(summary: MonthlyCloseSummaryRead) -> int:
    return summary.unsubmitted_count + summary.reclaim_waiting_count + summary.unresolved_issue_count


@router.post("/api/billing/monthly-close/{month}/request-close", response_model=MonthlyClaimCloseRead)
def request_monthly_claim_close(
    month: str,
    payload: MonthlyClaimCloseRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MonthlyClaimCloseRead:
    summary = _build_monthly_close_summary(db, month)
    if summary.close and summary.close.status == "closed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Monthly close already closed")
    blockers = _monthly_close_blocker_count(summary)
    if blockers > 0 and not payload.force:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Monthly close has unresolved blockers")
    close = db.get(MonthlyClaimClose, month)
    if close is None:
        close = MonthlyClaimClose(month=month, closed_by=current_user.display_name)
        db.add(close)
    _apply_monthly_close_snapshot(close, summary=summary, actor=current_user.display_name)
    close.status = "pending_approval"
    close.requested_by = current_user.display_name
    close.requested_at = utcnow()
    close.approved_by = None
    close.approved_at = None
    close.approval_note = payload.note.strip() if payload.note else None
    close.cancelled_by = None
    close.cancelled_at = None
    close.cancel_reason = None
    log_audit(
        db,
        actor=current_user.display_name,
        action="月次締め承認依頼",
        scope="billing",
        detail=f"{month} の締め承認を依頼しました。請求 {summary.claim_count}件 / {summary.total_points}点。",
    )
    db.commit()
    db.refresh(close)
    return MonthlyClaimCloseRead.model_validate(close)


@router.post("/api/billing/monthly-close/{month}/close", response_model=MonthlyClaimCloseRead)
def close_monthly_claims(
    month: str,
    payload: MonthlyClaimCloseRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MonthlyClaimCloseRead:
    if current_user.role != "管理者":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Monthly close requires admin role")
    summary = _build_monthly_close_summary(db, month)
    if summary.close and summary.close.status == "closed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Monthly close already closed")
    blockers = _monthly_close_blocker_count(summary)
    if blockers > 0 and not payload.force:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Monthly close has unresolved blockers")
    close = db.get(MonthlyClaimClose, month)
    if close is None:
        close = MonthlyClaimClose(month=month, closed_by=current_user.display_name)
        db.add(close)
    _apply_monthly_close_snapshot(close, summary=summary, actor=current_user.display_name)
    close.status = "closed"
    close.requested_by = close.requested_by or current_user.display_name
    close.requested_at = close.requested_at or utcnow()
    close.approved_by = current_user.display_name
    close.approved_at = utcnow()
    close.approval_note = payload.note.strip() if payload.note else close.approval_note
    close.cancelled_by = None
    close.cancelled_at = None
    close.cancel_reason = None
    log_audit(
        db,
        actor=current_user.display_name,
        action="月次締め確定",
        scope="billing",
        detail=f"{month} を確定しました。請求 {summary.claim_count}件 / {summary.total_points}点。",
    )
    db.commit()
    db.refresh(close)
    return MonthlyClaimCloseRead.model_validate(close)


@router.post("/api/billing/monthly-close/{month}/approve", response_model=MonthlyClaimCloseRead)
def approve_monthly_claim_close(
    month: str,
    payload: MonthlyClaimCloseApprovalRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MonthlyClaimCloseRead:
    if current_user.role != "管理者":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Monthly close approval requires admin role")
    close = db.get(MonthlyClaimClose, month)
    if close is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monthly close request not found")
    if close.status == "closed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Monthly close already closed")
    summary = _build_monthly_close_summary(db, month)
    _apply_monthly_close_snapshot(close, summary=summary, actor=current_user.display_name)
    close.status = "closed"
    close.approved_by = current_user.display_name
    close.approved_at = utcnow()
    close.approval_note = payload.note.strip() if payload.note else close.approval_note
    close.cancelled_by = None
    close.cancelled_at = None
    close.cancel_reason = None
    log_audit(
        db,
        actor=current_user.display_name,
        action="月次締め承認",
        scope="billing",
        detail=f"{month} の締め依頼を承認しました。依頼者: {close.requested_by or '-'}。",
    )
    db.commit()
    db.refresh(close)
    return MonthlyClaimCloseRead.model_validate(close)


@router.post("/api/billing/monthly-close/{month}/cancel", response_model=MonthlyClaimCloseRead)
def cancel_monthly_claim_close(
    month: str,
    payload: MonthlyClaimCloseCancelRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MonthlyClaimCloseRead:
    if current_user.role != "管理者":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Monthly close cancel requires admin role")
    close = db.get(MonthlyClaimClose, month)
    if close is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monthly close not found")
    close.status = "cancelled"
    close.cancelled_by = current_user.display_name
    close.cancelled_at = utcnow()
    close.cancel_reason = payload.reason.strip()
    close.updated_at = utcnow()
    log_audit(
        db,
        actor=current_user.display_name,
        action="月次締め取消",
        scope="billing",
        detail=f"{month} を取消しました。理由: {close.cancel_reason}",
    )
    db.commit()
    db.refresh(close)
    return MonthlyClaimCloseRead.model_validate(close)


def claim_return_event_to_summary(
    event: ClaimReturnEvent,
    draft: ClaimDraft,
    patient: Patient,
) -> ClaimReturnEventSummaryRead:
    return ClaimReturnEventSummaryRead(
        id=event.id,
        claim_draft_id=event.claim_draft_id,
        transmission_id=event.transmission_id,
        event_type=event.event_type,
        severity=event.severity,
        status=event.status,
        title=event.title,
        message=event.message,
        reason_code=event.reason_code,
        payer=event.payer,
        received_at=event.received_at,
        due_at=event.due_at,
        assignee=event.assignee,
        resolution_note=event.resolution_note,
        raw_payload=event.raw_payload,
        created_by=event.created_by,
        updated_by=event.updated_by,
        created_at=event.created_at,
        updated_at=event.updated_at,
        patient_id=patient.id,
        patient_name=patient.name,
        patient_kana=patient.kana,
        department=patient.department,
        admission_id=draft.admission_id,
        claim_status=draft.status,
        total_points=draft.total_points,
    )


def claim_transmission_to_summary(
    transmission: ClaimTransmission,
    draft: ClaimDraft,
    patient: Patient,
    transmission_count: int,
) -> ClaimTransmissionSummaryRead:
    return ClaimTransmissionSummaryRead(
        id=transmission.id,
        claim_draft_id=transmission.claim_draft_id,
        adapter=transmission.adapter,
        status=transmission.status,
        request_payload=transmission.request_payload,
        response_payload=transmission.response_payload,
        error_message=transmission.error_message,
        sent_by=transmission.sent_by,
        sent_at=transmission.sent_at,
        created_at=transmission.created_at,
        patient_id=patient.id,
        patient_name=patient.name,
        patient_kana=patient.kana,
        department=patient.department,
        admission_id=draft.admission_id,
        claim_status=draft.status,
        total_points=draft.total_points,
        transmission_count=transmission_count,
        is_reclaim=transmission_count > 1,
    )


def _ensure_return_event_update_allowed(current_user: User, event: ClaimReturnEvent, next_assignee: str | None) -> None:
    if current_user.role == "管理者":
        return
    if event.assignee not in {None, current_user.display_name}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Assigned return event is locked")
    if next_assignee not in {None, current_user.display_name}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot assign return event to another user")


def create_return_event_from_transmission(
    db: Session,
    *,
    draft: ClaimDraft,
    transmission: ClaimTransmission,
    actor: str,
) -> ClaimReturnEvent | None:
    if transmission.status not in {"rejected", "error"}:
        return None
    existing = db.scalar(
        select(ClaimReturnEvent).where(
            ClaimReturnEvent.transmission_id == transmission.id,
            ClaimReturnEvent.status.in_(["open", "in_progress"]),
        )
    )
    if existing is not None:
        return existing
    normalized = transmission.response_payload.get("normalized")
    normalized_reasons = normalized.get("reasons", []) if isinstance(normalized, dict) else []
    reasons = [reason for reason in normalized_reasons if isinstance(reason, dict)]
    if reasons:
        message = " / ".join(str(reason.get("message", "")) for reason in reasons[:5]).strip(" / ")
        reason_code = str(reasons[0].get("reason_code") or transmission.status)
        event_type = "assessment" if any("査定" in str(reason.get("message", "")) for reason in reasons) else "return"
        severity = "error" if any(reason.get("severity") == "error" for reason in reasons) else "warning"
    else:
        response_messages = transmission.response_payload.get("messages", [])
        if isinstance(response_messages, list):
            message = " / ".join(str(item) for item in response_messages[:5]) or transmission.error_message or "送信結果の確認が必要です。"
        else:
            message = transmission.error_message or str(response_messages) or "送信結果の確認が必要です。"
        reason_code = transmission.status
        event_type = "return" if transmission.status == "rejected" else "notice"
        severity = "error" if transmission.status == "error" else "warning"
    event = ClaimReturnEvent(
        claim_draft_id=draft.id,
        transmission_id=transmission.id,
        event_type=event_type,
        severity=severity,
        status="open",
        title="ORCA送信結果の確認",
        message=message,
        reason_code=reason_code,
        payer="ORCA",
        raw_payload=transmission.response_payload,
        created_by=actor,
    )
    db.add(event)
    return event


def _build_claim_return_event_analytics(db: Session, month: str) -> ClaimReturnAnalyticsRead:
    start, end = _month_range(month)
    events = db.scalars(
        select(ClaimReturnEvent)
        .where(ClaimReturnEvent.received_at >= start, ClaimReturnEvent.received_at < end)
        .order_by(desc(ClaimReturnEvent.received_at), desc(ClaimReturnEvent.id))
    ).all()
    reason_map: dict[str, dict[str, object]] = {}
    for event in events:
        key = event.reason_code or event.event_type
        bucket = reason_map.setdefault(
            key,
            {
                "key": key,
                "label": key,
                "event_type": event.event_type,
                "severity": event.severity,
                "count": 0,
                "open_count": 0,
                "resolved_count": 0,
                "latest_received_at": event.received_at,
            },
        )
        bucket["count"] = int(bucket["count"]) + 1
        if event.status in {"open", "in_progress"}:
            bucket["open_count"] = int(bucket["open_count"]) + 1
        if event.status == "resolved":
            bucket["resolved_count"] = int(bucket["resolved_count"]) + 1
        latest = bucket["latest_received_at"]
        if isinstance(latest, datetime) and event.received_at > latest:
            bucket["latest_received_at"] = event.received_at

    return ClaimReturnAnalyticsRead(
        month=month,
        total_count=len(events),
        open_count=len([event for event in events if event.status == "open"]),
        in_progress_count=len([event for event in events if event.status == "in_progress"]),
        resolved_count=len([event for event in events if event.status == "resolved"]),
        ignored_count=len([event for event in events if event.status == "ignored"]),
        reason_buckets=[
            ClaimReturnReasonBucketRead.model_validate(bucket)
            for bucket in sorted(reason_map.values(), key=lambda item: int(item["count"]), reverse=True)
        ],
        event_type_buckets=[
            MonthlyCloseBucketRead(
                key=event_type,
                label=event_type,
                count=len([event for event in events if event.event_type == event_type]),
                total_points=0,
            )
            for event_type in ["return", "assessment", "notice"]
        ],
        status_buckets=[
            MonthlyCloseBucketRead(
                key=status_key,
                label=status_key,
                count=len([event for event in events if event.status == status_key]),
                total_points=0,
            )
            for status_key in ["open", "in_progress", "resolved", "ignored"]
        ],
    )


def _previous_month(month: str) -> str:
    start, _ = _month_range(month)
    if start.month == 1:
        previous = start.replace(year=start.year - 1, month=12)
    else:
        previous = start.replace(month=start.month - 1)
    return previous.strftime("%Y-%m")


@router.get("/api/claim-return-events/analytics", response_model=ClaimReturnAnalyticsRead)
def get_claim_return_event_analytics(
    month: str,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClaimReturnAnalyticsRead:
    return _build_claim_return_event_analytics(db, month)


@router.get("/api/claim-return-events/analytics/compare", response_model=ClaimReturnAnalyticsComparisonRead)
def compare_claim_return_event_analytics(
    month: str,
    previous_month: str | None = None,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClaimReturnAnalyticsComparisonRead:
    current = _build_claim_return_event_analytics(db, month)
    previous = _build_claim_return_event_analytics(db, previous_month or _previous_month(month))
    previous_reason_map = {bucket.key: bucket for bucket in previous.reason_buckets}
    current_reason_map = {bucket.key: bucket for bucket in current.reason_buckets}
    reason_keys = sorted(
        set(current_reason_map) | set(previous_reason_map),
        key=lambda key: current_reason_map.get(key, previous_reason_map.get(key)).count,  # type: ignore[union-attr]
        reverse=True,
    )
    reason_deltas = []
    for key in reason_keys:
        current_bucket = current_reason_map.get(key)
        previous_bucket = previous_reason_map.get(key)
        current_count = current_bucket.count if current_bucket else 0
        previous_count = previous_bucket.count if previous_bucket else 0
        current_open_count = current_bucket.open_count if current_bucket else 0
        previous_open_count = previous_bucket.open_count if previous_bucket else 0
        reason_deltas.append(
            ClaimReturnReasonDeltaRead(
                key=key,
                label=(current_bucket or previous_bucket).label,  # type: ignore[union-attr]
                current_count=current_count,
                previous_count=previous_count,
                delta=current_count - previous_count,
                current_open_count=current_open_count,
                previous_open_count=previous_open_count,
                open_delta=current_open_count - previous_open_count,
            )
        )
    return ClaimReturnAnalyticsComparisonRead(
        current=current,
        previous=previous,
        total_delta=current.total_count - previous.total_count,
        open_delta=(current.open_count + current.in_progress_count) - (previous.open_count + previous.in_progress_count),
        reason_deltas=reason_deltas[:20],
    )


def _add_months(month: str, offset: int) -> str:
    start, _ = _month_range(month)
    year = start.year + ((start.month - 1 + offset) // 12)
    month_value = ((start.month - 1 + offset) % 12) + 1
    return f"{year:04d}-{month_value:02d}"


@router.get("/api/claim-return-events/analytics/trend", response_model=list[ClaimReturnTrendPointRead])
def get_claim_return_event_trend(
    month: str,
    months: int = Query(6, ge=2, le=24),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ClaimReturnTrendPointRead]:
    points: list[ClaimReturnTrendPointRead] = []
    for offset in range(-(months - 1), 1):
        target_month = _add_months(month, offset)
        analytics = _build_claim_return_event_analytics(db, target_month)
        top_reason = analytics.reason_buckets[0] if analytics.reason_buckets else None
        points.append(
            ClaimReturnTrendPointRead(
                month=target_month,
                total_count=analytics.total_count,
                open_count=analytics.open_count + analytics.in_progress_count,
                resolved_count=analytics.resolved_count,
                assessment_count=next(
                    (bucket.count for bucket in analytics.event_type_buckets if bucket.key == "assessment"),
                    0,
                ),
                return_count=next(
                    (bucket.count for bucket in analytics.event_type_buckets if bucket.key == "return"),
                    0,
                ),
                top_reason_code=top_reason.key if top_reason else None,
                top_reason_count=top_reason.count if top_reason else 0,
            )
        )
    return points


@router.get("/api/claim-return-events/sla", response_model=ClaimReturnSlaSummaryRead)
def get_claim_return_event_sla(
    due_soon_hours: int | None = Query(None, ge=1, le=168),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClaimReturnSlaSummaryRead:
    setting = _get_or_create_sla_setting(db)
    effective_due_soon_hours = due_soon_hours or setting.due_soon_hours
    now = utcnow()
    due_soon_until = now + timedelta(hours=effective_due_soon_hours)
    events = db.scalars(
        select(ClaimReturnEvent)
        .where(ClaimReturnEvent.status.in_(["open", "in_progress"]))
        .order_by(ClaimReturnEvent.due_at, ClaimReturnEvent.received_at)
    ).all()
    assignee_map: dict[str, dict[str, object]] = {}
    for event in events:
        assignee = event.assignee or "未割当"
        bucket = assignee_map.setdefault(
            assignee,
            {
                "assignee": assignee,
                "open_count": 0,
                "overdue_count": 0,
                "due_soon_count": 0,
                "no_due_count": 0,
                "oldest_received_at": event.received_at,
                "latest_due_at": event.due_at,
            },
        )
        bucket["open_count"] = int(bucket["open_count"]) + 1
        if event.due_at is None:
            bucket["no_due_count"] = int(bucket["no_due_count"]) + 1
        elif event.due_at < now:
            bucket["overdue_count"] = int(bucket["overdue_count"]) + 1
        elif event.due_at <= due_soon_until:
            bucket["due_soon_count"] = int(bucket["due_soon_count"]) + 1
        oldest = bucket["oldest_received_at"]
        if isinstance(oldest, datetime) and event.received_at < oldest:
            bucket["oldest_received_at"] = event.received_at
        latest_due = bucket["latest_due_at"]
        if event.due_at is not None and (not isinstance(latest_due, datetime) or event.due_at > latest_due):
            bucket["latest_due_at"] = event.due_at

    return ClaimReturnSlaSummaryRead(
        generated_at=now,
        open_count=len(events),
        overdue_count=len([event for event in events if event.due_at is not None and event.due_at < now]),
        due_soon_count=len(
            [event for event in events if event.due_at is not None and now <= event.due_at <= due_soon_until]
        ),
        no_due_count=len([event for event in events if event.due_at is None]),
        assignee_buckets=[
            ClaimReturnAssigneeSlaRead.model_validate(bucket)
            for bucket in sorted(assignee_map.values(), key=lambda item: int(item["open_count"]), reverse=True)
        ],
    )


@router.get("/api/claim-return-events/sla/alerts", response_model=list[ClaimReturnSlaAlertRead])
def list_claim_return_event_sla_alerts(
    due_soon_hours: int | None = Query(None, ge=1, le=168),
    include_no_due: bool | None = None,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ClaimReturnSlaAlertRead]:
    setting = _get_or_create_sla_setting(db)
    effective_due_soon_hours = due_soon_hours or setting.due_soon_hours
    effective_include_no_due = setting.include_no_due if include_no_due is None else include_no_due
    now = utcnow()
    due_soon_until = now + timedelta(hours=effective_due_soon_hours)
    rows = db.execute(
        select(ClaimReturnEvent, ClaimDraft, Patient)
        .join(ClaimDraft, ClaimDraft.id == ClaimReturnEvent.claim_draft_id)
        .join(Patient, Patient.id == ClaimDraft.patient_id)
        .where(ClaimReturnEvent.status.in_(["open", "in_progress"]))
        .order_by(ClaimReturnEvent.due_at, ClaimReturnEvent.received_at)
    ).all()
    alerts: list[ClaimReturnSlaAlertRead] = []
    for event, draft, patient in rows:
        severity: str | None = None
        hours_until_due: float | None = None
        if event.due_at is None:
            if effective_include_no_due:
                severity = "no_due"
        else:
            hours_until_due = (event.due_at - now).total_seconds() / 3600
            if event.due_at < now:
                severity = "overdue"
            elif event.due_at <= due_soon_until:
                severity = "due_soon"
        if severity is None:
            continue
        alerts.append(
            ClaimReturnSlaAlertRead(
                event_id=event.id,
                claim_draft_id=draft.id,
                patient_id=patient.id,
                patient_name=patient.name,
                assignee=event.assignee or "未割当",
                status=event.status,
                title=event.title,
                reason_code=event.reason_code,
                severity=severity,  # type: ignore[arg-type]
                received_at=event.received_at,
                due_at=event.due_at,
                hours_until_due=round(hours_until_due, 1) if hours_until_due is not None else None,
            )
        )
    return alerts[:200]


@router.post("/api/claim-return-events/sla/escalate", response_model=ClaimReturnSlaEscalationRead)
def escalate_claim_return_event_sla(
    payload: ClaimReturnSlaEscalationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClaimReturnSlaEscalationRead:
    if current_user.role != "管理者":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SLA escalation requires admin role")
    setting = _get_or_create_sla_setting(db)
    now = utcnow()
    conditions = [
        ClaimReturnEvent.status.in_(["open", "in_progress"]),
        ClaimReturnEvent.due_at.is_not(None),
        ClaimReturnEvent.due_at < now,
    ]
    if payload.include_due_soon:
        conditions[-1] = ClaimReturnEvent.due_at <= now + timedelta(hours=setting.due_soon_hours)
    events = db.scalars(select(ClaimReturnEvent).where(*conditions).order_by(ClaimReturnEvent.due_at)).all()
    note = payload.note.strip() if payload.note else None
    target_assignee = payload.assignee.strip() or setting.escalation_assignee
    for event in events:
        event.assignee = target_assignee
        event.status = "in_progress"
        event.updated_by = current_user.display_name
        event.updated_at = now
        prefix = f"SLAエスカレーション: {note}" if note else "SLAエスカレーション"
        event.resolution_note = f"{prefix}\n{event.resolution_note or ''}".strip()
    if events:
        log_audit(
            db,
            actor=current_user.display_name,
            action="返戻査定SLAエスカレーション",
            scope="billing",
            detail=f"{len(events)}件を {target_assignee} にエスカレーションしました。",
        )
    db.commit()
    return ClaimReturnSlaEscalationRead(
        escalated_count=len(events),
        event_ids=[event.id for event in events],
        assignee=target_assignee,
        note=note,
    )


@router.get("/api/claim-return-events/sla/settings", response_model=ClaimSlaSettingRead)
def get_claim_return_sla_setting(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClaimSlaSettingRead:
    return _get_or_create_sla_setting(db)


@router.put("/api/claim-return-events/sla/settings", response_model=ClaimSlaSettingRead)
def update_claim_return_sla_setting(
    payload: ClaimSlaSettingUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClaimSlaSettingRead:
    if current_user.role != "管理者":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SLA settings require admin role")
    setting = _get_or_create_sla_setting(db)
    setting.due_soon_hours = max(1, min(payload.due_soon_hours, 168))
    setting.include_no_due = payload.include_no_due
    setting.escalation_assignee = payload.escalation_assignee.strip() or "管理者"
    setting.notify_destinations = payload.notify_destinations
    setting.escalation_rules = payload.escalation_rules
    setting.note = payload.note.strip() if payload.note else None
    setting.updated_by = current_user.display_name
    setting.updated_at = utcnow()
    log_audit(
        db,
        actor=current_user.display_name,
        action="返戻査定SLA設定更新",
        scope="billing",
        detail=f"due_soon={setting.due_soon_hours}h / destinations={len(setting.notify_destinations)}",
    )
    db.commit()
    db.refresh(setting)
    return setting


@router.post("/api/claim-return-events/sla/notifications/dry-run", response_model=ClaimSlaNotificationDryRunRead)
def dry_run_claim_return_sla_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClaimSlaNotificationDryRunRead:
    setting = _get_or_create_sla_setting(db)
    alerts = list_claim_return_event_sla_alerts(
        due_soon_hours=setting.due_soon_hours,
        include_no_due=setting.include_no_due,
        _=current_user,
        db=db,
    )
    log_audit(
        db,
        actor=current_user.display_name,
        action="返戻査定SLA通知dry-run",
        scope="billing",
        detail=f"alerts={len(alerts)} / destinations={len(setting.notify_destinations)}",
    )
    db.commit()
    return ClaimSlaNotificationDryRunRead(
        generated_at=utcnow(),
        destination_count=len(setting.notify_destinations),
        alert_count=len(alerts),
        destinations=setting.notify_destinations,
        alerts=alerts,
    )


@router.get("/api/claim-transmissions", response_model=list[ClaimTransmissionSummaryRead])
def list_claim_transmissions(
    month: str | None = None,
    status_filter: str = Query("all", alias="status"),
    search: str = "",
    reclaim_only: bool = False,
    limit: int = Query(80, ge=1, le=200),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ClaimTransmissionSummaryRead]:
    conditions = []
    if status_filter != "all":
        conditions.append(ClaimTransmission.status == status_filter)
    if month:
        start, end = _month_range(month)
        conditions.extend([ClaimTransmission.sent_at >= start, ClaimTransmission.sent_at < end])
    if search.strip():
        pattern = f"%{search.strip()}%"
        conditions.append(
            or_(
                Patient.id.ilike(pattern),
                Patient.name.ilike(pattern),
                Patient.kana.ilike(pattern),
                ClaimTransmission.error_message.ilike(pattern),
            )
        )

    rows = db.execute(
        select(ClaimTransmission, ClaimDraft, Patient)
        .join(ClaimDraft, ClaimDraft.id == ClaimTransmission.claim_draft_id)
        .join(Patient, Patient.id == ClaimDraft.patient_id)
        .where(*conditions)
        .order_by(desc(ClaimTransmission.sent_at), desc(ClaimTransmission.id))
        .limit(limit)
    ).all()
    draft_ids = [draft.id for _, draft, _ in rows]
    transmission_counts = dict(
        db.execute(
            select(ClaimTransmission.claim_draft_id, func.count(ClaimTransmission.id))
            .where(ClaimTransmission.claim_draft_id.in_(draft_ids))
            .group_by(ClaimTransmission.claim_draft_id)
        ).all()
    ) if draft_ids else {}
    summaries = [
        claim_transmission_to_summary(transmission, draft, patient, int(transmission_counts.get(draft.id, 0)))
        for transmission, draft, patient in rows
    ]
    if reclaim_only:
        return [summary for summary in summaries if summary.is_reclaim]
    return summaries


@router.get("/api/claim-transmissions/export.csv", response_class=Response)
def export_claim_transmissions_csv(
    month: str | None = None,
    status_filter: str = Query("all", alias="status"),
    search: str = "",
    reclaim_only: bool = False,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    rows = list_claim_transmissions(
        month=month,
        status_filter=status_filter,
        search=search,
        reclaim_only=reclaim_only,
        limit=200,
        _=_,
        db=db,
    )
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "sent_at",
        "patient_id",
        "patient_name",
        "claim_draft_id",
        "status",
        "sent_by",
        "total_points",
        "is_reclaim",
        "transmission_count",
        "error_message",
    ])
    for row in rows:
        writer.writerow([
            row.sent_at.isoformat(),
            row.patient_id,
            row.patient_name,
            row.claim_draft_id,
            row.status,
            row.sent_by,
            row.total_points,
            row.is_reclaim,
            row.transmission_count,
            row.error_message or "",
        ])
    filename = f"claim-transmissions-{month or 'all'}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/api/claim-drafts", response_model=list[ClaimDraftSummaryRead])
def list_claim_drafts(
    status_filter: str = Query("all", alias="status"),
    queue: str = "all",
    search: str = "",
    limit: int = Query(80, ge=1, le=200),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ClaimDraftSummaryRead]:
    conditions = []
    if status_filter != "all":
        conditions.append(ClaimDraft.status == status_filter)
    if search.strip():
        pattern = f"%{search.strip()}%"
        conditions.append(
            or_(
                ClaimDraft.patient_id.ilike(pattern),
                Patient.name.ilike(pattern),
                Patient.kana.ilike(pattern),
                Admission.primary_diagnosis.ilike(pattern),
            )
        )

    stmt = (
        select(ClaimDraft, Patient, Admission)
        .join(Patient, Patient.id == ClaimDraft.patient_id)
        .outerjoin(Admission, Admission.id == ClaimDraft.admission_id)
        .where(*conditions)
        .order_by(desc(ClaimDraft.updated_at), desc(ClaimDraft.id))
        .limit(limit)
    )
    rows = db.execute(stmt).all()
    if not rows:
        return []

    draft_ids = [draft.id for draft, _, _ in rows]
    line_counts = dict(
        db.execute(
            select(ClaimDraftLine.claim_draft_id, func.count(ClaimDraftLine.id))
            .where(ClaimDraftLine.claim_draft_id.in_(draft_ids))
            .group_by(ClaimDraftLine.claim_draft_id)
        ).all()
    )
    unresolved_line_counts = dict(
        db.execute(
            select(ClaimDraftLine.claim_draft_id, func.count(ClaimDraftLine.id))
            .where(ClaimDraftLine.claim_draft_id.in_(draft_ids), ClaimDraftLine.receipt_code.is_(None))
            .group_by(ClaimDraftLine.claim_draft_id)
        ).all()
    )
    open_issue_counts = dict(
        db.execute(
            select(ClaimReviewIssue.claim_draft_id, func.count(ClaimReviewIssue.id))
            .where(ClaimReviewIssue.claim_draft_id.in_(draft_ids), ClaimReviewIssue.status == "open")
            .group_by(ClaimReviewIssue.claim_draft_id)
        ).all()
    )
    open_error_counts = dict(
        db.execute(
            select(ClaimReviewIssue.claim_draft_id, func.count(ClaimReviewIssue.id))
            .where(
                ClaimReviewIssue.claim_draft_id.in_(draft_ids),
                ClaimReviewIssue.status == "open",
                ClaimReviewIssue.severity == "error",
            )
            .group_by(ClaimReviewIssue.claim_draft_id)
        ).all()
    )
    open_warning_counts = dict(
        db.execute(
            select(ClaimReviewIssue.claim_draft_id, func.count(ClaimReviewIssue.id))
            .where(
                ClaimReviewIssue.claim_draft_id.in_(draft_ids),
                ClaimReviewIssue.status == "open",
                ClaimReviewIssue.severity == "warning",
            )
            .group_by(ClaimReviewIssue.claim_draft_id)
        ).all()
    )
    suggested_adjustment_counts = dict(
        db.execute(
            select(ClaimLineAdjustment.claim_draft_id, func.count(ClaimLineAdjustment.id))
            .where(
                ClaimLineAdjustment.claim_draft_id.in_(draft_ids),
                ClaimLineAdjustment.status == "suggested",
            )
            .group_by(ClaimLineAdjustment.claim_draft_id)
        ).all()
    )
    open_return_event_counts = dict(
        db.execute(
            select(ClaimReturnEvent.claim_draft_id, func.count(ClaimReturnEvent.id))
            .where(
                ClaimReturnEvent.claim_draft_id.in_(draft_ids),
                ClaimReturnEvent.status.in_(["open", "in_progress"]),
            )
            .group_by(ClaimReturnEvent.claim_draft_id)
        ).all()
    )
    latest_transmissions = {}
    transmissions = db.scalars(
        select(ClaimTransmission)
        .where(ClaimTransmission.claim_draft_id.in_(draft_ids))
        .order_by(desc(ClaimTransmission.sent_at), desc(ClaimTransmission.id))
    ).all()
    for transmission in transmissions:
        latest_transmissions.setdefault(transmission.claim_draft_id, transmission)

    summaries: list[ClaimDraftSummaryRead] = []
    for draft, patient, admission in rows:
        latest_transmission = latest_transmissions.get(draft.id)
        open_issue_count = int(open_issue_counts.get(draft.id, 0))
        open_error_count = int(open_error_counts.get(draft.id, 0))
        unresolved_line_count = int(unresolved_line_counts.get(draft.id, 0))
        latest_status = latest_transmission.status if latest_transmission else None
        if queue == "open_issues" and open_issue_count == 0 and unresolved_line_count == 0:
            continue
        if queue == "ready" and (draft.status != "ready" or open_error_count > 0 or unresolved_line_count > 0):
            continue
        if queue == "transmission_error" and latest_status not in {"rejected", "error"}:
            continue
        if queue == "submitted" and draft.status != "submitted":
            continue

        summaries.append(
            ClaimDraftSummaryRead(
                id=draft.id,
                patient_id=draft.patient_id,
                patient_name=patient.name,
                patient_kana=patient.kana,
                department=patient.department,
                doctor=patient.doctor,
                admission_id=draft.admission_id,
                admission_status=admission.status if admission else None,
                ward_id=admission.ward_id if admission else None,
                bed_id=admission.bed_id if admission else None,
                primary_diagnosis=admission.primary_diagnosis if admission else None,
                status=draft.status,
                source_type=draft.source_type,
                total_points=draft.total_points,
                created_by=draft.created_by,
                created_at=draft.created_at,
                updated_at=draft.updated_at,
                line_count=int(line_counts.get(draft.id, 0)),
                open_issue_count=open_issue_count,
                open_error_count=open_error_count,
                open_warning_count=int(open_warning_counts.get(draft.id, 0)),
                unresolved_line_count=unresolved_line_count,
                suggested_adjustment_count=int(suggested_adjustment_counts.get(draft.id, 0)),
                latest_transmission_status=latest_status,
                latest_transmission_at=latest_transmission.sent_at if latest_transmission else None,
                open_return_event_count=int(open_return_event_counts.get(draft.id, 0)),
            )
        )
    return summaries


@router.get("/api/claim-return-events", response_model=list[ClaimReturnEventSummaryRead])
def list_claim_return_events(
    status_filter: str = Query("open", alias="status"),
    event_type: str = "all",
    assignee: str = "all",
    search: str = "",
    limit: int = Query(80, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ClaimReturnEventSummaryRead]:
    conditions = []
    if status_filter != "all":
        conditions.append(ClaimReturnEvent.status == status_filter)
    if event_type != "all":
        conditions.append(ClaimReturnEvent.event_type == event_type)
    if assignee == "mine":
        conditions.append(ClaimReturnEvent.assignee == current_user.display_name)
    elif assignee == "unassigned":
        conditions.append(ClaimReturnEvent.assignee.is_(None))
    elif assignee != "all":
        if current_user.role != "管理者" and assignee != current_user.display_name:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot filter another assignee")
        conditions.append(ClaimReturnEvent.assignee == assignee)
    if search.strip():
        pattern = f"%{search.strip()}%"
        conditions.append(
            or_(
                Patient.id.ilike(pattern),
                Patient.name.ilike(pattern),
                Patient.kana.ilike(pattern),
                ClaimReturnEvent.title.ilike(pattern),
                ClaimReturnEvent.message.ilike(pattern),
                ClaimReturnEvent.reason_code.ilike(pattern),
            )
        )

    rows = db.execute(
        select(ClaimReturnEvent, ClaimDraft, Patient)
        .join(ClaimDraft, ClaimDraft.id == ClaimReturnEvent.claim_draft_id)
        .join(Patient, Patient.id == ClaimDraft.patient_id)
        .where(*conditions)
        .order_by(desc(ClaimReturnEvent.received_at), desc(ClaimReturnEvent.id))
        .limit(limit)
    ).all()
    return [claim_return_event_to_summary(event, draft, patient) for event, draft, patient in rows]


@router.get("/api/claim-drafts/{claim_draft_id}", response_model=ClaimDraftRead)
def get_claim_draft(
    claim_draft_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClaimDraftRead:
    draft = db.get(ClaimDraft, claim_draft_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim draft not found")
    return claim_draft_to_read(db, draft)


@router.post(
    "/api/claim-drafts/{claim_draft_id}/return-events",
    response_model=ClaimReturnEventRead,
    status_code=status.HTTP_201_CREATED,
)
def create_claim_return_event(
    claim_draft_id: int,
    payload: ClaimReturnEventCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClaimReturnEventRead:
    draft = db.get(ClaimDraft, claim_draft_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim draft not found")
    patient = get_patient_or_404(db, draft.patient_id)
    if current_user.role != "管理者" and payload.assignee not in {None, current_user.display_name}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot assign return event to another user")
    event = ClaimReturnEvent(
        claim_draft_id=draft.id,
        event_type=payload.event_type,
        severity=payload.severity,
        status="open",
        title=payload.title.strip(),
        message=payload.message.strip(),
        reason_code=payload.reason_code,
        payer=payload.payer,
        due_at=payload.due_at,
        assignee=payload.assignee,
        raw_payload=payload.raw_payload,
        created_by=current_user.display_name,
    )
    if not event.title or not event.message:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="title and message are required")
    db.add(event)
    draft.updated_at = utcnow()
    log_audit(
        db,
        actor=current_user.display_name,
        action="返戻査定イベント作成",
        scope="billing",
        detail=f"{event.title}: {event.message[:80]}",
        patient=patient,
    )
    db.commit()
    db.refresh(event)
    return ClaimReturnEventRead.model_validate(event)


@router.patch("/api/claim-return-events/{event_id}", response_model=ClaimReturnEventRead)
def update_claim_return_event(
    event_id: int,
    payload: ClaimReturnEventUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClaimReturnEventRead:
    event = db.get(ClaimReturnEvent, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim return event not found")
    draft = db.get(ClaimDraft, event.claim_draft_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim draft not found")
    patient = get_patient_or_404(db, draft.patient_id)
    _ensure_return_event_update_allowed(current_user, event, payload.assignee)
    event.status = payload.status
    event.assignee = payload.assignee or (current_user.display_name if payload.status == "in_progress" else None)
    event.resolution_note = payload.resolution_note
    event.updated_by = current_user.display_name
    event.updated_at = utcnow()
    draft.updated_at = utcnow()
    log_audit(
        db,
        actor=current_user.display_name,
        action="返戻査定イベント更新",
        scope="billing",
        detail=f"{event.title} を {event.status} に更新しました。",
        patient=patient,
    )
    db.commit()
    db.refresh(event)
    return ClaimReturnEventRead.model_validate(event)


@router.patch("/api/claim-return-events/{event_id}/assignee", response_model=ClaimReturnEventRead)
def assign_claim_return_event(
    event_id: int,
    payload: ClaimReturnEventAssignRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClaimReturnEventRead:
    event = db.get(ClaimReturnEvent, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim return event not found")
    draft = db.get(ClaimDraft, event.claim_draft_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim draft not found")
    patient = get_patient_or_404(db, draft.patient_id)
    next_assignee = payload.assignee.strip() if payload.assignee else None
    _ensure_return_event_update_allowed(current_user, event, next_assignee)
    event.assignee = next_assignee
    event.status = "in_progress" if next_assignee and event.status == "open" else event.status
    event.updated_by = current_user.display_name
    event.updated_at = utcnow()
    draft.updated_at = utcnow()
    log_audit(
        db,
        actor=current_user.display_name,
        action="返戻査定担当更新",
        scope="billing",
        detail=f"{event.title} の担当を {event.assignee or '未割当'} に更新しました。",
        patient=patient,
    )
    db.commit()
    db.refresh(event)
    return ClaimReturnEventRead.model_validate(event)


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
    for issue in build_claim_line_code_issues(claim_draft_id=draft.id, lines=lines):
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


@router.get("/api/claim-draft-lines/{line_id}/receipt-code-candidates", response_model=list[ReceiptCodeCandidateRead])
def list_claim_draft_line_receipt_code_candidates(
    line_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ReceiptCodeCandidateRead]:
    line = db.get(ClaimDraftLine, line_id)
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim draft line not found")

    keywords = [part.strip() for part in line.label.replace(":", " ").replace("　", " ").split() if len(part.strip()) >= 2]
    keywords.extend([line.line_type, line.receipt_name or ""])
    seen_codes: set[str] = set()
    candidates: list[ReceiptMedicalPracticeMaster] = []
    for keyword in keywords:
        if not keyword:
            continue
        rows = db.scalars(
            select(ReceiptMedicalPracticeMaster)
            .where(ReceiptMedicalPracticeMaster.name.ilike(f"%{keyword}%"))
            .order_by(ReceiptMedicalPracticeMaster.name, ReceiptMedicalPracticeMaster.receipt_code)
            .limit(8)
        ).all()
        for row in rows:
            if row.receipt_code in seen_codes:
                continue
            seen_codes.add(row.receipt_code)
            candidates.append(row)
        if len(candidates) >= 8:
            break
    return [_receipt_candidate_to_read(item) for item in candidates[:8]]


@router.patch("/api/claim-draft-lines/{line_id}/receipt-code", response_model=ClaimDraftRead)
def update_claim_draft_line_receipt_code(
    line_id: int,
    payload: ClaimDraftLineReceiptCodeUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClaimDraftRead:
    line = db.get(ClaimDraftLine, line_id)
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim draft line not found")
    draft = db.get(ClaimDraft, line.claim_draft_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim draft not found")
    patient = get_patient_or_404(db, draft.patient_id)

    receipt_code = payload.receipt_code.strip()
    if not receipt_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="receipt_code is required")
    master = db.get(ReceiptMedicalPracticeMaster, receipt_code)
    line.receipt_code = receipt_code
    line.receipt_name = payload.receipt_name.strip() if payload.receipt_name else master.name if master else line.receipt_name
    if payload.points is not None:
        line.points = payload.points
    elif master is not None and master.points is not None:
        line.points = master.points
    if "unit" in payload.model_fields_set:
        line.unit = payload.unit
    elif master is not None and master.unit_name:
        line.unit = master.unit_name
    line.review_status = "candidate"
    if payload.resolve_issues:
        _resolve_receipt_code_issues(db, draft_id=draft.id, line=line)
    draft.total_points = recalculate_claim_draft_total_points(db, draft.id)
    draft.updated_at = utcnow()

    if draft.admission_id is not None:
        add_inpatient_event(
            db,
            admission_id=draft.admission_id,
            event_type="claim_line_receipt_code_updated",
            title="請求明細コード補正",
            detail=f"{line.label}: {line.receipt_code} {line.receipt_name or ''}".strip(),
            actor=current_user.display_name,
        )
    log_audit(
        db,
        actor=current_user.display_name,
        action="請求明細コード補正",
        scope="billing",
        detail=f"{line.label} のレセ電コードを {line.receipt_code} に更新しました。",
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


@router.post("/api/claim-drafts/{claim_draft_id}/recheck", response_model=ClaimDraftRead)
def recheck_claim_draft(
    claim_draft_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClaimDraftRead:
    draft = db.get(ClaimDraft, claim_draft_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim draft not found")
    patient = get_patient_or_404(db, draft.patient_id)
    _sync_claim_draft_code_issues(db, draft)
    open_errors = db.scalars(
        select(ClaimReviewIssue).where(
            ClaimReviewIssue.claim_draft_id == draft.id,
            ClaimReviewIssue.status == "open",
            ClaimReviewIssue.severity == "error",
        )
    ).all()
    if draft.admission_id is not None:
        add_inpatient_event(
            db,
            admission_id=draft.admission_id,
            event_type="claim_draft_rechecked",
            title="請求ドラフト再点検",
            detail=f"status={draft.status} / error={len(open_errors)} / total={draft.total_points}点",
            actor=current_user.display_name,
        )
    log_audit(
        db,
        actor=current_user.display_name,
        action="請求ドラフト再点検",
        scope="billing",
        detail=f"請求ドラフト {draft.id} を再点検しました。status={draft.status}",
        patient=patient,
    )
    db.commit()
    db.refresh(draft)
    return claim_draft_to_read(db, draft)
