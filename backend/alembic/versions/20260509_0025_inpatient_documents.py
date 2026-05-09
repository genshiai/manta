"""inpatient documents

Revision ID: 20260509_0025
Revises: 20260508_0024
Create Date: 2026-05-09 10:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260509_0025"
down_revision = "20260508_0024"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    if _has_table("inpatient_documents"):
        return

    op.create_table(
        "inpatient_documents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("admission_id", sa.Integer(), sa.ForeignKey("admissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_type", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_inpatient_documents_admission_id", "inpatient_documents", ["admission_id"])
    op.create_index("ix_inpatient_documents_document_type", "inpatient_documents", ["document_type"])
    op.create_index("ix_inpatient_documents_status", "inpatient_documents", ["status"])
    op.create_index("ix_inpatient_documents_created_at", "inpatient_documents", ["created_at"])


def downgrade() -> None:
    if _has_table("inpatient_documents"):
        op.drop_table("inpatient_documents")
