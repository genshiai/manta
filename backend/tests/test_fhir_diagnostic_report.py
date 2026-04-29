"""DiagnosticReport (lab result report adapter) のテスト。"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.fhir.mappers.diagnostic_report import build_diagnostic_report, diagnostic_report_id
from app.main import app
from app.models import Patient


def _make_patient() -> Patient:
    row = Patient()
    row.id = "P-1"
    row.name = "山田 太郎"
    row.lab_results = [
        {
            "item": "HbA1c",
            "result": "7.2%",
            "baseline": "4.6〜6.2%",
            "previous": "7.5%",
            "flag": "high",
            "reported_at": "2026/04/21",
        },
        {
            "item": "空腹時血糖",
            "result": "138 mg/dL",
            "baseline": "70〜110 mg/dL",
            "previous": "145 mg/dL",
            "flag": "high",
            "reported_at": "2026/04/21",
        },
    ]
    return row


def test_mapper_emits_lab_report_and_observation_refs():
    patient = _make_patient()
    resource = build_diagnostic_report(
        patient=patient,
        reported_at="2026/04/21",
        items=patient.lab_results,
        observation_refs_by_item={"HbA1c": "obs-1", "空腹時血糖": "obs-2"},
    )

    assert resource.model_dump()["resourceType"] == "DiagnosticReport"
    assert resource.id == diagnostic_report_id("P-1", "2026/04/21")
    assert resource.status == "final"
    assert resource.category[0].text == "laboratory"
    assert resource.code.coding[0].code == "11502-2"
    assert resource.subject.reference == "Patient/P-1"
    assert [item.reference for item in resource.result] == ["Observation/obs-1", "Observation/obs-2"]
    assert "要フォロー" in resource.conclusion


def test_search_returns_seeded_diagnostic_report_for_patient():
    with TestClient(app) as client:
        response = client.get("/fhir/DiagnosticReport", params={"patient": "0009900040"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/fhir+json")
    data = json.loads(response.content)
    assert data["resourceType"] == "Bundle"
    assert data["type"] == "searchset"
    assert data["total"] >= 1
    first = data["entry"][0]["resource"]
    assert first["resourceType"] == "DiagnosticReport"
    assert first["subject"]["reference"] == "Patient/0009900040"
    assert first["code"]["coding"][0]["code"] == "11502-2"


def test_read_seeded_diagnostic_report_by_id():
    with TestClient(app) as client:
        search_response = client.get("/fhir/DiagnosticReport", params={"patient": "0009900040"})
    first = json.loads(search_response.content)["entry"][0]["resource"]

    with TestClient(app) as client:
        read_response = client.get(f"/fhir/DiagnosticReport/{first['id']}")

    assert read_response.status_code == 200
    data = json.loads(read_response.content)
    assert data["resourceType"] == "DiagnosticReport"
    assert data["id"] == first["id"]


def test_search_by_date_and_code_filters_reports():
    with TestClient(app) as client:
        response = client.get(
            "/fhir/DiagnosticReport",
            params={
                "patient": "0009900040",
                "date": "eq2026-04-13",
                "code": "11502-2",
            },
        )

    assert response.status_code == 200
    data = json.loads(response.content)
    assert data["total"] >= 1
    for entry in data.get("entry", []):
        resource = entry["resource"]
        assert resource["effectiveDateTime"].startswith("2026-04-13")
        assert resource["code"]["coding"][0]["code"] == "11502-2"


def test_capability_statement_includes_diagnostic_report():
    with TestClient(app) as client:
        response = client.get("/fhir/metadata")

    assert response.status_code == 200
    data = json.loads(response.content)
    resource_types = {resource["type"] for resource in data["rest"][0]["resource"]}
    assert "DiagnosticReport" in resource_types
