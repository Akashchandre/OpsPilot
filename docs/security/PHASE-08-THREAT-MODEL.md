# Phase 8 Document Upload and RAG Threat Model

## Status

**ACCEPTED on 2026-09-05 under ADR 0011.** These controls and tests are required by the accepted
Phase 8 implementation baseline. Implementation and verification are in progress.

## Scope

This review covers:

- document metadata and strict raw UTF-8 text/Markdown upload;
- encrypted private development object storage;
- version/audience lifecycle and MySQL metadata;
- transactional ingestion, reindex, and deletion jobs;
- signed Node-to-FastAPI document contracts;
- deterministic chunking, local FastEmbed inference, and local Qdrant storage;
- candidate retrieval, Node source reauthorization, context construction, Groq generation,
  citations, and insufficient-evidence behavior;
- management UI, assistant UI, audit/log evidence, recovery, limits, and deletion.

PDF/office/archive parsing, OCR, images, hosted object/vector infrastructure, LangChain, LangGraph,
tools, autonomous actions, unrestricted business queries, and production deployment are outside
this baseline. Adding any of them requires a new threat review.

## Protected assets

- Original company-document bytes and derived authorized excerpts.
- Document title, filename, audience, version, checksum, lifecycle, and actor metadata.
- Embeddings, vector point identities, retrieval scores, and citation relationships.
- Questions, generated answers, prompts, and bounded RAG context while transiently processed.
- Document storage encryption key, internal service signing key, Groq key, model cache, and future
  vector credentials.
- MySQL document/chunk/usage/audit integrity and the Qdrant collection/index state.
- User/session/permission/consent state and the confidentiality boundary between `CUSTOMER` and
  `OWNER` audiences.
- Job leases, idempotency descriptors, failure evidence, and deletion/recovery state.

## Trust boundaries

```text
Untrusted browser/file metadata/file bytes
  -> Node public API: authentication, RBAC, CSRF, validation, limits
  -> private encrypted object store + authoritative MySQL metadata
  -> MySQL job/outbox and separately supervised JavaScript worker
  -> signed/replay-resistant FastAPI boundary
  -> local embedding model and local Qdrant vector index
  -> Node candidate reauthorization and object/chunk integrity checks
  -> signed bounded RAG context
  -> Groq under required ZDR
  -> strict provider schema and final Node authorization/citation recheck
  -> plain-text React rendering
```

MySQL is authoritative for source access and lifecycle. Qdrant scores candidates but cannot grant
access. Groq output cannot grant access, choose tools, or perform actions.

## Threats, controls, and required verification

### 1. Unauthorized document management

**Threat:** An unauthenticated user, customer, admin without the exact permission, disabled user,
or stale session creates, uploads, reads, changes, reindexes, archives, or deletes a document.

**Required controls:** Authenticate every route; apply exact deny-by-default document permissions;
require trusted origin, session-bound CSRF, UUID idempotency keys, current user state, optimistic
document versions, and eligible lifecycle state. `documents:delete` is owner-only. UI hiding is not
authorization.

**Required verification:** Anonymous/customer/removed-permission/disabled-user tests for every
operation; CSRF/origin tests; role-change-in-flight and optimistic-conflict tests; prove no
unregistered mutation route exists.

### 2. File-type confusion, oversized bodies, and parser exploitation

**Threat:** A binary, archive, executable, polyglot, malformed encoding, compression bomb, huge
file, duplicate JSON property, or deceptive extension reaches storage or parsing.

**Required controls:** Accept only route-specific raw `text/plain` or `text/markdown`; enforce the
wire-size limit before buffering; require allowlisted filename extension, declared type, and strict
UTF-8 byte validation; normalize only after decoding; reject NUL, bidi overrides, forbidden
controls, empty content, invalid Unicode, and content above 256 KiB. Never invoke a shell, office
parser, PDF parser, archive library, Markdown renderer, HTML renderer, macro engine, or OCR tool.

**Required verification:** Boundary/off-by-one, malformed UTF-8, BOM, mixed newline, NUL/control,
bidi, misleading extension/type, binary/polyglot, huge/chunked transfer, empty/whitespace, and
connection-abort tests. Prove rejected input creates neither a retrievable object nor a job.

### 3. Path traversal, symlink/reparse escape, and unsafe object publication

**Threat:** A filename/object key escapes the storage root, follows a link/reparse point, overwrites
another object, or exposes a partial plaintext/encrypted object.

**Required controls:** Generate opaque server UUID object keys; never join user filenames into
paths; validate resolved parent/root containment; refuse symlinks/reparse points in the managed
tree; open new files exclusively; use private temporary files, flush/close, and atomic rename;
never mount the root as static content. Refuse broad/root/repository/public storage paths.

**Required verification:** `..`, absolute/UNC/device/reserved-name, encoded separator, case-folding,
symlink/reparse, collision, concurrent write, partial write, rename failure, and unsafe-root tests on
the supported platform.

