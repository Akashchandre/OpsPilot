import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from opspilot_ai.app import create_app
from opspilot_ai.errors import AiServiceError
from opspilot_ai.security import SIGNATURE_HEADER

from .conftest import (
    SIGNING_KEY,
    FakeProvider,
    customer_request,
    signed_headers,
)


def compact_json(value: object) -> bytes:
    return json.dumps(value, separators=(",", ":")).encode("utf-8")


def test_signed_health_reports_disabled_without_exposing_configuration(settings) -> None:
    app = create_app(settings)
    headers = signed_headers()

    with TestClient(app) as client:
        response = client.get("/internal/v1/health", headers=headers)

    assert response.status_code == 200
    assert response.json()["data"] == {
        "service": "opspilot-ai",
        "status": "ready",
        "provider": "disabled",
    }
    assert "model" not in response.text
    assert "key" not in response.text.lower()


def test_health_requires_valid_key_id_and_signature(settings) -> None:
    app = create_app(settings)
    wrong_key = signed_headers(key=bytes(reversed(SIGNING_KEY)))
    wrong_key_id = signed_headers(key_id="unknown-key")

    with TestClient(app) as client:
        assert client.get("/internal/v1/health").status_code == 401
        signature_response = client.get("/internal/v1/health", headers=wrong_key)
        key_id_response = client.get("/internal/v1/health", headers=wrong_key_id)

    assert signature_response.status_code == 401
    assert key_id_response.status_code == 401
    assert signature_response.json()["error"]["code"] == ("INTERNAL_AUTHENTICATION_FAILED")


def test_signature_binds_timestamp_method_path_and_body(settings) -> None:
    app = create_app(settings)
    old_timestamp = (
        (datetime.now(UTC) - timedelta(seconds=31))
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )
    future_timestamp = (
        (datetime.now(UTC) + timedelta(seconds=31))
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )
    wrong_method = signed_headers(method="POST")
    wrong_path = signed_headers(path="/internal/v1/responses")

    original = compact_json(customer_request())
    changed = compact_json({**customer_request(), "question": "Changed after signing"})
    tampered_body_headers = signed_headers(
        body=original,
        method="POST",
        path="/internal/v1/responses",
    )

    with TestClient(app) as client:
        assert (
            client.get(
                "/internal/v1/health",
                headers=signed_headers(timestamp=old_timestamp),
            ).status_code
            == 401
        )
        assert (
            client.get(
                "/internal/v1/health",
                headers=signed_headers(timestamp=future_timestamp),
            ).status_code
            == 401
        )
        assert client.get("/internal/v1/health", headers=wrong_method).status_code == 401
        assert client.get("/internal/v1/health", headers=wrong_path).status_code == 401
        response = client.post(
            "/internal/v1/responses",
            content=changed,
            headers=tampered_body_headers,
        )

    assert response.status_code == 401


def test_valid_signature_claims_nonce_and_replay_is_rejected(settings) -> None:
    app = create_app(settings)
    nonce = str(uuid4())
    headers = signed_headers(nonce=nonce)

    with TestClient(app) as client:
        first = client.get("/internal/v1/health", headers=headers)
        second = client.get("/internal/v1/health", headers=headers)

    assert first.status_code == 200
    assert second.status_code == 401
    assert second.json()["error"]["code"] == "INTERNAL_REPLAY_REJECTED"


def test_invalid_signature_does_not_poison_nonce(settings) -> None:
    app = create_app(settings)
    headers = signed_headers()
    invalid_headers = {**headers, SIGNATURE_HEADER: "0" * 64}

    with TestClient(app) as client:
        invalid = client.get("/internal/v1/health", headers=invalid_headers)
        valid = client.get("/internal/v1/health", headers=headers)

    assert invalid.status_code == 401
    assert valid.status_code == 200


def test_authentication_happens_before_json_parsing(settings) -> None:
    app = create_app(settings)
    body = b'{"broken":'
    signed = signed_headers(
        body=body,
        method="POST",
        path="/internal/v1/responses",
    )

    with TestClient(app) as client:
        unsigned = client.post(
            "/internal/v1/responses",
            content=body,
            headers={"Content-Type": "application/json"},
        )
        authenticated = client.post(
            "/internal/v1/responses",
            content=body,
            headers=signed,
        )

    assert unsigned.status_code == 401
    assert authenticated.status_code == 422
    assert authenticated.json()["error"]["code"] == "INVALID_INTERNAL_REQUEST"


