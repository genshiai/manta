from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ...db import Base
from ..common.models import utcnow


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    kana: Mapped[str] = mapped_column(String(128))
    age: Mapped[str] = mapped_column(String(32))
    sex: Mapped[str] = mapped_column(String(16))
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
    """FHIR R4B Condition / JP Core 準拠の病名レコード。"""

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
    """FHIR R4B Observation / JP Core 準拠の観察レコード。"""

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


class ImagingOrder(Base):
    __tablename__ = "imaging_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="scheduled", index=True)
    scheduled_at: Mapped[str] = mapped_column(String(255))
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ProcedureOrder(Base):
    __tablename__ = "procedure_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="planned", index=True)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


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
