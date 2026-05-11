from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from ..common.schemas import AuditLogRead


DrugCategory = Literal["内服", "外用", "頓服", "注射", "歯科"]


class DetailItem(BaseModel):
    label: str
    value: str


class AlertItem(BaseModel):
    label: str
    color: str


class PatientProfileItem(BaseModel):
    label: str
    value: str


class ProblemItem(BaseModel):
    name: str
    since: str
    status: Literal["active", "resolved"]
    management_number: str | None = None
    icd10_code: str | None = None
    diagnosis_type: Literal["principal", "secondary"] | None = None


class VisitHistoryItem(BaseModel):
    date: str
    department: str
    summary: str
    active: bool = False


class VitalItem(BaseModel):
    label: str
    value: str
    unit: str


class LabTrendPoint(BaseModel):
    date: str
    value: str
    flag: Literal["high", "normal"] = "normal"


class LabResultItem(BaseModel):
    item: str
    result: str
    baseline: str
    previous: str
    flag: Literal["high", "normal"]
    reported_at: str | None = None
    history: list[LabTrendPoint] = []


class LabLongTrendPoint(BaseModel):
    date: str
    value: str
    numeric_value: float | None = None
    unit: str | None = None
    flag: Literal["high", "normal"] = "normal"
    observation_id: str


class LabLongTrendItem(BaseModel):
    item: str
    code: str | None = None
    display: str | None = None
    baseline: str | None = None
    latest_value: str | None = None
    previous_value: str | None = None
    latest_date: str | None = None
    delta: float | None = None
    delta_label: str = "比較不可"
    abnormal_count: int = 0
    point_count: int
    points: list[LabLongTrendPoint]


class ChartHistoryItem(BaseModel):
    date: str
    department: str
    title: str
    summary: str


class ImagingOrderItem(BaseModel):
    category: str
    status: Literal["scheduled", "draft"]
    scheduled_at: str
    note: str


class ImagingOrderCreateRequest(BaseModel):
    category: str
    status: Literal["scheduled", "draft"]
    scheduled_at: str
    note: str
    actor: str


class ProcedureOrderItem(BaseModel):
    title: str
    status: Literal["planned", "done"]
    note: str


class ProcedureOrderCreateRequest(BaseModel):
    title: str
    status: Literal["planned", "done"]
    note: str
    actor: str


class PatientSummaryRead(BaseModel):
    id: str
    name: str
    kana: str
    age: str
    sex: str
    department: str
    doctor: str
    reception_number: str
    reservation_time: str
    reception_time: str
    status: str
    elapsed: str
    lab_progress: str
    same_name_duplicate_count: int
    comment: str
    demographics: list[DetailItem]
    alerts: list[AlertItem]


class PatientContextRead(BaseModel):
    patient_profile: list[PatientProfileItem]
    problems: list[ProblemItem]


class PatientContextUpdateRequest(BaseModel):
    patient_profile: list[PatientProfileItem]
    problems: list[ProblemItem]


class PatientStatusUpdateRequest(BaseModel):
    status: str
    actor: str
    detail: str


class ChartNoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    version: int
    subjective: str
    objective: str
    assessment: str
    plan: str
    saved_by: str
    saved_at: datetime


class ChartSaveRequest(BaseModel):
    subjective: str
    objective: str
    assessment: str
    plan: str
    saved_by: str


class PrescriptionCreateRequest(BaseModel):
    type: str
    days: str
    drug_name: str
    dosage: str
    actor: str


class PrescriptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    type: str
    days: str
    drug_name: str
    dosage: str
    created_at: datetime
    warnings: list[str] = []
    warning_details: list[dict[str, str | None]] = []


class PrescriptionHistoryGroupRead(BaseModel):
    date: str
    label: str
    is_latest: bool = False
    item_count: int
    items: list[PrescriptionRead]


class PrescriptionTimelineItemRead(PrescriptionRead):
    is_current: bool = False
    catalog_id: str | None = None
    pmda_info_url: str | None = None
    warnings: list[str] = []


class PrescriptionTimelineGroupRead(BaseModel):
    date: str
    label: str
    is_latest: bool = False
    is_today: bool = False
    copyable: bool = True
    item_count: int
    warning_count: int
    items: list[PrescriptionTimelineItemRead]


class PrescriptionCopyLastRequest(BaseModel):
    actor: str
    source_date: str | None = None


class PrescriptionCopySkippedItem(BaseModel):
    drug_name: str
    reason: str


class PrescriptionDiffItem(BaseModel):
    drug_name: str
    status: Literal["continued", "changed", "to_copy", "skipped", "added"]
    label: str
    source_dosage: str | None = None
    current_dosage: str | None = None
    reason: str | None = None


class PrescriptionCopyPreviewRead(BaseModel):
    source_date: str
    planned_count: int
    skipped_count: int
    planned_items: list[PrescriptionTimelineItemRead]
    skipped_items: list[PrescriptionCopySkippedItem]
    diff_items: list[PrescriptionDiffItem]


class PrescriptionCopyLastRead(BaseModel):
    source_date: str
    copied_count: int
    skipped_count: int
    copied_items: list[PrescriptionRead]
    skipped_items: list[PrescriptionCopySkippedItem]
    timeline: list[PrescriptionTimelineGroupRead]


class LabOrderCreateRequest(BaseModel):
    category: str
    urgency: str | None = None
    items: list[str]
    actor: str


class LabOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    category: str
    status: str
    urgency: str | None = None
    items: list[str]
    created_at: datetime


class ReservationUpsertRequest(BaseModel):
    slot_id: str | None = None
    scheduled_for: str
    department: str
    doctor: str
    note: str
    actor: str


class ReservationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slot_id: str | None = None
    scheduled_for: str
    department: str
    doctor: str
    note: str
    updated_at: datetime


class ChartWorkspaceRead(BaseModel):
    patient: PatientSummaryRead
    latest_note: ChartNoteRead | None
    versions: list[ChartNoteRead]
    prescriptions: list[PrescriptionRead]
    prescription_history: list[PrescriptionHistoryGroupRead]
    lab_orders: list[LabOrderRead]
    reservation: ReservationRead | None
    audit_logs: list[AuditLogRead]
    patient_profile: list[PatientProfileItem]
    problems: list[ProblemItem]
    visit_history: list[VisitHistoryItem]
    vitals: list[VitalItem]
    lab_results: list[LabResultItem]
    chart_history: list[ChartHistoryItem]
    imaging_orders: list[ImagingOrderItem]
    procedure_orders: list[ProcedureOrderItem]
