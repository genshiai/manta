"""pmda package insert sections

Revision ID: 20260507_0015
Revises: 20260505_0014
Create Date: 2026-05-07 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260507_0015"
down_revision = "20260505_0014"
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

    if "pmda_package_insert_sections" not in inspector.get_table_names():
        op.create_table(
            "pmda_package_insert_sections",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
            sa.Column("yj_code", sa.String(length=64), nullable=False),
            sa.Column("package_insert_no", sa.String(length=64), nullable=False),
            sa.Column("brand_name", sa.String(length=255), nullable=True),
            sa.Column("generic_name", sa.String(length=255), nullable=True),
            sa.Column("section_code", sa.String(length=64), nullable=False),
            sa.Column("section_heading", sa.String(length=128), nullable=False),
            sa.Column("severity", sa.String(length=32), nullable=False),
            sa.Column("text", sa.Text(), nullable=False),
            sa.Column("source_xml", sa.String(length=255), nullable=False),
            sa.Column("source_updated_at", sa.String(length=16), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )

    create_index_if_missing("pmda_package_insert_sections", "ix_pmda_package_insert_sections_yj_code", ["yj_code"])
    create_index_if_missing(
        "pmda_package_insert_sections",
        "ix_pmda_package_insert_sections_package_insert_no",
        ["package_insert_no"],
    )
    create_index_if_missing(
        "pmda_package_insert_sections",
        "ix_pmda_package_insert_sections_section_code",
        ["section_code"],
    )
    create_index_if_missing("pmda_package_insert_sections", "ix_pmda_package_insert_sections_severity", ["severity"])
    create_index_if_missing("pmda_package_insert_sections", "ix_pmda_package_insert_sections_created_at", ["created_at"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "pmda_package_insert_sections" in inspector.get_table_names():
        op.drop_table("pmda_package_insert_sections")
