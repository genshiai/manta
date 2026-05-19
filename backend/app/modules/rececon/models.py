from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ...db import Base
from ..common.models import utcnow


class FacilityClaimRule(Base):
    __tablename__ = "facility_claim_rules"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    category: Mapped[str] = mapped_column(String(64), index=True)
    target_category: Mapped[str] = mapped_column(String(64), index=True)
    rule_type: Mapped[str] = mapped_column(String(64), index=True)
    severity: Mapped[str] = mapped_column(String(32), default="warning")
    message: Mapped[str] = mapped_column(String(255))
    evidence_hint: Mapped[str | None] = mapped_column(Text, nullable=True)
    conditions: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    actions: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ClaimSlaSetting(Base):
    __tablename__ = "claim_sla_settings"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    due_soon_hours: Mapped[int] = mapped_column(Integer, default=48)
    include_no_due: Mapped[bool] = mapped_column(Boolean, default=True)
    escalation_assignee: Mapped[str] = mapped_column(String(128), default="管理者")
    notify_destinations: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    escalation_rules: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ClaimDraft(Base):
    __tablename__ = "claim_drafts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    admission_id: Mapped[int | None] = mapped_column(ForeignKey("admissions.id", ondelete="CASCADE"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    source_type: Mapped[str] = mapped_column(String(64), default="inpatient_discharge", index=True)
    billing_candidates: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    total_points: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ClaimDraftLine(Base):
    __tablename__ = "claim_draft_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    claim_draft_id: Mapped[int] = mapped_column(ForeignKey("claim_drafts.id", ondelete="CASCADE"), index=True)
    line_type: Mapped[str] = mapped_column(String(64), index=True)
    source_type: Mapped[str] = mapped_column(String(64), index=True)
    source_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    label: Mapped[str] = mapped_column(String(255))
    receipt_code: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    receipt_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    points: Mapped[int] = mapped_column(Integer, default=0)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_status: Mapped[str] = mapped_column(String(32), default="candidate", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class ClaimLineAdjustment(Base):
    __tablename__ = "claim_line_adjustments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    claim_draft_id: Mapped[int] = mapped_column(ForeignKey("claim_drafts.id", ondelete="CASCADE"), index=True)
    claim_draft_line_id: Mapped[int | None] = mapped_column(ForeignKey("claim_draft_lines.id", ondelete="CASCADE"), nullable=True, index=True)
    rule_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    adjustment_type: Mapped[str] = mapped_column(String(64), index=True)
    points_delta: Mapped[int] = mapped_column(Integer, default=0)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    comment_code: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    comment_pattern: Mapped[str | None] = mapped_column(String(8), nullable=True)
    reason: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="suggested", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class ClaimReviewIssue(Base):
    __tablename__ = "claim_review_issues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    claim_draft_id: Mapped[int] = mapped_column(ForeignKey("claim_drafts.id", ondelete="CASCADE"), index=True)
    issue_type: Mapped[str] = mapped_column(String(64), index=True)
    severity: Mapped[str] = mapped_column(String(32), default="warning", index=True)
    message: Mapped[str] = mapped_column(String(255))
    evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="open", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class ClaimTransmission(Base):
    __tablename__ = "claim_transmissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    claim_draft_id: Mapped[int] = mapped_column(ForeignKey("claim_drafts.id", ondelete="CASCADE"), index=True)
    adapter: Mapped[str] = mapped_column(String(64), default="orca", index=True)
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)
    request_payload: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    response_payload: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_by: Mapped[str] = mapped_column(String(128))
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class ClaimReturnEvent(Base):
    __tablename__ = "claim_return_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    claim_draft_id: Mapped[int] = mapped_column(ForeignKey("claim_drafts.id", ondelete="CASCADE"), index=True)
    transmission_id: Mapped[int | None] = mapped_column(
        ForeignKey("claim_transmissions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    event_type: Mapped[str] = mapped_column(String(32), default="return", index=True)
    severity: Mapped[str] = mapped_column(String(32), default="warning", index=True)
    status: Mapped[str] = mapped_column(String(32), default="open", index=True)
    title: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text)
    reason_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    payer: Mapped[str | None] = mapped_column(String(128), nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    assignee: Mapped[str | None] = mapped_column(String(128), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_payload: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    created_by: Mapped[str] = mapped_column(String(128))
    updated_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class MonthlyClaimClose(Base):
    __tablename__ = "monthly_claim_closes"

    month: Mapped[str] = mapped_column(String(7), primary_key=True)
    status: Mapped[str] = mapped_column(String(32), default="closed", index=True)
    claim_count: Mapped[int] = mapped_column(Integer, default=0)
    total_points: Mapped[int] = mapped_column(Integer, default=0)
    unsubmitted_count: Mapped[int] = mapped_column(Integer, default=0)
    open_return_count: Mapped[int] = mapped_column(Integer, default=0)
    unresolved_issue_count: Mapped[int] = mapped_column(Integer, default=0)
    snapshot: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    requested_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    closed_by: Mapped[str] = mapped_column(String(128))
    closed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    approved_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    approval_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelled_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
