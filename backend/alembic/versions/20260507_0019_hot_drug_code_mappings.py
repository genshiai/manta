"""hot drug code mappings

Revision ID: 20260507_0019
Revises: 20260507_0018
Create Date: 2026-05-07 22:35:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260507_0019"
down_revision = "20260507_0018"
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
    if "hot_drug_code_mappings" not in inspector.get_table_names():
        op.create_table(
            "hot_drug_code_mappings",
            sa.Column("id", sa.String(length=160), primary_key=True, nullable=False),
            sa.Column("update_type", sa.String(length=16), nullable=True),
            sa.Column("updated_at_master", sa.String(length=8), nullable=True),
            sa.Column("company_name", sa.String(length=255), nullable=True),
            sa.Column("brand_name", sa.String(length=255), nullable=False),
            sa.Column("brand_name_kana_1", sa.String(length=8), nullable=True),
            sa.Column("brand_name_kana_2", sa.String(length=8), nullable=True),
            sa.Column("brand_name_kana_3", sa.String(length=8), nullable=True),
            sa.Column("listing_classification", sa.String(length=64), nullable=True),
            sa.Column("yj_code", sa.String(length=64), nullable=True),
            sa.Column("listed_name", sa.String(length=255), nullable=True),
            sa.Column("listed_at", sa.String(length=8), nullable=True),
            sa.Column("transitional_expiry", sa.String(length=8), nullable=True),
            sa.Column("approval_specification", sa.String(length=255), nullable=True),
            sa.Column("drug_category", sa.String(length=32), nullable=True),
            sa.Column("dosage_form", sa.String(length=64), nullable=True),
            sa.Column("package_form", sa.String(length=64), nullable=True),
            sa.Column("package_quantity", sa.String(length=32), nullable=True),
            sa.Column("package_unit", sa.String(length=32), nullable=True),
            sa.Column("total_quantity", sa.String(length=32), nullable=True),
            sa.Column("total_quantity_unit", sa.String(length=32), nullable=True),
            sa.Column("dispensing_package_code", sa.String(length=32), nullable=True),
            sa.Column("dispensing_package_name", sa.String(length=255), nullable=True),
            sa.Column("dispensing_package_subdivision", sa.String(length=64), nullable=True),
            sa.Column("sales_package_code", sa.String(length=32), nullable=True),
            sa.Column("carton_package_code", sa.String(length=32), nullable=True),
            sa.Column("jan_code", sa.String(length=32), nullable=True),
            sa.Column("sales_discontinued_at", sa.String(length=8), nullable=True),
            sa.Column("last_lot_expiry", sa.String(length=8), nullable=True),
            sa.Column("source_file", sa.String(length=255), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )

    create_index_if_missing("hot_drug_code_mappings", "ix_hot_drug_code_mappings_yj_code", ["yj_code"])
    create_index_if_missing(
        "hot_drug_code_mappings",
        "ix_hot_drug_code_mappings_dispensing_package_code",
        ["dispensing_package_code"],
    )
    create_index_if_missing(
        "hot_drug_code_mappings",
        "ix_hot_drug_code_mappings_sales_package_code",
        ["sales_package_code"],
    )
    create_index_if_missing("hot_drug_code_mappings", "ix_hot_drug_code_mappings_jan_code", ["jan_code"])
    create_index_if_missing("hot_drug_code_mappings", "ix_hot_drug_code_mappings_brand_name", ["brand_name"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "hot_drug_code_mappings" in inspector.get_table_names():
        op.drop_table("hot_drug_code_mappings")
