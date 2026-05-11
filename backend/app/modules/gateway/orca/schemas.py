from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class OrcaAdapterSettingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    is_active: bool
    base_url: str | None = None
    auth_type: str
    username: str | None = None
    has_password: bool = False
    client_id: str | None = None
    claim_endpoint: str
    health_endpoint: str
    mode: Literal["mock", "http"]
    note: str | None = None
    updated_by: str | None = None
    updated_at: datetime


class OrcaAdapterSettingUpdateRequest(BaseModel):
    is_active: bool = False
    base_url: str | None = None
    auth_type: Literal["none", "basic", "client"] = "none"
    username: str | None = None
    password: str | None = None
    client_id: str | None = None
    claim_endpoint: str = "/api01rv2/claim"
    health_endpoint: str = "/api01rv2/systeminfv2"
    mode: Literal["mock", "http"] = "mock"
    note: str | None = None


class OrcaConnectionTestRead(BaseModel):
    ok: bool
    status_code: int | None = None
    url: str | None = None
    message: str
    response_payload: dict[str, object] = {}
