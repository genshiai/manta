from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ....db import Base
from ...common.models import utcnow


class OrcaAdapterSetting(Base):
    __tablename__ = "orca_adapter_settings"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    auth_type: Mapped[str] = mapped_column(String(32), default="none")
    username: Mapped[str | None] = mapped_column(String(128), nullable=True)
    password_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    claim_endpoint: Mapped[str] = mapped_column(String(255), default="/api01rv2/claim")
    health_endpoint: Mapped[str] = mapped_column(String(255), default="/api01rv2/systeminfv2")
    mode: Mapped[str] = mapped_column(String(32), default="mock", index=True)
    response_mappings: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class OrcaResponseSample(Base):
    __tablename__ = "orca_response_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    claim_draft_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    status_code: Mapped[int] = mapped_column(Integer, default=200)
    payload: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    normalized: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    created_by: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
