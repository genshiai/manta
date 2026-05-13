"""receipt comment masters

Revision ID: 20260513_0036
Revises: 20260511_0035
Create Date: 2026-05-13 17:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260513_0036"
down_revision = "20260511_0035"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if _has_table("receipt_comment_masters"):
        return
    op.create_table(
        "receipt_comment_masters",
        sa.Column("comment_code", sa.String(length=16), primary_key=True),
        sa.Column("change_type", sa.String(length=8), nullable=False),
        sa.Column("master_type", sa.String(length=1), nullable=False, server_default="C"),
        sa.Column("comment_class", sa.String(length=8), nullable=True),
        sa.Column("pattern", sa.String(length=8), nullable=True),
        sa.Column("sequence_number", sa.String(length=16), nullable=True),
        sa.Column("check_digit", sa.String(length=8), nullable=True),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("text_kana", sa.String(length=255), nullable=True),
        sa.Column("effective_from", sa.String(length=8), nullable=True),
        sa.Column("effective_to", sa.String(length=8), nullable=True),
        sa.Column("raw_columns", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("source_file", sa.String(length=255), nullable=False, server_default="demo"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_receipt_comment_masters_comment_class", "receipt_comment_masters", ["comment_class"])
    op.create_index("ix_receipt_comment_masters_pattern", "receipt_comment_masters", ["pattern"])
    op.create_index("ix_receipt_comment_masters_text", "receipt_comment_masters", ["text"])


def downgrade() -> None:
    if _has_table("receipt_comment_masters"):
        op.drop_table("receipt_comment_masters")
