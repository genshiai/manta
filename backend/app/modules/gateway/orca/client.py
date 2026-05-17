from __future__ import annotations

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...auth.models import User
from ...karte.models import Patient
from ...rececon.models import ClaimDraft, ClaimDraftLine, ClaimReviewIssue, ClaimTransmission
from .models import OrcaAdapterSetting
from .schemas import OrcaAdapterSettingRead, OrcaConnectionTestRead


def orca_setting_to_read(setting: OrcaAdapterSetting) -> OrcaAdapterSettingRead:
    return OrcaAdapterSettingRead(
        id=setting.id,
        is_active=setting.is_active,
        base_url=setting.base_url,
        auth_type=setting.auth_type,
        username=setting.username,
        has_password=bool(setting.password_secret),
        client_id=setting.client_id,
        claim_endpoint=setting.claim_endpoint,
        health_endpoint=setting.health_endpoint,
        mode=setting.mode,
        note=setting.note,
        updated_by=setting.updated_by,
        updated_at=setting.updated_at,
    )


def orca_url(setting: OrcaAdapterSetting, endpoint: str) -> str:
    if not setting.base_url:
        raise ValueError("base_url is required")
    base = setting.base_url.rstrip("/")
    path = endpoint if endpoint.startswith("/") else f"/{endpoint}"
    return f"{base}{path}"


def orca_auth(setting: OrcaAdapterSetting) -> httpx.BasicAuth | None:
    if setting.auth_type != "basic":
        return None
    if not setting.username or not setting.password_secret:
        raise ValueError("basic auth requires username and password")
    return httpx.BasicAuth(setting.username, setting.password_secret)


def normalize_orca_response(status_code: int, payload: dict[str, object]) -> tuple[str, str | None]:
    text = str(payload)
    if status_code >= 400:
        return "error", f"ORCA HTTP {status_code}"
    if any(key in text for key in ["エラー", "ERROR", "Error", "警告"]):
        return "rejected", "ORCA returned warning/error content"
    return "accepted", None


def map_claim_line_to_orca_candidate(line: ClaimDraftLine) -> dict[str, object]:
    return {
        "line_id": line.id,
        "claim_draft_line_id": line.id,
        "line_type": line.line_type,
        "source_type": line.source_type,
        "source_id": line.source_id,
        "label": line.label,
        "receipt_code": line.receipt_code,
        "receipt_name": line.receipt_name,
        "points": line.points,
        "quantity": line.quantity,
        "unit": line.unit,
        "evidence": line.evidence,
        "review_status": line.review_status,
        "code_system": "receipt_computer",
        "sendable": bool(line.receipt_code),
        "unresolved_reason": None if line.receipt_code else "missing_receipt_code",
    }


def build_orca_claim_payload(draft: ClaimDraft, patient: Patient, lines: list[ClaimDraftLine]) -> dict[str, object]:
    mapped_items = [map_claim_line_to_orca_candidate(line) for line in lines]
    sendable_items = [item for item in mapped_items if item["sendable"]]
    unresolved_items = [item for item in mapped_items if not item["sendable"]]
    return {
        "adapter": "orca",
        "mode": "mock",
        "format_version": "manta-orca-claim-candidate-v1",
        "patient": {
            "id": patient.id,
            "name": patient.name,
            "department": patient.department,
        },
        "claim": {
            "draft_id": draft.id,
            "admission_id": draft.admission_id,
            "total_points": draft.total_points,
            "items": mapped_items,
            "orca_receipt_items": sendable_items,
            "unresolved_items": unresolved_items,
            "summary": {
                "line_count": len(mapped_items),
                "sendable_count": len(sendable_items),
                "unresolved_count": len(unresolved_items),
            },
        },
    }


def ensure_orca_code_resolution_issues(db: Session, *, draft: ClaimDraft, lines: list[ClaimDraftLine]) -> None:
    existing_source_ids = set(
        db.scalars(
            select(ClaimReviewIssue.evidence).where(
                ClaimReviewIssue.claim_draft_id == draft.id,
                ClaimReviewIssue.issue_type == "claim_line_unresolved_receipt_code",
            )
        ).all()
    )
    for line in lines:
        if line.receipt_code:
            continue
        evidence = f"{line.line_type} / {line.source_type} / source_id={line.source_id or '-'}"
        if evidence in existing_source_ids:
            continue
        db.add(
            ClaimReviewIssue(
                claim_draft_id=draft.id,
                issue_type="claim_line_unresolved_receipt_code",
                severity="error",
                message=f"{line.label} のレセ電コードが未解決です。",
                evidence=evidence,
            )
        )


