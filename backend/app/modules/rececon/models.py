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
