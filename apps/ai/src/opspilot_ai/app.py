import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from uuid import uuid4

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHttpException

from .config import AiSettings
from .constants import SERVICE_NAME
from .contracts import InternalResponseRequest
from .errors import AiServiceError, invalid_internal_request
from .logging_config import configure_logging, log_event
from .providers import (
    DisabledProvider,
    GroqChatCompletionsProvider,
    ProviderReadiness,
    ResponseProvider,
)
from .rag.contracts import (
    CandidateSearchRequest,
    DeleteDocumentVectorsRequest,
    DocumentPublicationRequest,
    IndexDocumentRequest,
)
from .rag.factory import create_configured_rag_service
from .rag.service import RagIndexService
from .security import InternalRequestVerifier, ReplayCache
from .service import AiResponseService


def _request_id(request: Request) -> str:
    request_id = getattr(request.state, "request_id", None)
    return request_id if isinstance(request_id, str) else str(uuid4())


def _strict_json_object(body: bytes) -> dict[str, Any]:
    def object_without_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        value: dict[str, Any] = {}
        for key, item in pairs:
            if key in value:
                raise ValueError("duplicate JSON property")
            value[key] = item
        return value

    def reject_constant(value: str) -> None:
        raise ValueError(f"invalid JSON constant: {value}")

    try:
        parsed = json.loads(
            body.decode("utf-8"),
            object_pairs_hook=object_without_duplicates,
            parse_constant=reject_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise invalid_internal_request() from error
    if not isinstance(parsed, dict):
        raise invalid_internal_request()
    return parsed


def create_app(
    settings: AiSettings,
    *,
    provider: ResponseProvider | None = None,
    rag_service: RagIndexService | None = None,
) -> FastAPI:
    logger = configure_logging(settings.environment, settings.log_level)
    selected_provider: ResponseProvider
    if provider is not None:
        selected_provider = provider
    elif settings.provider_enabled:
        selected_provider = GroqChatCompletionsProvider(settings)
    else:
        selected_provider = DisabledProvider()

    replay_cache = ReplayCache()
    verifier = InternalRequestVerifier(
        key=settings.signing_key_bytes(),
        key_id=settings.signing_key_id,
        replay_cache=replay_cache,
    )
    document_verifier = InternalRequestVerifier(
        key=settings.signing_key_bytes(),
        key_id=settings.signing_key_id,
        replay_cache=replay_cache,
        maximum_body_bytes=600_000,
    )
    selected_rag_service = rag_service or create_configured_rag_service(settings)
    response_service = AiResponseService(
        selected_provider,
        maximum_concurrency=settings.max_concurrency,
        logger=logger,
    )

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        del application
        if selected_provider.state != ProviderReadiness.DISABLED:
            try:
                await selected_provider.preflight()
                log_event(
                    logger,
                    logging.INFO,
                    "provider_preflight_completed",
                    provider_state=selected_provider.state.value,
                )
            except AiServiceError as error:
                log_event(
                    logger,
                    logging.ERROR,
                    "provider_preflight_failed",
                    provider_state=selected_provider.state.value,
                    error_code=error.code,
                )
        try:
            yield
        finally:
            await selected_provider.aclose()
            if selected_rag_service is not None:
                await run_in_threadpool(selected_rag_service.close)

    app = FastAPI(
        title=SERVICE_NAME,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.provider = selected_provider
    app.state.rag_service = selected_rag_service

    @app.exception_handler(AiServiceError)
    async def handle_service_error(
        request: Request,
        error: AiServiceError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=error.status_code,
            content={
                "success": False,
                "error": {
                    "code": error.code,
                    "message": error.safe_message,
                    "costDisposition": error.cost_disposition,
                },
                "requestId": _request_id(request),
            },
        )

    @app.exception_handler(RequestValidationError)
    async def handle_request_validation(
        request: Request,
        error: RequestValidationError,
    ) -> JSONResponse:
        del error
        return await handle_service_error(request, invalid_internal_request())

    @app.exception_handler(StarletteHttpException)
    async def handle_http_error(
        request: Request,
        error: StarletteHttpException,
    ) -> JSONResponse:
        if error.status_code == 404:
            service_error = AiServiceError(404, "NOT_FOUND", "Route not found")
        elif error.status_code == 405:
            service_error = AiServiceError(405, "METHOD_NOT_ALLOWED", "Method not allowed")
        else:
            service_error = AiServiceError(
                error.status_code,
                "HTTP_ERROR",
                "The request could not be completed",
            )
        return await handle_service_error(request, service_error)

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, error: Exception) -> JSONResponse:
        del error
        request_id = _request_id(request)
        log_event(
            logger,
            logging.ERROR,
            "internal_error",
            request_id=request_id,
            error_code="INTERNAL_ERROR",
        )
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "The AI service could not complete the request",
                    "costDisposition": "HOLD",
                },
                "requestId": request_id,
            },
        )

    @app.get("/internal/v1/health")
    async def health(
        request: Request,
        verified_body: bytes = Depends(verifier.verify),
    ) -> JSONResponse:
        del verified_body
        provider_state = selected_provider.state
        embedding_state = "disabled"
        vector_index_state = "disabled"
        if settings.rag_enabled:
            if selected_rag_service is None:
                embedding_state = "unavailable"
                vector_index_state = "unavailable"
            else:
                try:
                    rag_health = await run_in_threadpool(selected_rag_service.health)
                    embedding_state = rag_health["embedding"]
                    vector_index_state = rag_health["vectorIndex"]
                except Exception:
                    embedding_state = "unavailable"
                    vector_index_state = "unavailable"
        status = (
            "ready"
            if provider_state in (ProviderReadiness.DISABLED, ProviderReadiness.READY)
            and embedding_state != "unavailable"
            and vector_index_state != "unavailable"
            else "unavailable"
        )
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "data": {
                    "service": SERVICE_NAME,
                    "status": status,
                    "provider": provider_state.value,
                    "embedding": embedding_state,
                    "vectorIndex": vector_index_state,
                },
                "requestId": _request_id(request),
            },
        )

    @app.post("/internal/v1/responses")
    async def responses(
        request: Request,
        verified_body: bytes = Depends(verifier.verify),
    ) -> JSONResponse:
        raw_payload = _strict_json_object(verified_body)
        try:
            internal_request = InternalResponseRequest.model_validate(raw_payload)
        except ValidationError as error:
            raise invalid_internal_request() from error

        request_id = _request_id(request)
        result = await response_service.respond(internal_request, request_id=request_id)
        provider_result = result.provider
        usage = provider_result.usage
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "data": {
                    "answer": provider_result.output.answer,
                    "outcome": provider_result.output.outcome.value,
                    "notices": [notice.value for notice in provider_result.output.notices],
                    "citations": getattr(provider_result.output, "citations", []),
                    "promptVersion": result.prompt_version,
                    "model": provider_result.model,
                    "providerRequestId": provider_result.request_id,
                    "usage": {
                        "inputTokens": usage.input_tokens,
                        "outputTokens": usage.output_tokens,
                        "totalTokens": usage.total_tokens,
                        "costInUsdTicks": usage.cost_in_usd_ticks,
                    },
                    "durationMs": result.duration_ms,
                    "zeroDataRetention": provider_result.zero_data_retention,
                },
                "requestId": request_id,
            },
        )

    def require_rag_service() -> RagIndexService:
        if selected_rag_service is None:
            raise AiServiceError(
                503,
                "DOCUMENT_INDEX_DISABLED",
                "The document index is currently disabled",
            )
        return selected_rag_service

    def validated_rag_request(body: bytes, contract: type[Any]) -> Any:
        raw_payload = _strict_json_object(body)
        try:
            return contract.model_validate(raw_payload)
        except ValidationError as error:
            raise invalid_internal_request() from error

    @app.post("/internal/v1/documents/index")
    async def index_document(
        request: Request,
        verified_body: bytes = Depends(document_verifier.verify),
    ) -> JSONResponse:
        internal_request = validated_rag_request(verified_body, IndexDocumentRequest)
        result = await run_in_threadpool(require_rag_service().index_document, internal_request)
        return JSONResponse(
            status_code=200,
            content={"success": True, "data": result, "requestId": _request_id(request)},
        )

    @app.post("/internal/v1/documents/publication")
    async def publish_document(
        request: Request,
        verified_body: bytes = Depends(document_verifier.verify),
    ) -> JSONResponse:
        internal_request = validated_rag_request(verified_body, DocumentPublicationRequest)
        result = await run_in_threadpool(require_rag_service().set_publication, internal_request)
        return JSONResponse(
            status_code=200,
            content={"success": True, "data": result, "requestId": _request_id(request)},
        )

    @app.post("/internal/v1/documents/candidates")
    async def document_candidates(
        request: Request,
        verified_body: bytes = Depends(document_verifier.verify),
    ) -> JSONResponse:
        internal_request = validated_rag_request(verified_body, CandidateSearchRequest)
        result = await run_in_threadpool(require_rag_service().candidates, internal_request)
        return JSONResponse(
            status_code=200,
            content={"success": True, "data": result, "requestId": _request_id(request)},
        )

    @app.post("/internal/v1/documents/delete")
    async def delete_document_vectors(
        request: Request,
        verified_body: bytes = Depends(document_verifier.verify),
    ) -> JSONResponse:
        internal_request = validated_rag_request(verified_body, DeleteDocumentVectorsRequest)
        result = await run_in_threadpool(require_rag_service().delete_vectors, internal_request)
        return JSONResponse(
            status_code=200,
            content={"success": True, "data": result, "requestId": _request_id(request)},
        )

    @app.get("/internal/v1/documents/inventory")
    async def document_vector_inventory(
        request: Request,
        verified_body: bytes = Depends(verifier.verify),
    ) -> JSONResponse:
        del verified_body
        result = await run_in_threadpool(require_rag_service().inventory)
        return JSONResponse(
            status_code=200,
            content={"success": True, "data": result, "requestId": _request_id(request)},
        )

    return app
