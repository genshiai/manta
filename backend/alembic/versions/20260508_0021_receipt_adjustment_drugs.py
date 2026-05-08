"""receipt adjustment drugs

Revision ID: 20260508_0021
Revises: 20260507_0020
Create Date: 2026-05-08 11:35:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260508_0021"
down_revision = "20260507_0020"
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
    tables = set(inspector.get_table_names())

    if "receipt_transitional_drugs" not in tables:
        op.create_table(
            "receipt_transitional_drugs",
            sa.Column("receipt_drug_code", sa.String(length=16), primary_key=True, nullable=False),
            sa.Column("dosage_form", sa.String(length=16), nullable=True),
            sa.Column("yj_code", sa.String(length=64), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("unit_name", sa.String(length=32), nullable=True),
            sa.Column("price", sa.Numeric(precision=12, scale=2), nullable=True),
            sa.Column("brand_related_flag", sa.String(length=8), nullable=True),
            sa.Column("non_listed_brand_name", sa.String(length=255), nullable=True),
            sa.Column("transitional_expiry", sa.String(length=8), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("source_file", sa.String(length=255), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )

    if "receipt_long_term_listed_drugs" not in tables:
        op.create_table(
            "receipt_long_term_listed_drugs",
            sa.Column("yj_code", sa.String(length=64), primary_key=True, nullable=False),
            sa.Column("row_number", sa.Integer(), nullable=True),
            sa.Column("dosage_form", sa.String(length=16), nullable=True),
            sa.Column("medical_necessity_receipt_code", sa.String(length=16), nullable=True),
            sa.Column("medical_necessity_name", sa.String(length=255), nullable=True),
            sa.Column("patient_request_receipt_code", sa.String(length=16), nullable=True),
            sa.Column("patient_request_name", sa.String(length=255), nullable=True),
            sa.Column("source_file", sa.String(length=255), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )

    create_index_if_missing("receipt_transitional_drugs", "ix_receipt_transitional_drugs_yj_code", ["yj_code"])
    create_index_if_missing(
        "receipt_transitional_drugs",
        "ix_receipt_transitional_drugs_transitional_expiry",
        ["transitional_expiry"],
    )
    create_index_if_missing(
        "receipt_long_term_listed_drugs",
        "ix_receipt_long_term_listed_drugs_medical_code",
        ["medical_necessity_receipt_code"],
    )
    create_index_if_missing(
        "receipt_long_term_listed_drugs",
        "ix_receipt_long_term_listed_drugs_patient_code",
        ["patient_request_receipt_code"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "receipt_long_term_listed_drugs" in tables:
        op.drop_table("receipt_long_term_listed_drugs")
    if "receipt_transitional_drugs" in tables:
        op.drop_table("receipt_transitional_drugs")
