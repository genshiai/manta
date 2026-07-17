from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ...db import Base
from ..common.models import utcnow


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


class InpatientCareAssignment(Base):
    __tablename__ = "inpatient_care_assignments"
    __table_args__ = (UniqueConstraint("admission_id", "user_id", name="uq_inpatient_care_assignment"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    admission_id: Mapped[int] = mapped_column(ForeignKey("admissions.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(64), default="担当")
    assigned_by: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


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
