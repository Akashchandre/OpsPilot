import json
import re
from typing import Any

import httpx
from pydantic import ValidationError

from ..config import AiSettings
from ..constants import (
    XAI_MODEL,
    XAI_MODEL_URL,
    XAI_REASONING_EFFORT,
    XAI_RESPONSES_URL,
)
from ..contracts import PROVIDER_OUTPUT_JSON_SCHEMA, StructuredProviderOutput
from ..errors import AiServiceError
from ..prompts import RenderedPrompt
from .base import ProviderReadiness, ProviderResult, ProviderUsage

MAX_PROVIDER_RESPONSE_BYTES = 262_144
MAX_PROVIDER_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
MAX_SAFE_INTEGER = 9_007_199_254_740_991
MAX_INPUT_TOKENS = 100_000
MAX_STANDARD_INPUT_PRICE = 20_000
MAX_STANDARD_OUTPUT_PRICE = 60_000


class GrokResponsesProvider:
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
                settings.xai_request_timeout_ms / 1_000,
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
        key = self._settings.xai_api_key
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

    @staticmethod
    def _require_zero_data_retention(response: httpx.Response) -> None:
        if response.headers.get("x-zero-data-retention", "").lower() != "true":
            raise AiServiceError(
                503,
                "PROVIDER_RETENTION_UNVERIFIED",
                "The AI provider privacy requirement could not be verified",
                "HOLD",
            )

    @staticmethod
    def _json_object(response: httpx.Response) -> dict[str, Any]:
        content_length = response.headers.get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > MAX_PROVIDER_RESPONSE_BYTES:
                    raise AiServiceError(
                        502,
                        "PROVIDER_RESPONSE_INVALID",
                        "The AI provider returned an invalid response",
                        "HOLD",
                    )
            except ValueError as error:
                raise AiServiceError(
                    502,
                    "PROVIDER_RESPONSE_INVALID",
                    "The AI provider returned an invalid response",
                    "HOLD",
                ) from error
        if len(response.content) > MAX_PROVIDER_RESPONSE_BYTES:
            raise AiServiceError(
                502,
                "PROVIDER_RESPONSE_INVALID",
                "The AI provider returned an invalid response",
                "HOLD",
            )
        try:
            payload = GrokResponsesProvider._strict_json_loads(response.content)
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
            raise AiServiceError(
                502,
                "PROVIDER_RESPONSE_INVALID",
                "The AI provider returned an invalid response",
                "HOLD",
            ) from error
        if not isinstance(payload, dict):
            raise AiServiceError(
                502,
                "PROVIDER_RESPONSE_INVALID",
                "The AI provider returned an invalid response",
                "HOLD",
            )
        return payload

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

    async def preflight(self) -> None:
        try:
            response = await self._request(
                "GET",
                XAI_MODEL_URL,
                headers=self._headers(),
            )
            self._require_zero_data_retention(response)
            self._map_http_error(response)
            payload = self._json_object(response)
            if payload.get("id") != XAI_MODEL or payload.get("object") != "model":
                raise AiServiceError(
                    503,
                    "PROVIDER_MODEL_UNAVAILABLE",
                    "The configured AI model is unavailable",
                )
            self._require_price_bound(
                payload.get("prompt_text_token_price"),
                MAX_STANDARD_INPUT_PRICE,
            )
            self._require_price_bound(
                payload.get("completion_text_token_price"),
                MAX_STANDARD_OUTPUT_PRICE,
            )
        except AiServiceError:
            self._state = ProviderReadiness.UNAVAILABLE
            raise
        self._state = ProviderReadiness.READY

    @staticmethod
    def _require_price_bound(value: Any, maximum: int) -> None:
        if isinstance(value, bool) or not isinstance(value, int):
            raise AiServiceError(
                503,
                "PROVIDER_PRICE_UNVERIFIED",
                "The AI provider price could not be verified",
            )
        if value < 0 or value > maximum:
            raise AiServiceError(
                503,
                "PROVIDER_PRICE_EXCEEDS_POLICY",
                "The AI provider price exceeds the configured policy",
            )

    async def generate(self, prompt: RenderedPrompt) -> ProviderResult:
        if self._state != ProviderReadiness.READY:
            raise AiServiceError(
                503,
                "PROVIDER_NOT_READY",
                "The AI provider is unavailable",
            )

        request_payload = {
            "model": XAI_MODEL,
            "input": [
                {"role": "system", "content": prompt.system},
                {"role": "user", "content": prompt.user},
            ],
            "reasoning": {"effort": XAI_REASONING_EFFORT},
            "store": False,
            "max_output_tokens": self._settings.xai_max_output_tokens,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "opspilot_ai_response",
                    "schema": PROVIDER_OUTPUT_JSON_SCHEMA,
                    "strict": True,
                }
            },
        }
        response = await self._request(
            "POST",
            XAI_RESPONSES_URL,
            headers=self._headers(),
            json=request_payload,
        )
        self._require_zero_data_retention(response)
        self._map_http_error(response)
        payload = self._json_object(response)
        return self._parse_response(payload)

    def _parse_response(self, payload: dict[str, Any]) -> ProviderResult:
        if (
            payload.get("status") != "completed"
            or payload.get("model") != XAI_MODEL
            or payload.get("store") is not False
            or payload.get("previous_response_id") is not None
            or payload.get("error") is not None
        ):
            raise self._invalid_response()
        tools = payload.get("tools", [])
        if tools != []:
            raise self._invalid_response()

        provider_request_id = payload.get("id")
        if not isinstance(provider_request_id, str) or not MAX_PROVIDER_IDENTIFIER.fullmatch(
            provider_request_id
        ):
            raise self._invalid_response()

        output = payload.get("output")
        if not isinstance(output, list) or not 1 <= len(output) <= 8:
            raise self._invalid_response()
        messages: list[dict[str, Any]] = []
        for item in output:
            if not isinstance(item, dict):
                raise self._invalid_response()
            item_type = item.get("type")
            if item_type == "message":
                messages.append(item)
            elif item_type == "reasoning":
                if (
                    item.get("encrypted_content") not in (None, "")
                    or item.get("content") not in (None, [])
                    or item.get("summary") not in (None, [])
                ):
                    raise self._invalid_response()
            else:
                raise self._invalid_response()
        if len(messages) != 1:
            raise self._invalid_response()

        message = messages[0]
        if message.get("role") != "assistant" or message.get("status") != "completed":
            raise self._invalid_response()
        content = message.get("content")
        if not isinstance(content, list) or len(content) != 1:
            raise self._invalid_response()
        text_item = content[0]
        if not isinstance(text_item, dict) or text_item.get("type") != "output_text":
            raise self._invalid_response()
        text = text_item.get("text")
        if not isinstance(text, str):
            raise self._invalid_response()
        try:
            structured_payload = self._strict_json_loads(text)
            structured_output = StructuredProviderOutput.model_validate(structured_payload)
        except (json.JSONDecodeError, ValidationError, ValueError) as error:
            raise self._invalid_response() from error

        usage = self._parse_usage(payload.get("usage"))
        return ProviderResult(
            output=structured_output,
            model=XAI_MODEL,
            request_id=provider_request_id,
            usage=usage,
            zero_data_retention=True,
        )

    def _parse_usage(self, value: Any) -> ProviderUsage:
        if not isinstance(value, dict):
            raise self._invalid_response()
        input_tokens = self._bounded_integer(value.get("input_tokens"), maximum=MAX_INPUT_TOKENS)
        output_tokens = self._bounded_integer(
            value.get("output_tokens"),
            maximum=self._settings.xai_max_output_tokens,
        )
        total_tokens = self._bounded_integer(
            value.get("total_tokens"),
            maximum=MAX_INPUT_TOKENS + self._settings.xai_max_output_tokens,
        )
        cost_ticks = self._bounded_integer(
            value.get("cost_in_usd_ticks"),
            maximum=MAX_SAFE_INTEGER,
        )
        if total_tokens != input_tokens + output_tokens:
            raise self._invalid_response()
        tools_used = value.get("num_server_side_tools_used", 0)
        if tools_used != 0:
            raise self._invalid_response()
        return ProviderUsage(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            cost_in_usd_ticks=cost_ticks,
        )

    @staticmethod
    def _bounded_integer(value: Any, *, maximum: int) -> int:
        if isinstance(value, bool) or not isinstance(value, int):
            raise GrokResponsesProvider._invalid_response()
        if value < 0 or value > maximum:
            raise GrokResponsesProvider._invalid_response()
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
