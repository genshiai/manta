from __future__ import annotations

from decimal import Decimal
from zipfile import ZipFile

from app.db import SessionLocal
from app.drug_import import sync_drug_master_records
from app.mhlw_drug_price_import import iter_mhlw_drug_price_records
from app.models import PrescriptionCatalogMaster


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


def test_iter_mhlw_drug_price_records_maps_internal_drugs(tmp_path) -> None:
    xlsx_file = tmp_path / "mhlw_internal.xlsx"
    write_minimal_xlsx(
        xlsx_file,
        [
            [
                "区分",
                "薬価基準収載医薬品コード",
                "成分名セイブンメイ",
                "規格タダシカク",
                "",
                "",
                "",
                "品名",
                "メーカー名",
                "診療報酬において加算等の算定対象となる後発医薬品",
                "先発医薬品センパツイヤクヒン",
                "同一剤形・規格の後発医薬品がある先発医薬品イヤクイヤク",
                "薬価",
                "経過措置による使用期限",
                "備考",
            ],
            [
                "内用薬",
                "1149019F1560",
                "ロキソプロフェンナトリウム水和物",
                "60mg1錠",
                "",
                "",
                "",
                "ロキソニン錠60mg",
                "第一三共",
                "",
                "先発品",
                "",
                "10.8",
                "",
                "",
            ],
            [
                "注射薬",
                "9999999A9999",
                "注射テスト",
                "1管",
                "",
                "",
                "",
                "注射テスト",
                "テスト",
                "",
                "",
                "",
                "1",
                "",
                "",
            ],
        ],
    )

    records = iter_mhlw_drug_price_records(xlsx_file=xlsx_file)

    assert len(records) == 2
    assert records[0].id == "yj-1149019f1560"
    assert records[0].drug_name == "ロキソニン錠60mg"
    assert records[0].category == "内服"
    assert records[0].generic_name == "ロキソプロフェンナトリウム水和物"
    assert records[0].aliases == ["ロキソプロフェンナトリウム水和物"]
    assert records[0].manufacturer == "第一三共"
    assert records[0].drug_price == Decimal("10.8")
    assert records[0].brand_flag == "先発品"
    assert records[0].pmda_info_url == "https://www.pmda.go.jp/PmdaSearch/rdSearch/02/1149019F1560?user=1"
    assert records[1].id == "yj-9999999a9999"
    assert records[1].category == "注射"


def test_sync_mhlw_drug_price_records(tmp_path) -> None:
    master_id = "yj-7777777a7777"
    xlsx_file = tmp_path / "mhlw_internal.xlsx"
    write_minimal_xlsx(
        xlsx_file,
        [
            ["区分", "薬価基準収載医薬品コード", "成分名", "規格", "品名"],
            ["内用薬", "7777777A7777", "取込テスト成分", "10mg1錠", "取込テスト薬10mg"],
        ],
    )

    try:
        with SessionLocal() as db:
            summary = sync_drug_master_records(db, iter_mhlw_drug_price_records(xlsx_file=xlsx_file))
            db.commit()
            item = db.get(PrescriptionCatalogMaster, master_id)

        assert summary.created == 1
        assert item is not None
        assert item.drug_name == "取込テスト薬10mg"
        assert item.yj_code == "7777777A7777"
        assert item.generic_name == "取込テスト成分"
    finally:
        with SessionLocal() as db:
            item = db.get(PrescriptionCatalogMaster, master_id)
            if item is not None:
                db.delete(item)
                db.commit()
