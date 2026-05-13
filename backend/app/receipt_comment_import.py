from __future__ import annotations

import csv
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from zipfile import ZipFile

from sqlalchemy.orm import Session

from .modules.master_data.models import ReceiptCommentMaster


@dataclass(frozen=True)
class ReceiptCommentImportRecord:
    comment_code: str
    change_type: str
    master_type: str
    comment_class: str | None
    pattern: str | None
    sequence_number: str | None
    check_digit: str | None
    text: str | None
    text_kana: str | None
    effective_from: str | None
    effective_to: str | None
    raw_columns: list[str]
    source_file: str


@dataclass(frozen=True)
class ReceiptCommentImportSummary:
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


def _rows_from_csv(csv_file: Path) -> list[list[str]]:
    with csv_file.open("r", encoding="cp932", newline="") as handle:
        return [row for row in csv.reader(handle) if row]


def _extract_csv_from_zip(zip_file: Path) -> tuple[str, list[list[str]]]:
    with ZipFile(zip_file) as archive:
        csv_names = [name for name in archive.namelist() if name.lower().endswith(".csv")]
        if len(csv_names) != 1:
            raise ValueError(f"receipt comment zip must contain exactly one csv file: {zip_file}")
        source_name = csv_names[0]
        text = archive.read(source_name).decode("cp932")
        return source_name, [row for row in csv.reader(text.splitlines()) if row]


def _read_receipt_rows(file_path: Path) -> tuple[str, list[list[str]]]:
    if file_path.suffix.lower() == ".zip":
        return _extract_csv_from_zip(file_path)
    return file_path.name, _rows_from_csv(file_path)


def _fallback_comment_code(row: list[str]) -> str:
    comment_class = _value(row, 2) or ""
    pattern = _value(row, 3) or ""
    sequence_number = (_value(row, 4) or "").zfill(6)
    return f"{comment_class}{pattern}{sequence_number}" if comment_class and pattern and sequence_number else ""


def _record_from_row(row: list[str], *, source_file: str) -> ReceiptCommentImportRecord:
    if len(row) < 23:
        raise ValueError(f"receipt comment row must have at least 23 columns, got {len(row)}")

    return ReceiptCommentImportRecord(
        change_type=_value(row, 0) or "",
        master_type=_value(row, 1) or "",
        comment_class=_value(row, 2),
        pattern=_value(row, 3),
        sequence_number=_value(row, 4),
        check_digit=_value(row, 5),
        text=_value(row, 6),
        text_kana=_value(row, 8),
        effective_from=_value(row, 20),
        effective_to=_value(row, 21),
        comment_code=_value(row, 22) or _fallback_comment_code(row),
        raw_columns=[unicodedata.normalize("NFKC", value).strip() for value in row],
        source_file=source_file,
    )


def iter_receipt_comment_master_records(*, file_path: Path) -> list[ReceiptCommentImportRecord]:
    source_file, rows = _read_receipt_rows(file_path)
    records = [_record_from_row(row, source_file=source_file) for row in rows]
    return [record for record in records if record.master_type == "C" and record.comment_code]


def _record_payload(record: ReceiptCommentImportRecord) -> dict[str, object]:
    return {
        "change_type": record.change_type,
        "master_type": record.master_type,
        "comment_class": record.comment_class,
        "pattern": record.pattern,
        "sequence_number": record.sequence_number,
        "check_digit": record.check_digit,
        "text": record.text,
        "text_kana": record.text_kana,
        "effective_from": record.effective_from,
        "effective_to": record.effective_to,
        "raw_columns": record.raw_columns,
        "source_file": record.source_file,
    }


def sync_receipt_comment_master_records(
    db: Session,
    records: list[ReceiptCommentImportRecord],
    *,
    dry_run: bool = False,
) -> ReceiptCommentImportSummary:
    created = updated = unchanged = 0
    for record in records:
        existing = db.get(ReceiptCommentMaster, record.comment_code)
        payload = _record_payload(record)
        if existing is None:
            created += 1
            if not dry_run:
                db.add(ReceiptCommentMaster(comment_code=record.comment_code, **payload))
            continue

        has_changed = any(getattr(existing, key) != value for key, value in payload.items())
        if not has_changed:
            unchanged += 1
            continue

        updated += 1
        if not dry_run:
            for key, value in payload.items():
                setattr(existing, key, value)

    return ReceiptCommentImportSummary(
        total=len(records),
        created=created,
        updated=updated,
        unchanged=unchanged,
        dry_run=dry_run,
    )
