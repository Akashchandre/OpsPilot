import json
import re
from typing import Any

import httpx
from pydantic import ValidationError

from ..config import AiSettings
from ..constants import (
    GROQ_CACHED_INPUT_COST_TICKS_PER_TOKEN,
    GROQ_CHAT_COMPLETIONS_URL,
    GROQ_INPUT_COST_TICKS_PER_TOKEN,
    GROQ_MODEL,
    GROQ_MODELS_URL,
    GROQ_OUTPUT_COST_TICKS_PER_TOKEN,
    GROQ_REASONING_EFFORT,
)
from ..contracts import (
    DOCUMENT_PROVIDER_OUTPUT_JSON_SCHEMA,
    PROVIDER_OUTPUT_JSON_SCHEMA,
    DocumentStructuredProviderOutput,
    StructuredProviderOutput,
)
from ..errors import AiServiceError
from ..prompts import RenderedPrompt
from .base import ProviderReadiness, ProviderResult, ProviderUsage

MAX_PROVIDER_RESPONSE_BYTES = 262_144
MAX_PROVIDER_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
MAX_SAFE_INTEGER = 9_007_199_254_740_991
MAX_INPUT_TOKENS = 100_000
MAX_LISTED_MODELS = 512
MAX_INPUT_COST_TICKS_PER_TOKEN = 20_000
MAX_OUTPUT_COST_TICKS_PER_TOKEN = 60_000


