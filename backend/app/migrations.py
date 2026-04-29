from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

from .config import get_settings


def run_migrations() -> None:
    settings = get_settings()
    root_dir = Path(__file__).resolve().parents[1]
    alembic_ini_path = root_dir / "alembic.ini"
    config = Config(str(alembic_ini_path))
    config.set_main_option("script_location", str(root_dir / "alembic"))
    config.set_main_option("sqlalchemy.url", settings.database_url)
    command.upgrade(config, "head")
