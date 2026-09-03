import asyncio
import json
from copy import deepcopy
from typing import Any

import httpx
import pytest

from opspilot_ai.constants import XAI_MODEL, XAI_MODEL_URL, XAI_RESPONSES_URL
from opspilot_ai.errors import AiServiceError
from opspilot_ai.prompts import RenderedPrompt
from opspilot_ai.providers import GrokResponsesProvider, ProviderReadiness

from .conftest import make_settings


def model_payload(**overrides: Any) -> dict[str, Any]:
    value = {
        "id": XAI_MODEL,
        "object": "model",
        "prompt_text_token_price": 20_000,
        "completion_text_token_price": 60_000,
    }
    value.update(overrides)
    return value


def response_payload() -> dict[str, Any]:
    return {
        "id": "resp_phase7_123",
        "status": "completed",
        "model": XAI_MODEL,
        "store": False,
        "previous_response_id": None,
        "error": None,
        "tools": [],
        "output": [
            {"type": "reasoning", "summary": []},
            {
                "type": "message",
                "role": "assistant",
                "status": "completed",
                "content": [
                    {
                        "type": "output_text",
                        "text": json.dumps(
                            {
                                "answer": "Use the Support area to create a ticket.",
                                "outcome": "ANSWER",
                                "notices": ["USE_STANDARD_SUPPORT"],
                            }
                        ),
                    }
                ],
            },
        ],
        "usage": {
            "input_tokens": 100,
            "output_tokens": 40,
            "total_tokens": 140,
            "cost_in_usd_ticks": 150_000,
            "num_server_side_tools_used": 0,
        },
    }


def provider_settings():
    return make_settings(AI_PROVIDER_ENABLED=True, XAI_API_KEY="xai-test-only")


def run(coroutine):
    return asyncio.run(coroutine)


def test_preflight_and_success_use_exact_grok_policy() -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.method == "GET":
            return httpx.Response(
                200,
                headers={"x-zero-data-retention": "true"},
                json=model_payload(),
            )
        return httpx.Response(
            200,
            headers={"x-zero-data-retention": "true"},
            json=response_payload(),
        )

    async def exercise():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GrokResponsesProvider(provider_settings(), client=client)
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
    assert result.usage.cost_in_usd_ticks == 150_000
    assert requests[0].url == httpx.URL(XAI_MODEL_URL)
    assert requests[1].url == httpx.URL(XAI_RESPONSES_URL)
    assert requests[1].headers["authorization"] == "Bearer xai-test-only"
    body = json.loads(requests[1].content)
    assert body["model"] == "grok-4.6"
    assert body["reasoning"] == {"effort": "low"}
    assert body["store"] is False
    assert body["max_output_tokens"] == 500
    assert body["text"]["format"]["type"] == "json_schema"
    assert body["text"]["format"]["strict"] is True
    assert body["text"]["format"]["schema"]["additionalProperties"] is False
    for forbidden in (
        "tools",
        "include",
        "previous_response_id",
        "file_id",
        "metadata",
        "user",
    ):
        assert forbidden not in body


@pytest.mark.parametrize(
    "override",
    [
        {"prompt_text_token_price": 20_001},
        {"completion_text_token_price": 60_001},
        {"prompt_text_token_price": "20000"},
        {"id": "another-model"},
    ],
)
def test_preflight_rejects_unverified_model_or_price(override: dict[str, Any]) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(
            200,
            headers={"x-zero-data-retention": "true"},
            json=model_payload(**override),
        )

    async def exercise() -> tuple[GrokResponsesProvider, AiServiceError]:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GrokResponsesProvider(provider_settings(), client=client)
            with pytest.raises(AiServiceError) as raised:
                await provider.preflight()
            return provider, raised.value

    provider, error = run(exercise())
    assert provider.state == ProviderReadiness.UNAVAILABLE
    assert error.code.startswith("PROVIDER_")


def test_preflight_requires_zero_data_retention_header() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(200, json=model_payload())

    async def exercise() -> tuple[GrokResponsesProvider, AiServiceError]:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GrokResponsesProvider(provider_settings(), client=client)
            with pytest.raises(AiServiceError) as raised:
                await provider.preflight()
            return provider, raised.value

    provider, error = run(exercise())
    assert provider.state == ProviderReadiness.UNAVAILABLE
    assert error.code == "PROVIDER_RETENTION_UNVERIFIED"


def test_inference_requires_successful_preflight() -> None:
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(500, request=request)

    async def exercise() -> AiServiceError:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GrokResponsesProvider(provider_settings(), client=client)
            with pytest.raises(AiServiceError) as raised:
                await provider.generate(RenderedPrompt("v1", "system", "user"))
            return raised.value

    error = run(exercise())
    assert error.code == "PROVIDER_NOT_READY"
    assert calls == 0