### 4. Object confidentiality, tamper, and key misuse

**Threat:** Disk access reveals plaintext; ciphertext/object headers are modified; the wrong key or
object metadata is used; secrets leak into logs, source, responses, fixtures, or backups.

**Required controls:** AES-256-GCM with a random nonce per object and authenticated version, key ID,
object key, and document-version identity; 32-byte Base64 secret validation; authentication before
plaintext use; normalized SHA-256 checksum after decryption; no plaintext temporary file; strict
redaction; tracked/ignored secret scans. Rotation is re-encrypt-and-verify before key retirement.

**Required verification:** Round-trip, nonce uniqueness, bit flip, truncated header/tag/ciphertext,
AAD swap, wrong key/key ID, checksum mismatch, missing key, rotation interruption, and log/error/
fixture leakage tests.

### 5. Unauthorized audience retrieval and stale vector metadata

**Threat:** A customer retrieves owner material, an admin uses management rights as AI rights, or a
stale/tampered Qdrant payload marks an inaccessible source as eligible.

**Required controls:** Node derives the exact audience from the registered assistant; Qdrant applies
indexed audience/publication filters for defense in depth; Qdrant returns opaque candidate IDs and
scores only; Node reauthorizes every candidate against the current active `READY` MySQL version and
immutable audience before reading text. Admin receives no AI permission. Final checks repeat after
generation.

**Required verification:** Cross-role/audience matrix; guessed point/chunk/version/document IDs;
tampered/stale/missing payload; admin-no-AI; removed permission/consent; archive/delete/replace
during retrieval and during provider call. Required leakage count is zero.

### 6. Indirect prompt injection and document data exfiltration

**Threat:** Retrieved content instructs the model to ignore policy, reveal prompts/keys/other
sources, fabricate citations, call tools, emit executable markup, or perform a business action.

**Required controls:** Treat document chunks as delimited untrusted quotations; use a fixed RAG
prompt and no model tools; send only reauthorized bounded chunks; prohibit hidden-prompt/secret/
cross-source disclosure and action claims; use a strict answer/citation schema; plain-text output
only; never execute or render model markup. Unknown citation labels invalidate the response.

**Required verification:** Direct and indirect injection corpus including fake system messages,
role tags, encoded instructions, cross-document references, secret requests, tool/SQL/HTML/URL
requests, citation forgery, and data-exfiltration bait. Critical refusal/isolation must be 100%.

### 7. Hallucination, weak evidence, and citation laundering

**Threat:** The model answers from general knowledge, cites a source that does not support a claim,
combines contradictory sources without warning, or presents an inaccessible/deleted citation.

**Required controls:** Calibrated retrieval threshold; bounded source-only prompt; required
`INSUFFICIENT_EVIDENCE`; citations selected only from supplied labels; at least one citation for a
substantive answer; Node validates citation membership and current source access; UI labels output
as AI-generated and keeps source metadata separate. Contradictory evidence must be acknowledged or
produce insufficient evidence.

**Required verification:** Golden-set recall/rank, source-free and below-threshold questions,
contradictions, partially relevant chunks, outdated versions, unsupported-claim scoring, citation
precision, citation deletion after answer, and final-access denial tests.

### 8. Version ambiguity, partial publication, and replacement race

**Threat:** Old and new versions are both retrievable, a partially indexed version becomes active,
or a failed publication hides/corrupts the last good version.

**Required controls:** Immutable versions, document-row lock, composite active-version integrity,
staged unpublished vector points, deterministic point IDs, completed `wait=true` writes, guarded
publication state machine, and Node current-version reauthorization. A temporary no-result window
is allowed; mixed active versions are not.

**Required verification:** Crash/failure before and after object write, enqueue, chunk-row write,
Qdrant upsert, publish/unpublish, and MySQL finalization; concurrent replacement; duplicate version;
same checksum; retry; stale worker lease; verify at most one usable active version.

### 9. Job replay, duplicate indexing, and poisoned descriptors

**Threat:** At-least-once delivery creates duplicate chunks, replay indexes deleted content, a job
contains document text, or an owner replay bypasses lifecycle rules.

**Required controls:** Registered strict UUID/index-version payloads below the existing job limit;
content never in payload; checksum/index-version dedupe key; deterministic point/chunk IDs;
idempotent upsert/delete; current eligible-state check inside handler; terminal descriptor conflicts;
bounded retry/dead-letter evidence.

**Required verification:** Duplicate enqueue/claim, descriptor mutation, schema mismatch, lease
expiry, retry after partial upsert, replay after supersede/archive/delete, point mismatch, and
dead-letter tests. Inspect persisted job payloads for absence of content.

### 10. Embedding model and dependency supply-chain compromise

**Threat:** A package/model artifact is malicious, silently changes, loads executable remote code,
downloads at runtime, or produces incompatible vectors under the same index version.

