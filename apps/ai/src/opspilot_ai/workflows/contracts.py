import re
import unicodedata
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

WorkflowCode = Literal["OWNER_BUSINESS_BRIEF_V1", "SUPPORT_REPLY_DRAFT_V1"]
ToolCode = Literal[
    "REPORTS_OVERVIEW_V1",
    "INVENTORY_ATTENTION_V1",
    "SUPPORT_QUEUE_SUMMARY_V1",
    "SUPPORT_TICKET_PUBLIC_CONTEXT_V1",
    "DOCUMENTS_CUSTOMER_POLICY_CONTEXT_V1",
    "SUPPORT_PUBLIC_REPLY_V1",
]

TOOL_SEQUENCES: dict[str, tuple[str, ...]] = {
    "OWNER_BUSINESS_BRIEF_V1": (
        "REPORTS_OVERVIEW_V1",
        "INVENTORY_ATTENTION_V1",
        "SUPPORT_QUEUE_SUMMARY_V1",
    ),
    "SUPPORT_REPLY_DRAFT_V1": (
        "SUPPORT_TICKET_PUBLIC_CONTEXT_V1",
        "DOCUMENTS_CUSTOMER_POLICY_CONTEXT_V1",
        "SUPPORT_PUBLIC_REPLY_V1",
    ),
}


class StrictContract(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=False)


class ToolCallReference(StrictContract):
    id: UUID
    code: ToolCode


class WorkflowRequest(StrictContract):
    contract_version: Literal[1] = Field(alias="contractVersion")
    workflow_run_id: UUID = Field(alias="workflowRunId")
    workflow_code: WorkflowCode = Field(alias="workflowCode")
    graph_version: Literal["v1"] = Field(alias="graphVersion")
    thread_id: UUID = Field(alias="threadId")
    model_step_id: UUID = Field(alias="modelStepId")
    tool_calls: list[ToolCallReference] = Field(alias="toolCalls", min_length=3, max_length=3)

    @model_validator(mode="after")
    def require_fixed_sequence(self) -> "WorkflowRequest":
        expected = TOOL_SEQUENCES[self.workflow_code]
        actual = tuple(reference.code for reference in self.tool_calls)
        unique_tool_count = len({reference.id for reference in self.tool_calls})
        if actual != expected or unique_tool_count != len(actual):
            raise ValueError("workflow tool sequence is invalid")
        if self.model_step_id != self.workflow_run_id:
            raise ValueError("model step identity is invalid")
        return self


def _plain_text(value: str) -> str:
    if value != value.strip() or unicodedata.normalize("NFC", value) != value:
        raise ValueError("text must be normalized and trimmed")
    for character in value:
        if character != "\n" and unicodedata.category(character).startswith("C"):
            raise ValueError("text contains a control character")
    if re.search(r"https?://|www\.|<[A-Za-z!/]|```", value, re.IGNORECASE):
        raise ValueError("text contains links or markup")
    return value


class BusinessFinding(StrictContract):
    text: StrictStr = Field(min_length=1, max_length=500)
    source_labels: list[Literal["REPORTS", "INVENTORY", "SUPPORT"]] = Field(
        alias="sourceLabels", min_length=1, max_length=3
    )

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        return _plain_text(value)


class BusinessBriefOutput(StrictContract):
    summary: StrictStr = Field(min_length=1, max_length=2_000)
    findings: list[BusinessFinding] = Field(max_length=8)
    next_steps: list[Annotated[StrictStr, Field(min_length=1, max_length=300)]] = Field(
        alias="nextSteps", max_length=5
    )
    uncertainties: list[Annotated[StrictStr, Field(min_length=1, max_length=300)]] = Field(
        max_length=5
    )

    @field_validator("summary")
    @classmethod
    def validate_summary(cls, value: str) -> str:
        return _plain_text(value)

    @field_validator("next_steps", "uncertainties")
    @classmethod
    def validate_lists(cls, value: list[str]) -> list[str]:
        return [_plain_text(item) for item in value]


class SupportReplyOutput(StrictContract):
    status: Literal["READY_FOR_REVIEW", "ESCALATE", "INSUFFICIENT_CONTEXT", "REFUSAL"]
    draft: StrictStr | None = Field(default=None, max_length=2_000)
    reasons: list[Annotated[StrictStr, Field(min_length=1, max_length=300)]] = Field(max_length=5)
    citations: list[Annotated[StrictStr, Field(pattern=r"^S[1-3]$")]] = Field(max_length=3)

    @field_validator("draft")
    @classmethod
    def validate_draft(cls, value: str | None) -> str | None:
        return _plain_text(value) if value is not None else None

    @field_validator("reasons")
    @classmethod
    def validate_reasons(cls, value: list[str]) -> list[str]:
        return [_plain_text(item) for item in value]

    @model_validator(mode="after")
    def require_reviewable_draft(self) -> "SupportReplyOutput":
        if self.status == "READY_FOR_REVIEW" and self.draft is None:
            raise ValueError("a reviewable output requires a draft")
        if self.status != "READY_FOR_REVIEW" and self.draft is not None:
            raise ValueError("a non-reviewable output cannot include a draft")
        if len(self.citations) != len(set(self.citations)):
            raise ValueError("citations must be unique")
        return self


class ToolExecutionEnvelope(StrictContract):
    success: Literal[True]
    data: dict[str, object]
    request_id: UUID = Field(alias="requestId")


class ReservationData(StrictContract):
    status: Literal["RESERVED", "PENDING", "SUCCEEDED", "FAILED", "UNKNOWN"]


class ReservationEnvelope(StrictContract):
    success: Literal[True]
    data: ReservationData
    request_id: UUID = Field(alias="requestId")


class FinalizationData(StrictContract):
    status: Literal["AWAITING_APPROVAL", "SUCCEEDED", "FAILED", "UNKNOWN"]
    artifact_id: UUID | None = Field(alias="artifactId")


class FinalizationEnvelope(StrictContract):
    success: Literal[True]
    data: FinalizationData
    request_id: UUID = Field(alias="requestId")


class CountedUsage(StrictContract):
    input_tokens: StrictInt = Field(alias="inputTokens", ge=0, le=100_000)
    output_tokens: StrictInt = Field(alias="outputTokens", ge=0, le=500)
    total_tokens: StrictInt = Field(alias="totalTokens", ge=0, le=100_500)
    cost_in_usd_ticks: StrictInt = Field(alias="costInUsdTicks", ge=0)


BUSINESS_OUTPUT_SCHEMA = BusinessBriefOutput.model_json_schema(by_alias=True)
SUPPORT_OUTPUT_SCHEMA = SupportReplyOutput.model_json_schema(by_alias=True)
