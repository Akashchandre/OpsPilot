# Phase 8 — RAG and Document Intelligence

## Status

**ACCEPTED AND COMPLETE on 2026-09-06 for the repository/development scope under ADR 0011.** The
user accepted the complete Phase 8 baseline, exact dependencies, and one-time model download, then
requested implementation. The approved text/Markdown document lifecycle, private encrypted
development storage, local embedding/Qdrant retrieval, two-step source authorization, citations,
recovery, UI, and evaluation baseline is implemented and verified. After the full gate passed, the
user instructed that Phase 8 be committed if complete; this records explicit acceptance. Production
storage/vector topology, privacy/retention, network, monitoring, backup, and rollout approval remain
separate blockers.

## Objective

Add secure company-document ingestion and permission-aware retrieval so assistants can provide grounded answers with provenance.

## Requirements and goals

- Authorized document upload, protected object storage, metadata/version/lifecycle management.
- Validated asynchronous extraction, chunking, embedding, indexing, replacement, and deletion.
- Vector retrieval filtered by user role, audience, business scope, document status, and version.
- Grounded responses with citations and an explicit insufficient-evidence behavior.
- Evaluation of retrieval quality, faithfulness, security, latency, and cost.

## Decisions required

Formats/limits/OCR; object storage; malware scanning; parser; chunking; embedding model; vector database and tenancy; hybrid search/reranking; document audiences; citation UX; version/delete propagation; reindexing; retention/legal rules; retrieval thresholds and evaluation targets.

## Tasks

- [x] Confirm the Phase 7 repository gate and the user's explicit authorization to start Phase 8.
- [x] Inspect the existing AI, authentication/RBAC, audit, job, configuration, persistence, and UI
      boundaries relevant to documents and retrieval.
- [x] Draft the Phase 8 decision proposal, proposed permission/audience matrix, upload/retrieval
      threat model, dependency/service/account catalog, and measurable evaluation targets.
- [x] Explicitly approve the complete Phase 8 baseline and separately authorize the exact approved
      dependencies and one-time model download under ADR 0011.
- [x] Implement document metadata/storage APIs and access controls.
- [x] Create idempotent ingestion jobs plus lifecycle/status UI.
- [x] Implement validated scanning, extraction, chunking, embedding, and indexing.
- [x] Implement metadata-filtered retrieval, bounded context construction, citations,
      insufficient-evidence behavior, and source authorization.
- [x] Implement version, replacement, reindex, deletion, recovery, and retention flows.
- [x] Build retrieval, grounding, security, outage, latency, and cost evaluations; run the complete
      prior-phase regression; synchronize operations and progress documentation.
- [x] Record explicit user acceptance after reviewing the completed repository/development
      evidence. Production rollout remains a separate authorization.

## Acceptance criteria

- Only authorized users upload/manage documents and only allowed audiences retrieve them.
- Invalid, oversized, malicious, failed, stale, or deleted documents cannot become answer context.
- Reprocessing is idempotent and versions do not create ambiguous active sources.
- Answers cite accessible sources and state when evidence is insufficient.
- Cross-user/business/audience retrieval tests return no leakage.
- Deletion/retention behavior reaches original storage, metadata, vectors, caches, and backups according to documented policy.

## Testing requirements

Upload validation/scanning/parser tests; ingestion job retry/idempotency/version tests; retrieval access/isolation and prompt-injection tests; citation/source-deletion tests; golden-set retrieval and grounded-answer evaluations; vector/object-store outage recovery; load/latency/cost checks; prior-phase regression.

## Edge cases

Duplicate or revised documents, corrupt/encrypted/scanned/empty/huge files, unsupported language, tables/images, contradictory sources, no results, stale index, partial indexing, deletion during query, embedding model migration, indirect prompt injection in documents.

## Security considerations

Keep storage private with short-lived controlled access; validate actual file content; quarantine/scan uploads; sandbox parsing; enforce metadata filters before retrieval; treat document instructions as data; avoid public vector identifiers; redact logs; protect reindex/delete/admin operations; review provider data terms.

## Completion criteria

The ingestion lifecycle, authorization, citations, deletion, recovery, and evaluation thresholds are documented and pass; prior phases remain stable; no Phase 9 LangGraph business/support automation is added; and explicit acceptance is recorded.

## Documentation updates

Update AI/system architecture, database/API contracts, storage/vector topology, document lifecycle/audience matrix, ingestion/recovery/deletion runbooks, evaluation reports, decisions, phase status, and `WORK-PROGRESS.md`.

## Explicit exclusions

LangGraph multi-step business-data and AI support workflows remain out of scope.
