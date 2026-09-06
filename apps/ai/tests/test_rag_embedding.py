from pathlib import Path

import pytest

from opspilot_ai.rag.embedding import EmbeddingError, FastEmbedTextEmbedder


class FakeEmbeddingModel:
    def __init__(self, **configuration: object) -> None:
        self.configuration = configuration

    def passage_embed(self, passages: list[str]):
        for index, _passage in enumerate(passages):
            yield [float(index), 0.5, 1.0]

    def query_embed(self, queries: list[str]):
        for _query in queries:
            yield [0.25, 0.5, 0.75]


def test_embedder_is_offline_fixed_dimension_and_uses_passage_and_query_modes(
    tmp_path: Path,
) -> None:
    instances: list[FakeEmbeddingModel] = []

    def factory(**configuration: object) -> FakeEmbeddingModel:
        model = FakeEmbeddingModel(**configuration)
        instances.append(model)
        return model

    embedder = FastEmbedTextEmbedder(
        model_name="sentence-transformers/all-MiniLM-L6-v2",
        cache_dir=tmp_path,
        threads=1,
        dimension=3,
        model_factory=factory,
    )

    assert instances[0].configuration["local_files_only"] is True
    assert embedder.embed_passages(["one", "two"]) == [[0.0, 0.5, 1.0], [1.0, 0.5, 1.0]]
    assert embedder.embed_query("question") == [0.25, 0.5, 0.75]


def test_embedder_rejects_bad_dimensions_and_nonfinite_values(tmp_path: Path) -> None:
    class InvalidModel(FakeEmbeddingModel):
        def passage_embed(self, passages: list[str]):
            del passages
            yield [1.0, float("nan")]

    embedder = FastEmbedTextEmbedder(
        model_name="sentence-transformers/all-MiniLM-L6-v2",
        cache_dir=tmp_path,
        threads=1,
        dimension=2,
        model_factory=InvalidModel,
    )
    with pytest.raises(EmbeddingError):
        embedder.embed_passages(["unsafe"])


def test_embedder_maps_model_initialization_failure(tmp_path: Path) -> None:
    def failing_factory(**configuration: object) -> None:
        del configuration
        raise OSError("sensitive local path")

    with pytest.raises(EmbeddingError, match="unavailable") as raised:
        FastEmbedTextEmbedder(
            model_name="sentence-transformers/all-MiniLM-L6-v2",
            cache_dir=tmp_path,
            threads=1,
            model_factory=failing_factory,
        )
    assert "sensitive local path" not in str(raised.value)
