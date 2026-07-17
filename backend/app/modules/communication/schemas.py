from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CommunicationThreadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    title: str
    patient_id: str | None = None
    patient_name: str | None = None
    department: str | None = None
    participant_labels: list[str] = Field(default_factory=list)
    unread_count: int = 0
    last_message: str | None = None
    last_message_at: datetime | None = None


class CommunicationMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    thread_id: str
    author_user_id: str | None = None
    author_name: str
    author_role: str
    body: str
    is_system: bool
    created_at: datetime


class CommunicationMessageCreateRequest(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class CommunicationReadReceipt(BaseModel):
    thread_id: str
    read_at: datetime
