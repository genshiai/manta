from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ...models import User
from ...schemas import UserSessionRead, UserSummaryRead


def user_to_session(user: User, *, logged_in_at: datetime) -> UserSessionRead:
    return UserSessionRead(
        user_id=user.id,
        display_name=user.display_name,
        department=user.department,
        role=user.role,
        logged_in_at=logged_in_at,
        password_expires_at=user.password_expires_at,
    )


def user_to_summary(user: User) -> UserSummaryRead:
    return UserSummaryRead(
        user_id=user.id,
        display_name=user.display_name,
        department=user.department,
        role=user.role,
        password_expires_at=user.password_expires_at,
    )


def get_user_or_404(db: Session, user_id: str) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user
