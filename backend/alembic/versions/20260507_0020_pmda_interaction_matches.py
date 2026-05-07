"""pmda interaction matches

Revision ID: 20260507_0020
Revises: 20260507_0019
Create Date: 2026-05-07 23:05:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260507_0020"
down_revision = "20260507_0019"
branch_labels = None
depends_on = None


def create_index_if_missing(table_name: str, index_name: str, columns: list[str]) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_indexes = {index["name"] for index in inspector.get_indexes(table_name)}
    if index_name not in existing_indexes:
        op.create_index(index_name, table_name, columns)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "pmda_drug_interaction_matches" not in inspector.get_table_names():
        op.create_table(
            "pmda_drug_interaction_matches",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
            sa.Column(
                "interaction_id",
                sa.Integer(),
                sa.ForeignKey("pmda_drug_interactions.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("interacting_drug_normalized", sa.String(length=255), nullable=False),
            sa.Column("matched_yj_code", sa.String(length=64), nullable=False),
            sa.Column("matched_drug_name", sa.String(length=255), nullable=False),
            sa.Column("match_source", sa.String(length=32), nullable=False),
            sa.Column("match_confidence", sa.Integer(), nullable=False),
            sa.Column("source_code", sa.String(length=64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )

    create_index_if_missing(
        "pmda_drug_interaction_matches",
        "ix_pmda_drug_interaction_matches_interaction_id",
        ["interaction_id"],
    )
    create_index_if_missing(
        "pmda_drug_interaction_matches",
        "ix_pmda_drug_interaction_matches_matched_yj_code",
        ["matched_yj_code"],
    )
    create_index_if_missing(
        "pmda_drug_interaction_matches",
        "ix_pmda_drug_interaction_matches_source",
        ["match_source"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "pmda_drug_interaction_matches" in inspector.get_table_names():
        op.drop_table("pmda_drug_interaction_matches")
