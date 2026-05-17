from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


ClaimDraftStatus = Literal["draft", "reviewed", "ready", "submitted", "error"]
ClaimIssueSeverity = Literal["info", "warning", "error"]
ClaimLineAdjustmentStatus = Literal["suggested", "accepted", "ignored"]
ClaimTransmissionStatus = Literal["accepted", "rejected", "error"]


class ClaimReviewIssueRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    claim_draft_id: int
    issue_type: str
    severity: ClaimIssueSeverity
    message: str
    evidence: str | None = None
    status: Literal["open", "resolved", "ignored"]
    created_at: datetime


class ClaimTransmissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    claim_draft_id: int
    adapter: str
    status: ClaimTransmissionStatus
    request_payload: dict[str, object]
    response_payload: dict[str, object]
    error_message: str | None = None
    sent_by: str
    sent_at: datetime
    created_at: datetime


class ClaimDraftLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    claim_draft_id: int
    line_type: str
    source_type: str
    source_id: str | None = None
    label: str
    receipt_code: str | None = None
    receipt_name: str | None = None
    points: int
    quantity: int
    unit: str | None = None
    evidence: str | None = None
    review_status: str
    created_at: datetime


class ClaimDraftLineReceiptCodeUpdateRequest(BaseModel):
    receipt_code: str
    receipt_name: str | None = None
    points: int | None = None
    unit: str | None = None
    resolve_issues: bool = True


class ReceiptCodeCandidateRead(BaseModel):
    receipt_code: str
    receipt_name: str
    points: int | None = None
    unit: str | None = None
    category: str | None = None


class ClaimLineAdjustmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    claim_draft_id: int
    claim_draft_line_id: int | None = None
    rule_id: str | None = None
    adjustment_type: str
    points_delta: int
    comment: str | None = None
    comment_code: str | None = None
    comment_pattern: str | None = None
    reason: str
    status: ClaimLineAdjustmentStatus
    created_at: datetime


class ClaimDraftRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: str
    admission_id: int | None = None
    status: ClaimDraftStatus
    source_type: str
    billing_candidates: list[dict[str, str]]
    total_points: int
    created_by: str
    created_at: datetime
    updated_at: datetime
    lines: list[ClaimDraftLineRead] = []
    adjustments: list[ClaimLineAdjustmentRead] = []
    issues: list[ClaimReviewIssueRead] = []
    transmissions: list[ClaimTransmissionRead] = []


class ClaimDraftUpdateRequest(BaseModel):
    status: ClaimDraftStatus


class ClaimLineAdjustmentUpdateRequest(BaseModel):
    status: ClaimLineAdjustmentStatus


class FacilityClaimRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sort_order: int
    is_active: bool
    category: str
    target_category: str
    rule_type: str
    severity: ClaimIssueSeverity
    message: str
    evidence_hint: str | None = None
    conditions: dict[str, object] = {}
    actions: dict[str, object] = {}
    updated_at: datetime


class FacilityClaimRuleCreateRequest(BaseModel):
    id: str
    sort_order: int
    is_active: bool = True
    category: str
    target_category: str
    rule_type: str
    severity: ClaimIssueSeverity = "warning"
    message: str
    evidence_hint: str | None = None
    conditions: dict[str, object] = {}
    actions: dict[str, object] = {}


class FacilityClaimRuleUpdateRequest(BaseModel):
    sort_order: int
    is_active: bool = True
    category: str
    target_category: str
    rule_type: str
    severity: ClaimIssueSeverity = "warning"
    message: str
    evidence_hint: str | None = None
    conditions: dict[str, object] = {}
    actions: dict[str, object] = {}
