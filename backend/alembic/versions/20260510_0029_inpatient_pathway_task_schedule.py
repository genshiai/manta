"""inpatient pathway task schedule

Revision ID: 20260510_0029
Revises: 20260510_0028
Create Date: 2026-05-10 10:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260510_0029"
down_revision = "20260510_0028"
branch_labels = None
depends_on = None


def _has_column(table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in sa.inspect(op.get_bind()).get_columns(table_name))


def upgrade() -> None:
    if not _has_column("inpatient_pathway_tasks", "role"):
        op.add_column("inpatient_pathway_tasks", sa.Column("role", sa.String(length=64), nullable=True))
        op.create_index("ix_inpatient_pathway_tasks_role", "inpatient_pathway_tasks", ["role"])
    if not _has_column("inpatient_pathway_tasks", "due_on"):
        op.add_column("inpatient_pathway_tasks", sa.Column("due_on", sa.Date(), nullable=True))
        op.create_index("ix_inpatient_pathway_tasks_due_on", "inpatient_pathway_tasks", ["due_on"])
    if not _has_column("inpatient_pathway_tasks", "due_time"):
        op.add_column("inpatient_pathway_tasks", sa.Column("due_time", sa.String(length=16), nullable=True))


def downgrade() -> None:
    if _has_column("inpatient_pathway_tasks", "due_time"):
        op.drop_column("inpatient_pathway_tasks", "due_time")
    if _has_column("inpatient_pathway_tasks", "due_on"):
        op.drop_index("ix_inpatient_pathway_tasks_due_on", table_name="inpatient_pathway_tasks")
        op.drop_column("inpatient_pathway_tasks", "due_on")
    if _has_column("inpatient_pathway_tasks", "role"):
        op.drop_index("ix_inpatient_pathway_tasks_role", table_name="inpatient_pathway_tasks")
        op.drop_column("inpatient_pathway_tasks", "role")
