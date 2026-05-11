from __future__ import annotations

import re
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from zipfile import ZipFile

from sqlalchemy.orm import Session

from .modules.master_data.models import ReceiptLongTermListedDrug, ReceiptTransitionalDrug

XLSX_NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


@dataclass(frozen=True)
class ReceiptTransitionalDrugRecord:
    receipt_drug_code: str
    dosage_form: str | None
    yj_code: str
    name: str
    unit_name: str | None
    price: Decimal | None
    brand_related_flag: str | None
    non_listed_brand_name: str | None
    transitional_expiry: str
    note: str | None
    source_file: str


@dataclass(frozen=True)
class ReceiptLongTermListedDrugRecord:
    yj_code: str
    row_number: int | None
    dosage_form: str | None
    medical_necessity_receipt_code: str | None
    medical_necessity_name: str | None
    patient_request_receipt_code: str | None
    patient_request_name: str | None
    source_file: str


@dataclass(frozen=True)
class ReceiptAdjustmentImportSummary:
    total: int
    created: int
    updated: int
    unchanged: int
    dry_run: bool = False


def _column_index(cell_reference: str) -> int:
    match = re.match(r"([A-Z]+)", cell_reference)
    if match is None:
        return 0
    value = 0
    for char in match.group(1):
        value = value * 26 + ord(char) - 64
    return value - 1


def _read_xlsx_rows(xlsx_file: Path) -> list[list[str]]:
    with ZipFile(xlsx_file) as zip_file:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in zip_file.namelist():
            root = ET.fromstring(zip_file.read("xl/sharedStrings.xml"))
            for item in root.findall("a:si", XLSX_NS):
                shared_strings.append("".join(node.text or "" for node in item.findall(".//a:t", XLSX_NS)))

        root = ET.fromstring(zip_file.read("xl/worksheets/sheet1.xml"))
        rows: list[list[str]] = []
        for row in root.findall(".//a:sheetData/a:row", XLSX_NS):
            values: list[str] = []
            for cell in row.findall("a:c", XLSX_NS):
                index = _column_index(cell.attrib.get("r", "A1"))
                while len(values) <= index:
                    values.append("")
                value = ""
                if cell.attrib.get("t") == "inlineStr":
                    value = "".join(node.text or "" for node in cell.findall(".//a:t", XLSX_NS))
                else:
                    raw_value = cell.find("a:v", XLSX_NS)
                    if raw_value is not None and raw_value.text is not None:
                        value = shared_strings[int(raw_value.text)] if cell.attrib.get("t") == "s" else raw_value.text
                values[index] = value.strip()
            if any(value.strip() for value in values):
                rows.append(values)
        return rows


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


def _normalize_int(value: str | None) -> int | None:
    normalized = _blank_to_none(value)
    if normalized is None:
        return None
    try:
        return int(Decimal(normalized))
    except InvalidOperation:
        return None


def _row_value(row: list[str], index: int) -> str | None:
    return _blank_to_none(row[index] if index < len(row) else None)


def iter_receipt_transitional_drug_records(*, xlsx_file: Path) -> list[ReceiptTransitionalDrugRecord]:
    rows = _read_xlsx_rows(xlsx_file)
    records: list[ReceiptTransitionalDrugRecord] = []
    for row in rows[3:]:
        dosage_form = _row_value(row, 0)
        yj_code = _row_value(row, 1)
        receipt_drug_code = _row_value(row, 2)
        name = _row_value(row, 3)
        transitional_expiry = _row_value(row, 8)
        if not yj_code or not receipt_drug_code or not name or not transitional_expiry:
            continue
        records.append(
            ReceiptTransitionalDrugRecord(
                receipt_drug_code=receipt_drug_code,
                dosage_form=dosage_form,
                yj_code=yj_code,
                name=name,
                unit_name=_row_value(row, 4),
                price=_normalize_decimal(_row_value(row, 5)),
                brand_related_flag=_row_value(row, 6),
                non_listed_brand_name=_row_value(row, 7),
                transitional_expiry=transitional_expiry,
                note=_row_value(row, 9),
                source_file=xlsx_file.name,
            )
        )
    return records


