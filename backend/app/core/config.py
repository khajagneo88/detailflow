"""
Application settings, loaded from environment variables (see .env.example).

Using pydantic-settings keeps configuration typed and validated at startup
instead of scattering os.environ.get() calls (with silent typos/None
defaults) throughout the codebase.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+psycopg2://detailflow:detailflow@localhost:5432/detailflow"

    # Auth
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 720  # 12 hours

    # CORS
    frontend_origin: str = "http://localhost:3000"

    # Environment
    environment: str = "development"

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    """Cached so Settings() is only constructed/validated once per process."""
    return Settings()


settings = get_settings()
