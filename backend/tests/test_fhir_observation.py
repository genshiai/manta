"""Observation (Step 3) のテスト。

docs/FHIR_MIGRATION_PLAN.md §8 Step 3 で導入した以下を検証する。
- mapper: ORM ⇔ FHIR Observation (LOINC coding, valueQuantity, valueString, interpretation)
- JP Core validator: subject / status / code / value[x] 必須
- /fhir/Observation: GET / POST / PUT / 検索 (patient + category + code + date)
- CapabilityStatement に Observation が載ること
- seed backfill された vitals / lab_results が読めること
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import SessionLocal
from app.modules.gateway.fhir.loinc import LOINC_SYSTEM
from app.modules.gateway.fhir.mappers.observation import (
    apply_fhir_to_orm,
    fhir_to_orm_create,
    orm_to_fhir,
)
from app.main import app
from app.modules.karte.models import Observation


def _make_observation_row(
    *,
    observation_id: str = "obs-1",
    patient_id: str = "P-1",
    category: str = "laboratory",
    code: str | None = "4548-4",
    code_display: str | None = "HbA1c",
    code_text: str | None = "HbA1c",
    value_num: Decimal | None = Decimal("7.2"),
    value_unit: str | None = "%",
    value_string: str | None = None,
    interpretation: str | None = "H",
    reference_range: str | None = "4.6〜6.2%",
) -> Observation:
    row = Observation()
    row.id = observation_id
    row.patient_id = patient_id
    row.status = "final"
    row.category = category
    row.code_system = LOINC_SYSTEM if code else None
    row.code = code
    row.code_display = code_display
    row.code_text = code_text
    row.value_quantity_value = value_num
    row.value_quantity_unit = value_unit
    row.value_quantity_system = None
    row.value_quantity_code = None
    row.value_string = value_string
    row.interpretation_code = interpretation
    row.reference_range_text = reference_range
    row.effective_datetime = datetime(2026, 4, 13, 0, 0, 0, tzinfo=timezone.utc)
    row.issued_datetime = datetime(2026, 4, 13, 0, 0, 0, tzinfo=timezone.utc)
    row.note = None
    return row


def test_mapper_emits_loinc_and_value_quantity():
    row = _make_observation_row()
    resource = orm_to_fhir(row)
    assert resource.status == "final"
    assert resource.category[0].coding[0].code == "laboratory"
    assert resource.code.coding[0].system == LOINC_SYSTEM
    assert resource.code.coding[0].code == "4548-4"
    assert resource.subject.reference == "Patient/P-1"
    assert resource.valueQuantity is not None
    assert resource.valueQuantity.value == Decimal("7.2")
    assert resource.valueQuantity.unit == "%"
    assert resource.interpretation[0].coding[0].code == "H"
    assert resource.referenceRange[0].text == "4.6〜6.2%"
    assert resource.effectiveDateTime is not None


def test_mapper_uses_value_string_for_blood_pressure_like_values():
    row = _make_observation_row(
        category="vital-signs",
        code=None,
        code_display=None,
        code_text="血圧",
        value_num=None,
        value_unit=None,
        value_string="132 / 78",
        interpretation=None,
        reference_range=None,
    )
    resource = orm_to_fhir(row)
    assert resource.valueQuantity is None
    assert resource.valueString == "132 / 78"


def test_mapper_round_trip_preserves_quantity():
    row = _make_observation_row()
    resource = orm_to_fhir(row)
    new_row = fhir_to_orm_create(resource, new_id="new-obs")
    assert new_row.code == "4548-4"
    assert new_row.value_quantity_value == Decimal("7.2")
    assert new_row.value_quantity_unit == "%"
    assert new_row.interpretation_code == "H"
    assert new_row.reference_range_text == "4.6〜6.2%"


def _cleanup_observation(observation_id: str) -> None:
    with SessionLocal() as db:
        row = db.get(Observation, observation_id)
        if row is not None:
            db.delete(row)
            db.commit()


def _valid_observation_payload(patient_id: str = "0009900040") -> dict:
    return {
        "resourceType": "Observation",
        "status": "final",
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                        "code": "laboratory",
                    }
                ]
            }
        ],
        "code": {
            "coding": [
                {"system": "http://loinc.org", "code": "4548-4", "display": "HbA1c"}
            ],
            "text": "HbA1c",
        },
        "subject": {"reference": f"Patient/{patient_id}"},
        "effectiveDateTime": "2026-04-19T10:00:00+09:00",
        "valueQuantity": {"value": 7.0, "unit": "%"},
    }


def test_search_returns_seeded_vitals_and_labs():
    with TestClient(app) as client:
        response = client.get(
            "/fhir/Observation", params={"patient": "0009900040"}
        )
    assert response.status_code == 200
    data = json.loads(response.content)
    assert data["resourceType"] == "Bundle"
    assert data["type"] == "searchset"
    assert data["total"] >= 1


def test_search_by_category_vital_signs_returns_only_vitals():
    with TestClient(app) as client:
        response = client.get(
            "/fhir/Observation",
            params={"patient": "0009900040", "category": "vital-signs"},
        )
    data = json.loads(response.content)
    assert data["total"] >= 1
    for entry in data.get("entry", []):
        assert (
            entry["resource"]["category"][0]["coding"][0]["code"] == "vital-signs"
        )


def test_search_by_loinc_code_filters_to_single_analyte():
    with TestClient(app) as client:
        response = client.get(
            "/fhir/Observation",
            params={"patient": "0009900040", "code": "4548-4"},
        )
    data = json.loads(response.content)
    for entry in data.get("entry", []):
        codings = entry["resource"]["code"]["coding"]
        assert any(c["code"] == "4548-4" for c in codings)


def test_search_by_system_pipe_code_accepted():
    with TestClient(app) as client:
        response = client.get(
            "/fhir/Observation",
            params={"patient": "0009900040", "code": "http://loinc.org|4548-4"},
        )
    assert response.status_code == 200


def test_search_by_date_range_filters_out_of_window_entries():
    with TestClient(app) as client:
        response = client.get(
            "/fhir/Observation",
            params=[
                ("patient", "0009900040"),
                ("date", "ge2026-04-01"),
                ("date", "le2026-04-30"),
            ],
        )
    assert response.status_code == 200
    data = json.loads(response.content)
    for entry in data.get("entry", []):
        effective = entry["resource"].get("effectiveDateTime")
        if effective:
            parsed = datetime.fromisoformat(effective.replace("Z", "+00:00"))
            assert date(2026, 4, 1) <= parsed.date() <= date(2026, 4, 30)


def test_create_observation_returns_201():
    payload = _valid_observation_payload()
    with TestClient(app) as client:
        resp = client.post("/fhir/Observation", json=payload)
    assert resp.status_code == 201
    body = json.loads(resp.content)
    new_id = body["id"]
    try:
        with TestClient(app) as client:
            read_resp = client.get(f"/fhir/Observation/{new_id}")
        data = json.loads(read_resp.content)
        assert data["valueQuantity"]["value"] == 7.0
        assert data["code"]["coding"][0]["code"] == "4548-4"
    finally:
        _cleanup_observation(new_id)


def test_create_observation_rejects_unknown_patient():
    payload = _valid_observation_payload(patient_id="does-not-exist")
    with TestClient(app) as client:
        resp = client.post("/fhir/Observation", json=payload)
    assert resp.status_code == 422


def test_create_observation_rejects_missing_value():
    payload = _valid_observation_payload()
    payload.pop("valueQuantity")
    with TestClient(app) as client:
        resp = client.post("/fhir/Observation", json=payload)
    assert resp.status_code == 422
    text = json.dumps(json.loads(resp.content), ensure_ascii=False)
    assert "value" in text.lower() or "dataAbsentReason" in text


def test_update_observation_mutates_value():
    payload = _valid_observation_payload()
    with TestClient(app) as client:
        create_resp = client.post("/fhir/Observation", json=payload)
    new_id = json.loads(create_resp.content)["id"]
    try:
        updated = {
            **payload,
            "id": new_id,
            "valueQuantity": {"value": 6.8, "unit": "%"},
        }
        with TestClient(app) as client:
            put_resp = client.put(f"/fhir/Observation/{new_id}", json=updated)
        assert put_resp.status_code == 200
        data = json.loads(put_resp.content)
        assert data["valueQuantity"]["value"] == 6.8
    finally:
        _cleanup_observation(new_id)


def test_read_observation_returns_404_for_unknown_id():
    with TestClient(app) as client:
        resp = client.get("/fhir/Observation/does-not-exist")
    assert resp.status_code == 404


def test_metadata_declares_observation_interactions_and_search_params():
    with TestClient(app) as client:
        response = client.get("/fhir/metadata")
    data = json.loads(response.content)
    obs = next(r for r in data["rest"][0]["resource"] if r["type"] == "Observation")
    codes = {i["code"] for i in obs["interaction"]}
    assert {"read", "create", "update", "search-type"}.issubset(codes)
    params = {p["name"] for p in obs.get("searchParam", [])}
    assert {"patient", "subject", "category", "code", "date"}.issubset(params)
