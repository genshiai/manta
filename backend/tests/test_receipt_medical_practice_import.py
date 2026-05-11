from __future__ import annotations

import csv
from zipfile import ZipFile

from app.db import SessionLocal
from app.modules.master_data.models import ReceiptMedicalPracticeMaster
from app.receipt_medical_practice_import import (
    iter_receipt_medical_practice_master_records,
    sync_receipt_medical_practice_master_records,
)


def receipt_practice_row(**overrides: str) -> list[str]:
    row = ["0"] * 42
    row[0] = "0"
    row[1] = "S"
    row[2] = "A000001"
    row[4] = "入院基本料（テスト）"
    row[6] = "ﾆｭｳｲﾝｷﾎﾝﾘｮｳ"
    row[9] = "日"
    row[11] = "1000"
    row[29] = "20260401"
    row[30] = "99999999"
    for index, value in overrides.items():
        row[int(index)] = value
    return row


def write_receipt_practice_zip(path, rows: list[list[str]]) -> None:
    csv_text = "\r\n".join(",".join(row) for row in rows)
    with ZipFile(path, "w") as archive:
        archive.writestr("s_ALL_TEST.csv", csv_text.encode("cp932"))


def write_receipt_practice_csv(path, rows: list[list[str]]) -> None:
    with path.open("w", encoding="cp932", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerows(rows)


def cleanup_receipt_practice(receipt_code: str) -> None:
    with SessionLocal() as db:
        item = db.get(ReceiptMedicalPracticeMaster, receipt_code)
        if item is not None:
            db.delete(item)
            db.commit()


def test_iter_receipt_medical_practice_master_records_from_zip(tmp_path) -> None:
    zip_file = tmp_path / "s_ALL_TEST.zip"
    write_receipt_practice_zip(zip_file, [receipt_practice_row(), receipt_practice_row(**{"1": "Y"})])

    records = iter_receipt_medical_practice_master_records(file_path=zip_file)

    assert len(records) == 1
    assert records[0].receipt_code == "A000001"
    assert records[0].name == "入院基本料(テスト)"
    assert records[0].name_kana == "ニュウインキホンリョウ"
    assert records[0].unit_name == "日"
    assert records[0].points == 1000
    assert records[0].category == "入院基本料"


def test_sync_receipt_medical_practice_master_records(tmp_path) -> None:
    receipt_code = "A999991"
    csv_file = tmp_path / "s_ALL_TEST.csv"
    write_receipt_practice_csv(
        csv_file,
        [receipt_practice_row(**{"2": receipt_code, "4": "退院支援テスト", "11": "400"})],
    )

    try:
        records = iter_receipt_medical_practice_master_records(file_path=csv_file)
        with SessionLocal() as db:
            summary = sync_receipt_medical_practice_master_records(db, records)
            db.commit()
            item = db.get(ReceiptMedicalPracticeMaster, receipt_code)

        assert summary.created == 1
        assert item is not None
        assert item.name == "退院支援テスト"
        assert item.category == "退院支援"
        assert item.points == 400
    finally:
        cleanup_receipt_practice(receipt_code)
