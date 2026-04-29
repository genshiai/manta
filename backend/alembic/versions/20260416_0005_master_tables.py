"""master tables

Revision ID: 20260416_0005
Revises: 20260416_0004
Create Date: 2026-04-16 02:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260416_0005"
down_revision = "20260416_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "prescription_catalog_masters" not in tables:
        op.create_table(
            "prescription_catalog_masters",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column("sort_order", sa.Integer(), nullable=False),
            sa.Column("drug_name", sa.String(length=255), nullable=False),
            sa.Column("category", sa.String(length=32), nullable=False),
            sa.Column("dosage_options", sa.JSON(), nullable=False),
            sa.Column("allergy_conflict_label", sa.String(length=128), nullable=True),
            sa.Column("related_problem", sa.String(length=255), nullable=True),
        )

    if "lab_set_masters" not in tables:
        op.create_table(
            "lab_set_masters",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column("sort_order", sa.Integer(), nullable=False),
            sa.Column("label", sa.String(length=255), nullable=False),
            sa.Column("items", sa.JSON(), nullable=False),
        )

    if "reservation_slot_masters" not in tables:
        op.create_table(
            "reservation_slot_masters",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column("sort_order", sa.Integer(), nullable=False),
            sa.Column("date", sa.String(length=64), nullable=False),
            sa.Column("time", sa.String(length=32), nullable=False),
            sa.Column("department", sa.String(length=128), nullable=False),
            sa.Column("doctor", sa.String(length=128), nullable=False),
            sa.Column("state", sa.String(length=32), nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "reservation_slot_masters" in tables:
        op.drop_table("reservation_slot_masters")

    if "lab_set_masters" in tables:
        op.drop_table("lab_set_masters")

    if "prescription_catalog_masters" in tables:
        op.drop_table("prescription_catalog_masters")
