# Phase 7 Implementation Guide

## Result

Phase 7 implements ADRs 0009 and 0010's stateless, permission-aware AI foundation. React calls only the
versioned Node.js API; Node owns identity, authorization, consent, context, quotas, cost holds, and
audit evidence; an internal FastAPI service owns fixed prompts and the narrow Groq adapter.
No RAG, tools, actions, streaming, persistent chat, or conversation-content storage was added.

The repository implementation and deterministic gates pass. On 2026-09-04 the user authorized
using the existing Groq key, confirmed Global ZDR, and requested development enablement. The
redacted application preflight, paced metered 20-case evaluation, and signed live path pass for
`openai/gpt-oss-120b`; both ignored development feature flags are enabled.

## Runtime topology

```text
React browser
  |
  |  opaque session + CSRF + UUID submission key
  v
Express /api/v1/ai
  |-- MySQL: permissions, scoped consent, usage holds/outcomes, audit chain
  |-- report service: owner aggregate overview only
  |
  |  canonical HMAC-SHA256 request over loopback
  v
FastAPI /internal/v1
  |-- strict assistant/intent contract
  |-- immutable prompt registry
  |-- no database, session, or business-service credential
  |
  |  fixed HTTPS endpoint, model, schema, ZDR, no tools/retry
  v
Groq Chat Completions / openai/gpt-oss-120b
```

An AI outage changes only the optional AI state in public health. It does not make the main API,
commerce, support, reporting, jobs, or notifications unready.

## Implemented capabilities

| Assistant | Public route | Context sent to the model | Required permissions |
|---|---|---|---|
| Customer | `POST /api/v1/ai/customer/responses` | Normalized question plus reviewed public feature/navigation facts | `ai:customer:use` |
| Owner | `POST /api/v1/ai/owner/overview-responses` | Normalized question plus the existing bounded aggregate overview | `ai:owner:use` and `reports:read` |

The customer path never adds account, order, payment, ticket, address, user, or inventory-detail
context. The owner path sends counts, status/priority breakdowns, exact INR decimal strings, UTC
range, and `asOf`; it sends no row-level or personal records.

Both policies refuse unsupported/private/current-information, hidden-prompt/credential,
high-stakes-advice, row-level, tool, and action requests. Output is one of `ANSWER`, `REFUSAL`, or
`ESCALATE` with up to three registered notices. It cannot authorize or invoke a business action.

## Public API and UI

The implemented Node routes are:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/ai/consents/:assistant` | Read the caller's current `customer` or `owner` consent |
| `PUT` | `/api/v1/ai/consents/:assistant` | Accept server-owned notice `groq-zdr-v1` with the matching assistant permission |
| `DELETE` | `/api/v1/ai/consents/:assistant` | Revoke the caller's scoped consent, including after permission removal |
| `POST` | `/api/v1/ai/customer/responses` | Submit one customer-help request |
| `POST` | `/api/v1/ai/owner/overview-responses` | Submit one owner overview explanation request |
| `GET` | `/api/v1/ai/usage` | Read bounded, non-user-attributed metadata aggregates |

Consent and response writes use the existing exact-origin and CSRF boundary. Response routes
require a fresh UUID `Idempotency-Key`, strict JSON, a normalized 1–2,000-character question, and
assistant-specific permissions. Clients cannot provide a model, prompt, role, intent, context,
provider URL, file, tool, or system message.

The customer page is `/assistant`; the owner page is `/admin/assistant`. Navigation and routes are
permission-gated. The owner page keeps the authoritative overview visibly separate from generated
interpretation and exposes only aggregate usage. Answers are held in React component memory,
cleared on revocation/reload/navigation, and rendered as ordinary text without Markdown, HTML,
links, or `dangerouslySetInnerHTML`.

## Consent and authorization

The migration seeds exactly three permissions:

- `CUSTOMER`: `ai:customer:use`.
- `OWNER`: `ai:owner:use` and `ai:usage:read`.
- `ADMIN`: no Phase 7 AI permission.

Consent is keyed by user, `XAI`, assistant, and notice version. Consent is necessary but never
grants permission. Node revalidates the active user, all required permissions, and consent before
reserving a request and again before returning a completed answer. A mid-flight role/status/
consent change suppresses the answer even when provider cost was already incurred.

## Signed internal contract

FastAPI exposes only signed `GET /internal/v1/health` and `POST /internal/v1/responses`. Every
request includes a version, key ID, canonical millisecond UTC timestamp, UUID nonce, UUID request
ID, and HMAC-SHA256 signature over:

```text
version\ntimestamp\nnonce\nrequest-id\nmethod\npath\nsha256(raw-body)
```

FastAPI verifies the signature in constant time before parsing JSON, permits a 30-second clock
window, rejects duplicate JSON keys and unsupported content types, bounds the body, and keeps
nonces in a bounded five-minute in-memory replay cache. Node rejects redirects, non-JSON/oversized
responses, unknown fields, invalid model/prompt/usage/cost/ZDR values, markup, links, reasoning, or
tool output.

This replay design is valid only for one Node process and one FastAPI process. A second instance
requires a reviewed shared replay/authentication design and private TLS/mTLS topology.

## Provider policy

`GroqChatCompletionsProvider` uses `httpx` against the code-owned
`https://api.groq.com/openai/v1/chat/completions` endpoint. Requests use exact production model
`openai/gpt-oss-120b`, low reasoning effort with reasoning excluded from responses, strict
JSON-schema output using Groq's supported constrained subset, no tools/citations, one non-streaming
choice, at most 500 completion tokens, TLS verification, no redirects, and a 20-second ceiling.
The full local contract is revalidated after decoding. Inference is never retried automatically.

