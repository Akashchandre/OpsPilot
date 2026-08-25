# Phase 7 — AI Foundation

## Objective

Establish the isolated Python/FastAPI AI service and minimal permission-aware customer and owner assistant foundations without RAG or autonomous multi-step workflows.

## Requirements and goals

- Internal authenticated Node.js-to-FastAPI service boundary.
- Approved LLM provider adapter, configuration, timeouts, quotas, and safe fallback.
- Separate customer and owner assistant policies and authorization scopes.
- Chat session/message behavior under an approved privacy/retention model.
- Baseline prompts, output handling, telemetry, cost visibility, and evaluation harness.

## Decisions required

Provider/model, SDKs and accounts; internal service authentication/networking; sync/stream protocol; assistant intents and forbidden behavior; prompt/version storage; chat retention/deletion; consent/provider data use; moderation/safety; quotas/cost budgets; evaluation dataset/thresholds; data shared with the model.

## Tasks

Approve threat model, dependencies/accounts/env variables/data terms; scaffold the Python service only now; implement health and internal auth; define typed Node/Python contracts and provider adapter; implement minimal non-RAG assistant paths with strict scope; persist chats only if approved; add timeouts/rate/cost controls and safe rendering; build evaluations/security tests; document operations and update progress.

## Acceptance criteria

- Browsers cannot call the AI service directly; unauthorized internal requests fail closed.
- Node.js establishes user/business/assistant scope and sends minimum necessary data.
- Customer and owner paths cannot cross roles or data boundaries.
- Provider timeout/error/rate-limit behavior returns a safe application response.
- Outputs are treated as untrusted and do not trigger business actions.
- Baseline quality, security, latency, and cost evaluation thresholds are met and reproducible.

## Testing requirements

Contract tests between Node and Python; internal auth tests; provider-mock success/error/timeout/rate tests; cross-role/data leakage tests; prompt injection and unsafe rendering tests; quota/concurrency tests; chat retention/access tests if stored; evaluation suite and prior-phase regression.

## Edge cases

Provider unavailable/slow/malformed, partial streaming disconnect, context/token overflow, duplicate send, deleted/disabled user, permission change mid-chat, empty/hostile input, model/version change, cost spike, telemetry failure.

## Security considerations

Keep provider credentials server-side; minimize/redact prompt data; prevent prompt and output leakage; isolate assistant policies; set network/time/token limits; never grant unrestricted database/tools; sanitize rendering; document provider privacy/data use; audit sensitive usage without storing unnecessary content.

## Completion criteria

Service boundary and approved assistants work under safe failure; contract/security/evaluation gates pass; cost/privacy/operational runbooks are accepted; no RAG/vector store/LangGraph workflow is implemented; and explicit acceptance is recorded.

## Documentation updates

Update AI/system architecture, API/database contracts, threat model, provider/model/config catalog, prompt/evaluation and privacy policies, runbooks, decisions, this phase status, and `WORK-PROGRESS.md`.

## Explicit exclusions

Document ingestion, embeddings, vector databases, RAG, unrestricted business queries, LangGraph, and autonomous support actions remain later work.

