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
    response_mappings: list[dict[str, object]] = []
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
    response_mappings: list[dict[str, object]] = []
    note: str | None = None


class OrcaConnectionTestRead(BaseModel):
    ok: bool
    status_code: int | None = None
    url: str | None = None
    message: str
    response_payload: dict[str, object] = {}


class OrcaResponseAnalysisRequest(BaseModel):
    status_code: int = 200
    payload: dict[str, object]
    response_mappings: list[dict[str, object]] | None = None


class OrcaResponseAnalysisRead(BaseModel):
    status_code: int
    normalized: dict[str, object]
    reason_count: int
    mapping_count: int


class OrcaResponseMappingDiffRead(BaseModel):
    baseline: OrcaResponseAnalysisRead
    candidate: OrcaResponseAnalysisRead
    added_reasons: list[dict[str, object]]
    removed_reasons: list[dict[str, object]]
    changed_reasons: list[dict[str, object]]
    summary: dict[str, object]


class OrcaResponseSampleCreateRequest(OrcaResponseAnalysisRequest):
    name: str = "ORCA response sample"
    claim_draft_id: int | None = None


class OrcaResponseSampleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    claim_draft_id: int | None = None
    name: str
    status_code: int
    payload: dict[str, object]
    normalized: dict[str, object]
    created_by: str
    created_at: datetime


class OrcaResponseSampleEventRequest(BaseModel):
    claim_draft_id: int
    title: str = "ORCAレスポンスサンプル解析"
