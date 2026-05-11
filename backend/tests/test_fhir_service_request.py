"""ServiceRequest (orders read adapter) のテスト。"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.modules.gateway.fhir.mappers.service_request import lab_order_to_fhir, patient_json_orders_to_fhir
from app.main import app
from app.modules.karte.models import LabOrder, Patient


def _make_lab_order() -> LabOrder:
    row = LabOrder()
    row.id = 123
    row.patient_id = "P-1"
    row.category = "血液検査"
    row.status = "pending"
    row.urgency = "至急"
    row.items = ["HbA1c", "血糖"]
    row.created_at = datetime(2026, 4, 21, 0, 0, tzinfo=timezone.utc)
    return row


def _make_patient() -> Patient:
    row = Patient()
    row.id = "P-1"
    row.name = "山田 太郎"
    row.doctor = "田中 太郎"
    row.imaging_orders = [
        {
            "category": "胸部X線",
            "status": "scheduled",
            "scheduled_at": "2026/04/21 11:20",
            "note": "慢性咳嗽フォロー。",
        }
    ]
    row.procedure_orders = [
        {
            "title": "生活指導",
            "status": "done",
            "note": "食事療法を説明。",
        }
    ]
    return row


def _cleanup_lab_order(order_id: int | str) -> None:
    with SessionLocal() as db:
        row = db.get(LabOrder, int(order_id))
        if row is not None:
            db.delete(row)
            db.commit()


def test_lab_order_mapper_emits_service_request():
    resource = lab_order_to_fhir(_make_lab_order())

    assert resource.model_dump()["resourceType"] == "ServiceRequest"
    assert resource.id == "lab-123"
    assert resource.status == "active"
    assert resource.intent == "order"
    assert resource.priority == "urgent"
    assert resource.category[0].text == "laboratory"
    assert resource.code.text == "血液検査"
    assert [item.text for item in resource.orderDetail] == ["HbA1c", "血糖"]
    assert resource.subject.reference == "Patient/P-1"


def test_patient_json_orders_mapper_emits_imaging_and_procedure():
    resources = patient_json_orders_to_fhir(_make_patient())

    assert [resource.category[0].text for resource in resources] == ["imaging", "procedure"]
    assert resources[0].status == "active"
    assert resources[0].code.text == "胸部X線"
    assert resources[0].occurrenceDateTime.isoformat().startswith("2026-04-21T11:20:00")
    assert resources[1].status == "completed"
    assert resources[1].code.text == "生活指導"


def test_search_returns_seeded_orders_for_patient():
    with TestClient(app) as client:
        response = client.get("/fhir/ServiceRequest", params={"patient": "0009900040"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/fhir+json")
    data = json.loads(response.content)
    assert data["resourceType"] == "Bundle"
    assert data["type"] == "searchset"
    assert data["total"] >= 5
    categories = {entry["resource"]["category"][0]["text"] for entry in data.get("entry", [])}
    assert {"laboratory", "imaging", "procedure"}.issubset(categories)


def test_read_seeded_service_request_by_id():
    with TestClient(app) as client:
        search_response = client.get(
            "/fhir/ServiceRequest",
            params={"patient": "0009900040", "category": "laboratory"},
        )
    first = json.loads(search_response.content)["entry"][0]["resource"]

    with TestClient(app) as client:
        read_response = client.get(f"/fhir/ServiceRequest/{first['id']}")

    assert read_response.status_code == 200
    data = json.loads(read_response.content)
    assert data["resourceType"] == "ServiceRequest"
    assert data["id"] == first["id"]


def test_search_by_category_code_and_authored_filters_lab_orders():
    with SessionLocal() as db:
        order = LabOrder(
            patient_id="0009900041",
            category="FHIR検査",
            status="pending",
            urgency="通常",
            items=["FHIR-A"],
            created_at=datetime(2026, 4, 20, 9, 0, tzinfo=timezone.utc),
        )
        db.add(order)
        db.commit()
        db.refresh(order)
        order_id = order.id

    try:
        with TestClient(app) as client:
            response = client.get(
                "/fhir/ServiceRequest",
                params={
                    "patient": "0009900041",
                    "category": "laboratory",
                    "code": "FHIR検査",
                    "authored": "eq2026-04-20",
                },
            )

        assert response.status_code == 200
        data = json.loads(response.content)
        ids = {entry["resource"]["id"] for entry in data.get("entry", [])}
        assert f"lab-{order_id}" in ids
    finally:
        _cleanup_lab_order(order_id)


def test_capability_statement_includes_service_request():
    with TestClient(app) as client:
        response = client.get("/fhir/metadata")

    assert response.status_code == 200
    data = json.loads(response.content)
    resource_types = {resource["type"] for resource in data["rest"][0]["resource"]}
    assert "ServiceRequest" in resource_types
