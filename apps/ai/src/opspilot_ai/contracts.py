import re
import unicodedata
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    StrictStr,
    field_validator,
    model_validator,
)

from .constants import (
    INTERNAL_CONTRACT_VERSION,
    AssistantIntent,
    AssistantKind,
    Outcome,
    SafeNotice,
)

MAX_COUNT = 2_147_483_647
MAX_ANSWER_CHARACTERS = 2_000
MAX_ANSWER_BYTES = 8_000
MAX_PROVIDER_IDENTIFIER_CHARACTERS = 128
UTC_TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
MONEY_PATTERN = re.compile(r"^-?(?:0|[1-9]\d{0,15})\.\d{2}$")
URL_PATTERN = re.compile(r"(?i)(?:https?://|www\.)")
HTML_PATTERN = re.compile(r"<[A-Za-z!/][^>]*>")
MARKDOWN_LINK_PATTERN = re.compile(r"\[[^\]\n]+\]\([^\)\n]+\)")
MARKDOWN_LINE_PATTERN = re.compile(r"(?m)^\s*(?:#{1,6}\s|[-+*]\s|\d+\.\s|>)")

Count = Annotated[StrictInt, Field(ge=0, le=MAX_COUNT)]


class StrictContract(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=False)


def _is_valid_unicode(value: str, *, allow_newline: bool) -> bool:
    for character in value:
        if allow_newline and character == "\n":
            continue
        if unicodedata.category(character).startswith("C"):
            return False
    return True


def _validate_utc_timestamp(value: str) -> str:
    if not UTC_TIMESTAMP_PATTERN.fullmatch(value):
        raise ValueError("timestamp must be canonical RFC 3339 UTC")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("timestamp must be canonical RFC 3339 UTC") from error
    if parsed.isoformat(timespec="milliseconds").replace("+00:00", "Z") != value:
        raise ValueError("timestamp must be canonical RFC 3339 UTC")
    return value


class OrderStatusBreakdown(StrictContract):
    pending_payment: Count = Field(alias="PENDING_PAYMENT")
    confirmed: Count = Field(alias="CONFIRMED")
    processing: Count = Field(alias="PROCESSING")
    shipped: Count = Field(alias="SHIPPED")
    delivered: Count = Field(alias="DELIVERED")
    cancelled: Count = Field(alias="CANCELLED")
    expired: Count = Field(alias="EXPIRED")
    payment_review: Count = Field(alias="PAYMENT_REVIEW")


class TicketOpenStateBreakdown(StrictContract):
    open: Count = Field(alias="OPEN")
    in_progress: Count = Field(alias="IN_PROGRESS")
    waiting_customer: Count = Field(alias="WAITING_CUSTOMER")
    resolved: Count = Field(alias="RESOLVED")


class TicketStatusBreakdown(TicketOpenStateBreakdown):
    closed: Count = Field(alias="CLOSED")


class TicketPriorityBreakdown(StrictContract):
    low: Count = Field(alias="LOW")
    normal: Count = Field(alias="NORMAL")
    high: Count = Field(alias="HIGH")
    urgent: Count = Field(alias="URGENT")


class OrdersOverview(StrictContract):
    created_count: Count = Field(alias="createdCount")
    current_status_breakdown: OrderStatusBreakdown = Field(alias="currentStatusBreakdown")


class PaymentFlowOverview(StrictContract):
    captured_amount: StrictStr = Field(alias="capturedAmount", max_length=20)
    processed_refund_amount: StrictStr = Field(
        alias="processedRefundAmount",
        max_length=20,
    )
    net_amount: StrictStr = Field(alias="netAmount", max_length=20)

    @field_validator("captured_amount", "processed_refund_amount", "net_amount")
    @classmethod
    def require_exact_money(cls, value: str) -> str:
        if not MONEY_PATTERN.fullmatch(value):
            raise ValueError("amount must be an exact decimal string")
        return value


class CustomersOverview(StrictContract):
    new_account_count: Count = Field(alias="newAccountCount")


class InventoryOverview(StrictContract):
    low_stock_product_count: Count = Field(alias="lowStockProductCount")
    out_of_stock_product_count: Count = Field(alias="outOfStockProductCount")


