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
    drug_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
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
