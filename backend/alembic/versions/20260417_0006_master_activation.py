"""master activation flags

Revision ID: 20260417_0006
Revises: 20260416_0005
Create Date: 2026-04-17 00:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260417_0006"
down_revision = "20260416_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    targets = {
        "prescription_catalog_masters": "is_active",
        "lab_set_masters": "is_active",
        "reservation_slot_masters": "is_active",
    }

    for table_name, column_name in targets.items():
        columns = {column["name"] for column in inspector.get_columns(table_name)}
        if column_name in columns:
            continue

        op.add_column(
            table_name,
            sa.Column(
                column_name,
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for table_name, column_name in (
        ("reservation_slot_masters", "is_active"),
        ("lab_set_masters", "is_active"),
        ("prescription_catalog_masters", "is_active"),
    ):
        columns = {column["name"] for column in inspector.get_columns(table_name)}
        if column_name in columns:
            op.drop_column(table_name, column_name)
