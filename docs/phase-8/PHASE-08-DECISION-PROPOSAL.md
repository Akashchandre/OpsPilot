# Phase 8 RAG and Document Intelligence Decision Proposal

## Status

**ACCEPTED on 2026-09-05 under ADR 0011.** The user explicitly approved this complete baseline,
the permission matrix, threat model, exact dependency pins, and one-time embedding-model download.
The approved Python dependencies are locked, and the fixed model artifact has been downloaded to
the private development cache and verified at 384 dimensions. No hosted vector account has been
connected and no company document content has been processed.

This proposal deliberately selects a repository/development baseline that requires no new hosted
account. Production object storage, production vector hosting, retention/legal policy, and network
topology remain explicit deployment blockers.

## Objective and scope

Add the smallest secure document-grounded assistant capability that preserves the accepted Phase 7
authority boundaries. The proposed baseline includes:

- Owner/admin management of versioned company documents through the Node.js API.
- Strict UTF-8 plain-text and Markdown uploads only, stored as inert text and never rendered as
  executable markup.
- Application-level AES-256-GCM encryption in a private development object-store directory.
- Idempotent ingestion through the existing MySQL transactional job/outbox and JavaScript worker.
- Deterministic structure-aware chunking in the isolated FastAPI service.
- Local Qdrant persistence plus local FastEmbed inference for development and tests.
- Audience-filtered candidate retrieval followed by authoritative Node/MySQL reauthorization.
- Dedicated customer and owner document-Q&A intents with structured citations and explicit
  insufficient-evidence behavior.
- Version, replacement, reindex, deletion, recovery, evaluation, and metadata-only audit/usage
  evidence.

The proposal does not add PDF, office documents, OCR, images, audio, arbitrary HTML, URL ingestion,
web crawling, LangChain, LangGraph, model tools, autonomous actions, unrestricted business-data
access, or multi-tenant behavior.

## Existing constraints and reusable foundations

- OpsPilot remains single-business under ADR 0003. A tenant or business table must not be invented
  in Phase 8.
- The browser calls only the versioned Node.js API. Node owns authentication, permissions, CSRF,
  rate limits, document lifecycle, source authorization, and audit evidence.
- The accepted Phase 6 MySQL job/outbox already provides transactional enqueueing, strict payload
  descriptors, leases, retries, dead-letter evidence, and owner-only replay.
- The accepted Phase 7 FastAPI boundary already provides signed replay-resistant internal HTTP,
  fixed prompts, strict typed output, bounded concurrency, safe logs, Groq ZDR enforcement, exact
  token cost, and no automatic inference retry.
- FastAPI receives no MySQL credentials and cannot grant document access.
- Phase 7 stores no question, response, reasoning, or context. Phase 8 keeps that rule for ordinary
  assistant requests.
