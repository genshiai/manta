"""reservation slot capacity

Revision ID: 20260508_0022
Revises: 20260508_0021
Create Date: 2026-05-08 14:10:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260508_0022"
down_revision = "20260508_0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("reservation_slot_masters")}
    if "capacity" not in columns:
        op.add_column(
            "reservation_slot_masters",
            sa.Column("capacity", sa.Integer(), nullable=False, server_default="1"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("reservation_slot_masters")}
    if "capacity" in columns:
        op.drop_column("reservation_slot_masters", "capacity")