def iter_receipt_long_term_listed_drug_records(*, xlsx_file: Path) -> list[ReceiptLongTermListedDrugRecord]:
    rows = _read_xlsx_rows(xlsx_file)
    records: list[ReceiptLongTermListedDrugRecord] = []
    for row in rows[4:]:
        yj_code = _row_value(row, 2)
        if not yj_code:
            continue
        records.append(
            ReceiptLongTermListedDrugRecord(
                row_number=_normalize_int(_row_value(row, 0)),
                dosage_form=_row_value(row, 1),
                yj_code=yj_code,
                medical_necessity_receipt_code=_row_value(row, 3),
                medical_necessity_name=_row_value(row, 4),
                patient_request_receipt_code=_row_value(row, 5),
                patient_request_name=_row_value(row, 6),
                source_file=xlsx_file.name,
            )
        )
    return records


def _transitional_payload(record: ReceiptTransitionalDrugRecord) -> dict[str, object]:
    return {
        "dosage_form": record.dosage_form,
        "yj_code": record.yj_code,
        "name": record.name,
        "unit_name": record.unit_name,
        "price": record.price,
        "brand_related_flag": record.brand_related_flag,
        "non_listed_brand_name": record.non_listed_brand_name,
        "transitional_expiry": record.transitional_expiry,
        "note": record.note,
        "source_file": record.source_file,
    }


def _long_term_payload(record: ReceiptLongTermListedDrugRecord) -> dict[str, object]:
    return {
        "row_number": record.row_number,
        "dosage_form": record.dosage_form,
        "medical_necessity_receipt_code": record.medical_necessity_receipt_code,
        "medical_necessity_name": record.medical_necessity_name,
        "patient_request_receipt_code": record.patient_request_receipt_code,
        "patient_request_name": record.patient_request_name,
        "source_file": record.source_file,
    }


def sync_receipt_transitional_drug_records(
    db: Session,
    records: list[ReceiptTransitionalDrugRecord],
    *,
    dry_run: bool = False,
) -> ReceiptAdjustmentImportSummary:
    created = updated = unchanged = 0
    for record in records:
        existing = db.get(ReceiptTransitionalDrug, record.receipt_drug_code)
        payload = _transitional_payload(record)
        if existing is None:
            created += 1
            if not dry_run:
                db.add(ReceiptTransitionalDrug(receipt_drug_code=record.receipt_drug_code, **payload))
            continue
        has_changed = any(getattr(existing, key) != value for key, value in payload.items())
        if not has_changed:
            unchanged += 1
            continue
        updated += 1
        if not dry_run:
            for key, value in payload.items():
                setattr(existing, key, value)
    return ReceiptAdjustmentImportSummary(len(records), created, updated, unchanged, dry_run)


def sync_receipt_long_term_listed_drug_records(
    db: Session,
    records: list[ReceiptLongTermListedDrugRecord],
    *,
    dry_run: bool = False,
) -> ReceiptAdjustmentImportSummary:
    created = updated = unchanged = 0
    for record in records:
        existing = db.get(ReceiptLongTermListedDrug, record.yj_code)
        payload = _long_term_payload(record)
        if existing is None:
            created += 1
            if not dry_run:
                db.add(ReceiptLongTermListedDrug(yj_code=record.yj_code, **payload))
            continue
        has_changed = any(getattr(existing, key) != value for key, value in payload.items())
        if not has_changed:
            unchanged += 1
            continue
        updated += 1
        if not dry_run:
            for key, value in payload.items():
                setattr(existing, key, value)
    return ReceiptAdjustmentImportSummary(len(records), created, updated, unchanged, dry_run)
