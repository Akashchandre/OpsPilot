import ctypes
import hashlib
import json
import math
import os
import unicodedata
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from time import monotonic, process_time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from opspilot_ai.config import AI_ROOT, RAG_EMBEDDING_MODEL, RAG_EMBEDDING_MODEL_REVISION
from opspilot_ai.rag.contracts import (
    CandidateSearchRequest,
    DeleteDocumentVectorsRequest,
    DocumentPublicationRequest,
    IndexDocumentRequest,
)
from opspilot_ai.rag.embedding import FastEmbedTextEmbedder
from opspilot_ai.rag.service import RagIndexService
from opspilot_ai.rag.vector_index import QdrantVectorIndex

RAG_EVALUATION_FLAG = "OPSPILOT_RAG_EVAL"
MODEL_CACHE_VARIABLE = "AI_RAG_MODEL_CACHE_DIR"
GOLDEN_SET_PATH = AI_ROOT / "evaluation" / "rag-golden-set.json"
MINIMUM_CASE_COUNT = 40
MINIMUM_RECALL_AT_5 = 90.0
MINIMUM_MRR = 0.8
MAXIMUM_RETRIEVAL_P95_MS = 500.0
RETRIEVAL_LIMIT = 8

Audience = Literal["CUSTOMER", "OWNER"]
Lifecycle = Literal["ACTIVE", "SUPERSEDED", "DELETED"]
CaseKind = Literal["ANSWER", "NO_EVIDENCE"]


class GoldenDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document_id: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[a-z][a-z0-9-]*$",
        alias="documentId",
    )
    version_id: UUID = Field(alias="versionId")
    lifecycle: Lifecycle
    audiences: list[Audience] = Field(min_length=1, max_length=2)
    content: str = Field(min_length=1, max_length=256 * 1024)

    @field_validator("audiences")
    @classmethod
    def require_unique_sorted_audiences(cls, value: list[Audience]) -> list[Audience]:
        if value != sorted(set(value)):
            raise ValueError("document audiences must be unique and sorted")
        return value

    @field_validator("content")
    @classmethod
    def require_normalized_content(cls, value: str) -> str:
        if value != value.strip() or unicodedata.normalize("NFC", value) != value:
            raise ValueError("document content must be trimmed and NFC-normalized")
        if len(value.encode("utf-8")) > 256 * 1024:
            raise ValueError("document content exceeds the approved byte limit")
        return value


class GoldenCase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    case_id: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[a-z][a-z0-9-]*$",
        alias="caseId",
    )
    assistant: Audience
    kind: CaseKind
    question: str = Field(min_length=1, max_length=2_000)
    expected_documents: list[str] = Field(default_factory=list, alias="expectedDocuments")
    forbidden_documents: list[str] = Field(default_factory=list, alias="forbiddenDocuments")
    tags: list[str] = Field(default_factory=list)

    @field_validator("question")
    @classmethod
    def require_normalized_question(cls, value: str) -> str:
        if (
            value != value.strip()
            or " ".join(value.split()) != value
            or unicodedata.normalize("NFC", value) != value
        ):
            raise ValueError("questions must use normalized single-line whitespace")
        return value

    @field_validator("expected_documents", "forbidden_documents", "tags")
    @classmethod
    def require_unique_sorted_values(cls, value: list[str]) -> list[str]:
        if value != sorted(set(value)):
            raise ValueError("case lists must be unique and sorted")
        return value

    @model_validator(mode="after")
    def require_kind_evidence_contract(self) -> "GoldenCase":
        if self.kind == "ANSWER" and not self.expected_documents:
            raise ValueError("answer cases require an expected document")
        if self.kind == "NO_EVIDENCE" and self.expected_documents:
            raise ValueError("no-evidence cases cannot name an expected document")
        return self


