import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402
from app.security import get_current_user  # noqa: E402


def _bypass_auth() -> None:
    """FHIR ルーターの認証ゲートをテスト中だけ無効化する（router 依存なので返り値は不要）。"""
    return None


@pytest.fixture(autouse=True)
def _fhir_auth_override(request: pytest.FixtureRequest):
    """test_fhir* のモジュールに限り FHIR 認証を bypass する。

    test_api.py は実際の 401/403 認可を検証するため override しない。
    """
    if "test_fhir" not in request.module.__name__:
        yield
        return
    app.dependency_overrides[get_current_user] = _bypass_auth
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user, None)
