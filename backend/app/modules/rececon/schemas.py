from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


ClaimDraftStatus = Literal["draft", "reviewed", "ready", "submitted", "error"]
ClaimIssueSeverity = Literal["info", "warning", "error"]
ClaimLineAdjustmentStatus = Literal["suggested", "accepted", "ignored"]
ClaimTransmissionStatus = Literal["accepted", "rejected", "error"]
ClaimReturnEventType = Literal["return", "assessment", "notice"]
ClaimReturnEventStatus = Literal["open", "in_progress", "resolved", "ignored"]


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


class ClaimTransmissionSummaryRead(ClaimTransmissionRead):
    patient_id: str
    patient_name: str
    patient_kana: str
    department: str
    admission_id: int | None = None
    claim_status: ClaimDraftStatus
    total_points: int
    transmission_count: int
    is_reclaim: bool


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


class ClaimDraftSummaryRead(BaseModel):
    id: int
    patient_id: str
    patient_name: str
    patient_kana: str
    department: str
    doctor: str
    admission_id: int | None = None
    admission_status: str | None = None
    ward_id: str | None = None
    bed_id: str | None = None
    primary_diagnosis: str | None = None
    status: ClaimDraftStatus
    source_type: str
    total_points: int
    created_by: str
    created_at: datetime
    updated_at: datetime
    line_count: int
    open_issue_count: int
    open_error_count: int
    open_warning_count: int
    unresolved_line_count: int
    suggested_adjustment_count: int
    latest_transmission_status: ClaimTransmissionStatus | None = None
    latest_transmission_at: datetime | None = None
    open_return_event_count: int = 0


class ClaimReturnEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    claim_draft_id: int
    transmission_id: int | None = None
    event_type: ClaimReturnEventType
    severity: ClaimIssueSeverity
    status: ClaimReturnEventStatus
    title: str
    message: str
    reason_code: str | None = None
    payer: str | None = None
    received_at: datetime
    due_at: datetime | None = None
    assignee: str | None = None
    resolution_note: str | None = None
    raw_payload: dict[str, object]
    created_by: str
    updated_by: str | None = None
    created_at: datetime
    updated_at: datetime


class ClaimReturnEventSummaryRead(ClaimReturnEventRead):
    patient_id: str
    patient_name: str
    patient_kana: str
    department: str
    admission_id: int | None = None
    claim_status: ClaimDraftStatus
    total_points: int


class ClaimReturnEventCreateRequest(BaseModel):
    event_type: ClaimReturnEventType = "return"
    severity: ClaimIssueSeverity = "warning"
    title: str
    message: str
    reason_code: str | None = None
    payer: str | None = None
    due_at: datetime | None = None
    assignee: str | None = None
    raw_payload: dict[str, object] = {}


class ClaimReturnEventUpdateRequest(BaseModel):
    status: ClaimReturnEventStatus
    assignee: str | None = None
    resolution_note: str | None = None


class ClaimReturnEventAssignRequest(BaseModel):
    assignee: str | None = None


class MonthlyCloseBucketRead(BaseModel):
    key: str
    label: str
    count: int
    total_points: int = 0


class MonthlyCloseSummaryRead(BaseModel):
    month: str
    claim_count: int
    total_points: int
    unsubmitted_count: int
    submitted_count: int
    open_return_count: int
    assessment_count: int
    reclaim_waiting_count: int
    unresolved_issue_count: int
    assignee_buckets: list[MonthlyCloseBucketRead]
    status_buckets: list[MonthlyCloseBucketRead]
    close: "MonthlyClaimCloseRead | None" = None


class MonthlyClaimCloseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    month: str
    status: Literal["pending_approval", "closed", "cancelled"]
    claim_count: int
    total_points: int
    unsubmitted_count: int
    open_return_count: int
    unresolved_issue_count: int
    snapshot: dict[str, object]
    requested_by: str | None = None
    requested_at: datetime | None = None
    closed_by: str
    closed_at: datetime
    approved_by: str | None = None
    approved_at: datetime | None = None
    approval_note: str | None = None
    cancelled_by: str | None = None
    cancelled_at: datetime | None = None
    cancel_reason: str | None = None
    updated_at: datetime


