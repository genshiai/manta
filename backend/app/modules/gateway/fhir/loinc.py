"""Japanese label → LOINC / UCUM のルックアップ (Step 3)。

将来的には MEDIS JLAC10 / JLAC11 と LOINC の完全対応表に差し替える前提。
Step 3 時点では seed / demo が使うラベルに限定した最小対応表として保持する。

This material contains content from LOINC (https://loinc.org). LOINC is
copyright (c) Regenstrief Institute, Inc. and the Logical Observation
Identifiers Names and Codes (LOINC) Committee and is available at no cost
under the license at https://loinc.org/license/.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


LOINC_SYSTEM = "http://loinc.org"
UCUM_SYSTEM = "http://unitsofmeasure.org"


@dataclass(frozen=True)
class VitalCoding:
    loinc: str
    display: str
    ucum_unit: str | None
    ucum_code: str | None


@dataclass(frozen=True)
class LabCoding:
    loinc: str
    display: str


_VITAL_BY_LABEL: dict[str, VitalCoding] = {
    "脈拍": VitalCoding("8867-4", "Heart rate", "/min", "/min"),
    "心拍数": VitalCoding("8867-4", "Heart rate", "/min", "/min"),
    "体温": VitalCoding("8310-5", "Body temperature", "°C", "Cel"),
    "SpO2": VitalCoding(
        "59408-5",
        "Oxygen saturation in Arterial blood by Pulse oximetry",
        "%",
        "%",
    ),
    "体重": VitalCoding("29463-7", "Body weight", "kg", "kg"),
    "身長": VitalCoding("8302-2", "Body height", "cm", "cm"),
    "BMI": VitalCoding("39156-5", "Body mass index (BMI) [Ratio]", "kg/m2", "kg/m2"),
    "血圧": VitalCoding(
        "85354-9",
        "Blood pressure panel with all children optional",
        None,
        None,
    ),
}


_LAB_BY_LABEL: dict[str, LabCoding] = {
    "HbA1c": LabCoding("4548-4", "Hemoglobin A1c/Hemoglobin.total in Blood"),
    "空腹時血糖": LabCoding(
        "1558-6", "Fasting glucose [Mass/volume] in Serum or Plasma"
    ),
    "LDL-C": LabCoding(
        "13457-7",
        "Cholesterol in LDL [Mass/volume] in Serum or Plasma by Direct assay",
    ),
    "HDL-C": LabCoding("2085-9", "Cholesterol in HDL [Mass/volume] in Serum or Plasma"),
    "AST (GOT)": LabCoding(
        "1920-8",
        "Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma",
    ),
    "ALT (GPT)": LabCoding(
        "1742-6",
        "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma",
    ),
    "γ-GTP": LabCoding(
        "2324-2",
        "Gamma glutamyl transferase [Enzymatic activity/volume] in Serum or Plasma",
    ),
    "クレアチニン": LabCoding("2160-0", "Creatinine [Mass/volume] in Serum or Plasma"),
    "eGFR": LabCoding(
        "98979-8",
        "Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area]",
    ),
    "白血球": LabCoding("6690-2", "Leukocytes [#/volume] in Blood by Automated count"),
    "赤血球": LabCoding("789-8", "Erythrocytes [#/volume] in Blood by Automated count"),
    "ヘモグロビン": LabCoding("718-7", "Hemoglobin [Mass/volume] in Blood"),
    "ヘマトクリット": LabCoding(
        "4544-3", "Hematocrit [Volume Fraction] of Blood by Automated count"
    ),
    "血小板": LabCoding("777-3", "Platelets [#/volume] in Blood by Automated count"),
}


INTERPRETATION_MAP: dict[str, str] = {
    "high": "H",
    "low": "L",
    "normal": "N",
    "abnormal": "A",
    "critical_high": "HH",
    "critical_low": "LL",
}


_NUMBER_RE = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*(.*)$")


def lookup_vital(label: str) -> VitalCoding | None:
    return _VITAL_BY_LABEL.get(label)


def lookup_lab(label: str) -> LabCoding | None:
    return _LAB_BY_LABEL.get(label)


def parse_quantity(raw: str | None) -> tuple[float | None, str | None]:
    """'7.2%' → (7.2, '%'), '138 mg/dL' → (138.0, 'mg/dL'), '132 / 78' → (None, None)。"""
    if not raw:
        return None, None
    text = str(raw).strip()
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
