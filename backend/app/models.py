from __future__ import annotations

from datetime import date, datetime, timezone

from decimal import Decimal

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    password: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(128))
    department: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(32))
    password_expires_at: Mapped[date] = mapped_column(Date)


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    kana: Mapped[str] = mapped_column(String(128))
    age: Mapped[str] = mapped_column(String(32))
    sex: Mapped[str] = mapped_column(String(16))
    # FHIR / JP Core 準拠カラム (migration 20260419_0010 で追加)。
    # /fhir/Patient 経由で書き込まれた値が入る。/api/* は引き続き name/kana/sex を使う。
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(16), nullable=True)
    family_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    given_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    family_name_kana: Mapped[str | None] = mapped_column(String(64), nullable=True)
    given_name_kana: Mapped[str | None] = mapped_column(String(64), nullable=True)
    identifier_json: Mapped[list[dict[str, str]] | None] = mapped_column(JSON, nullable=True)
    department: Mapped[str] = mapped_column(String(128))
    doctor: Mapped[str] = mapped_column(String(128))
    reception_number: Mapped[str] = mapped_column(String(16))
    reservation_time: Mapped[str] = mapped_column(String(16))
    reception_time: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(32))
    elapsed: Mapped[str] = mapped_column(String(32))
    lab_progress: Mapped[str] = mapped_column(String(32))
    same_name_duplicate_count: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text)
    demographics: Mapped[list[dict[str, str]]] = mapped_column(JSON)
    alerts: Mapped[list[dict[str, str]]] = mapped_column(JSON)
    profile_items: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    problems: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    visit_history: Mapped[list[dict[str, str | bool]]] = mapped_column(JSON, default=list)
    vitals: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    lab_results: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    chart_history: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    imaging_orders: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    procedure_orders: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)


class Condition(Base):
    """FHIR R4B Condition / JP Core に準拠した病名レコード (Step 2)。

    旧 `patients.problems` JSON からマイグレーションでバックフィル済み。
    /fhir/Condition 経由で CRUD する。/api/* は当面 patients.problems を参照する。
    """

    __tablename__ = "conditions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    patient_id: Mapped[str] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )
    clinical_status: Mapped[str] = mapped_column(String(32))
    verification_status: Mapped[str] = mapped_column(String(32), default="confirmed")
    category: Mapped[str] = mapped_column(String(32), default="problem-list-item")
    icd10_code: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    management_number: Mapped[str | None] = mapped_column(
        String(32), nullable=True, index=True
    )
    disease_name: Mapped[str] = mapped_column(String(255))
    onset_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    onset_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    abatement_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    recorded_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class Observation(Base):
    """FHIR R4B Observation / JP Core に準拠した観察レコード (Step 3)。

    vitals と lab_results を統一テーブルで扱う。`category` で区別する。
    血圧のような複合値は Step 3 時点では value_string に格納し、Observation.component
    への展開は将来ステップ (Step 4+) で実施する。
    """

    __tablename__ = "observations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    patient_id: Mapped[str] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(16), default="final")
    category: Mapped[str] = mapped_column(String(32), index=True)
    code_system: Mapped[str | None] = mapped_column(String(128), nullable=True)
    code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    code_display: Mapped[str | None] = mapped_column(String(255), nullable=True)
    code_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    value_quantity_value: Mapped[Decimal | None] = mapped_column(
        Numeric(precision=18, scale=6), nullable=True
    )
    value_quantity_unit: Mapped[str | None] = mapped_column(String(64), nullable=True)
    value_quantity_system: Mapped[str | None] = mapped_column(String(128), nullable=True)
    value_quantity_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    value_string: Mapped[str | None] = mapped_column(Text, nullable=True)
    interpretation_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    reference_range_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    effective_datetime: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    issued_datetime: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class ChartNote(Base):
    __tablename__ = "chart_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    subjective: Mapped[str] = mapped_column(Text)
    objective: Mapped[str] = mapped_column(Text)
    assessment: Mapped[str] = mapped_column(Text)
    plan: Mapped[str] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer)
    saved_by: Mapped[str] = mapped_column(String(128))
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PrescriptionOrder(Base):
    __tablename__ = "prescription_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(32))
    days: Mapped[str] = mapped_column(String(32))
    drug_name: Mapped[str] = mapped_column(String(255))
    dosage: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LabOrder(Base):
    __tablename__ = "lab_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32))
    urgency: Mapped[str | None] = mapped_column(String(32), nullable=True)
    items: Mapped[list[str]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), index=True, unique=True
    )
    slot_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    scheduled_for: Mapped[str] = mapped_column(String(255))
    department: Mapped[str] = mapped_column(String(255))
    doctor: Mapped[str] = mapped_column(String(255))
    note: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class PrescriptionCatalogMaster(Base):
    __tablename__ = "prescription_catalog_masters"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    drug_name: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(32))
    dosage_options: Mapped[list[str]] = mapped_column(JSON)
    generic_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    name_kana: Mapped[str | None] = mapped_column(String(255), nullable=True)
    aliases: Mapped[list[str]] = mapped_column(JSON, default=list)
    yj_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    hot_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dosage_form: Mapped[str | None] = mapped_column(String(64), nullable=True)
    strength: Mapped[str | None] = mapped_column(String(64), nullable=True)
    standard_usage_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    default_days: Mapped[str | None] = mapped_column(String(16), nullable=True)
    pmda_info_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    allergy_conflict_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    related_problem: Mapped[str | None] = mapped_column(String(255), nullable=True)
    manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    drug_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    generic_reimbursement_flag: Mapped[str | None] = mapped_column(String(32), nullable=True)
    brand_flag: Mapped[str | None] = mapped_column(String(32), nullable=True)
    has_generic: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    transitional_expiry: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_note: Mapped[str | None] = mapped_column(Text, nullable=True)


