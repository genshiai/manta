from __future__ import annotations

from zipfile import ZipFile

from app.db import SessionLocal
from app.models import ReceiptLongTermListedDrug, ReceiptTransitionalDrug
from app.receipt_adjustment_import import (
    iter_receipt_long_term_listed_drug_records,
    iter_receipt_transitional_drug_records,
    sync_receipt_long_term_listed_drug_records,
    sync_receipt_transitional_drug_records,
)


def write_minimal_xlsx(path, rows: list[list[str]]) -> None:
    def cell_ref(row_number: int, column_index: int) -> str:
        letters = ""
        value = column_index + 1
        while value:
            value, remainder = divmod(value - 1, 26)
            letters = chr(65 + remainder) + letters
        return f"{letters}{row_number}"

    sheet_rows = []
    for row_number, row in enumerate(rows, start=1):
        cells = []
        for column_index, value in enumerate(row):
            ref = cell_ref(row_number, column_index)
            cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{value}</t></is></c>')
        sheet_rows.append(f'<row r="{row_number}">{"".join(cells)}</row>')
    sheet = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(sheet_rows)}</sheetData>'
        "</worksheet>"
    )
    with ZipFile(path, "w") as zip_file:
        zip_file.writestr("[Content_Types].xml", "<Types/>")
        zip_file.writestr("xl/worksheets/sheet1.xml", sheet)


def cleanup_adjustment_rows(receipt_drug_code: str, yj_code: str) -> None:
    with SessionLocal() as db:
        transitional = db.get(ReceiptTransitionalDrug, receipt_drug_code)
        if transitional is not None:
            db.delete(transitional)
        long_term = db.get(ReceiptLongTermListedDrug, yj_code)
        if long_term is not None:
            db.delete(long_term)
        db.commit()


def test_import_receipt_transitional_drug_records(tmp_path) -> None:
    receipt_drug_code = "629999990"
    yj_code = "1129007F1026"
    xlsx_file = tmp_path / "keikasoti.xlsx"
    write_minimal_xlsx(
        xlsx_file,
        [
            ["title"],
            ["date"],
            ["剤形", "薬価基準収載医薬品コード", "医薬品コード", "基本漢字名称", "単位", "金額", "商品名関連", "商品名医薬品", "経過措置年月日", "備考"],
            ["内", yj_code, receipt_drug_code, "経過措置テスト薬", "錠", "10.90", "0", "", "20270331", "告示メモ"],
        ],
    )

    try:
        records = iter_receipt_transitional_drug_records(xlsx_file=xlsx_file)
        assert len(records) == 1
        assert records[0].receipt_drug_code == receipt_drug_code
        assert records[0].transitional_expiry == "20270331"

        with SessionLocal() as db:
            summary = sync_receipt_transitional_drug_records(db, records)
            db.commit()
            row = db.get(ReceiptTransitionalDrug, receipt_drug_code)

        assert summary.created == 1
        assert row is not None
        assert row.name == "経過措置テスト薬"
    finally:
        cleanup_adjustment_rows(receipt_drug_code, yj_code)


def test_import_receipt_long_term_listed_drug_records(tmp_path) -> None:
    receipt_drug_code = "629999991"
    selected_code = "679999991"
    yj_code = "1124001F2029"
    xlsx_file = tmp_path / "sentei.xlsx"
    write_minimal_xlsx(
        xlsx_file,
        [
            ["title"],
            ["date"],
            ["No", "剤形", "薬価基準収載医薬品コード", "選定療養区分1", "", "選定療養区分2", ""],
            ["", "剤形", "", "医薬品コード", "基本漢字名称", "医薬品コード", "基本漢字名称"],
            ["1", "内", yj_code, receipt_drug_code, "長期収載テスト薬", selected_code, "長期収載テスト薬（選）"],
        ],
    )

    try:
        records = iter_receipt_long_term_listed_drug_records(xlsx_file=xlsx_file)
        assert len(records) == 1
        assert records[0].yj_code == yj_code
        assert records[0].patient_request_receipt_code == selected_code

        with SessionLocal() as db:
            summary = sync_receipt_long_term_listed_drug_records(db, records)
            db.commit()
            row = db.get(ReceiptLongTermListedDrug, yj_code)

        assert summary.created == 1
        assert row is not None
        assert row.patient_request_name == "長期収載テスト薬(選)"
    finally:
        cleanup_adjustment_rows(receipt_drug_code, yj_code)
