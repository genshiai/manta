"""communication threads

Revision ID: 20260716_0045
Revises: 20260519_0044
Create Date: 2026-07-16 12:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260716_0045"
down_revision = "20260519_0044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "communication_threads" not in inspector.get_table_names():
        op.create_table(
            "communication_threads",
            sa.Column("id", sa.String(length=64), nullable=False),
            sa.Column("kind", sa.String(length=32), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("patient_id", sa.String(length=32), nullable=True),
            sa.Column("department", sa.String(length=128), nullable=True),
            sa.Column("participant_user_ids", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_communication_threads_kind", "communication_threads", ["kind"])
        op.create_index("ix_communication_threads_patient_id", "communication_threads", ["patient_id"])
        op.create_index("ix_communication_threads_department", "communication_threads", ["department"])
        op.create_index("ix_communication_threads_updated_at", "communication_threads", ["updated_at"])
    inspector = sa.inspect(op.get_bind())
    if "communication_messages" not in inspector.get_table_names():
        op.create_table(
            "communication_messages",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("thread_id", sa.String(length=64), nullable=False),
            sa.Column("author_user_id", sa.String(length=64), nullable=True),
            sa.Column("author_name", sa.String(length=128), nullable=False),
            sa.Column("author_role", sa.String(length=64), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("is_system", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["thread_id"], ["communication_threads.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_communication_messages_thread_id", "communication_messages", ["thread_id"])
        op.create_index("ix_communication_messages_author_user_id", "communication_messages", ["author_user_id"])
        op.create_index("ix_communication_messages_created_at", "communication_messages", ["created_at"])
    inspector = sa.inspect(op.get_bind())
    if "communication_read_states" not in inspector.get_table_names():
        op.create_table(
            "communication_read_states",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("thread_id", sa.String(length=64), nullable=False),
            sa.Column("user_id", sa.String(length=64), nullable=False),
            sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["thread_id"], ["communication_threads.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("thread_id", "user_id", name="uq_communication_read_state"),
        )
        op.create_index("ix_communication_read_states_thread_id", "communication_read_states", ["thread_id"])
        op.create_index("ix_communication_read_states_user_id", "communication_read_states", ["user_id"])


def downgrade() -> None:
    tables = sa.inspect(op.get_bind()).get_table_names()
    if "communication_read_states" in tables:
        op.drop_table("communication_read_states")
    if "communication_messages" in tables:
        op.drop_table("communication_messages")
    if "communication_threads" in tables:
        op.drop_table("communication_threads")
