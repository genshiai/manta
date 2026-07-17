from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import desc, select

from app.db import SessionLocal
from app.main import app
from app.modules.common.models import AuditLog
from app.modules.communication.models import CommunicationMessage


def _login(client: TestClient) -> str:
    response = client.post(
        "/api/auth/login",
        json={"user_id": "dr.tanaka", "password": "manta-demo"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_communication_requires_authentication() -> None:
    with TestClient(app) as client:
        response = client.get("/api/communications/threads")
    assert response.status_code == 401


def test_communication_thread_read_send_and_receipt() -> None:
    marker = f"communication-test-{uuid4()}"
    created_id: int | None = None
    audit_id: int | None = None
    with TestClient(app) as client:
        token = _login(client)
        headers = {"Authorization": f"Bearer {token}"}
        threads_response = client.get("/api/communications/threads", headers=headers)
        assert threads_response.status_code == 200
        patient_thread = next(
            thread for thread in threads_response.json() if thread["kind"] == "patient"
        )

        messages_response = client.get(
            f"/api/communications/threads/{patient_thread['id']}/messages",
            headers=headers,
        )
        assert messages_response.status_code == 200
        assert messages_response.json()

        send_response = client.post(
            f"/api/communications/threads/{patient_thread['id']}/messages",
            headers=headers,
            json={"body": marker},
        )
        assert send_response.status_code == 201
        assert send_response.json()["body"] == marker
        created_id = send_response.json()["id"]
        with SessionLocal() as db:
            audit_id = db.scalar(
                select(AuditLog.id)
                .where(
                    AuditLog.actor == "田中 太郎",
                    AuditLog.action == "院内連絡を送信",
                )
                .order_by(desc(AuditLog.id))
                .limit(1)
            )

        receipt_response = client.post(
            f"/api/communications/threads/{patient_thread['id']}/read",
            headers=headers,
        )
        assert receipt_response.status_code == 200
        assert receipt_response.json()["thread_id"] == patient_thread["id"]

    if created_id is not None:
        with SessionLocal() as db:
            message = db.scalar(
                select(CommunicationMessage).where(CommunicationMessage.id == created_id)
            )
            if message is not None:
                db.delete(message)
            if audit_id is not None:
                audit = db.get(AuditLog, audit_id)
                if audit is not None:
                    db.delete(audit)
            db.commit()
