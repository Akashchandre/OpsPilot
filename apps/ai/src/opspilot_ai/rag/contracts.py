import hashlib
import hmac
import unicodedata
from typing import Literal
from uuid import UUID

from pydantic import Field, StrictInt, StrictStr, field_validator, model_validator

from ..config import RAG_EMBEDDING_MODEL, RAG_EMBEDDING_MODEL_REVISION
from ..contracts import StrictContract

MAX_DOCUMENT_BYTES = 256 * 1024
MAX_QUESTION_BYTES = 8_000
DocumentAudience = Literal["CUSTOMER", "OWNER"]
DocumentAssistant = Literal["CUSTOMER", "OWNER"]


def _safe_text(value: str, *, allow_newline_and_tab: bool) -> bool:
    for character in value:
        if allow_newline_and_tab and character in {"\n", "\t"}:
            continue
        if unicodedata.category(character).startswith("C"):
            return False
    return True


class IndexDocumentRequest(StrictContract):
    contract_version: Literal[1] = Field(alias="contractVersion")
    document_version_id: UUID = Field(alias="documentVersionId")
    index_version: StrictInt = Field(ge=1, le=2_147_483_647, alias="indexVersion")
    content_sha256: StrictStr = Field(
        min_length=64,
        max_length=64,
        pattern=r"^[0-9a-f]{64}$",
        alias="contentSha256",
    )
    audiences: list[DocumentAudience] = Field(min_length=1, max_length=2)
    embedding_model: Literal[RAG_EMBEDDING_MODEL] = Field(alias="embeddingModel")
    embedding_model_revision: Literal[RAG_EMBEDDING_MODEL_REVISION] = Field(
        alias="embeddingModelRevision"
    )
    content: StrictStr = Field(min_length=1, max_length=MAX_DOCUMENT_BYTES)

    @field_validator("audiences")
    @classmethod
    def require_unique_sorted_audiences(
        cls, value: list[DocumentAudience]
    ) -> list[DocumentAudience]:
        if value != sorted(set(value)):
            raise ValueError("audiences must be unique and sorted")
        return value

    @field_validator("content")
    @classmethod
    def require_normalized_bounded_content(cls, value: str) -> str:
        if unicodedata.normalize("NFC", value) != value:
            raise ValueError("content must use normalized Unicode")
        if not _safe_text(value, allow_newline_and_tab=True):
            raise ValueError("content contains disallowed characters")
        if not value.strip() or len(value.encode("utf-8")) > MAX_DOCUMENT_BYTES:
            raise ValueError("content exceeds the approved bounds")
        return value

    @model_validator(mode="after")
    def require_matching_content_hash(self) -> "IndexDocumentRequest":
        actual = hashlib.sha256(self.content.encode("utf-8")).hexdigest()
        if not hmac.compare_digest(actual, self.content_sha256):
            raise ValueError("content hash does not match")
        return self


class DocumentPublicationRequest(StrictContract):
    contract_version: Literal[1] = Field(alias="contractVersion")
    document_version_id: UUID = Field(alias="documentVersionId")
    index_version: StrictInt = Field(ge=1, le=2_147_483_647, alias="indexVersion")
    published: bool


class DeleteDocumentVectorsRequest(StrictContract):
    contract_version: Literal[1] = Field(alias="contractVersion")
    document_version_id: UUID = Field(alias="documentVersionId")


class CandidateSearchRequest(StrictContract):
    contract_version: Literal[1] = Field(alias="contractVersion")
    assistant: DocumentAssistant
    audiences: list[DocumentAudience] = Field(min_length=1, max_length=2)
    question: StrictStr = Field(min_length=1, max_length=2_000)
    limit: Literal[8]

    @field_validator("question")
    @classmethod
    def require_normalized_question(cls, value: str) -> str:
        if unicodedata.normalize("NFC", value) != value:
            raise ValueError("question must use normalized Unicode")
        if not _safe_text(value, allow_newline_and_tab=False):
            raise ValueError("question contains disallowed characters")
        if " ".join(value.split()) != value or len(value.encode("utf-8")) > MAX_QUESTION_BYTES:
            raise ValueError("question must use bounded normalized whitespace")
        return value

    @model_validator(mode="after")
    def require_exact_assistant_audiences(self) -> "CandidateSearchRequest":
        expected = ["CUSTOMER"] if self.assistant == "CUSTOMER" else ["CUSTOMER", "OWNER"]
        if self.audiences != expected:
            raise ValueError("assistant audience scope is invalid")
        return self
