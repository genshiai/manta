from __future__ import annotations

import csv
from uuid import uuid4

from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.diagnosis_import import iter_diagnosis_main_records, normalize_header, upsert_diagnosis_main_records
from app.main import app
from app.models import DiagnosisMaster


def write_cp932_csv(path, rows: list[list[str]]) -> None:
    with path.open("w", encoding="cp932", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerows(rows)


def cleanup_diagnosis_master(management_number: str) -> None:
    with SessionLocal() as db:
        diagnosis = db.get(DiagnosisMaster, management_number)
        if diagnosis is not None:
            db.delete(diagnosis)
            db.commit()


def test_iter_and_upsert_diagnosis_main_records(tmp_path) -> None:
    management_number = f"T{uuid4().hex[:15]}"
    title_file = tmp_path / "ttl_main.txt"
    main_file = tmp_path / "nmain.txt"
    update_file = tmp_path / "nmain_updated.txt"

    write_cp932_csv(
        title_file,
        [
            [
                "変更区分",
                "病名管理番号",
                "病名表記",
                "病名表記カナ",
                "採択区分",
                "病名交換用コード",
                "ＩＣＤ１０‐２０１３",
                "ＩＣＤ１０‐２０１３複数分類コード",
                "レセ電算コード",
                "更新日付",
            ]
        ],
    )
    write_cp932_csv(
        main_file,
        [["0", management_number, "テスト病名", "テストビョウメイ", "1", "ABCD", "A09", "", "1234567", "20260101"]],
    )
    write_cp932_csv(
        update_file,
        [["0", management_number, "テスト病名改", "テストビョウメイカイ", "1", "ABCD", "A09", "", "1234568", "20260201"]],
    )

    try:
        with TestClient(app):
            records = list(iter_diagnosis_main_records(title_file=title_file, main_file=main_file))
            assert normalize_header("ＩＣＤ１０‐２０１３") == "ICD10-2013"
            assert len(records) == 1
            assert records[0].icd10_code == "A09"

            with SessionLocal() as db:
                created, updated = upsert_diagnosis_main_records(db, records)
                db.commit()

            assert created == 1
            assert updated == 0

            with SessionLocal() as db:
                created, updated = upsert_diagnosis_main_records(
                    db,
                    iter_diagnosis_main_records(title_file=title_file, main_file=update_file),
                )
                db.commit()
                diagnosis = db.get(DiagnosisMaster, management_number)

            assert created == 0
            assert updated == 1
            assert diagnosis is not None
            assert diagnosis.disease_name == "テスト病名改"
            assert diagnosis.claim_code == "1234568"
            assert diagnosis.is_deleted is False
    finally:
        cleanup_diagnosis_master(management_number)
