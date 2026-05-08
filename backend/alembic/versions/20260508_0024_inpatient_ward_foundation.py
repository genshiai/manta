"""inpatient ward foundation

Revision ID: 20260508_0024
Revises: 20260508_0023
Create Date: 2026-05-08 20:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260508_0024"
down_revision = "20260508_0023"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    if not _has_table("ward_masters"):
        op.create_table(
            "ward_masters",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column("sort_order", sa.Integer(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("floor", sa.String(length=32), nullable=False),
            sa.Column("department", sa.String(length=128), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
        )

    if not _has_table("bed_masters"):
        op.create_table(
            "bed_masters",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column("ward_id", sa.String(length=64), sa.ForeignKey("ward_masters.id"), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("room_number", sa.String(length=32), nullable=False),
            sa.Column("bed_number", sa.String(length=32), nullable=False),
            sa.Column("bed_label", sa.String(length=64), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="available"),
            sa.Column("note", sa.Text(), nullable=True),
        )
        op.create_index("ix_bed_masters_ward_id", "bed_masters", ["ward_id"])
        op.create_index("ix_bed_masters_status", "bed_masters", ["status"])

    if not _has_table("admissions"):
        op.create_table(
            "admissions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("patient_id", sa.String(length=32), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="planned"),
            sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("admitted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("discharge_permitted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("discharged_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("ward_id", sa.String(length=64), sa.ForeignKey("ward_masters.id"), nullable=True),
            sa.Column("bed_id", sa.String(length=64), sa.ForeignKey("bed_masters.id"), nullable=True),
            sa.Column("attending_doctor", sa.String(length=128), nullable=False),
            sa.Column("team", sa.String(length=128), nullable=True),
            sa.Column("primary_diagnosis", sa.String(length=255), nullable=True),
            sa.Column("care_level", sa.String(length=64), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_admissions_patient_id", "admissions", ["patient_id"])
        op.create_index("ix_admissions_status", "admissions", ["status"])
        op.create_index("ix_admissions_requested_at", "admissions", ["requested_at"])
        op.create_index("ix_admissions_admitted_at", "admissions", ["admitted_at"])
        op.create_index("ix_admissions_discharged_at", "admissions", ["discharged_at"])
        op.create_index("ix_admissions_ward_id", "admissions", ["ward_id"])
        op.create_index("ix_admissions_bed_id", "admissions", ["bed_id"])

    if not _has_table("inpatient_instructions"):
        op.create_table(
            "inpatient_instructions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("admission_id", sa.Integer(), sa.ForeignKey("admissions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("category", sa.String(length=64), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
            sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.String(length=128), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_inpatient_instructions_admission_id", "inpatient_instructions", ["admission_id"])
        op.create_index("ix_inpatient_instructions_status", "inpatient_instructions", ["status"])
        op.create_index("ix_inpatient_instructions_due_at", "inpatient_instructions", ["due_at"])
        op.create_index("ix_inpatient_instructions_created_at", "inpatient_instructions", ["created_at"])

    if not _has_table("nursing_notes"):
        op.create_table(
            "nursing_notes",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("admission_id", sa.Integer(), sa.ForeignKey("admissions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("note_type", sa.String(length=64), nullable=False, server_default="SOAP"),
            sa.Column("focus", sa.String(length=255), nullable=True),
            sa.Column("subjective", sa.Text(), nullable=False, server_default=""),
            sa.Column("objective", sa.Text(), nullable=False, server_default=""),
            sa.Column("assessment", sa.Text(), nullable=False, server_default=""),
            sa.Column("plan", sa.Text(), nullable=False, server_default=""),
            sa.Column("recorded_by", sa.String(length=128), nullable=False),
            sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_nursing_notes_admission_id", "nursing_notes", ["admission_id"])
        op.create_index("ix_nursing_notes_recorded_at", "nursing_notes", ["recorded_at"])


def downgrade() -> None:
    for table_name in (
        "nursing_notes",
        "inpatient_instructions",
        "admissions",
        "bed_masters",
        "ward_masters",
    ):
        if _has_table(table_name):
            op.drop_table(table_name)
