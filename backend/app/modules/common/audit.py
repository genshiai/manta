from __future__ import annotations

from typing import Protocol

from sqlalchemy.orm import Session

from .models import AuditLog


class _PatientRef(Protocol):
    id: str
    name: str


def log_audit(
    db: Session,
    *,
    actor: str,
    action: str,
    scope: str,
    detail: str,
    patient: _PatientRef | None = None,
) -> None:
    db.add(
        AuditLog(
            actor=actor,
            action=action,
            scope=scope,
            detail=detail,
            patient_id=patient.id if patient else None,
            patient_name=patient.name if patient else None,
        )
    )
