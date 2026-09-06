from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from qdrant_client import QdrantClient, models

from .chunking import DocumentChunk


class VectorIndexError(Exception):
    pass


@dataclass(frozen=True, slots=True)
class VectorCandidate:
    point_id: UUID
    document_version_id: UUID
    index_version: int
    score: float


class QdrantVectorIndex:
    def __init__(
        self,
        *,
        collection_name: str,
        dimension: int = 384,
        path: Path | None = None,
        client: QdrantClient | None = None,
    ) -> None:
        if client is None and path is None:
            raise VectorIndexError("a local Qdrant path is required")
        self.collection_name = collection_name
        self.dimension = dimension
        try:
            self._client = client or QdrantClient(path=str(path))
        except Exception as error:
            raise VectorIndexError("the vector index is unavailable") from error

    def initialize(self) -> None:
        try:
            if not self._client.collection_exists(self.collection_name):
                self._client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=models.VectorParams(
                        size=self.dimension,
                        distance=models.Distance.COSINE,
                    ),
                )
            else:
                collection = self._client.get_collection(self.collection_name)
                vectors = collection.config.params.vectors
                if (
                    not isinstance(vectors, models.VectorParams)
                    or vectors.size != self.dimension
                    or vectors.distance != models.Distance.COSINE
                ):
                    raise VectorIndexError("the vector collection configuration is invalid")

            for field_name, field_schema in (
                ("documentVersionId", models.PayloadSchemaType.KEYWORD),
                ("audiences", models.PayloadSchemaType.KEYWORD),
                ("published", models.PayloadSchemaType.BOOL),
                ("indexVersion", models.PayloadSchemaType.INTEGER),
            ):
                self._client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name=field_name,
                    field_schema=field_schema,
                    wait=True,
                )
        except VectorIndexError:
            raise
        except Exception as error:
            raise VectorIndexError("the vector index is unavailable") from error

    @staticmethod
    def _version_filter(
        document_version_id: UUID, index_version: int | None = None
    ) -> models.Filter:
        conditions: list[models.FieldCondition] = [
            models.FieldCondition(
                key="documentVersionId",
                match=models.MatchValue(value=str(document_version_id)),
            )
        ]
        if index_version is not None:
            conditions.append(
                models.FieldCondition(
                    key="indexVersion",
                    match=models.MatchValue(value=index_version),
                )
            )
        return models.Filter(must=conditions)

    def replace_unpublished(
        self,
        *,
        document_version_id: UUID,
        index_version: int,
        audiences: Sequence[str],
        chunks: Sequence[DocumentChunk],
        vectors: Sequence[Sequence[float]],
    ) -> None:
        if len(chunks) != len(vectors) or not chunks:
            raise VectorIndexError("chunk and vector counts are invalid")
        if len(set(audiences)) != len(audiences) or not audiences:
            raise VectorIndexError("document audiences are invalid")
        for vector in vectors:
            if len(vector) != self.dimension:
                raise VectorIndexError("vector dimensions are invalid")

        selector = models.FilterSelector(
            filter=self._version_filter(document_version_id, index_version)
        )
        points = [
            models.PointStruct(
                id=chunk.point_id,
                vector=list(vector),
                payload={
                    "documentVersionId": str(document_version_id),
                    "indexVersion": index_version,
                    "ordinal": chunk.ordinal,
                    "audiences": list(audiences),
                    "published": False,
                },
            )
            for chunk, vector in zip(chunks, vectors, strict=True)
        ]
        try:
            self._client.delete(self.collection_name, selector, wait=True)
            self._client.upsert(self.collection_name, points=points, wait=True)
        except Exception as error:
            raise VectorIndexError("the vector index write failed") from error

    def set_published(
        self, *, document_version_id: UUID, index_version: int, published: bool
    ) -> None:
        try:
            self._client.set_payload(
                collection_name=self.collection_name,
                payload={"published": published},
                points=models.FilterSelector(
                    filter=self._version_filter(document_version_id, index_version)
                ),
                wait=True,
            )
        except Exception as error:
            raise VectorIndexError("the vector index publication update failed") from error

    def search(
        self,
        *,
        query_vector: Sequence[float],
        audiences: Sequence[str],
        limit: int,
    ) -> list[VectorCandidate]:
        if len(query_vector) != self.dimension or not 1 <= limit <= 8:
            raise VectorIndexError("the vector query is invalid")
        if len(set(audiences)) != len(audiences) or not audiences:
            raise VectorIndexError("the vector audience filter is invalid")
        query_filter = models.Filter(
            must=[
                models.FieldCondition(key="published", match=models.MatchValue(value=True)),
                models.FieldCondition(
                    key="audiences",
                    match=models.MatchAny(any=list(audiences)),
                ),
            ]
        )
        try:
            response = self._client.query_points(
                collection_name=self.collection_name,
                query=list(query_vector),
                query_filter=query_filter,
                limit=limit,
                with_payload=["documentVersionId", "indexVersion"],
                with_vectors=False,
            )
            candidates = []
            for point in response.points:
                payload = point.payload or {}
                candidates.append(
                    VectorCandidate(
                        point_id=UUID(str(point.id)),
                        document_version_id=UUID(str(payload["documentVersionId"])),
                        index_version=int(payload["indexVersion"]),
                        score=float(point.score),
                    )
                )
            return candidates
        except Exception as error:
            raise VectorIndexError("the vector query failed") from error

    def healthy(self) -> bool:
        try:
            collection = self._client.get_collection(self.collection_name)
            vectors = collection.config.params.vectors
            return (
                isinstance(vectors, models.VectorParams)
                and vectors.size == self.dimension
                and vectors.distance == models.Distance.COSINE
            )
        except Exception:
            return False

    def inventory(self) -> dict[str, object]:
        counts: dict[str, int] = {}
        total_points = 0
        offset = None
        try:
            while True:
                points, next_offset = self._client.scroll(
                    collection_name=self.collection_name,
                    scroll_filter=None,
                    limit=256,
                    offset=offset,
                    with_payload=["documentVersionId"],
                    with_vectors=False,
                )
                for point in points:
                    payload = point.payload or {}
                    document_version_id = str(UUID(str(payload["documentVersionId"])))
                    counts[document_version_id] = counts.get(document_version_id, 0) + 1
                    total_points += 1
                    if total_points > 100_000:
                        raise VectorIndexError("the vector inventory exceeds the approved bound")
                if next_offset is None:
                    break
                offset = next_offset
        except VectorIndexError:
            raise
        except Exception as error:
            raise VectorIndexError("the vector inventory failed") from error
        if len(counts) > 5_000:
            raise VectorIndexError("the vector inventory exceeds the approved bound")
        return {
            "totalPoints": total_points,
            "versions": [
                {
                    "documentVersionId": document_version_id,
                    "pointCount": counts[document_version_id],
                }
                for document_version_id in sorted(counts)
            ],
        }

    def delete_version(self, document_version_id: UUID) -> None:
        try:
            self._client.delete(
                collection_name=self.collection_name,
                points_selector=models.FilterSelector(
                    filter=self._version_filter(document_version_id)
                ),
                wait=True,
            )
        except Exception as error:
            raise VectorIndexError("the vector deletion failed") from error

    def close(self) -> None:
        self._client.close()
