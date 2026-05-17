"""order tables

Revision ID: 20260517_0038
Revises: 20260513_0037
Create Date: 2026-05-17 16:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260517_0038"
down_revision = "20260513_0037"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _has_table("imaging_orders"):
        op.create_table(
            "imaging_orders",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("patient_id", sa.String(length=32), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
            sa.Column("category", sa.String(length=255), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="scheduled"),
            sa.Column("scheduled_at", sa.String(length=255), nullable=False),
            sa.Column("note", sa.Text(), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_imaging_orders_patient_id", "imaging_orders", ["patient_id"])
        op.create_index("ix_imaging_orders_status", "imaging_orders", ["status"])

    if not _has_table("procedure_orders"):
        op.create_table(
            "procedure_orders",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("patient_id", sa.String(length=32), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="planned"),
            sa.Column("note", sa.Text(), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_procedure_orders_patient_id", "procedure_orders", ["patient_id"])
        op.create_index("ix_procedure_orders_status", "procedure_orders", ["status"])


def downgrade() -> None:
    if _has_table("procedure_orders"):
        op.drop_table("procedure_orders")
    if _has_table("imaging_orders"):
        op.drop_table("imaging_orders")
