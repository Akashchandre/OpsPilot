# Phase 8 Implementation Guide

## Result

Phase 8 implements ADR 0011's repository/development RAG baseline. Authorized managers can create,
version, upload, archive, and reindex English text or Markdown documents; owners additionally own
destructive deletion and recovery inventory. Customer and owner assistants retrieve only current,
authorized document passages, return typed citations, and fail closed when evidence or any
storage/vector/provider/authorization check is unavailable.

The implementation remains single-business, single-Node, and single-FastAPI. The local encrypted
filesystem and embedded Qdrant adapters are explicitly rejected in production. Phase 8 adds no
PDF/office/OCR parsing, malware-scanning service, hosted storage/vector service, tools, actions,
LangChain, LangGraph, personal account context, or production rollout authority.

## Runtime topology

```text
Browser
  |
  | session + permission + CSRF + UUID idempotency key
  v
Node /api/v1
  |-- MySQL: authoritative document/version/chunk/audience/citation state
  |-- AES-256-GCM private filesystem objects
  |-- transactional document jobs and audit evidence
  |
  | signed index/retrieve/publication/delete requests
  v
FastAPI /internal/v1
  |-- deterministic chunking and fixed MiniLM embeddings
  |-- local Qdrant vectors with opaque identifiers
  |
  +-- opaque candidates -> Node/MySQL reauthorization
  |
  | signed bounded source context
  v
FastAPI fixed document prompt -> Groq -> typed answer/source labels
  |
  +-- Node permission/consent/source/citation recheck -> Browser
```

FastAPI has no MySQL, session, object-store, audit, or business-service credential. Qdrant is a
ranking aid and never authorizes a source. Node is the only public identity and authorization
boundary.

## Document management API

All routes are under `/api/v1/documents`, require an active authenticated user, and return no
storage path, encryption key ID, checksum, point ID, chunk ID, or vector. Mutation routes also
require exact origin, CSRF, a fresh UUID `Idempotency-Key`, and strict request bodies.

| Method and path | Permission | Result |
|---|---|---|
| `GET /` | `documents:read` | Bounded metadata list filtered by lifecycle status |
| `POST /` | `documents:manage` | Create a logical document and version 1 in `AWAITING_UPLOAD` |
| `GET /:documentId` | `documents:read` | Logical document plus immutable version history |
| `POST /:documentId/versions` | `documents:manage` | Create the next replacement version |
| `PUT /:documentId/versions/:versionId/content` | `documents:manage` | Validate, encrypt, persist, and enqueue ingestion |
| `GET /:documentId/versions/:versionId/content` | `documents:read` | Integrity-check and download the authorized original with `no-store` |
| `PATCH /:documentId/status` | `documents:manage` | Archive or reactivate using optimistic document version |
| `POST /:documentId/versions/:versionId/reindex` | `documents:manage` | Enqueue a new immutable index generation |
| `DELETE /:documentId` | `documents:delete` | Immediately enter `DELETING` and enqueue cleanup |
| `GET /recovery/orphans` | `documents:delete` | Owner-only aggregate, read-only orphan inventory |

`OWNER` receives all three document permissions. `ADMIN` receives `documents:read` and
`documents:manage` but not `documents:delete` and receives no assistant permission. Customers
receive no document-management permission.

## Upload and object boundary

The upload body is raw `text/plain` for `.txt` or `text/markdown` for `.md`; JSON/base64 upload is
not accepted. The limit is exactly 256 KiB before and after normalization. Validation requires
strict UTF-8, English metadata, matching extension/media type, NFC text, safe line endings, and at
least one non-whitespace character. It rejects NUL/C0/C1 controls other than permitted text
whitespace, bidi overrides/isolates, malformed UTF-8, binary content, misleading names, and any
unsupported field or format. No Markdown or executable content is rendered or parsed.

Normalized bytes are encrypted before durable object publication using AES-256-GCM, a random
nonce, and authenticated envelope metadata containing the format version, opaque object key, key
ID, and document-version identity. Writes use exclusive private temporary files, flush, close,
and atomic rename. Reads reject symlinks/reparse-like references, authenticate the envelope, bind
it to the expected version/object, and verify the normalized SHA-256 held in MySQL. Plaintext is
never written to a temporary file.

The storage root must be absolute, private, outside the repository/public roots, and cannot be a
filesystem root. Object keys are server-generated UUID names and never use the uploaded filename.

## Lifecycle and ingestion

Logical states are `ACTIVE`, `ARCHIVED`, `DELETING`, and `DELETED`. Immutable version states are
`AWAITING_UPLOAD`, `QUEUED`, `PROCESSING`, `STAGED`, `READY`, `FAILED`, `SUPERSEDED`, `DELETING`,
and `DELETED`.

```text
AWAITING_UPLOAD -> QUEUED -> PROCESSING -> STAGED -> READY
                         \-> FAILED
READY -> SUPERSEDED
eligible states -> DELETING -> DELETED
```

Upload stores the encrypted object and transactional MySQL metadata before enqueueing
`DOCUMENT_VERSION_INGEST`. The worker locks and claims the current eligible version, restores and
verifies the source, and sends a bounded signed request to FastAPI. FastAPI performs deterministic
structure/sentence/word-aware chunking (maximum 160 words and 1,200 characters, with at most 30
words overlap), embeds with the pinned 384-dimensional MiniLM artifact, and upserts deterministic
unpublished Qdrant points.

Node validates every returned point UUID, ordinal, UTF-8 byte range, checksum, generation, model,
revision, dimension, and collection before replacing chunk metadata. Activation is staged and
fail-closed: the prior version remains authoritative until the new generation is complete; vector
publication/unpublication and the MySQL active-version switch never authorize two active versions.
If publication finalization fails, retrieval may temporarily return no evidence but cannot mix old
and new content.

