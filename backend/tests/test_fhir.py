"""FHIR 変換層 (Step 0 + Step 1) のテスト。

docs/FHIR_MIGRATION_PLAN.md §8 で導入した以下を検証する。
- Step 0: GET /fhir/metadata / GET /fhir/Patient/{id} / mapper ユニット
- Step 1: 新カラム優先の読み取り / POST / PUT / JP Core バリデータ
"""

from __future__ import annotations

import json
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import SessionLocal
from app.modules.gateway.fhir.mappers.patient import orm_to_fhir
from app.main import app
from app.modules.karte.models import Patient


def _make_patient(
    *,
    patient_id: str = "P-1",
    name: str = "鈴木 花子",
    kana: str = "スズキ ハナコ",
    sex: str = "女性",
    demographics: list[dict[str, str]] | None = None,
    family_name: str | None = None,
    given_name: str | None = None,
    family_name_kana: str | None = None,
    given_name_kana: str | None = None,
    gender: str | None = None,
    birth_date: date | None = None,
    identifier_json: list[dict[str, str]] | None = None,
) -> Patient:
    # SQLAlchemy モデルをメモリ上で組み立てるだけ (DB セッションは使わない)。
    row = Patient()
    row.id = patient_id
    row.name = name
    row.kana = kana
    row.age = "68歳"
    row.sex = sex
    row.family_name = family_name
    row.given_name = given_name
    row.family_name_kana = family_name_kana
    row.given_name_kana = given_name_kana
    row.gender = gender
    row.birth_date = birth_date
    row.identifier_json = identifier_json
    row.department = "内科"
    row.doctor = "田中 太郎"
    row.reception_number = "1"
    row.reservation_time = "10:00"
    row.reception_time = "09:42"
    row.status = "診察中"
    row.elapsed = "0分"
    row.lab_progress = "-"
    row.same_name_duplicate_count = 0
    row.comment = ""
    row.demographics = demographics if demographics is not None else [
        {"label": "生年月日", "value": "1958/03/15 (68歳)"},
    ]
    row.alerts = []
    row.profile_items = []
    row.problems = []
    row.visit_history = []
    row.vitals = []
    row.lab_results = []
    row.chart_history = []
    row.imaging_orders = []
    row.procedure_orders = []
    return row


def test_mapper_splits_kanji_name_on_space():
    row = _make_patient(name="鈴木 花子")
    resource = orm_to_fhir(row)
    official = next(n for n in resource.name if n.use == "official")
    assert official.family == "鈴木"
    assert official.given == ["花子"]


def test_mapper_splits_kana_name_with_use_usual():
    row = _make_patient(kana="スズキ\u3000ハナコ")  # full-width space
    resource = orm_to_fhir(row)
    usual = next(n for n in resource.name if n.use == "usual")
    assert usual.family == "スズキ"
    assert usual.given == ["ハナコ"]


def test_mapper_maps_japanese_gender_to_fhir_code():
    assert orm_to_fhir(_make_patient(sex="女性")).gender == "female"
    assert orm_to_fhir(_make_patient(sex="男性")).gender == "male"
    assert orm_to_fhir(_make_patient(sex="不詳")).gender == "unknown"


def test_mapper_extracts_birth_date_from_demographics():
    row = _make_patient(
        demographics=[{"label": "生年月日", "value": "1958/03/15 (68歳)"}],
    )
    resource = orm_to_fhir(row)
    assert resource.birthDate == date(1958, 3, 15)


def test_mapper_omits_birth_date_when_missing():
    row = _make_patient(demographics=[{"label": "血液型", "value": "A型"}])
    resource = orm_to_fhir(row)
    assert resource.birthDate is None


def test_mapper_emits_hospital_mrn_identifier():
    row = _make_patient(patient_id="0009900040")
    resource = orm_to_fhir(row)
    assert any(i.value == "0009900040" for i in resource.identifier)


