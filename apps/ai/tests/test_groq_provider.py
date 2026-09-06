import asyncio
import json
from copy import deepcopy
from typing import Any

import httpx
import pytest

from opspilot_ai.constants import (
    GROQ_CHAT_COMPLETIONS_URL,
    GROQ_MODEL,
    GROQ_MODELS_URL,
)
from opspilot_ai.errors import AiServiceError
from opspilot_ai.prompts import RenderedPrompt
from opspilot_ai.providers import GroqChatCompletionsProvider, ProviderReadiness

from .conftest import make_settings


def models_payload(*models: dict[str, Any]) -> dict[str, Any]:
    listed = models or (
        {
            "id": GROQ_MODEL,
            "object": "model",
            "active": True,
            "owned_by": "OpenAI",
        },
    )
    return {"object": "list", "data": list(listed)}


def response_payload() -> dict[str, Any]:
    return {
        "id": "chatcmpl_phase7_123",
        "object": "chat.completion",
        "model": GROQ_MODEL,
        "choices": [
            {
                "index": 0,
                "finish_reason": "stop",
                "message": {
                    "role": "assistant",
                    "content": json.dumps(
                        {
                            "answer": "Use the Support area to create a ticket.",
                            "outcome": "ANSWER",
                            "notices": ["USE_STANDARD_SUPPORT"],
                        }
                    ),
                },
            }
        ],
        "usage": {
            "prompt_tokens": 100,
            "completion_tokens": 40,
            "total_tokens": 140,
            "prompt_tokens_details": {"cached_tokens": 20},
        },
    }


def provider_settings():
    return make_settings(
        AI_PROVIDER_ENABLED=True,
        GROQ_API_KEY="gsk_test_only",
        GROQ_ZERO_DATA_RETENTION_CONFIRMED=True,
    )


def run(coroutine):
    return asyncio.run(coroutine)


def test_preflight_and_success_use_exact_groq_policy_and_calculate_cost() -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json=models_payload() if request.method == "GET" else response_payload(),
        )

    async def exercise():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GroqChatCompletionsProvider(provider_settings(), client=client)
            await provider.preflight()
            result = await provider.generate(
                RenderedPrompt(
                    version="customer-help-v1",
                    system="Fixed system policy",
                    user="UNTRUSTED QUESTION:\nHow do I get support?",
                )
            )
            return provider, result

    provider, result = run(exercise())

    assert provider.state == ProviderReadiness.READY
    assert result.output.answer == "Use the Support area to create a ticket."
    assert result.model == GROQ_MODEL
    assert result.zero_data_retention is True
    assert result.usage.cost_in_usd_ticks == 375_000
    assert requests[0].url == httpx.URL(GROQ_MODELS_URL)
    assert requests[1].url == httpx.URL(GROQ_CHAT_COMPLETIONS_URL)
    assert requests[1].headers["authorization"] == "Bearer gsk_test_only"
    body = json.loads(requests[1].content)
    assert body["model"] == GROQ_MODEL
    assert body["messages"] == [
        {"role": "system", "content": "Fixed system policy"},
        {"role": "user", "content": "UNTRUSTED QUESTION:\nHow do I get support?"},
    ]
    assert body["reasoning_effort"] == "low"
    assert body["include_reasoning"] is False
    assert body["max_completion_tokens"] == 500
    assert body["n"] == 1
    assert body["stream"] is False
    assert body["tool_choice"] == "none"
    assert body["citation_options"] == "disabled"
    schema = body["response_format"]["json_schema"]
    assert schema["strict"] is True
    assert schema["schema"]["additionalProperties"] is False
    assert schema["schema"]["properties"]["answer"] == {"type": "string"}
    assert set(schema["schema"]["properties"]["notices"]) == {"type", "items"}
    for forbidden in (
        "tools",
        "store",
        "metadata",
        "user",
        "search_settings",
        "reasoning_format",
    ):
        assert forbidden not in body


def test_document_prompt_uses_the_citation_schema_and_validates_labels() -> None:
    payload = response_payload()
    payload["choices"][0]["message"]["content"] = json.dumps(
        {
            "answer": "Returns are accepted within 30 days.",
            "outcome": "ANSWER",
            "citations": ["S1"],
            "notices": [],
        }
    )
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=models_payload() if len(requests) == 1 else payload)

    async def exercise():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GroqChatCompletionsProvider(provider_settings(), client=client)
            await provider.preflight()
            return await provider.generate(
                RenderedPrompt("customer-documents-v1", "system", "sources", True)
            )

    result = run(exercise())
    schema = json.loads(requests[1].content)["response_format"]["json_schema"]["schema"]
    assert schema["required"] == ["answer", "outcome", "citations", "notices"]
    assert schema["properties"]["answer"]["type"] == "string"
    assert "Non-empty plain text" in schema["properties"]["answer"]["description"]
    assert set(schema["properties"]["citations"]) == {"type", "items", "description"}
    assert set(schema["properties"]["notices"]) == {"type", "items"}
    assert result.output.citations == ["S1"]


