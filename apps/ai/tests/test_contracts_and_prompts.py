import json

import pytest
from pydantic import ValidationError

from opspilot_ai.constants import AssistantKind
from opspilot_ai.contracts import (
    PROVIDER_OUTPUT_JSON_SCHEMA,
    InternalResponseRequest,
    StructuredProviderOutput,
)
from opspilot_ai.prompts import PUBLIC_CUSTOMER_FACTS, render_prompt

from .conftest import customer_request, owner_request


def test_customer_contract_is_strict_and_registered() -> None:
    request = InternalResponseRequest.model_validate(customer_request())

    assert request.assistant == AssistantKind.CUSTOMER
    assert request.context is None

    extra = customer_request()
    extra["model"] = "something-else"
    with pytest.raises(ValidationError):
        InternalResponseRequest.model_validate(extra)


def test_owner_contract_accepts_only_the_exact_aggregate_projection() -> None:
    request = InternalResponseRequest.model_validate(owner_request())
    assert request.context is not None
    assert request.context.overview.payment_flow.net_amount == "1374.50"

    invalid = owner_request()
    overview = invalid["context"]["overview"]  # type: ignore[index]
    overview["customerEmail"] = "not-allowed@example.com"  # type: ignore[index]
    with pytest.raises(ValidationError):
        InternalResponseRequest.model_validate(invalid)


def test_contract_rejects_cross_scope_and_missing_owner_context() -> None:
    customer = customer_request()
    customer["intent"] = "OWNER_OVERVIEW_EXPLAIN"
    with pytest.raises(ValidationError):
        InternalResponseRequest.model_validate(customer)

    owner = owner_request()
    owner["context"] = None
    with pytest.raises(ValidationError):
        InternalResponseRequest.model_validate(owner)


@pytest.mark.parametrize(
    "question",
    [" leading", "trailing ", "two  spaces", "line\nbreak", "e\u0301", "a\x00b"],
)
def test_contract_rejects_non_normalized_questions(question: str) -> None:
    payload = customer_request()
    payload["question"] = question
    with pytest.raises(ValidationError):
        InternalResponseRequest.model_validate(payload)


def test_owner_contract_rejects_invalid_range_money_and_counts() -> None:
    backwards = owner_request()
    backwards["context"]["overview"]["from"] = "2026-09-02T00:00:00.000Z"  # type: ignore[index]
    with pytest.raises(ValidationError):
        InternalResponseRequest.model_validate(backwards)

    money = owner_request()
    money["context"]["overview"]["paymentFlow"]["netAmount"] = 12.5  # type: ignore[index]
    with pytest.raises(ValidationError):
        InternalResponseRequest.model_validate(money)

    count = owner_request()
    count["context"]["overview"]["orders"]["createdCount"] = -1  # type: ignore[index]
    with pytest.raises(ValidationError):
        InternalResponseRequest.model_validate(count)


@pytest.mark.parametrize(
    "answer",
    [
        "Visit https://example.com",
        "<strong>unsafe</strong>",
        "[click](https://example.com)",
        "**bold**",
        "- list item",
        "`code`",
        "control\x00character",
    ],
)
def test_provider_output_rejects_links_markup_and_controls(answer: str) -> None:
    with pytest.raises(ValidationError):
        StructuredProviderOutput(
            answer=answer,
            outcome="ANSWER",
            notices=[],
        )


def test_provider_output_accepts_bounded_plain_text_and_unique_notices() -> None:
    output = StructuredProviderOutput(
        answer="Orders increased in the supplied range. Verify the as-of time before acting.",
        outcome="ANSWER",
        notices=["VERIFY_AUTHORITATIVE_DATA"],
    )
    assert output.outcome.value == "ANSWER"

    with pytest.raises(ValidationError):
        StructuredProviderOutput(
            answer="Use the standard support flow.",
            outcome="ESCALATE",
            notices=["USE_STANDARD_SUPPORT", "USE_STANDARD_SUPPORT"],
        )

    with pytest.raises(ValidationError):
        StructuredProviderOutput(answer="", outcome="ANSWER", notices=[])

    with pytest.raises(ValidationError):
        StructuredProviderOutput(answer="a" * 2_001, outcome="ANSWER", notices=[])

    with pytest.raises(ValidationError):
        StructuredProviderOutput(
            answer="Use the standard support flow.",
            outcome="ESCALATE",
            notices=[
                "VERIFY_AUTHORITATIVE_DATA",
                "USE_STANDARD_SUPPORT",
                "SNAPSHOT_MAY_BE_STALE",
                "VERIFY_AUTHORITATIVE_DATA",
            ],
        )


def test_provider_json_schema_is_closed_and_uses_groq_supported_subset() -> None:
    assert PROVIDER_OUTPUT_JSON_SCHEMA["additionalProperties"] is False
    assert PROVIDER_OUTPUT_JSON_SCHEMA["required"] == [
        "answer",
        "outcome",
        "notices",
    ]
    assert PROVIDER_OUTPUT_JSON_SCHEMA["properties"]["answer"] == {"type": "string"}
    assert set(PROVIDER_OUTPUT_JSON_SCHEMA["properties"]["notices"]) == {"type", "items"}


def test_customer_prompt_contains_only_registered_facts_and_not_subject_id() -> None:
    payload = customer_request()
    subject_id = payload["subjectId"]
    request = InternalResponseRequest.model_validate(payload)
    prompt = render_prompt(request)

    assert prompt.version == "customer-help-v1"
    assert all(fact in prompt.system for fact in PUBLIC_CUSTOMER_FACTS)
    assert str(subject_id) not in prompt.system
    assert str(subject_id) not in prompt.user
    assert request.question in prompt.user


def test_owner_prompt_projects_aggregate_context_without_subject_id() -> None:
    payload = owner_request()
    subject_id = payload["subjectId"]
    request = InternalResponseRequest.model_validate(payload)
    prompt = render_prompt(request)

    assert prompt.version == "owner-overview-v1"
    assert str(subject_id) not in prompt.system
    assert str(subject_id) not in prompt.user
    assert "customerEmail" not in prompt.system
    assert '"netAmount":"1374.50"' in prompt.system
    assert json.dumps("OWNER_OVERVIEW_EXPLAIN") not in prompt.system
