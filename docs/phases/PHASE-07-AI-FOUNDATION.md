# Phase 7 — AI Foundation

## Status

**REPOSITORY IMPLEMENTATION COMPLETE AND VERIFIED on 2026-09-03 under ADR 0009; PHASE ACCEPTANCE
PENDING.** The isolated service, provider adapter, database/API/UI behavior, deterministic tests,
and operations/evaluation documentation are implemented. Real xAI traffic remains disabled because
the ignored provider environment is absent. The redacted ZDR/model/price preflight, metered live
synthetic evaluation, manual provider/privacy review, and explicit acceptance remain required.

## Objective

Establish the isolated Python/FastAPI AI service and minimal permission-aware customer and owner assistant foundations without RAG or autonomous multi-step workflows.

## Requirements and goals

- Internal authenticated Node.js-to-FastAPI service boundary.
- Approved LLM provider adapter, configuration, timeouts, quotas, and safe fallback.
- Separate customer and owner assistant policies and authorization scopes.
- Explicitly stateless response behavior with no chat session/message or conversation retention.
- Baseline prompts, output handling, telemetry, cost visibility, and evaluation harness.

## Decisions required

Provider/model, SDKs and accounts; internal service authentication/networking; sync/stream protocol; assistant intents and forbidden behavior; prompt/version storage; chat retention/deletion; consent/provider data use; moderation/safety; quotas/cost budgets; evaluation dataset/thresholds; data shared with the model.

## Tasks

- [x] Confirm the Phase 6 repository gate and the user's explicit authorization to start Phase 7.
- [x] Record xAI/Grok as the user-selected provider and confirm only that a key exists outside the
      repository; do not read or copy it into tracked files.
- [x] Inspect the current Node/session/RBAC/report/audit/log/rate/job/UI boundaries and current
      official xAI model, Responses API, retention/ZDR, cost, rate, and key-scope behavior.
- [x] Draft the complete Phase 7 decision proposal, proposed permission matrix, and proposed threat
      model without installing or connecting anything.
- [x] Explicitly approve or change the provider/model, intent/context, internal authentication,
      consent/retention, persistence, permission, quota/cost, dependency, and test baseline.
- [x] Obtain explicit instruction before installing the proposed Python packages.
- [x] Record the accepted baseline in ADR 0009.
- [x] Scaffold the reviewed Python/FastAPI service and implement health/internal authentication.
- [x] Implement the typed Node/Python contracts, Grok adapter, minimal non-RAG assistants,
      consent/usage evidence, timeouts/rate/cost controls, and safe UI rendering.
- [ ] Complete evaluations, security/failure tests, prior-phase regression, operational/privacy
      documentation, and explicit acceptance review. Deterministic repository work is complete;
      the provider preflight, metered live evaluation, privacy review, and acceptance are pending.

## Acceptance criteria

- Browsers cannot call the AI service directly; unauthorized internal requests fail closed.
- Node.js establishes user/business/assistant scope and sends minimum necessary data.
- Customer and owner paths cannot cross roles or data boundaries.
- Provider timeout/error/rate-limit behavior returns a safe application response.
- Outputs are treated as untrusted and do not trigger business actions.
- Baseline quality, security, latency, and cost evaluation thresholds are met and reproducible.

## Testing requirements

Contract tests between Node and Python; internal auth tests; provider-mock success/error/timeout/rate
tests; cross-role/data leakage tests; prompt injection and unsafe rendering tests; quota/concurrency
tests; proof that conversation content is not stored; evaluation suite and prior-phase regression.

## Edge cases

Provider unavailable/slow/malformed, internal disconnect, context/token overflow, duplicate send,
deleted/disabled user, permission or consent change in flight, empty/hostile input, model/version or
price change, cost spike, and usage/audit recording failure.

## Security considerations

Keep provider credentials server-side; minimize/redact prompt data; prevent prompt and output leakage; isolate assistant policies; set network/time/token limits; never grant unrestricted database/tools; sanitize rendering; document provider privacy/data use; audit sensitive usage without storing unnecessary content.

## Completion criteria

Service boundary and approved assistants work under safe failure; contract/security/evaluation gates pass; cost/privacy/operational runbooks are accepted; no RAG/vector store/LangGraph workflow is implemented; and explicit acceptance is recorded.

## Documentation updates

Update AI/system architecture, API/database contracts, threat model, provider/model/config catalog, prompt/evaluation and privacy policies, runbooks, decisions, this phase status, and `WORK-PROGRESS.md`.

## Explicit exclusions

Document ingestion, embeddings, vector databases, RAG, unrestricted business queries, LangGraph, and autonomous support actions remain later work.

The implemented baseline also defers persistent/multi-turn chat, provider tools/search/files, streaming,
customer account/order context, row-level owner data, LangChain, and every model-triggered action.
