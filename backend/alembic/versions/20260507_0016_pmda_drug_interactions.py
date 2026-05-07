"""pmda drug interactions

Revision ID: 20260507_0016
Revises: 20260507_0015
Create Date: 2026-05-07 00:10:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260507_0016"
down_revision = "20260507_0015"
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
    if "pmda_drug_interactions" not in inspector.get_table_names():
        op.create_table(
            "pmda_drug_interactions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
            sa.Column("yj_code", sa.String(length=64), nullable=False),
            sa.Column("package_insert_no", sa.String(length=64), nullable=False),
            sa.Column("brand_name", sa.String(length=255), nullable=True),
            sa.Column("interacting_drug", sa.String(length=255), nullable=False),
            sa.Column("clinical_effects", sa.Text(), nullable=True),
            sa.Column("mechanism", sa.Text(), nullable=True),
            sa.Column("source_xml", sa.String(length=255), nullable=False),
            sa.Column("source_updated_at", sa.String(length=16), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )

    create_index_if_missing("pmda_drug_interactions", "ix_pmda_drug_interactions_yj_code", ["yj_code"])
    create_index_if_missing("pmda_drug_interactions", "ix_pmda_drug_interactions_package_insert_no", ["package_insert_no"])
    create_index_if_missing("pmda_drug_interactions", "ix_pmda_drug_interactions_interacting_drug", ["interacting_drug"])
    create_index_if_missing("pmda_drug_interactions", "ix_pmda_drug_interactions_created_at", ["created_at"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "pmda_drug_interactions" in inspector.get_table_names():
        op.drop_table("pmda_drug_interactions")