class GoldenSet(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = Field(alias="schemaVersion")
    embedding_model: Literal[RAG_EMBEDDING_MODEL] = Field(alias="embeddingModel")
    embedding_model_revision: Literal[RAG_EMBEDDING_MODEL_REVISION] = Field(
        alias="embeddingModelRevision"
    )
    minimum_score: float = Field(ge=-1, le=1, alias="minimumScore")
    documents: list[GoldenDocument] = Field(min_length=1)
    cases: list[GoldenCase] = Field(min_length=MINIMUM_CASE_COUNT)

    @model_validator(mode="after")
    def require_consistent_representative_corpus(self) -> "GoldenSet":
        document_ids = [document.document_id for document in self.documents]
        version_ids = [document.version_id for document in self.documents]
        case_ids = [case.case_id for case in self.cases]
        if len(document_ids) != len(set(document_ids)):
            raise ValueError("document IDs must be unique")
        if len(version_ids) != len(set(version_ids)):
            raise ValueError("version IDs must be unique")
        if len(case_ids) != len(set(case_ids)):
            raise ValueError("case IDs must be unique")

        by_id = {document.document_id: document for document in self.documents}
        for case in self.cases:
            referenced = set(case.expected_documents + case.forbidden_documents)
            if not referenced.issubset(by_id):
                raise ValueError("cases may reference only known documents")
            allowed = {"CUSTOMER"} if case.assistant == "CUSTOMER" else {"CUSTOMER", "OWNER"}
            for document_id in case.expected_documents:
                document = by_id[document_id]
                if document.lifecycle != "ACTIVE" or not allowed.intersection(document.audiences):
                    raise ValueError("expected documents must be active and audience eligible")

        assistants = {case.assistant for case in self.cases}
        tags = {tag for case in self.cases for tag in case.tags}
        required_tags = {
            "audience-isolation",
            "contradictory",
            "deleted-exclusion",
            "no-evidence",
            "prompt-injection",
            "revised",
            "superseded-exclusion",
        }
        if assistants != {"CUSTOMER", "OWNER"} or not required_tags.issubset(tags):
            raise ValueError("golden set does not cover the required Phase 8 categories")
        return self


def load_golden_set(path: Path = GOLDEN_SET_PATH) -> GoldenSet:
    return GoldenSet.model_validate_json(path.read_text(encoding="utf-8"))


def _p95(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * 0.95) - 1)]


def _rate(passed: int, total: int) -> float:
    return 100.0 if total == 0 else round((passed / total) * 100, 2)


def _directory_size(path: Path) -> int:
    total = 0
    for candidate in path.rglob("*"):
        try:
            if candidate.is_file():
                total += candidate.stat().st_size
        except OSError:
            continue
    return total


class _ProcessMemoryCounters(ctypes.Structure):
    _fields_ = [
        ("cb", ctypes.c_ulong),
        ("page_fault_count", ctypes.c_ulong),
        ("peak_working_set_size", ctypes.c_size_t),
        ("working_set_size", ctypes.c_size_t),
        ("quota_peak_paged_pool_usage", ctypes.c_size_t),
        ("quota_paged_pool_usage", ctypes.c_size_t),
        ("quota_peak_non_paged_pool_usage", ctypes.c_size_t),
        ("quota_non_paged_pool_usage", ctypes.c_size_t),
        ("pagefile_usage", ctypes.c_size_t),
        ("peak_pagefile_usage", ctypes.c_size_t),
    ]


def _process_memory() -> tuple[int | None, int | None]:
    if os.name == "nt":
        counters = _ProcessMemoryCounters()
        counters.cb = ctypes.sizeof(counters)
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        psapi = ctypes.WinDLL("psapi", use_last_error=True)
        get_current_process = kernel32.GetCurrentProcess
        get_current_process.restype = ctypes.c_void_p
        get_process_memory_info = psapi.GetProcessMemoryInfo
        get_process_memory_info.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(_ProcessMemoryCounters),
            ctypes.c_ulong,
        ]
        get_process_memory_info.restype = ctypes.c_int
        if get_process_memory_info(get_current_process(), ctypes.byref(counters), counters.cb):
            return int(counters.working_set_size), int(counters.peak_working_set_size)
        return None, None
    try:
        import resource

        maximum = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
        if os.uname().sysname != "Darwin":
            maximum *= 1024
        return maximum, maximum
    except (AttributeError, ImportError, OSError):
        return None, None


