# AI Architecture

## Status and boundaries

ADR 0009's Phase 7 repository boundary is implemented and deterministically verified. ADR 0010
records the user's 2026-09-04 authorization to use the existing Groq key and replaces only the
provider-specific xAI baseline. The Groq Chat Completions adapter, consent version, persistence
enum migration, exact cost calculation, contracts, and UI labels are implemented. On 2026-09-04,
Global ZDR was operator-confirmed, the redacted application preflight passed, and the paced metered
20-case live evaluation passed every quality, safety, schema, latency, and cost threshold. The user
explicitly authorized development enablement and accepted Phase 7 on 2026-09-04. Production
approval remains pending the broader account/privacy/operations review.

On 2026-09-05, ADR 0011 accepted the Phase 8 repository/development baseline and its exact local
Qdrant/FastEmbed dependencies. The verified repository/development implementation adds strict
text/Markdown ingestion, encrypted private local objects, version/audience lifecycle, signed
retrieval, bounded grounded context, separate document consent, and citation handling. The user
explicitly accepted the completed repository/development scope on 2026-09-06. Local
filesystem/Qdrant/FastEmbed operation is not production approval. Phase 9 capabilities remain
future direction only; no personal/row-level business data, tools, or actions are authorized by
Phase 8.

AI does not replace authentication, authorization, deterministic business rules, database constraints, payment logic, or human approval for consequential actions.

## Conceptual flow

```text
User
  |
  v
React (Node API only)
  |
  v
Node.js API (authenticates, authorizes, consents, scopes, reserves cost)
  |
  v
Python FastAPI AI service (signed internal boundary; fixed policy/prompt)
  |
  v
Groq Chat Completions / openai/gpt-oss-120b
  |
  v
Strict typed plain-text result
  |
  v
Node rechecks permission + consent, records metadata, returns to user
```

This is the implemented Phase 7 flow. It uses one narrow raw REST Groq Chat Completions adapter directly
from FastAPI and deliberately adds no LangChain, LangGraph, retrieval, model tools, or action path.

## Implemented Phase 7 boundary

- Customer AI is limited to stateless help about a small versioned set of already-public OpsPilot
  capabilities. It receives no account/order/ticket or document context.
- Owner AI is limited to explaining the existing authorized aggregate overview projection. It
  receives no row-level or personal data and requires both owner-AI and report-read permission.
- Node authorizes, obtains versioned consent, reserves metadata-only usage/quota/cost evidence,
  and signs a minimal internal request. FastAPI has no database or business-service credential.
- Groq calls use a fixed model/endpoint, explicit operator-confirmed ZDR, low reasoning effort with
  reasoning excluded from responses, strict structured output, no tools/citations, no retries, and
  bounded input/output/time/cost.
  Exact integer cost is calculated from returned prompt, cached-prompt, and completion tokens using
  the reviewed pinned price constants.
- OpsPilot stores no question, answer, reasoning, context/report JSON, or chat history. It stores
  only scoped consent and metadata-only usage/cost/audit evidence.
- A UUID submission key is at-most-once. Ambiguous results retain a pessimistic cost hold and are
  never retried automatically or replayed.
- Browser output is non-streaming, labeled AI-generated, and rendered as plain text. The owner UI
  displays authoritative aggregate values separately from generated interpretation.

The internal service, routes, schema, permissions, and UI are complete. Live provider behavior,
quality, latency, and cost passed the Phase 7 gate; external privacy/account posture remains a
production rollout gate.

## Capability 1: Customer AI assistant

Phase 7 implements only stateless help about a reviewed set of public OpsPilot features and
navigation. It receives no account, order, payment, ticket, personal, or internal policy context
and cannot take an action. Phase 8 adds a separate document-Q&A endpoint and consent, rather than
broadening this Phase 7 public-feature path. Personal account/order help remains a future decision.

## Capability 2: Business owner AI assistant

