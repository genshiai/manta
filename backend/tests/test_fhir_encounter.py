"""Encounter (Phase 1 read adapter) のテスト。"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.fhir.mappers.encounter import encounter_id_for_visit, orm_visit_to_fhir
from app.main import app
from app.models import Patient


def _make_patient() -> Patient:
    row = Patient()
    row.id = "P-1"
    row.name = "山田 太郎"
    row.department = "内科"
    row.doctor = "田中 太郎"
    row.reception_time = "10:15"
    row.visit_history = []
    return row


def test_mapper_emits_ambulatory_encounter():
    patient = _make_patient()
    visit = {
        "date": "2026/04/21",
        "department": "内科",
        "summary": "糖尿病フォロー",
        "active": True,
    }

    resource = orm_visit_to_fhir(patient, visit, 0)

    assert resource.model_dump()["resourceType"] == "Encounter"
    assert resource.id == encounter_id_for_visit(patient, visit, 0)
    assert resource.status == "in-progress"
    assert resource.class_fhir.code == "AMB"
    assert resource.subject.reference == "Patient/P-1"
    assert resource.serviceType.text == "内科"
    assert resource.period.start.isoformat().startswith("2026-04-21T10:15:00")


def test_search_returns_seeded_encounters_for_patient():
    with TestClient(app) as client:
        response = client.get("/fhir/Encounter", params={"patient": "0009900040"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/fhir+json")
    data = json.loads(response.content)
    assert data["resourceType"] == "Bundle"
    assert data["type"] == "searchset"
    assert data["total"] >= 5
    first = data["entry"][0]["resource"]
    assert first["resourceType"] == "Encounter"
    assert first["subject"]["reference"] == "Patient/0009900040"
    assert first["class"]["code"] == "AMB"


def test_read_seeded_encounter_by_stable_id():
    encounter_id = "0009900040-20260413-1"
    with TestClient(app) as client:
        response = client.get(f"/fhir/Encounter/{encounter_id}")

    assert response.status_code == 200
    data = json.loads(response.content)
    assert data["resourceType"] == "Encounter"
    assert data["id"] == encounter_id
    assert data["status"] == "in-progress"


def test_search_by_date_filters_encounters():
    with TestClient(app) as client:
        response = client.get(
            "/fhir/Encounter",
            params={"patient": "0009900040", "date": "eq2026-03-16"},
        )

    assert response.status_code == 200
    data = json.loads(response.content)
    assert data["total"] == 1
    assert data["entry"][0]["resource"]["period"]["start"].startswith("2026-03-16")


def test_capability_statement_includes_encounter():
    with TestClient(app) as client:
        response = client.get("/fhir/metadata")

    assert response.status_code == 200
    data = json.loads(response.content)
    resource_types = {resource["type"] for resource in data["rest"][0]["resource"]}
    assert "Encounter" in resource_types
