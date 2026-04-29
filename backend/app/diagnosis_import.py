from __future__ import annotations

import csv
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from sqlalchemy.orm import Session

from .models import DiagnosisMaster


def normalize_header(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).strip().replace(" ", "")
    return normalized.translate(str.maketrans({"‐": "-", "‑": "-", "−": "-", "–": "-", "—": "-", "―": "-"}))


HEADER_ALIASES = {
    "変更区分": "change_type",
    "病名管理番号": "management_number",
    "病名表記": "disease_name",
    "病名表記カナ": "disease_name_kana",
    "採択区分": "adoption_level",
    "病名交換用コード": "exchange_code",
    "ICD10-2013": "icd10_code",
    "ICD10-2013複数分類コード": "icd10_subcode",
    "レセ電算コード": "claim_code",
    "更新日付": "updated_at_master",
}

REQUIRED_FIELDS = {
    "change_type",
    "management_number",
    "disease_name",
    "disease_name_kana",
    "adoption_level",
}


@dataclass
class DiagnosisImportRecord:
    change_type: str
    management_number: str
    disease_name: str
    disease_name_kana: str
    adoption_level: str
    exchange_code: str | None
    icd10_code: str | None
    icd10_subcode: str | None
    claim_code: str | None
    updated_at_master: str | None


def _read_csv_rows(file_path: Path) -> list[list[str]]:
    with file_path.open("r", encoding="cp932", newline="") as handle:
        reader = csv.reader(handle)
        return [row for row in reader if row]


def _resolve_headers(title_row: list[str]) -> dict[int, str]:
    resolved: dict[int, str] = {}
    for index, raw_header in enumerate(title_row):
        normalized = normalize_header(raw_header)
        if normalized in HEADER_ALIASES:
            resolved[index] = HEADER_ALIASES[normalized]

    missing = REQUIRED_FIELDS - set(resolved.values())
    if missing:
        missing_names = ", ".join(sorted(missing))
        raise ValueError(f"title file is missing required fields: {missing_names}")

    return resolved


def iter_diagnosis_main_records(*, title_file: Path, main_file: Path) -> Iterable[DiagnosisImportRecord]:
    title_rows = _read_csv_rows(title_file)
    if not title_rows:
        raise ValueError("title file is empty")

    headers = _resolve_headers(title_rows[0])
    for row in _read_csv_rows(main_file):
        values = {
            field_name: (row[index].strip() if index < len(row) else "")
            for index, field_name in headers.items()
        }
        yield DiagnosisImportRecord(
            change_type=values["change_type"],
            management_number=values["management_number"],
            disease_name=values["disease_name"],
            disease_name_kana=values["disease_name_kana"],
            adoption_level=values["adoption_level"],
            exchange_code=values.get("exchange_code") or None,
            icd10_code=values.get("icd10_code") or None,
            icd10_subcode=values.get("icd10_subcode") or None,
            claim_code=values.get("claim_code") or None,
            updated_at_master=values.get("updated_at_master") or None,
        )


def upsert_diagnosis_main_records(db: Session, records: Iterable[DiagnosisImportRecord]) -> tuple[int, int]:
    created = 0
    updated = 0

    for record in records:
        existing = db.get(DiagnosisMaster, record.management_number)
        payload = {
            "change_type": record.change_type,
            "disease_name": record.disease_name,
            "disease_name_kana": record.disease_name_kana,
            "adoption_level": record.adoption_level,
            "exchange_code": record.exchange_code,
            "icd10_code": record.icd10_code,
            "icd10_subcode": record.icd10_subcode,
            "claim_code": record.claim_code,
            # nmain*.txt is the current main table, so imported rows are treated as active.
            "is_deleted": False,
            "updated_at_master": record.updated_at_master,
        }

        if existing is None:
            db.add(DiagnosisMaster(management_number=record.management_number, **payload))
            created += 1
            continue

        has_changed = any(getattr(existing, key) != value for key, value in payload.items())
        if not has_changed:
            continue

        for key, value in payload.items():
            setattr(existing, key, value)
        updated += 1

    return created, updated
