from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import SessionLocal
from app.main import app
from app.models import PmdaDrugInteraction, PmdaPackageInsertSection
from app.pmda_import import parse_pmda_package_insert_xml_records, upsert_pmda_package_insert_data


def cleanup_pmda_sections(package_insert_no: str) -> None:
    with SessionLocal() as db:
        rows = db.scalars(
            select(PmdaPackageInsertSection).where(PmdaPackageInsertSection.package_insert_no == package_insert_no)
        ).all()
        for row in rows:
            db.delete(row)
        interactions = db.scalars(
            select(PmdaDrugInteraction).where(PmdaDrugInteraction.package_insert_no == package_insert_no)
        ).all()
        for row in interactions:
            db.delete(row)
        db.commit()


def test_parse_and_upsert_pmda_package_insert_xml(tmp_path: Path) -> None:
    package_insert_no = f"TEST-{uuid4().hex[:8]}"
    xml_file = tmp_path / "pmda.xml"
    xml_file.write_text(
        f"""<?xml version="1.0" encoding="utf-8"?>
<PackIns xmlns="http://info.pmda.go.jp/namespace/prescription_drugs/package_insert/1.0">
  <PackageInsertNo>{package_insert_no}</PackageInsertNo>
  <DateOfPreparationOrRevision>
    <PreparationOrRevision id="今回"><YearMonth>2026-05</YearMonth></PreparationOrRevision>
  </DateOfPreparationOrRevision>
  <ApprovalEtc>
    <DetailBrandName id="BRD_Drug1">
      <ApprovalBrandName><Lang xml:lang="ja">テスト錠</Lang></ApprovalBrandName>
      <BrandCode><YJCode>1234567A0001</YJCode></BrandCode>
    </DetailBrandName>
  </ApprovalEtc>
  <GenericName><Detail><Lang xml:lang="ja">テスト一般名</Lang></Detail></GenericName>
  <ContraIndications>
    <OrderedList>
      <Item><Detail><Lang xml:lang="ja">重篤な腎機能障害のある患者</Lang></Detail></Item>
    </OrderedList>
  </ContraIndications>
  <Interactions>
    <PrecautionsForCombinations>
      <PrecautionsForCombination>
        <Drug><DrugName><Lang xml:lang="ja">ワルファリン</Lang></DrugName></Drug>
        <ClinSymptomsAndMeasures><Lang xml:lang="ja">出血に注意する。</Lang></ClinSymptomsAndMeasures>
      </PrecautionsForCombination>
    </PrecautionsForCombinations>
  </Interactions>
</PackIns>
""",
        encoding="utf-8",
    )

    try:
        with TestClient(app):
            sections, interactions = parse_pmda_package_insert_xml_records(xml_file)
            assert len(sections) == 2
            assert len(interactions) == 1
            assert {record.section_code for record in sections} == {"contraindications", "interactions"}
            assert all(record.yj_code == "1234567A0001" for record in sections)
            assert interactions[0].interacting_drug == "ワルファリン"

            with SessionLocal() as db:
                inserted, deleted, interaction_inserted, interaction_deleted = upsert_pmda_package_insert_data(
                    db,
                    sections=sections,
                    interactions=interactions,
                )
                db.commit()
                rows = db.scalars(
                    select(PmdaPackageInsertSection).where(
                        PmdaPackageInsertSection.package_insert_no == package_insert_no
                    )
                ).all()

            assert inserted == 2
            assert deleted == 0
            assert interaction_inserted == 1
            assert interaction_deleted == 0
            assert len(rows) == 2
            assert any(row.severity == "contraindication" for row in rows)
    finally:
        cleanup_pmda_sections(package_insert_no)
