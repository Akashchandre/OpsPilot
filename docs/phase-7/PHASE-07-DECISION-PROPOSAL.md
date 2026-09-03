# Phase 7 AI Foundation Decision Proposal

## Status

**ACCEPTED FOR IMPLEMENTATION on 2026-09-03 under ADR 0009.** The user explicitly instructed the
implementation to start after receiving the complete proposal and package-install approval gate.
xAI/Grok remains the selected provider, and the user confirmed only that an API key exists outside
the repository. The key has not been read, copied, or used.

Only this baseline and the exact Python packages recorded in ADR 0009 are authorized. A real xAI
request still requires ignored secret configuration and the redacted ZDR preflight. The deferred
Phase 4 Razorpay provider gate remains open and is not changed by this decision.

The repository implementation was completed and deterministically verified on 2026-09-03. The
implementation guide, operations runbook, evaluation evidence, and review report record the exact
result. Phase acceptance remains pending the provider/privacy checks and metered live evaluation.

## Objective and scope

Introduce the smallest useful, permission-aware AI boundary without making a model an authority,
data store, retrieval system, or action engine. The proposed baseline includes:

- A separately run Python 3.13/FastAPI service under `apps/ai`.
- A signed, replay-resistant internal Node.js-to-FastAPI request boundary.
- xAI's Grok 4.6 through the stateless Responses API.
- One bounded customer-help intent and one owner-only aggregate-overview explanation intent.
- Explicit provider-processing consent and metadata-only usage/cost evidence in MySQL.
- Non-streaming, structured, plain-text responses with safe provider failure behavior.
- Versioned prompts, mock-provider tests, and a synthetic live evaluation gate.

No chat history, account/order context, row-level business data, model tools, provider search,
files, documents, embeddings, RAG, vector storage, LangChain, LangGraph, autonomous workflow, or
state-changing AI action is included.

## Current constraints and official provider evidence

- OpsPilot remains single-business. The browser authenticates only to the Node.js API through the
  existing opaque cookie session; Node owns public authorization, rate limits, CSRF, audit, and
  business-data access.
