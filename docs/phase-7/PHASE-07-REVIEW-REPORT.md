# Phase 7 Review and Acceptance Report

## Result

**PASS — accepted and complete for the repository/development scope on 2026-09-04.** ADRs 0009
and 0010's isolated FastAPI/Groq adapter, signed Node boundary, two stateless assistants, scoped
consent, metadata-only
usage/cost evidence, permissions, quotas, safe UI, and deterministic evaluation harness are
implemented.

On 2026-09-04 the user authorized using the existing Groq key, confirmed Global ZDR in Data
Controls, and requested enablement. The redacted application preflight, paced 20-case metered
evaluation, and signed live service smoke all pass. The development flags are enabled and both
loopback services report ready. After reviewing the completion condition, the user instructed that
the completed phase be marked complete and committed; this records explicit Phase 7 acceptance.
Broader manual account/privacy/operations review and production approval remain open and are not
implied by this acceptance.

## Scope delivered

- Separate Python 3.13/FastAPI service with strict environment validation, loopback-only host,
  disabled docs/CORS, safe JSON logging, HMAC/replay verification, registered contracts/prompts,
  bounded concurrency, and a raw REST Groq provider.
- Fixed Groq Chat Completions endpoint with `openai/gpt-oss-120b`, low reasoning effort with
  reasoning excluded from responses, operator-confirmed ZDR, strict structured output, no
  tools/citations, hard time/token/body bounds, exact calculated cost ticks, and no automatic
  inference retry.
- Additive foundation and provider migrations deployed to development and test; historical xAI
  usage is retained and its consent is not reused for Groq.
- Node consent, customer help, owner aggregate-overview explanation, and aggregate usage endpoints
  with session/RBAC/CSRF/rate/idempotency/quota/cost/audit enforcement.
- Customer `/assistant` and owner `/admin/assistant` flows with explicit notices, plain-text output,
  safe failures, permission-gated navigation, and authoritative/generated data separation.
- Redacted non-inference provider preflight, versioned 20-case synthetic evaluation runner, and
  real loopback Node-to-FastAPI mock-provider smoke.
- Implementation, API/database/architecture, permission, threat, evaluation, and operations
  documentation.

## Acceptance criteria review

| Criterion | Evidence | Result |
|---|---|---|
| Browser cannot call AI/provider directly | No FastAPI URL in web API; no CORS/docs; Node-only routes; loopback config validation | Pass |
| Internal requests fail closed | Canonical HMAC, key ID, timestamp, nonce/replay, body digest and strict-contract tests | Pass |
| Node establishes identity/scope/context | Session/RBAC, assistant-specific routes, owner report permission, typed server-loaded context | Pass |
| Customer/owner data boundaries do not cross | Separate permissions/prompts/routes; admin/customer/owner negative and canary tests | Pass |
| Consent is explicit, scoped, and revocable | Versioned user/provider/assistant persistence; CSRF writes; revoke after permission removal | Pass |
| Provider errors/timeouts are safe | Stable public errors, no raw provider data, no automatic retry, failed/unknown cost semantics | Pass |
| Output is untrusted and cannot act | Strict schema/plain text, no markup/links/tools, React escaping, no action integration | Pass |
| Quota/idempotency/cost are durable | User lock, unique submission key, UTC daily count, serialized holds, exact cost and overrun suppression | Pass |
| No conversation content is retained | Schema/code/log/audit projections and canary tests; no chat tables | Pass |
| Baseline quality/safety/latency/cost meets live thresholds | Paced 20-case run: all thresholds pass | Pass |
| Provider ZDR/model/price readiness verified | Global ZDR confirmed; redacted application preflight passes | Pass |

Every Phase 7 acceptance criterion passes. Production privacy, network, and operations approval is
a separate rollout gate and remains pending.

## Final automated gate

- ESLint, Prettier, Prisma validation, Ruff lint/format, and `pip check`: pass.
- API regression: 30 files / 145 tests pass.
- Web regression: 6 files / 43 tests pass.
- Python regression: 97 pass on the 2026-09-04 rerun; one routine opt-in cross-service skip; 2
  upstream deprecation warnings.
