from __future__ import annotations

import csv
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from zipfile import ZipFile

from sqlalchemy.orm import Session

from .modules.master_data.models import ReceiptMedicalPracticeMaster


@dataclass(frozen=True)
class ReceiptMedicalPracticeImportRecord:
    receipt_code: str
    change_type: str
    master_type: str
    name: str
    name_kana: str | None
    category: str | None
    points: int | None
    unit_name: str | None
    effective_from: str | None
    effective_to: str | None
    source_file: str


@dataclass(frozen=True)
class ReceiptMedicalPracticeImportSummary:
    total: int
    created: int
    updated: int
    unchanged: int
    dry_run: bool = False


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = unicodedata.normalize("NFKC", value).strip()
    return normalized or None


def _value(row: list[str], index: int) -> str | None:
    if index >= len(row):
        return None
    return _blank_to_none(row[index])


def _normalize_points(value: str | None) -> int | None:
    normalized = _blank_to_none(value)
    if normalized is None:
        return None
    try:
        return int(float(normalized.replace(",", "")))
    except ValueError:
        return None


def _rows_from_csv(csv_file: Path) -> list[list[str]]:
    with csv_file.open("r", encoding="cp932", newline="") as handle:
        return [row for row in csv.reader(handle) if row]


def _extract_csv_from_zip(zip_file: Path) -> tuple[str, list[list[str]]]:
    with ZipFile(zip_file) as archive:
        csv_names = [name for name in archive.namelist() if name.lower().endswith(".csv")]
        if len(csv_names) != 1:
            raise ValueError(f"receipt medical practice zip must contain exactly one csv file: {zip_file}")
        source_name = csv_names[0]
        text = archive.read(source_name).decode("cp932")
        return source_name, [row for row in csv.reader(text.splitlines()) if row]


def _read_receipt_rows(file_path: Path) -> tuple[str, list[list[str]]]:
    if file_path.suffix.lower() == ".zip":
        return _extract_csv_from_zip(file_path)
    return file_path.name, _rows_from_csv(file_path)


def _category_from_name(name: str) -> str | None:
    if "入院" in name:
        return "入院基本料"
    if "退院" in name or "退院支援" in name:
        return "退院支援"
    if "処方" in name or "投薬" in name:
        return "投薬"
    if "検査" in name:
        return "検査"
    if "処置" in name or "指導" in name:
        return "処置/指導"
    return None


def _record_from_row(row: list[str], *, source_file: str) -> ReceiptMedicalPracticeImportRecord:
    if len(row) < 12:
        raise ValueError(f"receipt medical practice row must have at least 12 columns, got {len(row)}")

    name = _value(row, 4) or ""
    return ReceiptMedicalPracticeImportRecord(
        change_type=_value(row, 0) or "",
        master_type=_value(row, 1) or "",
        receipt_code=_value(row, 2) or "",
        name=name,
        name_kana=_value(row, 6),
        unit_name=_value(row, 9),
        points=_normalize_points(_value(row, 11)),
        category=_category_from_name(name),
        effective_from=_value(row, 29),
        effective_to=_value(row, 30),
        source_file=source_file,
    )


def iter_receipt_medical_practice_master_records(
    *,
    file_path: Path,
) -> list[ReceiptMedicalPracticeImportRecord]:
    source_file, rows = _read_receipt_rows(file_path)
    records = [_record_from_row(row, source_file=source_file) for row in rows]
    return [record for record in records if record.master_type == "S" and record.receipt_code and record.name]


def _record_payload(record: ReceiptMedicalPracticeImportRecord) -> dict[str, object]:
    return {
        "name": record.name,
        "name_kana": record.name_kana,
        "category": record.category,
        "points": record.points,
        "unit_name": record.unit_name,
        "effective_from": record.effective_from,
        "effective_to": record.effective_to,
        "source_file": record.source_file,
    }


def sync_receipt_medical_practice_master_records(
    db: Session,
    records: list[ReceiptMedicalPracticeImportRecord],
    *,
    dry_run: bool = False,
) -> ReceiptMedicalPracticeImportSummary:
    created = updated = unchanged = 0
    for record in records:
        existing = db.get(ReceiptMedicalPracticeMaster, record.receipt_code)
        payload = _record_payload(record)
        if existing is None:
            created += 1
            if not dry_run:
                db.add(ReceiptMedicalPracticeMaster(receipt_code=record.receipt_code, **payload))
            continue

        has_changed = any(getattr(existing, key) != value for key, value in payload.items())
        if not has_changed:
            unchanged += 1
            continue

        updated += 1
        if not dry_run:
            for key, value in payload.items():
                setattr(existing, key, value)

    return ReceiptMedicalPracticeImportSummary(
        total=len(records),
        created=created,
        updated=updated,
        unchanged=unchanged,
        dry_run=dry_run,
    )
