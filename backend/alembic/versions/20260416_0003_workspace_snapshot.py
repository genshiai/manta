"""workspace snapshot columns

Revision ID: 20260416_0003
Revises: 20260416_0002
Create Date: 2026-04-16 01:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260416_0003"
down_revision = "20260416_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("patients")}

    for column_name in ("visit_history", "vitals", "lab_results", "chart_history"):
        if column_name in columns:
            continue

        op.add_column(
            "patients",
            sa.Column(
                column_name,
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'[]'::json"),
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("patients")}

    for column_name in ("chart_history", "lab_results", "vitals", "visit_history"):
        if column_name in columns:
            op.drop_column("patients", column_name)
