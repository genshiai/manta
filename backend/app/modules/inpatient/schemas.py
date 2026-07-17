from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from ..karte.schemas import PatientSummaryRead
from ..master_data.schemas import BedMasterRead, WardMasterRead


AdmissionStatus = Literal["planned", "active", "discharge_permitted", "discharged", "cancelled"]
BedStatus = Literal["available", "occupied", "cleaning", "blocked"]
InstructionStatus = Literal["pending", "done", "cancelled"]
InpatientDocumentStatus = Literal["draft", "signed", "archived"]
InpatientDocumentType = Literal["admission_care_plan", "discharge_summary", "discharge_instruction"]
PathwayTaskStatus = Literal["pending", "done", "variance", "skipped"]
AiSummaryReviewStatus = Literal["accepted", "rejected"]
DischargePlanStatus = Literal["draft", "reviewed", "ready"]


class BedBoardItemRead(BaseModel):
    bed: BedMasterRead
    ward: WardMasterRead
    current_admission_id: int | None = None
    current_patient: PatientSummaryRead | None = None
    stay_days: int | None = None


class BedStatusUpdateRequest(BaseModel):
    status: BedStatus
    note: str | None = None


class InpatientInstructionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    admission_id: int
    category: str
    title: str
    status: InstructionStatus
    due_at: datetime | None = None
    created_by: str
    created_at: datetime


class InpatientInstructionCreateRequest(BaseModel):
    category: str
    title: str
    due_at: datetime | None = None


class InpatientInstructionUpdateRequest(BaseModel):
    category: str | None = None
    title: str | None = None
    due_at: datetime | None = None
    status: InstructionStatus | None = None


class NursingNoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    admission_id: int
    note_type: str
    focus: str | None = None
    subjective: str
    objective: str
    assessment: str
    plan: str
    recorded_by: str
    recorded_at: datetime


class NursingNoteCreateRequest(BaseModel):
    note_type: str = "SOAP"
    focus: str | None = None
    subjective: str = ""
    objective: str = ""
    assessment: str = ""
    plan: str = ""


class InpatientDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    admission_id: int
    document_type: InpatientDocumentType
    title: str
    status: InpatientDocumentStatus
    body: str
    created_by: str
    created_at: datetime
    updated_at: datetime


class InpatientDocumentCreateRequest(BaseModel):
    document_type: InpatientDocumentType
    title: str | None = None
    body: str | None = None


class InpatientDocumentUpdateRequest(BaseModel):
    title: str | None = None
    body: str | None = None
    status: InpatientDocumentStatus | None = None


class InpatientProgressDateRow(BaseModel):
    date: str
    vitals: list[str] = []
    labs: list[str] = []
    prescriptions: list[str] = []
    lab_orders: list[str] = []
    instructions: list[str] = []
    nursing_notes: list[str] = []


class InpatientProgressRead(BaseModel):
    admission_id: int
    patient_id: str
    rows: list[InpatientProgressDateRow]


class InpatientSummaryDraftRead(BaseModel):
    admission_id: int
    patient_id: str
    title: str
    period_label: str
    source_counts: dict[str, int]
    key_events: list[str]
    body: str
    generated_at: datetime


class InpatientEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    admission_id: int
    event_type: str
    title: str
    detail: str | None = None
    actor: str
    occurred_at: datetime


class InpatientPathwayTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pathway_assignment_id: int
    day_offset: int
    category: str
    title: str
    role: str | None = None
    due_on: date | None = None
    due_time: str | None = None
    status: PathwayTaskStatus
    variance_note: str | None = None
    updated_by: str | None = None
    updated_at: datetime


class InpatientPathwayRead(BaseModel):
    id: int
    admission_id: int
    pathway_master_id: str | None = None
    pathway_name: str
    status: str
    started_on: date
    assigned_by: str
    created_at: datetime
    updated_at: datetime
    tasks: list[InpatientPathwayTaskRead]


class InpatientPathwayTaskMasterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    pathway_master_id: str
    sort_order: int
    day_offset: int
    category: str
    title: str
    role: str | None = None
    due_time: str | None = None


class InpatientPathwayMasterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sort_order: int
    is_active: bool
    name: str
    department: str
    primary_diagnosis: str | None = None
    expected_days: int
    note: str | None = None
    tasks: list[InpatientPathwayTaskMasterRead] = []


class InpatientPathwayCreateRequest(BaseModel):
    pathway_master_id: str | None = None
    pathway_name: str = "標準入院パス"
    started_on: date | None = None


class InpatientPathwayTaskUpdateRequest(BaseModel):
    status: PathwayTaskStatus
    variance_note: str | None = None


class InpatientAiSummaryReviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    admission_id: int
    summary_title: str
    summary_body: str
    status: AiSummaryReviewStatus
    source_counts: dict[str, int]
    reviewed_by: str
    review_note: str | None = None
    created_at: datetime


class InpatientAiSummaryReviewCreateRequest(BaseModel):
    summary_title: str
    summary_body: str
    status: AiSummaryReviewStatus
    source_counts: dict[str, int] = {}
    review_note: str | None = None


class InpatientDischargePlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    admission_id: int
    status: DischargePlanStatus
    discharge_medication_note: str
    billing_candidates: list[dict[str, str]]
    follow_up_note: str
    reviewed_by: str
    reviewed_at: datetime
    updated_at: datetime


class InpatientDischargePlanUpdateRequest(BaseModel):
    status: DischargePlanStatus = "reviewed"
    discharge_medication_note: str | None = None
    billing_candidates: list[dict[str, str]] | None = None
    follow_up_note: str | None = None


class AdmissionRead(BaseModel):
    id: int
    patient: PatientSummaryRead
    status: AdmissionStatus
    requested_at: datetime
    admitted_at: datetime | None = None
    discharge_permitted_at: datetime | None = None
    discharged_at: datetime | None = None
    ward: WardMasterRead | None = None
    bed: BedMasterRead | None = None
    attending_doctor: str
    team: str | None = None
    primary_diagnosis: str | None = None
    care_level: str | None = None
    note: str | None = None
    stay_days: int
    pending_instruction_count: int
    latest_nursing_note: NursingNoteRead | None = None
    updated_at: datetime


class AdmissionCreateRequest(BaseModel):
    status: AdmissionStatus = "planned"
    ward_id: str | None = None
    bed_id: str | None = None
    admitted_at: datetime | None = None
    attending_doctor: str
    team: str | None = None
    primary_diagnosis: str | None = None
    care_level: str | None = None
    note: str | None = None


class AdmissionTransferRequest(BaseModel):
    ward_id: str
    bed_id: str
    note: str | None = None


class AdmissionDischargeRequest(BaseModel):
    note: str | None = None


class InpatientCareAssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    admission_id: int
    user_id: str
    user_display_name: str
    role: str
    assigned_by: str
    created_at: datetime


class InpatientCareAssignmentCreateRequest(BaseModel):
    role: str = "担当"
