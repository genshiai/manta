from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

from ..karte.schemas import DrugCategory


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
    status: Literal["available", "occupied", "cleaning", "blocked"]
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


class ChartOrderMasterRead(BaseModel):
    prescription_catalog: list[PrescriptionCatalogItemRead]
    standard_usage_masters: list[StandardUsageMasterRead]
    prescription_sets: list[PrescriptionSetMasterRead]
    lab_set_options: list[LabSetOptionRead]
    reservation_slots: list[ReservationSlotRead]
    chart_templates: list[ChartTemplateRead]