def test_duplicate_json_properties_and_wrong_media_type_fail_closed(settings) -> None:
    app = create_app(settings)
    duplicate = (
        b'{"contractVersion":1,"contractVersion":1,"subjectId":"'
        + str(uuid4()).encode()
        + b'","assistant":"CUSTOMER","intent":"CUSTOMER_HELP",'
        b'"question":"Help","context":null}'
    )
    duplicate_headers = signed_headers(
        body=duplicate,
        method="POST",
        path="/internal/v1/responses",
    )
    valid = compact_json(customer_request())
    media_headers = signed_headers(
        body=valid,
        method="POST",
        path="/internal/v1/responses",
    )
    media_headers["Content-Type"] = "text/plain"

    with TestClient(app) as client:
        duplicate_response = client.post(
            "/internal/v1/responses",
            content=duplicate,
            headers=duplicate_headers,
        )
        media_response = client.post(
            "/internal/v1/responses",
            content=valid,
            headers=media_headers,
        )

    assert duplicate_response.status_code == 422
    assert media_response.status_code == 415


def test_oversized_body_is_rejected_before_payload_parsing(settings) -> None:
    app = create_app(settings)
    body = b"x" * 32_769
    headers = signed_headers(
        body=body,
        method="POST",
        path="/internal/v1/responses",
    )

    with TestClient(app) as client:
        response = client.post(
            "/internal/v1/responses",
            content=body,
            headers=headers,
        )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "INTERNAL_REQUEST_TOO_LARGE"


def test_response_route_uses_reviewed_prompt_and_projects_narrow_result(settings) -> None:
    provider = FakeProvider()
    app = create_app(settings, provider=provider)
    payload = customer_request()
    subject_id = payload["subjectId"]
    body = compact_json(payload)
    headers = signed_headers(
        body=body,
        method="POST",
        path="/internal/v1/responses",
    )

    with TestClient(app) as client:
        response = client.post(
            "/internal/v1/responses",
            content=body,
            headers=headers,
        )

    assert response.status_code == 200
    assert provider.preflight_calls == 1
    assert provider.generate_calls == 1
    assert str(subject_id) not in provider.prompts[0].system
    assert str(subject_id) not in provider.prompts[0].user
    assert response.json()["data"] == {
        "answer": "Open Support, then choose the option to create a new ticket.",
        "outcome": "ANSWER",
        "notices": ["USE_STANDARD_SUPPORT"],
        "promptVersion": "customer-help-v1",
        "model": "grok-4.6",
        "providerRequestId": "resp_phase7_test",
        "usage": {
            "inputTokens": 120,
            "outputTokens": 30,
            "totalTokens": 150,
            "costInUsdTicks": 125_000,
        },
        "durationMs": response.json()["data"]["durationMs"],
        "zeroDataRetention": True,
    }


def test_invalid_scope_never_calls_provider(settings) -> None:
    provider = FakeProvider()
    app = create_app(settings, provider=provider)
    payload = customer_request()
    payload["intent"] = "OWNER_OVERVIEW_EXPLAIN"
    body = compact_json(payload)
    headers = signed_headers(
        body=body,
        method="POST",
        path="/internal/v1/responses",
    )

    with TestClient(app) as client:
        response = client.post(
            "/internal/v1/responses",
            content=body,
            headers=headers,
        )

    assert response.status_code == 422
    assert provider.generate_calls == 0


def test_provider_errors_are_safe_and_preserve_cost_disposition(settings) -> None:
    provider = FakeProvider()
    provider.error = AiServiceError(
        504,
        "PROVIDER_TIMEOUT",
        "The AI provider did not respond in time",
        "HOLD",
    )
    app = create_app(settings, provider=provider)
    body = compact_json(customer_request())
    headers = signed_headers(
        body=body,
        method="POST",
        path="/internal/v1/responses",
    )

    with TestClient(app) as client:
        response = client.post(
            "/internal/v1/responses",
            content=body,
            headers=headers,
        )

    assert response.status_code == 504
    assert response.json()["error"] == {
        "code": "PROVIDER_TIMEOUT",
        "message": "The AI provider did not respond in time",
        "costDisposition": "HOLD",
    }


def test_no_cors_middleware_or_public_docs_are_exposed(settings) -> None:
    app = create_app(settings)

    with TestClient(app) as client:
        options = client.options(
            "/internal/v1/health",
            headers={"Origin": "https://attacker.example"},
        )
        docs = client.get("/docs")
        schema = client.get("/openapi.json")

    assert "access-control-allow-origin" not in options.headers
    assert docs.status_code == 404
    assert schema.status_code == 404
