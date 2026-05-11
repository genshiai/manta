"""MedicationRequest (Step 4) のテスト。

既存 PrescriptionOrder を壊さず、FHIR 境界で JP Core MedicationRequest に
変換できることを確認する。
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.modules.gateway.fhir.mappers.medication_request import (
    HOT13_SYSTEM,
    YJ_SYSTEM,
    orm_to_fhir,
)
from app.main import app
from app.modules.karte.models import PrescriptionOrder
from app.modules.master_data.models import PrescriptionCatalogMaster


def _make_order() -> PrescriptionOrder:
    row = PrescriptionOrder()
    row.id = 123
    row.patient_id = "P-1"
    row.type = "内服"
    row.days = "28日分"
    row.drug_name = "メトホルミン塩酸塩錠 500mg"
    row.dosage = "1回1錠 1日2回 朝夕食後"
    row.created_at = datetime(2026, 4, 19, 0, 0, tzinfo=timezone.utc)
    return row


def _make_catalog() -> PrescriptionCatalogMaster:
    row = PrescriptionCatalogMaster()
    row.id = "metformin-500"
    row.sort_order = 10
    row.is_active = True
    row.drug_name = "メトホルミン塩酸塩錠 500mg"
    row.category = "内服"
    row.dosage_options = ["1回1錠 1日2回 朝夕食後"]
    row.generic_name = "メトホルミン塩酸塩"
    row.name_kana = "メトホルミンエンサンエンジョウ"
    row.aliases = ["メトホルミン"]
    row.yj_code = "3962002F2027"
    row.hot_code = "1187244010101"
    row.dosage_form = "錠剤"
    row.strength = "500mg"
    row.standard_usage_code = "po-bid-after-meals"
    row.default_days = "28"
    row.pmda_info_url = None
    row.allergy_conflict_label = None
    row.related_problem = "#1 2型糖尿病"
    return row


def _valid_payload(patient_id: str = "0009900040") -> dict:
    return {
        "resourceType": "MedicationRequest",
        "status": "active",
        "intent": "order",
        "medicationCodeableConcept": {
            "text": "FHIRテスト薬 100mg",
        },
        "subject": {"reference": f"Patient/{patient_id}"},
        "authoredOn": "2026-04-19T10:00:00+09:00",
        "dosageInstruction": [
            {
                "sequence": 1,
                "text": "1回1錠 1日1回 朝食後",
                "patientInstruction": "1回1錠 1日1回 朝食後",
            }
        ],
        "dispenseRequest": {
            "expectedSupplyDuration": {
                "value": 14,
                "unit": "days",
                "system": "http://unitsofmeasure.org",
                "code": "d",
            }
        },
    }


def _cleanup_order(order_id: int | str) -> None:
    with SessionLocal() as db:
        row = db.get(PrescriptionOrder, int(order_id))
        if row is not None:
            db.delete(row)
            db.commit()


def test_mapper_emits_hot_yj_and_duration():
    resource = orm_to_fhir(_make_order(), catalog=_make_catalog())
    assert resource.model_dump()["resourceType"] == "MedicationRequest"
    systems = {
        coding.system: coding.code
        for coding in resource.medicationCodeableConcept.coding
    }
    assert systems[HOT13_SYSTEM] == "1187244010101"
    assert systems[YJ_SYSTEM] == "3962002F2027"
    assert resource.subject.reference == "Patient/P-1"
    assert resource.dosageInstruction[0].text == "1回1錠 1日2回 朝夕食後"
    assert resource.dispenseRequest.expectedSupplyDuration.value == 28


def test_search_returns_seeded_prescriptions_for_patient():
    with TestClient(app) as client:
        response = client.get(
            "/fhir/MedicationRequest", params={"patient": "0009900040"}
        )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/fhir+json")
    data = json.loads(response.content)
    assert data["resourceType"] == "Bundle"
    assert data["type"] == "searchset"
    assert data["total"] >= 2
    names = [
        entry["resource"]["medicationCodeableConcept"]["text"]
        for entry in data.get("entry", [])
    ]
    assert "メトホルミン塩酸塩錠 500mg" in names


def test_search_filters_by_yj_code_from_master():
    with TestClient(app) as client:
        response = client.get(
            "/fhir/MedicationRequest",
            params={"patient": "0009900040", "code": "DEMO-YJ-METFORMIN-500"},
        )
    assert response.status_code == 200
    data = json.loads(response.content)
    assert data["total"] >= 1
    for entry in data.get("entry", []):
        assert (
            entry["resource"]["medicationCodeableConcept"]["text"]
            == "メトホルミン塩酸塩錠 500mg"
        )


def test_create_medication_request_returns_201_and_is_readable():
    payload = _valid_payload()
    with TestClient(app) as client:
        create_resp = client.post("/fhir/MedicationRequest", json=payload)
    assert create_resp.status_code == 201
    body = json.loads(create_resp.content)
    new_id = body["id"]
    try:
        assert body["medicationCodeableConcept"]["text"] == "FHIRテスト薬 100mg"
        assert body["dosageInstruction"][0]["text"] == "1回1錠 1日1回 朝食後"
        assert body["dispenseRequest"]["expectedSupplyDuration"]["value"] == 14
        with TestClient(app) as client:
            read_resp = client.get(f"/fhir/MedicationRequest/{new_id}")
        assert read_resp.status_code == 200
        data = json.loads(read_resp.content)
        assert data["subject"]["reference"] == "Patient/0009900040"
    finally:
        _cleanup_order(new_id)


def test_update_medication_request_mutates_dosage_and_days():
    payload = _valid_payload()
    with TestClient(app) as client:
        create_resp = client.post("/fhir/MedicationRequest", json=payload)
    new_id = json.loads(create_resp.content)["id"]
    try:
        updated = {
            **payload,
            "id": new_id,
            "dosageInstruction": [{"sequence": 1, "text": "1回2錠 1日1回 夕食後"}],
            "dispenseRequest": {
                "expectedSupplyDuration": {
                    "value": 21,
                    "unit": "days",
                    "system": "http://unitsofmeasure.org",
                    "code": "d",
                }
            },
        }
        with TestClient(app) as client:
            put_resp = client.put(f"/fhir/MedicationRequest/{new_id}", json=updated)
        assert put_resp.status_code == 200
        data = json.loads(put_resp.content)
        assert data["dosageInstruction"][0]["text"] == "1回2錠 1日1回 夕食後"
        assert data["dispenseRequest"]["expectedSupplyDuration"]["value"] == 21
    finally:
        _cleanup_order(new_id)


def test_create_medication_request_rejects_unknown_patient():
    payload = _valid_payload(patient_id="does-not-exist")
    with TestClient(app) as client:
        response = client.post("/fhir/MedicationRequest", json=payload)
    assert response.status_code == 422
    text = json.dumps(json.loads(response.content), ensure_ascii=False)
    assert "does-not-exist" in text


def test_create_medication_request_rejects_missing_subject():
    payload = _valid_payload()
    payload.pop("subject")
    with TestClient(app) as client:
        response = client.post("/fhir/MedicationRequest", json=payload)
    assert response.status_code in (400, 422)
    text = json.dumps(json.loads(response.content), ensure_ascii=False)
    assert "subject" in text


def test_metadata_declares_medication_request():
    with TestClient(app) as client:
        response = client.get("/fhir/metadata")
    data = json.loads(response.content)
    med = next(
        r for r in data["rest"][0]["resource"] if r["type"] == "MedicationRequest"
    )
    codes = {i["code"] for i in med["interaction"]}
    assert {"read", "create", "update", "search-type"}.issubset(codes)
    params = {p["name"] for p in med.get("searchParam", [])}
    assert {"patient", "subject", "code", "authoredon"}.issubset(params)
