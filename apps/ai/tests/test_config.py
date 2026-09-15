import base64
from pathlib import Path

import pytest
from pydantic import ValidationError

from opspilot_ai.config import (
    RAG_EMBEDDING_MODEL,
    RAG_EMBEDDING_MODEL_REVISION,
    REPOSITORY_ROOT,
    WEB_BUILD_ROOT,
    WEB_PUBLIC_ROOT,
    WEB_ROOT,
    AiSettings,
)

from .conftest import SIGNING_KEY_BASE64, SIGNING_KEY_ID, make_settings


def test_loads_safe_defaults_and_decodes_signing_key() -> None:
    settings = make_settings()

    assert settings.environment == "test"
    assert settings.host == "127.0.0.1"
    assert settings.provider_enabled is False
    assert settings.require_zero_data_retention is True
    assert settings.zero_data_retention_confirmed is False
    assert settings.groq_request_timeout_ms == 20_000
    assert settings.groq_max_output_tokens == 500
    assert settings.max_concurrency == 4
    assert settings.rag_enabled is False
    assert settings.rag_model_cache_dir is None
    assert settings.rag_qdrant_path is None
    assert settings.rag_collection_name == "opspilot_documents_v1"
    assert settings.rag_embedding_threads == 1
    assert settings.rag_embedding_model == RAG_EMBEDDING_MODEL
    assert settings.rag_embedding_model_revision == RAG_EMBEDDING_MODEL_REVISION
    assert settings.signing_key_bytes() == bytes(range(32))


def test_parses_documented_zero_data_retention_value_from_dotenv(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\n".join(
            [
                f"AI_SERVICE_SIGNING_KEY={SIGNING_KEY_BASE64}",
                f"AI_SERVICE_SIGNING_KEY_ID={SIGNING_KEY_ID}",
                "GROQ_REQUIRE_ZERO_DATA_RETENTION=true",
            ]
        ),
        encoding="utf-8",
    )

    settings = AiSettings(_env_file=env_file)

    assert settings.require_zero_data_retention is True


def test_rejects_disabled_zero_data_retention_value_from_dotenv(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\n".join(
            [
                f"AI_SERVICE_SIGNING_KEY={SIGNING_KEY_BASE64}",
                f"AI_SERVICE_SIGNING_KEY_ID={SIGNING_KEY_ID}",
                "GROQ_REQUIRE_ZERO_DATA_RETENTION=false",
            ]
        ),
        encoding="utf-8",
    )

    with pytest.raises(
        ValidationError, match="GROQ_REQUIRE_ZERO_DATA_RETENTION must remain enabled"
    ):
        AiSettings(_env_file=env_file)


@pytest.mark.parametrize("host", ["0.0.0.0", "192.168.1.8", "localhost"])
def test_rejects_non_ip_or_non_loopback_hosts(host: str) -> None:
    with pytest.raises(ValidationError):
        make_settings(AI_HOST=host)


def test_accepts_ipv6_loopback() -> None:
    assert make_settings(AI_HOST="::1").host == "::1"


@pytest.mark.parametrize(
    "key",
    [
        "not-base64",
        base64.b64encode(b"too short").decode("ascii"),
        SIGNING_KEY_BASE64.rstrip("="),
    ],
)
def test_rejects_invalid_or_weak_signing_keys_without_echoing_value(key: str) -> None:
    with pytest.raises(ValidationError) as raised:
        AiSettings(
            _env_file=None,
            AI_ENVIRONMENT="test",
            AI_SERVICE_SIGNING_KEY=key,
            AI_SERVICE_SIGNING_KEY_ID=SIGNING_KEY_ID,
        )

    assert key not in str(raised.value)


def test_requires_provider_key_only_when_provider_is_enabled() -> None:
    with pytest.raises(ValidationError) as raised:
        make_settings(AI_PROVIDER_ENABLED=True)

    assert "GROQ_API_KEY is required" in str(raised.value)

    enabled = make_settings(
        AI_PROVIDER_ENABLED=True,
        GROQ_API_KEY="gsk_test_only",
        GROQ_ZERO_DATA_RETENTION_CONFIRMED=True,
    )
    assert enabled.provider_enabled is True


def test_rejects_a_different_provider_key_without_echoing_it() -> None:
    other_provider_key = "xai_test_only"

    with pytest.raises(ValidationError) as raised:
        make_settings(
            AI_PROVIDER_ENABLED=True,
            GROQ_API_KEY=other_provider_key,
            GROQ_ZERO_DATA_RETENTION_CONFIRMED=True,
        )

    assert "must be a Groq API key" in str(raised.value)
    assert other_provider_key not in str(raised.value)


def test_requires_explicit_zero_data_retention_confirmation_before_enablement() -> None:
    with pytest.raises(ValidationError) as raised:
        make_settings(AI_PROVIDER_ENABLED=True, GROQ_API_KEY="gsk_test_only")

    assert "GROQ_ZERO_DATA_RETENTION_CONFIRMED must be true" in str(raised.value)


