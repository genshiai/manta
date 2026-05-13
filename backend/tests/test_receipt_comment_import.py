from __future__ import annotations

import csv
from zipfile import ZipFile

from app.db import SessionLocal
from app.modules.master_data.models import ReceiptCommentMaster
from app.receipt_comment_import import iter_receipt_comment_master_records, sync_receipt_comment_master_records


def receipt_comment_row(**overrides: str) -> list[str]:
    row = ["0"] * 30
    row[0] = "0"
    row[1] = "C"
    row[2] = "8"
    row[3] = "20"
    row[4] = "999991"
    row[5] = "1"
    row[6] = "退院支援計画書を交付"
    row[7] = "11"
    row[8] = "ﾀｲｲﾝｼｴﾝｹｲｶｸｼｮｦｺｳﾌ"
    row[20] = "20260401"
    row[21] = "99999999"
    row[22] = "820999991"
    for index, value in overrides.items():
        row[int(index)] = value
    return row


def write_receipt_comment_zip(path, rows: list[list[str]]) -> None:
    csv_text = "\r\n".join(",".join(row) for row in rows)
    with ZipFile(path, "w") as archive:
        archive.writestr("c_ALL_TEST.csv", csv_text.encode("cp932"))


def write_receipt_comment_csv(path, rows: list[list[str]]) -> None:
    with path.open("w", encoding="cp932", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerows(rows)


def cleanup_receipt_comment(comment_code: str) -> None:
    with SessionLocal() as db:
        item = db.get(ReceiptCommentMaster, comment_code)
        if item is not None:
            db.delete(item)
            db.commit()


def test_iter_receipt_comment_master_records_from_zip(tmp_path) -> None:
    zip_file = tmp_path / "c_ALL_TEST.zip"
    write_receipt_comment_zip(zip_file, [receipt_comment_row(), receipt_comment_row(**{"1": "S"})])

    records = iter_receipt_comment_master_records(file_path=zip_file)

    assert len(records) == 1
    assert records[0].comment_code == "820999991"
    assert records[0].comment_class == "8"
    assert records[0].pattern == "20"
    assert records[0].sequence_number == "999991"
    assert records[0].text == "退院支援計画書を交付"
    assert records[0].text_kana == "タイインシエンケイカクショヲコウフ"
    assert records[0].effective_from == "20260401"


def test_sync_receipt_comment_master_records(tmp_path) -> None:
    comment_code = "820999992"
    csv_file = tmp_path / "c_ALL_TEST.csv"
    write_receipt_comment_csv(
        csv_file,
        [receipt_comment_row(**{"22": comment_code, "6": "コメント取込テスト"})],
    )

    try:
        records = iter_receipt_comment_master_records(file_path=csv_file)
        with SessionLocal() as db:
            summary = sync_receipt_comment_master_records(db, records)
            db.commit()
            item = db.get(ReceiptCommentMaster, comment_code)

        assert summary.created == 1
        assert item is not None
        assert item.text == "コメント取込テスト"
        assert item.pattern == "20"
        assert item.source_file == "c_ALL_TEST.csv"
    finally:
        cleanup_receipt_comment(comment_code)