The existing job/outbox provides leasing, bounded retry, dead-letter evidence, owner replay, and
strict descriptors containing IDs/generations only. Document text is never placed in a job payload.
Repeated ingestion, publication, reindex, and deletion calls are idempotent.

## Retrieval and grounded response

Document Q&A is exposed through:

- `POST /api/v1/ai/customer/document-responses` for `ai:customer:use`;
- `POST /api/v1/ai/owner/document-responses` for `ai:owner:use`; and
- `GET /api/v1/ai/document-citations/:citationId` for a citation from that same user's successful
  usage event.

Each assistant has separate `groq-zdr-documents-v1` consent under
`/api/v1/ai/document-consents/:assistant`. Standard Phase 7 consent does not authorize document
passages. Customer retrieval uses only `CUSTOMER`; owner retrieval may use `CUSTOMER` and `OWNER`.

The response path is deliberately two-step:

1. Node checks active user, assistant permission, document consent, at-most-once usage/cost/quota,
   and derives the fixed audience filter.
2. FastAPI embeds the normalized question and returns at most eight opaque Qdrant candidates above
   the calibrated `0.36` score threshold.
3. Node loads candidates by point ID and accepts only current `ACTIVE` document rows whose exact
   active version is `READY`, audience-eligible, generation-matched, and metadata-matched.
4. Node decrypts and checksum-verifies only accepted objects, verifies each UTF-8 byte slice, and
   builds at most five ordered source labels within 8,000 bytes and 2,000 estimated tokens.
5. FastAPI treats question and passages as untrusted quoted data, calls the fixed document prompt,
   and requires `ANSWER`, `INSUFFICIENT_EVIDENCE`, `REFUSAL`, or `ESCALATE`. Only `ANSWER` may carry
   one to five unique supplied `S1`-`S5` labels.
6. Node rejects unknown labels and rechecks user, permission, consent, document/version state,
   audience, and cited chunk identity after generation. Any in-flight change suppresses the answer.
7. Successful citation evidence stores only usage/version/chunk/source-label IDs. Questions,
   passages, answers, provider bodies, and filenames are not stored in usage/audit evidence.

An empty/below-threshold result returns `INSUFFICIENT_EVIDENCE` without calling Groq. Retrieval,
object, integrity, vector, authorization, or provider uncertainty returns a stable safe failure; it
does not fall back to general knowledge or unfiltered search.

## Replacement, reindex, deletion, and recovery

A replacement creates a new immutable version while the current `READY` source remains active.
Only completed staged ingestion switches the active version and marks the old one `SUPERSEDED`.

Reindex increments `indexVersion`, creates new generation-specific chunk rows and deterministic
points, then switches publication only after complete validation. Old generation rows can coexist
as non-authoritative evidence; citations bind to the exact chunk generation. A failed reindex
preserves a usable `READY` source.

Deletion synchronously locks the logical document, changes it and its versions to `DELETING`, and
clears active authorization before the asynchronous job. Cleanup unpublishes/deletes vector
points, deletes the encrypted object, removes chunk/audience source material as allowed by the
retained evidence model, and leaves a sanitized `DELETED` tombstone. Missing objects/points are
idempotent success; other failures retry or dead-letter while MySQL continues denying retrieval.

The owner-only orphan scan compares valid opaque filesystem object keys and Qdrant version/point
counts with MySQL, returns aggregate counts only, and appends a count-only audit event. It is
advisory and may observe an in-flight difference; it never deletes, repairs, reveals an identifier,
or changes lifecycle state.

## Persistence

The three additive Phase 8 migrations add:

- `company_documents`, immutable `company_document_versions`, and immutable audience rows;
- generation-aware `company_document_chunks` with opaque vector point and byte-range evidence;
- `ai_document_citations` linked to successful metadata-only usage evidence; and
- `document_mutation_receipts` for durable mutation idempotency.

Receipts intentionally retain opaque operation identity after a document is deleted and therefore
do not use destructive foreign keys to lifecycle rows. All authoritative document/user/citation
relationships use restrictive foreign keys, database checks, composite active-version integrity,
and bounded indexes. No table stores document body text, vector values, question, answer, prompt,
or provider response.

## UI

`/admin/documents` provides permission-gated list/detail, create, replacement, raw upload,
download, archive/reactivate, reindex, delete, job status, and owner-only recovery inventory.
`/assistant/documents` and `/admin/document-assistant` provide separate document consent and
question flows. Citations are rendered as inert metadata controls and fetched only on explicit
request; generated text is never interpreted as Markdown or HTML. The browser never sees internal
storage/vector identifiers or calls FastAPI directly.

## Health and feature gates

Node `DOCUMENTS_ENABLED` gates management/storage; Node `AI_ENABLED` gates assistant calls;
FastAPI `AI_RAG_ENABLED` gates embedding/vector operations; `AI_PROVIDER_ENABLED` gates Groq.
Public health reports independent coarse `documents.storage`, `documents.embedding`, and
`documents.vectorIndex` states. A document subsystem outage never makes commerce/support core
health unavailable.

## Explicit exclusions and production blockers

The development implementation is not an approved production topology. Production still requires
reviewed private object and vector services, IAM/KMS, TLS/network policy, malware policy, backups,
retention/erasure/legal holds, data classification, monitoring/SLO/capacity, multi-instance replay
and rate state, key/model rotation tooling, incident ownership, privacy/legal review, and explicit
rollout approval. See the Phase 8 runbook and threat model for the complete retained-risk list.
