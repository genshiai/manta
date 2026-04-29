"""diagnosis masters

Revision ID: 20260417_0008
Revises: 20260417_0007
Create Date: 2026-04-17 18:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260417_0008"
down_revision = "20260417_0007"
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

    if "diagnosis_masters" not in inspector.get_table_names():
        op.create_table(
            "diagnosis_masters",
            sa.Column("management_number", sa.String(length=16), primary_key=True, nullable=False),
            sa.Column("change_type", sa.String(length=1), nullable=False),
            sa.Column("disease_name", sa.String(length=255), nullable=False),
            sa.Column("disease_name_kana", sa.String(length=255), nullable=False),
            sa.Column("adoption_level", sa.String(length=1), nullable=False),
            sa.Column("exchange_code", sa.String(length=16), nullable=True),
            sa.Column("icd10_code", sa.String(length=16), nullable=True),
            sa.Column("icd10_subcode", sa.String(length=16), nullable=True),
            sa.Column("claim_code", sa.String(length=40), nullable=True),
            sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("updated_at_master", sa.String(length=16), nullable=True),
        )

    create_index_if_missing("diagnosis_masters", "ix_diagnosis_masters_disease_name", ["disease_name"])
    create_index_if_missing("diagnosis_masters", "ix_diagnosis_masters_disease_name_kana", ["disease_name_kana"])
    create_index_if_missing("diagnosis_masters", "ix_diagnosis_masters_exchange_code", ["exchange_code"])
    create_index_if_missing("diagnosis_masters", "ix_diagnosis_masters_icd10_code", ["icd10_code"])
    create_index_if_missing("diagnosis_masters", "ix_diagnosis_masters_claim_code", ["claim_code"])
    create_index_if_missing("diagnosis_masters", "ix_diagnosis_masters_is_deleted", ["is_deleted"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "diagnosis_masters" in inspector.get_table_names():
        op.drop_table("diagnosis_masters")
