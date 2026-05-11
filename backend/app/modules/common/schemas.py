from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    actor: str
    action: str
    scope: str
    detail: str
    patient_id: str | None = None
    patient_name: str | None = None
    created_at: datetime
