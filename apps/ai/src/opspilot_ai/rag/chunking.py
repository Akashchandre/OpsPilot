import hashlib
import re
from dataclasses import dataclass
from uuid import NAMESPACE_URL, UUID, uuid5

MAX_CHUNK_WORDS = 160
MAX_CHUNK_CHARACTERS = 1_200
MAX_OVERLAP_WORDS = 30
MAX_DOCUMENT_CHUNKS = 1_000

_TOKEN_PATTERN = re.compile(r"\S+")
_SENTENCE_END_PATTERN = re.compile(r"[.!?][\"')\]]*$")


@dataclass(frozen=True, slots=True)
class DocumentChunk:
    point_id: UUID
    ordinal: int
    byte_start: int
    byte_end: int
    content_sha256: str
    text: str


@dataclass(frozen=True, slots=True)
class _Token:
    start: int
    end: int
    value: str


def _tokens(content: str) -> list[_Token]:
    result: list[_Token] = []
    for match in _TOKEN_PATTERN.finditer(content):
        value = match.group(0)
        if len(value) <= MAX_CHUNK_CHARACTERS:
            result.append(_Token(match.start(), match.end(), value))
            continue
        for offset in range(0, len(value), MAX_CHUNK_CHARACTERS):
            result.append(
                _Token(
                    match.start() + offset,
                    min(match.start() + offset + MAX_CHUNK_CHARACTERS, match.end()),
                    value[offset : offset + MAX_CHUNK_CHARACTERS],
                )
            )
    return result


def _byte_offsets(content: str) -> list[int]:
    offsets = [0]
    total = 0
    for character in content:
        total += len(character.encode("utf-8"))
        offsets.append(total)
    return offsets


def _is_structure_boundary(content: str, tokens: list[_Token], boundary: int) -> bool:
    if boundary <= 0 or boundary >= len(tokens):
        return boundary == len(tokens)
    gap = content[tokens[boundary - 1].end : tokens[boundary].start]
    if "\n\n" in gap:
        return True
    line_start = content.rfind("\n", 0, tokens[boundary].start) + 1
    return tokens[boundary].start == line_start and tokens[boundary].value.startswith("#")


def _select_end(content: str, tokens: list[_Token], start: int) -> tuple[int, bool]:
    maximum_end = start
    while maximum_end < len(tokens):
        next_end = maximum_end + 1
        character_count = tokens[next_end - 1].end - tokens[start].start
        if next_end - start > MAX_CHUNK_WORDS or character_count > MAX_CHUNK_CHARACTERS:
            break
        maximum_end = next_end

    if maximum_end == start:
        raise ValueError("document token cannot fit within the chunk bounds")
    if maximum_end == len(tokens):
        return maximum_end, True

    structure_boundaries = [
        boundary
        for boundary in range(start + 1, maximum_end + 1)
        if _is_structure_boundary(content, tokens, boundary)
    ]
    if structure_boundaries:
        return structure_boundaries[-1], True

    sentence_boundaries = [
        boundary
        for boundary in range(start + 1, maximum_end + 1)
        if _SENTENCE_END_PATTERN.search(tokens[boundary - 1].value)
    ]
    if sentence_boundaries:
        return sentence_boundaries[-1], False
    return maximum_end, False


def chunk_document(
    content: str, *, document_version_id: UUID, index_version: int
) -> list[DocumentChunk]:
    tokens = _tokens(content)
    if not tokens:
        raise ValueError("document content must contain at least one token")
    if index_version < 1:
        raise ValueError("index version must be positive")

    byte_offsets = _byte_offsets(content)
    chunks: list[DocumentChunk] = []
    start = 0
    while start < len(tokens):
        end, semantic_boundary = _select_end(content, tokens, start)
        character_start = tokens[start].start
        character_end = tokens[end - 1].end
        text = content[character_start:character_end]
        content_sha256 = hashlib.sha256(text.encode("utf-8")).hexdigest()
        ordinal = len(chunks)
        if ordinal >= MAX_DOCUMENT_CHUNKS:
            raise ValueError("document exceeds the approved chunk limit")
        point_id = uuid5(
            NAMESPACE_URL,
            f"opspilot:{document_version_id}:{index_version}:{ordinal}:{content_sha256}",
        )
        chunks.append(
            DocumentChunk(
                point_id=point_id,
                ordinal=ordinal,
                byte_start=byte_offsets[character_start],
                byte_end=byte_offsets[character_end],
                content_sha256=content_sha256,
                text=text,
            )
        )

        if end >= len(tokens):
            break
        start = end if semantic_boundary else max(start + 1, end - MAX_OVERLAP_WORDS)

    return chunks