- API coverage: 84.58% statements, 73.76% branches, 93.31% functions, 88.15% lines.
- Web coverage: 83.60% statements, 73.61% branches, 82.73% functions, 86.10% lines.
- Python coverage: 88.36% with an enforced 80% minimum.
- Explicit signed Node-to-FastAPI real HTTP smoke: 1 pass in 0.68 seconds on the 2026-09-04 rerun
  using a deterministic provider; no Groq call.
- Production web build: 104 modules; 395.60 kB JavaScript (112.29 kB gzip); 28.23 kB CSS
  (6.26 kB gzip).
- Development/test migration status: all 11 migrations current; both schema diffs report no
  difference.
- Redacted Groq credential/model-access check: pass; no inference and no secret emitted.
- Paced live Groq evaluation: 20/20 schema and rubric passes, p95 1,459 ms, mean USD 0.0001326525,
  maximum USD 0.0001993500, zero unsupported-claim indicators, and no content/secret evidence.
- Signed live Node-to-FastAPI-to-Groq smoke: ready health, valid answer outcome, and ZDR true.
- Audit verification: valid over 105 development events and empty cleaned test state.
- Python lock review: no broken requirements; no OSV match in 27 inspected non-pip packages;
  permissive license review with two documented metadata gaps.

Detailed deterministic and live evidence is in `PHASE-07-EVALUATION-EVIDENCE.md`.

## Decisions and rationale

- Node remains the only public authorization and business-data authority. FastAPI receives one
  already-authorized minimal request and has no database/business credentials or callback tools.
- Public customer facts and the existing aggregate owner report provide useful initial behavior
  without opening personal/row-level data, retrieval, or arbitrary querying.
- HMAC plus loopback provides a bounded development topology. It is not represented as a production
  substitute for private TLS/mTLS and shared replay state.
- At-most-once submission protects against duplicate cost. Because answers are deliberately not
  stored, a consumed key conflicts instead of replaying content.
- Integer exact cost ticks and pessimistic holds avoid floating-point billing decisions and retain
  exposure when a timeout could already have been billed.
- The accepted operational gate is split into a non-inference provider preflight, deterministic
  signed HTTP smoke, and explicit metered live evaluation. This prevents surprise preflight billing
  while still requiring real inference evidence before acceptance.
- No automatic purge was invented without retention, erasure, legal-hold, audit, and backup policy.

## Retained risks and blockers

- The Groq key, fixed model, Global ZDR, application preflight, and fixed live evaluation are valid.
  The observed free-plan 8K-token/minute limit requires evaluation pacing; credits, project/model
  permissions, billing controls, no-training/account settings, and price review cadence still need
  production-owner review.
- Model output is probabilistic. The live fixed set passes, but ongoing quality review and safe
  failure monitoring remain necessary.
- User-entered questions can still contain personal or sensitive data despite the warning. Final
  notice/legal basis, controller/processor responsibilities, DPA/subprocessors, jurisdiction,
  region/data residency, complaints/corrections, and incident ownership remain unresolved.
- Consent, usage metadata, and audit/backup evidence have no approved production retention,
  erasure/anonymization, legal-hold, or deletion-propagation policy.
- HMAC nonce, concurrency, and burst state are per process. Production requires private TLS/mTLS,
  network policy, service discovery/supervision, shared rate/quota/replay design, monitoring/alerts,
  SLO/capacity, and rollback ownership.
- A timeout/connection loss can leave `UNKNOWN` reserved exposure without provider reconciliation.
  The safe baseline never retries or releases it automatically.
- Groq can update behavior behind a model name. Prompt/model/endpoint/price changes require a fresh
  reviewed evaluation and rollback plan.
- The existing npm dependency advisories and the independent Phase 4 Razorpay external
  delivery/recovery gate remain unresolved. Phase 7 did not change either gate.

## Transition

Development `AI_ENABLED=true`, `AI_PROVIDER_ENABLED=true`, and the ZDR attestation are active only
in ignored local environments. Keep FastAPI loopback-only and monitor safe failures/usage. Phase 7
is accepted and complete; no Phase 8 work is authorized by this transition. Complete the remaining
manual account/privacy/operations review and obtain explicit production approval before any
production rollout.
