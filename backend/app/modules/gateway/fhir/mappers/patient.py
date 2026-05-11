"""Patient ORM ⇔ FHIR R4B Patient マッパー (Step 1)。

Step 1 で `patients` テーブルに以下を追加済み (migration 20260419_0010):
  birth_date / gender / family_name / given_name / family_name_kana /
  given_name_kana / identifier_json

読み取り (orm_to_fhir) は新カラム優先 / legacy (name/kana/sex/demographics) フォールバック。
書き込み (fhir_to_orm_create / apply_fhir_to_orm) は新カラムを正本として書きつつ、
legacy 側も同期する (/api/* が引き続き name/kana/sex を参照するため)。
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Iterable

from fhir.resources.R4B.humanname import HumanName
from fhir.resources.R4B.identifier import Identifier
from fhir.resources.R4B.patient import Patient as FhirPatient

from app.models import Patient as PatientRow


# 実 OID は施設ごとに差し替える想定。Step 2 以降で settings に移設予定。
HOSPITAL_MRN_SYSTEM = "urn:manta:demo:hospital-mrn"


_GENDER_TO_FHIR: dict[str, str] = {
    "男性": "male",
    "女性": "female",
    "男": "male",
    "女": "female",
    "その他": "other",
    "不明": "unknown",
    "male": "male",
    "female": "female",
    "other": "other",
    "unknown": "unknown",
}

_GENDER_TO_LEGACY_JP: dict[str, str] = {
    "male": "男性",
    "female": "女性",
    "other": "その他",
    "unknown": "不明",
}


# ---------------------------------------------------------------------------
# Legacy fallback helpers (Step 0 ロジック残置)
# ---------------------------------------------------------------------------


def _split_japanese_name(value: str | None) -> tuple[str, str]:
    if not value:
        return "", ""
    normalized = value.replace("\u3000", " ").strip()
    if not normalized:
        return "", ""
    parts = normalized.split(" ", 1)
    if len(parts) == 2:
        return parts[0].strip(), parts[1].strip()
    return parts[0].strip(), ""


def _parse_birth_date(demographics: Iterable[dict[str, str]] | None) -> date | None:
    if not demographics:
        return None
    for item in demographics:
        if not isinstance(item, dict):
            continue
        label = item.get("label") or ""
        value = item.get("value") or ""
        if "生年月日" not in label or not value:
            continue
        head = value.split()[0].split("(")[0].strip()
        for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%Y.%m.%d"):
            try:
                return datetime.strptime(head, fmt).date()
            except ValueError:
                continue
    return None


def _gender_to_fhir(sex: str | None) -> str:
    if not sex:
        return "unknown"
    return _GENDER_TO_FHIR.get(sex.strip(), "unknown")


# ---------------------------------------------------------------------------
# Read: ORM → FHIR
# ---------------------------------------------------------------------------


def _resolve_name_parts(row: PatientRow) -> tuple[str, str, str, str]:
    """new カラム → legacy 分割の順で家族名/名前を解決する。"""
    family = row.family_name or ""
    given = row.given_name or ""
    if not family and not given:
        family, given = _split_japanese_name(row.name)

    family_kana = row.family_name_kana or ""
    given_kana = row.given_name_kana or ""
    if not family_kana and not given_kana:
        family_kana, given_kana = _split_japanese_name(row.kana)

    return family, given, family_kana, given_kana


def _build_names(row: PatientRow) -> list[HumanName]:
    family, given, family_kana, given_kana = _resolve_name_parts(row)
    names: list[HumanName] = []
    if family or given:
        names.append(
            HumanName(
                use="official",
                family=family or None,
                given=[given] if given else None,
            )
        )
    if family_kana or given_kana:
        names.append(
            HumanName(
                use="usual",
                family=family_kana or None,
                given=[given_kana] if given_kana else None,
            )
        )
    return names


def _build_identifiers(row: PatientRow) -> list[Identifier]:
    raw = row.identifier_json or []
    identifiers: list[Identifier] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        system = item.get("system")
        value = item.get("value")
        if not system or not value:
            continue
        identifiers.append(Identifier(system=system, value=value))
    if not identifiers:
        identifiers.append(Identifier(system=HOSPITAL_MRN_SYSTEM, value=row.id))
    return identifiers


def orm_to_fhir(row: PatientRow) -> FhirPatient:
    names = _build_names(row)
    identifiers = _build_identifiers(row)

    if row.birth_date is not None:
        birth_date = row.birth_date
    else:
        birth_date = _parse_birth_date(row.demographics)

    gender = row.gender or _gender_to_fhir(row.sex)

    return FhirPatient(
        id=row.id,
        identifier=identifiers,
        name=names or None,
        gender=gender,
        birthDate=birth_date,
        active=True,
    )


# ---------------------------------------------------------------------------
# Write: FHIR → ORM
# ---------------------------------------------------------------------------


def _pick_name(resource: FhirPatient, use: str) -> HumanName | None:
    if not resource.name:
        return None
    for n in resource.name:
        if n.use == use:
            return n
    return None


def _first_given(name: HumanName | None) -> str | None:
    if name is None or not name.given:
        return None
    first = name.given[0]
    return first or None


def _combine_japanese_name(family: str | None, given: str | None) -> str:
    family_part = family.strip() if family else ""
    given_part = given.strip() if given else ""
    if family_part and given_part:
        return f"{family_part} {given_part}"
    return family_part or given_part


def _identifiers_to_json(resource: FhirPatient) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    for ident in resource.identifier or []:
        if not ident.system or not ident.value:
            continue
        entry: dict[str, str] = {"system": ident.system, "value": ident.value}
        if ident.use:
            entry["use"] = ident.use
        result.append(entry)
    return result


def _empty_legacy_defaults() -> dict[str, object]:
    """/api/* が依存する NOT NULL な legacy カラムに空デフォルトを詰める。"""
    return {
        "age": "",
        "department": "",
        "doctor": "",
        "reception_number": "",
        "reservation_time": "",
        "reception_time": "",
        "status": "",
        "elapsed": "",
        "lab_progress": "",
        "same_name_duplicate_count": 0,
        "comment": "",
        "demographics": [],
        "alerts": [],
        "profile_items": [],
        "problems": [],
        "visit_history": [],
        "vitals": [],
        "lab_results": [],
        "chart_history": [],
        "imaging_orders": [],
        "procedure_orders": [],
    }


def apply_fhir_to_orm(row: PatientRow, resource: FhirPatient) -> PatientRow:
    """FHIR Patient の中身を既存 ORM 行に反映する (正本=新カラム + legacy 同期)。"""
    official = _pick_name(resource, "official")
    usual = _pick_name(resource, "usual")

    row.family_name = (official.family if official else None) or None
    row.given_name = _first_given(official)
    row.family_name_kana = (usual.family if usual else None) or None
    row.given_name_kana = _first_given(usual)

    gender = resource.gender or "unknown"
    row.gender = gender
    row.sex = _GENDER_TO_LEGACY_JP.get(gender, "")

    row.birth_date = resource.birthDate

    row.identifier_json = _identifiers_to_json(resource) or None

    # legacy 表示用フィールドを新カラムから再生成する
    row.name = _combine_japanese_name(row.family_name, row.given_name)
    row.kana = _combine_japanese_name(row.family_name_kana, row.given_name_kana)

    return row


def fhir_to_orm_create(resource: FhirPatient, *, new_id: str) -> PatientRow:
    """POST /fhir/Patient 用: FHIR Patient から新規 Patient 行を生成する。

    FHIR には存在しない外来受付系の legacy 列は空デフォルトで埋める。
    """
    row = PatientRow(id=new_id, **_empty_legacy_defaults())
    return apply_fhir_to_orm(row, resource)
