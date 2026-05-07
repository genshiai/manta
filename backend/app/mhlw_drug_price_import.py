from __future__ import annotations

import re
import unicodedata
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation
from pathlib import Path
from zipfile import ZipFile

from .drug_import import DrugImportRecord, build_pmda_drug_info_url, normalize_header

XLSX_NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

MHLW_HEADER_ALIASES = {
    "区分": "source_category",
    "薬価基準収載医薬品コード": "yj_code",
    "成分名セイブンメイ": "generic_name",
    "成分名": "generic_name",
    "規格タダシカク": "strength",
    "規格": "strength",
    "品名": "drug_name",
    "メーカー名": "manufacturer",
    "診療報酬において加算等の算定対象となる後発医薬品": "generic_reimbursement_flag",
    "先発医薬品センパツイヤクヒン": "brand_flag",
    "先発医薬品": "brand_flag",
    "同一剤形・規格の後発医薬品がある先発医薬品イヤクイヤク": "has_generic_flag",
    "同一剤形・規格の後発医薬品がある先発医薬品": "has_generic_flag",
    "薬価": "drug_price",
    "経過措置による使用期限": "transitional_expiry",
    "備考": "note",
}

CATEGORY_MAP = {
    "内用薬": "内服",
    "外用薬": "外用",
}


def _column_index(cell_reference: str) -> int:
    match = re.match(r"([A-Z]+)", cell_reference)
    if match is None:
        return 0

    value = 0
    for char in match.group(1):
        value = value * 26 + ord(char) - 64
    return value - 1


def _shared_strings(zip_file: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zip_file.namelist():
        return []

    root = ET.fromstring(zip_file.read("xl/sharedStrings.xml"))
    strings: list[str] = []
    for item in root.findall("a:si", XLSX_NS):
        text_parts = [node.text or "" for node in item.findall(".//a:t", XLSX_NS)]
        strings.append("".join(text_parts))
    return strings


def _cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")

    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//a:t", XLSX_NS)).strip()

    value = cell.find("a:v", XLSX_NS)
    if value is None or value.text is None:
        return ""

    if cell_type == "s":
        return shared_strings[int(value.text)].strip()
    return value.text.strip()


def _read_first_sheet_rows(xlsx_file: Path) -> list[list[str]]:
    with ZipFile(xlsx_file) as zip_file:
        shared_strings = _shared_strings(zip_file)
        sheet_name = "xl/worksheets/sheet1.xml"
        if sheet_name not in zip_file.namelist():
            raise ValueError(f"{xlsx_file} does not contain {sheet_name}")

        root = ET.fromstring(zip_file.read(sheet_name))
        rows: list[list[str]] = []
        for row in root.findall(".//a:sheetData/a:row", XLSX_NS):
            values: list[str] = []
            for cell in row.findall("a:c", XLSX_NS):
                index = _column_index(cell.attrib.get("r", "A1"))
                while len(values) <= index:
                    values.append("")
                values[index] = _cell_value(cell, shared_strings)
            if any(value.strip() for value in values):
                rows.append(values)
        return rows


def _resolve_mhlw_headers(header_row: list[str]) -> dict[int, str]:
    resolved: dict[int, str] = {}
    for index, raw_header in enumerate(header_row):
        normalized = normalize_header(raw_header)
        if normalized in MHLW_HEADER_ALIASES:
            resolved[index] = MHLW_HEADER_ALIASES[normalized]

    missing = {"source_category", "yj_code", "generic_name", "strength", "drug_name"} - set(resolved.values())
    if missing:
        raise ValueError(f"MHLW drug price xlsx is missing required fields: {', '.join(sorted(missing))}")
    return resolved


def _normalize_yj_code(value: str | None) -> str | None:
    if not value:
        return None
    normalized = unicodedata.normalize("NFKC", value).strip().upper()
    return normalized or None


def _normalize_drug_price(value: str | None) -> Decimal | None:
    if not value:
        return None
    normalized = unicodedata.normalize("NFKC", value).strip().replace(",", "")
    if not normalized:
        return None
    try:
        return Decimal(normalized)
    except InvalidOperation:
        return None


def _normalize_has_generic(value: str | None) -> bool | None:
    if not value:
        return None
    normalized = unicodedata.normalize("NFKC", value).strip()
    if normalized in {"○", "◯", "あり", "有"}:
        return True
    if normalized in {"-", "なし", "無"}:
        return False
    return None


def iter_mhlw_drug_price_records(*, xlsx_file: Path) -> list[DrugImportRecord]:
    rows = _read_first_sheet_rows(xlsx_file)
    if not rows:
        raise ValueError("MHLW drug price xlsx is empty")

    headers = _resolve_mhlw_headers(rows[0])
    records: list[DrugImportRecord] = []

    for fallback_sort_order, row in enumerate(rows[1:], start=1):
        values = {
            field_name: (row[index].strip() if index < len(row) else "")
            for index, field_name in headers.items()
        }
        drug_name = values.get("drug_name", "").strip()
        yj_code = _normalize_yj_code(values.get("yj_code"))
        category = CATEGORY_MAP.get(values.get("source_category", ""))
        if not drug_name or not yj_code or category is None:
            continue

        generic_name = values.get("generic_name") or None
        aliases = [generic_name] if generic_name and generic_name != drug_name else []
        records.append(
            DrugImportRecord(
                id=f"yj-{yj_code.lower()}",
                sort_order=fallback_sort_order * 10,
                is_active=True,
                drug_name=drug_name,
                category=category,
                dosage_options=[],
                generic_name=generic_name,
                name_kana=None,
                aliases=aliases,
                yj_code=yj_code,
                hot_code=None,
                dosage_form=None,
                strength=values.get("strength") or None,
                standard_usage_code=None,
                default_days=None,
                pmda_info_url=build_pmda_drug_info_url(yj_code, audience="medical"),
                allergy_conflict_label=None,
                related_problem=None,
                manufacturer=values.get("manufacturer") or None,
                drug_price=_normalize_drug_price(values.get("drug_price")),
                generic_reimbursement_flag=values.get("generic_reimbursement_flag") or None,
                brand_flag=values.get("brand_flag") or None,
                has_generic=_normalize_has_generic(values.get("has_generic_flag")),
                transitional_expiry=values.get("transitional_expiry") or None,
                source_note=values.get("note") or None,
            )
        )

    return records