Phase 7 implements explanation of the existing authorized aggregate overview for a bounded UTC
range. It receives no row-level records and requires both `ai:owner:use` and `reports:read`.
Authoritative metrics and freshness stay visibly separate from generated interpretation. Broader
metrics, row-level analysis, tools, exports, forecasting, and actions remain future decisions.

## Capability 3: RAG over company documents

The Phase 8 repository/development implementation uses a deliberately narrow, fail-closed RAG
path:

1. Node accepts only NFC-normalized UTF-8 English `.txt` and `.md` documents up to 256 KiB after
   permission, CSRF, idempotency, declared-type/filename, encoding, control-character, and
   content checks. PDF, office, archive, image, HTML, OCR, and crawler input are rejected.
2. Node stores normalized originals through a private AES-256-GCM filesystem adapter and records
   opaque object/key/checksum metadata in MySQL. The local adapter is only for repository/
   development use and production configuration rejects it.
3. The existing MySQL worker processes registered UUID/index-only ingest, reindex, and deletion
   jobs. It uses deterministic chunking, the pinned local FastEmbed
   `sentence-transformers/all-MiniLM-L6-v2` model (384 dimensions), and persistent local Qdrant.
   Qdrant stores vectors with opaque point/filter metadata, never source text, titles, questions,
   or answers.
4. The signed FastAPI service returns candidate point IDs/scores. Node derives the audience from
   the registered customer or owner assistant, reauthorizes every candidate against current
   `ACTIVE` document/current `READY` version/audience metadata, and decrypts plus checksum-checks
   only selected byte ranges. At most five excerpts, 8,000 bytes, and an estimated 2,000 tokens
   become context.
5. A separate `groq-zdr-documents-v1` consent is required. Groq receives only the question and
   bounded reauthorized excerpts. Its typed output may cite only supplied `S1` through `S5` labels
   and must return insufficient evidence where sources do not support an answer.
6. Node repeats permission, consent, lifecycle, audience, and citation/source checks after
   generation. It records only usage/cost metadata and citation identifiers, renders plain text,
   and suppresses output if authorization changed in flight.

Only `CUSTOMER` and `OWNER` source audiences exist. Customers may retrieve customer-audience
sources through the customer assistant; owners may retrieve both; administrators retain document
management but have no AI permission. Immutable version replacement is staged, and deletion first
makes a source non-retrievable before vectors/objects/chunk descriptors are cleaned up. Explicit
Phase 8 acceptance, production storage/vector design, parser/malware policy, retention, legal
holds, backup erasure, and production rollout remain pending.

## Capability 4: AI-powered support

AI may classify or summarize tickets, retrieve approved answers, suggest responses, gather permitted order context, and support routing. Autonomous customer-visible responses or state-changing actions require explicit policy and appropriate human confirmation.

SLA, confidence thresholds, escalation rules, agent review, supported actions, and audit requirements are **Decision Required**.

## Capability 5: Business-data querying

Do not let a model execute unrestricted SQL. Use narrow, allowlisted tools implemented through the business service/data-access layer. Each tool must define:

- Typed, validated inputs and bounded outputs.
- Required permission and business/user scope.
- Allowed aggregates, filters, time ranges, and row limits.
- Query timeout and cost controls.
- Sensitive-field redaction.
- Freshness metadata and audit behavior.

Generated narrative must clearly identify inferred insights and must not fabricate absent data.

## Capability 6: LangGraph workflows

LangGraph is planned for stateful multi-step workflows in Phase 9, such as business analysis or AI-assisted support. Graphs should use explicit state, bounded loops, timeouts, approved tools, checkpoints only where needed, deterministic error paths, and human approval nodes for consequential actions.

Workflow inventory, persistence/checkpoint store, interruption/recovery, approval UI, and replay policy are **Decision Required**.

## Service responsibilities

### Node.js API

- Owns public authentication, authorization, assistant/document-consent scope, rate limits, and API contracts.
- Fetches or exposes business capabilities through controlled application services.
- For Phase 8, owns encrypted-object access, MySQL lifecycle/audience/integrity reauthorization,
  bounded source materialization, final source/citation rechecks, and document job coordination.
