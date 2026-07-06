from __future__ import annotations

import base64
import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .modules.auth.models import User

password_hash = PasswordHasher()
bearer_scheme = HTTPBearer(auto_error=False)

# 外部連携シークレット（ORCA 接続パスワード等）を保存時に暗号化する。
# 鍵は JWT シークレットから導出するため追加の環境変数は不要。
# jwt_secret_key を変更すると既存の暗号値は復号できなくなる（要再入力）。
_ENCRYPTED_SECRET_PREFIX = "enc:v1:"


def _secret_fernet() -> Fernet:
    digest = hashlib.sha256(get_settings().jwt_secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plain: str) -> str:
    token = _secret_fernet().encrypt(plain.encode()).decode()
    return f"{_ENCRYPTED_SECRET_PREFIX}{token}"


def decrypt_secret(stored: str | None) -> str | None:
    if not stored:
        return stored
    if not stored.startswith(_ENCRYPTED_SECRET_PREFIX):
        # レガシー（平文で保存された値）はそのまま返す。
        return stored
    token = stored[len(_ENCRYPTED_SECRET_PREFIX):]
    try:
        return _secret_fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None


@dataclass
class AuthenticatedContext:
    user: User
    issued_at: datetime | None
    token_role: str | None


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def is_hashed_password(password: str) -> bool:
    return password.startswith("$argon2")


def verify_password(plain_password: str, stored_password: str) -> bool:
    # 平文パスワードは照合を許可しない。レガシー移行は seed 側で argon2 化する
    # （password_needs_upgrade / seed_demo_data）。
    if not is_hashed_password(stored_password):
        return False
    try:
        return password_hash.verify(stored_password, plain_password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def password_needs_upgrade(stored_password: str) -> bool:
    return not is_hashed_password(stored_password)


def create_access_token(*, user_id: str, role: str) -> str:
    settings = get_settings()
    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": user_id,
        "role": role,
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }

    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()

    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except InvalidTokenError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from error

    return payload


def parse_issued_at(value: Any) -> datetime | None:
    if value is None:
        return None

    try:
        timestamp = int(value)
    except (TypeError, ValueError):
        return None

    return datetime.fromtimestamp(timestamp, tz=timezone.utc)


def get_current_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> AuthenticatedContext:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")

    payload = decode_access_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    return AuthenticatedContext(
        user=user,
        issued_at=parse_issued_at(payload.get("iat")),
        token_role=payload.get("role"),
    )


def get_current_user(current_auth: AuthenticatedContext = Depends(get_current_auth)) -> User:
    return current_auth.user


def require_role(*allowed_roles: str) -> Callable[[AuthenticatedContext], User]:
    def dependency(current_auth: AuthenticatedContext = Depends(get_current_auth)) -> User:
        if current_auth.user.role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        return current_auth.user

    return dependency
