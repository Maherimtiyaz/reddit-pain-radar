"""Application settings via pydantic-settings.

Values are read from process environment first, then an optional ``.env``
file in the working directory. See ``.env.example`` for the full list.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven configuration for the worker."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # -- runtime --------------------------------------------------------------
    environment: str = "development"
    log_level: str = "INFO"

    # -- database -------------------------------------------------------------
    database_url: str = (
        "postgresql+psycopg://radar:radar@localhost:5432/reddit_pain_radar"
    )

    # -- reddit (OAuth app-only) ---------------------------------------------
    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    reddit_user_agent: str = "RedditPainRadar/1.0 by YourRedditUsername"
    reddit_rate_per_minute: int = Field(default=60, ge=1, le=60)
    reddit_max_pages: int = Field(default=3, ge=1, le=10)
    reddit_timeout_seconds: float = Field(default=30.0, gt=0)

    fetch_sort: Literal["hot", "new", "top"] = "hot"
    fetch_timeframe: Literal["hour", "day", "week", "month", "year", "all"] = "week"
    fetch_limit: int = Field(default=100, ge=1, le=300)
    enable_keyword_search: bool = True
    search_keywords_per_set: int = Field(default=5, ge=0)
    search_limit: int = Field(default=25, ge=1, le=100)
    max_posts_per_run: int = Field(default=200, ge=1)

    # -- llm (DeepSeek via the OpenAI SDK) -----------------------------------
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_model: str = "deepseek-chat"
    llm_max_concurrency: int = Field(default=10, ge=1)
    llm_temperature: float = Field(default=0.3, ge=0.0, le=2.0)
    llm_timeout_seconds: float = Field(default=60.0, gt=0)

    # -- clustering / scoring -------------------------------------------------
    max_themes_before_merge: int = Field(default=20, ge=1)
    merged_theme_target: int = Field(default=10, ge=1)

    # -- email (Resend) -------------------------------------------------------
    resend_api_key: str = ""
    report_from_email: str = "Reddit Pain Radar <reports@example.com>"
    report_to_email: str = ""

    # -- scheduling -----------------------------------------------------------
    schedule_kind: Literal["cron", "interval"] = "cron"
    schedule_cron: str = "0 6 * * *"
    schedule_interval_minutes: int = Field(default=1440, ge=1)
    timezone: str = "UTC"

    # -- report scope ---------------------------------------------------------
    report_since_hours: int = Field(default=24, ge=1)

    @field_validator("log_level")
    @classmethod
    def _upper_log_level(cls, value: str) -> str:
        return value.upper()

    @property
    def email_enabled(self) -> bool:
        """True when an email can actually be sent."""
        return bool(self.resend_api_key and self.report_to_email)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached process-wide settings (tests can call ``.cache_clear()``)."""
    return Settings()