- Sends only minimum necessary authorized context to the AI service; Qdrant candidates never grant access.
- Enforces confirmation and records durable application/audit outcomes.

### Python/FastAPI AI service

- In Phase 7, owns the fixed Groq provider adapter, immutable prompt templates, typed output policy,
  provider preflight, and synthetic evaluation harness.
- In Phase 8, owns signed index/publication/candidate/deletion contracts, deterministic chunking,
  pinned local FastEmbed embedding, local Qdrant operations, document prompt construction, and
  strict answer/citation contract validation. It returns candidates as opaque IDs/scores only.
- Graph workflows and any safe tool-invocation protocol remain future Phase 9 responsibilities and
  are not installed or implemented.
- Accepts only authenticated internal calls.
- Does not become a backdoor around Node.js authorization or database rules.

### LangChain and LangGraph

- LangChain provides model, retrieval, prompt, and tool integration where it reduces custom integration cost.
- LangGraph is reserved for workflows that truly need explicit state and multi-step control.
- Neither library should be added merely because it is in the eventual technology direction.

## Security and safety

- Treat user input, documents, retrieved text, tool results, and model output as untrusted.
- Test prompt injection, indirect injection, tool manipulation, data exfiltration, cross-user/business retrieval, unsafe output rendering, and denial/cost abuse.
- Enforce access filters before and during retrieval, not after generation alone.
- Phase 8 treats Qdrant as an untrusted candidate index: Node reauthorizes lifecycle, audience,
  source identity, decrypted-object checksum, and byte-range hash before use and repeats the
  relevant checks after generation. A stale vector, revoked consent, archived source, or changed
  permission suppresses the response rather than falling back to general knowledge.
- Delimit retrieved excerpts as untrusted data; require source-only answers, supplied-label-only
  citations, explicit insufficient evidence, no tools, and plain-text rendering.
- Keep system prompts, credentials, provider keys, internal identifiers, and hidden tool details out of responses.
- Require explicit confirmation for payments, refunds, destructive changes, permission changes, external messages, or other consequential actions if ever allowed.
- Sanitize model output before rendering and do not execute generated code/HTML/SQL.
- Apply per-user/business quotas, timeouts, token limits, concurrency controls, and circuit breakers.

## Privacy, governance, and operations

Before production use, complete and approve:

- Groq contractual ZDR, regions, data residency, training/data-use terms, DPA, and subprocessors;
  the Phase 8 local embedding model/cache is accepted only for repository/development, while any
  production embedding/vector provider and its privacy/security terms remain a separate decision.
- Final consent/notice/legal basis, voluntary personal/sensitive input handling, and deletion.
- Consent/usage/audit/backup retention; prompts, responses, reasoning, and chat are not stored in the
  Phase 7 application baseline. Phase 8 similarly stores no question, answer, excerpt, or chunk
  text in usage/audit records; it retains only scoped consent, safe usage/cost, and citation IDs.
- Human oversight and complaint/correction pathways.
- Model/version change control and rollback.
- Cost budgets, quotas, availability fallback, and incident response.
- Audit access and separation of operational telemetry from sensitive conversation content.

These remain production decisions even though Phase 7's development/test data minimization and
provider-processing notice, and Phase 8's separate document-processing consent and local
repository/development safeguards, are implemented.

## Evaluation and acceptance direction

Phase 7 includes a fixed 20-case synthetic set with allowed-intent, critical refusal, schema,
unsupported-claim, latency, cost, and ZDR thresholds. Deterministic boundary/security tests and the
paced live Groq run pass; broader production human review remains pending. Phase 8 adds a
deterministic golden retrieval corpus and opt-in grounded-answer evaluator covering retrieval rank,
no-evidence behavior, audience isolation, stale/deleted exclusion, injection, citation validity,
latency, and provider cost without emitting document or answer content. Its final measured gate
passes; explicit Phase 8 acceptance remains the completion condition. Model output is
probabilistic, so phase completion depends on recorded thresholds and monitored failure modes, not
anecdotal demos.