class GroqChatCompletionsProvider:
    def __init__(
        self,
        settings: AiSettings,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings
        self._state = ProviderReadiness.UNVERIFIED
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            timeout=httpx.Timeout(
                settings.groq_request_timeout_ms / 1_000,
                connect=3.0,
                pool=3.0,
            ),
            follow_redirects=False,
            verify=True,
            limits=httpx.Limits(
                max_connections=settings.max_concurrency,
                max_keepalive_connections=settings.max_concurrency,
            ),
        )

    @property
    def state(self) -> ProviderReadiness:
        return self._state

    def _headers(self) -> dict[str, str]:
        key = self._settings.groq_api_key
        if key is None:
            raise AiServiceError(
                503,
                "PROVIDER_CONFIGURATION_INVALID",
                "The AI provider is not configured",
            )
        return {
            "Authorization": f"Bearer {key.get_secret_value()}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _require_zero_data_retention_confirmation(self) -> None:
        if (
            not self._settings.require_zero_data_retention
            or not self._settings.zero_data_retention_confirmed
        ):
            raise AiServiceError(
                503,
                "PROVIDER_RETENTION_UNVERIFIED",
                "The AI provider privacy requirement could not be verified",
                "HOLD",
            )

    @staticmethod
    def _strict_json_loads(value: str | bytes) -> Any:
        def object_without_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
            result: dict[str, Any] = {}
            for key, item in pairs:
                if key in result:
                    raise ValueError("duplicate JSON property")
                result[key] = item
            return result

        def reject_constant(constant: str) -> None:
            raise ValueError(f"invalid JSON constant: {constant}")

        return json.loads(
            value,
            object_pairs_hook=object_without_duplicates,
            parse_constant=reject_constant,
        )

    @classmethod
    def _json_object(cls, response: httpx.Response) -> dict[str, Any]:
        content_length = response.headers.get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > MAX_PROVIDER_RESPONSE_BYTES:
                    raise cls._invalid_response()
            except ValueError as error:
                raise cls._invalid_response() from error
        if len(response.content) > MAX_PROVIDER_RESPONSE_BYTES:
            raise cls._invalid_response()
        try:
            payload = cls._strict_json_loads(response.content)
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
            raise cls._invalid_response() from error
        if not isinstance(payload, dict):
            raise cls._invalid_response()
        return payload

    @staticmethod
    def _map_http_error(response: httpx.Response) -> None:
        if response.status_code in (401, 403):
            raise AiServiceError(
                503,
                "PROVIDER_AUTHENTICATION_FAILED",
                "The AI provider is unavailable",
            )
        if response.status_code == 429:
            raise AiServiceError(
                503,
                "PROVIDER_RATE_LIMITED",
                "The AI provider is temporarily busy",
            )
        if response.status_code >= 500:
            raise AiServiceError(
                503,
                "PROVIDER_UNAVAILABLE",
                "The AI provider is temporarily unavailable",
            )
        if response.status_code != 200:
            raise AiServiceError(
                502,
                "PROVIDER_REQUEST_REJECTED",
                "The AI provider rejected the request",
            )

    async def _request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        try:
            return await self._client.request(method, url, **kwargs)
        except httpx.TimeoutException as error:
            raise AiServiceError(
                504,
                "PROVIDER_TIMEOUT",
                "The AI provider did not respond in time",
                "HOLD",
            ) from error
        except httpx.HTTPError as error:
            raise AiServiceError(
                503,
                "PROVIDER_CONNECTION_FAILED",
                "The AI provider could not be reached",
                "HOLD",
            ) from error

    @staticmethod
    def _require_reviewed_price_policy() -> None:
        if (
            GROQ_INPUT_COST_TICKS_PER_TOKEN > MAX_INPUT_COST_TICKS_PER_TOKEN
            or GROQ_CACHED_INPUT_COST_TICKS_PER_TOKEN > GROQ_INPUT_COST_TICKS_PER_TOKEN
            or GROQ_OUTPUT_COST_TICKS_PER_TOKEN > MAX_OUTPUT_COST_TICKS_PER_TOKEN
        ):
            raise AiServiceError(
                503,
                "PROVIDER_PRICE_EXCEEDS_POLICY",
                "The AI provider price exceeds the configured policy",
            )

    async def preflight(self) -> None:
        try:
            self._require_zero_data_retention_confirmation()
            self._require_reviewed_price_policy()
            response = await self._request("GET", GROQ_MODELS_URL, headers=self._headers())
            self._map_http_error(response)
            payload = self._json_object(response)
            models = payload.get("data")
            if (
                payload.get("object") != "list"
                or not isinstance(models, list)
                or not 1 <= len(models) <= MAX_LISTED_MODELS
            ):
                raise AiServiceError(
                    503,
                    "PROVIDER_MODEL_UNAVAILABLE",
                    "The configured AI model is unavailable",
                )
            matches = [
                model
                for model in models
                if isinstance(model, dict) and model.get("id") == GROQ_MODEL
            ]
            if (
                len(matches) != 1
                or matches[0].get("object") != "model"
                or matches[0].get("active") is not True
            ):
                raise AiServiceError(
                    503,
                    "PROVIDER_MODEL_UNAVAILABLE",
                    "The configured AI model is unavailable",
                )
        except AiServiceError:
            self._state = ProviderReadiness.UNAVAILABLE
            raise
        self._state = ProviderReadiness.READY

    async def generate(self, prompt: RenderedPrompt) -> ProviderResult:
        if self._state != ProviderReadiness.READY:
            raise AiServiceError(
                503,
                "PROVIDER_NOT_READY",
                "The AI provider is unavailable",
            )
        self._require_zero_data_retention_confirmation()

        request_payload = {
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": prompt.system},
                {"role": "user", "content": prompt.user},
            ],
            "reasoning_effort": GROQ_REASONING_EFFORT,
            "include_reasoning": False,
            "max_completion_tokens": self._settings.groq_max_output_tokens,
            "n": 1,
            "stream": False,
            "tool_choice": "none",
            "citation_options": "disabled",
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "opspilot_ai_response",
                    "strict": True,
                    "schema": (
                        DOCUMENT_PROVIDER_OUTPUT_JSON_SCHEMA
                        if prompt.document_response
                        else PROVIDER_OUTPUT_JSON_SCHEMA
                    ),
                },
            },
        }
        response = await self._request(
            "POST",
            GROQ_CHAT_COMPLETIONS_URL,
            headers=self._headers(),
            json=request_payload,
        )
        self._map_http_error(response)
        payload = self._json_object(response)
        return self._parse_response(payload, document_response=prompt.document_response)

    def _parse_response(
        self, payload: dict[str, Any], *, document_response: bool = False
    ) -> ProviderResult:
        if payload.get("object") != "chat.completion" or payload.get("model") != GROQ_MODEL:
            raise self._invalid_response()

        provider_request_id = payload.get("id")
        if not isinstance(provider_request_id, str) or not MAX_PROVIDER_IDENTIFIER.fullmatch(
            provider_request_id
        ):
            raise self._invalid_response()

        choices = payload.get("choices")
        if not isinstance(choices, list) or len(choices) != 1:
            raise self._invalid_response()
        choice = choices[0]
        if (
            not isinstance(choice, dict)
            or choice.get("index") != 0
            or choice.get("finish_reason") != "stop"
        ):
            raise self._invalid_response()
        message = choice.get("message")
        if not isinstance(message, dict) or message.get("role") != "assistant":
            raise self._invalid_response()
        if message.get("tool_calls") not in (None, []) or message.get("function_call") is not None:
            raise self._invalid_response()
        text = message.get("content")
        if not isinstance(text, str):
            raise self._invalid_response()
        try:
            structured_payload = self._strict_json_loads(text)
            output_contract = (
                DocumentStructuredProviderOutput if document_response else StructuredProviderOutput
            )
            structured_output = output_contract.model_validate(structured_payload)
        except (json.JSONDecodeError, ValidationError, ValueError) as error:
            raise self._invalid_response() from error

        usage = self._parse_usage(payload.get("usage"))
        return ProviderResult(
            output=structured_output,
            model=GROQ_MODEL,
            request_id=provider_request_id,
            usage=usage,
            zero_data_retention=True,
        )

    def _parse_usage(self, value: Any) -> ProviderUsage:
        if not isinstance(value, dict):
            raise self._invalid_response()
        input_tokens = self._bounded_integer(
            value.get("prompt_tokens"),
            maximum=MAX_INPUT_TOKENS,
        )
        output_tokens = self._bounded_integer(
            value.get("completion_tokens"),
            maximum=self._settings.groq_max_output_tokens,
        )
        total_tokens = self._bounded_integer(
            value.get("total_tokens"),
            maximum=MAX_INPUT_TOKENS + self._settings.groq_max_output_tokens,
        )
        if total_tokens != input_tokens + output_tokens:
            raise self._invalid_response()

        details = value.get("prompt_tokens_details")
        if details is None:
            cached_tokens = 0
        elif isinstance(details, dict):
            cached_tokens = self._bounded_integer(
                details.get("cached_tokens", 0),
                maximum=input_tokens,
            )
        else:
            raise self._invalid_response()

        cost_ticks = (
            (input_tokens - cached_tokens) * GROQ_INPUT_COST_TICKS_PER_TOKEN
            + cached_tokens * GROQ_CACHED_INPUT_COST_TICKS_PER_TOKEN
            + output_tokens * GROQ_OUTPUT_COST_TICKS_PER_TOKEN
        )
        if cost_ticks > MAX_SAFE_INTEGER:
            raise self._invalid_response()
        return ProviderUsage(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            cost_in_usd_ticks=cost_ticks,
        )

    @staticmethod
    def _bounded_integer(value: Any, *, maximum: int) -> int:
        if isinstance(value, bool) or not isinstance(value, int) or value < 0 or value > maximum:
            raise GroqChatCompletionsProvider._invalid_response()
        return value

    @staticmethod
    def _invalid_response() -> AiServiceError:
        return AiServiceError(
            502,
            "PROVIDER_RESPONSE_INVALID",
            "The AI provider returned an invalid response",
            "HOLD",
        )

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()