def test_metadata_endpoint_returns_capability_statement():
    with TestClient(app) as client:
        response = client.get("/fhir/metadata")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/fhir+json")
    data = json.loads(response.content)
    assert data["resourceType"] == "CapabilityStatement"
    assert data["fhirVersion"] == "4.0.1"
    assert data["rest"][0]["mode"] == "server"
    patient_resource = next(
        r for r in data["rest"][0]["resource"] if r["type"] == "Patient"
    )
    assert {"code": "read"} in patient_resource["interaction"]


def test_read_patient_endpoint_returns_seeded_patient():
    with TestClient(app) as client:
        response = client.get("/fhir/Patient/0009900040")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/fhir+json")
    data = json.loads(response.content)
    assert data["resourceType"] == "Patient"
    assert data["id"] == "0009900040"
    assert data["gender"] == "female"
    assert data["birthDate"] == "1958-03-15"
    names = {n["use"]: n for n in data["name"]}
    assert names["official"]["family"] == "鈴木"
    assert names["official"]["given"] == ["花子"]
    assert names["usual"]["family"] == "スズキ"
    assert names["usual"]["given"] == ["ハナコ"]


def test_read_patient_endpoint_returns_404_for_unknown_id():
    with TestClient(app) as client:
        response = client.get("/fhir/Patient/does-not-exist")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Step 1: 新カラム優先 / POST / PUT / JP Core バリデータ
# ---------------------------------------------------------------------------


def test_mapper_prefers_new_columns_over_legacy_name():
    row = _make_patient(
        name="山田 太郎",          # legacy は山田
        kana="ヤマダ タロウ",
        family_name="佐藤",         # 新カラムは佐藤
        given_name="次郎",
        family_name_kana="サトウ",
        given_name_kana="ジロウ",
        gender="male",
        birth_date=date(1990, 6, 1),
    )
    resource = orm_to_fhir(row)
    official = next(n for n in resource.name if n.use == "official")
    assert official.family == "佐藤"
    assert official.given == ["次郎"]
    usual = next(n for n in resource.name if n.use == "usual")
    assert usual.family == "サトウ"
    assert resource.gender == "male"
    assert resource.birthDate == date(1990, 6, 1)


def test_mapper_emits_identifier_json_when_present():
    row = _make_patient(
        identifier_json=[
            {
                "system": "http://jpfhir.jp/fhir/core/IdSystem/insurance-card-number",
                "value": "11111111",
            },
            {"system": "urn:manta:demo:hospital-mrn", "value": "P-777"},
        ],
    )
    resource = orm_to_fhir(row)
    systems = [i.system for i in resource.identifier]
    assert "http://jpfhir.jp/fhir/core/IdSystem/insurance-card-number" in systems
    assert any(i.value == "P-777" for i in resource.identifier)


def _cleanup_patient(patient_id: str) -> None:
    with SessionLocal() as db:
        row = db.get(Patient, patient_id)
        if row is not None:
            db.delete(row)
            db.commit()


def _valid_patient_payload() -> dict:
    return {
        "resourceType": "Patient",
        "identifier": [
            {"system": "urn:manta:demo:hospital-mrn", "value": "dummy"},
        ],
        "name": [
            {"use": "official", "family": "高橋", "given": ["一郎"]},
            {"use": "usual", "family": "タカハシ", "given": ["イチロウ"]},
        ],
        "gender": "male",
        "birthDate": "1975-04-10",
    }


def test_create_patient_returns_201_and_round_trips():
    payload = _valid_patient_payload()
    with TestClient(app) as client:
        response = client.post("/fhir/Patient", json=payload)
    assert response.status_code == 201
    assert response.headers["content-type"].startswith("application/fhir+json")
    data = json.loads(response.content)
    assert data["resourceType"] == "Patient"
    new_id = data["id"]
    try:
        assert data["gender"] == "male"
        assert data["birthDate"] == "1975-04-10"
        names = {n["use"]: n for n in data["name"]}
        assert names["official"]["family"] == "高橋"
        assert names["official"]["given"] == ["一郎"]
        assert names["usual"]["family"] == "タカハシ"
        # DB に新カラム + legacy 同期されていること
        with SessionLocal() as db:
            row = db.get(Patient, new_id)
            assert row is not None
            assert row.family_name == "高橋"
            assert row.given_name == "一郎"
            assert row.gender == "male"
            assert row.birth_date == date(1975, 4, 10)
            assert row.name == "高橋 一郎"
            assert row.sex == "男性"
    finally:
        _cleanup_patient(new_id)


