"""claim rules and transmissions

Revision ID: 20260510_0032
Revises: 20260510_0031
Create Date: 2026-05-10 13:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260510_0032"
down_revision = "20260510_0031"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _has_table("facility_claim_rules"):
        op.create_table(
            "facility_claim_rules",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column("sort_order", sa.Integer(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("category", sa.String(length=64), nullable=False),
            sa.Column("target_category", sa.String(length=64), nullable=False),
            sa.Column("rule_type", sa.String(length=64), nullable=False),
            sa.Column("severity", sa.String(length=32), nullable=False, server_default="warning"),
            sa.Column("message", sa.String(length=255), nullable=False),
            sa.Column("evidence_hint", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_facility_claim_rules_is_active", "facility_claim_rules", ["is_active"])
        op.create_index("ix_facility_claim_rules_category", "facility_claim_rules", ["category"])
        op.create_index("ix_facility_claim_rules_target_category", "facility_claim_rules", ["target_category"])
        op.create_index("ix_facility_claim_rules_rule_type", "facility_claim_rules", ["rule_type"])

    if not _has_table("claim_transmissions"):
        op.create_table(
            "claim_transmissions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("claim_draft_id", sa.Integer(), sa.ForeignKey("claim_drafts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("adapter", sa.String(length=64), nullable=False, server_default="orca"),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
            sa.Column("request_payload", sa.JSON(), nullable=False),
            sa.Column("response_payload", sa.JSON(), nullable=False),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("sent_by", sa.String(length=128), nullable=False),
            sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_claim_transmissions_claim_draft_id", "claim_transmissions", ["claim_draft_id"])
        op.create_index("ix_claim_transmissions_adapter", "claim_transmissions", ["adapter"])
        op.create_index("ix_claim_transmissions_status", "claim_transmissions", ["status"])
        op.create_index("ix_claim_transmissions_sent_at", "claim_transmissions", ["sent_at"])
        op.create_index("ix_claim_transmissions_created_at", "claim_transmissions", ["created_at"])


def downgrade() -> None:
    if _has_table("claim_transmissions"):
        op.drop_table("claim_transmissions")
    if _has_table("facility_claim_rules"):
        op.drop_table("facility_claim_rules")
