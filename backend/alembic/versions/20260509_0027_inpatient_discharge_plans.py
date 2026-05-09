"""inpatient discharge plans

Revision ID: 20260509_0027
Revises: 20260509_0026
Create Date: 2026-05-09 12:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260509_0027"
down_revision = "20260509_0026"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    if _has_table("inpatient_discharge_plans"):
        return
    op.create_table(
        "inpatient_discharge_plans",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("admission_id", sa.Integer(), sa.ForeignKey("admissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("discharge_medication_note", sa.Text(), nullable=False, server_default=""),
        sa.Column("billing_candidates", sa.JSON(), nullable=False),
        sa.Column("follow_up_note", sa.Text(), nullable=False, server_default=""),
        sa.Column("reviewed_by", sa.String(length=128), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_inpatient_discharge_plans_admission_id", "inpatient_discharge_plans", ["admission_id"])
    op.create_index("ix_inpatient_discharge_plans_status", "inpatient_discharge_plans", ["status"])
    op.create_index("ix_inpatient_discharge_plans_reviewed_at", "inpatient_discharge_plans", ["reviewed_at"])


def downgrade() -> None:
    if _has_table("inpatient_discharge_plans"):
        op.drop_table("inpatient_discharge_plans")
