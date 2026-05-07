from __future__ import annotations

import csv
import hashlib
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from .models import HotDrugCodeMapping


FIELD_BY_HEADER = {
    "更新区分": "update_type",
    "更新年月日": "updated_at_master",
    "データ登録企業名": "company_name",
    "販売名": "brand_name",
    "販売名50音:1": "brand_name_kana_1",
    "販売名50音:2": "brand_name_kana_2",
    "販売名50音:3": "brand_name_kana_3",
    "告示分類": "listing_classification",
    "薬価コード": "yj_code",
    "告示名称": "listed_name",
    "告示日": "listed_at",
    "経過措置日": "transitional_expiry",
    "規格・製造承認時規格": "approval_specification",
    "区分名": "drug_category",
    "剤形": "dosage_form",
    "包装形態": "package_form",
    "包装単位数": "package_quantity",
    "包装単位数単位": "package_unit",
    "総数量数": "total_quantity",
    "総数量数単位": "total_quantity_unit",
    "調剤包装単位コード": "dispensing_package_code",
    "調剤包装単位名称": "dispensing_package_name",
    "調剤包装単位細区分": "dispensing_package_subdivision",
    "販売包装単位コード": "sales_package_code",
    "元梱包装単位コード": "carton_package_code",
    "物流用janコード": "jan_code",
    "販売中止年月日": "sales_discontinued_at",
    "最終ロット使用期限": "last_lot_expiry",
}


@dataclass(frozen=True)
class HotDrugImportRecord:
    id: str
    update_type: str | None
    updated_at_master: str | None
    company_name: str | None
    brand_name: str
    brand_name_kana_1: str | None
    brand_name_kana_2: str | None
    brand_name_kana_3: str | None
    listing_classification: str | None
    yj_code: str | None
    listed_name: str | None
    listed_at: str | None
    transitional_expiry: str | None
    approval_specification: str | None
    drug_category: str | None
    dosage_form: str | None
    package_form: str | None
    package_quantity: str | None
    package_unit: str | None
    total_quantity: str | None
    total_quantity_unit: str | None
    dispensing_package_code: str | None
    dispensing_package_name: str | None
    dispensing_package_subdivision: str | None
    sales_package_code: str | None
    carton_package_code: str | None
    jan_code: str | None
    sales_discontinued_at: str | None
    last_lot_expiry: str | None
    source_file: str


@dataclass(frozen=True)
class HotDrugImportSummary:
    total: int
    created: int
    updated: int
    unchanged: int
    dry_run: bool = False


def _normalize_header(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).strip().replace(" ", "")
    return normalized.lower()


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = unicodedata.normalize("NFKC", value).strip()
    return normalized or None


def _read_rows(file_path: Path) -> list[list[str]]:
    with file_path.open("r", encoding="cp932", newline="") as handle:
        return [row for row in csv.reader(handle) if row]


def _resolve_headers(header_row: list[str]) -> dict[int, str]:
    resolved: dict[int, str] = {}
    for index, header in enumerate(header_row):
        field_name = FIELD_BY_HEADER.get(_normalize_header(header))
        if field_name:
            resolved[index] = field_name

    missing = {"brand_name", "yj_code", "dispensing_package_code"} - set(resolved.values())
    if missing:
        raise ValueError(f"HOT CSV is missing required fields: {', '.join(sorted(missing))}")
    return resolved


def _stable_id(values: dict[str, str | None]) -> str:
    parts = [
        values.get("yj_code") or "",
        values.get("dispensing_package_code") or "",
        values.get("sales_package_code") or "",
        values.get("carton_package_code") or "",
        values.get("jan_code") or "",
        values.get("package_quantity") or "",
        values.get("total_quantity") or "",
    ]
    digest = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]
    return f"hot-map-{digest}"


