from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel


UserRole = Literal["医師", "管理者"]


class UserSessionRead(BaseModel):
    user_id: str
    display_name: str
    department: str
    role: UserRole
    logged_in_at: datetime
    password_expires_at: date


class AuthTokenRead(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserSessionRead


class UserSummaryRead(BaseModel):
    user_id: str
    display_name: str
    department: str
    role: UserRole
    password_expires_at: date


class LoginRequest(BaseModel):
    user_id: str
    password: str
