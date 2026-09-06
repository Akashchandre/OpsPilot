import hashlib
import json
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from opspilot_ai.app import create_app
from opspilot_ai.config import RAG_EMBEDDING_MODEL, RAG_EMBEDDING_MODEL_REVISION
from opspilot_ai.errors import AiServiceError
from opspilot_ai.rag.contracts import (
    CandidateSearchRequest,
    DeleteDocumentVectorsRequest,
    DocumentPublicationRequest,
    IndexDocumentRequest,
)
from opspilot_ai.rag.service import RagIndexService
from opspilot_ai.rag.vector_index import VectorCandidate, VectorIndexError

from .conftest import make_settings, signed_headers

DOCUMENT_VERSION_ID = UUID("10000000-0000-4000-8000-000000000001")


def index_payload(
    content: str = "# Returns\n\nReturn products within 30 days.",
) -> dict[str, object]:
    return {
        "contractVersion": 1,
        "documentVersionId": str(DOCUMENT_VERSION_ID),
        "indexVersion": 1,
        "contentSha256": hashlib.sha256(content.encode()).hexdigest(),
        "audiences": ["CUSTOMER"],
        "embeddingModel": RAG_EMBEDDING_MODEL,
        "embeddingModelRevision": RAG_EMBEDDING_MODEL_REVISION,
        "content": content,
    }


class FakeEmbedder:
    model_name = RAG_EMBEDDING_MODEL
    dimension = 3

    def __init__(self) -> None:
        self.passages: list[str] = []
        self.queries: list[str] = []

    def embed_passages(self, passages: list[str]) -> list[list[float]]:
        self.passages.extend(passages)
        return [[1.0, 0.0, 0.0] for _passage in passages]

    def embed_query(self, query: str) -> list[float]:
        self.queries.append(query)
        return [1.0, 0.0, 0.0]


class FakeVectorIndex:
    collection_name = "opspilot_documents_test"

    def __init__(self) -> None:
        self.replacements = []
        self.publications = []
        self.deleted = []
        self.fail = False

    def replace_unpublished(self, **values: object) -> None:
        if self.fail:
            raise VectorIndexError("private detail")
        self.replacements.append(values)

    def set_published(self, **values: object) -> None:
        self.publications.append(values)

    def search(self, **values: object) -> list[VectorCandidate]:
        assert values["audiences"] == ["CUSTOMER"]
        return [
            VectorCandidate(
                point_id=UUID("20000000-0000-4000-8000-000000000001"),
                document_version_id=DOCUMENT_VERSION_ID,
                index_version=1,
                score=0.75,
            )
        ]

    def delete_version(self, document_version_id: UUID) -> None:
        self.deleted.append(document_version_id)

    def healthy(self) -> bool:
        return not self.fail

    def inventory(self) -> dict[str, object]:
        if self.fail:
            raise VectorIndexError("private detail")
        return {
            "totalPoints": 1,
            "versions": [{"documentVersionId": str(DOCUMENT_VERSION_ID), "pointCount": 1}],
        }

    def close(self) -> None:
        return None


def make_service() -> tuple[RagIndexService, FakeEmbedder, FakeVectorIndex]:
    embedder = FakeEmbedder()
    vector_index = FakeVectorIndex()
    service = RagIndexService(embedder=embedder, vector_index=vector_index)
    return service, embedder, vector_index


def test_rag_health_reports_only_embedding_and_vector_availability() -> None:
    service, _embedder, vector_index = make_service()

    assert service.health() == {"embedding": "ready", "vectorIndex": "ready"}
    vector_index.fail = True
    assert service.health() == {"embedding": "ready", "vectorIndex": "unavailable"}


def test_rag_inventory_returns_only_opaque_version_counts() -> None:
    service, _embedder, _vector_index = make_service()

    assert service.inventory() == {
        "totalPoints": 1,
        "versions": [{"documentVersionId": str(DOCUMENT_VERSION_ID), "pointCount": 1}],
    }


def test_index_contract_rejects_hash_scope_content_and_extra_metadata() -> None:
    mutations = [
        {"contentSha256": "0" * 64},
        {"audiences": ["OWNER", "CUSTOMER"]},
        {"content": "unsafe\u202econtent"},
        {"filename": "must-not-cross-the-boundary.md"},
    ]
    for mutation in mutations:
        payload = index_payload()
        payload.update(mutation)
        with pytest.raises(ValidationError):
            IndexDocumentRequest.model_validate(payload)


