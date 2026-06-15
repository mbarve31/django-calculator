from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

PROVIDERS = ("auto", "openai", "anthropic")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    provider: str
    openai_api_key: str
    openai_model: str
    anthropic_api_key: str
    anthropic_model: str
    host: str
    port: int

    @classmethod
    def from_env(cls) -> "Settings":
        provider = os.getenv("SCREEN_AGENT_PROVIDER", "auto").lower()
        if provider not in PROVIDERS:
            provider = "auto"

        return cls(
            provider=provider,
            openai_api_key=os.getenv("OPENAI_API_KEY", ""),
            openai_model=os.getenv("OPENAI_MODEL", "gpt-4o"),
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
            anthropic_model=os.getenv("ANTHROPIC_MODEL", "claude-opus-4-8"),
            host=os.getenv("SCREEN_AGENT_HOST", "127.0.0.1"),
            port=int(os.getenv("SCREEN_AGENT_PORT", "8766")),
        )

    def active_provider(self) -> Optional[str]:
        if self.provider == "openai":
            return "openai" if self.openai_api_key else None
        if self.provider == "anthropic":
            return "anthropic" if self.anthropic_api_key else None

        if self.anthropic_api_key:
            return "anthropic"
        if self.openai_api_key:
            return "openai"
        return None

    def active_model(self) -> Optional[str]:
        provider = self.active_provider()
        if provider == "anthropic":
            return self.anthropic_model
        if provider == "openai":
            return self.openai_model
        return None

    def configuration_error(self) -> Optional[str]:
        if self.provider == "openai" and not self.openai_api_key:
            return "SCREEN_AGENT_PROVIDER=openai but OPENAI_API_KEY is not set."
        if self.provider == "anthropic" and not self.anthropic_api_key:
            return "SCREEN_AGENT_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set."
        if not self.active_provider():
            return (
                "No API key configured. Add ANTHROPIC_API_KEY to a .env file in the "
                "project root (see .env.example) or export it in your shell, then "
                "restart the server."
            )
        return None
