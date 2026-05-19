"""monthly close approvals

Revision ID: 20260518_0041
Revises: 20260518_0040
Create Date: 2026-05-18 20:10:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260518_0041"
down_revision = "20260518_0040"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    return column_name in {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _has_index(table_name: str, index_name: str) -> bool:
    return index_name in {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def upgrade() -> None:
    if not _has_table("monthly_claim_closes"):
        return
    columns = [
        ("requested_by", sa.Column("requested_by", sa.String(length=128), nullable=True)),
        ("requested_at", sa.Column("requested_at", sa.DateTime(timezone=True), nullable=True)),
        ("approved_by", sa.Column("approved_by", sa.String(length=128), nullable=True)),
        ("approved_at", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True)),
        ("approval_note", sa.Column("approval_note", sa.Text(), nullable=True)),
    ]
    for column_name, column in columns:
        if not _has_column("monthly_claim_closes", column_name):
            op.add_column("monthly_claim_closes", column)
    if not _has_index("monthly_claim_closes", "ix_monthly_claim_closes_requested_at"):
        op.create_index("ix_monthly_claim_closes_requested_at", "monthly_claim_closes", ["requested_at"])
    if not _has_index("monthly_claim_closes", "ix_monthly_claim_closes_approved_at"):
        op.create_index("ix_monthly_claim_closes_approved_at", "monthly_claim_closes", ["approved_at"])


def downgrade() -> None:
    # Revision 0040 now defines these columns for fresh installs. This migration only
    # backfills databases that had already applied the older 0040 shape.
    return
