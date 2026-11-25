from functools import lru_cache
import os
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    github_token: str = ""

    database_url: str = ""
    monitor_interval_minutes: int = 60
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def is_vercel(self) -> bool:
        return bool(os.environ.get("VERCEL"))

    @property
    def effective_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        if self.is_vercel:
            return "sqlite:////tmp/airdrop_alpha.db"
        return "sqlite:///./airdrop_alpha.db"

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def has_gemini_key(self) -> bool:
        return bool(
            self.gemini_api_key
            and self.gemini_api_key != "your_gemini_api_key_here"
        )

    @property
    def has_telegram_config(self) -> bool:
        return bool(self.telegram_bot_token and self.telegram_chat_id)


@lru_cache
def get_settings() -> Settings:
    return Settings()
