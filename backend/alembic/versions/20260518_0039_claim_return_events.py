"""claim return events

Revision ID: 20260518_0039
Revises: 20260517_0038
Create Date: 2026-05-18 18:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260518_0039"
down_revision = "20260517_0038"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if _has_table("claim_return_events"):
        return
    op.create_table(
        "claim_return_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("claim_draft_id", sa.Integer(), nullable=False),
        sa.Column("transmission_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("reason_code", sa.String(length=64), nullable=True),
        sa.Column("payer", sa.String(length=128), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assignee", sa.String(length=128), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["claim_draft_id"], ["claim_drafts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["transmission_id"], ["claim_transmissions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_claim_return_events_claim_draft_id", "claim_return_events", ["claim_draft_id"])
    op.create_index("ix_claim_return_events_transmission_id", "claim_return_events", ["transmission_id"])
    op.create_index("ix_claim_return_events_event_type", "claim_return_events", ["event_type"])
    op.create_index("ix_claim_return_events_severity", "claim_return_events", ["severity"])
    op.create_index("ix_claim_return_events_status", "claim_return_events", ["status"])
    op.create_index("ix_claim_return_events_reason_code", "claim_return_events", ["reason_code"])
    op.create_index("ix_claim_return_events_received_at", "claim_return_events", ["received_at"])
    op.create_index("ix_claim_return_events_due_at", "claim_return_events", ["due_at"])
    op.create_index("ix_claim_return_events_created_at", "claim_return_events", ["created_at"])


def downgrade() -> None:
    if not _has_table("claim_return_events"):
        return
    op.drop_index("ix_claim_return_events_created_at", table_name="claim_return_events")
    op.drop_index("ix_claim_return_events_due_at", table_name="claim_return_events")
    op.drop_index("ix_claim_return_events_received_at", table_name="claim_return_events")
    op.drop_index("ix_claim_return_events_reason_code", table_name="claim_return_events")
    op.drop_index("ix_claim_return_events_status", table_name="claim_return_events")
    op.drop_index("ix_claim_return_events_severity", table_name="claim_return_events")
    op.drop_index("ix_claim_return_events_event_type", table_name="claim_return_events")
    op.drop_index("ix_claim_return_events_transmission_id", table_name="claim_return_events")
    op.drop_index("ix_claim_return_events_claim_draft_id", table_name="claim_return_events")
    op.drop_table("claim_return_events")
