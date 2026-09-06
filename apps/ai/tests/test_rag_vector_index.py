from uuid import UUID

from qdrant_client import QdrantClient, models

from opspilot_ai.rag.chunking import chunk_document
from opspilot_ai.rag.vector_index import QdrantVectorIndex

FIRST_VERSION = UUID("10000000-0000-4000-8000-000000000001")
SECOND_VERSION = UUID("10000000-0000-4000-8000-000000000002")


def make_index() -> tuple[QdrantVectorIndex, QdrantClient]:
    client = QdrantClient(":memory:")
    index = QdrantVectorIndex(
        collection_name="opspilot_documents_test",
        dimension=3,
        client=client,
    )
    index.initialize()
    return index, client


def test_vector_index_requires_publication_and_exact_audience_filters() -> None:
    index, _client = make_index()
    assert index.healthy() is True
    first_chunks = chunk_document(
        "customer returns policy", document_version_id=FIRST_VERSION, index_version=1
    )
    second_chunks = chunk_document(
        "owner payroll policy", document_version_id=SECOND_VERSION, index_version=1
    )
    index.replace_unpublished(
        document_version_id=FIRST_VERSION,
        index_version=1,
        audiences=["CUSTOMER"],
        chunks=first_chunks,
        vectors=[[1.0, 0.0, 0.0]],
    )
    index.replace_unpublished(
        document_version_id=SECOND_VERSION,
        index_version=1,
        audiences=["OWNER"],
        chunks=second_chunks,
        vectors=[[0.9, 0.1, 0.0]],
    )

    assert index.search(query_vector=[1.0, 0.0, 0.0], audiences=["CUSTOMER"], limit=8) == []
    index.set_published(document_version_id=FIRST_VERSION, index_version=1, published=True)
    index.set_published(document_version_id=SECOND_VERSION, index_version=1, published=True)

    assert index.inventory() == {
        "totalPoints": 2,
        "versions": [
            {"documentVersionId": str(FIRST_VERSION), "pointCount": 1},
            {"documentVersionId": str(SECOND_VERSION), "pointCount": 1},
        ],
    }

    customer = index.search(query_vector=[1.0, 0.0, 0.0], audiences=["CUSTOMER"], limit=8)
    owner = index.search(query_vector=[1.0, 0.0, 0.0], audiences=["CUSTOMER", "OWNER"], limit=8)
    assert [candidate.document_version_id for candidate in customer] == [FIRST_VERSION]
    assert {candidate.document_version_id for candidate in owner} == {FIRST_VERSION, SECOND_VERSION}


def test_vector_payload_contains_no_source_text_or_human_metadata() -> None:
    index, client = make_index()
    chunks = chunk_document(
        "confidential canary text", document_version_id=FIRST_VERSION, index_version=1
    )
    index.replace_unpublished(
        document_version_id=FIRST_VERSION,
        index_version=1,
        audiences=["OWNER"],
        chunks=chunks,
        vectors=[[1.0, 0.0, 0.0]],
    )

    points, _ = client.scroll(
        collection_name=index.collection_name,
        limit=10,
        with_payload=True,
        with_vectors=False,
    )
    assert len(points) == 1
    assert points[0].payload == {
        "documentVersionId": str(FIRST_VERSION),
        "indexVersion": 1,
        "ordinal": 0,
        "audiences": ["OWNER"],
        "published": False,
    }
    assert "canary" not in str(points[0].payload).lower()


def test_replacement_is_idempotent_and_delete_removes_every_version_point() -> None:
    index, client = make_index()
    original = chunk_document("one chunk", document_version_id=FIRST_VERSION, index_version=1)
    replacement = chunk_document(
        "replacement chunk", document_version_id=FIRST_VERSION, index_version=1
    )
    index.replace_unpublished(
        document_version_id=FIRST_VERSION,
        index_version=1,
        audiences=["OWNER"],
        chunks=original,
        vectors=[[1.0, 0.0, 0.0]],
    )
    index.replace_unpublished(
        document_version_id=FIRST_VERSION,
        index_version=1,
        audiences=["OWNER"],
        chunks=replacement,
        vectors=[[0.0, 1.0, 0.0]],
    )
    count = client.count(
        index.collection_name,
        count_filter=models.Filter(
            must=[
                models.FieldCondition(
                    key="documentVersionId",
                    match=models.MatchValue(value=str(FIRST_VERSION)),
                )
            ]
        ),
        exact=True,
    )
    assert count.count == 1

    index.delete_version(FIRST_VERSION)
    assert client.count(index.collection_name, exact=True).count == 0