class TicketsOverview(StrictContract):
    created_count: Count = Field(alias="createdCount")
    current_open_count: Count = Field(alias="currentOpenCount")
    current_open_state_breakdown: TicketOpenStateBreakdown = Field(
        alias="currentOpenStateBreakdown"
    )
    current_status_breakdown: TicketStatusBreakdown = Field(alias="currentStatusBreakdown")
    current_priority_breakdown: TicketPriorityBreakdown = Field(alias="currentPriorityBreakdown")


class OwnerOverview(StrictContract):
    as_of: StrictStr = Field(alias="asOf", max_length=24)
    from_timestamp: StrictStr = Field(alias="from", max_length=24)
    to_timestamp: StrictStr = Field(alias="to", max_length=24)
    time_zone: Literal["UTC"] = Field(alias="timeZone")
    currency: Literal["INR"]
    orders: OrdersOverview
    payment_flow: PaymentFlowOverview = Field(alias="paymentFlow")
    customers: CustomersOverview
    inventory: InventoryOverview
    tickets: TicketsOverview

    @field_validator("as_of", "from_timestamp", "to_timestamp")
    @classmethod
    def require_utc_timestamp(cls, value: str) -> str:
        return _validate_utc_timestamp(value)

    @model_validator(mode="after")
    def require_valid_range(self) -> "OwnerOverview":
        start = datetime.fromisoformat(self.from_timestamp.replace("Z", "+00:00"))
        end = datetime.fromisoformat(self.to_timestamp.replace("Z", "+00:00"))
        if start >= end:
            raise ValueError("overview range end must be later than start")
        return self


class OwnerOverviewContext(StrictContract):
    overview: OwnerOverview


class DocumentSource(StrictContract):
    label: StrictStr = Field(pattern=r"^S[1-5]$")
    excerpt: StrictStr = Field(min_length=1, max_length=1_200)

    @field_validator("excerpt")
    @classmethod
    def require_safe_excerpt(cls, value: str) -> str:
        if unicodedata.normalize("NFC", value) != value or value.strip() != value:
            raise ValueError("document excerpt must be normalized")
        for character in value:
            if character in {"\n", "\t"}:
                continue
            if unicodedata.category(character).startswith("C"):
                raise ValueError("document excerpt contains disallowed characters")
        return value


class DocumentContext(StrictContract):
    sources: list[DocumentSource] = Field(max_length=5)

    @field_validator("sources")
    @classmethod
    def require_ordered_bounded_sources(cls, value: list[DocumentSource]) -> list[DocumentSource]:
        expected_labels = [f"S{index}" for index in range(1, len(value) + 1)]
        if [source.label for source in value] != expected_labels:
            raise ValueError("document sources must use ordered unique labels")
        total_bytes = sum(len(source.excerpt.encode("utf-8")) for source in value)
        if total_bytes > 8_000:
            raise ValueError("document context exceeds the approved byte limit")
        return value


class InternalResponseRequest(StrictContract):
    contract_version: Literal[INTERNAL_CONTRACT_VERSION] = Field(alias="contractVersion")
    subject_id: UUID = Field(alias="subjectId")
    assistant: AssistantKind
    intent: AssistantIntent
    question: StrictStr = Field(min_length=1, max_length=2_000)
    context: OwnerOverviewContext | DocumentContext | None = None

    @field_validator("question")
    @classmethod
    def require_normalized_question(cls, value: str) -> str:
        if unicodedata.normalize("NFC", value) != value:
            raise ValueError("question must use normalized Unicode")
        if not _is_valid_unicode(value, allow_newline=False):
            raise ValueError("question contains disallowed characters")
        if " ".join(value.split()) != value:
            raise ValueError("question must use normalized whitespace")
        return value

    @model_validator(mode="after")
    def require_registered_scope(self) -> "InternalResponseRequest":
        if self.intent == AssistantIntent.CUSTOMER_HELP:
            if self.assistant != AssistantKind.CUSTOMER or self.context is not None:
                raise ValueError("customer assistant scope is invalid")
        elif self.intent == AssistantIntent.OWNER_OVERVIEW_EXPLAIN:
            if self.assistant != AssistantKind.OWNER or not isinstance(
                self.context, OwnerOverviewContext
            ):
                raise ValueError("owner assistant scope is invalid")
        elif self.intent == AssistantIntent.CUSTOMER_DOCUMENT_QA:
            if self.assistant != AssistantKind.CUSTOMER or not isinstance(
                self.context, DocumentContext
            ):
                raise ValueError("customer document scope is invalid")
        elif self.assistant != AssistantKind.OWNER or not isinstance(self.context, DocumentContext):
            raise ValueError("owner document scope is invalid")
        return self