@pytest.mark.parametrize(
    "payload",
    [
        {"object": "wrong", "data": []},
        {"object": "list", "data": []},
        models_payload({"id": "other", "object": "model", "active": True}),
        models_payload({"id": GROQ_MODEL, "object": "wrong", "active": True}),
        models_payload({"id": GROQ_MODEL, "object": "model", "active": False}),
        models_payload(
            {"id": GROQ_MODEL, "object": "model", "active": True},
            {"id": GROQ_MODEL, "object": "model", "active": True},
        ),
    ],
)
def test_preflight_rejects_unavailable_or_ambiguous_model(payload: dict[str, Any]) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(200, json=payload)

    async def exercise() -> tuple[GroqChatCompletionsProvider, AiServiceError]:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GroqChatCompletionsProvider(provider_settings(), client=client)
            with pytest.raises(AiServiceError) as raised:
                await provider.preflight()
            return provider, raised.value

    provider, error = run(exercise())
    assert provider.state == ProviderReadiness.UNAVAILABLE
    assert error.code == "PROVIDER_MODEL_UNAVAILABLE"


def test_preflight_requires_operator_zero_data_retention_confirmation_without_network() -> None:
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, request=request, json=models_payload())

    settings = make_settings(GROQ_API_KEY="gsk_test_only")

    async def exercise() -> tuple[GroqChatCompletionsProvider, AiServiceError]:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GroqChatCompletionsProvider(settings, client=client)
            with pytest.raises(AiServiceError) as raised:
                await provider.preflight()
            return provider, raised.value

    provider, error = run(exercise())
    assert provider.state == ProviderReadiness.UNAVAILABLE
    assert error.code == "PROVIDER_RETENTION_UNVERIFIED"
    assert error.cost_disposition == "HOLD"
    assert calls == 0


def test_inference_requires_successful_preflight() -> None:
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(500, request=request)

    async def exercise() -> AiServiceError:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GroqChatCompletionsProvider(provider_settings(), client=client)
            with pytest.raises(AiServiceError) as raised:
                await provider.generate(RenderedPrompt("v1", "system", "user"))
            return raised.value

    error = run(exercise())
    assert error.code == "PROVIDER_NOT_READY"
    assert calls == 0


@pytest.mark.parametrize(
    ("status", "expected_code"),
    [
        (400, "PROVIDER_REQUEST_REJECTED"),
        (401, "PROVIDER_AUTHENTICATION_FAILED"),
        (403, "PROVIDER_AUTHENTICATION_FAILED"),
        (429, "PROVIDER_RATE_LIMITED"),
        (500, "PROVIDER_UNAVAILABLE"),
        (302, "PROVIDER_REQUEST_REJECTED"),
    ],
)
def test_provider_http_errors_are_mapped_without_body_leakage(
    status: int,
    expected_code: str,
) -> None:
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(200, json=models_payload())
        return httpx.Response(
            status,
            headers={"location": "https://evil.example"},
            json={"error": {"message": "secret provider detail"}},
        )

    async def exercise() -> AiServiceError:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler),
            follow_redirects=False,
        ) as client:
            provider = GroqChatCompletionsProvider(provider_settings(), client=client)
            await provider.preflight()
            with pytest.raises(AiServiceError) as raised:
                await provider.generate(RenderedPrompt("v1", "system", "user"))
            return raised.value

    error = run(exercise())
    assert error.code == expected_code
    assert "secret provider detail" not in str(error)
    assert calls == 2


def test_preflight_maps_http_error_before_parsing_body() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, request=request, content=b"not-json")

    async def exercise() -> AiServiceError:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GroqChatCompletionsProvider(provider_settings(), client=client)
            with pytest.raises(AiServiceError) as raised:
                await provider.preflight()
            return raised.value

    assert run(exercise()).code == "PROVIDER_AUTHENTICATION_FAILED"


def test_timeout_is_ambiguous_and_never_retried() -> None:
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(200, json=models_payload())
        raise httpx.ReadTimeout("timed out", request=request)

    async def exercise() -> AiServiceError:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GroqChatCompletionsProvider(provider_settings(), client=client)
            await provider.preflight()
            with pytest.raises(AiServiceError) as raised:
                await provider.generate(RenderedPrompt("v1", "system", "user"))
            return raised.value

    error = run(exercise())
    assert error.code == "PROVIDER_TIMEOUT"
    assert error.cost_disposition == "HOLD"
    assert calls == 2


