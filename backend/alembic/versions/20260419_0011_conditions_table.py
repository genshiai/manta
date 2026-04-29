"""conditions table (Step 2)

Introduce the `conditions` table aligned with FHIR R4B Condition / JP Core.
Backfills rows from existing ``patients.problems`` JSON. The JSON column is
left untouched so ``/api/*`` continues to work during the transition.

Revision ID: 20260419_0011
Revises: 20260419_0010
Create Date: 2026-04-19 00:00:01
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision = "20260419_0011"
down_revision = "20260419_0010"
branch_labels = None
depends_on = None


CLINICAL_STATUS_DEFAULT = "active"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "conditions" not in tables:
        op.create_table(
            "conditions",
            sa.Column("id", sa.String(length=64), primary_key=True, nullable=False),
            sa.Column(
                "patient_id",
                sa.String(length=32),
                sa.ForeignKey("patients.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("clinical_status", sa.String(length=32), nullable=False),
            sa.Column(
                "verification_status",
                sa.String(length=32),
                nullable=False,
                server_default="confirmed",
            ),
            sa.Column(
                "category",
                sa.String(length=32),
                nullable=False,
                server_default="problem-list-item",
            ),
            sa.Column("icd10_code", sa.String(length=16), nullable=True, index=True),
            sa.Column("management_number", sa.String(length=32), nullable=True, index=True),
            sa.Column("disease_name", sa.String(length=255), nullable=False),
            sa.Column("onset_text", sa.String(length=255), nullable=True),
            sa.Column("onset_date", sa.Date(), nullable=True),
            sa.Column("abatement_date", sa.Date(), nullable=True),
            sa.Column(
                "recorded_date",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.Column("note", sa.Text(), nullable=True),
        )

    # Backfill from patients.problems
    patients = sa.table(
        "patients",
        sa.column("id", sa.String),
        sa.column("problems", sa.JSON),
    )
    conditions = sa.table(
        "conditions",
        sa.column("id", sa.String),
        sa.column("patient_id", sa.String),
        sa.column("clinical_status", sa.String),
        sa.column("verification_status", sa.String),
        sa.column("category", sa.String),
        sa.column("icd10_code", sa.String),
        sa.column("management_number", sa.String),
        sa.column("disease_name", sa.String),
        sa.column("onset_text", sa.String),
        sa.column("recorded_date", sa.DateTime(timezone=True)),
    )

    existing_patient_ids_with_conditions = {
        row.patient_id
        for row in bind.execute(
            sa.select(conditions.c.patient_id).distinct()
        ).fetchall()
    }

    rows = bind.execute(sa.select(patients.c.id, patients.c.problems)).fetchall()
    now = datetime.now(timezone.utc)

    for row in rows:
        if row.id in existing_patient_ids_with_conditions:
            # 再マイグレーション時の重複挿入を避ける
            continue
        problems = row.problems or []
        if not isinstance(problems, list):
            continue
        for problem in problems:
            if not isinstance(problem, dict):
                continue
            raw_name = (problem.get("name") or "").strip()
            if not raw_name:
                continue
            disease_name = _strip_problem_prefix(raw_name)
            clinical_status = (problem.get("status") or CLINICAL_STATUS_DEFAULT).strip() or CLINICAL_STATUS_DEFAULT
            bind.execute(
                conditions.insert().values(
                    id=uuid4().hex,
                    patient_id=row.id,
                    clinical_status=clinical_status,
                    verification_status="confirmed",
                    category="problem-list-item",
                    icd10_code=(problem.get("icd10_code") or None) or None,
                    management_number=(problem.get("management_number") or None) or None,
                    disease_name=disease_name,
                    onset_text=(problem.get("since") or None),
                    recorded_date=now,
                )
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "conditions" in tables:
        op.drop_table("conditions")


def _strip_problem_prefix(name: str) -> str:
    """'#1 2型糖尿病' → '2型糖尿病'。prefix が無ければそのまま返す。"""
    import re

    return re.sub(r"^#\d+\s*", "", name).strip()
