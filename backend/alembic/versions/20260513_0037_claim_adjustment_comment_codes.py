"""claim adjustment comment codes

Revision ID: 20260513_0037
Revises: 20260513_0036
Create Date: 2026-05-13 18:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260513_0037"
down_revision = "20260513_0036"
branch_labels = None
depends_on = None


def _has_column(table_name: str, column_name: str) -> bool:
    return column_name in {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    if not _has_column("claim_line_adjustments", "comment_code"):
        op.add_column("claim_line_adjustments", sa.Column("comment_code", sa.String(length=16), nullable=True))
        op.create_index("ix_claim_line_adjustments_comment_code", "claim_line_adjustments", ["comment_code"])
    if not _has_column("claim_line_adjustments", "comment_pattern"):
        op.add_column("claim_line_adjustments", sa.Column("comment_pattern", sa.String(length=8), nullable=True))


def downgrade() -> None:
    if _has_column("claim_line_adjustments", "comment_pattern"):
        op.drop_column("claim_line_adjustments", "comment_pattern")
    if _has_column("claim_line_adjustments", "comment_code"):
        op.drop_index("ix_claim_line_adjustments_comment_code", table_name="claim_line_adjustments")
        op.drop_column("claim_line_adjustments", "comment_code")
