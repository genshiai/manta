"""initial schema

Revision ID: 20260415_0001
Revises:
Create Date: 2026-04-15 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260415_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("users"):
        op.create_table(
            "users",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column("password", sa.String(length=255), nullable=False),
            sa.Column("display_name", sa.String(length=128), nullable=False),
            sa.Column("department", sa.String(length=128), nullable=False),
            sa.Column("role", sa.String(length=32), nullable=False),
            sa.Column("password_expires_at", sa.Date(), nullable=False),
        )

    if not inspector.has_table("patients"):
        op.create_table(
            "patients",
            sa.Column("id", sa.String(length=32), primary_key=True),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("kana", sa.String(length=128), nullable=False),
            sa.Column("age", sa.String(length=32), nullable=False),
            sa.Column("sex", sa.String(length=16), nullable=False),
            sa.Column("department", sa.String(length=128), nullable=False),
            sa.Column("doctor", sa.String(length=128), nullable=False),
            sa.Column("reception_number", sa.String(length=16), nullable=False),
            sa.Column("reservation_time", sa.String(length=16), nullable=False),
            sa.Column("reception_time", sa.String(length=16), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("elapsed", sa.String(length=32), nullable=False),
            sa.Column("lab_progress", sa.String(length=32), nullable=False),
            sa.Column("same_name_duplicate_count", sa.Integer(), nullable=False),
            sa.Column("comment", sa.Text(), nullable=False),
            sa.Column("demographics", sa.JSON(), nullable=False),
            sa.Column("alerts", sa.JSON(), nullable=False),
        )

    if not inspector.has_table("chart_notes"):
        op.create_table(
            "chart_notes",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("patient_id", sa.String(length=32), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
            sa.Column("subjective", sa.Text(), nullable=False),
            sa.Column("objective", sa.Text(), nullable=False),
            sa.Column("assessment", sa.Text(), nullable=False),
            sa.Column("plan", sa.Text(), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("saved_by", sa.String(length=128), nullable=False),
            sa.Column("saved_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_chart_notes_patient_id", "chart_notes", ["patient_id"])

    if not inspector.has_table("prescription_orders"):
        op.create_table(
            "prescription_orders",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("patient_id", sa.String(length=32), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
            sa.Column("type", sa.String(length=32), nullable=False),
            sa.Column("days", sa.String(length=32), nullable=False),
            sa.Column("drug_name", sa.String(length=255), nullable=False),
            sa.Column("dosage", sa.String(length=255), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_prescription_orders_patient_id", "prescription_orders", ["patient_id"])

    if not inspector.has_table("lab_orders"):
        op.create_table(
            "lab_orders",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("patient_id", sa.String(length=32), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
            sa.Column("category", sa.String(length=255), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("urgency", sa.String(length=32), nullable=True),
            sa.Column("items", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_lab_orders_patient_id", "lab_orders", ["patient_id"])

    if not inspector.has_table("reservations"):
        op.create_table(
            "reservations",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("patient_id", sa.String(length=32), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, unique=True),
            sa.Column("slot_id", sa.String(length=64), nullable=True),
            sa.Column("scheduled_for", sa.String(length=255), nullable=False),
            sa.Column("department", sa.String(length=255), nullable=False),
            sa.Column("doctor", sa.String(length=255), nullable=False),
            sa.Column("note", sa.Text(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_reservations_patient_id", "reservations", ["patient_id"], unique=True)

    if not inspector.has_table("audit_logs"):
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("actor", sa.String(length=128), nullable=False),
            sa.Column("action", sa.String(length=128), nullable=False),
            sa.Column("scope", sa.String(length=32), nullable=False),
            sa.Column("detail", sa.Text(), nullable=False),
            sa.Column("patient_id", sa.String(length=32), nullable=True),
            sa.Column("patient_name", sa.String(length=128), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])
        op.create_index("ix_audit_logs_patient_id", "audit_logs", ["patient_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("audit_logs"):
        op.drop_table("audit_logs")
    if inspector.has_table("reservations"):
        op.drop_table("reservations")
    if inspector.has_table("lab_orders"):
        op.drop_table("lab_orders")
    if inspector.has_table("prescription_orders"):
        op.drop_table("prescription_orders")
    if inspector.has_table("chart_notes"):
        op.drop_table("chart_notes")
    if inspector.has_table("patients"):
        op.drop_table("patients")
    if inspector.has_table("users"):
        op.drop_table("users")
