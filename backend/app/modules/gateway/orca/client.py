from __future__ import annotations

import httpx
import re
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
        response_mappings=setting.response_mappings or [],
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


def _flatten_orca_messages(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value] if value.strip() else []
    if isinstance(value, dict):
        messages: list[str] = []
        for item in value.values():
            messages.extend(_flatten_orca_messages(item))
        return messages
    if isinstance(value, list):
        messages: list[str] = []
        for item in value:
            messages.extend(_flatten_orca_messages(item))
        return messages
    if isinstance(value, (int, float, bool)):
        return []
    return [str(value)]


_ORCA_MESSAGE_MAPPINGS: list[dict[str, str]] = [
    {"pattern": "査定", "severity": "warning", "reason_code": "assessment", "category": "査定"},
    {"pattern": "返戻", "severity": "warning", "reason_code": "return", "category": "返戻"},
    {"pattern": "病名", "severity": "warning", "reason_code": "diagnosis_requirement", "category": "病名要件"},
    {"pattern": "摘要|コメント", "severity": "warning", "reason_code": "comment_requirement", "category": "摘要要件"},
    {"pattern": "回数|上限", "severity": "warning", "reason_code": "frequency_limit", "category": "回数制限"},
    {"pattern": "併算定|同時算定|算定不可", "severity": "warning", "reason_code": "combination_denied", "category": "併算定不可"},
    {"pattern": "同月", "severity": "warning", "reason_code": "same_month_limit", "category": "同月算定"},
]


def _mapping_value(mapping: dict[str, object], key: str, default: str) -> str:
    value = mapping.get(key)
    return value if isinstance(value, str) and value.strip() else default


def _orca_reason_from_message(message: str, mappings: list[dict[str, object]] | None = None) -> dict[str, str]:
    upper_message = message.upper()
    for mapping in [*(mappings or []), *_ORCA_MESSAGE_MAPPINGS]:
        pattern = mapping.get("pattern")
        if not isinstance(pattern, str) or not pattern.strip():
            continue
        if re.search(pattern, message):
            return {
                "severity": _mapping_value(mapping, "severity", "warning"),
                "reason_code": _mapping_value(mapping, "reason_code", "mapped_orca_response"),
                "category": _mapping_value(mapping, "category", "施設別ORCA応答"),
                "message": message,
            }
    if any(keyword in message for keyword in ["警告"]) or "WARNING" in upper_message:
        severity = "warning"
        reason_code = "return"
    elif any(keyword in message for keyword in ["エラー", "不可", "失敗"]) or "ERROR" in upper_message:
        severity = "error"
        reason_code = "orca_error"
    else:
        severity = "info"
        reason_code = "orca_message"
    return {"severity": severity, "reason_code": reason_code, "message": message}


def normalize_orca_response(
    status_code: int,
    payload: dict[str, object],
    mappings: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    reasons = [_orca_reason_from_message(message, mappings) for message in _flatten_orca_messages(payload)]
    if status_code >= 400:
        reasons.insert(
            0,
            {
                "severity": "error",
                "reason_code": f"http_{status_code}",
                "message": f"ORCA HTTP {status_code}",
            },
        )
    actionable_reasons = [reason for reason in reasons if reason["severity"] in {"warning", "error"}]
    if status_code >= 400 or any(reason["severity"] == "error" for reason in actionable_reasons):
        status_value = "error"
    elif actionable_reasons:
        status_value = "rejected"
    else:
        status_value = "accepted"
    return {
        "status": status_value,
        "accepted": status_value == "accepted",
        "error_message": " / ".join(reason["message"] for reason in actionable_reasons[:5]) or None,
        "reasons": reasons[:20],
        "raw_status_code": status_code,
    }


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
        normalized = {
            "status": "error",
            "accepted": False,
            "error_message": "ORCA実接続モードには base_url が必要です。",
            "reasons": [
                {
                    "severity": "error",
                    "reason_code": "missing_base_url",
                    "message": "base_url is required for http mode",
                }
            ],
            "raw_status_code": None,
        }
        return ClaimTransmission(
            claim_draft_id=draft.id,
            adapter="orca",
            status="error",
            request_payload=payload,
            response_payload={
                "accepted": False,
                "messages": ["base_url is required for http mode"],
                "normalized": normalized,
            },
            error_message="ORCA実接続モードには base_url が必要です。",
            sent_by=current_user.display_name,
        )
    if open_errors:
        normalized = {
            "status": "rejected",
            "accepted": False,
            "error_message": "未解決のerror issueがあるため送信できません。",
            "reasons": [
                {"severity": "error", "reason_code": issue.issue_type, "message": issue.message}
                for issue in open_errors[:20]
            ],
            "raw_status_code": None,
        }
        response_payload: dict[str, object] = {
            "accepted": False,
            "adapter": "orca",
            "messages": [issue.message for issue in open_errors],
            "normalized": normalized,
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
            normalized = normalize_orca_response(response.status_code, response_payload, setting.response_mappings or [])
            response_payload["normalized"] = normalized
            status_value = str(normalized["status"])
            raw_error_message = normalized.get("error_message")
            error_message = str(raw_error_message) if raw_error_message else None
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
            normalized = {
                "status": "error",
                "accepted": False,
                "error_message": str(exc),
                "reasons": [
                    {
                        "severity": "error",
                        "reason_code": exc.__class__.__name__,
                        "message": str(exc),
                    }
                ],
                "raw_status_code": None,
            }
            return ClaimTransmission(
                claim_draft_id=draft.id,
                adapter="orca",
                status="error",
                request_payload=payload,
                response_payload={"exception": exc.__class__.__name__, "normalized": normalized},
                error_message=str(exc),
                sent_by=current_user.display_name,
            )
    normalized = {
        "status": "accepted",
        "accepted": True,
        "error_message": None,
        "reasons": [{"severity": "info", "reason_code": "accepted", "message": "mock adapter accepted"}],
        "raw_status_code": 200,
    }
    response_payload = {
        "accepted": True,
        "adapter": "orca",
        "receipt_control_number": f"MOCK-{draft.id:08d}",
        "messages": ["mock adapter accepted"],
        "normalized": normalized,
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