class MonthlyClaimCloseRequest(BaseModel):
    force: bool = False
    note: str | None = None


class MonthlyClaimCloseApprovalRequest(BaseModel):
    note: str | None = None


class ClaimReturnReasonBucketRead(BaseModel):
    key: str
    label: str
    event_type: ClaimReturnEventType | None = None
    severity: ClaimIssueSeverity | None = None
    count: int
    open_count: int
    resolved_count: int
    latest_received_at: datetime | None = None


class ClaimReturnAnalyticsRead(BaseModel):
    month: str
    total_count: int
    open_count: int
    in_progress_count: int
    resolved_count: int
    ignored_count: int
    reason_buckets: list[ClaimReturnReasonBucketRead]
    event_type_buckets: list[MonthlyCloseBucketRead]
    status_buckets: list[MonthlyCloseBucketRead]


class ClaimReturnReasonDeltaRead(BaseModel):
    key: str
    label: str
    current_count: int
    previous_count: int
    delta: int
    current_open_count: int
    previous_open_count: int
    open_delta: int


class ClaimReturnAnalyticsComparisonRead(BaseModel):
    current: ClaimReturnAnalyticsRead
    previous: ClaimReturnAnalyticsRead
    total_delta: int
    open_delta: int
    reason_deltas: list[ClaimReturnReasonDeltaRead]


class ClaimReturnTrendPointRead(BaseModel):
    month: str
    total_count: int
    open_count: int
    resolved_count: int
    assessment_count: int
    return_count: int
    top_reason_code: str | None = None
    top_reason_count: int = 0


class ClaimReturnAssigneeSlaRead(BaseModel):
    assignee: str
    open_count: int
    overdue_count: int
    due_soon_count: int
    no_due_count: int
    oldest_received_at: datetime | None = None
    latest_due_at: datetime | None = None


class ClaimReturnSlaSummaryRead(BaseModel):
    generated_at: datetime
    open_count: int
    overdue_count: int
    due_soon_count: int
    no_due_count: int
    assignee_buckets: list[ClaimReturnAssigneeSlaRead]


class ClaimReturnSlaAlertRead(BaseModel):
    event_id: int
    claim_draft_id: int
    patient_id: str
    patient_name: str
    assignee: str
    status: ClaimReturnEventStatus
    title: str
    reason_code: str | None = None
    severity: Literal["overdue", "due_soon", "no_due"]
    received_at: datetime
    due_at: datetime | None = None
    hours_until_due: float | None = None


class ClaimReturnSlaEscalationRequest(BaseModel):
    assignee: str = "管理者"
    include_due_soon: bool = False
    note: str | None = None


class ClaimReturnSlaEscalationRead(BaseModel):
    escalated_count: int
    event_ids: list[int]
    assignee: str
    note: str | None = None


class ClaimSlaSettingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    due_soon_hours: int
    include_no_due: bool
    escalation_assignee: str
    notify_destinations: list[dict[str, object]]
    escalation_rules: list[dict[str, object]]
    note: str | None = None
    updated_by: str | None = None
    updated_at: datetime


class ClaimSlaSettingUpdateRequest(BaseModel):
    due_soon_hours: int = 48
    include_no_due: bool = True
    escalation_assignee: str = "管理者"
    notify_destinations: list[dict[str, object]] = []
    escalation_rules: list[dict[str, object]] = []
    note: str | None = None


class ClaimSlaNotificationDryRunRead(BaseModel):
    generated_at: datetime
    destination_count: int
    alert_count: int
    destinations: list[dict[str, object]]
    alerts: list[ClaimReturnSlaAlertRead]


class MonthlyClaimCloseCancelRequest(BaseModel):
    reason: str


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


MonthlyCloseSummaryRead.model_rebuild()
