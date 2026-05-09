"""inpatient pathway masters

Revision ID: 20260510_0028
Revises: 20260509_0027
Create Date: 2026-05-10 09:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260510_0028"
down_revision = "20260509_0027"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in sa.inspect(op.get_bind()).get_columns(table_name))


def upgrade() -> None:
    if not _has_table("inpatient_pathway_masters"):
        op.create_table(
            "inpatient_pathway_masters",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column("sort_order", sa.Integer(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("department", sa.String(length=128), nullable=False),
            sa.Column("primary_diagnosis", sa.String(length=255), nullable=True),
            sa.Column("expected_days", sa.Integer(), nullable=False, server_default="7"),
            sa.Column("note", sa.Text(), nullable=True),
        )
        op.create_index("ix_inpatient_pathway_masters_department", "inpatient_pathway_masters", ["department"])
        op.create_index("ix_inpatient_pathway_masters_primary_diagnosis", "inpatient_pathway_masters", ["primary_diagnosis"])

    if not _has_table("inpatient_pathway_task_masters"):
        op.create_table(
            "inpatient_pathway_task_masters",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column("pathway_master_id", sa.String(length=64), sa.ForeignKey("inpatient_pathway_masters.id", ondelete="CASCADE"), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False),
            sa.Column("day_offset", sa.Integer(), nullable=False),
            sa.Column("category", sa.String(length=64), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("role", sa.String(length=64), nullable=True),
            sa.Column("due_time", sa.String(length=16), nullable=True),
        )
        op.create_index("ix_inpatient_pathway_task_masters_pathway_master_id", "inpatient_pathway_task_masters", ["pathway_master_id"])
        op.create_index("ix_inpatient_pathway_task_masters_day_offset", "inpatient_pathway_task_masters", ["day_offset"])

    if _has_table("inpatient_pathway_assignments") and not _has_column("inpatient_pathway_assignments", "pathway_master_id"):
        op.add_column("inpatient_pathway_assignments", sa.Column("pathway_master_id", sa.String(length=64), nullable=True))
        op.create_index("ix_inpatient_pathway_assignments_pathway_master_id", "inpatient_pathway_assignments", ["pathway_master_id"])


def downgrade() -> None:
    if _has_table("inpatient_pathway_assignments") and _has_column("inpatient_pathway_assignments", "pathway_master_id"):
        op.drop_index("ix_inpatient_pathway_assignments_pathway_master_id", table_name="inpatient_pathway_assignments")
        op.drop_column("inpatient_pathway_assignments", "pathway_master_id")
    if _has_table("inpatient_pathway_task_masters"):
        op.drop_table("inpatient_pathway_task_masters")
    if _has_table("inpatient_pathway_masters"):
        op.drop_table("inpatient_pathway_masters")
