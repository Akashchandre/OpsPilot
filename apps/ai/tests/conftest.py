import base64
from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from opspilot_ai.config import AiSettings
from opspilot_ai.constants import XAI_MODEL, Outcome, SafeNotice
from opspilot_ai.contracts import StructuredProviderOutput
from opspilot_ai.prompts import RenderedPrompt
from opspilot_ai.providers import (
    ProviderReadiness,
    ProviderResult,
    ProviderUsage,
)
from opspilot_ai.security import (
    KEY_ID_HEADER,
    NONCE_HEADER,
    REQUEST_ID_HEADER,
    SIGNATURE_HEADER,
    SIGNATURE_VERSION_HEADER,
    TIMESTAMP_HEADER,
    build_signature,
)

SIGNING_KEY = bytes(range(32))
SIGNING_KEY_BASE64 = base64.b64encode(SIGNING_KEY).decode("ascii")
SIGNING_KEY_ID = "phase7-test-v1"


def make_settings(**overrides: object) -> AiSettings:
    values: dict[str, object] = {
        "AI_ENVIRONMENT": "test",
        "AI_SERVICE_SIGNING_KEY": SIGNING_KEY_BASE64,
        "AI_SERVICE_SIGNING_KEY_ID": SIGNING_KEY_ID,
    }
    values.update(overrides)
    return AiSettings(_env_file=None, **values)


@pytest.fixture
def settings() -> AiSettings:
    return make_settings()


def owner_overview() -> dict[str, object]:
    return {
        "asOf": "2026-09-03T12:00:00.000Z",
        "from": "2026-08-01T00:00:00.000Z",
        "to": "2026-09-01T00:00:00.000Z",
        "timeZone": "UTC",
        "currency": "INR",
        "orders": {
            "createdCount": 12,
            "currentStatusBreakdown": {
                "PENDING_PAYMENT": 1,
                "CONFIRMED": 2,
                "PROCESSING": 1,
                "SHIPPED": 2,
                "DELIVERED": 5,
                "CANCELLED": 1,
                "EXPIRED": 0,
                "PAYMENT_REVIEW": 0,
            },
        },
        "paymentFlow": {
            "capturedAmount": "1500.00",
            "processedRefundAmount": "125.50",
            "netAmount": "1374.50",
        },
        "customers": {"newAccountCount": 7},
        "inventory": {
            "lowStockProductCount": 3,
            "outOfStockProductCount": 1,
        },
        "tickets": {
            "createdCount": 8,
            "currentOpenCount": 5,
            "currentOpenStateBreakdown": {
                "OPEN": 2,
                "IN_PROGRESS": 1,
                "WAITING_CUSTOMER": 1,
                "RESOLVED": 1,
            },
            "currentStatusBreakdown": {
                "OPEN": 2,
                "IN_PROGRESS": 1,
                "WAITING_CUSTOMER": 1,
                "RESOLVED": 1,
                "CLOSED": 3,
            },
            "currentPriorityBreakdown": {
                "LOW": 1,
                "NORMAL": 4,
                "HIGH": 2,
                "URGENT": 1,
            },
        },
    }


def customer_request() -> dict[str, object]:
    return {
        "contractVersion": 1,
        "subjectId": str(uuid4()),
        "assistant": "CUSTOMER",
        "intent": "CUSTOMER_HELP",
        "question": "How do I open a support ticket?",
        "context": None,
    }


def owner_request() -> dict[str, object]:
    return {
        "contractVersion": 1,
        "subjectId": str(uuid4()),
        "assistant": "OWNER",
        "intent": "OWNER_OVERVIEW_EXPLAIN",
        "question": "Summarize the supplied overview.",
        "context": {"overview": owner_overview()},
    }


def signed_headers(
    *,
    body: bytes = b"",
    method: str = "GET",
    path: str = "/internal/v1/health",
    timestamp: str | None = None,
    nonce: str | None = None,
    request_id: str | None = None,
    key: bytes = SIGNING_KEY,
    key_id: str = SIGNING_KEY_ID,
) -> dict[str, str]:
    timestamp = timestamp or datetime.now(UTC).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )
    nonce = nonce or str(uuid4())
    request_id = request_id or str(uuid4())
    signature = build_signature(
        key,
        timestamp=timestamp,
        nonce=nonce,
        request_id=request_id,
        method=method,
        path=path,
        body=body,
    )
    headers = {
        SIGNATURE_VERSION_HEADER: "v1",
        KEY_ID_HEADER: key_id,
        TIMESTAMP_HEADER: timestamp,
        NONCE_HEADER: nonce,
        REQUEST_ID_HEADER: request_id,
        SIGNATURE_HEADER: signature,
    }
    if method == "POST":
        headers["Content-Type"] = "application/json"
    return headers


class FakeProvider:
    def __init__(self) -> None:
        self._state = ProviderReadiness.UNVERIFIED
        self.preflight_calls = 0
        self.generate_calls = 0
        self.prompts: list[RenderedPrompt] = []
        self.error: Exception | None = None
        self.result = ProviderResult(
            output=StructuredProviderOutput(
                answer="Open Support, then choose the option to create a new ticket.",
                outcome=Outcome.ANSWER,
                notices=[SafeNotice.USE_STANDARD_SUPPORT],
            ),
            model=XAI_MODEL,
            request_id="resp_phase7_test",
            usage=ProviderUsage(
                input_tokens=120,
                output_tokens=30,
                total_tokens=150,
                cost_in_usd_ticks=125_000,
            ),
            zero_data_retention=True,
        )

    @property
    def state(self) -> ProviderReadiness:
        return self._state

    async def preflight(self) -> None:
        self.preflight_calls += 1
        self._state = ProviderReadiness.READY

    async def generate(self, prompt: RenderedPrompt) -> ProviderResult:
        self.generate_calls += 1
        self.prompts.append(prompt)
        if self.error is not None:
            raise self.error
        return self.result

    async def aclose(self) -> None:
        return None


def clone(value: dict[str, object]) -> dict[str, object]:
    return deepcopy(value)