def _publication_request(document: GoldenDocument, published: bool) -> DocumentPublicationRequest:
    return DocumentPublicationRequest.model_validate(
        {
            "contractVersion": 1,
            "documentVersionId": str(document.version_id),
            "indexVersion": 1,
            "published": published,
        }
    )


def _candidate_request(case: GoldenCase) -> CandidateSearchRequest:
    audiences = ["CUSTOMER"] if case.assistant == "CUSTOMER" else ["CUSTOMER", "OWNER"]
    return CandidateSearchRequest.model_validate(
        {
            "contractVersion": 1,
            "assistant": case.assistant,
            "audiences": audiences,
            "question": case.question,
            "limit": RETRIEVAL_LIMIT,
        }
    )


def summarize_results(
    *,
    cases: list[dict[str, object]],
    minimum_score: float,
    retrieval_p95_ms: float | None,
) -> dict[str, object]:
    answers = [case for case in cases if case["kind"] == "ANSWER"]
    no_evidence = [case for case in cases if case["kind"] == "NO_EVIDENCE"]
    recall_passed = sum(bool(case["retrievedAt5"]) for case in answers)
    reciprocal_rank = sum(
        1 / int(case["expectedRank"])
        for case in answers
        if isinstance(case["expectedRank"], int) and int(case["expectedRank"]) <= 5
    )
    recall_at_5 = _rate(recall_passed, len(answers))
    mrr = round(reciprocal_rank / len(answers), 4) if answers else 0.0
    no_evidence_rate = _rate(
        sum(bool(case["noEvidencePassed"]) for case in no_evidence), len(no_evidence)
    )

    def tag_rate(tag: str) -> float:
        tagged = [case for case in cases if tag in case["tags"]]
        return _rate(sum(bool(case["forbiddenAbsent"]) for case in tagged), len(tagged))

    audience_rate = tag_rate("audience-isolation")
    superseded_rate = tag_rate("superseded-exclusion")
    deleted_rate = tag_rate("deleted-exclusion")
    thresholds = {
        "caseCountAtLeast40": len(cases) >= MINIMUM_CASE_COUNT,
        "recallAt5AtLeast90": recall_at_5 >= MINIMUM_RECALL_AT_5,
        "mrrAtLeast0_80": mrr >= MINIMUM_MRR,
        "noEvidenceBehavior100": no_evidence_rate == 100,
        "audienceIsolation100": audience_rate == 100,
        "supersededExclusion100": superseded_rate == 100,
        "deletedExclusion100": deleted_rate == 100,
        "retrievalP95AtMost500Ms": (
            retrieval_p95_ms is not None and retrieval_p95_ms <= MAXIMUM_RETRIEVAL_P95_MS
        ),
    }
    return {
        "success": all(thresholds.values()),
        "minimumScore": minimum_score,
        "caseCount": len(cases),
        "answerCaseCount": len(answers),
        "noEvidenceCaseCount": len(no_evidence),
        "recallAt5": recall_at_5,
        "meanReciprocalRank": mrr,
        "noEvidencePassRate": no_evidence_rate,
        "audienceIsolationPassRate": audience_rate,
        "supersededExclusionPassRate": superseded_rate,
        "deletedExclusionPassRate": deleted_rate,
        "retrievalP95Ms": retrieval_p95_ms,
        "thresholds": thresholds,
    }