def submit_orca_claim(
    db: Session,
    *,
    draft: ClaimDraft,
    patient: Patient,
    current_user: User,
) -> ClaimTransmission:
    lines = db.scalars(
        select(ClaimDraftLine)
        .where(ClaimDraftLine.claim_draft_id == draft.id)
        .order_by(ClaimDraftLine.id)
    ).all()
    ensure_orca_code_resolution_issues(db, draft=draft, lines=lines)
    db.flush()
    open_errors = db.scalars(
        select(ClaimReviewIssue).where(
            ClaimReviewIssue.claim_draft_id == draft.id,
            ClaimReviewIssue.status == "open",
            ClaimReviewIssue.severity == "error",
        )
    ).all()
    payload = build_orca_claim_payload(draft, patient, lines)
    setting = db.get(OrcaAdapterSetting, "default")
    if setting is None:
        setting = OrcaAdapterSetting(id="default", mode="mock", claim_endpoint="/api01rv2/claim")
    payload["orca_setting"] = {
        "mode": setting.mode,
        "base_url": setting.base_url,
        "claim_endpoint": setting.claim_endpoint,
        "auth_type": setting.auth_type,
    }
    if setting.mode == "http" and not setting.base_url:
        return ClaimTransmission(
            claim_draft_id=draft.id,
            adapter="orca",
            status="error",
            request_payload=payload,
            response_payload={"accepted": False, "messages": ["base_url is required for http mode"]},
            error_message="ORCA実接続モードには base_url が必要です。",
            sent_by=current_user.display_name,
        )
    if open_errors:
        response_payload: dict[str, object] = {
            "accepted": False,
            "adapter": "orca",
            "messages": [issue.message for issue in open_errors],
        }
        transmission = ClaimTransmission(
            claim_draft_id=draft.id,
            adapter="orca",
            status="rejected",
            request_payload=payload,
            response_payload=response_payload,
            error_message="未解決のerror issueがあるため送信できません。",
            sent_by=current_user.display_name,
        )
        draft.status = "error"
        return transmission
    if setting.mode == "http":
        try:
            url = orca_url(setting, setting.claim_endpoint)
            with httpx.Client(timeout=15.0, auth=orca_auth(setting)) as client:
                response = client.post(url, json=payload)
            try:
                response_payload: dict[str, object] = response.json()
            except ValueError:
                response_payload = {"raw_text": response.text}
            response_payload.setdefault("_http_status", response.status_code)
            status_value, error_message = normalize_orca_response(response.status_code, response_payload)
            transmission = ClaimTransmission(
                claim_draft_id=draft.id,
                adapter="orca",
                status=status_value,
                request_payload=payload,
                response_payload=response_payload,
                error_message=error_message,
                sent_by=current_user.display_name,
            )
            draft.status = "submitted" if status_value == "accepted" else "error"
            return transmission
        except (httpx.HTTPError, ValueError) as exc:
            return ClaimTransmission(
                claim_draft_id=draft.id,
                adapter="orca",
                status="error",
                request_payload=payload,
                response_payload={"exception": exc.__class__.__name__},
                error_message=str(exc),
                sent_by=current_user.display_name,
            )
    response_payload = {
        "accepted": True,
        "adapter": "orca",
        "receipt_control_number": f"MOCK-{draft.id:08d}",
        "messages": ["mock adapter accepted"],
    }
    transmission = ClaimTransmission(
        claim_draft_id=draft.id,
        adapter="orca",
        status="accepted",
        request_payload=payload,
        response_payload=response_payload,
        sent_by=current_user.display_name,
    )
    draft.status = "submitted"
    return transmission


def test_orca_connection(db: Session) -> OrcaConnectionTestRead:
    setting = db.get(OrcaAdapterSetting, "default")
    if setting is None or setting.mode == "mock":
        return OrcaConnectionTestRead(ok=True, message="mock mode: 実ORCAには接続しません。", response_payload={})
    try:
        url = orca_url(setting, setting.health_endpoint)
        with httpx.Client(timeout=10.0, auth=orca_auth(setting)) as client:
            response = client.post(url, json={"Request_Number": "01"})
        try:
            response_payload: dict[str, object] = response.json()
        except ValueError:
            response_payload = {"raw_text": response.text[:2000]}
        ok = 200 <= response.status_code < 400
        return OrcaConnectionTestRead(
            ok=ok,
            status_code=response.status_code,
            url=url,
            message="ORCA接続に成功しました。" if ok else f"ORCA HTTP {response.status_code}",
            response_payload=response_payload,
        )
    except (httpx.HTTPError, ValueError) as exc:
        return OrcaConnectionTestRead(ok=False, message=str(exc), response_payload={"exception": exc.__class__.__name__})