def test_candidate_contract_enforces_fixed_limit_and_exact_assistant_scope() -> None:
    valid = {
        "contractVersion": 1,
        "assistant": "CUSTOMER",
        "audiences": ["CUSTOMER"],
        "question": "What is the returns window?",
        "limit": 8,
    }
    assert CandidateSearchRequest.model_validate(valid).assistant == "CUSTOMER"
    for mutation in [
        {"audiences": ["OWNER"]},
        {"audiences": ["CUSTOMER", "OWNER"]},
        {"limit": 7},
        {"question": " repeated  whitespace "},
    ]:
        payload = {**valid, **mutation}
        with pytest.raises(ValidationError):
            CandidateSearchRequest.model_validate(payload)


def test_rag_service_indexes_without_returning_text_and_handles_lifecycle() -> None:
    service, embedder, vector_index = make_service()
    request = IndexDocumentRequest.model_validate(index_payload())

    result = service.index_document(request)
    serialized = json.dumps(result)
    assert "Return products" not in serialized
    assert result["embeddingDimension"] == 3
    assert result["published"] is False
    assert len(result["chunks"]) == 1
    assert embedder.passages == ["# Returns\n\nReturn products within 30 days."]
    assert vector_index.replacements[0]["audiences"] == ["CUSTOMER"]

    publication = DocumentPublicationRequest.model_validate(
        {
            "contractVersion": 1,
            "documentVersionId": str(DOCUMENT_VERSION_ID),
            "indexVersion": 1,
            "published": True,
        }
    )
    assert service.set_publication(publication)["published"] is True

    candidates = service.candidates(
        CandidateSearchRequest.model_validate(
            {
                "contractVersion": 1,
                "assistant": "CUSTOMER",
                "audiences": ["CUSTOMER"],
                "question": "What is the returns window?",
                "limit": 8,
            }
        )
    )
    assert candidates["candidates"][0]["score"] == 0.75
    assert embedder.queries == ["What is the returns window?"]

    deleted = service.delete_vectors(
        DeleteDocumentVectorsRequest.model_validate(
            {"contractVersion": 1, "documentVersionId": str(DOCUMENT_VERSION_ID)}
        )
    )
    assert deleted["deleted"] is True
    assert vector_index.deleted == [DOCUMENT_VERSION_ID]


def test_rag_service_maps_private_vector_failures_to_a_safe_error() -> None:
    service, _embedder, vector_index = make_service()
    vector_index.fail = True
    with pytest.raises(AiServiceError) as raised:
        service.index_document(IndexDocumentRequest.model_validate(index_payload()))
    assert raised.value.code == "DOCUMENT_INDEX_UNAVAILABLE"
    assert "private detail" not in str(raised.value)


def test_rag_service_clamps_cosine_rounding_to_the_signed_contract() -> None:
    service, _embedder, vector_index = make_service()
    vector_index.search = lambda **_values: [
        VectorCandidate(
            point_id=UUID("20000000-0000-4000-8000-000000000001"),
            document_version_id=DOCUMENT_VERSION_ID,
            index_version=1,
            score=1.0000000001,
        )
    ]
    request = CandidateSearchRequest.model_validate(
        {
            "contractVersion": 1,
            "assistant": "CUSTOMER",
            "audiences": ["CUSTOMER"],
            "question": "What is the returns window?",
            "limit": 8,
        }
    )

    assert service.candidates(request)["candidates"][0]["score"] == 1.0


class FakeRagService:
    def __init__(self) -> None:
        self.index_calls = 0

    def index_document(self, request: IndexDocumentRequest) -> dict[str, object]:
        self.index_calls += 1
        return {"documentVersionId": str(request.document_version_id), "chunks": []}

    def set_publication(self, request: DocumentPublicationRequest) -> dict[str, object]:
        return {"published": request.published}

    def candidates(self, request: CandidateSearchRequest) -> dict[str, object]:
        return {"candidates": [], "assistant": request.assistant}

    def delete_vectors(self, request: DeleteDocumentVectorsRequest) -> dict[str, object]:
        return {"documentVersionId": str(request.document_version_id), "deleted": True}

    def health(self) -> dict[str, str]:
        return {"embedding": "ready", "vectorIndex": "ready"}

    def inventory(self) -> dict[str, object]:
        return {
            "totalPoints": 2,
            "versions": [{"documentVersionId": str(DOCUMENT_VERSION_ID), "pointCount": 2}],
        }

    def close(self) -> None:
        return None