def iter_hot_drug_code_mapping_records(*, file_path: Path) -> list[HotDrugImportRecord]:
    rows = _read_rows(file_path)
    if not rows:
        raise ValueError("HOT CSV is empty")

    headers = _resolve_headers(rows[0])
    records: list[HotDrugImportRecord] = []
    for row in rows[1:]:
        values = {
            field_name: _blank_to_none(row[index] if index < len(row) else None)
            for index, field_name in headers.items()
        }
        brand_name = values.get("brand_name")
        if not brand_name:
            continue

        records.append(
            HotDrugImportRecord(
                id=_stable_id(values),
                update_type=values.get("update_type"),
                updated_at_master=values.get("updated_at_master"),
                company_name=values.get("company_name"),
                brand_name=brand_name,
                brand_name_kana_1=values.get("brand_name_kana_1"),
                brand_name_kana_2=values.get("brand_name_kana_2"),
                brand_name_kana_3=values.get("brand_name_kana_3"),
                listing_classification=values.get("listing_classification"),
                yj_code=values.get("yj_code"),
                listed_name=values.get("listed_name"),
                listed_at=values.get("listed_at"),
                transitional_expiry=values.get("transitional_expiry"),
                approval_specification=values.get("approval_specification"),
                drug_category=values.get("drug_category"),
                dosage_form=values.get("dosage_form"),
                package_form=values.get("package_form"),
                package_quantity=values.get("package_quantity"),
                package_unit=values.get("package_unit"),
                total_quantity=values.get("total_quantity"),
                total_quantity_unit=values.get("total_quantity_unit"),
                dispensing_package_code=values.get("dispensing_package_code"),
                dispensing_package_name=values.get("dispensing_package_name"),
                dispensing_package_subdivision=values.get("dispensing_package_subdivision"),
                sales_package_code=values.get("sales_package_code"),
                carton_package_code=values.get("carton_package_code"),
                jan_code=values.get("jan_code"),
                sales_discontinued_at=values.get("sales_discontinued_at"),
                last_lot_expiry=values.get("last_lot_expiry"),
                source_file=file_path.name,
            )
        )
    return records


def _record_payload(record: HotDrugImportRecord) -> dict[str, object]:
    return {
        "update_type": record.update_type,
        "updated_at_master": record.updated_at_master,
        "company_name": record.company_name,
        "brand_name": record.brand_name,
        "brand_name_kana_1": record.brand_name_kana_1,
        "brand_name_kana_2": record.brand_name_kana_2,
        "brand_name_kana_3": record.brand_name_kana_3,
        "listing_classification": record.listing_classification,
        "yj_code": record.yj_code,
        "listed_name": record.listed_name,
        "listed_at": record.listed_at,
        "transitional_expiry": record.transitional_expiry,
        "approval_specification": record.approval_specification,
        "drug_category": record.drug_category,
        "dosage_form": record.dosage_form,
        "package_form": record.package_form,
        "package_quantity": record.package_quantity,
        "package_unit": record.package_unit,
        "total_quantity": record.total_quantity,
        "total_quantity_unit": record.total_quantity_unit,
        "dispensing_package_code": record.dispensing_package_code,
        "dispensing_package_name": record.dispensing_package_name,
        "dispensing_package_subdivision": record.dispensing_package_subdivision,
        "sales_package_code": record.sales_package_code,
        "carton_package_code": record.carton_package_code,
        "jan_code": record.jan_code,
        "sales_discontinued_at": record.sales_discontinued_at,
        "last_lot_expiry": record.last_lot_expiry,
        "source_file": record.source_file,
    }


def sync_hot_drug_code_mapping_records(
    db: Session,
    records: list[HotDrugImportRecord],
    *,
    dry_run: bool = False,
) -> HotDrugImportSummary:
    created = updated = unchanged = 0
    for record in records:
        existing = db.get(HotDrugCodeMapping, record.id)
        payload = _record_payload(record)
        if existing is None:
            created += 1
            if not dry_run:
                db.add(HotDrugCodeMapping(id=record.id, **payload))
            continue

        has_changed = any(getattr(existing, key) != value for key, value in payload.items())
        if not has_changed:
            unchanged += 1
            continue

        updated += 1
        if not dry_run:
            for key, value in payload.items():
                setattr(existing, key, value)

    return HotDrugImportSummary(
        total=len(records),
        created=created,
        updated=updated,
        unchanged=unchanged,
        dry_run=dry_run,
    )
