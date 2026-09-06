import math
from collections.abc import Callable, Iterable, Sequence
from pathlib import Path
from typing import Any

from fastembed import TextEmbedding


class EmbeddingError(Exception):
    pass


class FastEmbedTextEmbedder:
    def __init__(
        self,
        *,
        model_name: str,
        cache_dir: Path,
        threads: int,
        dimension: int = 384,
        model_factory: Callable[..., Any] = TextEmbedding,
    ) -> None:
        self.model_name = model_name
        self.dimension = dimension
        try:
            self._model = model_factory(
                model_name=model_name,
                cache_dir=str(cache_dir),
                threads=threads,
                local_files_only=True,
            )
        except Exception as error:
            raise EmbeddingError("embedding model is unavailable") from error

    def _validated(self, vectors: Iterable[Sequence[float]], expected: int) -> list[list[float]]:
        result: list[list[float]] = []
        try:
            for vector in vectors:
                normalized = [float(value) for value in vector]
                if len(normalized) != self.dimension or not all(
                    math.isfinite(value) for value in normalized
                ):
                    raise EmbeddingError("embedding output is invalid")
                result.append(normalized)
        except EmbeddingError:
            raise
        except Exception as error:
            raise EmbeddingError("embedding output is invalid") from error
        if len(result) != expected:
            raise EmbeddingError("embedding output count is invalid")
        return result

    def embed_passages(self, passages: Sequence[str]) -> list[list[float]]:
        if not passages:
            raise EmbeddingError("at least one passage is required")
        return self._validated(self._model.passage_embed(passages), len(passages))

    def embed_query(self, query: str) -> list[float]:
        return self._validated(self._model.query_embed([query]), 1)[0]