def test_create_patient_rejects_missing_official_name():
    payload = _valid_patient_payload()
    payload["name"] = [{"use": "usual", "family": "タカハシ"}]
    with TestClient(app) as client:
        response = client.post("/fhir/Patient", json=payload)
    assert response.status_code == 422
    body = json.loads(response.content)
    text = json.dumps(body, ensure_ascii=False)
    assert "official" in text


def test_create_patient_rejects_missing_identifier_system():
    payload = _valid_patient_payload()
    payload["identifier"] = [{"value": "123"}]
    with TestClient(app) as client:
        response = client.post("/fhir/Patient", json=payload)
    assert response.status_code == 422
    body = json.loads(response.content)
    text = json.dumps(body, ensure_ascii=False)
    assert "identifier" in text


def test_create_patient_rejects_non_fhir_payload():
    with TestClient(app) as client:
        response = client.post("/fhir/Patient", json={"foo": "bar"})
    # resourceType 欠落 → fhir.resources 側の構造検証で 400
    assert response.status_code == 400


def test_update_patient_mutates_and_syncs_legacy():
    create_payload = _valid_patient_payload()
    with TestClient(app) as client:
        create_resp = client.post("/fhir/Patient", json=create_payload)
    assert create_resp.status_code == 201
    new_id = json.loads(create_resp.content)["id"]

    try:
        updated = {
            "resourceType": "Patient",
            "id": new_id,
            "identifier": [{"system": "urn:manta:demo:hospital-mrn", "value": new_id}],
            "name": [
                {"use": "official", "family": "高橋", "given": ["一朗"]},  # 名を変更
                {"use": "usual", "family": "タカハシ", "given": ["イチロウ"]},
            ],
            "gender": "male",
            "birthDate": "1975-04-10",
        }
        with TestClient(app) as client:
            put_resp = client.put(f"/fhir/Patient/{new_id}", json=updated)
        assert put_resp.status_code == 200
        body = json.loads(put_resp.content)
        assert body["name"][0]["given"] == ["一朗"]

        with SessionLocal() as db:
            row = db.get(Patient, new_id)
            assert row.given_name == "一朗"
            assert row.name == "高橋 一朗"
    finally:
        _cleanup_patient(new_id)


def test_update_patient_rejects_id_mismatch():
    create_payload = _valid_patient_payload()
    with TestClient(app) as client:
        create_resp = client.post("/fhir/Patient", json=create_payload)
    new_id = json.loads(create_resp.content)["id"]
    try:
        mismatched = {**create_payload, "id": "someone-else"}
        with TestClient(app) as client:
            resp = client.put(f"/fhir/Patient/{new_id}", json=mismatched)
        assert resp.status_code == 400
    finally:
        _cleanup_patient(new_id)


def test_update_patient_returns_404_for_unknown_id():
    payload = {**_valid_patient_payload(), "id": "does-not-exist"}
    with TestClient(app) as client:
        resp = client.put("/fhir/Patient/does-not-exist", json=payload)
    assert resp.status_code == 404


def test_metadata_lists_create_and_update_interactions():
    with TestClient(app) as client:
        response = client.get("/fhir/metadata")
    data = json.loads(response.content)
    patient_resource = next(
        r for r in data["rest"][0]["resource"] if r["type"] == "Patient"
    )
    codes = {interaction["code"] for interaction in patient_resource["interaction"]}
    assert {"read", "create", "update"}.issubset(codes)
