"""Condition (Step 2) のテスト。

docs/FHIR_MIGRATION_PLAN.md §8 Step 2 で導入した以下を検証する。
- mapper: ORM ⇔ FHIR Condition (ICD10/MEDIS coding, clinicalStatus, subject)
- JP Core validator: subject / clinicalStatus / code 必須
- /fhir/Condition: GET / POST / PUT / 検索 (patient)
- CapabilityStatement に Condition が載ること
- 既存 Patient の seed から backfill された Condition が読めること
"""

from __future__ import annotations

import json
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import SessionLocal
from app.fhir.mappers.condition import (
    ICD10_SYSTEM,
    MEDIS_MANAGEMENT_SYSTEM,
    apply_fhir_to_orm,
    fhir_to_orm_create,
    orm_to_fhir,
)
from app.main import app
from app.models import Condition


def _make_condition_row(
    *,
    condition_id: str = "cond-1",
    patient_id: str = "P-1",
    clinical_status: str = "active",
    icd10_code: str | None = "E11",
    management_number: str | None = "DEMO000000000001",
    disease_name: str = "2型糖尿病",
    onset_text: str | None = "2018/05 〜",
) -> Condition:
    from datetime import datetime, timezone

    row = Condition()
    row.id = condition_id
    row.patient_id = patient_id
    row.clinical_status = clinical_status
    row.verification_status = "confirmed"
    row.category = "problem-list-item"
    row.icd10_code = icd10_code
    row.management_number = management_number
    row.disease_name = disease_name
    row.onset_text = onset_text
    row.onset_date = None
    row.abatement_date = None
    row.recorded_date = datetime(2026, 4, 19, 0, 0, 0, tzinfo=timezone.utc)
    row.note = None
    return row


def test_mapper_emits_icd10_and_medis_codings():
    row = _make_condition_row()
    resource = orm_to_fhir(row)
    assert resource.subject.reference == "Patient/P-1"
    assert resource.clinicalStatus.coding[0].code == "active"
    systems = {c.system: c.code for c in resource.code.coding}
    assert systems[ICD10_SYSTEM] == "E11"
    assert systems[MEDIS_MANAGEMENT_SYSTEM] == "DEMO000000000001"
    assert resource.code.text == "2型糖尿病"
    assert resource.onsetString == "2018/05 〜"


def test_mapper_uses_onset_date_when_available():
    row = _make_condition_row()
    row.onset_date = date(2018, 5, 1)
    row.onset_text = "2018/05 〜"  # 日付優先。text は落ちる
    resource = orm_to_fhir(row)
    assert resource.onsetDateTime is not None
    assert resource.onsetDateTime.date() == date(2018, 5, 1)
    assert resource.onsetString is None


def test_mapper_round_trip_apply_preserves_fields():
    row = _make_condition_row()
    resource = orm_to_fhir(row)
    new_row = fhir_to_orm_create(resource, new_id="new-id")
    assert new_row.patient_id == "P-1"
    assert new_row.clinical_status == "active"
    assert new_row.icd10_code == "E11"
    assert new_row.management_number == "DEMO000000000001"
    assert new_row.disease_name == "2型糖尿病"
    assert new_row.onset_text == "2018/05 〜"


def _cleanup_condition(condition_id: str) -> None:
    with SessionLocal() as db:
        row = db.get(Condition, condition_id)
        if row is not None:
            db.delete(row)
            db.commit()


def _valid_condition_payload(patient_id: str = "0009900040") -> dict:
    return {
        "resourceType": "Condition",
        "subject": {"reference": f"Patient/{patient_id}"},
        "clinicalStatus": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                    "code": "active",
                }
            ]
        },
        "verificationStatus": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                    "code": "confirmed",
                }
            ]
        },
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/condition-category",
                        "code": "problem-list-item",
                    }
                ]
            }
        ],
        "code": {
            "coding": [
                {
                    "system": "http://hl7.org/fhir/sid/icd-10",
                    "code": "J00",
                    "display": "急性鼻咽頭炎",
                }
            ],
            "text": "急性鼻咽頭炎",
        },
        "onsetString": "2026/04/01 〜",
    }


