"""inpatient care assignments

Revision ID: 20260716_0046
Revises: 20260716_0045
Create Date: 2026-07-16 16:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260716_0046"
down_revision = "20260716_0045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "inpatient_care_assignments" not in inspector.get_table_names():
        op.create_table(
            "inpatient_care_assignments",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("admission_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.String(length=64), nullable=False),
            sa.Column("role", sa.String(length=64), nullable=False),
            sa.Column("assigned_by", sa.String(length=128), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["admission_id"], ["admissions.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("admission_id", "user_id", name="uq_inpatient_care_assignment"),
        )
        op.create_index("ix_inpatient_care_assignments_admission_id", "inpatient_care_assignments", ["admission_id"])
        op.create_index("ix_inpatient_care_assignments_user_id", "inpatient_care_assignments", ["user_id"])
        op.create_index("ix_inpatient_care_assignments_created_at", "inpatient_care_assignments", ["created_at"])


def downgrade() -> None:
    if "inpatient_care_assignments" in sa.inspect(op.get_bind()).get_table_names():
        op.drop_table("inpatient_care_assignments")
