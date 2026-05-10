"""receipt medical practice masters

Revision ID: 20260510_0030
Revises: 20260510_0029
Create Date: 2026-05-10 11:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260510_0030"
down_revision = "20260510_0029"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if _has_table("receipt_medical_practice_masters"):
        return
    op.create_table(
        "receipt_medical_practice_masters",
        sa.Column("receipt_code", sa.String(length=16), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("name_kana", sa.String(length=255), nullable=True),
        sa.Column("category", sa.String(length=64), nullable=True),
        sa.Column("points", sa.Integer(), nullable=True),
        sa.Column("unit_name", sa.String(length=32), nullable=True),
        sa.Column("effective_from", sa.String(length=8), nullable=True),
        sa.Column("effective_to", sa.String(length=8), nullable=True),
        sa.Column("source_file", sa.String(length=255), nullable=False, server_default="demo"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_receipt_medical_practice_masters_name", "receipt_medical_practice_masters", ["name"])
    op.create_index("ix_receipt_medical_practice_masters_category", "receipt_medical_practice_masters", ["category"])


def downgrade() -> None:
    if _has_table("receipt_medical_practice_masters"):
        op.drop_table("receipt_medical_practice_masters")
