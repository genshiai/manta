"""patient fhir columns (Step 1)

Add JP Core / FHIR-aligned columns to patients and backfill from the legacy
`name` / `kana` / `sex` / `demographics` fields.

The legacy columns remain — /api/* keeps using them, and the mapper falls back
to them when the new columns are NULL. Columns become authoritative once the
frontend writes via /fhir/Patient (Step 2+ of docs/FHIR_MIGRATION_PLAN.md).

Revision ID: 20260419_0010
Revises: 20260418_0009
Create Date: 2026-04-19 00:00:00
"""

from __future__ import annotations

from datetime import datetime

from alembic import op
import sqlalchemy as sa


revision = "20260419_0010"
down_revision = "20260418_0009"
branch_labels = None
depends_on = None


HOSPITAL_MRN_SYSTEM = "urn:manta:demo:hospital-mrn"

_GENDER_MAP = {
    "男性": "male",
    "女性": "female",
    "男": "male",
    "女": "female",
    "その他": "other",
    "不明": "unknown",
}

_NEW_COLUMNS = [
    ("birth_date", sa.Date(), True),
    ("gender", sa.String(length=16), True),
    ("family_name", sa.String(length=64), True),
    ("given_name", sa.String(length=64), True),
    ("family_name_kana", sa.String(length=64), True),
    ("given_name_kana", sa.String(length=64), True),
    ("identifier_json", sa.JSON(), True),
]


def _split_japanese_name(value: str | None) -> tuple[str | None, str | None]:
    if not value:
        return None, None
    normalized = value.replace("\u3000", " ").strip()
    if not normalized:
        return None, None
    parts = normalized.split(" ", 1)
    family = parts[0].strip() or None
    given = parts[1].strip() if len(parts) == 2 else None
    return family, given or None


def _parse_birth_date(demographics):
    if not demographics:
        return None
    if not isinstance(demographics, list):
        return None
    for item in demographics:
        if not isinstance(item, dict):
            continue
        label = item.get("label") or ""
        value = item.get("value") or ""
        if "生年月日" not in label or not value:
            continue
        head = value.split()[0].split("(")[0].strip()
        for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%Y.%m.%d"):
            try:
                return datetime.strptime(head, fmt).date()
            except ValueError:
                continue
    return None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {column["name"] for column in inspector.get_columns("patients")}

    for name, type_, nullable in _NEW_COLUMNS:
        if name in existing:
            continue
        op.add_column("patients", sa.Column(name, type_, nullable=nullable))

    patients = sa.table(
        "patients",
        sa.column("id", sa.String),
        sa.column("name", sa.String),
        sa.column("kana", sa.String),
        sa.column("sex", sa.String),
        sa.column("demographics", sa.JSON),
        sa.column("birth_date", sa.Date),
        sa.column("gender", sa.String),
        sa.column("family_name", sa.String),
        sa.column("given_name", sa.String),
        sa.column("family_name_kana", sa.String),
        sa.column("given_name_kana", sa.String),
        sa.column("identifier_json", sa.JSON),
    )

    rows = bind.execute(
        sa.select(
            patients.c.id,
            patients.c.name,
            patients.c.kana,
            patients.c.sex,
            patients.c.demographics,
        )
    ).fetchall()

    for row in rows:
        family, given = _split_japanese_name(row.name)
        family_kana, given_kana = _split_japanese_name(row.kana)
        gender = _GENDER_MAP.get((row.sex or "").strip(), "unknown")
        birth_date = _parse_birth_date(row.demographics)
        identifiers = [{"system": HOSPITAL_MRN_SYSTEM, "value": row.id}]

        bind.execute(
            patients.update()
            .where(patients.c.id == row.id)
            .values(
                family_name=family,
                given_name=given,
                family_name_kana=family_kana,
                given_name_kana=given_kana,
                gender=gender,
                birth_date=birth_date,
                identifier_json=identifiers,
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {column["name"] for column in inspector.get_columns("patients")}

    for name, _type, _nullable in reversed(_NEW_COLUMNS):
        if name in existing:
            op.drop_column("patients", name)
