from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# 開発用のデフォルト JWT シークレット。本番（MANTA_ENV=production）でこの値のまま
# 起動することは main の起動時チェックで拒否する。
DEFAULT_JWT_SECRET_KEY = "manta-dev-secret-change-this-to-a-long-random-key"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MANTA_", env_file=".env", extra="ignore", populate_by_name=True
    )

    app_name: str = "Manta API"
    # development | production。production ではデフォルトシークレットを拒否し、
    # デモデータの自動投入を既定で無効にする（環境変数 MANTA_ENV で上書き）。
    environment: str = Field(default="development", validation_alias="MANTA_ENV")
    database_url: str = "postgresql+psycopg://manta:manta@localhost:5432/manta"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]
    jwt_secret_key: str = DEFAULT_JWT_SECRET_KEY
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    # None のときは environment で決定（本番は既定 False、開発は既定 True）。
    # MANTA_SEED_DEMO=true/false で明示的に上書きできる。
    seed_demo: bool | None = None

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() == "production"

    @property
    def uses_default_jwt_secret(self) -> bool:
        return self.jwt_secret_key == DEFAULT_JWT_SECRET_KEY

    @property
    def should_seed_demo(self) -> bool:
        if self.seed_demo is not None:
            return self.seed_demo
        return not self.is_production


@lru_cache
def get_settings() -> Settings:
    return Settings()