def test_accepts_existing_key_under_legacy_local_environment_name() -> None:
    settings = make_settings(
        AI_PROVIDER_ENABLED=True,
        XAI_API_KEY="gsk_existing_test_only",
        XAI_REQUEST_TIMEOUT_MS=15_000,
        XAI_MAX_OUTPUT_TOKENS=400,
        GROQ_ZERO_DATA_RETENTION_CONFIRMED=True,
    )

    assert settings.groq_api_key is not None
    assert settings.groq_api_key.get_secret_value() == "gsk_existing_test_only"
    assert settings.groq_request_timeout_ms == 15_000
    assert settings.groq_max_output_tokens == 400


def test_rejects_disabling_zero_data_retention_requirement() -> None:
    with pytest.raises(ValidationError):
        make_settings(GROQ_REQUIRE_ZERO_DATA_RETENTION=False)


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("AI_PORT", 80),
        ("GROQ_REQUEST_TIMEOUT_MS", 20_001),
        ("GROQ_MAX_OUTPUT_TOKENS", 501),
        ("AI_MAX_CONCURRENCY", 5),
    ],
)
def test_rejects_values_outside_policy_bounds(name: str, value: int) -> None:
    with pytest.raises(ValidationError):
        make_settings(**{name: value})


def test_requires_distinct_absolute_local_rag_paths_when_enabled(tmp_path: Path) -> None:
    with pytest.raises(ValidationError):
        make_settings(AI_RAG_ENABLED=True)

    relative_path = Path("relative-rag-cache")
    with pytest.raises(ValidationError):
        make_settings(
            AI_RAG_ENABLED=True,
            AI_RAG_MODEL_CACHE_DIR=relative_path,
            AI_RAG_QDRANT_PATH=tmp_path / "qdrant",
        )

    with pytest.raises(ValidationError):
        make_settings(
            AI_RAG_ENABLED=True,
            AI_RAG_MODEL_CACHE_DIR=tmp_path,
            AI_RAG_QDRANT_PATH=tmp_path,
        )

    settings = make_settings(
        AI_RAG_ENABLED=True,
        AI_RAG_MODEL_CACHE_DIR=tmp_path / "models",
        AI_RAG_QDRANT_PATH=tmp_path / "qdrant",
    )
    assert settings.rag_enabled is True
    assert settings.rag_model_cache_dir == tmp_path / "models"
    assert settings.rag_qdrant_path == tmp_path / "qdrant"


@pytest.mark.parametrize(
    ("field_name", "unsafe_path"),
    [
        ("AI_RAG_MODEL_CACHE_DIR", REPOSITORY_ROOT),
        ("AI_RAG_MODEL_CACHE_DIR", REPOSITORY_ROOT / "private-rag-cache"),
        ("AI_RAG_MODEL_CACHE_DIR", REPOSITORY_ROOT.parent),
        ("AI_RAG_QDRANT_PATH", WEB_ROOT),
        ("AI_RAG_QDRANT_PATH", WEB_PUBLIC_ROOT),
        ("AI_RAG_QDRANT_PATH", WEB_PUBLIC_ROOT / "qdrant"),
        ("AI_RAG_QDRANT_PATH", WEB_BUILD_ROOT),
        ("AI_RAG_QDRANT_PATH", WEB_ROOT.parent),
    ],
)
def test_rejects_rag_paths_overlapping_repository_or_web_roots(
    field_name: str, unsafe_path: Path, tmp_path: Path
) -> None:
    rag_paths: dict[str, Path] = {
        "AI_RAG_MODEL_CACHE_DIR": tmp_path / "models",
        "AI_RAG_QDRANT_PATH": tmp_path / "qdrant",
    }
    rag_paths[field_name] = unsafe_path

    with pytest.raises(ValidationError, match="outside repository and public roots"):
        make_settings(AI_RAG_ENABLED=True, **rag_paths)


def test_rejects_local_rag_persistence_in_production(tmp_path: Path) -> None:
    with pytest.raises(ValidationError, match="not approved for production"):
        make_settings(
            AI_ENVIRONMENT="production",
            AI_RAG_ENABLED=True,
            AI_RAG_MODEL_CACHE_DIR=tmp_path / "models",
            AI_RAG_QDRANT_PATH=tmp_path / "qdrant",
        )


def test_accepts_local_rag_only_for_the_approved_production_demo(tmp_path: Path) -> None:
    settings = make_settings(
        AI_ENVIRONMENT="production",
        AI_PRODUCTION_DEMO_LOCAL_TOPOLOGY_ACCEPTED=True,
        AI_PROVIDER_ENABLED=True,
        GROQ_API_KEY="gsk_production_demo_test_only",
        GROQ_ZERO_DATA_RETENTION_CONFIRMED=True,
        AI_RAG_ENABLED=True,
        AI_RAG_MODEL_CACHE_DIR=tmp_path / "models",
        AI_RAG_QDRANT_PATH=tmp_path / "qdrant",
    )

    assert settings.production_demo_local_topology_accepted is True
    assert settings.provider_enabled is True
    assert settings.rag_enabled is True

    with pytest.raises(ValidationError, match="valid only in production"):
        make_settings(AI_PRODUCTION_DEMO_LOCAL_TOPOLOGY_ACCEPTED=True)