@pytest.mark.parametrize(
    ("status", "expected_code"),
    [
        (401, "PROVIDER_AUTHENTICATION_FAILED"),
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
            return httpx.Response(
                200,
                headers={"x-zero-data-retention": "true"},
                json=model_payload(),
            )
        return httpx.Response(
            status,
            headers={"x-zero-data-retention": "true", "location": "https://evil.example"},
            json={"error": {"message": "secret provider detail"}},
        )

    async def exercise() -> AiServiceError:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler),
            follow_redirects=False,
        ) as client:
            provider = GrokResponsesProvider(provider_settings(), client=client)
            await provider.preflight()
            with pytest.raises(AiServiceError) as raised:
                await provider.generate(RenderedPrompt("v1", "system", "user"))
            return raised.value

    error = run(exercise())
    assert error.code == expected_code
    assert "secret provider detail" not in str(error)
    assert calls == 2


def test_timeout_is_ambiguous_and_never_retried() -> None:
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(
                200,
                headers={"x-zero-data-retention": "true"},
                json=model_payload(),
            )
        raise httpx.ReadTimeout("timed out", request=request)

    async def exercise() -> AiServiceError:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GrokResponsesProvider(provider_settings(), client=client)
            await provider.preflight()
            with pytest.raises(AiServiceError) as raised:
                await provider.generate(RenderedPrompt("v1", "system", "user"))
            return raised.value

    error = run(exercise())
    assert error.code == "PROVIDER_TIMEOUT"
    assert error.cost_disposition == "HOLD"
    assert calls == 2


def test_inference_rechecks_zero_data_retention() -> None:
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(
                200,
                headers={"x-zero-data-retention": "true"},
                json=model_payload(),
            )
        return httpx.Response(
            200,
            headers={"x-zero-data-retention": "false"},
            json=response_payload(),
        )

    async def exercise() -> AiServiceError:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GrokResponsesProvider(provider_settings(), client=client)
            await provider.preflight()
            with pytest.raises(AiServiceError) as raised:
                await provider.generate(RenderedPrompt("v1", "system", "user"))
            return raised.value

    error = run(exercise())
    assert error.code == "PROVIDER_RETENTION_UNVERIFIED"
    assert error.cost_disposition == "HOLD"


@pytest.mark.parametrize(
    "mutation",
    [
        "wrong_model",
        "stored",
        "tool_output",
        "reasoning_content",
        "invalid_plain_text",
        "missing_cost",
        "string_cost",
        "token_mismatch",
        "too_many_output_tokens",
        "duplicate_structured_property",
    ],
)
def test_malformed_or_overbroad_provider_output_fails_closed(mutation: str) -> None:
    calls = 0
    payload = deepcopy(response_payload())
    if mutation == "wrong_model":
        payload["model"] = "other"
    elif mutation == "stored":
        payload["store"] = True
    elif mutation == "tool_output":
        payload["output"].append({"type": "web_search_call"})
    elif mutation == "reasoning_content":
        payload["output"][0]["summary"] = [{"type": "summary_text", "text": "trace"}]
    elif mutation == "invalid_plain_text":
        output = payload["output"][1]["content"][0]
        output["text"] = json.dumps(
            {"answer": "https://unsafe.example", "outcome": "ANSWER", "notices": []}
        )
    elif mutation == "missing_cost":
        del payload["usage"]["cost_in_usd_ticks"]
    elif mutation == "string_cost":
        payload["usage"]["cost_in_usd_ticks"] = "150000"
    elif mutation == "token_mismatch":
        payload["usage"]["total_tokens"] = 139
    elif mutation == "too_many_output_tokens":
        payload["usage"]["output_tokens"] = 501
        payload["usage"]["total_tokens"] = 601
    elif mutation == "duplicate_structured_property":
        payload["output"][1]["content"][0]["text"] = (
            '{"answer":"one","answer":"two","outcome":"ANSWER","notices":[]}'
        )

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        body = model_payload() if calls == 1 else payload
        return httpx.Response(
            200,
            headers={"x-zero-data-retention": "true"},
            json=body,
        )

    async def exercise() -> AiServiceError:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GrokResponsesProvider(provider_settings(), client=client)
            await provider.preflight()
            with pytest.raises(AiServiceError) as raised:
                await provider.generate(RenderedPrompt("v1", "system", "user"))
            return raised.value

    error = run(exercise())
    assert error.code == "PROVIDER_RESPONSE_INVALID"
    assert error.cost_disposition == "HOLD"
    assert calls == 2
