"""prescription catalog mhlw fields

Revision ID: 20260507_0017
Revises: 20260507_0016
Create Date: 2026-05-07 21:10:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260507_0017"
down_revision = "20260507_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "prescription_catalog_masters" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("prescription_catalog_masters")}
    additions = [
        ("manufacturer", sa.String(length=255), True),
        ("drug_price", sa.Numeric(precision=10, scale=2), True),
        ("generic_reimbursement_flag", sa.String(length=32), True),
        ("brand_flag", sa.String(length=32), True),
        ("has_generic", sa.Boolean(), True),
        ("transitional_expiry", sa.String(length=32), True),
        ("source_note", sa.Text(), True),
    ]
    for name, type_, nullable in additions:
        if name in existing_columns:
            continue
        op.add_column("prescription_catalog_masters", sa.Column(name, type_, nullable=nullable))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "prescription_catalog_masters" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("prescription_catalog_masters")}
    for name in (
        "source_note",
        "transitional_expiry",
        "has_generic",
        "brand_flag",
        "generic_reimbursement_flag",
        "drug_price",
        "manufacturer",
    ):
        if name in existing_columns:
            op.drop_column("prescription_catalog_masters", name)
