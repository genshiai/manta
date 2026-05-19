"""monthly claim closes

Revision ID: 20260518_0040
Revises: 20260518_0039
Create Date: 2026-05-18 19:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260518_0040"
down_revision = "20260518_0039"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    return column_name in {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _has_index(table_name: str, index_name: str) -> bool:
    return index_name in {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    if not _has_index(table_name, index_name):
        op.create_index(index_name, table_name, columns)


def upgrade() -> None:
    if not _has_table("monthly_claim_closes"):
        op.create_table(
            "monthly_claim_closes",
            sa.Column("month", sa.String(length=7), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("claim_count", sa.Integer(), nullable=False),
            sa.Column("total_points", sa.Integer(), nullable=False),
            sa.Column("unsubmitted_count", sa.Integer(), nullable=False),
            sa.Column("open_return_count", sa.Integer(), nullable=False),
            sa.Column("unresolved_issue_count", sa.Integer(), nullable=False),
            sa.Column("snapshot", sa.JSON(), nullable=False),
            sa.Column("requested_by", sa.String(length=128), nullable=True),
            sa.Column("requested_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("closed_by", sa.String(length=128), nullable=False),
            sa.Column("closed_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("approved_by", sa.String(length=128), nullable=True),
            sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("approval_note", sa.Text(), nullable=True),
            sa.Column("cancelled_by", sa.String(length=128), nullable=True),
            sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("cancel_reason", sa.Text(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("month"),
        )
    else:
        optional_columns = [
            ("requested_by", sa.Column("requested_by", sa.String(length=128), nullable=True)),
            ("requested_at", sa.Column("requested_at", sa.DateTime(timezone=True), nullable=True)),
            ("approved_by", sa.Column("approved_by", sa.String(length=128), nullable=True)),
            ("approved_at", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True)),
            ("approval_note", sa.Column("approval_note", sa.Text(), nullable=True)),
        ]
        for column_name, column in optional_columns:
            if not _has_column("monthly_claim_closes", column_name):
                op.add_column("monthly_claim_closes", column)
    _create_index_if_missing("ix_monthly_claim_closes_status", "monthly_claim_closes", ["status"])
    _create_index_if_missing("ix_monthly_claim_closes_requested_at", "monthly_claim_closes", ["requested_at"])
    _create_index_if_missing("ix_monthly_claim_closes_closed_at", "monthly_claim_closes", ["closed_at"])
    _create_index_if_missing("ix_monthly_claim_closes_approved_at", "monthly_claim_closes", ["approved_at"])
    _create_index_if_missing("ix_monthly_claim_closes_cancelled_at", "monthly_claim_closes", ["cancelled_at"])


def downgrade() -> None:
    if not _has_table("monthly_claim_closes"):
        return
    for index_name in [
        "ix_monthly_claim_closes_cancelled_at",
        "ix_monthly_claim_closes_approved_at",
        "ix_monthly_claim_closes_closed_at",
        "ix_monthly_claim_closes_requested_at",
        "ix_monthly_claim_closes_status",
    ]:
        if _has_index("monthly_claim_closes", index_name):
            op.drop_index(index_name, table_name="monthly_claim_closes")
    op.drop_table("monthly_claim_closes")
