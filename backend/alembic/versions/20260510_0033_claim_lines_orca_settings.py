"""claim lines and orca settings

Revision ID: 20260510_0033
Revises: 20260510_0032
Create Date: 2026-05-10 14:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260510_0033"
down_revision = "20260510_0032"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _has_table("claim_draft_lines"):
        op.create_table(
            "claim_draft_lines",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("claim_draft_id", sa.Integer(), sa.ForeignKey("claim_drafts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("line_type", sa.String(length=64), nullable=False),
            sa.Column("source_type", sa.String(length=64), nullable=False),
            sa.Column("source_id", sa.String(length=64), nullable=True),
            sa.Column("label", sa.String(length=255), nullable=False),
            sa.Column("receipt_code", sa.String(length=32), nullable=True),
            sa.Column("receipt_name", sa.String(length=255), nullable=True),
            sa.Column("points", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("unit", sa.String(length=32), nullable=True),
            sa.Column("evidence", sa.Text(), nullable=True),
            sa.Column("review_status", sa.String(length=32), nullable=False, server_default="candidate"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_claim_draft_lines_claim_draft_id", "claim_draft_lines", ["claim_draft_id"])
        op.create_index("ix_claim_draft_lines_line_type", "claim_draft_lines", ["line_type"])
        op.create_index("ix_claim_draft_lines_source_type", "claim_draft_lines", ["source_type"])
        op.create_index("ix_claim_draft_lines_source_id", "claim_draft_lines", ["source_id"])
        op.create_index("ix_claim_draft_lines_receipt_code", "claim_draft_lines", ["receipt_code"])
        op.create_index("ix_claim_draft_lines_review_status", "claim_draft_lines", ["review_status"])
        op.create_index("ix_claim_draft_lines_created_at", "claim_draft_lines", ["created_at"])

    if not _has_table("orca_adapter_settings"):
        op.create_table(
            "orca_adapter_settings",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("base_url", sa.String(length=255), nullable=True),
            sa.Column("auth_type", sa.String(length=32), nullable=False, server_default="none"),
            sa.Column("username", sa.String(length=128), nullable=True),
            sa.Column("client_id", sa.String(length=128), nullable=True),
            sa.Column("claim_endpoint", sa.String(length=255), nullable=False, server_default="/api01rv2/claim"),
            sa.Column("mode", sa.String(length=32), nullable=False, server_default="mock"),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("updated_by", sa.String(length=128), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_orca_adapter_settings_is_active", "orca_adapter_settings", ["is_active"])
        op.create_index("ix_orca_adapter_settings_mode", "orca_adapter_settings", ["mode"])


def downgrade() -> None:
    if _has_table("orca_adapter_settings"):
        op.drop_table("orca_adapter_settings")
    if _has_table("claim_draft_lines"):
        op.drop_table("claim_draft_lines")
