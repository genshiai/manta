"""diagnosis alias masters

Revision ID: 20260505_0014
Revises: 20260428_0013
Create Date: 2026-05-05 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260505_0014"
down_revision = "20260428_0013"
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

    if "diagnosis_alias_masters" not in inspector.get_table_names():
        op.create_table(
            "diagnosis_alias_masters",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
            sa.Column("management_number", sa.String(length=16), nullable=False),
            sa.Column("alias", sa.String(length=255), nullable=False),
            sa.Column("alias_kana", sa.String(length=255), nullable=True),
            sa.Column("alias_type", sa.String(length=32), nullable=False, server_default="index"),
            sa.Column("target_management_number", sa.String(length=16), nullable=True),
            sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("updated_at_master", sa.String(length=16), nullable=True),
            sa.ForeignKeyConstraint(["management_number"], ["diagnosis_masters.management_number"]),
        )

    create_index_if_missing("diagnosis_alias_masters", "ix_diagnosis_alias_masters_management_number", ["management_number"])
    create_index_if_missing("diagnosis_alias_masters", "ix_diagnosis_alias_masters_alias", ["alias"])
    create_index_if_missing("diagnosis_alias_masters", "ix_diagnosis_alias_masters_alias_kana", ["alias_kana"])
    create_index_if_missing("diagnosis_alias_masters", "ix_diagnosis_alias_masters_target_management_number", ["target_management_number"])
    create_index_if_missing("diagnosis_alias_masters", "ix_diagnosis_alias_masters_is_deleted", ["is_deleted"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "diagnosis_alias_masters" in inspector.get_table_names():
        op.drop_table("diagnosis_alias_masters")
