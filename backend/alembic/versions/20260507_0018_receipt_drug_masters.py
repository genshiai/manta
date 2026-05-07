"""receipt drug masters

Revision ID: 20260507_0018
Revises: 20260507_0017
Create Date: 2026-05-07 21:25:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260507_0018"
down_revision = "20260507_0017"
branch_labels = None
depends_on = None


def create_index_if_missing(table_name: str, index_name: str, columns: list[str]) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_indexes = {index["name"] for index in inspector.get_indexes(table_name)}
    if index_name not in existing_indexes:
        op.create_index(index_name, table_name, columns)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "receipt_drug_masters" not in inspector.get_table_names():
        op.create_table(
            "receipt_drug_masters",
            sa.Column("receipt_drug_code", sa.String(length=16), primary_key=True, nullable=False),
            sa.Column("change_type", sa.String(length=8), nullable=False),
            sa.Column("master_type", sa.String(length=1), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("name_kana", sa.String(length=255), nullable=True),
            sa.Column("unit_code", sa.String(length=8), nullable=True),
            sa.Column("unit_name", sa.String(length=32), nullable=True),
            sa.Column("price_type", sa.String(length=8), nullable=True),
            sa.Column("price", sa.Numeric(precision=12, scale=2), nullable=True),
            sa.Column("generic_flag", sa.String(length=8), nullable=True),
            sa.Column("dosage_form_code", sa.String(length=8), nullable=True),
            sa.Column("changed_at", sa.String(length=8), nullable=True),
            sa.Column("discontinued_at", sa.String(length=8), nullable=True),
            sa.Column("yj_code", sa.String(length=64), nullable=True),
            sa.Column("public_order", sa.String(length=16), nullable=True),
            sa.Column("transitional_expiry", sa.String(length=8), nullable=True),
            sa.Column("base_name", sa.String(length=255), nullable=True),
            sa.Column("listed_at", sa.String(length=8), nullable=True),
            sa.Column("generic_prescription_code", sa.String(length=64), nullable=True),
            sa.Column("generic_prescription_text", sa.String(length=255), nullable=True),
            sa.Column("generic_prescription_addition_flag", sa.String(length=8), nullable=True),
            sa.Column("anti_hiv_flag", sa.String(length=8), nullable=True),
            sa.Column("long_term_listed_related_code", sa.String(length=16), nullable=True),
            sa.Column("selective_care_flag", sa.String(length=8), nullable=True),
            sa.Column("source_file", sa.String(length=255), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )

    create_index_if_missing("receipt_drug_masters", "ix_receipt_drug_masters_yj_code", ["yj_code"])
    create_index_if_missing("receipt_drug_masters", "ix_receipt_drug_masters_name", ["name"])
    create_index_if_missing(
        "receipt_drug_masters",
        "ix_receipt_drug_masters_generic_prescription_code",
        ["generic_prescription_code"],
    )
    create_index_if_missing("receipt_drug_masters", "ix_receipt_drug_masters_updated_at", ["updated_at"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "receipt_drug_masters" in inspector.get_table_names():
        op.drop_table("receipt_drug_masters")