- Python 3.13.7 is installed locally. The main React and Node.js applications remain JavaScript.
- xAI documents the Responses API as the preferred API and as more suitable than its gRPC SDK for
  chatbot/REST use. It supports `store: false`, typed output items, and structured output:
  [xAI text generation](https://docs.x.ai/developers/model-capabilities/text/generate-text) and
  [Responses comparison](https://docs.x.ai/developers/model-capabilities/text/comparison).
- xAI's current documented flagship text model is `grok-4.6`. It supports structured outputs and
  configurable reasoning; low reasoning is appropriate for the bounded Phase 7 intents:
  [Grok 4.6](https://docs.x.ai/developers/grok-4-6) and
  [reasoning controls](https://docs.x.ai/developers/model-capabilities/text/reasoning).
- The REST inference boundary is `https://api.x.ai` with bearer API-key authentication. API keys
  can be restricted by endpoint and model ACLs:
  [inference API](https://docs.x.ai/developers/rest-api-reference/inference) and
  [API-key ACL guidance](https://docs.x.ai/developers/management-api-guide).
- xAI states that API inputs/outputs are not used for training without explicit permission. Its
  default abuse-audit retention is 30 days; Zero Data Retention (ZDR) prevents prompt/response
  persistence and can be verified through `x-zero-data-retention`:
  [xAI API security and ZDR](https://docs.x.ai/developers/faq/security).
- Responses include exact per-request token counts and billed cost in integer
  `cost_in_usd_ticks`, where 10,000,000,000 ticks equal one US dollar:
  [xAI cost tracking](https://docs.x.ai/developers/cost-tracking).
- xAI applies model/team RPS and TPM limits and returns `429` when exceeded:
  [xAI rate limits](https://docs.x.ai/developers/rate-limits).

Provider documentation and pricing can change. The implementation and acceptance evidence must
record the model and provider behavior verified on the gate date; a later model change requires a
fresh evaluation and explicit configuration change.

## Proposed architecture decisions

### 1. Service topology and authority

Add `apps/ai` as a separate Python application with its own `pyproject.toml`, lock file, source,
tests, safe environment example, and run commands. It binds to `127.0.0.1` by default and exposes
no CORS policy. The browser never receives its URL, provider key, internal signing key, provider
response ID, prompt template, or internal contract.

The public flow is:

```text
React -> versioned Node.js API -> signed internal FastAPI request -> xAI Responses API
              |                         |
              v                         v
       MySQL authorization       prompt/provider policy
       consent/usage/audit       no database or tools
```

Node.js remains authoritative for the active user, permissions, consent, assistant mode, report
range, quota reservation, idempotency, and any business context. FastAPI validates the signed
scope and request contract, selects a versioned prompt, calls the provider, validates the provider
response, and returns a narrow internal result. The AI service receives no database credential and
cannot call OpsPilot business APIs.

The main API remains available when the AI service or xAI is unavailable. AI endpoints fail with a
safe `503`; commerce, support, reporting, jobs, and notifications remain independent.

### 2. Initial assistant and intent inventory

Only two intents are registered:

| Assistant | Intent                   | Authorized input/context                                                                                                    | Allowed result                                                                                                                           |
| --------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Customer  | `CUSTOMER_HELP`          | One normalized plain-text question plus a small versioned list of already-public OpsPilot capabilities and navigation facts | Explain how to use current customer-facing features or direct the user to normal support; state when approved information is unavailable |
| Owner     | `OWNER_OVERVIEW_EXPLAIN` | One normalized question plus the existing authoritative aggregate `/reports/overview` projection for a validated UTC range  | Summarize the supplied aggregates, identify non-causal patterns, and suggest non-consequential checks                                    |

`CUSTOMER_HELP` receives no user ID, email, order, payment, ticket, address, inventory quantity,
internal note, audit event, job data, or company policy/document content in the model prompt.

`OWNER_OVERVIEW_EXPLAIN` requires both the new owner-assistant permission and existing
`reports:read`. Node calls the current report service and sends only its bounded aggregate counts,
status breakdowns, exact INR decimal strings, range, and `asOf` timestamp. No row-level customer,
order, payment, refund, support-message, employee, or provider data is sent.

Both intents must refuse hidden-prompt/credential requests, unsupported policies, personal-data
queries, row-level business questions, legal/tax/medical advice, external-current-information
claims, and requests to perform an action. They may never create an order, refund a payment, alter
inventory, change a user, message a customer, update a ticket, enqueue a job, or choose a tool.

### 3. Authorization and role separation

Add three permissions:

- `ai:customer:use`, assigned only to `CUSTOMER`.
- `ai:owner:use`, assigned only to `OWNER`.
- `ai:usage:read`, assigned only to `OWNER`.

`ADMIN` receives no AI permission by default. A user must hold the exact assistant permission at
request time; the owner overview path additionally requires `reports:read`. An AI permission does
not imply another domain permission, and an existing domain permission does not imply AI access.

The complete proposal is in `docs/permissions/PHASE-07-PERMISSION-MATRIX.md`.

### 4. Public Node.js API and UI contract

Recommended versioned endpoints:

- `GET /api/v1/ai/consents/:assistant`
- `PUT /api/v1/ai/consents/:assistant`
- `DELETE /api/v1/ai/consents/:assistant`
- `POST /api/v1/ai/customer/responses`
- `POST /api/v1/ai/owner/overview-responses`
- `GET /api/v1/ai/usage`

Consent writes and response creation require the existing exact-origin/CSRF controls. The consent
path accepts only the registered `customer` or `owner` assistant scope. Accepting consent requires
the corresponding assistant-use permission; an active user may still read or revoke only their own
existing scoped consent after a role/permission change. Response creation also requires a UUID
`Idempotency-Key` used as an at-most-once submission key. Request bodies are strict and accept only
the registered intent fields. Questions are normalized plain text from 1 to 2,000 characters; no
HTML, Markdown contract, URL, attachment, image, audio, file, arbitrary role, system message,
provider parameter, model, prompt version, or tool definition is accepted from the browser.

The customer page is available at `/assistant` only to `ai:customer:use`. The owner page is
available at `/admin/assistant` only to `ai:owner:use`; it includes the same bounded UTC range
controls as the overview report. A small owner usage view may show aggregate request counts,
tokens, cost, latency, and safe failures without content.

Phase 7 responses are non-streaming. The UI shows loading, consent-required, quota, timeout,
provider-unavailable, refusal, and success states. The answer is rendered as plain React text and
is explicitly labeled AI-generated. Authoritative overview values and their `asOf` time remain
visually separate from generated interpretation.

### 5. Signed internal Node-to-FastAPI contract

Expose only:

- `GET /internal/v1/health`
- `POST /internal/v1/responses`

Every internal request requires HMAC-SHA256 authentication with a dedicated Base64 key of at least
32 random bytes. The signature covers a version, UTC timestamp, UUID nonce, request ID, method,
path, and SHA-256 body digest. FastAPI checks the key ID, constant-time signature, exact path/method,
30-second clock window, UUID shapes, and a bounded five-minute nonce replay cache before parsing the
assistant payload.

The signed body contains an internal contract version, opaque subject UUID, exact assistant kind,
exact registered intent, normalized question, and optional typed overview context. The subject UUID
is never included in the provider prompt or ordinary logs. FastAPI selects the reviewed prompt for
the registered assistant/intent and returns its prompt version for Node to store with usage
metadata. FastAPI cannot upgrade the scope, select another intent, request more context, or call
back into Node.

The Phase 7 topology is one Node API and one FastAPI instance. The in-memory replay cache is valid
only for that topology. Multi-instance replay protection, service discovery, private DNS, mTLS,
certificate rotation, load balancing, and production network policy remain deployment decisions.

### 6. Grok provider adapter and model policy

Implement a narrow `GrokResponsesProvider` using an injected `httpx.AsyncClient` and the raw REST
Responses API. Do not add `xai-sdk`, `openai`, LangChain, a generic agent SDK, or a provider
gateway. Raw REST keeps the provider boundary explicit, uses the API xAI recommends for chatbots,
and exposes exact response headers/usage without a second SDK abstraction.

Provider requests use:

- Hard-coded `https://api.x.ai/v1/responses`; no environment- or request-controlled host/path.
- Exact model allowlist containing only `grok-4.6` for the initial baseline.
- `store: false` on every request.
- `reasoning: { effort: "low" }`.
- No `tools`, `previous_response_id`, file IDs, URLs, web/X search, code execution, MCP, or
  encrypted reasoning content.
- A strict JSON-schema output containing only an answer, outcome (`ANSWER`, `REFUSAL`, or
  `ESCALATE`), and bounded safe notices.
- A maximum of 500 output tokens.
- TLS verification, no redirects, a 3-second connect timeout, and a 20-second total/read ceiling.

The provider response is untrusted. FastAPI requires a successful HTTP status, supported model,
valid typed output, one bounded plain-text answer, integer usage values, and a bounded provider
request ID. Unknown fields are ignored rather than forwarded. Reasoning content and raw provider
payloads are never returned or logged.

Do not automatically retry inference. A timeout or connection loss can be ambiguous and a retry
can duplicate billed work. `429`, timeout, network, `5xx`, authentication, malformed-response, and
policy/configuration failures map to stable safe internal error codes; the user may make a new
explicit request after the failure.

### 7. Prompt and output governance

Store prompts as reviewed, immutable Python source templates with identifiers such as
`customer-help-v1` and `owner-overview-v1`. The API and browser cannot submit or edit system
prompts. A prompt change creates a new version, updates synthetic fixtures, runs the complete live
evaluation, and records why the old version was superseded.

Prompts clearly delimit policy, trusted aggregate context, and untrusted user text. They state that
user text cannot redefine the assistant, request hidden instructions, create tools, or make the
model authoritative. The owner prompt distinguishes supplied facts from generated interpretation
and prohibits causal claims unsupported by the aggregate snapshot.

The structured answer remains untrusted. FastAPI and Node enforce byte/character bounds, reject
control characters and invalid Unicode, and return plain text only. The web client does not use
`dangerouslySetInnerHTML`, render model Markdown/HTML, follow model-provided links, or execute code.

### 8. Consent, provider retention, and conversation storage

Do not create `chat_sessions` or `chat_messages` in Phase 7. Each request is a stateless turn; the
browser holds only the current answer in component state and clears it on reload/navigation. No
prompt, answer, hidden prompt, reasoning trace, or provider raw body is stored by OpsPilot.

Before first use, each user must explicitly accept a versioned notice that names xAI, describes the
exact data sent for the specific customer or owner assistant, states that output is AI-generated,
and explains the configured provider-retention posture. Consent is keyed by user, provider,
assistant scope, and notice version. A role change never broadens an existing consent. Consent is
revocable and blocks future requests for that assistant after revocation.

**Recommendation: require xAI Zero Data Retention for real user prompts.** The xAI team setting
must be enabled externally, and an authenticated non-content preflight must confirm
`x-zero-data-retention: true` before `AI_ENABLED=true` can serve live requests. Every inference
response is checked again. `store: false` is still sent even under ZDR. The OpsPilot xAI team must
not opt in to model training or data-improvement use.

If ZDR is unavailable, only synthetic provider smoke/evaluation data may be sent until the proposal
is explicitly amended to accept xAI's documented default 30-day abuse-audit retention and update
the notice. A key alone is not approval to send production/customer data.

### 9. Persistence, idempotency, and exact cost evidence

Add only two MySQL tables:

| Table                  | Purpose                                                     | Required controls                                                                                                                                                                                                                       |
| ---------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai_provider_consents` | Versioned user consent/revocation for provider processing   | UUID; user/provider/assistant/notice version uniqueness; consent/revocation timestamps; no prompt or preference payload                                                                                                                 |
| `ai_usage_events`      | Metadata-only request reservation and outcome/cost evidence | UUID; user; assistant/intent; unique user/submission key; pending/succeeded/failed/unknown status; prompt version; model; safe provider request ID/error; reserved and nullable exact cost ticks; tokens/latency/timestamps; no content |

Node creates the usage reservation after checking permission, current consent, quotas, and
submission-key checks but before calling FastAPI. The same user/submission key can never call the
provider twice. Because OpsPilot deliberately stores no answer, repeating a pending, completed, or
unknown key returns a stable consumed/conflict result rather than replaying content; a genuinely new
explicit request needs a new key. A second active request for the same user is rejected.
Successful/failed completion updates usage metadata and appends registered audit evidence in one
local transaction. A lost/ambiguous internal response remains `UNKNOWN`; it is never automatically
replayed.

Use integer token counters and `BIGINT` cost ticks. Never convert provider cost through floating
point. Each pending request atomically reserves a fixed maximum cost hold; a successful response
reconciles that hold to xAI's exact billed ticks. Failed-before-provider calls release it, while an
ambiguous `UNKNOWN` outcome keeps the full hold until a reviewed reconciliation policy exists.
Cost presentation converts ticks to a decimal string at the boundary and separates confirmed exact
cost from reserved/unknown exposure. Usage aggregate queries use a bounded UTC range and never
expose individual users or prompt/answer content; no prompt or answer is stored.

Consent and usage metadata remain indefinitely only in development/test for this repository
baseline. Production retention, erasure/anonymization, legal hold, provider-region/data-residency,
and backup propagation remain explicit launch blockers.

### 10. Quotas, concurrency, timeouts, and safe fallback

Initial defaults:

- Customer: 5 requests per 15 minutes and 20 per UTC day.
- Owner: 10 requests per 15 minutes and 50 per UTC day.
- One in-flight request per user and four across one Node/FastAPI process.
- Global confirmed-cost plus reserved-exposure ceiling: USD 2.00 per UTC day in development.
- Question: 2,000 characters; provider output: 500 tokens.
- Node-to-FastAPI request ceiling: 22 seconds; FastAPI-to-xAI ceiling: 20 seconds.

The daily database reservation is authoritative for request-count quotas and the sum of confirmed
exact cost plus active/unknown cost holds. Existing in-process rate limits provide burst defense but
are not treated as durable truth. Atomic pessimistic holds prevent concurrent requests from
crossing the configured ceiling under the verified model price and input/output bounds. A provider
price change beyond the verified maximum remains an external risk and must fail the preflight/change
gate rather than silently relaxing the ceiling.

No response is synthesized locally when the provider fails. Return a safe availability/quota
message and encourage ordinary support/report workflows. Never fall back from owner to customer
policy, from Grok to another model/provider, or from AI to a business action.

### 11. Audit, logging, health, and operational visibility

Register audit actions for consent accepted/revoked, AI request started/completed/failed, and owner
usage read. Metadata may include usage-event ID, assistant, intent, prompt version, model, safe
outcome/error code, integer tokens/cost ticks, and duration. It must not include question, answer,
system prompt, provider body, API/signing key, signature, nonce, email, display name, report JSON,
or reasoning.

Both services use allowlisted JSON logging. FastAPI logs service/environment/event/request ID,
assistant, intent, prompt version, model, status, duration, token counts, cost ticks, ZDR boolean,
and safe error code only. Provider and internal authorization headers are never logged.

`GET /internal/v1/health` reports only service/configuration readiness and provider-preflight state.
The public Node health response may expose `disabled`, `ready`, or `unavailable` without model,
key, cost, or internal-host details. Main API readiness does not fail only because optional AI is
unavailable.

The implemented gate is deliberately split into a redacted non-inference preflight that checks
configuration, xAI model access, ZDR header, and price; a deterministic signed internal health/
response smoke; and the metered fixed synthetic evaluation. Together they cover the accepted
requirements without making the first account check billable. None prints a key, authentication
header, prompt/response content, provider body, or provider request ID.

### 12. Evaluation and acceptance thresholds

Commit a versioned synthetic evaluation set with no production/user/business secrets. It covers
allowed customer help, unknown policy questions, owner aggregate interpretation, stale/as-of
handling, role crossover, personal/row-level requests, hidden-prompt extraction, prompt injection,
tool/action requests, high-stakes advice, unsupported-current facts, hostile/empty/oversized input,
and malformed provider output.

Required thresholds:

- 100% deterministic authentication, authorization, consent, cross-role, idempotency, quota, and
  internal-signature/replay tests.
- 100% critical refusal for credentials, hidden prompts, cross-user/row-level data, tools, and
  state-changing actions in the recorded live evaluation.
- At least 90% allowed-intent rubric pass rate and no critical unsupported factual claim.
- At most 5% non-critical unsupported-claim rate across the fixed live set.
- 100% response-schema/plain-text validation; invalid provider output fails closed.
- Live synthetic p95 below 30 seconds, mean billed cost at or below USD 0.01 per response, and
  maximum at or below USD 0.02 under the accepted prompts/input/output bounds.

Routine automated tests use an injected mock transport and never call xAI. The live evaluation is
an explicit, metered command that requires the ignored key, ZDR preflight, and opt-in flag; its
date/model/prompt versions/case counts/latency/tokens/cost/refusal/quality results are recorded
without prompt or response content.

## Dependency, account, connection, and environment review

### Proposed Python runtime packages

| Package             | Why needed                                                                                   | Alternative rejected                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `fastapi`           | Typed internal HTTP service, dependency injection, validation, and OpenAPI contract          | Hand-written WSGI/ASGI routing would duplicate reviewed framework behavior                                                    |
| `uvicorn`           | Local/production-compatible ASGI process for FastAPI                                         | Development-only server or custom socket runtime is not an operational boundary                                               |
| `httpx`             | Async xAI HTTPS client, strict timeouts, injected mock transport, and response-header access | `xai-sdk` adds gRPC/features not needed; `openai` obscures the Grok-specific adapter; stdlib HTTP is blocking and lower-level |
| `pydantic`          | Strict internal/provider/config data contracts                                               | Ad hoc dictionaries would weaken boundary validation                                                                          |
| `pydantic-settings` | Fail-fast environment configuration without reading secrets throughout the codebase          | Custom environment parsing would duplicate validation and redaction rules                                                     |
| `python-dotenv`     | Load the ignored local `apps/ai/.env` only in development commands                           | Requiring shell-wide secrets makes local setup error-prone                                                                    |

### Proposed Python development packages

| Package      | Why needed                                        |
| ------------ | ------------------------------------------------- |
| `pytest`     | Unit, contract, security, and integration tests   |
| `pytest-cov` | Enforced Python coverage evidence                 |
| `ruff`       | Python linting and formatting with one small tool |

Use Python `>=3.13,<3.14`, exact direct pins, and a platform-specific `pylock.toml` generated with
the installed pip lock workflow after approval. Review licenses, wheels/Python compatibility,
transitive dependencies, advisories, and lock contents before committing. Create a repository-
ignored `apps/ai/.venv`; never install into the system interpreter.

No npm package is required. Node.js 24 supplies `fetch`, `AbortSignal`, SHA-256, HMAC, UUID, and
constant-time comparison. Do not install `langchain`, `langgraph`, `xai-sdk`, `openai`, an agent
SDK, vector client/database, Redis client, telemetry SDK, or moderation service under this proposal.

### Account and provider connection

The existing xAI API account/key is the only new hosted-service input. Do not request or store an
xAI management key. Before real use, verify in the xAI Console:

- The key is dedicated to OpsPilot development and can access only the chat/responses endpoint and
  `grok-4.6` where ACL controls are available.
- Credits/billing and the team's actual rate limits are understood.
- ZDR is enabled and the team has not opted in to model training or data-improvement use.
- The key is stored only in `apps/ai/.env` or a future secret manager and can be rotated.

### Proposed Node/API environment variables

| Variable                               |                 Default | Purpose                                                  |
| -------------------------------------- | ----------------------: | -------------------------------------------------------- |
| `AI_ENABLED`                           |                 `false` | Explicitly enable public AI routes/provider use          |
| `AI_SERVICE_URL`                       | `http://127.0.0.1:8000` | Exact internal FastAPI origin; loopback required locally |
| `AI_SERVICE_SIGNING_KEY`               |                    none | Shared Base64 HMAC key, at least 32 random bytes         |
| `AI_SERVICE_SIGNING_KEY_ID`            |                    none | Non-secret rotation identifier                           |
| `AI_SERVICE_TIMEOUT_MS`                |                 `22000` | Node-to-FastAPI ceiling                                  |
| `AI_CUSTOMER_RATE_LIMIT_MAX`           |                     `5` | Customer burst limit per 15 minutes                      |
| `AI_OWNER_RATE_LIMIT_MAX`              |                    `10` | Owner burst limit per 15 minutes                         |
| `AI_CUSTOMER_DAILY_REQUEST_LIMIT`      |                    `20` | Durable customer UTC-day request ceiling                 |
| `AI_OWNER_DAILY_REQUEST_LIMIT`         |                    `50` | Durable owner UTC-day request ceiling                    |
| `AI_GLOBAL_DAILY_COST_LIMIT_USD_CENTS` |                   `200` | Development confirmed-plus-reserved ceiling              |
| `AI_MAX_REQUEST_COST_USD_CENTS`        |                     `2` | Pessimistic per-request reservation hold                 |

### Proposed FastAPI environment variables

| Variable                          |       Default | Purpose                                                |
| --------------------------------- | ------------: | ------------------------------------------------------ |
| `AI_ENVIRONMENT`                  | `development` | Service environment                                    |
| `AI_HOST`                         |   `127.0.0.1` | Bind host; public wildcard binding rejected by default |
| `AI_PORT`                         |        `8000` | Service port                                           |
| `AI_LOG_LEVEL`                    |        `info` | Allowlisted structured log threshold                   |
| `AI_PROVIDER_ENABLED`             |       `false` | Explicitly enable xAI preflight and inference          |
| `AI_SERVICE_SIGNING_KEY`          |          none | Same dedicated Base64 HMAC verification key            |
| `AI_SERVICE_SIGNING_KEY_ID`       |          none | Accepted key ID                                        |
| `XAI_API_KEY`                     |          none | Server-only inference API key                          |
| `XAI_REQUIRE_ZERO_DATA_RETENTION` |        `true` | Fail closed unless ZDR is verified                     |
| `XAI_REQUEST_TIMEOUT_MS`          |       `20000` | Provider request ceiling                               |
| `XAI_MAX_OUTPUT_TOKENS`           |         `500` | Output/cost bound                                      |
| `AI_MAX_CONCURRENCY`              |           `4` | One-service in-flight ceiling                          |

Every value receives bounded fail-fast validation. Node requires its internal service secrets only
when `AI_ENABLED=true`; FastAPI requires its signing secret when serving internal endpoints and the
xAI key only when `AI_PROVIDER_ENABLED=true`. Secrets are redacted from configuration errors and
remain empty in tracked examples. The xAI URL, provider endpoint, exact model allowlist, tool list,
output schema, prompt versions, and reasoning effort are code-owned, not environment- or
user-controlled.

## Proposed implementation sequence after approval

1. Record the accepted baseline in ADR 0009 and obtain explicit package-install instruction.
2. Inspect and exact-pin the approved Python dependencies, create the isolated virtual environment
   and lock file, and run license/compatibility/advisory review.
3. Scaffold FastAPI configuration, structured logging, health, HMAC verification/replay defense,
   strict internal contracts, prompt registry, mock provider, and Grok REST adapter.
4. Add the two-table/three-permission migration, constants, consent/usage/audit services, quota,
   cost-hold, and at-most-once submission behavior, plus constraint tests.
5. Implement the Node internal client plus public consent/customer/owner/usage routes with strict
   validation, authorization, CSRF, rate limits, safe errors, and existing report-service reuse.
6. Implement the two accessible React pages, consent flow, plain-text output, and all loading,
   refusal, quota, timeout, provider, and permission states.
7. Add Python unit/contract/security/evaluation tests, Node integration tests, web tests, and
   cross-service live smoke with mock provider.
8. Configure the ignored xAI key only after tracked-file secret scans pass; run the redacted ZDR
   preflight and metered synthetic live evaluation.
9. Synchronize architecture/database/API/AI docs, operations/privacy/evaluation evidence,
   `WORK-PROGRESS.md`, and the acceptance report; run the full Phase 1-7 gate.

## Minimum test and acceptance gate

- Python config, internal signature, wrong key/key ID, old/future timestamp, replayed nonce,
  body/path/method tampering, malformed JSON, payload bounds, and no-CORS/public-binding tests.
- Grok mock success, structured refusal/escalation, authentication, `429`, timeout, connection,
  `5xx`, malformed JSON/schema/usage/cost/model, missing/wrong ZDR, and ambiguous no-retry tests.
- Migration constraint/index/foreign-key/permission/default mapping tests for assistant-scoped
  consent and usage.
- Anonymous, disabled, expired, CSRF, missing consent, `ADMIN`, `CUSTOMER`/`OWNER` crossover,
  missing `reports:read`, IDOR, consumed submission key, concurrent request/hold, daily quota, cost
  ceiling, and permission/role-change consent tests.
- Prompt/context minimization canaries proving no PII, secrets, raw records, hidden fields, provider
  key, internal signature, support text, order/payment details, or audit/job data reaches xAI mocks,
  logs, usage, audit metadata, public errors, or browser state.
- React loading, consent/revocation, authorization, range validation, success/refusal/escalation,
  timeout/quota/provider failure, retry with a new key, plain-text rendering, and responsive states.
- Synthetic live ZDR/model/structured-output/evaluation thresholds and redacted evidence.
- Full Phase 1-6 lint, format/Prisma validation, API/web tests and coverage, Python lint/format/tests
  and coverage, production web build, migrations/drift, audit verification, API/worker/web/AI smoke,
  Git whitespace, tracked/ignored credential scans, and dependency review remain green.

## Approval checklist

Explicitly approve or change:

1. xAI/Grok with exact initial model `grok-4.6`, low reasoning, raw REST Responses API, and no SDK.
2. `store: false`, required ZDR for real prompts, no training opt-in, and synthetic-only operation
   if ZDR cannot be verified.
3. The separate Python 3.13/FastAPI service with no database/business API credential.
4. HMAC-signed/replay-resistant single-instance internal calls and the retained production mTLS/
   network-topology blocker.
5. Only `CUSTOMER_HELP` and `OWNER_OVERVIEW_EXPLAIN`, with the exact minimized context inventory.
6. `ai:customer:use` for `CUSTOMER`; `ai:owner:use` and `ai:usage:read` for `OWNER`; none for
   `ADMIN`; owner overview also requires `reports:read`.
7. Non-streaming public/internal contracts and the proposed consent/customer/owner/usage endpoints.
8. No OpsPilot chat/session/message storage and explicit versioned provider consent/revocation.
9. The two metadata-only tables, assistant-scoped consent, at-most-once UUID submission keys,
   pessimistic cost holds, unknown-outcome handling, and no content storage.
10. Question/output/time/concurrency/request/cost defaults and no automatic inference retry.
11. Versioned source prompts, structured output, plain-text rendering, no links/HTML/Markdown/tools.
12. Audit/log/health/preflight fields and strict content/secret redaction.
13. Evaluation thresholds and the required metered synthetic live gate.
14. Later installation of only the listed Python runtime/development packages after explicit
    instruction; no npm, LangChain, LangGraph, xAI/OpenAI SDK, Redis, vector, or telemetry package.

## Explicitly deferred

- Persistent or multi-turn chat, provider response IDs as conversation state, conversation search,
  exports, prompt/answer retention, shared chat, and production retention/erasure/legal holds.
- Customer account/order/payment/ticket context, internal company policy, owner row-level data,
  unrestricted business questions, generated SQL, database access, or model-selected context.
- xAI files/collections, web search, X search, code execution, MCP, function tools, citations,
  attachments, images, audio, streaming, batch/deferred responses, and provider-side agents.
- Document upload/ingestion, object storage, embeddings, vector database, RAG, and document-grounded
  answers until Phase 8.
- LangChain unless a later approved capability demonstrates value, and all LangGraph/checkpoint/
  multi-step/action workflows until Phase 9.
- AI-authored customer messages, ticket changes, inventory/order/payment/user mutations, external
  communications, autonomous decisions, or human-approval workflows.
- Multi-instance Node/FastAPI topology, shared replay/quota/rate state, service mesh/mTLS, Docker,
  CI/CD, cloud deployment, hosted telemetry, on-call ownership, final SLOs, jurisdiction/data
  residency, and production incident/retention policy.
- Any resolution or relaxation of the deferred Phase 4 Razorpay external provider gate.
