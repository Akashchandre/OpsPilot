import base64
import binascii
import ipaddress
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

AI_ROOT = Path(__file__).resolve().parents[2]


class AiSettings(BaseSettings):
    model_config = SettingsConfigDict(
        case_sensitive=True,
        extra="ignore",
        hide_input_in_errors=True,
        populate_by_name=False,
    )

    environment: Literal["development", "test", "production"] = Field(
        default="development",
        alias="AI_ENVIRONMENT",
    )
    host: str = Field(default="127.0.0.1", alias="AI_HOST")
    port: int = Field(default=8000, ge=1024, le=65535, alias="AI_PORT")
    log_level: Literal["debug", "info", "warning", "error"] = Field(
        default="info",
        alias="AI_LOG_LEVEL",
    )
    provider_enabled: bool = Field(default=False, alias="AI_PROVIDER_ENABLED")
    signing_key: SecretStr = Field(alias="AI_SERVICE_SIGNING_KEY")
    signing_key_id: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]*$",
        alias="AI_SERVICE_SIGNING_KEY_ID",
    )
    groq_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("GROQ_API_KEY", "XAI_API_KEY"),
    )
    require_zero_data_retention: bool = Field(
        default=True,
        validation_alias=AliasChoices(
            "GROQ_REQUIRE_ZERO_DATA_RETENTION",
            "XAI_REQUIRE_ZERO_DATA_RETENTION",
        ),
    )
    zero_data_retention_confirmed: bool = Field(
        default=False,
        alias="GROQ_ZERO_DATA_RETENTION_CONFIRMED",
    )
    groq_request_timeout_ms: int = Field(
        default=20_000,
        ge=1_000,
        le=20_000,
        validation_alias=AliasChoices("GROQ_REQUEST_TIMEOUT_MS", "XAI_REQUEST_TIMEOUT_MS"),
    )
    groq_max_output_tokens: int = Field(
        default=500,
        ge=1,
        le=500,
        validation_alias=AliasChoices("GROQ_MAX_OUTPUT_TOKENS", "XAI_MAX_OUTPUT_TOKENS"),
    )
    max_concurrency: int = Field(
        default=4,
        ge=1,
        le=4,
        alias="AI_MAX_CONCURRENCY",
    )

    @field_validator("host")
    @classmethod
    def require_loopback_host(cls, value: str) -> str:
        try:
            address = ipaddress.ip_address(value)
        except ValueError as error:
            raise ValueError("AI_HOST must be a loopback IP address") from error
        if not address.is_loopback:
            raise ValueError("AI_HOST must be a loopback IP address")
        return address.compressed

    @field_validator("signing_key")
    @classmethod
    def require_strong_base64_key(cls, value: SecretStr) -> SecretStr:
        raw_value = value.get_secret_value()
        try:
            decoded = base64.b64decode(raw_value, validate=True)
        except (binascii.Error, ValueError) as error:
            raise ValueError("AI_SERVICE_SIGNING_KEY must be valid Base64") from error
        if base64.b64encode(decoded).decode("ascii") != raw_value:
            raise ValueError("AI_SERVICE_SIGNING_KEY must use canonical Base64")
        if len(decoded) < 32:
            raise ValueError("AI_SERVICE_SIGNING_KEY must contain at least 32 random bytes")
        return value

    @field_validator("require_zero_data_retention")
    @classmethod
    def require_zero_data_retention_enabled(cls, value: bool) -> bool:
        if not value:
            raise ValueError("GROQ_REQUIRE_ZERO_DATA_RETENTION must remain enabled")
        return value

    @model_validator(mode="after")
    def require_provider_secret_when_enabled(self) -> "AiSettings":
        if self.provider_enabled:
            key = self.groq_api_key
            if key is None or not key.get_secret_value().strip():
                raise ValueError("GROQ_API_KEY is required when AI_PROVIDER_ENABLED=true")
            if not key.get_secret_value().startswith("gsk_"):
                raise ValueError("GROQ_API_KEY must be a Groq API key")
            if not self.zero_data_retention_confirmed:
                raise ValueError(
                    "GROQ_ZERO_DATA_RETENTION_CONFIRMED must be true when AI_PROVIDER_ENABLED=true"
                )
        return self

    def signing_key_bytes(self) -> bytes:
        return base64.b64decode(self.signing_key.get_secret_value(), validate=True)


@lru_cache(maxsize=1)
def load_settings() -> AiSettings:
    return AiSettings(_env_file=AI_ROOT / ".env", _env_file_encoding="utf-8")
