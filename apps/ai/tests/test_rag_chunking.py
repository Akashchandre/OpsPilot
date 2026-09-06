import hashlib
from itertools import pairwise
from uuid import UUID

from opspilot_ai.rag.chunking import (
    MAX_CHUNK_CHARACTERS,
    MAX_CHUNK_WORDS,
    MAX_DOCUMENT_CHUNKS,
    MAX_OVERLAP_WORDS,
    chunk_document,
)

DOCUMENT_VERSION_ID = UUID("10000000-0000-4000-8000-000000000001")


def test_chunking_is_deterministic_and_byte_addressable() -> None:
    content = "# Café policy\n\nReturns are accepted.\n\n" + " ".join(
        f"condition-{index}" for index in range(300)
    )

    first = chunk_document(content, document_version_id=DOCUMENT_VERSION_ID, index_version=1)
    second = chunk_document(content, document_version_id=DOCUMENT_VERSION_ID, index_version=1)

    assert first == second
    assert [chunk.ordinal for chunk in first] == list(range(len(first)))
    encoded = content.encode("utf-8")
    for chunk in first:
        sliced = encoded[chunk.byte_start : chunk.byte_end]
        assert sliced.decode("utf-8") == chunk.text
        assert hashlib.sha256(sliced).hexdigest() == chunk.content_sha256
        assert len(chunk.text) <= MAX_CHUNK_CHARACTERS
        assert len(chunk.text.split()) <= MAX_CHUNK_WORDS


def test_hard_splits_use_no_more_than_the_approved_overlap() -> None:
    content = " ".join(f"word{index}" for index in range(500))
    chunks = chunk_document(content, document_version_id=DOCUMENT_VERSION_ID, index_version=1)

    assert len(chunks) > 2
    for left, right in pairwise(chunks):
        left_words = left.text.split()
        right_words = right.text.split()
        maximum_overlap = min(MAX_OVERLAP_WORDS, len(left_words), len(right_words))
        matching = 0
        for count in range(1, maximum_overlap + 1):
            if left_words[-count:] == right_words[:count]:
                matching = count
        assert matching <= MAX_OVERLAP_WORDS
        assert matching > 0


def test_structure_boundaries_do_not_force_overlap() -> None:
    first_paragraph = " ".join(f"first{index}" for index in range(100))
    second_paragraph = " ".join(f"second{index}" for index in range(100))
    chunks = chunk_document(
        f"{first_paragraph}\n\n{second_paragraph}",
        document_version_id=DOCUMENT_VERSION_ID,
        index_version=1,
    )

    assert chunks[0].text == first_paragraph
    assert chunks[1].text.startswith("second0")


def test_long_unbroken_tokens_are_split_within_character_bounds() -> None:
    content = "x" * (MAX_CHUNK_CHARACTERS * 2 + 17)
    chunks = chunk_document(content, document_version_id=DOCUMENT_VERSION_ID, index_version=1)

    assert [len(chunk.text) for chunk in chunks] == [MAX_CHUNK_CHARACTERS] * 2 + [17]
    assert chunks[0].byte_start == 0
    assert chunks[-1].byte_end == len(content)


def test_point_identity_changes_with_index_or_content() -> None:
    first = chunk_document(
        "stable content", document_version_id=DOCUMENT_VERSION_ID, index_version=1
    )
    reindexed = chunk_document(
        "stable content", document_version_id=DOCUMENT_VERSION_ID, index_version=2
    )
    changed = chunk_document(
        "changed content", document_version_id=DOCUMENT_VERSION_ID, index_version=1
    )

    assert first[0].point_id != reindexed[0].point_id
    assert first[0].point_id != changed[0].point_id


def test_rejects_content_that_would_exceed_the_document_chunk_limit() -> None:
    token_count = (
        MAX_CHUNK_WORDS + (MAX_CHUNK_WORDS - MAX_OVERLAP_WORDS) * (MAX_DOCUMENT_CHUNKS - 1) + 1
    )

    try:
        chunk_document(
            "a " * token_count,
            document_version_id=DOCUMENT_VERSION_ID,
            index_version=1,
        )
    except ValueError as error:
        assert str(error) == "document exceeds the approved chunk limit"
    else:
        raise AssertionError("expected the document chunk limit to be enforced")
