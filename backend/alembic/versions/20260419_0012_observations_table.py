"""observations table (Step 3)

Introduce the `observations` table aligned with FHIR R4B Observation / JP Core.
Backfills rows from existing `patients.vitals` and `patients.lab_results` JSON.
The JSON columns are left untouched for /api/* compatibility.

Observation coding (LOINC) / UCUM 変換は app/fhir/mappers/observation.py の
ロジックに揃えつつ、マイグレーションは純粋な移送処理に留める (外部モジュール import は
避ける — Alembic 単体で実行可能にするため)。

Revision ID: 20260419_0012
Revises: 20260419_0011
Create Date: 2026-04-19 00:00:02
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision = "20260419_0012"
down_revision = "20260419_0011"
branch_labels = None
depends_on = None


# ---------------------------------------------------------------------------
# LOINC / UCUM テーブル (バックフィル専用。実行時参照は mapper 側で再定義)
# ---------------------------------------------------------------------------

LOINC_SYSTEM = "http://loinc.org"
UCUM_SYSTEM = "http://unitsofmeasure.org"

_VITAL_LOINC: dict[str, tuple[str, str, str | None, str | None]] = {
    # label: (loinc, display, ucum_unit, ucum_code)
    "脈拍": ("8867-4", "Heart rate", "/min", "/min"),
    "心拍数": ("8867-4", "Heart rate", "/min", "/min"),
    "体温": ("8310-5", "Body temperature", "°C", "Cel"),
    "SpO2": ("59408-5", "Oxygen saturation in Arterial blood by Pulse oximetry", "%", "%"),
    "体重": ("29463-7", "Body weight", "kg", "kg"),
    "身長": ("8302-2", "Body height", "cm", "cm"),
    "BMI": ("39156-5", "Body mass index (BMI) [Ratio]", "kg/m2", "kg/m2"),
    "血圧": ("85354-9", "Blood pressure panel with all children optional", None, None),
}

_LAB_LOINC: dict[str, tuple[str, str]] = {
    # item: (loinc, display)
    "HbA1c": ("4548-4", "Hemoglobin A1c/Hemoglobin.total in Blood"),
    "空腹時血糖": ("1558-6", "Fasting glucose [Mass/volume] in Serum or Plasma"),
    "LDL-C": ("13457-7", "Cholesterol in LDL [Mass/volume] in Serum or Plasma by Direct assay"),
    "HDL-C": ("2085-9", "Cholesterol in HDL [Mass/volume] in Serum or Plasma"),
    "AST (GOT)": ("1920-8", "Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma"),
    "ALT (GPT)": ("1742-6", "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma"),
    "γ-GTP": ("2324-2", "Gamma glutamyl transferase [Enzymatic activity/volume] in Serum or Plasma"),
    "クレアチニン": ("2160-0", "Creatinine [Mass/volume] in Serum or Plasma"),
    "eGFR": ("98979-8", "Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area]"),
    "白血球": ("6690-2", "Leukocytes [#/volume] in Blood by Automated count"),
    "赤血球": ("789-8", "Erythrocytes [#/volume] in Blood by Automated count"),
    "ヘモグロビン": ("718-7", "Hemoglobin [Mass/volume] in Blood"),
    "ヘマトクリット": ("4544-3", "Hematocrit [Volume Fraction] of Blood by Automated count"),
    "血小板": ("777-3", "Platelets [#/volume] in Blood by Automated count"),
}

_INTERPRETATION_MAP = {
    "high": "H",
    "low": "L",
    "normal": "N",
    "abnormal": "A",
    "critical_high": "HH",
    "critical_low": "LL",
}

_NUMBER_RE = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*(.*)$")


def _parse_quantity(raw: str | None) -> tuple[float | None, str | None]:
    """'7.2%' → (7.2, '%'), '138 mg/dL' → (138.0, 'mg/dL'), '132 / 78' → (None, None)。"""
    if not raw:
        return None, None
    text = raw.strip()
    if "/" in text:
        return None, None
    match = _NUMBER_RE.match(text)
    if not match:
        return None, None
    value_str, unit = match.groups()
    try:
        value = float(value_str)
    except ValueError:
        return None, None
    unit_str = unit.strip()
    return value, unit_str or None


def _parse_date(raw: str | None) -> datetime | None:
    if not raw:
        return None
    head = raw.split()[0].split("(")[0].strip()
    for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%Y.%m.%d"):
        try:
            return datetime.strptime(head, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# Migration
# ---------------------------------------------------------------------------


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "observations" not in tables:
        op.create_table(
            "observations",
            sa.Column("id", sa.String(length=64), primary_key=True, nullable=False),
            sa.Column(
                "patient_id",
                sa.String(length=32),
                sa.ForeignKey("patients.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="final"),
            sa.Column("category", sa.String(length=32), nullable=False, index=True),
            sa.Column("code_system", sa.String(length=128), nullable=True),
            sa.Column("code", sa.String(length=64), nullable=True, index=True),
            sa.Column("code_display", sa.String(length=255), nullable=True),
            sa.Column("code_text", sa.String(length=255), nullable=True),
            sa.Column("value_quantity_value", sa.Numeric(precision=18, scale=6), nullable=True),
            sa.Column("value_quantity_unit", sa.String(length=64), nullable=True),
            sa.Column("value_quantity_system", sa.String(length=128), nullable=True),
            sa.Column("value_quantity_code", sa.String(length=64), nullable=True),
            sa.Column("value_string", sa.Text(), nullable=True),
            sa.Column("interpretation_code", sa.String(length=16), nullable=True),
            sa.Column("reference_range_text", sa.String(length=255), nullable=True),
            sa.Column("effective_datetime", sa.DateTime(timezone=True), nullable=True, index=True),
            sa.Column("issued_datetime", sa.DateTime(timezone=True), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
        )

    patients = sa.table(
        "patients",
        sa.column("id", sa.String),
        sa.column("vitals", sa.JSON),
        sa.column("lab_results", sa.JSON),
    )
    observations = sa.table(
        "observations",
        sa.column("id", sa.String),
        sa.column("patient_id", sa.String),
        sa.column("status", sa.String),
        sa.column("category", sa.String),
        sa.column("code_system", sa.String),
        sa.column("code", sa.String),
        sa.column("code_display", sa.String),
        sa.column("code_text", sa.String),
        sa.column("value_quantity_value", sa.Numeric),
        sa.column("value_quantity_unit", sa.String),
        sa.column("value_quantity_system", sa.String),
        sa.column("value_quantity_code", sa.String),
        sa.column("value_string", sa.Text),
        sa.column("interpretation_code", sa.String),
        sa.column("reference_range_text", sa.String),
        sa.column("effective_datetime", sa.DateTime(timezone=True)),
        sa.column("issued_datetime", sa.DateTime(timezone=True)),
    )

    existing = {
        row.patient_id
        for row in bind.execute(sa.select(observations.c.patient_id).distinct()).fetchall()
    }

    rows = bind.execute(
        sa.select(patients.c.id, patients.c.vitals, patients.c.lab_results)
    ).fetchall()
    now = datetime.now(timezone.utc)

    for row in rows:
        if row.id in existing:
            continue

        # Vitals
        for vital in (row.vitals or []):
            if not isinstance(vital, dict):
                continue
            label = (vital.get("label") or "").strip()
            if not label:
                continue
            raw_value = vital.get("value")
            loinc = _VITAL_LOINC.get(label)
            value_num, parsed_unit = _parse_quantity(raw_value)
            unit = (vital.get("unit") or parsed_unit or "") or None
            ucum_code = None
            code = display = None
            if loinc:
                code, display, ucum_unit, ucum_code = loinc
                if not unit and ucum_unit:
                    unit = ucum_unit
            bind.execute(
                observations.insert().values(
                    id=uuid4().hex,
                    patient_id=row.id,
                    status="final",
                    category="vital-signs",
                    code_system=LOINC_SYSTEM if code else None,
                    code=code,
                    code_display=display,
                    code_text=label,
                    value_quantity_value=value_num,
                    value_quantity_unit=unit,
                    value_quantity_system=UCUM_SYSTEM if ucum_code else None,
                    value_quantity_code=ucum_code,
                    value_string=raw_value if value_num is None else None,
                    interpretation_code=None,
                    reference_range_text=None,
                    effective_datetime=now,
                    issued_datetime=now,
                )
            )

        # Lab results (history 単位で展開、無ければ result を reported_at で 1 件)
        for lab in (row.lab_results or []):
            if not isinstance(lab, dict):
                continue
            item = (lab.get("item") or "").strip()
            if not item:
                continue
            loinc = _LAB_LOINC.get(item)
            code = loinc[0] if loinc else None
            display = loinc[1] if loinc else None
            reference_range = lab.get("baseline") or None
            history = lab.get("history") or []
            if not history:
                history = [
                    {
                        "date": lab.get("reported_at"),
                        "value": lab.get("result"),
                        "flag": lab.get("flag"),
                    }
                ]
            for entry in history:
                if not isinstance(entry, dict):
                    continue
                raw_value = entry.get("value")
                value_num, parsed_unit = _parse_quantity(raw_value)
                effective = _parse_date(entry.get("date")) or now
                bind.execute(
                    observations.insert().values(
                        id=uuid4().hex,
                        patient_id=row.id,
                        status="final",
                        category="laboratory",
                        code_system=LOINC_SYSTEM if code else None,
                        code=code,
                        code_display=display,
                        code_text=item,
                        value_quantity_value=value_num,
                        value_quantity_unit=parsed_unit,
                        value_quantity_system=None,
                        value_quantity_code=None,
                        value_string=raw_value if value_num is None else None,
                        interpretation_code=_INTERPRETATION_MAP.get(
                            (entry.get("flag") or "").strip()
                        ),
                        reference_range_text=reference_range,
                        effective_datetime=effective,
                        issued_datetime=effective,
                    )
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "observations" in tables:
        op.drop_table("observations")