def test_signed_health_reports_ready_rag_without_paths_or_model_details(tmp_path) -> None:
    settings = make_settings(
        AI_RAG_ENABLED="true",
        AI_RAG_MODEL_CACHE_DIR=str(tmp_path / "model"),
        AI_RAG_QDRANT_PATH=str(tmp_path / "qdrant"),
    )
    app = create_app(settings, rag_service=FakeRagService())

    with TestClient(app) as client:
        response = client.get("/internal/v1/health", headers=signed_headers())

    assert response.status_code == 200
    assert response.json()["data"] == {
        "service": "opspilot-ai",
        "status": "ready",
        "provider": "disabled",
        "embedding": "ready",
        "vectorIndex": "ready",
    }
    assert str(tmp_path) not in response.text
    assert RAG_EMBEDDING_MODEL not in response.text


def test_signed_vector_inventory_returns_counts_without_content() -> None:
    app = create_app(make_settings(), rag_service=FakeRagService())

    with TestClient(app) as client:
        response = client.get(
            "/internal/v1/documents/inventory",
            headers=signed_headers(path="/internal/v1/documents/inventory"),
        )

    assert response.status_code == 200
    assert response.json()["data"] == {
        "totalPoints": 2,
        "versions": [{"documentVersionId": str(DOCUMENT_VERSION_ID), "pointCount": 2}],
    }
    assert "content" not in response.text.casefold()


def signed_post(client: TestClient, path: str, payload: dict[str, object], **header_values: str):
    body = json.dumps(payload, separators=(",", ":")).encode()
    headers = signed_headers(body=body, method="POST", path=path, **header_values)
    return client.post(path, content=body, headers=headers)


def test_signed_rag_routes_validate_closed_contracts_and_request_identity() -> None:
    rag_service = FakeRagService()
    app = create_app(make_settings(), rag_service=rag_service)
    request_id = str(uuid4())
    with TestClient(app) as client:
        indexed = signed_post(
            client,
            "/internal/v1/documents/index",
            index_payload(),
            request_id=request_id,
        )
        assert indexed.status_code == 200
        assert indexed.json()["requestId"] == request_id
        assert rag_service.index_calls == 1

        invalid_payload = index_payload()
        invalid_payload["title"] = "must not cross"
        invalid = signed_post(client, "/internal/v1/documents/index", invalid_payload)
        assert invalid.status_code == 422
        assert rag_service.index_calls == 1


def test_rag_routes_share_replay_cache_and_enforce_large_body_ceiling() -> None:
    app = create_app(make_settings(), rag_service=FakeRagService())
    nonce = str(uuid4())
    candidate_payload = {
        "contractVersion": 1,
        "assistant": "CUSTOMER",
        "audiences": ["CUSTOMER"],
        "question": "What is the returns window?",
        "limit": 8,
    }
    with TestClient(app) as client:
        first = signed_post(
            client,
            "/internal/v1/documents/candidates",
            candidate_payload,
            nonce=nonce,
        )
        assert first.status_code == 200
        replay = signed_post(
            client,
            "/internal/v1/documents/delete",
            {"contractVersion": 1, "documentVersionId": str(DOCUMENT_VERSION_ID)},
            nonce=nonce,
        )
        assert replay.status_code == 401
        assert replay.json()["error"]["code"] == "INTERNAL_REPLAY_REJECTED"

        oversized_body = b"{" + (b" " * 600_000)
        oversized = client.post(
            "/internal/v1/documents/index",
            content=oversized_body,
            headers=signed_headers(
                body=oversized_body,
                method="POST",
                path="/internal/v1/documents/index",
            ),
        )
        assert oversized.status_code == 413


def test_signed_rag_routes_fail_closed_when_disabled() -> None:
    app = create_app(make_settings())
    with TestClient(app) as client:
        response = signed_post(client, "/internal/v1/documents/index", index_payload())
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "DOCUMENT_INDEX_DISABLED"
