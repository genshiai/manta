from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

UserRole = Literal["医師", "管理者"]
DrugCategory = Literal["内服", "外用", "頓服", "注射", "歯科"]
AdmissionStatus = Literal["planned", "active", "discharge_permitted", "discharged", "cancelled"]
BedStatus = Literal["available", "occupied", "cleaning", "blocked"]
InstructionStatus = Literal["pending", "done", "cancelled"]


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


class PrescriptionCatalogItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sort_order: int
    is_active: bool
    drug_name: str
    category: DrugCategory
    dosage_options: list[str]
    generic_name: str | None = None
    name_kana: str | None = None
    aliases: list[str] = []
    yj_code: str | None = None
    hot_code: str | None = None
    dosage_form: str | None = None
    strength: str | None = None
    standard_usage_code: str | None = None
    default_days: str | None = None
    pmda_info_url: str | None = None
    allergy_conflict_label: str | None = None
    related_problem: str | None = None
    manufacturer: str | None = None
    drug_price: Decimal | None = None
    generic_reimbursement_flag: str | None = None
    brand_flag: str | None = None
    has_generic: bool | None = None
    transitional_expiry: str | None = None
    source_note: str | None = None


class PrescriptionCatalogItemCreateRequest(BaseModel):
    id: str
    sort_order: int
    is_active: bool = True
    drug_name: str
    category: DrugCategory
    dosage_options: list[str]
    generic_name: str | None = None
    name_kana: str | None = None
    aliases: list[str] = []
    yj_code: str | None = None
    hot_code: str | None = None
    dosage_form: str | None = None
    strength: str | None = None
    standard_usage_code: str | None = None
    default_days: str | None = None
    pmda_info_url: str | None = None
    allergy_conflict_label: str | None = None
    related_problem: str | None = None
    manufacturer: str | None = None
    drug_price: Decimal | None = None
    generic_reimbursement_flag: str | None = None
    brand_flag: str | None = None
    has_generic: bool | None = None
    transitional_expiry: str | None = None
    source_note: str | None = None


class PrescriptionCatalogItemUpdateRequest(BaseModel):
    sort_order: int
    is_active: bool = True
    drug_name: str
    category: DrugCategory
    dosage_options: list[str]
    generic_name: str | None = None
    name_kana: str | None = None
    aliases: list[str] = []
    yj_code: str | None = None
    hot_code: str | None = None
    dosage_form: str | None = None
    strength: str | None = None
    standard_usage_code: str | None = None
    default_days: str | None = None
    pmda_info_url: str | None = None
    allergy_conflict_label: str | None = None
    related_problem: str | None = None
    manufacturer: str | None = None
    drug_price: Decimal | None = None
    generic_reimbursement_flag: str | None = None
    brand_flag: str | None = None
    has_generic: bool | None = None
    transitional_expiry: str | None = None
    source_note: str | None = None


class StandardUsageMasterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sort_order: int
    is_active: bool
    label: str
    category: DrugCategory
    instruction: str
    default_days: str
    note: str | None = None


class StandardUsageMasterCreateRequest(BaseModel):
    id: str
    sort_order: int
    is_active: bool = True
    label: str
    category: DrugCategory
    instruction: str
    default_days: str
    note: str | None = None


class StandardUsageMasterUpdateRequest(BaseModel):
    sort_order: int
    is_active: bool = True
    label: str
    category: DrugCategory
    instruction: str
    default_days: str
    note: str | None = None


class PrescriptionSetMasterItem(BaseModel):
    drug_id: str
    dosage: str
    days: str
    note: str | None = None


class PrescriptionSetMasterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sort_order: int
    is_active: bool
    label: str
    department: str
    related_problem: str | None = None
    note: str | None = None
    items: list[PrescriptionSetMasterItem]
    included_set_ids: list[str] = []


class PrescriptionSetMasterCreateRequest(BaseModel):
    id: str
    sort_order: int
    is_active: bool = True
    label: str
    department: str
    related_problem: str | None = None
    note: str | None = None
    items: list[PrescriptionSetMasterItem]
    included_set_ids: list[str] = []