class ReceiptDrugMaster(Base):
    __tablename__ = "receipt_drug_masters"

    receipt_drug_code: Mapped[str] = mapped_column(String(16), primary_key=True)
    change_type: Mapped[str] = mapped_column(String(8))
    master_type: Mapped[str] = mapped_column(String(1))
    name: Mapped[str] = mapped_column(String(255))
    name_kana: Mapped[str | None] = mapped_column(String(255), nullable=True)
    unit_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    unit_name: Mapped[str | None] = mapped_column(String(32), nullable=True)
    price_type: Mapped[str | None] = mapped_column(String(8), nullable=True)
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    generic_flag: Mapped[str | None] = mapped_column(String(8), nullable=True)
    dosage_form_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    changed_at: Mapped[str | None] = mapped_column(String(8), nullable=True)
    discontinued_at: Mapped[str | None] = mapped_column(String(8), nullable=True)
    yj_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    public_order: Mapped[str | None] = mapped_column(String(16), nullable=True)
    transitional_expiry: Mapped[str | None] = mapped_column(String(8), nullable=True)
    base_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    listed_at: Mapped[str | None] = mapped_column(String(8), nullable=True)
    generic_prescription_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    generic_prescription_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    generic_prescription_addition_flag: Mapped[str | None] = mapped_column(String(8), nullable=True)
    anti_hiv_flag: Mapped[str | None] = mapped_column(String(8), nullable=True)
    long_term_listed_related_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    selective_care_flag: Mapped[str | None] = mapped_column(String(8), nullable=True)
    source_file: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ReceiptTransitionalDrug(Base):
    __tablename__ = "receipt_transitional_drugs"

    receipt_drug_code: Mapped[str] = mapped_column(String(16), primary_key=True)
    dosage_form: Mapped[str | None] = mapped_column(String(16), nullable=True)
    yj_code: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(255))
    unit_name: Mapped[str | None] = mapped_column(String(32), nullable=True)
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    brand_related_flag: Mapped[str | None] = mapped_column(String(32), nullable=True)
    non_listed_brand_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    transitional_expiry: Mapped[str] = mapped_column(String(8), index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_file: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ReceiptLongTermListedDrug(Base):
    __tablename__ = "receipt_long_term_listed_drugs"

    yj_code: Mapped[str] = mapped_column(String(64), primary_key=True)
    row_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dosage_form: Mapped[str | None] = mapped_column(String(16), nullable=True)
    medical_necessity_receipt_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    medical_necessity_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    patient_request_receipt_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    patient_request_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_file: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ReceiptMedicalPracticeMaster(Base):
    __tablename__ = "receipt_medical_practice_masters"

    receipt_code: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    name_kana: Mapped[str | None] = mapped_column(String(255), nullable=True)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    unit_name: Mapped[str | None] = mapped_column(String(32), nullable=True)
    effective_from: Mapped[str | None] = mapped_column(String(8), nullable=True)
    effective_to: Mapped[str | None] = mapped_column(String(8), nullable=True)
    source_file: Mapped[str] = mapped_column(String(255), default="demo")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class HotDrugCodeMapping(Base):
    __tablename__ = "hot_drug_code_mappings"

    id: Mapped[str] = mapped_column(String(160), primary_key=True)
    update_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    updated_at_master: Mapped[str | None] = mapped_column(String(8), nullable=True)
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    brand_name: Mapped[str] = mapped_column(String(255))
    brand_name_kana_1: Mapped[str | None] = mapped_column(String(8), nullable=True)
    brand_name_kana_2: Mapped[str | None] = mapped_column(String(8), nullable=True)
    brand_name_kana_3: Mapped[str | None] = mapped_column(String(8), nullable=True)
    listing_classification: Mapped[str | None] = mapped_column(String(64), nullable=True)
    yj_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    listed_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    listed_at: Mapped[str | None] = mapped_column(String(8), nullable=True)
    transitional_expiry: Mapped[str | None] = mapped_column(String(8), nullable=True)
    approval_specification: Mapped[str | None] = mapped_column(String(255), nullable=True)
    drug_category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    dosage_form: Mapped[str | None] = mapped_column(String(64), nullable=True)
    package_form: Mapped[str | None] = mapped_column(String(64), nullable=True)
    package_quantity: Mapped[str | None] = mapped_column(String(32), nullable=True)
    package_unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    total_quantity: Mapped[str | None] = mapped_column(String(32), nullable=True)
    total_quantity_unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    dispensing_package_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    dispensing_package_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dispensing_package_subdivision: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sales_package_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    carton_package_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    jan_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    sales_discontinued_at: Mapped[str | None] = mapped_column(String(8), nullable=True)
    last_lot_expiry: Mapped[str | None] = mapped_column(String(8), nullable=True)
    source_file: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class StandardUsageMaster(Base):
    __tablename__ = "standard_usage_masters"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    label: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(32))
    instruction: Mapped[str] = mapped_column(String(255))
    default_days: Mapped[str] = mapped_column(String(16))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class PrescriptionSetMaster(Base):
    __tablename__ = "prescription_set_masters"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    label: Mapped[str] = mapped_column(String(255))
    department: Mapped[str] = mapped_column(String(128))
    related_problem: Mapped[str | None] = mapped_column(String(255), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    items: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    included_set_ids: Mapped[list[str]] = mapped_column(JSON, default=list)


class LabSetMaster(Base):
    __tablename__ = "lab_set_masters"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    label: Mapped[str] = mapped_column(String(255))
    items: Mapped[list[str]] = mapped_column(JSON)
    included_set_ids: Mapped[list[str]] = mapped_column(JSON, default=list)


class ReservationSlotMaster(Base):
    __tablename__ = "reservation_slot_masters"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    date: Mapped[str] = mapped_column(String(64))
    time: Mapped[str] = mapped_column(String(32))
    department: Mapped[str] = mapped_column(String(128))
    doctor: Mapped[str] = mapped_column(String(128))
    state: Mapped[str] = mapped_column(String(32))
    capacity: Mapped[int] = mapped_column(Integer, default=1)


class WardMaster(Base):
    __tablename__ = "ward_masters"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    name: Mapped[str] = mapped_column(String(128))
    floor: Mapped[str] = mapped_column(String(32))
    department: Mapped[str] = mapped_column(String(128))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class BedMaster(Base):
    __tablename__ = "bed_masters"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    ward_id: Mapped[str] = mapped_column(ForeignKey("ward_masters.id"), index=True)
    sort_order: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    room_number: Mapped[str] = mapped_column(String(32))
    bed_number: Mapped[str] = mapped_column(String(32))
    bed_label: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="available", index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class Admission(Base):
    __tablename__ = "admissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="planned", index=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    admitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    discharge_permitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    discharged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    ward_id: Mapped[str | None] = mapped_column(ForeignKey("ward_masters.id"), nullable=True, index=True)
    bed_id: Mapped[str | None] = mapped_column(ForeignKey("bed_masters.id"), nullable=True, index=True)
    attending_doctor: Mapped[str] = mapped_column(String(128))
    team: Mapped[str | None] = mapped_column(String(128), nullable=True)
    primary_diagnosis: Mapped[str | None] = mapped_column(String(255), nullable=True)
    care_level: Mapped[str | None] = mapped_column(String(64), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class InpatientInstruction(Base):
    __tablename__ = "inpatient_instructions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    admission_id: Mapped[int] = mapped_column(ForeignKey("admissions.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_by: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class NursingNote(Base):
    __tablename__ = "nursing_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    admission_id: Mapped[int] = mapped_column(ForeignKey("admissions.id", ondelete="CASCADE"), index=True)
    note_type: Mapped[str] = mapped_column(String(64), default="SOAP")
    focus: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subjective: Mapped[str] = mapped_column(Text, default="")
    objective: Mapped[str] = mapped_column(Text, default="")
    assessment: Mapped[str] = mapped_column(Text, default="")
    plan: Mapped[str] = mapped_column(Text, default="")
    recorded_by: Mapped[str] = mapped_column(String(128))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class InpatientDocument(Base):
    __tablename__ = "inpatient_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    admission_id: Mapped[int] = mapped_column(ForeignKey("admissions.id", ondelete="CASCADE"), index=True)
    document_type: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    body: Mapped[str] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class InpatientEvent(Base):
    __tablename__ = "inpatient_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    admission_id: Mapped[int] = mapped_column(ForeignKey("admissions.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(255))
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor: Mapped[str] = mapped_column(String(128))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class InpatientPathwayAssignment(Base):
    __tablename__ = "inpatient_pathway_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    admission_id: Mapped[int] = mapped_column(ForeignKey("admissions.id", ondelete="CASCADE"), index=True)
    pathway_master_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    pathway_name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    started_on: Mapped[date] = mapped_column(Date)
    assigned_by: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class InpatientPathwayMaster(Base):
    __tablename__ = "inpatient_pathway_masters"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    name: Mapped[str] = mapped_column(String(255))
    department: Mapped[str] = mapped_column(String(128), index=True)
    primary_diagnosis: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    expected_days: Mapped[int] = mapped_column(Integer, default=7)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class InpatientPathwayTaskMaster(Base):
    __tablename__ = "inpatient_pathway_task_masters"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    pathway_master_id: Mapped[str] = mapped_column(
        ForeignKey("inpatient_pathway_masters.id", ondelete="CASCADE"), index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer)
    day_offset: Mapped[int] = mapped_column(Integer, index=True)
    category: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(255))
    role: Mapped[str | None] = mapped_column(String(64), nullable=True)
    due_time: Mapped[str | None] = mapped_column(String(16), nullable=True)


