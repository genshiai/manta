"""Appointment (Step 5) のテスト。"""

from __future__ import annotations

import json
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.modules.gateway.fhir.mappers.appointment import orm_to_fhir
from app.main import app
from app.modules.karte.models import Reservation


TOKYO_TZ = ZoneInfo("Asia/Tokyo")


def _make_reservation() -> Reservation:
    row = Reservation()
    row.id = 123
    row.patient_id = "P-1"
    row.slot_id = "2026-05-11-1000"
    row.scheduled_for = "2026/05/11（月） 10:00"
    row.department = "内科"
    row.doctor = "田中 太郎"
    row.note = "HbA1c・血糖フォロー"
    return row


def _valid_payload(patient_id: str = "0009900041") -> dict:
    return {
        "resourceType": "Appointment",
        "status": "booked",
        "serviceType": [{"text": "内科"}],
        "start": "2026-06-01T09:00:00+09:00",
        "end": "2026-06-01T09:30:00+09:00",
        "minutesDuration": 30,
        "slot": [{"reference": "Slot/2026-06-01-0900"}],
        "comment": "FHIR 経由の再診予約",
        "participant": [
            {
                "actor": {"reference": f"Patient/{patient_id}"},
                "status": "accepted",
            },
            {
                "actor": {"display": "田中 太郎"},
                "status": "accepted",
            },
        ],
    }


def _cleanup_reservation(reservation_id: int | str) -> None:
    with SessionLocal() as db:
        row = db.get(Reservation, int(reservation_id))
        if row is not None:
            db.delete(row)
            db.commit()


def test_mapper_emits_patient_participant_and_start():
    resource = orm_to_fhir(_make_reservation())
    assert resource.model_dump()["resourceType"] == "Appointment"
    assert resource.status == "booked"
    assert resource.start == datetime(2026, 5, 11, 10, 0, tzinfo=TOKYO_TZ)
    assert resource.serviceType[0].text == "内科"
    references = [
        participant.actor.reference
        for participant in resource.participant
        if participant.actor and participant.actor.reference
    ]
    assert "Patient/P-1" in references


def test_search_returns_seeded_reservation_for_patient():
    with TestClient(app) as client:
        response = client.get("/fhir/Appointment", params={"patient": "0009900040"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/fhir+json")
    data = json.loads(response.content)
    assert data["resourceType"] == "Bundle"
    assert data["type"] == "searchset"
    assert data["total"] >= 1
    first = data["entry"][0]["resource"]
    assert first["resourceType"] == "Appointment"
    assert any(
        p["actor"].get("reference") == "Patient/0009900040"
        for p in first["participant"]
    )


def test_search_by_date_filters_appointments():
    with TestClient(app) as client:
        response = client.get(
            "/fhir/Appointment",
            params={"patient": "0009900040", "date": "eq2026-05-11"},
        )
    assert response.status_code == 200
    data = json.loads(response.content)
    assert data["total"] >= 1
    for entry in data.get("entry", []):
        assert entry["resource"]["start"].startswith("2026-05-11")


def test_create_appointment_returns_201_and_is_readable():
    payload = _valid_payload()
    with TestClient(app) as client:
        create_resp = client.post("/fhir/Appointment", json=payload)
    assert create_resp.status_code == 201
    body = json.loads(create_resp.content)
    new_id = body["id"]
    try:
        assert body["start"].startswith("2026-06-01T09:00:00")
        assert body["comment"] == "FHIR 経由の再診予約"
        with TestClient(app) as client:
            read_resp = client.get(f"/fhir/Appointment/{new_id}")
        assert read_resp.status_code == 200
        data = json.loads(read_resp.content)
        assert data["slot"][0]["reference"] == "Slot/2026-06-01-0900"
    finally:
        _cleanup_reservation(new_id)


def test_update_appointment_mutates_start_and_comment():
    payload = _valid_payload()
    with TestClient(app) as client:
        create_resp = client.post("/fhir/Appointment", json=payload)
    new_id = json.loads(create_resp.content)["id"]
    try:
        updated = {
            **payload,
            "id": new_id,
            "start": "2026-06-08T11:30:00+09:00",
            "end": "2026-06-08T12:00:00+09:00",
            "comment": "予約変更",
        }
        with TestClient(app) as client:
            put_resp = client.put(f"/fhir/Appointment/{new_id}", json=updated)
        assert put_resp.status_code == 200
        data = json.loads(put_resp.content)
        assert data["start"].startswith("2026-06-08T11:30:00")
        assert data["comment"] == "予約変更"
    finally:
        _cleanup_reservation(new_id)


def test_create_appointment_rejects_unknown_patient():
    payload = _valid_payload(patient_id="does-not-exist")
    with TestClient(app) as client:
        response = client.post("/fhir/Appointment", json=payload)
    assert response.status_code == 422
    text = json.dumps(json.loads(response.content), ensure_ascii=False)
    assert "does-not-exist" in text


def test_create_appointment_rejects_missing_patient_participant():
    payload = _valid_payload()
    payload["participant"] = [{"actor": {"display": "田中 太郎"}, "status": "accepted"}]
    with TestClient(app) as client:
        response = client.post("/fhir/Appointment", json=payload)
    assert response.status_code == 422
    text = json.dumps(json.loads(response.content), ensure_ascii=False)
    assert "Patient" in text


def test_metadata_declares_appointment():
    with TestClient(app) as client:
        response = client.get("/fhir/metadata")
    data = json.loads(response.content)
    appointment = next(
        r for r in data["rest"][0]["resource"] if r["type"] == "Appointment"
    )
    codes = {i["code"] for i in appointment["interaction"]}
    assert {"read", "create", "update", "search-type"}.issubset(codes)
    params = {p["name"] for p in appointment.get("searchParam", [])}
    assert {"patient", "actor", "date"}.issubset(params)
