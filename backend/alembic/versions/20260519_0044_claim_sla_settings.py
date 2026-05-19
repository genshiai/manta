"""claim sla settings

Revision ID: 20260519_0044
Revises: 20260519_0043
Create Date: 2026-05-19 11:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260519_0044"
down_revision = "20260519_0043"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if _has_table("claim_sla_settings"):
        return
    op.create_table(
        "claim_sla_settings",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("due_soon_hours", sa.Integer(), nullable=False),
        sa.Column("include_no_due", sa.Boolean(), nullable=False),
        sa.Column("escalation_assignee", sa.String(length=128), nullable=False),
        sa.Column("notify_destinations", sa.JSON(), nullable=False),
        sa.Column("escalation_rules", sa.JSON(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("updated_by", sa.String(length=128), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    if not _has_table("claim_sla_settings"):
        return
    op.drop_table("claim_sla_settings")
