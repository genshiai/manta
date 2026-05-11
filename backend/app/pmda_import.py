from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
import xml.etree.ElementTree as ET

from sqlalchemy import delete
from sqlalchemy.orm import Session

from .modules.master_data.models import PmdaDrugInteraction, PmdaPackageInsertSection

PMDA_NS = {"p": "http://info.pmda.go.jp/namespace/prescription_drugs/package_insert/1.0"}


SECTION_DEFINITIONS = {
    "ContraIndications": ("contraindications", "禁忌", "contraindication"),
    "InfoDoseAdmin": ("dosage_and_administration", "用法及び用量", "dosage"),
    "DoseAdmin": ("dosage_and_administration", "用法及び用量", "dosage"),
    "InfoPrecautionsDosage": ("precautions_dosage", "用法及び用量に関連する注意", "warning"),
    "ImportantPrecautions": ("important_precautions", "重要な基本的注意", "warning"),
    "PatientsWithRenalImpairment": ("renal_impairment", "腎機能障害患者", "warning"),
    "PatientsWithHepaticImpairment": ("hepatic_impairment", "肝機能障害患者", "warning"),
    "UseInPregnant": ("pregnancy", "妊婦", "contraindication"),
    "UseInNursing": ("nursing", "授乳婦", "warning"),
    "PediatricUse": ("pediatric", "小児等", "warning"),
    "UseInTheElderly": ("elderly", "高齢者", "warning"),
    "Interactions": ("interactions", "相互作用", "interaction"),
}


@dataclass(frozen=True)
class PmdaSectionRecord:
    yj_code: str
    package_insert_no: str
    brand_name: str | None
    generic_name: str | None
    section_code: str
    section_heading: str
    severity: str
    text: str
    source_xml: str
    source_updated_at: str | None


@dataclass(frozen=True)
class PmdaInteractionRecord:
    yj_code: str
    package_insert_no: str
    brand_name: str | None
    interacting_drug: str
    clinical_effects: str | None
    mechanism: str | None
    source_xml: str
    source_updated_at: str | None


def _local_name(tag: str) -> str:
    return tag.split("}", 1)[-1]


def _text(element: ET.Element | None) -> str:
    if element is None:
        return ""
    return " ".join("".join(element.itertext()).split())


def _first_text(root: ET.Element, path: str) -> str | None:
    value = _text(root.find(path, PMDA_NS))
    return value or None


def _latest_revision(root: ET.Element) -> str | None:
    for item in root.findall(".//p:PreparationOrRevision", PMDA_NS):
        if item.attrib.get("id") == "今回":
            return _first_text(item, ".//p:YearMonth")
    return _first_text(root, ".//p:PreparationOrRevision/p:YearMonth")


def _brand_by_id(root: ET.Element) -> dict[str, tuple[str | None, str]]:
    brands: dict[str, tuple[str | None, str]] = {}
    for brand in root.findall(".//p:DetailBrandName", PMDA_NS):
        brand_id = brand.attrib.get("id")
        yj_code = _first_text(brand, ".//p:YJCode")
        if not brand_id or not yj_code:
            continue
        brands[brand_id] = (_first_text(brand, ".//p:ApprovalBrandName"), yj_code)
    return brands


def _target_brand_ids(section: ET.Element, brand_ids: set[str]) -> set[str]:
    refs = {
        ref
        for ref in (element.attrib.get("ref") for element in section.findall(".//p:ApprovalBrandNameRef", PMDA_NS))
        if ref
    }
    return refs or set(brand_ids)


def _section_text_items(section: ET.Element) -> list[str]:
    rows = section.findall(".//p:SimpTblRow", PMDA_NS)
    if rows:
        row_texts = [_text(row) for row in rows]
        return [text for text in row_texts if text]

    items = section.findall(".//p:Item", PMDA_NS)
    if items:
        item_texts = [_text(item) for item in items]
        return [text for text in item_texts if text]

    text = _text(section)
    return [text] if text else []


def parse_pmda_package_insert_xml(xml_file: Path) -> list[PmdaSectionRecord]:
    records, _ = parse_pmda_package_insert_xml_records(xml_file)
    return records


