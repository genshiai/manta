from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...db import get_db
from ...models import User
from ...schemas import AuthTokenRead, LoginRequest, UserSessionRead
from ...security import (
    AuthenticatedContext,
    create_access_token,
    get_current_auth,
    hash_password,
    password_needs_upgrade,
    verify_password,
)
from ..common.audit import log_audit
from ..common.time import utcnow
from .services import user_to_session


router = APIRouter()


@router.post("/api/auth/login", response_model=AuthTokenRead)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthTokenRead:
    user = db.get(User, payload.user_id)
    if user is None:
        log_audit(
            db,
            actor=payload.user_id or "unknown",
            action="ログイン失敗",
            scope="auth",
            detail="存在しない利用者 ID が入力されました。",
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(payload.password, user.password):
        log_audit(
            db,
            actor=user.display_name,
            action="ログイン失敗",
            scope="auth",
            detail="パスワード照合に失敗しました。",
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user.password_expires_at < date.today():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Password expired")

    if password_needs_upgrade(user.password):
        user.password = hash_password(payload.password)

    log_audit(
        db,
        actor=user.display_name,
        action="ログイン成功",
        scope="auth",
        detail=f"{user.department} / {user.role} としてログインしました。",
    )
    db.commit()
    return AuthTokenRead(
        access_token=create_access_token(user_id=user.id, role=user.role),
        user=user_to_session(user, logged_in_at=utcnow()),
    )


@router.get("/api/auth/me", response_model=UserSessionRead)
def get_authenticated_user(
    current_auth: AuthenticatedContext = Depends(get_current_auth),
) -> UserSessionRead:
    logged_in_at = current_auth.issued_at or utcnow()
    return user_to_session(current_auth.user, logged_in_at=logged_in_at)