def test_search_returns_backfilled_conditions_for_seeded_patient():
    with TestClient(app) as client:
        response = client.get("/fhir/Condition", params={"patient": "0009900040"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/fhir+json")
    data = json.loads(response.content)
    assert data["resourceType"] == "Bundle"
    assert data["type"] == "searchset"
    assert data["total"] >= 1
    diseases = [
        entry["resource"]["code"].get("text")
        for entry in data.get("entry", [])
        if entry.get("resource", {}).get("resourceType") == "Condition"
    ]
    # backfill は '#1 ' プレフィックスを剥がす
    assert any("2型糖尿病" in (d or "") for d in diseases)


def test_search_accepts_subject_with_patient_prefix():
    with TestClient(app) as client:
        response = client.get(
            "/fhir/Condition", params={"subject": "Patient/0009900040"}
        )
    assert response.status_code == 200


def test_search_requires_patient_or_subject():
    with TestClient(app) as client:
        response = client.get("/fhir/Condition")
    assert response.status_code == 400


def test_create_condition_returns_201_and_is_readable():
    payload = _valid_condition_payload()
    with TestClient(app) as client:
        create_resp = client.post("/fhir/Condition", json=payload)
    assert create_resp.status_code == 201
    body = json.loads(create_resp.content)
    assert body["resourceType"] == "Condition"
    new_id = body["id"]
    try:
        with TestClient(app) as client:
            read_resp = client.get(f"/fhir/Condition/{new_id}")
        assert read_resp.status_code == 200
        data = json.loads(read_resp.content)
        assert data["code"]["text"] == "急性鼻咽頭炎"
        assert data["subject"]["reference"] == "Patient/0009900040"
    finally:
        _cleanup_condition(new_id)


def test_create_condition_rejects_missing_subject():
    payload = _valid_condition_payload()
    payload.pop("subject")
    with TestClient(app) as client:
        response = client.post("/fhir/Condition", json=payload)
    # FHIR Condition.subject は 1..1 required。fhir.resources の構造検証で 400、
    # もしくは JP Core validator 経由で 422。どちらでも受容。
    assert response.status_code in (400, 422)
    text = json.dumps(json.loads(response.content), ensure_ascii=False)
    assert "subject" in text


def test_create_condition_rejects_unknown_patient():
    payload = _valid_condition_payload(patient_id="does-not-exist")
    with TestClient(app) as client:
        response = client.post("/fhir/Condition", json=payload)
    assert response.status_code == 422
    text = json.dumps(json.loads(response.content), ensure_ascii=False)
    assert "does-not-exist" in text


def test_create_condition_rejects_missing_code():
    payload = _valid_condition_payload()
    payload.pop("code")
    with TestClient(app) as client:
        response = client.post("/fhir/Condition", json=payload)
    # code は FHIR スキーマ上 1..1 required なので 400 (pydantic 構造検証)
    assert response.status_code in (400, 422)


def test_update_condition_mutates_status():
    payload = _valid_condition_payload()
    with TestClient(app) as client:
        create_resp = client.post("/fhir/Condition", json=payload)
    new_id = json.loads(create_resp.content)["id"]
    try:
        updated = {
            **payload,
            "id": new_id,
            "clinicalStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                        "code": "resolved",
                    }
                ]
            },
        }
        with TestClient(app) as client:
            put_resp = client.put(f"/fhir/Condition/{new_id}", json=updated)
        assert put_resp.status_code == 200
        data = json.loads(put_resp.content)
        assert data["clinicalStatus"]["coding"][0]["code"] == "resolved"
    finally:
        _cleanup_condition(new_id)


def test_update_condition_rejects_id_mismatch():
    payload = _valid_condition_payload()
    with TestClient(app) as client:
        create_resp = client.post("/fhir/Condition", json=payload)
    new_id = json.loads(create_resp.content)["id"]
    try:
        mismatched = {**payload, "id": "not-me"}
        with TestClient(app) as client:
            resp = client.put(f"/fhir/Condition/{new_id}", json=mismatched)
        assert resp.status_code == 400
    finally:
        _cleanup_condition(new_id)


def test_read_condition_returns_404_for_unknown_id():
    with TestClient(app) as client:
        resp = client.get("/fhir/Condition/does-not-exist")
    assert resp.status_code == 404


def test_metadata_declares_condition_interactions():
    with TestClient(app) as client:
        response = client.get("/fhir/metadata")
    data = json.loads(response.content)
    condition_resource = next(
        r for r in data["rest"][0]["resource"] if r["type"] == "Condition"
    )
    codes = {interaction["code"] for interaction in condition_resource["interaction"]}
    assert {"read", "create", "update", "search-type"}.issubset(codes)
    search_params = {param["name"] for param in condition_resource.get("searchParam", [])}
    assert {"patient", "subject"}.issubset(search_params)
