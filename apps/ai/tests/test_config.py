import base64

import pytest
from pydantic import ValidationError

from opspilot_ai.config import AiSettings

from .conftest import SIGNING_KEY_BASE64, SIGNING_KEY_ID, make_settings


def test_loads_safe_defaults_and_decodes_signing_key() -> None:
    settings = make_settings()

    assert settings.environment == "test"
    assert settings.host == "127.0.0.1"
    assert settings.provider_enabled is False
    assert settings.require_zero_data_retention is True
    assert settings.xai_request_timeout_ms == 20_000
    assert settings.xai_max_output_tokens == 500
    assert settings.max_concurrency == 4
    assert settings.signing_key_bytes() == bytes(range(32))


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

    assert "XAI_API_KEY is required" in str(raised.value)

    enabled = make_settings(AI_PROVIDER_ENABLED=True, XAI_API_KEY="xai-test-only")
    assert enabled.provider_enabled is True


def test_rejects_disabling_zero_data_retention_requirement() -> None:
    with pytest.raises(ValidationError):
        make_settings(XAI_REQUIRE_ZERO_DATA_RETENTION=False)


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("AI_PORT", 80),
        ("XAI_REQUEST_TIMEOUT_MS", 20_001),
        ("XAI_MAX_OUTPUT_TOKENS", 501),
        ("AI_MAX_CONCURRENCY", 5),
    ],
)
def test_rejects_values_outside_policy_bounds(name: str, value: int) -> None:
    with pytest.raises(ValidationError):
        make_settings(**{name: value})
