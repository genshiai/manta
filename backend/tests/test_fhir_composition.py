"""Composition (SOAP note read adapter) のテスト。"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.modules.gateway.fhir.mappers.composition import orm_to_fhir
from app.main import app
from app.models import ChartNote


def _make_note() -> ChartNote:
    row = ChartNote()
    row.id = 123
    row.patient_id = "P-1"
    row.subjective = "咳嗽あり。"
    row.objective = "SpO2 98%。"
    row.assessment = "感冒後咳嗽。"
    row.plan = "鎮咳薬を処方。"
    row.version = 2
    row.saved_by = "田中 太郎"
    row.saved_at = datetime(2026, 4, 20, 0, 0, tzinfo=timezone.utc)
    return row


def _cleanup_note(note_id: int | str) -> None:
    with SessionLocal() as db:
        row = db.get(ChartNote, int(note_id))
        if row is not None:
            db.delete(row)
            db.commit()


def test_mapper_emits_soap_sections():
    resource = orm_to_fhir(_make_note())

    assert resource.model_dump()["resourceType"] == "Composition"
    assert resource.status == "final"
    assert resource.type.coding[0].code == "11506-3"
    assert resource.subject.reference == "Patient/P-1"
    assert resource.title == "SOAP v2"
    assert [section.title for section in resource.section] == ["S", "O", "A", "P"]
    assert "咳嗽あり" in resource.section[0].text.div


def test_search_returns_seeded_compositions_for_patient():
    with TestClient(app) as client:
        response = client.get("/fhir/Composition", params={"patient": "0009900040"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/fhir+json")
    data = json.loads(response.content)
    assert data["resourceType"] == "Bundle"
    assert data["type"] == "searchset"
    assert data["total"] >= 1
    first = data["entry"][0]["resource"]
    assert first["resourceType"] == "Composition"
    assert first["subject"]["reference"] == "Patient/0009900040"
    assert {section["title"] for section in first["section"]} == {"S", "O", "A", "P"}


def test_read_seeded_composition_by_id():
    with TestClient(app) as client:
        search_response = client.get("/fhir/Composition", params={"patient": "0009900040"})
    first = json.loads(search_response.content)["entry"][0]["resource"]

    with TestClient(app) as client:
        read_response = client.get(f"/fhir/Composition/{first['id']}")

    assert read_response.status_code == 200
    data = json.loads(read_response.content)
    assert data["resourceType"] == "Composition"
    assert data["id"] == first["id"]


def test_search_by_date_filters_compositions():
    with SessionLocal() as db:
        note = ChartNote(
            patient_id="0009900041",
            subjective="FHIR date test",
            objective="O",
            assessment="A",
            plan="P",
            version=99,
            saved_by="田中 太郎",
            saved_at=datetime(2026, 4, 20, 9, 0, tzinfo=timezone.utc),
        )
        db.add(note)
        db.commit()
        db.refresh(note)
        note_id = note.id

    try:
        with TestClient(app) as client:
            response = client.get(
                "/fhir/Composition",
                params={"patient": "0009900041", "date": "eq2026-04-20"},
            )

        assert response.status_code == 200
        data = json.loads(response.content)
        ids = {entry["resource"]["id"] for entry in data.get("entry", [])}
        assert str(note_id) in ids
    finally:
        _cleanup_note(note_id)


def test_capability_statement_includes_composition():
    with TestClient(app) as client:
        response = client.get("/fhir/metadata")

    assert response.status_code == 200
    data = json.loads(response.content)
    resource_types = {resource["type"] for resource in data["rest"][0]["resource"]}
    assert "Composition" in resource_types
