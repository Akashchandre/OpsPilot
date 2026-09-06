from ..config import AiSettings
from .embedding import EmbeddingError, FastEmbedTextEmbedder
from .service import RagIndexService, rag_unavailable
from .vector_index import QdrantVectorIndex, VectorIndexError


def create_configured_rag_service(settings: AiSettings) -> RagIndexService | None:
    if not settings.rag_enabled:
        return None
    if settings.rag_model_cache_dir is None or settings.rag_qdrant_path is None:
        raise rag_unavailable()

    try:
        embedder = FastEmbedTextEmbedder(
            model_name=settings.rag_embedding_model,
            cache_dir=settings.rag_model_cache_dir,
            threads=settings.rag_embedding_threads,
        )
        vector_index = QdrantVectorIndex(
            collection_name=settings.rag_collection_name,
            path=settings.rag_qdrant_path,
            dimension=embedder.dimension,
        )
        vector_index.initialize()
        return RagIndexService(
            embedder=embedder,
            vector_index=vector_index,
            model_revision=settings.rag_embedding_model_revision,
        )
    except (EmbeddingError, VectorIndexError, ValueError) as error:
        raise rag_unavailable() from error
