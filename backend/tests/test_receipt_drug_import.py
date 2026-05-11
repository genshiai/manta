from __future__ import annotations

import csv
from decimal import Decimal
from zipfile import ZipFile

from app.db import SessionLocal
from app.modules.master_data.models import ReceiptDrugMaster
from app.receipt_drug_import import iter_receipt_drug_master_records, sync_receipt_drug_master_records


def receipt_row(**overrides: str) -> list[str]:
    row = ["0"] * 42
    row[0] = "0"
    row[1] = "Y"
    row[2] = "620098801"
    row[3] = "10"
    row[4] = "ロキソニン錠６０ｍｇ"
    row[5] = "13"
    row[6] = "ﾛｷｿﾆﾝｼﾞｮｳ60MG"
    row[7] = "16"
    row[8] = "1"
    row[9] = "錠"
    row[10] = "1"
    row[11] = "10.80"
    row[16] = "0"
    row[27] = "1"
    row[29] = "20260401"
    row[30] = "99999999"
    row[31] = "1149019F1560"
    row[32] = "006789000"
    row[33] = "0"
    row[34] = "ロキソニン錠６０ｍｇ"
    row[35] = "0"
    row[36] = "1149019F1ZZZ"
    row[37] = "【般】ロキソプロフェンＮａ錠６０ｍｇ"
    row[38] = "2"
    row[39] = "0"
    row[40] = "0"
    row[41] = "1"
    for index, value in overrides.items():
        row[int(index)] = value
    return row


def write_receipt_zip(path, rows: list[list[str]]) -> None:
    csv_text = "\r\n".join(",".join(row) for row in rows)
    with ZipFile(path, "w") as archive:
        archive.writestr("y_ALL_TEST.csv", csv_text.encode("cp932"))


def write_receipt_csv(path, rows: list[list[str]]) -> None:
    with path.open("w", encoding="cp932", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerows(rows)


def cleanup_receipt_drug(receipt_drug_code: str) -> None:
    with SessionLocal() as db:
        item = db.get(ReceiptDrugMaster, receipt_drug_code)
        if item is not None:
            db.delete(item)
            db.commit()


def test_iter_receipt_drug_master_records_from_zip(tmp_path) -> None:
    zip_file = tmp_path / "y_ALL_TEST.zip"
    write_receipt_zip(zip_file, [receipt_row(), receipt_row(**{"1": "S"})])

    records = iter_receipt_drug_master_records(file_path=zip_file)

    assert len(records) == 1
    assert records[0].receipt_drug_code == "620098801"
    assert records[0].name == "ロキソニン錠60mg"
    assert records[0].name_kana == "ロキソニンジョウ60MG"
    assert records[0].unit_name == "錠"
    assert records[0].price == Decimal("10.80")
    assert records[0].yj_code == "1149019F1560"
    assert records[0].generic_prescription_code == "1149019F1ZZZ"
    assert records[0].generic_prescription_text == "【般】ロキソプロフェンNa錠60mg"


def test_sync_receipt_drug_master_records(tmp_path) -> None:
    receipt_drug_code = "629999991"
    csv_file = tmp_path / "y_ALL_TEST.csv"
    write_receipt_csv(csv_file, [receipt_row(**{"2": receipt_drug_code, "4": "レセ電取込テスト薬"})])

    try:
        records = iter_receipt_drug_master_records(file_path=csv_file)
        with SessionLocal() as db:
            summary = sync_receipt_drug_master_records(db, records)
            db.commit()
            item = db.get(ReceiptDrugMaster, receipt_drug_code)

        assert summary.created == 1
        assert item is not None
        assert item.name == "レセ電取込テスト薬"
        assert item.yj_code == "1149019F1560"
    finally:
        cleanup_receipt_drug(receipt_drug_code)
