"""composite order sets

Revision ID: 20260428_0013
Revises: 20260419_0012
Create Date: 2026-04-28 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260428_0013"
down_revision = "20260419_0012"
branch_labels = None
depends_on = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    if not _has_column("prescription_set_masters", "included_set_ids"):
        op.add_column(
            "prescription_set_masters",
            sa.Column("included_set_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        )
        op.alter_column("prescription_set_masters", "included_set_ids", server_default=None)

    if not _has_column("lab_set_masters", "included_set_ids"):
        op.add_column(
            "lab_set_masters",
            sa.Column("included_set_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        )
        op.alter_column("lab_set_masters", "included_set_ids", server_default=None)


def downgrade() -> None:
    if _has_column("lab_set_masters", "included_set_ids"):
        op.drop_column("lab_set_masters", "included_set_ids")
    if _has_column("prescription_set_masters", "included_set_ids"):
        op.drop_column("prescription_set_masters", "included_set_ids")