def _calibration(cases: list[dict[str, object]]) -> dict[str, object]:
    positive_scores = sorted(
        (float(case["expectedScore"]) if isinstance(case["expectedScore"], (int, float)) else -1.0)
        for case in cases
        if case["kind"] == "ANSWER"
    )
    negative_scores = [
        float(case["topScore"])
        for case in cases
        if case["kind"] == "NO_EVIDENCE" and isinstance(case["topScore"], (int, float))
    ]
    required_positive_count = math.ceil(len(positive_scores) * MINIMUM_RECALL_AT_5 / 100)
    positive_floor_for_90 = (
        positive_scores[-required_positive_count]
        if positive_scores and required_positive_count > 0
        else None
    )
    minimum_positive = min(positive_scores, default=None)
    maximum_negative = max(negative_scores, default=-1.0)
    upper_boundary = (
        minimum_positive
        if minimum_positive is not None and minimum_positive > maximum_negative
        else positive_floor_for_90
    )
    suggested = (
        round((maximum_negative + float(upper_boundary)) / 2, 3)
        if upper_boundary is not None and float(upper_boundary) > maximum_negative
        else None
    )
    feasible = suggested is not None
    return {
        "maximumNoEvidenceScore": round(maximum_negative, 6),
        "minimumPositiveExpectedScore": (
            round(float(minimum_positive), 6) if minimum_positive is not None else None
        ),
        "positiveScoreFloorFor90Recall": (
            round(float(positive_floor_for_90), 6) if positive_floor_for_90 is not None else None
        ),
        "suggestedMinimumScore": suggested,
        "suggestionHasPositiveMargin": feasible,
        "automaticallyApplied": False,
    }