def test_connection_failure_is_ambiguous_and_never_retried() -> None:
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ConnectError("offline", request=request)

    async def exercise() -> AiServiceError:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GroqChatCompletionsProvider(provider_settings(), client=client)
            with pytest.raises(AiServiceError) as raised:
                await provider.preflight()
            return raised.value

    error = run(exercise())
    assert error.code == "PROVIDER_CONNECTION_FAILED"
    assert error.cost_disposition == "HOLD"
    assert calls == 1


@pytest.mark.parametrize(
    "mutation",
    [
        "wrong_object",
        "wrong_model",
        "bad_id",
        "multiple_choices",
        "wrong_index",
        "length_finish",
        "wrong_role",
        "tool_call",
        "invalid_plain_text",
        "missing_usage",
        "string_tokens",
        "token_mismatch",
        "too_many_output_tokens",
        "cached_exceeds_prompt",
        "invalid_prompt_details",
        "duplicate_structured_property",
    ],
)
def test_malformed_or_overbroad_provider_output_fails_closed(mutation: str) -> None:
    calls = 0
    payload = deepcopy(response_payload())
    if mutation == "wrong_object":
        payload["object"] = "response"
    elif mutation == "wrong_model":
        payload["model"] = "other"
    elif mutation == "bad_id":
        payload["id"] = "bad id"
    elif mutation == "multiple_choices":
        payload["choices"].append(deepcopy(payload["choices"][0]))
    elif mutation == "wrong_index":
        payload["choices"][0]["index"] = 1
    elif mutation == "length_finish":
        payload["choices"][0]["finish_reason"] = "length"
    elif mutation == "wrong_role":
        payload["choices"][0]["message"]["role"] = "tool"
    elif mutation == "tool_call":
        payload["choices"][0]["message"]["tool_calls"] = [{"id": "call_1"}]
    elif mutation == "invalid_plain_text":
        payload["choices"][0]["message"]["content"] = json.dumps(
            {"answer": "https://unsafe.example", "outcome": "ANSWER", "notices": []}
        )
    elif mutation == "missing_usage":
        del payload["usage"]
    elif mutation == "string_tokens":
        payload["usage"]["prompt_tokens"] = "100"
    elif mutation == "token_mismatch":
        payload["usage"]["total_tokens"] = 139
    elif mutation == "too_many_output_tokens":
        payload["usage"]["completion_tokens"] = 501
        payload["usage"]["total_tokens"] = 601
    elif mutation == "cached_exceeds_prompt":
        payload["usage"]["prompt_tokens_details"]["cached_tokens"] = 101
    elif mutation == "invalid_prompt_details":
        payload["usage"]["prompt_tokens_details"] = []
    elif mutation == "duplicate_structured_property":
        payload["choices"][0]["message"]["content"] = (
            '{"answer":"one","answer":"two","outcome":"ANSWER","notices":[]}'
        )

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=models_payload() if calls == 1 else payload)

    async def exercise() -> AiServiceError:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GroqChatCompletionsProvider(provider_settings(), client=client)
            await provider.preflight()
            with pytest.raises(AiServiceError) as raised:
                await provider.generate(RenderedPrompt("v1", "system", "user"))
            return raised.value

    error = run(exercise())
    assert error.code == "PROVIDER_RESPONSE_INVALID"
    assert error.cost_disposition == "HOLD"
    assert calls == 2


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, content=b"not-json"),
        httpx.Response(200, content=b'{"object":"list","object":"duplicate"}'),
        httpx.Response(200, headers={"content-length": "invalid"}, content=b"{}"),
        httpx.Response(200, headers={"content-length": "262145"}, content=b"{}"),
        httpx.Response(200, content=b"x" * 262_145),
    ],
)
def test_preflight_rejects_malformed_or_oversized_provider_json(response: httpx.Response) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        response.request = request
        return response

    async def exercise() -> AiServiceError:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GroqChatCompletionsProvider(provider_settings(), client=client)
            with pytest.raises(AiServiceError) as raised:
                await provider.preflight()
            return raised.value

    error = run(exercise())
    assert error.code == "PROVIDER_RESPONSE_INVALID"


def test_usage_without_cache_details_uses_standard_input_price() -> None:
    payload = response_payload()
    del payload["usage"]["prompt_tokens_details"]
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=models_payload() if calls == 1 else payload)

    async def exercise():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GroqChatCompletionsProvider(provider_settings(), client=client)
            await provider.preflight()
            return await provider.generate(RenderedPrompt("v1", "system", "user"))

    result = run(exercise())
    assert result.usage.cost_in_usd_ticks == 390_000
