"""claim rule dsl

Revision ID: 20260511_0035
Revises: 20260510_0034
Create Date: 2026-05-11 09:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260511_0035"
down_revision = "20260510_0034"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    return column_name in {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    if not _has_column("facility_claim_rules", "conditions"):
        op.add_column("facility_claim_rules", sa.Column("conditions", sa.JSON(), nullable=False, server_default="{}"))
    if not _has_column("facility_claim_rules", "actions"):
        op.add_column("facility_claim_rules", sa.Column("actions", sa.JSON(), nullable=False, server_default="{}"))

    if not _has_table("claim_line_adjustments"):
        op.create_table(
            "claim_line_adjustments",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("claim_draft_id", sa.Integer(), sa.ForeignKey("claim_drafts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("claim_draft_line_id", sa.Integer(), sa.ForeignKey("claim_draft_lines.id", ondelete="CASCADE"), nullable=True),
            sa.Column("rule_id", sa.String(length=64), nullable=True),
            sa.Column("adjustment_type", sa.String(length=64), nullable=False),
            sa.Column("points_delta", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("reason", sa.String(length=255), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="suggested"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_claim_line_adjustments_claim_draft_id", "claim_line_adjustments", ["claim_draft_id"])
        op.create_index("ix_claim_line_adjustments_claim_draft_line_id", "claim_line_adjustments", ["claim_draft_line_id"])
        op.create_index("ix_claim_line_adjustments_rule_id", "claim_line_adjustments", ["rule_id"])
        op.create_index("ix_claim_line_adjustments_adjustment_type", "claim_line_adjustments", ["adjustment_type"])
        op.create_index("ix_claim_line_adjustments_status", "claim_line_adjustments", ["status"])
        op.create_index("ix_claim_line_adjustments_created_at", "claim_line_adjustments", ["created_at"])


def downgrade() -> None:
    if _has_table("claim_line_adjustments"):
        op.drop_table("claim_line_adjustments")
    if _has_column("facility_claim_rules", "actions"):
        op.drop_column("facility_claim_rules", "actions")
    if _has_column("facility_claim_rules", "conditions"):
        op.drop_column("facility_claim_rules", "conditions")