The adapter verifies the fixed model, final typed output, finish state, token arithmetic, cached
tokens, calculated integer cost, provider request ID, and absence of tool output. Cost uses the
reviewed rates pinned in ADR 0010. Raw provider bodies, errors, prompts, answers, headers, and
reasoning are never returned to Node logs or stored.

When provider access is enabled, configuration requires a Groq `gsk_...` key, the immutable ZDR
requirement, and explicit `GROQ_ZERO_DATA_RETENTION_CONFIRMED=true`. Because Groq documents ZDR as
a Console Data Controls setting rather than a response header, the service fails closed until the
operator records that confirmation. The legacy `XAI_API_KEY` environment name is accepted only as
a migration alias for the already ignored Groq value.

## Persistence and at-most-once state

Migration `20260903060000_phase_7_ai_foundation` adds only:

- `ai_provider_consents`: scoped notice acceptance/revocation timestamps; and
- `ai_usage_events`: user/submission identity, registered scope, lifecycle, model/prompt versions,
  safe provider/error identifiers, integer tokens/cost holds/exact cost, latency, and timestamps.

Neither table has a question, answer, prompt, reasoning, context/report JSON, raw provider payload,
signature, or credential column. Both user relationships are `RESTRICT` to protect evidence.

Migration `20260904090000_phase_7_groq_provider` retains historical `XAI` values, adds `GROQ`,
revokes active legacy xAI consent, and permits the fixed slash-containing Groq model ID. Users must
accept the new Groq notice; historical usage is not rewritten.

```text
reserve -> PENDING
PENDING -> SUCCEEDED  (typed response recorded; exact cost replaces the hold in aggregates)
PENDING -> FAILED     (provider definitely not billed; hold released)
PENDING -> UNKNOWN    (ambiguous provider/internal result; full hold retained)
```

The `(user_id, submission_key)` constraint makes the browser UUID an at-most-once submission key.
Every consumed key conflicts; no answer replay is possible because no answer is stored. Stale
`PENDING` rows are marked `UNKNOWN` on that user's next reservation. There is no automatic provider
retry or public replay endpoint.

Reservation locks the user and uses the existing serialized audit-chain append to make the global
confirmed-cost plus pending/unknown-hold check atomic. Defaults are 20 customer and 50 owner
requests per UTC day, one in-flight request per user, four per process, USD 2.00 daily confirmed
plus reserved exposure, and a USD 0.02 hold per request. A provider response exceeding that hold is
recorded exactly but its answer is suppressed with `AI_COST_POLICY_EXCEEDED`.

## Audit, logs, and usage visibility

Registered audit actions cover consent accepted/revoked, request started/completed/failed, and
owner usage reads. Only registered assistant/intent/model/prompt/status/outcome, safe error code,
integer usage/cost, duration, ZDR boolean, range, and request/event identifiers are allowed.

Owner usage returns aggregate status/assistant counts, successful token totals, completed latency
count/average/maximum, safe-error counts, confirmed exact cost, and pending/unknown reserved
exposure. It never returns a user ID, provider request ID, prompt, answer, or individual event.

## Gate split

The accepted preflight intent is implemented as three explicit gates:

1. the redacted, non-inference provider preflight checks credential/model access, explicit operator
   ZDR confirmation, and the pinned reviewed price policy;
2. the opt-in local cross-service smoke proves signed health and response contracts against a
   deterministic provider; and
3. the opt-in metered 20-case live evaluation proves real structured inference, safety, latency,
   and cost.

This split makes the first provider check non-billable while preserving every accepted boundary
and live-evaluation requirement. The applicable development gates passed on 2026-09-04 and Node is
enabled locally; production enablement remains a separate approval.

## Explicit exclusions

Phase 7 includes no persistent/multi-turn chat, personal customer context, row-level owner data,
company documents, upload, embeddings, vector database, RAG, citations, provider tools/search/
files, streaming, images/audio, generated SQL, LangChain, LangGraph, actions, external messages,
Redis, distributed rate/replay state, hosted telemetry, or production deployment topology.