**Required controls:** Exact direct package pins and committed transitive lock; approved package
indexes only; license/advisory inspection; model allowlist; record artifact revision/files/hashes;
explicit non-repository cache; no `trust_remote_code`; no startup download after preflight; network-
disabled cached startup proof; embedding model/revision/dimension in index metadata; reindex into a
new collection for any change.

**Required verification:** Lock consistency, package audit, Python 3.13/platform wheel check, model
hash mismatch, absent/partial cache, dimension mismatch, model name override, offline startup, and
old/new collection isolation tests.

### 11. Vector index exposure, tamper, outage, and resource exhaustion

**Threat:** Local Qdrant data is exposed, concurrent processes corrupt it, expensive unindexed
filters/search exhaust resources, or an outage returns unfiltered/fallback results.

**Required controls:** Absolute private vector path separate from objects/web/repository; one AI
process in local mode; no public listener; payload indexes before ingestion; fixed collection/
model/filter/top-K/timeouts; vectors plus opaque metadata only; no fallback to unfiltered search or
general-knowledge answer. Production rejects local mode.

**Required verification:** Second-process/config rejection, unavailable/corrupt vector path,
collection/dimension mismatch, missing payload index, timeout, oversized corpus/query, empty
results, malformed scores, and recovery-by-reindex tests.

### 12. Deletion gaps and backup resurrection

**Threat:** Deleted content remains queryable in vectors, objects, chunks, caches, logs, temporary
files, or backups; a restore resurrects it as active.

**Required controls:** Synchronously mark `DELETING` under lock before asynchronous cleanup; Node
excludes non-active/non-READY sources immediately; delete Qdrant points with completion wait;
delete encrypted object/chunk rows; sanitize the tombstone; retry/dead-letter incomplete cleanup;
model cache contains model files only. Recovery/reindex reads current MySQL lifecycle and cannot
publish deleted versions.

**Required verification:** Failure at each delete step, query during delete, delete during provider
call, retry/idempotency, missing object/points, restored stale vector data, orphan detection, and
proof that final access fails everywhere in the repository/development topology.

Production backup erasure timing and legal holds remain blockers and must be documented before
production approval.

### 13. Privacy leakage through logs, audit, usage, UI, and errors

**Threat:** Document bodies, excerpts, questions, answers, filenames, titles, vectors, keys, or
provider raw bodies appear in operational logs, durable audit, usage rows, error responses, job
records, analytics, or test snapshots.

**Required controls:** Allowlisted structured fields; registered audit schemas; metadata-only usage
and citation IDs; safe error codes/messages; no content hashes in public responses; plain-text safe
UI; provider and internal raw responses never logged; high-confidence credential/content fixture
scans.

**Required verification:** Adversarial sentinel strings across success/failure paths, logger/audit/
database/job assertions, API response snapshots, browser DOM tests, and repository/ignored-file
scans.

### 14. Consent, provider retention, cost, and availability failure

**Threat:** Document passages are sent under old consent, Groq ZDR is disabled, provider calls are
duplicated, context drives unexpected cost, or AI outage breaks core operations.

**Required controls:** Separate `groq-zdr-documents-v1` consent; pre- and post-call consent/
permission checks; existing Global ZDR preflight and response policy; at-most-once usage reservation;
fixed context/output budgets; exact returned-token costing; no inference retry; independent feature
gates and safe `503` behavior.

**Required verification:** Missing/old/revoked consent, ZDR/config/preflight failure, timeout/429/
5xx/malformed provider response, duplicate submission, cost ceiling, oversized context, usage write
failure, and proof that non-AI APIs remain healthy.

## Security acceptance requirements

- Zero unauthorized cross-audience/source disclosure in deterministic and live synthetic tests.
- Zero document/question/answer/excerpt content in MySQL jobs, usage rows, audit events, logs, or
  repository fixtures outside explicit synthetic test documents.
- Every source used by Groq passes current Node/MySQL authorization and integrity checks.
- Invalid, failed, staged, archived, superseded, deleting, or deleted content never becomes model
  context.
- Encryption/tamper, idempotency/race, injection, citation, deletion, outage, and recovery gates pass.
- Prior-phase authentication/RBAC/audit/job/AI regressions remain green.

## Retained production blockers

- Approved private object-storage provider, region, IAM, encryption/KMS, lifecycle, malware policy,
  backups, deletion propagation, capacity, cost, and recovery.
- Approved production Qdrant/server alternative, network/TLS/auth, region, DPA/data-use/subprocessors,
  encryption, snapshots/backups, access logging, deletion, capacity, and SLOs.
- PDF/office/OCR parser sandbox and malware-scanning service if those formats are later required.
- Final document classification, personal/sensitive-data policy, legal basis, consent language,
  retention/erasure/legal-hold schedule, and incident/complaint ownership.
- Multi-instance nonce/rate/concurrency controls, private service networking, supervision,
  monitoring/alerting, model rollback, and production load/soak evidence.
- Explicit production rollout approval. Repository/development completion does not grant it.
