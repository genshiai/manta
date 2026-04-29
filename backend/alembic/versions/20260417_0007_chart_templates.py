"""chart template masters

Revision ID: 20260417_0007
Revises: 20260417_0006
Create Date: 2026-04-17 02:10:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260417_0007"
down_revision = "20260417_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "chart_template_masters" in inspector.get_table_names():
        return

    op.create_table(
        "chart_template_masters",
        sa.Column("id", sa.String(length=64), primary_key=True, nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("department", sa.String(length=128), nullable=False),
        sa.Column("subjective", sa.Text(), nullable=False),
        sa.Column("objective", sa.Text(), nullable=False),
        sa.Column("assessment", sa.Text(), nullable=False),
        sa.Column("plan", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "chart_template_masters" in inspector.get_table_names():
        op.drop_table("chart_template_masters")