def parse_pmda_package_insert_xml_records(xml_file: Path) -> tuple[list[PmdaSectionRecord], list[PmdaInteractionRecord]]:
    root = ET.parse(xml_file).getroot()
    package_insert_no = _first_text(root, ".//p:PackageInsertNo")
    if not package_insert_no:
        raise ValueError(f"{xml_file} does not contain PackageInsertNo")

    brands = _brand_by_id(root)
    if not brands:
        raise ValueError(f"{xml_file} does not contain YJCode")

    generic_name = _first_text(root, ".//p:GenericName")
    source_updated_at = _latest_revision(root)
    records: list[PmdaSectionRecord] = []
    interactions = _parse_interaction_records(
        root=root,
        brands=brands,
        package_insert_no=package_insert_no,
        source_xml=xml_file.name,
        source_updated_at=source_updated_at,
    )

    for element in root.iter():
        section_name = _local_name(element.tag)
        if section_name not in SECTION_DEFINITIONS:
            continue

        section_code, section_heading, severity = SECTION_DEFINITIONS[section_name]
        target_brand_ids = _target_brand_ids(element, set(brands))
        text_items = _section_text_items(element)
        for brand_id in sorted(target_brand_ids):
            brand_name, yj_code = brands[brand_id]
            for text in text_items:
                records.append(
                    PmdaSectionRecord(
                        yj_code=yj_code,
                        package_insert_no=package_insert_no,
                        brand_name=brand_name,
                        generic_name=generic_name,
                        section_code=section_code,
                        section_heading=section_heading,
                        severity=severity,
                        text=text,
                        source_xml=xml_file.name,
                        source_updated_at=source_updated_at,
                    )
                )

    return _deduplicate_records(records), _deduplicate_interactions(interactions)


def _parse_interaction_records(
    *,
    root: ET.Element,
    brands: dict[str, tuple[str | None, str]],
    package_insert_no: str,
    source_xml: str,
    source_updated_at: str | None,
) -> list[PmdaInteractionRecord]:
    records: list[PmdaInteractionRecord] = []
    brand_ids = set(brands)
    for section in root.findall(".//p:Interactions", PMDA_NS):
        target_brand_ids = _target_brand_ids(section, brand_ids)
        rows = section.findall(".//p:PrecautionsForCombination", PMDA_NS)
        rows.extend(section.findall(".//p:PrecautionsForCombi", PMDA_NS))
        for row in rows:
            interacting_drug = _text(row.find(".//p:DrugName", PMDA_NS))
            if not interacting_drug:
                continue
            clinical_effects = _text(row.find(".//p:ClinSymptomsAndMeasures", PMDA_NS)) or None
            mechanism = _text(row.find(".//p:MechanismAndRiskFactors", PMDA_NS)) or None
            for brand_id in sorted(target_brand_ids):
                brand_name, yj_code = brands[brand_id]
                records.append(
                    PmdaInteractionRecord(
                        yj_code=yj_code,
                        package_insert_no=package_insert_no,
                        brand_name=brand_name,
                        interacting_drug=interacting_drug,
                        clinical_effects=clinical_effects,
                        mechanism=mechanism,
                        source_xml=source_xml,
                        source_updated_at=source_updated_at,
                    )
                )
    return records


def _deduplicate_records(records: list[PmdaSectionRecord]) -> list[PmdaSectionRecord]:
    seen: set[tuple[str, str, str, str]] = set()
    unique: list[PmdaSectionRecord] = []
    for record in records:
        key = (record.yj_code, record.package_insert_no, record.section_code, re.sub(r"\s+", "", record.text))
        if key in seen:
            continue
        seen.add(key)
        unique.append(record)
    return unique


def _deduplicate_interactions(records: list[PmdaInteractionRecord]) -> list[PmdaInteractionRecord]:
    seen: set[tuple[str, str, str]] = set()
    unique: list[PmdaInteractionRecord] = []
    for record in records:
        key = (record.yj_code, record.package_insert_no, re.sub(r"\s+", "", record.interacting_drug))
        if key in seen:
            continue
        seen.add(key)
        unique.append(record)
    return unique


def upsert_pmda_package_insert_data(
    db: Session,
    *,
    sections: list[PmdaSectionRecord],
    interactions: list[PmdaInteractionRecord],
) -> tuple[int, int, int, int]:
    package_insert_numbers = {record.package_insert_no for record in [*sections, *interactions]}
    if not package_insert_numbers:
        return 0, 0, 0, 0

    deleted_sections = 0
    deleted_interactions = 0
    for package_insert_no in package_insert_numbers:
        section_result = db.execute(
            delete(PmdaPackageInsertSection).where(PmdaPackageInsertSection.package_insert_no == package_insert_no)
        )
        deleted_sections += section_result.rowcount or 0
        interaction_result = db.execute(
            delete(PmdaDrugInteraction).where(PmdaDrugInteraction.package_insert_no == package_insert_no)
        )
        deleted_interactions += interaction_result.rowcount or 0

    for record in sections:
        db.add(PmdaPackageInsertSection(**record.__dict__))
    for record in interactions:
        db.add(PmdaDrugInteraction(**record.__dict__))

    return len(sections), deleted_sections, len(interactions), deleted_interactions


def upsert_pmda_package_insert_sections(db: Session, records: list[PmdaSectionRecord]) -> tuple[int, int]:
    if not records:
        return 0, 0

    package_insert_numbers = {record.package_insert_no for record in records}
    deleted = 0
    for package_insert_no in package_insert_numbers:
        result = db.execute(
            delete(PmdaPackageInsertSection).where(PmdaPackageInsertSection.package_insert_no == package_insert_no)
        )
        deleted += result.rowcount or 0

    for record in records:
        db.add(PmdaPackageInsertSection(**record.__dict__))

    return len(records), deleted
