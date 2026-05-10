"""orca http adapter settings

Revision ID: 20260510_0034
Revises: 20260510_0033
Create Date: 2026-05-10 15:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260510_0034"
down_revision = "20260510_0033"
branch_labels = None
depends_on = None


def _has_column(table_name: str, column_name: str) -> bool:
    return column_name in {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    if not _has_column("orca_adapter_settings", "password_secret"):
        op.add_column("orca_adapter_settings", sa.Column("password_secret", sa.Text(), nullable=True))
    if not _has_column("orca_adapter_settings", "health_endpoint"):
        op.add_column(
            "orca_adapter_settings",
            sa.Column("health_endpoint", sa.String(length=255), nullable=False, server_default="/api01rv2/systeminfv2"),
        )


def downgrade() -> None:
    if _has_column("orca_adapter_settings", "health_endpoint"):
        op.drop_column("orca_adapter_settings", "health_endpoint")
    if _has_column("orca_adapter_settings", "password_secret"):
        op.drop_column("orca_adapter_settings", "password_secret")