class PrescriptionSetMasterUpdateRequest(BaseModel):
    sort_order: int
    is_active: bool = True
    label: str
    department: str
    related_problem: str | None = None
    note: str | None = None
    items: list[PrescriptionSetMasterItem]
    included_set_ids: list[str] = []


class LabSetOptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sort_order: int
    is_active: bool
    label: str
    items: list[str]
    included_set_ids: list[str] = []


class LabSetOptionCreateRequest(BaseModel):
    id: str
    sort_order: int
    is_active: bool = True
    label: str
    items: list[str]
    included_set_ids: list[str] = []


class LabSetOptionUpdateRequest(BaseModel):
    sort_order: int
    is_active: bool = True
    label: str
    items: list[str]
    included_set_ids: list[str] = []


class ReservationSlotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sort_order: int
    is_active: bool
    date: str
    time: str
    department: str
    doctor: str
    state: Literal["available", "few", "full"]
    capacity: int = 1
    booked_count: int = 0
    remaining_count: int = 1


class ChartTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sort_order: int
    is_active: bool
    label: str
    department: str
    subjective: str
    objective: str
    assessment: str
    plan: str


class ChartTemplateCreateRequest(BaseModel):
    id: str
    sort_order: int
    is_active: bool = True
    label: str
    department: str
    subjective: str
    objective: str
    assessment: str
    plan: str


class ChartTemplateUpdateRequest(BaseModel):
    sort_order: int
    is_active: bool = True
    label: str
    department: str
    subjective: str
    objective: str
    assessment: str
    plan: str


class WardMasterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sort_order: int
    is_active: bool
    name: str
    floor: str
    department: str
    note: str | None = None


class BedMasterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    ward_id: str
    sort_order: int
    is_active: bool
    room_number: str
    bed_number: str
    bed_label: str
    status: BedStatus
    note: str | None = None


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
    status: InstructionStatus


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


class DiagnosisMasterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    management_number: str
    disease_name: str
    disease_name_kana: str
    adoption_level: str
    exchange_code: str | None = None
    icd10_code: str | None = None
    icd10_subcode: str | None = None
    claim_code: str | None = None
    is_deleted: bool
    updated_at_master: str | None = None
    matched_alias: str | None = None
    migration_source_management_number: str | None = None
    migration_source_name: str | None = None


class ReservationSlotCreateRequest(BaseModel):
    id: str
    sort_order: int
    is_active: bool = True
    date: str
    time: str
    department: str
    doctor: str
    state: Literal["available", "few", "full"]
    capacity: int = 1


class ReservationSlotUpdateRequest(BaseModel):
    sort_order: int
    is_active: bool = True
    date: str
    time: str
    department: str
    doctor: str
    state: Literal["available", "few", "full"]
    capacity: int = 1


class ChartOrderMasterRead(BaseModel):
    prescription_catalog: list[PrescriptionCatalogItemRead]
    standard_usage_masters: list[StandardUsageMasterRead]
    prescription_sets: list[PrescriptionSetMasterRead]
    lab_set_options: list[LabSetOptionRead]
    reservation_slots: list[ReservationSlotRead]
    chart_templates: list[ChartTemplateRead]


class UserSessionRead(BaseModel):
    user_id: str
    display_name: str
    department: str
    role: UserRole
    logged_in_at: datetime
    password_expires_at: date


class AuthTokenRead(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserSessionRead


class UserSummaryRead(BaseModel):
    user_id: str
    display_name: str
    department: str
    role: UserRole
    password_expires_at: date


class UserCreateRequest(BaseModel):
    user_id: str
    password: str
    display_name: str
    department: str
    role: UserRole
    password_expires_at: date


class UserUpdateRequest(BaseModel):
    display_name: str
    department: str
    role: UserRole
    password_expires_at: date


class UserPasswordResetRequest(BaseModel):
    password: str


class LoginRequest(BaseModel):
    user_id: str
    password: str


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


class PatientStatusUpdateRequest(BaseModel):
    status: str
    actor: str
    detail: str


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    actor: str
    action: str
    scope: str
    detail: str
    patient_id: str | None = None
    patient_name: str | None = None
    created_at: datetime


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
