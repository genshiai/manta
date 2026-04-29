"""patient context

Revision ID: 20260416_0002
Revises: 20260415_0001
Create Date: 2026-04-16 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260416_0002"
down_revision = "20260415_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("patients")}

    if "profile_items" not in columns:
        op.add_column(
            "patients",
            sa.Column(
                "profile_items",
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'[]'::json"),
            ),
        )

    if "problems" not in columns:
        op.add_column(
            "patients",
            sa.Column(
                "problems",
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'[]'::json"),
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("patients")}

    if "problems" in columns:
        op.drop_column("patients", "problems")

    if "profile_items" in columns:
        op.drop_column("patients", "profile_items")
