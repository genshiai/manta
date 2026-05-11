from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from ..auth.schemas import UserRole


class UserCreateRequest(BaseModel):
    user_id: str
    password: str
    display_name: str
    department: str
    role: UserRole
    password_expires_at: date


class UserUpdateRequest(BaseModel):
    display_name: str
    department: str
    role: UserRole
    password_expires_at: date


class UserPasswordResetRequest(BaseModel):
    password: str
