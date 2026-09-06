import base64
import binascii
import ipaddress
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

AI_ROOT = Path(__file__).resolve().parents[2]
REPOSITORY_ROOT = AI_ROOT.parents[1]
WEB_ROOT = REPOSITORY_ROOT / "apps" / "web"
WEB_PUBLIC_ROOT = WEB_ROOT / "public"
WEB_BUILD_ROOT = WEB_ROOT / "dist"
RAG_RESTRICTED_PATH_ROOTS = (
    REPOSITORY_ROOT,
    WEB_ROOT,
    WEB_PUBLIC_ROOT,
    WEB_BUILD_ROOT,
)
RAG_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
RAG_EMBEDDING_MODEL_REVISION = "5f1b8cd78bc4fb444dd171e59b18f3a3af89a079"


def _is_same_or_nested_path(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def _paths_overlap(path: Path, restricted_root: Path) -> bool:
    return _is_same_or_nested_path(path, restricted_root) or _is_same_or_nested_path(
        restricted_root, path
    )


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
    rag_enabled: bool = Field(default=False, alias="AI_RAG_ENABLED")
    rag_model_cache_dir: Path | None = Field(default=None, alias="AI_RAG_MODEL_CACHE_DIR")
    rag_qdrant_path: Path | None = Field(default=None, alias="AI_RAG_QDRANT_PATH")
    rag_collection_name: str = Field(
        default="opspilot_documents_v1",
        min_length=1,
        max_length=64,
        pattern=r"^[a-z][a-z0-9_]{0,63}$",
        alias="AI_RAG_COLLECTION_NAME",
    )
    rag_embedding_threads: int = Field(default=1, ge=1, le=1, alias="AI_RAG_EMBEDDING_THREADS")
    workflows_enabled: bool = Field(default=False, alias="AI_WORKFLOWS_ENABLED")
    workflow_node_url: str | None = Field(default=None, alias="AI_WORKFLOW_NODE_URL")
    workflow_node_signing_key: SecretStr | None = Field(
        default=None, alias="AI_WORKFLOW_NODE_SIGNING_KEY"
    )
    workflow_node_signing_key_id: str | None = Field(
        default=None,
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]*$",
        alias="AI_WORKFLOW_NODE_SIGNING_KEY_ID",
    )
    support_data_processing_confirmed: bool = Field(
        default=False, alias="AI_SUPPORT_DATA_PROCESSING_CONFIRMED"
    )
    workflow_checkpoint_path: Path | None = Field(default=None, alias="AI_WORKFLOW_CHECKPOINT_PATH")
    langgraph_strict_msgpack: bool = Field(default=True, alias="LANGGRAPH_STRICT_MSGPACK")
    workflow_max_concurrency: int = Field(
        default=1, ge=1, le=1, alias="AI_WORKFLOW_MAX_CONCURRENCY"
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
        if self.rag_enabled:
            if self.environment == "production":
                raise ValueError("Local Phase 8 RAG persistence is not approved for production")
            for field_name in ("rag_model_cache_dir", "rag_qdrant_path"):
                configured_path = getattr(self, field_name)
                if configured_path is None:
                    raise ValueError(f"{field_name} is required when AI_RAG_ENABLED=true")
                if not configured_path.is_absolute():
                    raise ValueError(f"{field_name} must be an absolute path")
                resolved_path = configured_path.resolve()
                if any(
                    _paths_overlap(resolved_path, restricted_root.resolve())
                    for restricted_root in RAG_RESTRICTED_PATH_ROOTS
                ):
                    raise ValueError(f"{field_name} must be outside repository and public roots")
            if self.rag_model_cache_dir == self.rag_qdrant_path:
                raise ValueError("AI_RAG_MODEL_CACHE_DIR and AI_RAG_QDRANT_PATH must be different")
        if self.workflows_enabled:
            if self.environment == "production":
                raise ValueError("Local Phase 9 checkpoints are not approved for production")
            if not self.provider_enabled:
                raise ValueError("AI_WORKFLOWS_ENABLED requires AI_PROVIDER_ENABLED")
            if not self.langgraph_strict_msgpack:
                raise ValueError("LANGGRAPH_STRICT_MSGPACK must remain true")
            if self.workflow_node_url is None:
                raise ValueError("AI_WORKFLOW_NODE_URL is required")
            parsed_url = urlparse(self.workflow_node_url)
            if (
                parsed_url.scheme != "http"
                or parsed_url.hostname not in {"127.0.0.1", "::1"}
                or parsed_url.username is not None
                or parsed_url.password is not None
                or parsed_url.path not in {"", "/"}
                or parsed_url.query
                or parsed_url.fragment
            ):
                raise ValueError("AI_WORKFLOW_NODE_URL must be a loopback HTTP origin")
            if self.workflow_node_signing_key is None or self.workflow_node_signing_key_id is None:
                raise ValueError("The workflow Node signing key and key ID are required")
            raw_key = self.workflow_node_signing_key.get_secret_value()
            try:
                decoded_key = base64.b64decode(raw_key, validate=True)
            except (binascii.Error, ValueError) as error:
                raise ValueError("AI_WORKFLOW_NODE_SIGNING_KEY must be valid Base64") from error
            if base64.b64encode(decoded_key).decode("ascii") != raw_key or len(decoded_key) < 32:
                raise ValueError(
                    "AI_WORKFLOW_NODE_SIGNING_KEY must contain at least 32 Base64 bytes"
                )
            if (
                self.workflow_checkpoint_path is None
                or not self.workflow_checkpoint_path.is_absolute()
            ):
                raise ValueError("AI_WORKFLOW_CHECKPOINT_PATH must be an absolute path")
            checkpoint_path = self.workflow_checkpoint_path.resolve()
            if any(
                _paths_overlap(checkpoint_path, restricted_root.resolve())
                for restricted_root in RAG_RESTRICTED_PATH_ROOTS
            ):
                raise ValueError(
                    "AI_WORKFLOW_CHECKPOINT_PATH must be outside repository/public roots"
                )
            for other_path in (self.rag_model_cache_dir, self.rag_qdrant_path):
                if other_path is not None and _paths_overlap(checkpoint_path, other_path.resolve()):
                    raise ValueError("The workflow checkpoint path must be isolated")
            if self.support_data_processing_confirmed and not self.rag_enabled:
                raise ValueError("Support workflows require AI_RAG_ENABLED")
        return self

    @property
    def rag_embedding_model(self) -> str:
        return RAG_EMBEDDING_MODEL

    @property
    def rag_embedding_model_revision(self) -> str:
        return RAG_EMBEDDING_MODEL_REVISION

    def signing_key_bytes(self) -> bytes:
        return base64.b64decode(self.signing_key.get_secret_value(), validate=True)

    def workflow_node_signing_key_bytes(self) -> bytes:
        if self.workflow_node_signing_key is None:
            raise ValueError("The workflow Node signing key is unavailable")
        return base64.b64decode(self.workflow_node_signing_key.get_secret_value(), validate=True)


@lru_cache(maxsize=1)
def load_settings() -> AiSettings:
    return AiSettings(_env_file=AI_ROOT / ".env", _env_file_encoding="utf-8")
