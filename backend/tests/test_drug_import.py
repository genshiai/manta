from __future__ import annotations

import csv
from uuid import uuid4

from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.drug_import import (
    build_pmda_drug_info_url,
    iter_drug_master_records,
    normalize_header,
    sync_drug_master_records,
    upsert_drug_master_records,
)
from app.main import app
from app.models import PrescriptionCatalogMaster


def write_utf8_csv(path, rows: list[list[str]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerows(rows)


def cleanup_prescription_catalog(master_id: str) -> None:
    with SessionLocal() as db:
        item = db.get(PrescriptionCatalogMaster, master_id)
        if item is not None:
            db.delete(item)
            db.commit()


def test_build_pmda_drug_info_url_from_yj_code() -> None:
    assert (
        build_pmda_drug_info_url("1234567A1234")
        == "https://www.pmda.go.jp/PmdaSearch/rdSearch/02/1234567A1234?user=1"
    )
    assert (
        build_pmda_drug_info_url("1234567a1234", audience="consumer")
        == "https://www.pmda.go.jp/PmdaSearch/rdSearch/02/1234567A1234?user=2"
    )
    assert build_pmda_drug_info_url("DEMO-YJ") is None


def test_iter_and_upsert_drug_master_records(tmp_path) -> None:
    master_id = f"drug-test-{uuid4().hex[:8]}"
    csv_file = tmp_path / "drug_master.csv"
    updated_file = tmp_path / "drug_master_updated.csv"

    title = [
        "識別子",
        "表示順",
        "公開状態",
        "販売名",
        "区分",
        "一般名",
        "販売名カナ",
        "別名",
        "ＹＪコード",
        "ＨＯＴコード",
        "剤形",
        "規格",
        "用法候補",
        "標準用法コード",
        "既定日数",
        "PMDAリンク",
        "関連病名",
        "禁忌ラベル",
    ]
    write_utf8_csv(
        csv_file,
        [
            title,
            [
                master_id,
                "900",
                "有効",
                "FHIRテスト薬錠 100mg",
                "内服",
                "テスト薬",
                "テストヤクジョウ",
                "テスト薬|サジェスト語",
                "1234567A1234",
                "1234567890123",
                "錠剤",
                "100mg",
                "1回1錠 1日1回 朝食後|1回1錠 1日2回 朝夕食後",
                "po-qd-after-breakfast",
                "14",
                "",
                "#1 テスト病名",
                "",
            ],
        ],
    )
    write_utf8_csv(
        updated_file,
        [
            title,
            [
                master_id,
                "901",
                "無効",
                "FHIRテスト薬錠 100mg 改",
                "内服",
                "テスト薬",
                "テストヤクジョウ",
                "テスト薬",
                "1234567A1234",
                "1234567890123",
                "錠剤",
                "100mg",
                "1回1錠 1日1回 朝食後",
                "po-qd-after-breakfast",
                "21",
                "https://example.test/pmda",
                "#1 テスト病名",
                "テスト禁忌",
            ],
        ],
    )

    try:
        with TestClient(app):
            records = list(iter_drug_master_records(csv_file=csv_file))
            assert normalize_header("ＹＪコード") == "yjコード"
            assert len(records) == 1
            assert records[0].id == master_id
            assert records[0].pmda_info_url == (
                "https://www.pmda.go.jp/PmdaSearch/rdSearch/02/1234567A1234?user=1"
            )
            assert records[0].aliases == ["テスト薬", "サジェスト語"]

            with SessionLocal() as db:
                created, updated = upsert_drug_master_records(db, records)
                db.commit()
                item = db.get(PrescriptionCatalogMaster, master_id)

            assert created == 1
            assert updated == 0
            assert item is not None
            assert item.drug_name == "FHIRテスト薬錠 100mg"
            assert item.default_days == "14"

            with SessionLocal() as db:
                created, updated = upsert_drug_master_records(
                    db,
                    iter_drug_master_records(csv_file=updated_file),
                )
                db.commit()
                item = db.get(PrescriptionCatalogMaster, master_id)

            assert created == 0
            assert updated == 1
            assert item is not None
            assert item.is_active is False
            assert item.drug_name == "FHIRテスト薬錠 100mg 改"
            assert item.pmda_info_url == "https://example.test/pmda"
            assert item.allergy_conflict_label == "テスト禁忌"
    finally:
        cleanup_prescription_catalog(master_id)


def test_sync_drug_master_records_supports_dry_run_and_deactivate_missing(tmp_path) -> None:
    prefix = f"yj-test-{uuid4().hex[:8]}"
    active_missing_id = f"{prefix}-missing"
    incoming_id = f"{prefix}-incoming"
    csv_file = tmp_path / "drug_master.csv"
    title = ["識別子", "販売名", "区分", "用法候補"]
    write_utf8_csv(
        csv_file,
        [
            title,
            [incoming_id, "継続取込テスト薬 10mg", "内服", "1回1錠 1日1回 朝食後"],
        ],
    )

    try:
        with TestClient(app):
            with SessionLocal() as db:
                db.add(
                    PrescriptionCatalogMaster(
                        id=active_missing_id,
                        sort_order=999,
                        is_active=True,
                        drug_name="削除検知テスト薬",
                        category="内服",
                        dosage_options=["1回1錠 1日1回 朝食後"],
                        aliases=[],
                    )
                )
                db.commit()

            with SessionLocal() as db:
                dry_run = sync_drug_master_records(
                    db,
                    iter_drug_master_records(csv_file=csv_file),
                    dry_run=True,
                    deactivate_missing=True,
                    managed_id_prefixes=(prefix,),
                )
                db.rollback()
                assert dry_run.created == 1
                assert dry_run.deactivated >= 1
                assert db.get(PrescriptionCatalogMaster, incoming_id) is None
                assert db.get(PrescriptionCatalogMaster, active_missing_id).is_active is True

            with SessionLocal() as db:
                summary = sync_drug_master_records(
                    db,
                    iter_drug_master_records(csv_file=csv_file),
                    deactivate_missing=True,
                    managed_id_prefixes=(prefix,),
                )
                db.commit()
                incoming = db.get(PrescriptionCatalogMaster, incoming_id)
                missing = db.get(PrescriptionCatalogMaster, active_missing_id)

            assert summary.created == 1
            assert summary.deactivated >= 1
            assert incoming is not None
            assert incoming.drug_name == "継続取込テスト薬 10mg"
            assert missing is not None
            assert missing.is_active is False
    finally:
        cleanup_prescription_catalog(incoming_id)
        cleanup_prescription_catalog(active_missing_id)
