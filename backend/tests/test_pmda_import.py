from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import SessionLocal
from app.main import app
from app.modules.master_data.models import (
    PmdaDrugInteraction,
    PmdaDrugInteractionMatch,
    PmdaPackageInsertSection,
    PrescriptionCatalogMaster,
)
from app.pmda_import import parse_pmda_package_insert_xml_records, upsert_pmda_package_insert_data
from app.pmda_interaction_match import sync_pmda_interaction_matches


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


def test_sync_pmda_interaction_matches_catalog_yj(tmp_path: Path) -> None:
    suffix = uuid4().hex[:8]
    package_insert_no = f"TEST-MATCH-{suffix}"
    catalog_id = f"warfarin-{suffix}"
    yj_code = f"1234567B{suffix[:4].upper()}"
    target_yj_code = f"7654321C{suffix[:4].upper()}"

    try:
        with SessionLocal() as db:
            db.add(
                PrescriptionCatalogMaster(
                    id=catalog_id,
                    sort_order=9999,
                    is_active=True,
                    drug_name=f"ワルファリン錠1mg {suffix}",
                    category="内服",
                    dosage_options=[],
                    generic_name="ワルファリン",
                    name_kana=None,
                    aliases=[],
                    yj_code=target_yj_code,
                    hot_code=None,
                    dosage_form=None,
                    strength=None,
                    standard_usage_code=None,
                    default_days=None,
                    pmda_info_url=None,
                    allergy_conflict_label=None,
                    related_problem=None,
                )
            )
            interaction = PmdaDrugInteraction(
                yj_code=yj_code,
                package_insert_no=package_insert_no,
                brand_name="相互作用テスト薬",
                interacting_drug="ワルファリン",
                clinical_effects="出血に注意する。",
                mechanism=None,
                source_xml="pmda-test.xml",
                source_updated_at="2026-05",
            )
            db.add(interaction)
            db.commit()

            summary = sync_pmda_interaction_matches(db)
            db.commit()
            matches = db.scalars(
                select(PmdaDrugInteractionMatch).where(PmdaDrugInteractionMatch.interaction_id == interaction.id)
            ).all()

        assert summary.created >= 1
        assert any(match.matched_yj_code == target_yj_code for match in matches)
        assert any(match.match_source == "catalog" for match in matches)
    finally:
        with SessionLocal() as db:
            for row in db.scalars(
                select(PmdaDrugInteraction).where(PmdaDrugInteraction.package_insert_no == package_insert_no)
            ).all():
                db.delete(row)
            catalog = db.get(PrescriptionCatalogMaster, catalog_id)
            if catalog is not None:
                db.delete(catalog)
            db.commit()
