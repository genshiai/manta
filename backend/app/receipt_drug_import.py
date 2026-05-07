from __future__ import annotations

import csv
import unicodedata
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from zipfile import ZipFile

from sqlalchemy.orm import Session

from .models import ReceiptDrugMaster


@dataclass(frozen=True)
class ReceiptDrugImportRecord:
    receipt_drug_code: str
    change_type: str
    master_type: str
    name: str
    name_kana: str | None
    unit_code: str | None
    unit_name: str | None
    price_type: str | None
    price: Decimal | None
    generic_flag: str | None
    dosage_form_code: str | None
    changed_at: str | None
    discontinued_at: str | None
    yj_code: str | None
    public_order: str | None
    transitional_expiry: str | None
    base_name: str | None
    listed_at: str | None
    generic_prescription_code: str | None
    generic_prescription_text: str | None
    generic_prescription_addition_flag: str | None
    anti_hiv_flag: str | None
    long_term_listed_related_code: str | None
    selective_care_flag: str | None
    source_file: str


@dataclass(frozen=True)
class ReceiptDrugImportSummary:
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


def _normalize_decimal(value: str | None) -> Decimal | None:
    normalized = _blank_to_none(value)
    if normalized is None:
        return None
    try:
        return Decimal(normalized.replace(",", ""))
    except InvalidOperation:
        return None


def _rows_from_csv(csv_file: Path) -> list[list[str]]:
    with csv_file.open("r", encoding="cp932", newline="") as handle:
        return [row for row in csv.reader(handle) if row]


def _extract_csv_from_zip(zip_file: Path) -> tuple[str, list[list[str]]]:
    with ZipFile(zip_file) as archive:
        csv_names = [name for name in archive.namelist() if name.lower().endswith(".csv")]
        if len(csv_names) != 1:
            raise ValueError(f"receipt drug zip must contain exactly one csv file: {zip_file}")
        source_name = csv_names[0]
        text = archive.read(source_name).decode("cp932")
        return source_name, [row for row in csv.reader(text.splitlines()) if row]


def _read_receipt_rows(file_path: Path) -> tuple[str, list[list[str]]]:
    if file_path.suffix.lower() == ".zip":
        return _extract_csv_from_zip(file_path)
    return file_path.name, _rows_from_csv(file_path)


def _value(row: list[str], index: int) -> str | None:
    if index >= len(row):
        return None
    return _blank_to_none(row[index])


def _record_from_row(row: list[str], *, source_file: str) -> ReceiptDrugImportRecord:
    if len(row) < 42:
        raise ValueError(f"receipt drug row must have 42 columns, got {len(row)}")

    return ReceiptDrugImportRecord(
        change_type=_value(row, 0) or "",
        master_type=_value(row, 1) or "",
        receipt_drug_code=_value(row, 2) or "",
        name=_value(row, 4) or "",
        name_kana=_value(row, 6),
        unit_code=_value(row, 7),
        unit_name=_value(row, 9),
        price_type=_value(row, 10),
        price=_normalize_decimal(_value(row, 11)),
        generic_flag=_value(row, 16),
        dosage_form_code=_value(row, 27),
        changed_at=_value(row, 29),
        discontinued_at=_value(row, 30),
        yj_code=_value(row, 31),
        public_order=_value(row, 32),
        transitional_expiry=_value(row, 33),
        base_name=_value(row, 34),
        listed_at=_value(row, 35),
        generic_prescription_code=_value(row, 36),
        generic_prescription_text=_value(row, 37),
        generic_prescription_addition_flag=_value(row, 38),
        anti_hiv_flag=_value(row, 39),
        long_term_listed_related_code=_value(row, 40),
        selective_care_flag=_value(row, 41),
        source_file=source_file,
    )


def iter_receipt_drug_master_records(*, file_path: Path) -> list[ReceiptDrugImportRecord]:
    source_file, rows = _read_receipt_rows(file_path)
    records = [_record_from_row(row, source_file=source_file) for row in rows]
    return [record for record in records if record.master_type == "Y" and record.receipt_drug_code and record.name]


def _record_payload(record: ReceiptDrugImportRecord) -> dict[str, object]:
    return {
        "change_type": record.change_type,
        "master_type": record.master_type,
        "name": record.name,
        "name_kana": record.name_kana,
        "unit_code": record.unit_code,
        "unit_name": record.unit_name,
        "price_type": record.price_type,
        "price": record.price,
        "generic_flag": record.generic_flag,
        "dosage_form_code": record.dosage_form_code,
        "changed_at": record.changed_at,
        "discontinued_at": record.discontinued_at,
        "yj_code": record.yj_code,
        "public_order": record.public_order,
        "transitional_expiry": record.transitional_expiry,
        "base_name": record.base_name,
        "listed_at": record.listed_at,
        "generic_prescription_code": record.generic_prescription_code,
        "generic_prescription_text": record.generic_prescription_text,
        "generic_prescription_addition_flag": record.generic_prescription_addition_flag,
        "anti_hiv_flag": record.anti_hiv_flag,
        "long_term_listed_related_code": record.long_term_listed_related_code,
        "selective_care_flag": record.selective_care_flag,
        "source_file": record.source_file,
    }


def sync_receipt_drug_master_records(
    db: Session,
    records: list[ReceiptDrugImportRecord],
    *,
    dry_run: bool = False,
) -> ReceiptDrugImportSummary:
    created = updated = unchanged = 0
    for record in records:
        existing = db.get(ReceiptDrugMaster, record.receipt_drug_code)
        payload = _record_payload(record)
        if existing is None:
            created += 1
            if not dry_run:
                db.add(ReceiptDrugMaster(receipt_drug_code=record.receipt_drug_code, **payload))
            continue

        has_changed = any(getattr(existing, key) != value for key, value in payload.items())
        if not has_changed:
            unchanged += 1
            continue

        updated += 1
        if not dry_run:
            for key, value in payload.items():
                setattr(existing, key, value)

    return ReceiptDrugImportSummary(
        total=len(records),
        created=created,
        updated=updated,
        unchanged=unchanged,
        dry_run=dry_run,
    )
