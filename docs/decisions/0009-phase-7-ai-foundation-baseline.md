# ADR 0009 — Phase 7 AI Foundation Baseline

## Status

The provider-specific xAI/Grok portions were superseded on 2026-09-04 by ADR 0010 after the user
explicitly authorized using the existing Groq key. All provider-neutral Phase 7 controls in this
record remain accepted.

Accepted on 2026-09-03 by the user's explicit instruction to “start implementation” after the
complete Phase 7 decision proposal, approval checklist, and separate package-install requirement
were presented. This authorizes implementation of that exact baseline and installation of only the
Python packages pinned below. It does not authorize a real xAI request, production/customer
rollout, or any deferred Phase 8/9 capability.

The unresolved Phase 4 Razorpay Test Mode provider-delivery gate remains unchanged. Live payments
remain prohibited.

## Context

Phase 6 is repository-complete and committed. Phase 7 needs the smallest useful AI boundary while
preserving Node.js as the only public API and deterministic authorization/business authority. The
user selected xAI/Grok and confirmed that an API key exists outside the repository.

The reviewed behavior, privacy posture, permissions, threats, persistence, cost limits,
configuration, dependency rationale, and test thresholds are recorded in:

- `docs/phase-7/PHASE-07-DECISION-PROPOSAL.md`
- `docs/permissions/PHASE-07-PERMISSION-MATRIX.md`
- `docs/security/PHASE-07-THREAT-MODEL.md`
- `docs/phases/PHASE-07-AI-FOUNDATION.md`

## Decision

- Add a separately run Python 3.13/FastAPI service under `apps/ai`. It binds to loopback by default,
  has no CORS policy, MySQL credential, business API credential, browser route, or action tool.
- Keep React connected only to the versioned Node.js API. Node authenticates the opaque session,
  authorizes the exact assistant, validates consent and inputs, loads approved aggregate context,
  reserves quotas/cost/idempotency evidence, and signs a minimal internal request.
- Authenticate every Node-to-FastAPI request with a versioned canonical HMAC-SHA256 contract,
  dedicated Base64 key/key ID, body digest, UUID request ID/nonce, 30-second clock window,
  constant-time comparison, and bounded five-minute in-memory replay cache.
- Use xAI's raw REST Responses API at the code-owned `https://api.x.ai/v1/responses` endpoint with
  exact model `grok-4.6`, low reasoning, `store: false`, strict structured output, no tools/search/
  files/previous response/reasoning export, 500 output tokens, strict timeouts, and no automatic
  inference retry.
- Require verified xAI Zero Data Retention for every real user prompt and prohibit opting in to
  model-training/data-improvement use. If ZDR cannot be verified, only fixed synthetic smoke/eval
  data may be sent. A key alone does not authorize user data transmission.
- Implement only stateless `CUSTOMER_HELP` using reviewed public product/navigation facts and
  `OWNER_OVERVIEW_EXPLAIN` using the existing authorized aggregate overview. Send no customer
  account/order/ticket context, row-level business data, documents, or action capability.
- Add `ai:customer:use` only to `CUSTOMER`; add `ai:owner:use` and `ai:usage:read` only to `OWNER`;
  give `ADMIN` no Phase 7 AI permission. Owner inference also requires `reports:read`.
- Store only assistant-scoped, versioned provider consent and metadata-only usage/reservation
  evidence. Store no question, answer, prompt body, reasoning, report JSON, raw provider response,
  chat session, or chat message.
- Treat the UUID `Idempotency-Key` as an at-most-once submission key. A consumed key never calls
  the provider again and cannot replay an unstored answer. Ambiguous outcomes remain `UNKNOWN` and
  keep their pessimistic cost hold.
- Enforce durable per-user UTC-day request limits, atomic confirmed-plus-reserved cost limits,
  one in-flight request per user, four global in-flight requests per process, bounded burst limits,
  and safe failure that cannot affect core application readiness.
- Return non-streaming typed results and render only plain React text labeled AI-generated. Model
  output never becomes HTML/Markdown, a link, code, a business fact authority, or an action.
- Require deterministic boundary/security tests, mock-provider routine tests, context-minimization
  canaries, full prior-phase regression, and an explicit metered synthetic live evaluation before
  Phase 7 acceptance.

## Approved dependency pins

Official PyPI metadata was checked on 2026-09-03. These releases support Python 3.13, use
permissive licenses, and had no vulnerability entry in the PyPI release metadata at review time.
Transitive packages and OSV advisories must be reviewed after lock generation.

