"""claim drafts

Revision ID: 20260510_0031
Revises: 20260510_0030
Create Date: 2026-05-10 12:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260510_0031"
down_revision = "20260510_0030"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _has_table("claim_drafts"):
        op.create_table(
            "claim_drafts",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("patient_id", sa.String(), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
            sa.Column("admission_id", sa.Integer(), sa.ForeignKey("admissions.id", ondelete="CASCADE"), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
            sa.Column("source_type", sa.String(length=64), nullable=False, server_default="inpatient_discharge"),
            sa.Column("billing_candidates", sa.JSON(), nullable=False),
            sa.Column("total_points", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_by", sa.String(length=128), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_claim_drafts_patient_id", "claim_drafts", ["patient_id"])
        op.create_index("ix_claim_drafts_admission_id", "claim_drafts", ["admission_id"])
        op.create_index("ix_claim_drafts_status", "claim_drafts", ["status"])
        op.create_index("ix_claim_drafts_source_type", "claim_drafts", ["source_type"])
        op.create_index("ix_claim_drafts_created_at", "claim_drafts", ["created_at"])

    if not _has_table("claim_review_issues"):
        op.create_table(
            "claim_review_issues",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("claim_draft_id", sa.Integer(), sa.ForeignKey("claim_drafts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("issue_type", sa.String(length=64), nullable=False),
            sa.Column("severity", sa.String(length=32), nullable=False, server_default="warning"),
            sa.Column("message", sa.String(length=255), nullable=False),
            sa.Column("evidence", sa.Text(), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_claim_review_issues_claim_draft_id", "claim_review_issues", ["claim_draft_id"])
        op.create_index("ix_claim_review_issues_issue_type", "claim_review_issues", ["issue_type"])
        op.create_index("ix_claim_review_issues_severity", "claim_review_issues", ["severity"])
        op.create_index("ix_claim_review_issues_status", "claim_review_issues", ["status"])
        op.create_index("ix_claim_review_issues_created_at", "claim_review_issues", ["created_at"])


def downgrade() -> None:
    if _has_table("claim_review_issues"):
        op.drop_table("claim_review_issues")
    if _has_table("claim_drafts"):
        op.drop_table("claim_drafts")
