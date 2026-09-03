# Phase 7 Review Report

## Result

**PASS — repository implementation complete and verified on 2026-09-03.** ADR 0009's isolated
FastAPI/Grok adapter, signed Node boundary, two stateless assistants, scoped consent, metadata-only
usage/cost evidence, permissions, quotas, safe UI, and deterministic evaluation harness are
implemented.

**PHASE ACCEPTANCE IS PENDING.** No real xAI call was made because ignored provider configuration
is absent. The required ZDR/model/price preflight, 20-case metered live evaluation, manual
account/privacy checks, and explicit acceptance remain open. This report is not production or
real-user rollout approval.

## Scope delivered

- Separate Python 3.13/FastAPI service with strict environment validation, loopback-only host,
  disabled docs/CORS, safe JSON logging, HMAC/replay verification, registered contracts/prompts,
  bounded concurrency, and a raw REST Grok provider.
- Fixed xAI Responses endpoint/model with low reasoning, `store: false`, required ZDR, structured
  output, no tools/search/files/reasoning export, hard time/token/body bounds, exact cost ticks, and
  no automatic inference retry.
- Additive two-table/three-permission migration deployed to development and test.
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
| Baseline quality/safety/latency/cost meets live thresholds | Harness exists; real provider run unavailable | Pending |
| Provider ZDR/model/price/account posture verified | Redacted preflight exists; ignored provider environment absent | Pending |
| Production privacy/network/operations approved | Explicit blockers retained | Pending |

## Final automated gate

- ESLint, Prettier, Prisma validation, Ruff lint/format, and `pip check`: pass.
- API regression: 30 files / 145 tests pass.
- Web regression: 6 files / 43 tests pass.
- Python regression: 74 pass; one routine opt-in cross-service skip; 2 upstream deprecation
  warnings.
- API coverage: 84.58% statements, 73.76% branches, 93.31% functions, 88.15% lines.
- Web coverage: 83.60% statements, 73.61% branches, 82.73% functions, 86.10% lines.
- Python coverage: 86.18% with an enforced 80% minimum.
- Explicit signed Node-to-FastAPI real HTTP smoke: 1 pass in 0.57 seconds using a deterministic
  provider; no xAI call.
- Production web build: 104 modules; 395.58 kB JavaScript (112.30 kB gzip); 28.23 kB CSS
  (6.26 kB gzip).
- Development/test migration status: all 10 migrations current; schema diff reports no difference
  for either database.
- Audit verification: valid over 34 development events and empty cleaned test state.
- Python lock review: no broken requirements; no OSV match in 27 inspected non-pip packages;
  permissive license review with two documented metadata gaps.

Detailed deterministic and pending live evidence is in `PHASE-07-EVALUATION-EVIDENCE.md`.

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

- The xAI key's actual model/endpoint ACL, credits, rate tier, ZDR team setting, no-training setting,
  connectivity, current price, and real response behavior are unverified.
- Model output is probabilistic. The deterministic tests prove boundaries, not live answer quality;
  all live thresholds and human review remain required.
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
- xAI can update behavior behind a model name. Prompt/model/endpoint/price changes require a fresh
  reviewed evaluation and rollback plan.
- The existing npm dependency advisories and the independent Phase 4 Razorpay external
  delivery/recovery gate remain unresolved. Phase 7 did not change either gate.

## Transition

Keep `AI_ENABLED=false`. Configure the provider key only in ignored `apps/ai/.env`, complete the
manual account/privacy review, run the redacted preflight, then run and record the metered 20-case
evaluation. Request explicit Phase 7 acceptance only if every threshold passes. Do not start Phase
8, enable real-user prompts, or expose FastAPI beyond loopback without separate authorization.
