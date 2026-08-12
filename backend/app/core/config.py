"""Typed, environment-based application configuration."""

from functools import lru_cache
from typing import Literal, Self
from urllib.parse import urlparse

from pydantic import AliasChoices, AnyHttpUrl, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class Settings(BaseSettings):
    """Runtime settings sourced from environment variables or a local .env file."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        env_prefix="HATSS_",
        extra="ignore",
    )

    app_name: str = "HATSS API"
    app_version: str = "0.1.0"
    environment: Literal["development", "test", "production"] = "development"
    debug: bool = False
    docs_enabled: bool = False
    api_v1_prefix: str = "/api/v1"

    cors_origins: list[AnyHttpUrl | str] = [AnyHttpUrl("http://localhost:5173")]
    trusted_hosts: list[str] = ["localhost", "127.0.0.1", "testserver"]

    copilot_enabled: bool = False
    copilot_base_url: str = "http://127.0.0.1:11434"
    copilot_model: str = "llama3.2:3b"
    copilot_timeout_seconds: int = Field(default=120, ge=5, le=300)

    database_host: str = "localhost"
    database_port: int = 5432
    database_name: str = Field(
        default="hatss",
        validation_alias=AliasChoices("HATSS_DATABASE_NAME", "POSTGRES_DB"),
    )
    database_user: str = Field(
        default="hatss",
        validation_alias=AliasChoices("HATSS_DATABASE_USER", "POSTGRES_USER"),
    )
    database_password: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("HATSS_DATABASE_PASSWORD", "POSTGRES_PASSWORD"),
    )

    @model_validator(mode="after")
    def validate_production_settings(self) -> Self:
        """Reject unsafe debug configuration before an application starts."""
        if self.environment == "production" and self.debug:
            raise ValueError("HATSS_DEBUG must be false in production.")
        parsed_copilot_url = urlparse(self.copilot_base_url)
        if parsed_copilot_url.scheme != "http" or parsed_copilot_url.hostname not in {
            "127.0.0.1",
            "::1",
            "localhost",
        }:
            raise ValueError("HATSS_COPILOT_BASE_URL must reference a local HTTP Ollama server.")
        return self

    @property
    def cors_origin_strings(self) -> list[str]:
        """Return URL origins in the format expected by Starlette middleware."""
        return [str(origin).rstrip("/") for origin in self.cors_origins]

    @property
    def database_url(self) -> URL:
        """Build a SQLAlchemy URL without exposing the password in configuration."""
        if self.database_password is None:
            raise RuntimeError("POSTGRES_PASSWORD or HATSS_DATABASE_PASSWORD must be set.")

        return URL.create(
            drivername="postgresql+psycopg",
            username=self.database_user,
            password=self.database_password.get_secret_value(),
            host=self.database_host,
            port=self.database_port,
            database=self.database_name,
        )


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide immutable settings instance."""
    return Settings()