class StructuredProviderOutput(StrictContract):
    answer: StrictStr = Field(min_length=1, max_length=MAX_ANSWER_CHARACTERS)
    outcome: Outcome
    notices: list[SafeNotice] = Field(max_length=3)

    @field_validator("answer")
    @classmethod
    def require_plain_text_answer(cls, value: str) -> str:
        if unicodedata.normalize("NFC", value) != value:
            raise ValueError("answer must use normalized Unicode")
        if value.strip() != value or not _is_valid_unicode(value, allow_newline=True):
            raise ValueError("answer contains disallowed characters")
        if len(value.encode("utf-8")) > MAX_ANSWER_BYTES:
            raise ValueError("answer exceeds the byte limit")
        if (
            URL_PATTERN.search(value)
            or HTML_PATTERN.search(value)
            or MARKDOWN_LINK_PATTERN.search(value)
            or MARKDOWN_LINE_PATTERN.search(value)
            or "`" in value
            or "**" in value
            or "__" in value
            or "~~" in value
        ):
            raise ValueError("answer must be plain text without links or markup")
        return value

    @field_validator("notices")
    @classmethod
    def require_unique_notices(cls, value: list[SafeNotice]) -> list[SafeNotice]:
        if len(value) != len(set(value)):
            raise ValueError("notices must be unique")
        return value

    @model_validator(mode="after")
    def reject_document_only_outcome(self) -> "StructuredProviderOutput":
        if self.outcome == Outcome.INSUFFICIENT_EVIDENCE:
            raise ValueError("the standard assistant cannot use a document-only outcome")
        return self


class DocumentStructuredProviderOutput(StrictContract):
    answer: StrictStr = Field(min_length=1, max_length=MAX_ANSWER_CHARACTERS)
    outcome: Outcome
    citations: list[StrictStr] = Field(max_length=5)
    notices: list[SafeNotice] = Field(max_length=3)

    @field_validator("answer")
    @classmethod
    def require_plain_text_answer(cls, value: str) -> str:
        return StructuredProviderOutput.require_plain_text_answer(value)

    @field_validator("citations")
    @classmethod
    def require_unique_source_labels(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)) or any(
            re.fullmatch(r"S[1-5]", label) is None for label in value
        ):
            raise ValueError("citations must use unique bounded source labels")
        return value

    @field_validator("notices")
    @classmethod
    def require_unique_notices(cls, value: list[SafeNotice]) -> list[SafeNotice]:
        return StructuredProviderOutput.require_unique_notices(value)

    @model_validator(mode="after")
    def require_citations_for_answers_only(self) -> "DocumentStructuredProviderOutput":
        if self.outcome == Outcome.ANSWER and not self.citations:
            raise ValueError("a document answer requires a citation")
        if self.outcome != Outcome.ANSWER and self.citations:
            raise ValueError("a non-answer cannot cite a document source")
        return self


PROVIDER_OUTPUT_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {
            "type": "string",
        },
        "outcome": {
            "type": "string",
            "enum": [
                Outcome.ANSWER.value,
                Outcome.REFUSAL.value,
                Outcome.ESCALATE.value,
            ],
        },
        "notices": {
            "type": "array",
            "items": {
                "type": "string",
                "enum": [notice.value for notice in SafeNotice],
            },
        },
    },
    "required": ["answer", "outcome", "notices"],
    "additionalProperties": False,
}

DOCUMENT_PROVIDER_OUTPUT_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {
            "type": "string",
            "description": (
                "Non-empty plain text. For INSUFFICIENT_EVIDENCE use the exact fallback sentence "
                "specified by the system instructions."
            ),
        },
        "outcome": {
            "type": "string",
            "enum": [outcome.value for outcome in Outcome],
        },
        "citations": {
            "type": "array",
            "items": {"type": "string", "enum": [f"S{index}" for index in range(1, 6)]},
            "description": "Use source labels only for ANSWER; use an empty array otherwise.",
        },
        "notices": {
            "type": "array",
            "items": {
                "type": "string",
                "enum": [notice.value for notice in SafeNotice],
            },
        },
    },
    "required": ["answer", "outcome", "citations", "notices"],
    "additionalProperties": False,
}