def run_rag_evaluation(
    golden_set: GoldenSet,
    *,
    model_cache_dir: Path,
    qdrant_path: Path,
) -> dict[str, object]:
    started = monotonic()
    cpu_started = process_time()
    rss_before, _peak_before = _process_memory()
    embedder = FastEmbedTextEmbedder(
        model_name=golden_set.embedding_model,
        cache_dir=model_cache_dir,
        threads=1,
    )
    vector_index = QdrantVectorIndex(
        collection_name="opspilot_rag_evaluation_v1",
        dimension=embedder.dimension,
        path=qdrant_path,
    )
    vector_index.initialize()
    service = RagIndexService(
        embedder=embedder,
        vector_index=vector_index,
        model_revision=golden_set.embedding_model_revision,
    )
    version_to_document = {
        document.version_id: document.document_id for document in golden_set.documents
    }
    indexed_chunks = 0
    query_durations: list[float] = []
    case_results: list[dict[str, object]] = []
    try:
        for document in golden_set.documents:
            content_bytes = document.content.encode("utf-8")
            index_result = service.index_document(
                IndexDocumentRequest.model_validate(
                    {
                        "contractVersion": 1,
                        "documentVersionId": str(document.version_id),
                        "indexVersion": 1,
                        "contentSha256": hashlib.sha256(content_bytes).hexdigest(),
                        "audiences": document.audiences,
                        "embeddingModel": golden_set.embedding_model,
                        "embeddingModelRevision": golden_set.embedding_model_revision,
                        "content": document.content,
                    }
                )
            )
            indexed_chunks += len(index_result["chunks"])
            if document.lifecycle == "ACTIVE":
                service.set_publication(_publication_request(document, True))
            elif document.lifecycle == "SUPERSEDED":
                service.set_publication(_publication_request(document, True))
                service.set_publication(_publication_request(document, False))
            else:
                service.set_publication(_publication_request(document, True))
                service.delete_vectors(
                    DeleteDocumentVectorsRequest.model_validate(
                        {
                            "contractVersion": 1,
                            "documentVersionId": str(document.version_id),
                        }
                    )
                )

        for case in golden_set.cases:
            query_started = monotonic()
            raw_candidates = service.candidates(_candidate_request(case))["candidates"]
            duration_ms = (monotonic() - query_started) * 1_000
            query_durations.append(duration_ms)
            candidates = [
                {
                    **candidate,
                    "documentId": version_to_document[UUID(candidate["documentVersionId"])],
                }
                for candidate in raw_candidates
            ]
            accepted = [
                candidate
                for candidate in candidates
                if float(candidate["score"]) >= golden_set.minimum_score
            ]
            expected_rank = next(
                (
                    index
                    for index, candidate in enumerate(accepted, start=1)
                    if candidate["documentId"] in case.expected_documents
                ),
                None,
            )
            expected_score = next(
                (
                    float(candidate["score"])
                    for candidate in candidates
                    if candidate["documentId"] in case.expected_documents
                ),
                None,
            )
            forbidden_absent = all(
                candidate["documentId"] not in case.forbidden_documents for candidate in candidates
            )
            case_results.append(
                {
                    "caseId": case.case_id,
                    "assistant": case.assistant,
                    "kind": case.kind,
                    "tags": case.tags,
                    "topScore": (round(float(candidates[0]["score"]), 6) if candidates else None),
                    "expectedScore": (
                        round(expected_score, 6) if expected_score is not None else None
                    ),
                    "expectedRank": expected_rank,
                    "retrievedAt5": expected_rank is not None and expected_rank <= 5,
                    "noEvidencePassed": case.kind == "NO_EVIDENCE" and not accepted,
                    "forbiddenAbsent": forbidden_absent,
                    "durationMs": round(duration_ms, 3),
                }
            )
    finally:
        service.close()

    retrieval_p95 = _p95(query_durations)
    summary = summarize_results(
        cases=case_results,
        minimum_score=golden_set.minimum_score,
        retrieval_p95_ms=round(retrieval_p95, 3) if retrieval_p95 is not None else None,
    )
    rss_after, peak_after = _process_memory()
    return {
        **summary,
        "evaluatedAt": datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "embeddingModel": golden_set.embedding_model,
        "embeddingModelRevision": golden_set.embedding_model_revision,
        "calibration": _calibration(case_results),
        "resources": {
            "documentCount": len(golden_set.documents),
            "indexedChunkCount": indexed_chunks,
            "modelCacheBytes": _directory_size(model_cache_dir),
            "vectorIndexBytes": _directory_size(qdrant_path),
            "processCpuMs": round((process_time() - cpu_started) * 1_000, 3),
            "wallDurationMs": round((monotonic() - started) * 1_000, 3),
            "rssBeforeBytes": rss_before,
            "rssAfterBytes": rss_after,
            "peakWorkingSetBytes": peak_after,
        },
        "cases": case_results,
        "questionOrDocumentContentEmitted": False,
        "secretValuesEmitted": False,
    }


def _safe_failure(code: str) -> dict[str, object]:
    return {
        "success": False,
        "errorCode": code,
        "questionOrDocumentContentEmitted": False,
        "secretValuesEmitted": False,
    }


def main() -> int:
    if os.environ.get(RAG_EVALUATION_FLAG, "").casefold() != "true":
        print(json.dumps(_safe_failure("RAG_EVALUATION_NOT_OPTED_IN"), sort_keys=True))
        return 2
    configured_cache = os.environ.get(MODEL_CACHE_VARIABLE, "")
    model_cache_dir = Path(configured_cache)
    if not configured_cache or not model_cache_dir.is_absolute() or not model_cache_dir.is_dir():
        print(json.dumps(_safe_failure("RAG_MODEL_CACHE_INVALID"), sort_keys=True))
        return 2
    try:
        golden_set = load_golden_set()
        with TemporaryDirectory(prefix="opspilot-rag-evaluation-") as directory:
            result = run_rag_evaluation(
                golden_set,
                model_cache_dir=model_cache_dir,
                qdrant_path=Path(directory),
            )
    except Exception:
        print(json.dumps(_safe_failure("RAG_EVALUATION_FAILED"), sort_keys=True))
        return 1
    print(json.dumps(result, separators=(",", ":"), sort_keys=True))
    return 0 if result["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
