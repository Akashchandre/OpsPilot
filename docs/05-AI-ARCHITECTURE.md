# AI Architecture

## Status and boundaries

ADR 0009's Phase 7 repository boundary is implemented and deterministically verified. The user
selected xAI/Grok and confirmed that an API key exists outside the repository, but the key has not
been read or used and `apps/ai/.env` is absent. Real provider traffic and explicit phase acceptance
remain disabled until the redacted provider preflight, metered live evaluation, manual account/
privacy review, and explicit approval pass.

Phase 8/9 capabilities in this document remain future direction only. Repository completion does
not authorize production deployment, personal/row-level context, retrieval, tools, or actions.

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
xAI Responses API / grok-4.6
  |
  v
Strict typed plain-text result
  |
  v
Node rechecks permission + consent, records metadata, returns to user
```

This is the implemented Phase 7 flow. It uses one narrow raw REST xAI Responses adapter directly
from FastAPI and deliberately adds no LangChain, LangGraph, retrieval, model tools, or action path.

## Implemented Phase 7 boundary

- Customer AI is limited to stateless help about a small versioned set of already-public OpsPilot
  capabilities. It receives no account/order/ticket or document context.
- Owner AI is limited to explaining the existing authorized aggregate overview projection. It
  receives no row-level or personal data and requires both owner-AI and report-read permission.
- Node authorizes, obtains versioned consent, reserves metadata-only usage/quota/cost evidence,
  and signs a minimal internal request. FastAPI has no database or business-service credential.
- Grok calls use a fixed model/endpoint, `store: false`, required ZDR verification, low reasoning,
  structured output, no tools, no retries, and bounded input/output/time/cost.
- OpsPilot stores no question, answer, reasoning, context/report JSON, or chat history. It stores
  only scoped consent and metadata-only usage/cost/audit evidence.
- A UUID submission key is at-most-once. Ambiguous results retain a pessimistic cost hold and are
  never retried automatically or replayed.
- Browser output is non-streaming, labeled AI-generated, and rendered as plain text. The owner UI
  displays authoritative aggregate values separately from generated interpretation.

The internal service, routes, schema, permissions, and UI are complete. Live provider behavior,
quality, latency, cost, and external privacy/account posture remain acceptance gates.

## Capability 1: Customer AI assistant

Phase 7 implements only stateless help about a reviewed set of public OpsPilot features and
navigation. It receives no account, order, payment, ticket, document, personal, or internal policy
context and cannot take an action. Document-grounded policies and personal account/order help are
future decisions.

## Capability 2: Business owner AI assistant

Phase 7 implements explanation of the existing authorized aggregate overview for a bounded UTC
range. It receives no row-level records and requires both `ai:owner:use` and `reports:read`.
Authoritative metrics and freshness stay visibly separate from generated interpretation. Broader
metrics, row-level analysis, tools, exports, forecasting, and actions remain future decisions.

## Capability 3: RAG over company documents

The RAG pipeline is expected to:

1. Accept authorized uploads through Node.js.
2. Store the original document in protected object storage.
3. Validate type/size, scan according to policy, extract text, and record version/checksum.
4. Chunk and embed approved content through background processing.
5. Store vectors with document, version, business, audience, and access metadata.
6. Retrieve using server-established access filters.
7. Build a bounded prompt from the query and retrieved content.
8. Return an answer with provenance/citations and safe fallback when evidence is insufficient.

Supported formats, OCR, chunking, embedding model, vector database, ranking, citation format, document audiences, versioning, retention, and deletion propagation are **Decision Required**.

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

- Owns public authentication, authorization, user/business scope, rate limits, and API contracts.
- Fetches or exposes business capabilities through controlled application services.
- Sends minimum necessary context to the AI service.
- Enforces confirmation and records durable application/audit outcomes.

### Python/FastAPI AI service

- In Phase 7, owns the fixed Grok provider adapter, immutable prompt templates, typed output policy,
  provider preflight, and synthetic evaluation harness.
- Retrieval orchestration, graph workflows, and any safe tool-invocation protocol remain future
  Phase 8/9 responsibilities and are not installed or implemented.
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
- Keep system prompts, credentials, provider keys, internal identifiers, and hidden tool details out of responses.
- Require explicit confirmation for payments, refunds, destructive changes, permission changes, external messages, or other consequential actions if ever allowed.
- Sanitize model output before rendering and do not execute generated code/HTML/SQL.
- Apply per-user/business quotas, timeouts, token limits, concurrency controls, and circuit breakers.

## Privacy, governance, and operations

Before production use, complete and approve:

- xAI contractual ZDR, regions, data residency, training/data-use terms, DPA, and subprocessors;
  embedding providers remain a Phase 8 decision.
- Final consent/notice/legal basis, voluntary personal/sensitive input handling, and deletion.
- Consent/usage/audit/backup retention; prompts, responses, reasoning, and chat are not stored in the
  Phase 7 application baseline.
- Human oversight and complaint/correction pathways.
- Model/version change control and rollback.
- Cost budgets, quotas, availability fallback, and incident response.
- Audit access and separation of operational telemetry from sensitive conversation content.

These remain production decisions even though Phase 7's development/test data minimization and
provider-processing notice are implemented.

## Evaluation and acceptance direction

Phase 7 includes a fixed 20-case synthetic set with allowed-intent, critical refusal, schema,
unsupported-claim, latency, cost, and ZDR thresholds. Deterministic boundary/security tests pass;
the explicitly metered live xAI run and human review remain pending. Later retrieval/tool phases
must add source-grounding, citation, retrieval-permission, and tool-correctness evaluation without
production secrets. Model output is probabilistic, so phase completion depends on recorded
thresholds and monitored failure modes, not anecdotal demos.
