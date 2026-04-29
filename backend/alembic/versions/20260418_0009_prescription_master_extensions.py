"""prescription master extensions

Revision ID: 20260418_0009
Revises: 20260417_0008
Create Date: 2026-04-18 11:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260418_0009"
down_revision = "20260417_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "prescription_catalog_masters" in tables:
        existing_columns = {column["name"] for column in inspector.get_columns("prescription_catalog_masters")}
        additions = [
            ("generic_name", sa.String(length=255), True),
            ("name_kana", sa.String(length=255), True),
            ("aliases", sa.JSON(), False),
            ("yj_code", sa.String(length=64), True),
            ("hot_code", sa.String(length=64), True),
            ("dosage_form", sa.String(length=64), True),
            ("strength", sa.String(length=64), True),
            ("standard_usage_code", sa.String(length=64), True),
            ("default_days", sa.String(length=16), True),
            ("pmda_info_url", sa.String(length=512), True),
        ]
        for name, type_, nullable in additions:
            if name in existing_columns:
                continue
            op.add_column(
                "prescription_catalog_masters",
                sa.Column(
                    name,
                    type_,
                    nullable=nullable,
                    server_default=sa.text("'[]'") if name == "aliases" else None,
                ),
            )

    if "standard_usage_masters" not in tables:
        op.create_table(
            "standard_usage_masters",
            sa.Column("id", sa.String(length=64), primary_key=True, nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("label", sa.String(length=255), nullable=False),
            sa.Column("category", sa.String(length=32), nullable=False),
            sa.Column("instruction", sa.String(length=255), nullable=False),
            sa.Column("default_days", sa.String(length=16), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
        )

    if "prescription_set_masters" not in tables:
        op.create_table(
            "prescription_set_masters",
            sa.Column("id", sa.String(length=64), primary_key=True, nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("label", sa.String(length=255), nullable=False),
            sa.Column("department", sa.String(length=128), nullable=False),
            sa.Column("related_problem", sa.String(length=255), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("items", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "prescription_set_masters" in tables:
        op.drop_table("prescription_set_masters")

    if "standard_usage_masters" in tables:
        op.drop_table("standard_usage_masters")

    if "prescription_catalog_masters" in tables:
        existing_columns = {column["name"] for column in inspector.get_columns("prescription_catalog_masters")}
        for name in (
            "pmda_info_url",
            "default_days",
            "standard_usage_code",
            "strength",
            "dosage_form",
            "hot_code",
            "yj_code",
            "aliases",
            "name_kana",
            "generic_name",
        ):
            if name in existing_columns:
                op.drop_column("prescription_catalog_masters", name)
