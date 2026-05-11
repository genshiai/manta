from __future__ import annotations

import csv

from app.db import SessionLocal
from app.hot_drug_import import iter_hot_drug_code_mapping_records, sync_hot_drug_code_mapping_records
from app.modules.master_data.models import HotDrugCodeMapping


HOT_HEADERS = [
    "更新区分",
    "更新年月日",
    "データ登録企業名",
    "販売名",
    "販売名５０音：１",
    "販売名５０音：２",
    "販売名５０音：３",
    "告示分類",
    "薬価コード",
    "告示名称",
    "告示日",
    "経過措置日",
    "規格・製造承認時規格",
    "予備１",
    "予備２",
    "区分名",
    "剤形",
    "溶解液種類（成分）",
    "溶解液容量",
    "溶解液容量単位",
    "生物由来製品区分",
    "麻薬・皮内反応薬区分",
    "包装形態",
    "包装単位数",
    "包装単位数単位",
    "総数量数",
    "総数量数単位",
    "１連の包装数",
    "予備３",
    "調剤包装単位コード",
    "調剤包装単位名称",
    "調剤包装単位細区分",
    "販売包装単位コード",
    "元梱包装単位コード",
    "物流用ＪＡＮコード",
    "予備４",
    "予備５",
    "予備６",
    "予備７",
    "予備８",
    "対照液の包装情報フラグ",
    "対照液の情報",
    "販売中止年月日",
    "最終ロット使用期限",
]


def write_hot_csv(path, rows: list[list[str]]) -> None:
    with path.open("w", encoding="cp932", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerows(rows)


def hot_row(**overrides: str) -> list[str]:
    row = [""] * len(HOT_HEADERS)
    row[0] = "新規"
    row[1] = "20260331"
    row[2] = "第一三共"
    row[3] = "ロキソニン錠６０ｍｇ"
    row[4] = "ら"
    row[7] = "厚生労働省告示"
    row[8] = "1149019F1560"
    row[9] = "（局）ロキソニン錠６０ｍｇ"
    row[10] = "20090925"
    row[12] = "６０ｍｇ１錠"
    row[15] = "内用薬"
    row[16] = "錠剤"
    row[22] = "ＰＴＰ"
    row[23] = "10"
    row[24] = "錠"
    row[25] = "100"
    row[26] = "錠"
    row[29] = "04987081753352"
    row[30] = "ロキソニン錠６０ｍｇ ＰＴＰ 10錠"
    row[32] = "14987081100184"
    row[33] = "24987081100181"
    row[34] = "4987081753352"
    for index, value in overrides.items():
        row[int(index)] = value
    return row


def cleanup_mapping(mapping_id: str) -> None:
    with SessionLocal() as db:
        item = db.get(HotDrugCodeMapping, mapping_id)
        if item is not None:
            db.delete(item)
            db.commit()


def test_iter_hot_drug_code_mapping_records(tmp_path) -> None:
    csv_file = tmp_path / "A_TEST_2.txt"
    write_hot_csv(csv_file, [HOT_HEADERS, hot_row()])

    records = iter_hot_drug_code_mapping_records(file_path=csv_file)

    assert len(records) == 1
    assert records[0].brand_name == "ロキソニン錠60mg"
    assert records[0].listed_name == "(局)ロキソニン錠60mg"
    assert records[0].yj_code == "1149019F1560"
    assert records[0].dispensing_package_code == "04987081753352"
    assert records[0].sales_package_code == "14987081100184"
    assert records[0].carton_package_code == "24987081100181"
    assert records[0].jan_code == "4987081753352"


def test_sync_hot_drug_code_mapping_records(tmp_path) -> None:
    csv_file = tmp_path / "A_TEST_2.txt"
    write_hot_csv(csv_file, [HOT_HEADERS, hot_row(**{"32": "14999999999999"})])
    records = iter_hot_drug_code_mapping_records(file_path=csv_file)
    mapping_id = records[0].id

    try:
        with SessionLocal() as db:
            summary = sync_hot_drug_code_mapping_records(db, records)
            db.commit()
            item = db.get(HotDrugCodeMapping, mapping_id)

        assert summary.created == 1
        assert item is not None
        assert item.yj_code == "1149019F1560"
        assert item.sales_package_code == "14999999999999"
    finally:
        cleanup_mapping(mapping_id)