- Qdrant's official client supports persistent local mode for development and the same client can
  later target a server or managed cluster. Qdrant documents payload filtering, idempotent point
  operations, and blocking `wait=true` writes:
  [Qdrant client](https://pypi.org/project/qdrant-client/1.19.0/),
  [filtering](https://qdrant.tech/documentation/search/filtering/), and
  [point idempotence](https://qdrant.tech/documentation/concepts/points/).
- FastEmbed is maintained by Qdrant and uses local ONNX inference. The selected
  `sentence-transformers/all-MiniLM-L6-v2` model is an English 384-dimension Apache-2.0 model of
  approximately 90 MB in the current supported-model catalog:
  [FastEmbed](https://qdrant.github.io/fastembed/) and
  [supported models](https://qdrant.github.io/fastembed/examples/Supported_Models/).

Official package, model, and service behavior can change. Exact direct packages are pinned and the
complete transitive lock/model artifact evidence must be reviewed after the separately approved
installation/download step.

## Proposed architecture

```text
Browser
  |
  v
Node.js API ---------------------------------------------------+
  | auth/RBAC/CSRF, metadata, source authorization, audit      |
  |                                                            |
  +--> MySQL document/version/chunk metadata + transactional job|
  +--> encrypted private filesystem object store                |
  |                                                            |
  v                                                            |
JavaScript worker -- signed content/index command --> FastAPI   |
                                                        |       |
                                                        +--> local FastEmbed
                                                        +--> local Qdrant

Question -> Node -> signed candidate retrieval -> FastAPI/Qdrant
             ^                    |
             +-- opaque chunk IDs/scores only -----------------+
             |
             +-- reauthorize READY active version in MySQL
             +-- decrypt and checksum only authorized chunks
             +-- signed bounded source context -> FastAPI -> Groq
             +-- validate cited IDs and recheck permission/consent -> Browser
```

Qdrant does not receive original filenames, titles, users, emails, prompts, answers, or raw chunk
text in the development baseline. It stores vectors and opaque point/document-version/chunk IDs
plus audience, publication, and index-version fields used for defense-in-depth filtering. The
authoritative access decision remains in Node/MySQL.

## Proposed decisions

### 1. Service authority and two-step retrieval

Node remains the public and authorization boundary. FastAPI owns deterministic chunking, local
embedding inference, Qdrant access, retrieval scoring, RAG prompt construction, and Groq response
validation. It receives content only through signed, bounded internal requests and receives no
database, cookie, session, or business-service credential.

Retrieval and generation are separate internal calls:

1. Node establishes the user, assistant, consent, allowed audience, and request limits.
2. FastAPI retrieves opaque candidate chunk IDs using the exact server-supplied audience filter.
3. Node loads those IDs from MySQL and rechecks that each belongs to the current active `READY`
   version and an audience allowed for the current assistant.
4. Node decrypts the original object, slices only the authorized byte ranges, verifies the chunk
   checksum, and sends a bounded numbered context to FastAPI.
5. FastAPI calls Groq with the dedicated RAG prompt and returns a typed answer/citation list.
6. Node rejects unknown citations and rechecks permission, consent, version status, and audience
   before returning anything to the browser.

A stale or incorrectly filtered vector candidate can therefore never become model context or a
user-visible answer. Failure at any authorization or integrity check returns a safe failure.

### 2. Initial upload formats and limits

The first baseline accepts only:

| Field                      | Decision                                                               |
| -------------------------- | ---------------------------------------------------------------------- |
| Extensions                 | `.txt` and `.md`                                                       |
| Declared media types       | `text/plain` and `text/markdown`                                       |
| Language                   | Operator-declared English (`en`) only for the evaluated baseline       |
| Maximum normalized content | 256 KiB per version                                                    |
| Minimum content            | One non-whitespace character                                           |
| Encoding                   | Strict UTF-8; optional BOM removed                                     |
| Normalization              | CRLF/CR converted to LF; Unicode NFC                                   |
| Controls                   | NUL, bidi overrides, and control characters other than LF/TAB rejected |
| Rendering                  | Plain text only; Markdown/HTML is never interpreted by OpsPilot        |

The browser uses a two-step upload so no multipart parser is required:

1. A JSON request creates a logical document or immutable draft version with filename, declared
   type, language, and audiences.
2. A `PUT` sends the raw text body to the exact draft-version resource. The API applies a
   route-specific raw-body limit before normalizing, validating, encrypting, and queuing it.

File extension, declared type, and validated bytes must all agree. Renaming a binary file cannot
make it valid. Text is inert, never executed, never passed to a shell or parser, and never rendered
as HTML. Therefore a separate malware scanner is not required for this strict v1 format policy.
PDF, office formats, archives, OCR, images, and arbitrary binary files remain rejected until a
sandboxed parser and malware-scanning baseline is separately approved.

### 3. Private development object storage

Use a narrow Node.js object-store interface with a filesystem implementation for repository and
local development. It uses only Node's built-in `fs`, `path`, and `crypto` modules.

- The configured root must be an absolute path, cannot be the repository root, and cannot be under
  any web/static/public directory.
- Object keys are opaque UUID-based values; user filenames never become paths.
- Normalized bytes are encrypted with AES-256-GCM using a new 32-byte Base64 key, random 96-bit
  nonce, authenticated versioned header, object key, document-version ID, and key ID.
- Writes use a private temporary file, flush/close, and atomic rename. Partial files never become
  readable objects.
- Reads authenticate the GCM tag before returning plaintext. Tamper, unknown key ID, path escape,
  missing object, and checksum mismatch fail closed.
- Ordinary API responses, logs, audit events, backups, and tests never contain plaintext document
  bodies or encryption keys.
- Production must use an approved private object-store adapter and managed key strategy. The local
  filesystem adapter is rejected when `NODE_ENV=production`.

The initial key-rotation operation is re-encrypt-before-switch: retain the old key, run an audited
idempotent re-encryption job, verify every object, then change the active key. Deleting or replacing
the old key before re-encryption is prohibited.

### 4. Document audiences and permissions

Two immutable per-version audiences are proposed:

- `CUSTOMER`: approved customer-facing policies and help. The customer document assistant may
  retrieve these; the owner document assistant may also retrieve them.
- `OWNER`: internal owner material. Only the owner document assistant may retrieve these.

A version must have at least one audience. Changing an audience creates a new immutable version;
it is not an in-place payload edit. `ADMIN` can manage content but receives no AI permission and
cannot query either assistant. The exact role and endpoint mapping is defined in
`docs/permissions/PHASE-08-PERMISSION-MATRIX.md`.

### 5. Persistence and lifecycle

Add these relational records through one reviewed additive migration:

| Record                               | Purpose                                                                                                                         | Content rule                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `company_documents`                  | Logical title, lifecycle, current version, optimistic version, actors/timestamps                                                | No body text                         |
| `company_document_versions`          | Immutable version number, upload/index state, content metadata, checksum, encrypted object key/key ID, embedding/index evidence | No body text                         |
| `company_document_version_audiences` | Exact immutable audience set for a version                                                                                      | Enum values only                     |
| `company_document_chunks`            | Opaque vector point ID, ordinal, UTF-8 byte range, checksum, embedding/index version                                            | No chunk text                        |
| `ai_document_citations`              | Usage-event-to-version/chunk citation evidence for successful RAG requests                                                      | IDs only; no question/answer/excerpt |

Proposed logical document states are `ACTIVE`, `ARCHIVED`, `DELETING`, and `DELETED`. Proposed
version states are `AWAITING_UPLOAD`, `QUEUED`, `PROCESSING`, `STAGED`, `READY`, `FAILED`,
`SUPERSEDED`, `DELETING`, and `DELETED`.

- Only one version can be the current active version. The document row is locked for publication,
  replacement, archive, and delete transitions.
- A composite foreign key ensures the active version belongs to the same logical document.
- `READY` plus current-version identity is required at every source-use check.
- Database deletes use `RESTRICT`; lifecycle deletion removes content while preserving bounded
  tombstone/audit integrity.
- Filenames and titles are untrusted metadata with strict length/Unicode rules and safe output
  rendering.

### 6. Ingestion, chunking, and vector indexing

Add registered jobs `DOCUMENT_VERSION_INGEST`, `DOCUMENT_VERSION_DELETE`, and
`DOCUMENT_VERSION_REINDEX`. Payloads contain only UUIDs and an index version; content never enters
the job table. Dedupe keys include the version ID, normalized checksum, and embedding/index version.

The ingestion handler:

1. Claims the version with an optimistic state transition.
2. Reads, authenticates, decrypts, and checksum-verifies the normalized object.
3. Sends the bounded text and opaque metadata over the signed internal boundary.
4. FastAPI splits on headings/paragraphs, then bounded sentences/words. Each chunk is at most 160
   whitespace-delimited words and 1,200 Unicode characters, with at most 30 words of overlap.
5. FastAPI computes UTF-8 byte ranges and SHA-256 chunk hashes, generates embeddings locally, and
   upserts deterministic UUID points with `wait=true`.
6. The points remain unpublished until Node stores all returned chunk descriptors and completes
   the guarded activation transition.
7. Activation publishes the new points, unpublishes the old version, and then makes the new
   version `READY`. Recovery tolerates a temporary no-result window but never mixed active sources.

Retries upsert the same point IDs and replace the same chunk descriptor set. A descriptor mismatch
under the same version/checksum/index version is terminal integrity failure. No inference job is
automatically replayed through the existing owner job-replay UI unless the descriptor and current
document state remain valid.

### 7. Embedding and vector baseline

Use exact direct Python pins after explicit installation approval:

- `qdrant-client==1.19.0`
- `fastembed==0.8.0`

Use `sentence-transformers/all-MiniLM-L6-v2`, 384 dimensions, cosine distance, CPU inference, one
embedding worker, and an explicitly configured model-cache directory. The first approved setup
downloads approximately 90 MB of model artifacts from Hugging Face. The resolved artifact revision
and hashes must be recorded before the development path is marked ready.

Use persistent Qdrant local mode behind a `VectorIndex` interface. Routine tests use an in-memory
fake or Qdrant in-memory mode and never require a network call. Local Qdrant is limited to one
FastAPI process and repository/development evidence; it is not an approved production topology.

The first retrieval uses dense search only. Qdrant payload indexes are created before data on every
filtered field. Hybrid BM25, sparse vectors, reranking, and a second embedding model are deferred
until the golden set proves a concrete need. Embedding-model migration builds a new versioned
collection and uses an atomic alias switch only after full reindex/evaluation; Qdrant documents
atomic collection aliases for this purpose:
[collection aliases](https://qdrant.tech/documentation/manage-data/collections/#collection-aliases).

### 8. Document-Q&A API and consent

Keep Phase 7 endpoints and consent intact. Add dedicated document paths:

- `GET|PUT|DELETE /api/v1/ai/document-consents/:assistant`
- `POST /api/v1/ai/customer/document-responses`
- `POST /api/v1/ai/owner/document-responses`
- `GET /api/v1/ai/document-citations/:citationId`

The document-processing notice is versioned separately as `groq-zdr-documents-v1`. It states that
the user's question and bounded authorized document passages are sent to Groq under the existing
required-ZDR policy. Accepting the Phase 7 base notice does not silently consent to document
processing, and accepting the document notice does not grant a permission.

Add `CUSTOMER_DOCUMENT_QA` and `OWNER_DOCUMENT_QA` intents. Each accepts one normalized question,
a new at-most-once UUID submission key, and no client-selected model, prompt, audience, source ID,
filter, system message, or tool. The owner document path does not require `reports:read` because it
receives no report data; the existing owner overview path keeps that requirement.

### 9. Grounding, citations, and insufficient evidence

FastAPI retrieves at most eight candidates. Node authorizes at most five chunks and caps total
document context by UTF-8 bytes and estimated tokens before generation. Retrieval score threshold
is fixed only after the committed golden-set calibration; production code does not expose it as a
browser-controlled value.

The dedicated provider schema returns:

- bounded plain-text `answer`;
- outcome `ANSWER`, `INSUFFICIENT_EVIDENCE`, `REFUSAL`, or `ESCALATE`;
- a unique bounded list of source labels selected only from the supplied context;
- bounded safe notices.

Every substantive document answer must cite at least one supplied source. Unknown, inaccessible,
deleted, stale, duplicate, or uncited source labels invalidate the whole response. When authorized
evidence is absent or below threshold, the only normal result is `INSUFFICIENT_EVIDENCE`; the model
must not fill gaps from general knowledge. Citations returned to the browser contain a safe title,
logical document ID, version number, and bounded plain-text excerpt only after a final source-access
check.

Retrieved document instructions are explicitly delimited as untrusted quotations. They cannot
change system policy, reveal hidden prompts, add tools, select another source, or direct OpsPilot to
perform an action.

### 10. Replacement, reindex, deletion, and recovery

- Replacement indexes an immutable new version while the prior `READY` version remains active.
  Publication uses a fail-closed staged transition; a temporary retrieval gap is acceptable, mixed
  or ambiguous active versions are not.
- Reindex keeps the source version immutable and creates new chunk/index evidence. It cannot make a
  failed/deleted/superseded version current.
- Delete first locks the document and changes it to `DELETING`, immediately excluding it in MySQL.
  The deletion job removes Qdrant points with `wait=true`, deletes the encrypted object, removes
  chunk rows, sanitizes retained metadata, and marks the tombstone `DELETED`.
- If vector or object deletion fails, the document remains inaccessible and the job retries. A
  dead-letter is visible to the owner; it is never silently treated as deleted.
- An orphan scan reports objects/points without live metadata but does not delete them automatically
  until an owner-approved recovery operation is implemented and tested.
- Local vector state is reproducible from encrypted originals plus MySQL metadata. Recovery favors
  a complete reindex over treating a vector snapshot as business truth.

Production backup generations, legal holds, erasure deadlines, and deletion propagation into
managed object/vector backups remain unresolved production blockers.

### 11. Audit, logging, limits, and failure behavior

Register strict audit metadata for create, upload, publication, archive, replacement, reindex,
delete request/completion/failure, content read, document-consent changes, and citation access.
Audit metadata may contain opaque IDs, audience names, byte/chunk counts, checksums, index versions,
safe outcomes, and safe error codes; it must not contain document text, questions, answers,
excerpts, filenames, titles, vector values, keys, or provider raw bodies.

Document, worker, FastAPI, and provider logs follow the same content-redaction rule. Health reports
only disabled/ready/unavailable state for storage, embedding model, vector index, and Groq.

Initial hard limits:

- 256 KiB normalized object, 1 active upload per user, and 10 uploads per user per day.
- 1 concurrent ingestion/model load in development.
- At most 1,000 chunks per version and 8 retrieval candidates.
- At most 5 authorized context chunks and 8,000 UTF-8 bytes of document context per response.
- Existing assistant burst, daily, concurrency, timeout, and global cost ceilings remain in force.
- No automatic retry of Groq inference. Idempotent storage/vector jobs retain bounded worker retry.

Object, model, vector, AI, or database outage returns a stable safe code. Existing commerce,
support, reporting, jobs, and notifications remain available.

### 12. Evaluation and acceptance gate

Before Phase 8 acceptance, record and pass:

- At least 40 synthetic grounded questions across customer and owner audiences, revised versions,
  contradictory sources, and no-evidence cases.
- Retrieval recall@5 of at least 90% and mean reciprocal rank of at least 0.80 on the committed
  English golden set.
- 100% critical audience isolation, deleted/superseded exclusion, citation authorization,
  prompt-injection refusal, and no-evidence behavior.
- At least 95% grounded-answer/faithfulness rate and 100% citation-schema validity.
- Deterministic upload validation, encryption/tamper, retry/idempotency, activation-race,
  deletion/recovery, vector-outage, permission-change, and consent-change coverage.
- Local retrieval p95 at or below 500 ms for the representative corpus and signed end-to-end RAG
  p95 at or below 6 seconds for the paced synthetic live gate.
- Recorded CPU, memory, disk, model-cache, vector-size, Groq token, and exact cost evidence.
- Complete Phase 1-7 regression, configured coverage thresholds, lint/format/schema/build,
  development/test migration status/drift, audit verification, whitespace, and credential scans.

Threshold changes require documented evidence and explicit review; they are not lowered merely to
make a failing gate pass.

## Proposed public management API

- `GET /api/v1/documents`
- `POST /api/v1/documents`
- `GET /api/v1/documents/:documentId`
- `PATCH /api/v1/documents/:documentId`
- `GET /api/v1/documents/:documentId/versions`
- `POST /api/v1/documents/:documentId/versions`
- `PUT /api/v1/documents/:documentId/versions/:versionId/content`
- `GET /api/v1/documents/:documentId/versions/:versionId/content`
- `POST /api/v1/documents/:documentId/versions/:versionId/reindex`
- `DELETE /api/v1/documents/:documentId`

Every route is authenticated, strictly validated, deny-by-default, bounded, and CSRF-protected for
writes. Create/upload/reindex/delete uses an at-most-once UUID `Idempotency-Key`. Collection reads
are paginated. No route accepts an object path, vector collection, embedding model, score
threshold, arbitrary audience, lifecycle state, or actor ID from the browser.

## Proposed internal FastAPI API

- `POST /internal/v1/rag/index`
- `POST /internal/v1/rag/publish`
- `POST /internal/v1/rag/retrieve`
- `POST /internal/v1/rag/delete`
- existing `/internal/v1/responses`, extended only with a registered document-context variant

All calls use the existing signed contract and one shared nonce cache. Indexing uses a separate
route-specific maximum body size while health/retrieval/generation retain narrow limits. Internal
responses are strict, byte-bounded JSON. Raw vectors and provider bodies never cross back to Node.

## Dependency, account, connection, and environment review

### New direct dependencies requiring explicit installation approval

| Package         | Proposed pin | Purpose                                                                | Account/secret      | Operational burden                                                            | Alternative considered                                                                          |
| --------------- | -----------: | ---------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `qdrant-client` |     `1.19.0` | Typed local/persistent vector index and future Qdrant connection       | None for local mode | New Python/transitive lock; local vector directory; single-process constraint | Custom cosine store rejected as non-durable/non-standard; Docker Qdrant deferred by phase rules |
| `fastembed`     |      `0.8.0` | Local CPU embeddings without sending document text to another provider | None                | ONNX/tokenizer dependencies, model cache, CPU/RAM, one-time model download    | Hosted embeddings add an account/privacy boundary; PyTorch stack is materially heavier          |

No npm package, LangChain, LangGraph, parser, OCR, antivirus, Redis, BullMQ, Docker, LLM SDK, or
object-storage SDK is proposed.

### Model artifact and external connection

- Model: `sentence-transformers/all-MiniLM-L6-v2`.
- Current catalog: English, 384 dimensions, approximately 90 MB, Apache-2.0.
- Initial connection: one approved download from Hugging Face into an explicit non-repository cache.
- Secret/account: none for the public model download.
- Before enablement: record resolved files/revision/hashes, run a license and malware/supply-chain
  check, then prove the application can start with network egress disabled and the cached model.
- Qdrant Cloud or another managed vector service is not connected in this baseline. Production
  hosting requires a separate account, region, TLS/key, DPA/privacy, backup, cost, and deletion
  review.

### Proposed Node/API variables

| Variable                  | Purpose                                   | Rule                                                                      |
| ------------------------- | ----------------------------------------- | ------------------------------------------------------------------------- |
| `DOCUMENTS_ENABLED`       | Global document-management/ingestion gate | Default `false`; production remains rejected                              |
| `DOCUMENT_STORAGE_ROOT`   | Private encrypted-object root             | Required absolute path when enabled; never inside public/repository roots |
| `DOCUMENT_STORAGE_KEY`    | AES-256-GCM key                           | Secret Base64 32 bytes; never logged/tracked                              |
| `DOCUMENT_STORAGE_KEY_ID` | Non-secret rotation identifier            | Strict bounded identifier                                                 |

File size, format, language, upload count, and context limits are reviewed code constants, not
browser- or environment-controlled expansion points.

### Proposed FastAPI variables

| Variable               | Purpose                      | Rule                                                    |
| ---------------------- | ---------------------------- | ------------------------------------------------------- |
| `RAG_ENABLED`          | Retrieval/indexing gate      | Default `false`; requires all remaining values          |
| `RAG_VECTOR_MODE`      | Vector adapter               | Exact `local` for this baseline; rejected in production |
| `RAG_VECTOR_PATH`      | Persistent local Qdrant path | Required absolute non-repository path                   |
| `RAG_COLLECTION_ALIAS` | Stable query alias           | Fixed validated default `opspilot_documents`            |
| `RAG_EMBEDDING_MODEL`  | Embedding allowlist          | Exact fixed model only                                  |
| `RAG_MODEL_CACHE_PATH` | Offline model cache          | Required absolute non-repository path                   |
| `RAG_MAX_CONCURRENCY`  | CPU/vector bound             | Default and maximum `1` locally                         |

The existing Groq key, Global ZDR confirmation, model, signed-service key, and cost variables remain
unchanged. A document notice must be accepted before real document passages are sent to Groq.

## Proposed implementation sequence after approval

1. Record the accepted baseline in ADR 0011 and obtain exact dependency/model-download approval.
2. Install and lock the two Python packages; inspect the resolved dependency tree, licenses,
   platform wheels, and credential/secret scans before importing them in application code.
3. Implement/test configuration, encrypted object storage, strict text validation, and document
   schemas/migration/permissions/audit contracts.
4. Implement management APIs, raw content upload, lifecycle services, idempotent enqueueing, and
   management/status UI.
5. Implement FastAPI chunking, local embedding/Qdrant adapters, signed index/retrieve/publish/delete
   contracts, and worker handlers.
6. Implement Node reauthorization/context construction, RAG prompts/output/citations, separate
   consent, usage evidence, and customer/owner UI paths.
7. Implement replacement/reindex/delete/recovery and all failure/concurrency/security tests.
8. Build the golden set, calibrate the retrieval threshold, run deterministic and paced live gates,
   measure cost/latency/storage, and synchronize architecture/database/API/runbook/review docs.
9. Request explicit Phase 8 acceptance only after every repository/development criterion passes.

## Approval checklist

The user explicitly approved all of these on 2026-09-05:

- [x] Text/Markdown-only English v1, 256 KiB maximum, and no PDF/OCR/office/archive ingestion.
- [x] Private local filesystem object adapter with application AES-256-GCM encryption for
      repository/development; no production object store yet.
- [x] `CUSTOMER` and `OWNER` immutable per-version audiences and the proposed permission matrix.
- [x] MySQL metadata/chunk/citation schema and lifecycle states.
- [x] Existing MySQL jobs plus signed two-step FastAPI retrieval and Node source reauthorization.
- [x] Local Qdrant/FastEmbed, dense-only retrieval, fixed MiniLM model, and deferred hybrid/rerank.
- [x] Separate document-processing consent and dedicated customer/owner document-Q&A intents.
- [x] Citation, insufficient-evidence, lifecycle, deletion, recovery, audit, quota, and evaluation
      rules.
- [x] Exact installation of `qdrant-client==1.19.0` and `fastembed==0.8.0`.
- [x] One-time download and cache verification of `sentence-transformers/all-MiniLM-L6-v2`.

## Explicitly deferred

- PDF, DOCX, PPTX, spreadsheets, OCR, images, audio, archives, HTML rendering, URL ingestion, and
  crawling.
- Antivirus/parser sandbox services because no binary format is accepted in v1.
- Hosted object storage, Qdrant Cloud, self-hosted Qdrant server, Docker, multi-instance AI, shared
  replay/rate stores, production TLS/mTLS, and production backup/retention topology.
- Multilingual embeddings, hybrid/sparse search, reranking, semantic caching, personalization,
  conversation history, and stored prompt/answer content.
- Customer account/order context, row-level owner data, unrestricted SQL, tools, actions,
  LangChain, LangGraph, autonomous support, and every Phase 9 workflow.
