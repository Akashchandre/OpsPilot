import asyncio
import logging
from dataclasses import dataclass
from time import monotonic

from .constants import AssistantIntent
from .contracts import (
    DocumentContext,
    DocumentStructuredProviderOutput,
    InternalResponseRequest,
    StructuredProviderOutput,
)
from .errors import AiServiceError
from .logging_config import log_event
from .prompts import render_prompt
from .providers import ProviderResult, ResponseProvider


@dataclass(frozen=True, slots=True)
class AiResponseResult:
    provider: ProviderResult
    prompt_version: str
    duration_ms: int


class AiResponseService:
    def __init__(
        self,
        provider: ResponseProvider,
        *,
        maximum_concurrency: int,
        logger: logging.Logger,
    ) -> None:
        self._provider = provider
        self._semaphore = asyncio.Semaphore(maximum_concurrency)
        self._logger = logger

    async def respond(
        self,
        request: InternalResponseRequest,
        *,
        request_id: str,
    ) -> AiResponseResult:
        prompt = render_prompt(request)
        started = monotonic()
        try:
            async with self._semaphore:
                provider_result = await self._provider.generate(prompt)
            document_request = request.intent in {
                AssistantIntent.CUSTOMER_DOCUMENT_QA,
                AssistantIntent.OWNER_DOCUMENT_QA,
            }
            if document_request:
                if not isinstance(
                    provider_result.output, DocumentStructuredProviderOutput
                ) or not isinstance(request.context, DocumentContext):
                    raise AiServiceError(
                        502,
                        "PROVIDER_RESPONSE_INVALID",
                        "The AI provider returned an invalid response",
                        "HOLD",
                    )
                allowed_labels = {source.label for source in request.context.sources}
                if any(label not in allowed_labels for label in provider_result.output.citations):
                    raise AiServiceError(
                        502,
                        "PROVIDER_RESPONSE_INVALID",
                        "The AI provider returned an invalid response",
                        "HOLD",
                    )
            elif not isinstance(provider_result.output, StructuredProviderOutput):
                raise AiServiceError(
                    502,
                    "PROVIDER_RESPONSE_INVALID",
                    "The AI provider returned an invalid response",
                    "HOLD",
                )
        except AiServiceError as error:
            duration_ms = round((monotonic() - started) * 1_000)
            log_event(
                self._logger,
                logging.WARNING,
                "ai_response_failed",
                request_id=request_id,
                assistant=request.assistant.value,
                intent=request.intent.value,
                prompt_version=prompt.version,
                error_code=error.code,
                duration_ms=duration_ms,
            )
            raise

        duration_ms = round((monotonic() - started) * 1_000)
        usage = provider_result.usage
        log_event(
            self._logger,
            logging.INFO,
            "ai_response_completed",
            request_id=request_id,
            assistant=request.assistant.value,
            intent=request.intent.value,
            prompt_version=prompt.version,
            model=provider_result.model,
            status=provider_result.output.outcome.value,
            duration_ms=duration_ms,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            total_tokens=usage.total_tokens,
            cost_in_usd_ticks=usage.cost_in_usd_ticks,
            zero_data_retention=provider_result.zero_data_retention,
        )
        return AiResponseResult(
            provider=provider_result,
            prompt_version=prompt.version,
            duration_ms=duration_ms,
        )
