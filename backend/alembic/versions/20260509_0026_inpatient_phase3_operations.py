"""inpatient phase3 operations

Revision ID: 20260509_0026
Revises: 20260509_0025
Create Date: 2026-05-09 11:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260509_0026"
down_revision = "20260509_0025"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    if not _has_table("inpatient_events"):
        op.create_table(
            "inpatient_events",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("admission_id", sa.Integer(), sa.ForeignKey("admissions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("event_type", sa.String(length=64), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("detail", sa.Text(), nullable=True),
            sa.Column("actor", sa.String(length=128), nullable=False),
            sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_inpatient_events_admission_id", "inpatient_events", ["admission_id"])
        op.create_index("ix_inpatient_events_event_type", "inpatient_events", ["event_type"])
        op.create_index("ix_inpatient_events_occurred_at", "inpatient_events", ["occurred_at"])

    if not _has_table("inpatient_pathway_assignments"):
        op.create_table(
            "inpatient_pathway_assignments",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("admission_id", sa.Integer(), sa.ForeignKey("admissions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("pathway_name", sa.String(length=255), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
            sa.Column("started_on", sa.Date(), nullable=False),
            sa.Column("assigned_by", sa.String(length=128), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_inpatient_pathway_assignments_admission_id", "inpatient_pathway_assignments", ["admission_id"])
        op.create_index("ix_inpatient_pathway_assignments_status", "inpatient_pathway_assignments", ["status"])
        op.create_index("ix_inpatient_pathway_assignments_created_at", "inpatient_pathway_assignments", ["created_at"])

    if not _has_table("inpatient_pathway_tasks"):
        op.create_table(
            "inpatient_pathway_tasks",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("pathway_assignment_id", sa.Integer(), sa.ForeignKey("inpatient_pathway_assignments.id", ondelete="CASCADE"), nullable=False),
            sa.Column("day_offset", sa.Integer(), nullable=False),
            sa.Column("category", sa.String(length=64), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
            sa.Column("variance_note", sa.Text(), nullable=True),
            sa.Column("updated_by", sa.String(length=128), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_inpatient_pathway_tasks_pathway_assignment_id", "inpatient_pathway_tasks", ["pathway_assignment_id"])
        op.create_index("ix_inpatient_pathway_tasks_day_offset", "inpatient_pathway_tasks", ["day_offset"])
        op.create_index("ix_inpatient_pathway_tasks_status", "inpatient_pathway_tasks", ["status"])

    if not _has_table("inpatient_ai_summary_reviews"):
        op.create_table(
            "inpatient_ai_summary_reviews",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("admission_id", sa.Integer(), sa.ForeignKey("admissions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("summary_title", sa.String(length=255), nullable=False),
            sa.Column("summary_body", sa.Text(), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
            sa.Column("source_counts", sa.JSON(), nullable=False),
            sa.Column("reviewed_by", sa.String(length=128), nullable=False),
            sa.Column("review_note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_inpatient_ai_summary_reviews_admission_id", "inpatient_ai_summary_reviews", ["admission_id"])
        op.create_index("ix_inpatient_ai_summary_reviews_status", "inpatient_ai_summary_reviews", ["status"])
        op.create_index("ix_inpatient_ai_summary_reviews_created_at", "inpatient_ai_summary_reviews", ["created_at"])


def downgrade() -> None:
    for table_name in (
        "inpatient_ai_summary_reviews",
        "inpatient_pathway_tasks",
        "inpatient_pathway_assignments",
        "inpatient_events",
    ):
        if _has_table(table_name):
            op.drop_table(table_name)
