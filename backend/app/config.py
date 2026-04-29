from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MANTA_", env_file=".env", extra="ignore")

    app_name: str = "Manta API"
    database_url: str = "postgresql+psycopg://manta:manta@localhost:5432/manta"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]
    jwt_secret_key: str = "manta-dev-secret-change-this-to-a-long-random-key"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60


@lru_cache
def get_settings() -> Settings:
    return Settings()
