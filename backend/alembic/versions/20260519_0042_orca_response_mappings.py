"""orca response mappings

Revision ID: 20260519_0042
Revises: 20260518_0041
Create Date: 2026-05-19 09:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260519_0042"
down_revision = "20260518_0041"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    return column_name in {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    if _has_table("orca_adapter_settings") and not _has_column("orca_adapter_settings", "response_mappings"):
        op.add_column(
            "orca_adapter_settings",
            sa.Column("response_mappings", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        )
        op.alter_column("orca_adapter_settings", "response_mappings", server_default=None)


def downgrade() -> None:
    if _has_table("orca_adapter_settings") and _has_column("orca_adapter_settings", "response_mappings"):
        op.drop_column("orca_adapter_settings", "response_mappings")
