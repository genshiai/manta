from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ...db import Base
from ..common.models import utcnow


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
