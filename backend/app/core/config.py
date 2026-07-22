"""
GitMesh — Centralized Configuration
====================================
All application settings loaded from environment variables via pydantic-settings.
Secrets use SecretStr to prevent accidental logging/serialization.
"""

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings populated from environment variables.

    Required env vars (no defaults):
        SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_JWT_SECRET, NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD

    All secrets are wrapped in SecretStr — call `.get_secret_value()` to read.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────────────
    PROJECT_NAME: str = "GitMesh"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # ── Supabase / PostgreSQL ────────────────────────────────────────────
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_JWT_SECRET: str

    # ── Gemini Context Cache settings ──────────────────────────────────────
    GEMINI_CONTEXT_MODEL: str = "gemini-3.1-flash-lite"

    # ── Plan Limits ──────────────────────────────────────────────────────
    # Free tier
    FREE_DAILY_MSG_LIMIT: int = 3
    FREE_MONTHLY_MSG_LIMIT: int = 15
    FREE_REPO_LIMIT: int = 2
    FREE_MONTHLY_REPORT_LIMIT: int = 2

    # Pro tier (with safety ceilings)
    PRO_DAILY_MSG_LIMIT: int = 1000
    PRO_MONTHLY_MSG_LIMIT: int = 5000
    PRO_REPO_LIMIT: int = 999999
    PRO_MONTHLY_REPORT_LIMIT: int = 999999



    # ── Validators ───────────────────────────────────────────────────────
    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        """Accept a JSON-encoded string *or* an already-parsed list."""
        if isinstance(v, str):
            import json

            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return [str(origin) for origin in parsed]
            except (json.JSONDecodeError, TypeError):
                # Treat as a single origin
                return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached singleton Settings instance.

    Using ``@lru_cache`` ensures the .env file is read exactly once and the
    same ``Settings`` object is reused across the entire application.
    """
    return Settings()  # type: ignore[call-arg]

settings = get_settings()
