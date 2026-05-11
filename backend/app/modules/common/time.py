from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo


TOKYO_TZ = ZoneInfo("Asia/Tokyo")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def format_lab_date(value: datetime | None) -> str:
    if value is None:
        return ""
    return value.astimezone(TOKYO_TZ).strftime("%Y/%m/%d")


def format_progress_date(value: datetime | None) -> str:
    if value is None:
        return "日付未設定"
    return value.astimezone(TOKYO_TZ).strftime("%Y/%m/%d")


def format_document_date(value: datetime | None) -> str:
    if value is None:
        return "未設定"
    return value.astimezone(TOKYO_TZ).strftime("%Y/%m/%d")