class InpatientPathwayTask(Base):
    __tablename__ = "inpatient_pathway_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pathway_assignment_id: Mapped[int] = mapped_column(
        ForeignKey("inpatient_pathway_assignments.id", ondelete="CASCADE"), index=True
    )
    day_offset: Mapped[int] = mapped_column(Integer, index=True)
    category: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(255))
    role: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    due_on: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    due_time: Mapped[str | None] = mapped_column(String(16), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    variance_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class InpatientAiSummaryReview(Base):
    __tablename__ = "inpatient_ai_summary_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    admission_id: Mapped[int] = mapped_column(ForeignKey("admissions.id", ondelete="CASCADE"), index=True)
    summary_title: Mapped[str] = mapped_column(String(255))
    summary_body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    source_counts: Mapped[dict[str, int]] = mapped_column(JSON, default=dict)
    reviewed_by: Mapped[str] = mapped_column(String(128))
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class InpatientDischargePlan(Base):
    __tablename__ = "inpatient_discharge_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    admission_id: Mapped[int] = mapped_column(ForeignKey("admissions.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    discharge_medication_note: Mapped[str] = mapped_column(Text, default="")
    billing_candidates: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    follow_up_note: Mapped[str] = mapped_column(Text, default="")
    reviewed_by: Mapped[str] = mapped_column(String(128))
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
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


class OrcaAdapterSetting(Base):
    __tablename__ = "orca_adapter_settings"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    auth_type: Mapped[str] = mapped_column(String(32), default="none")
    username: Mapped[str | None] = mapped_column(String(128), nullable=True)
    client_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    claim_endpoint: Mapped[str] = mapped_column(String(255), default="/api01rv2/claim")
    mode: Mapped[str] = mapped_column(String(32), default="mock", index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ChartTemplateMaster(Base):
    __tablename__ = "chart_template_masters"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    label: Mapped[str] = mapped_column(String(255))
    department: Mapped[str] = mapped_column(String(128))
    subjective: Mapped[str] = mapped_column(Text)
    objective: Mapped[str] = mapped_column(Text)
    assessment: Mapped[str] = mapped_column(Text)
    plan: Mapped[str] = mapped_column(Text)


class DiagnosisMaster(Base):
    __tablename__ = "diagnosis_masters"

    management_number: Mapped[str] = mapped_column(String(16), primary_key=True)
    change_type: Mapped[str] = mapped_column(String(1))
    disease_name: Mapped[str] = mapped_column(String(255), index=True)
    disease_name_kana: Mapped[str] = mapped_column(String(255), index=True)
    adoption_level: Mapped[str] = mapped_column(String(1))
    exchange_code: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    icd10_code: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    icd10_subcode: Mapped[str | None] = mapped_column(String(16), nullable=True)
    claim_code: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    updated_at_master: Mapped[str | None] = mapped_column(String(16), nullable=True)


class DiagnosisAliasMaster(Base):
    __tablename__ = "diagnosis_alias_masters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    management_number: Mapped[str] = mapped_column(ForeignKey("diagnosis_masters.management_number"), index=True)
    alias: Mapped[str] = mapped_column(String(255), index=True)
    alias_kana: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    alias_type: Mapped[str] = mapped_column(String(32), default="index")
    target_management_number: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    updated_at_master: Mapped[str | None] = mapped_column(String(16), nullable=True)


class PmdaPackageInsertSection(Base):
    __tablename__ = "pmda_package_insert_sections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    yj_code: Mapped[str] = mapped_column(String(64), index=True)
    package_insert_no: Mapped[str] = mapped_column(String(64), index=True)
    brand_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    generic_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    section_code: Mapped[str] = mapped_column(String(64), index=True)
    section_heading: Mapped[str] = mapped_column(String(128))
    severity: Mapped[str] = mapped_column(String(32), index=True)
    text: Mapped[str] = mapped_column(Text)
    source_xml: Mapped[str] = mapped_column(String(255))
    source_updated_at: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class PmdaDrugInteraction(Base):
    __tablename__ = "pmda_drug_interactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    yj_code: Mapped[str] = mapped_column(String(64), index=True)
    package_insert_no: Mapped[str] = mapped_column(String(64), index=True)
    brand_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    interacting_drug: Mapped[str] = mapped_column(String(255), index=True)
    clinical_effects: Mapped[str | None] = mapped_column(Text, nullable=True)
    mechanism: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_xml: Mapped[str] = mapped_column(String(255))
    source_updated_at: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class PmdaDrugInteractionMatch(Base):
    __tablename__ = "pmda_drug_interaction_matches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    interaction_id: Mapped[int] = mapped_column(
        ForeignKey("pmda_drug_interactions.id", ondelete="CASCADE"), index=True
    )
    interacting_drug_normalized: Mapped[str] = mapped_column(String(255))
    matched_yj_code: Mapped[str] = mapped_column(String(64), index=True)
    matched_drug_name: Mapped[str] = mapped_column(String(255))
    match_source: Mapped[str] = mapped_column(String(32))
    match_confidence: Mapped[int] = mapped_column(Integer)
    source_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor: Mapped[str] = mapped_column(String(128))
    action: Mapped[str] = mapped_column(String(128))
    scope: Mapped[str] = mapped_column(String(32))
    detail: Mapped[str] = mapped_column(Text)
    patient_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    patient_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
