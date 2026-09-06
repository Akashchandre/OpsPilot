# ADR 0011 — Phase 8 RAG and Document Intelligence Baseline

## Status

Accepted on 2026-09-05 by the user's explicit “yes” response to the complete Phase 8 approval
request. That request named the proposal, permission matrix, threat model, exact Python package
pins, and one-time embedding-model download.

This authorizes repository/development implementation of the exact baseline below, installation of
`qdrant-client==1.19.0` and `fastembed==0.8.0` into the ignored AI virtual environment, and one
download/cache verification of `sentence-transformers/all-MiniLM-L6-v2`. It does not authorize a
hosted vector/object account, production deployment, PDF/OCR or other deferred format, or Phase 9.

The unresolved Phase 4 provider-delivery gate and Phase 7 production blockers remain unchanged.

## Context

Phase 7 established a stateless, signed Node/FastAPI/Groq boundary without document retrieval.
Phase 8 requires secure document ingestion and grounded answers while preserving Node as the only
public authentication and authorization authority. The reviewed baseline is recorded in:

- `docs/phase-8/PHASE-08-DECISION-PROPOSAL.md`
- `docs/permissions/PHASE-08-PERMISSION-MATRIX.md`
- `docs/security/PHASE-08-THREAT-MODEL.md`
- `docs/phases/PHASE-08-RAG.md`

## Decision

- Accept only strict normalized UTF-8 `.txt` and `.md` English documents up to 256 KiB in v1. PDF,
  office files, archives, OCR, images, HTML rendering, URLs, and crawling remain rejected.
- Store normalized originals through a Node object-store boundary using a private local filesystem
  adapter and application AES-256-GCM encryption for repository/development. Production rejects
  the local adapter pending a separately approved object-store/KMS baseline.
- Add immutable document versions with `CUSTOMER` and `OWNER` audiences. `OWNER` and `ADMIN` receive
  document read/manage; only `OWNER` receives delete. Admin document management does not grant AI.
- Reuse the MySQL transactional job/outbox for idempotent ingest, reindex, and deletion. Job payloads
  contain only registered UUID/index metadata, never content.
- Use deterministic FastAPI chunking, local FastEmbed CPU inference, and persistent Qdrant local
  mode. Store vectors and opaque identifiers/filter metadata in Qdrant, not raw chunk text,
  filenames, titles, users, questions, or answers.
- Use `sentence-transformers/all-MiniLM-L6-v2`, 384 dimensions, cosine distance, one local embedding
  worker, a fixed model allowlist, and a versioned collection/alias. Record downloaded artifact
  revision/files/hashes and prove cached offline startup.
- Separate candidate retrieval from generation. FastAPI returns opaque candidate IDs/scores; Node
  reauthorizes each against current active `READY` MySQL metadata, decrypts/checksums only approved
  byte ranges, and sends bounded context back through the signed service.
- Add separate versioned document-processing consent and dedicated customer/owner document-Q&A
  intents. Preserve existing Phase 7 assistant paths and consent.
- Require source-only grounded output, structured citations, final source reauthorization, and
  explicit insufficient-evidence behavior. Retrieved text remains untrusted and grants no tool or
  action authority.
- Implement fail-closed replacement, staged publication, reindex, deletion, recovery, audit/log
  redaction, quotas, evaluation, and prior-phase regression exactly as specified in the proposal
  and threat model.
- Do not add LangChain, LangGraph, an npm dependency, hosted embeddings/vector/object storage,
  Redis, BullMQ, Docker, an LLM SDK, or autonomous actions.

## Approved dependency and model artifacts

Direct Python packages:

- `qdrant-client==1.19.0`
- `fastembed==0.8.0`

The complete transitive resolution must be locked in `apps/ai/pylock.toml`, checked for compatible
Python 3.13 Windows wheels, licenses, dependency consistency, and known advisories before use.

The approved public embedding artifact is
`sentence-transformers/all-MiniLM-L6-v2`. Its resolved repository revision/files/hashes must be
recorded after the authorized download. Runtime auto-download is prohibited after the verified
cache exists.

## Considered alternatives

- Qdrant Cloud inference was deferred because it adds an account, region, privacy, credential,
  retention, cost, and production network boundary before repository behavior is proven.
- Docker/self-hosted Qdrant was deferred because Docker is reserved for the production phase and a
  networked open-source Qdrant instance is not secure by default.
- A custom MySQL/JSON cosine store was rejected because it is not a purpose-built vector index and
  would add unmeasured query and maintenance risk.
- Hosted embedding APIs were rejected for the development baseline because they expose document
  text to another provider and require another account/consent/cost boundary.
- PDF/OCR and antivirus/parser services were deferred. Strict inert text validation avoids a binary
  parser attack surface while delivering a useful first document capability.
- LangChain and LangGraph were rejected because direct typed adapters cover Phase 8 and Phase 9 has
  not started.

## Consequences and follow-up

Phase 8 adds encrypted document objects, relational lifecycle/chunk/citation metadata, three
permissions, three job types, signed RAG service contracts, a local embedding model/cache, a local
vector index, separate document consent, citation UI, and broader security/evaluation gates.

Local Qdrant/FastEmbed and filesystem storage are single-process repository/development choices,
not production approval. Production still requires approved hosted/private storage and vector
topology, regions, TLS/IAM/key rotation, privacy/DPA, backups/deletion, malware/parser policy,
retention/legal hold, monitoring/SLO/capacity, multi-instance controls, and explicit rollout.

## Related decisions

- `docs/decisions/0009-phase-7-ai-foundation-baseline.md`
- `docs/decisions/0010-phase-7-groq-provider.md`
- `docs/decisions/0008-phase-6-realtime-jobs-baseline.md`
- `docs/decisions/0006-phase-4-provider-smoke-deferral.md`
