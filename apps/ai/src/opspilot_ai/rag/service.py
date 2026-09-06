from typing import Any

from ..config import RAG_EMBEDDING_MODEL, RAG_EMBEDDING_MODEL_REVISION
from ..errors import AiServiceError
from .chunking import chunk_document
from .contracts import (
    CandidateSearchRequest,
    DeleteDocumentVectorsRequest,
    DocumentPublicationRequest,
    IndexDocumentRequest,
)
from .embedding import EmbeddingError, FastEmbedTextEmbedder
from .vector_index import QdrantVectorIndex, VectorIndexError


def rag_unavailable() -> AiServiceError:
    return AiServiceError(
        503,
        "DOCUMENT_INDEX_UNAVAILABLE",
        "The document index is temporarily unavailable",
    )


class RagIndexService:
    def __init__(
        self,
        *,
        embedder: FastEmbedTextEmbedder,
        vector_index: QdrantVectorIndex,
        model_revision: str = RAG_EMBEDDING_MODEL_REVISION,
    ) -> None:
        if embedder.model_name != RAG_EMBEDDING_MODEL:
            raise ValueError("the configured embedding model is not approved")
        self._embedder = embedder
        self._vector_index = vector_index
        self._model_revision = model_revision

    def index_document(self, request: IndexDocumentRequest) -> dict[str, Any]:
        try:
            chunks = chunk_document(
                request.content,
                document_version_id=request.document_version_id,
                index_version=request.index_version,
            )
            vectors = self._embedder.embed_passages([chunk.text for chunk in chunks])
            self._vector_index.replace_unpublished(
                document_version_id=request.document_version_id,
                index_version=request.index_version,
                audiences=request.audiences,
                chunks=chunks,
                vectors=vectors,
            )
        except (EmbeddingError, VectorIndexError, ValueError) as error:
            raise rag_unavailable() from error

        return {
            "embeddingModel": self._embedder.model_name,
            "embeddingModelRevision": self._model_revision,
            "embeddingDimension": self._embedder.dimension,
            "vectorCollection": self._vector_index.collection_name,
            "indexVersion": request.index_version,
            "published": False,
            "chunks": [
                {
                    "pointId": str(chunk.point_id),
                    "ordinal": chunk.ordinal,
                    "byteStart": chunk.byte_start,
                    "byteEnd": chunk.byte_end,
                    "contentSha256": chunk.content_sha256,
                }
                for chunk in chunks
            ],
        }

    def set_publication(self, request: DocumentPublicationRequest) -> dict[str, Any]:
        try:
            self._vector_index.set_published(
                document_version_id=request.document_version_id,
                index_version=request.index_version,
                published=request.published,
            )
        except VectorIndexError as error:
            raise rag_unavailable() from error
        return {
            "documentVersionId": str(request.document_version_id),
            "indexVersion": request.index_version,
            "published": request.published,
        }

    def candidates(self, request: CandidateSearchRequest) -> dict[str, Any]:
        try:
            query_vector = self._embedder.embed_query(request.question)
            candidates = self._vector_index.search(
                query_vector=query_vector,
                audiences=request.audiences,
                limit=request.limit,
            )
        except (EmbeddingError, VectorIndexError) as error:
            raise rag_unavailable() from error
        return {
            "candidates": [
                {
                    "pointId": str(candidate.point_id),
                    "documentVersionId": str(candidate.document_version_id),
                    "indexVersion": candidate.index_version,
                    # Cosine implementations may produce a few ulps outside the
                    # mathematical range. Keep the signed service contract exact.
                    "score": max(-1.0, min(1.0, candidate.score)),
                }
                for candidate in candidates
            ]
        }

    def delete_vectors(self, request: DeleteDocumentVectorsRequest) -> dict[str, Any]:
        try:
            self._vector_index.delete_version(request.document_version_id)
        except VectorIndexError as error:
            raise rag_unavailable() from error
        return {"documentVersionId": str(request.document_version_id), "deleted": True}

    def health(self) -> dict[str, str]:
        return {
            "embedding": "ready",
            "vectorIndex": "ready" if self._vector_index.healthy() else "unavailable",
        }

    def inventory(self) -> dict[str, object]:
        try:
            return self._vector_index.inventory()
        except VectorIndexError as error:
            raise rag_unavailable() from error

    def close(self) -> None:
        self._vector_index.close()
