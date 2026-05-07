from __future__ import annotations

import csv
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import SessionLocal
from app.diagnosis_import import (
    iter_diagnosis_alias_records,
    iter_diagnosis_main_records,
    normalize_header,
    upsert_diagnosis_alias_records,
    upsert_diagnosis_main_records,
)
from app.main import app
from app.models import DiagnosisAliasMaster, DiagnosisMaster


def write_cp932_csv(path, rows: list[list[str]]) -> None:
    with path.open("w", encoding="cp932", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerows(rows)


def cleanup_diagnosis_master(management_number: str) -> None:
    with SessionLocal() as db:
        aliases = db.scalars(
            select(DiagnosisAliasMaster).where(DiagnosisAliasMaster.management_number == management_number)
        ).all()
        for alias in aliases:
            db.delete(alias)

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


def test_iter_and_upsert_diagnosis_alias_records(tmp_path) -> None:
    management_number = f"T{uuid4().hex[:15]}"
    title_file = tmp_path / "ttl_idx.txt"
    alias_file = tmp_path / "nidx.txt"

    write_cp932_csv(
        title_file,
        [["変更区分", "病名管理番号", "索引用語", "索引用語カナ", "更新日付"]],
    )
    write_cp932_csv(
        alias_file,
        [["0", management_number, "テスト同義語", "テストドウギゴ", "20260505"]],
    )

    try:
        with TestClient(app):
            with SessionLocal() as db:
                db.add(
                    DiagnosisMaster(
                        management_number=management_number,
                        change_type="0",
                        disease_name="標準テスト病名",
                        disease_name_kana="ヒョウジュンテストビョウメイ",
                        adoption_level="1",
                        exchange_code="TALIAS",
                        icd10_code="A09",
                        icd10_subcode=None,
                        claim_code="1234567",
                        is_deleted=False,
                        updated_at_master="20260505",
                    )
                )
                db.commit()

                records = list(
                    iter_diagnosis_alias_records(
                        title_file=title_file,
                        alias_file=alias_file,
                        alias_type="index",
                    )
                )
                created, updated, skipped = upsert_diagnosis_alias_records(db, records)
                db.commit()

                alias = db.scalars(
                    select(DiagnosisAliasMaster).where(DiagnosisAliasMaster.management_number == management_number)
                ).one()

            assert len(records) == 1
            assert records[0].alias == "テスト同義語"
            assert created == 1
            assert updated == 0
            assert skipped == 0
            assert alias.alias_kana == "テストドウギゴ"
            assert alias.alias_type == "index"
    finally:
        cleanup_diagnosis_master(management_number)
