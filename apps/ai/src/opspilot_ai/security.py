import hashlib
import hmac
import re
from collections.abc import Callable
from datetime import UTC, datetime
from uuid import UUID

from starlette.requests import Request

from .constants import SIGNATURE_VERSION
from .errors import AiServiceError

SIGNATURE_VERSION_HEADER = "X-OpsPilot-Signature-Version"
KEY_ID_HEADER = "X-OpsPilot-Key-Id"
TIMESTAMP_HEADER = "X-OpsPilot-Timestamp"
NONCE_HEADER = "X-OpsPilot-Nonce"
REQUEST_ID_HEADER = "X-Request-Id"
SIGNATURE_HEADER = "X-OpsPilot-Signature"

REQUIRED_HEADERS = (
    SIGNATURE_VERSION_HEADER,
    KEY_ID_HEADER,
    TIMESTAMP_HEADER,
    NONCE_HEADER,
    REQUEST_ID_HEADER,
    SIGNATURE_HEADER,
)
UTC_TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
HEX_SIGNATURE_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def body_digest(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def canonical_signature_input(
    *,
    timestamp: str,
    nonce: str,
    request_id: str,
    method: str,
    path: str,
    digest: str,
) -> bytes:
    fields = (
        SIGNATURE_VERSION,
        timestamp,
        nonce,
        request_id,
        method.upper(),
        path,
        digest,
    )
    return "\n".join(fields).encode("utf-8")


def build_signature(
    key: bytes,
    *,
    timestamp: str,
    nonce: str,
    request_id: str,
    method: str,
    path: str,
    body: bytes,
) -> str:
    message = canonical_signature_input(
        timestamp=timestamp,
        nonce=nonce,
        request_id=request_id,
        method=method,
        path=path,
        digest=body_digest(body),
    )
    return hmac.new(key, message, hashlib.sha256).hexdigest()


class ReplayCache:
    def __init__(self, *, ttl_seconds: int = 300, maximum_entries: int = 10_000) -> None:
        self._ttl_seconds = ttl_seconds
        self._maximum_entries = maximum_entries
        self._nonces: dict[str, float] = {}

    def claim(self, nonce: str, now_epoch: float) -> None:
        expired = [
            cached_nonce
            for cached_nonce, expires_at in self._nonces.items()
            if expires_at <= now_epoch
        ]
        for cached_nonce in expired:
            del self._nonces[cached_nonce]

        if nonce in self._nonces:
            raise AiServiceError(
                401,
                "INTERNAL_REPLAY_REJECTED",
                "The internal request could not be authenticated",
            )
        if len(self._nonces) >= self._maximum_entries:
            raise AiServiceError(
                503,
                "INTERNAL_REPLAY_CACHE_UNAVAILABLE",
                "The AI service is temporarily unavailable",
            )
        self._nonces[nonce] = now_epoch + self._ttl_seconds


class InternalRequestVerifier:
    def __init__(
        self,
        *,
        key: bytes,
        key_id: str,
        replay_cache: ReplayCache | None = None,
        now: Callable[[], datetime] | None = None,
        clock_window_seconds: int = 30,
        maximum_body_bytes: int = 32_768,
    ) -> None:
        self._key = key
        self._key_id = key_id
        self._replay_cache = replay_cache or ReplayCache()
        self._now = now or (lambda: datetime.now(UTC))
        self._clock_window_seconds = clock_window_seconds
        self._maximum_body_bytes = maximum_body_bytes

    @staticmethod
    def _header(request: Request, name: str) -> str:
        values = request.headers.getlist(name)
        if len(values) != 1 or not values[0]:
            raise AiServiceError(
                401,
                "INTERNAL_AUTHENTICATION_FAILED",
                "The internal request could not be authenticated",
            )
        return values[0]

    @staticmethod
    def _canonical_uuid(value: str) -> str:
        try:
            parsed = UUID(value)
        except ValueError as error:
            raise AiServiceError(
                401,
                "INTERNAL_AUTHENTICATION_FAILED",
                "The internal request could not be authenticated",
            ) from error
        if str(parsed) != value:
            raise AiServiceError(
                401,
                "INTERNAL_AUTHENTICATION_FAILED",
                "The internal request could not be authenticated",
            )
        return value

    @staticmethod
    def _timestamp(value: str) -> datetime:
        if not UTC_TIMESTAMP_PATTERN.fullmatch(value):
            raise AiServiceError(
                401,
                "INTERNAL_AUTHENTICATION_FAILED",
                "The internal request could not be authenticated",
            )
        try:
            timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as error:
            raise AiServiceError(
                401,
                "INTERNAL_AUTHENTICATION_FAILED",
                "The internal request could not be authenticated",
            ) from error
        if timestamp.isoformat(timespec="milliseconds").replace("+00:00", "Z") != value:
            raise AiServiceError(
                401,
                "INTERNAL_AUTHENTICATION_FAILED",
                "The internal request could not be authenticated",
            )
        return timestamp

    async def verify(self, request: Request) -> bytes:
        values = {name: self._header(request, name) for name in REQUIRED_HEADERS}
        request_id = self._canonical_uuid(values[REQUEST_ID_HEADER])
        request.state.request_id = request_id
        nonce = self._canonical_uuid(values[NONCE_HEADER])
        timestamp = self._timestamp(values[TIMESTAMP_HEADER])
        current_time = self._now()
        if current_time.tzinfo is None:
            current_time = current_time.replace(tzinfo=UTC)

        if values[SIGNATURE_VERSION_HEADER] != SIGNATURE_VERSION:
            raise AiServiceError(
                401,
                "INTERNAL_AUTHENTICATION_FAILED",
                "The internal request could not be authenticated",
            )
        if not hmac.compare_digest(values[KEY_ID_HEADER], self._key_id):
            raise AiServiceError(
                401,
                "INTERNAL_AUTHENTICATION_FAILED",
                "The internal request could not be authenticated",
            )
        if abs((current_time - timestamp).total_seconds()) > self._clock_window_seconds:
            raise AiServiceError(
                401,
                "INTERNAL_AUTHENTICATION_FAILED",
                "The internal request could not be authenticated",
            )

        body = await request.body()
        if len(body) > self._maximum_body_bytes:
            raise AiServiceError(
                413,
                "INTERNAL_REQUEST_TOO_LARGE",
                "The internal request exceeds the allowed size",
            )
        if request.method == "POST":
            content_type = request.headers.get("content-type", "")
            if content_type.split(";", maxsplit=1)[0].strip() != "application/json":
                raise AiServiceError(
                    415,
                    "UNSUPPORTED_MEDIA_TYPE",
                    "The internal request must use application/json",
                )
        elif body:
            raise AiServiceError(
                422,
                "INVALID_INTERNAL_REQUEST",
                "The internal request body must be empty",
            )

        supplied_signature = values[SIGNATURE_HEADER]
        if not HEX_SIGNATURE_PATTERN.fullmatch(supplied_signature):
            raise AiServiceError(
                401,
                "INTERNAL_AUTHENTICATION_FAILED",
                "The internal request could not be authenticated",
            )
        expected_signature = build_signature(
            self._key,
            timestamp=values[TIMESTAMP_HEADER],
            nonce=nonce,
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            body=body,
        )
        if not hmac.compare_digest(supplied_signature, expected_signature):
            raise AiServiceError(
                401,
                "INTERNAL_AUTHENTICATION_FAILED",
                "The internal request could not be authenticated",
            )

        self._replay_cache.claim(nonce, current_time.timestamp())
        return body
