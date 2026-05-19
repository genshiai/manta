"""orca response samples

Revision ID: 20260519_0043
Revises: 20260519_0042
Create Date: 2026-05-19 10:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260519_0043"
down_revision = "20260519_0042"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if _has_table("orca_response_samples"):
        return
    op.create_table(
        "orca_response_samples",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("claim_draft_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("normalized", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_orca_response_samples_claim_draft_id", "orca_response_samples", ["claim_draft_id"])
    op.create_index("ix_orca_response_samples_created_at", "orca_response_samples", ["created_at"])


def downgrade() -> None:
    if not _has_table("orca_response_samples"):
        return
    op.drop_index("ix_orca_response_samples_created_at", table_name="orca_response_samples")
    op.drop_index("ix_orca_response_samples_claim_draft_id", table_name="orca_response_samples")
    op.drop_table("orca_response_samples")
