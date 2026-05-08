"""widen imported drug fields

Revision ID: 20260508_0023
Revises: 20260508_0022
Create Date: 2026-05-08 18:35:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260508_0023"
down_revision = "20260508_0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "prescription_catalog_masters",
        "drug_price",
        existing_type=sa.Numeric(precision=10, scale=2),
        type_=sa.Numeric(precision=14, scale=2),
        existing_nullable=True,
    )
    op.alter_column(
        "receipt_transitional_drugs",
        "brand_related_flag",
        existing_type=sa.String(length=8),
        type_=sa.String(length=32),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "receipt_transitional_drugs",
        "brand_related_flag",
        existing_type=sa.String(length=32),
        type_=sa.String(length=8),
        existing_nullable=True,
    )
    op.alter_column(
        "prescription_catalog_masters",
        "drug_price",
        existing_type=sa.Numeric(precision=14, scale=2),
        type_=sa.Numeric(precision=10, scale=2),
        existing_nullable=True,
    )