Runtime:

- `fastapi==0.141.1`
- `uvicorn==0.52.4`
- `httpx==0.28.1`
- `pydantic==2.13.5`
- `pydantic-settings==2.15.0`
- `python-dotenv==1.2.3`

Development:

- `pytest==9.1.1`
- `pytest-cov==7.1.0`
- `ruff==0.16.5`

Install only into ignored `apps/ai/.venv`, declare exact direct pins in `pyproject.toml`, and commit
the generated `pylock.toml`. No npm package, xAI/OpenAI SDK, LangChain, LangGraph, Redis, vector,
telemetry, or moderation dependency is approved.

## Initial limits

- Customer: 5 requests per 15 minutes and 20 per UTC day.
- Owner: 10 requests per 15 minutes and 50 per UTC day.
- Global confirmed-plus-reserved development ceiling: USD 2.00 per UTC day.
- Pessimistic per-request hold: USD 0.02.
- Question maximum: 2,000 characters; provider output maximum: 500 tokens.
- Node-to-FastAPI timeout: 22 seconds; FastAPI-to-xAI timeout: 20 seconds.

## Considered alternatives

- Direct browser-to-xAI access was rejected because it exposes credentials and bypasses Node
  authorization, consent, quotas, audit, and data minimization.
- Calling xAI directly from Node was rejected because Phase 7 explicitly establishes the isolated
  Python AI policy/provider boundary.
- `xai-sdk`, the OpenAI SDK, LangChain, and generic provider gateways were rejected because one raw
  REST adapter is smaller, exposes Grok-specific headers/cost evidence, and avoids unused agentic
  capability.
- Persistent chat was rejected because it adds content retention, access, deletion, and replay
  requirements without a Phase 7 need.
- Personal or row-level context, tools, streaming, RAG, and automated actions were rejected or
  deferred because they materially expand data exposure and authority.

## Consequences

Phase 7 adds a second language/runtime and internal service, two relational tables, three
permissions, signed cross-service contracts, external-provider failure/cost/privacy behavior, and
new operational checks. Core application functionality remains available when AI is disabled or
unavailable.

The repository baseline remains single-instance and development/test only. Production requires
approved privacy/legal terms, ZDR contractual verification, retention/erasure policy, TLS/mTLS and
private networking, shared replay/quota/rate state, service supervision, monitoring/alerts,
capacity/SLOs, key rotation, model-change/rollback policy, and independent human safety review.

## Implementation outcome

The repository implementation completed its deterministic gate on 2026-09-03. The accepted
preflight intent is split into a non-inference provider/model/ZDR/price check, a real loopback signed
Node-to-FastAPI smoke using a deterministic provider, and the explicit metered 20-case live
evaluation. This preserves the accepted assurance while avoiding a surprise billable request during
the first account check.

At the 2026-09-03 repository gate, no real xAI request was made because `apps/ai/.env` was absent.
On 2026-09-04, an ignored local environment was present and a redacted metadata preflight attempt
was rejected before inference. Secret-safe inspection established that the supplied credential was
for Groq, not xAI/Grok. Provider enablement was restored to false, and the implementation now
rejects non-xAI credentials before network access while preserving safe HTTP error classification.
Those xAI-specific provider gates were never completed and were superseded by ADR 0010. The Groq
ZDR/preflight/evaluation/live-path gates later passed, development enablement was explicitly
authorized, and Phase 7 was accepted on 2026-09-04. That acceptance does not authorize production
deployment or Phase 8 work.

## Related documents

- `docs/phase-7/PHASE-07-DECISION-PROPOSAL.md`
- `docs/permissions/PHASE-07-PERMISSION-MATRIX.md`
- `docs/security/PHASE-07-THREAT-MODEL.md`
- `docs/phases/PHASE-07-AI-FOUNDATION.md`
- `docs/phase-7/PHASE-07-IMPLEMENTATION-GUIDE.md`
- `docs/phase-7/PHASE-07-OPERATIONS-RUNBOOK.md`
- `docs/phase-7/PHASE-07-EVALUATION-EVIDENCE.md`
- `docs/phase-7/PHASE-07-REVIEW-REPORT.md`
- `docs/decisions/0008-phase-6-realtime-jobs-baseline.md`
- `docs/decisions/0006-phase-4-provider-smoke-deferral.md`
