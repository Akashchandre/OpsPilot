# Work Progress

**Last updated:** 2026-09-06

## Current Phase

Phase 9 — LangGraph Business AI and AI Support (accepted and complete for repository/development
on 2026-09-06; production remains unapproved)

## Status

PHASE 9 ACCEPTED AND COMPLETE — REPOSITORY/DEVELOPMENT SCOPE

## Completed

- Phase 1 foundation implementation, review, and explicit acceptance.
- React/Vite and Express/Prisma/MySQL workspace foundation with validated configuration, versioned health API, centralized errors, tests, coverage, build, migrations, and live readiness checks.
- Phase 2 authentication/RBAC requirements, dependency review, ADR, permission matrix, and threat model.
- Phase 2 users, roles, permissions, assignments, opaque sessions, and security-event schema plus seeded migration.
- Argon2id registration/login, account lock windows, session lifecycle, logout, trusted-origin checks, CSRF, and per-process authentication rate limits.
- Deny-by-default authentication/permission middleware plus owner/admin and last-active-owner safeguards.
- Authorized user listing/retrieval, status management, role assignment/removal, and role/permission discovery APIs.
- Interactive one-time owner bootstrap without password arguments or password environment variables.
- React Router registration, login, session restoration, dashboard, access-denied, and user-administration UI.
- Phase 2 API/UI guide, acceptance report, security documentation, and synchronized architecture/schema/contracts.
- Phase 2 gate rerun: lint, formatting, Prisma validation, development/test migration status, 20 API tests, 8 web tests, enforced coverage, and production build passed.
- Phase 2 explicitly accepted and Phase 3 authorized on 2026-08-25.
- Phase 3 business rules approved and recorded in ADR 0004 with `INR` as the single-business currency.
- Phase 3 permission matrix and threat model accepted for implementation.
- Migration-controlled products, categories, assignments, aggregate inventory balances, immutable adjustments, database constraints, and four permissions implemented and deployed to development/test databases.
- Public active catalog and product details implemented with bounded allowlisted query behavior and boolean-only availability.
- Protected product/category management implemented with normalized uniqueness, lifecycle rules, CSRF, permissions, and optimistic versions.
- Protected exact inventory, threshold maintenance, and atomic balance-plus-ledger adjustments implemented with concurrency and nonnegative-stock safeguards.
- Responsive public products, product detail, protected catalog management, and protected inventory UI implemented.
- Phase 3 API/UI implementation guide plus synchronized architecture, database, API, permission, security, and phase documentation created.
- Phase 3 verification currently passes 34 API tests and 13 web tests with all configured coverage gates.
- Resolved the local owner-login database pool failure by allowing MySQL `caching_sha2_password` public-key retrieval only for loopback hosts; remote hosts remain deny-by-default.
- Phase 3 UI behavior validated by the user and the phase explicitly accepted on 2026-08-26.
- Phase 4 explicitly authorized to start on 2026-08-26, with Razorpay selected as the payment
  provider and Test Mode credentials available outside version control.
- Phase 4 repository flow, existing commerce boundaries, configuration, tests, and current official
  Razorpay Standard Checkout/order/webhook/refund guidance reviewed.
- Phase 4 decision proposal, proposed permission matrix, and payment threat model drafted for
  explicit approval before schema or application changes.
- Complete Phase 4 proposal explicitly approved on 2026-08-26; ADR 0005 records the accepted cart,
  checkout, order, reservation, Razorpay Test Mode, webhook, refund, reconciliation, and permission
  baseline.
- Phase 4 Prisma schema and migration implement carts, immutable orders/items, inventory
  reservations/status history, payment intents/attempts, refunds, webhook evidence, five
  permissions, database checks, relationships, indexes, and idempotency constraints.
- Authenticated cart, serializable checkout, opportunistic expiry, customer order/payment recovery,
  operator fulfillment/cancellation, full refund, reconciliation, raw verified webhooks, and the
  native Razorpay adapter are implemented without a new dependency.
- Responsive customer cart/checkout/order pages and permission-gated operator order management are
  implemented; all provider credential entry remains inside Razorpay-hosted Checkout.
- Phase 4 implementation guide, Test Mode operations runbook, permission matrix, threat model, ADR,
  synchronized architecture/database/API docs, and review report are complete.
- Phase 4 repository gate passes lint, formatting/schema validation, 53 API tests, 24 web tests,
  both coverage thresholds, production build, development/test migration status, local API/web
  smoke, Git whitespace, and workspace secret-literal scans.
- The local Razorpay configuration issue was rechecked without exposing values: the ignored API
  environment exists, but provider enablement, Test Mode keys, and webhook secret are unset; a
  public HTTPS webhook and automatic-capture confirmation are also not recorded.
- The pre-commit staged-content scan found a real-looking Razorpay Test Mode key pair and webhook
  endpoint in the tracked API example. The values were removed before commit, both example files
  now use disabled/empty placeholders, and the staged tree rescans cleanly.
- ADR 0006 records the user's explicit direction on 2026-08-27 to defer the unresolved external
  Razorpay smoke and start Phase 5 decision-definition work without accepting Phase 4 or enabling
  live payments.
- The Phase 5 decision proposal, proposed permission matrix, and proposed threat model define a
  dependency-free support/report/audit/hardening baseline for review.
- Phase 4 and its documented Phase 5 transition were committed as `2e5d009` after lint, 53 API
  tests, 24 web tests, coverage, formatting/schema validation, build, whitespace, and corrected
  staged-secret checks passed.
- The user explicitly authorized Phase 5 implementation on 2026-08-27; ADR 0007 accepts the full
  support, reporting, audit, hardening, permission, dependency, retention, and test baseline.
- Migration `20260827060000_phase_5_support_audit_foundation` adds versioned/idempotent support
  tickets, immutable messages/events, an audit chain head/event foundation, four permissions, and
  database constraints/indexes without a new dependency.
- The additive Phase 5 migration is deployed to development and test databases and the Prisma
  client is regenerated. A too-long initial compound-index name caused a development migration
  failure; only one empty Phase 5 table and its new permission mappings existed, they were verified
  and removed, the failed record was marked rolled back, and the corrected migration reapplied.
- Two Phase 5 foundation integration tests pass for role mappings, owner-only audit access, chain
  initialization, support persistence, and scoped message idempotency.
- Base64 audit-key and stable key-ID configuration now fails closed outside routine tests. Tracked
  examples remain empty, routine tests use an isolated test-only key, and the ignored development
  environment has a newly generated 32-byte local key without exposing it.
- The Phase 5 audit service validates a registered action/target/metadata contract, locks the
  singleton chain head, appends a canonical HMAC-SHA256 event and advances the head atomically, and
  verifies sequence, previous-hash, event-HMAC, key-ID, and head continuity.
- Additive migration `20260828060000_phase_5_audit_actor_restrict` prevents user deletion from
  rewriting a hashed audit actor ID to null; account erasure remains deferred to the accepted
  retention/anonymization decision boundary.
- `GET /api/v1/audit-events` now enforces owner-only `audit:read`, strict bounded UTC/filter/
  pagination validation, newest-first safe projections, and exactly one post-query access event.
  No audit mutation or public verification route exists.
- Focused audit tests cover canonicalization, concurrency, rollback, metadata rejection, mutation,
  deletion, reordering, wrong keys, broken heads, validation, authorization, disabled sessions,
  access-event recursion safety, and absence of mutation routes.
- Ownership-safe customer and staff support APIs implement creation, list/detail, public messages,
  internal notes, customer closure, assignment, priority/status transitions, idempotency, optimistic
  versions, and strict authorization. Responsive customer and management UI routes are complete.
- `GET /api/v1/reports/overview` and `/admin/reports` implement the accepted exact-INR, strict UTC,
  default-30-day/maximum-366-day operational overview with bounded authoritative queries and empty
  breakdowns.
- Sensitive Phase 2–5 business mutations now append registered audit evidence in the same local
  transaction. Provider-side effects retain the existing pending/webhook/reconciliation recovery
  boundary, and the owner-only audit read plus offline verifier are complete.
- Allowlisted structured JSON logging, request IDs, safe public errors, exact trusted-proxy hops,
  isolated general/support/report/webhook rate controls, payload limits, and URL-encoded rejection
  are implemented and redaction-tested.
- Two report-index migrations and one measured, parameterized refund query keep all accepted local
  representative-data p95 targets below their thresholds at 100,000 orders and 25,000 tickets/
  audit events.
- A checksum-verified sanitized backup/restore exercise restored 115,450,437 bytes into the
  isolated shadow database in 44.368 seconds with matching row counts and audit head. The dump,
  target data, and representative dataset were removed afterward.
- Phase 5 architecture, schema, API, permission, threat, audit, performance, recovery, runbook, and
  acceptance documents are synchronized. No Phase 6 service, dependency, or runtime was added.
- The final gate passes lint, formatting/Prisma validation, 87 API tests, 34 web tests, both
  coverage suites, production build, eight-migration status/drift checks, live ephemeral API/web
  smoke, audit verification, whitespace checks, and tracked/ignored secret checks.
- Phase 5 was committed as `10e73ac` (`feat: complete phase 5 production backend`) with no
  remaining Phase 5 worktree changes.
- Phase 6's specification and relevant transaction/session/audit/log/rate/provider boundaries were
  reviewed together with current official MySQL queue locking and Socket.IO delivery/recovery
  behavior.
- A complete proposed MySQL transactional job/outbox, worker, persistent notification, Socket.IO
  hint, permission, security, dependency, configuration, and test baseline is documented for
  explicit approval. No Phase 6 package, schema, service, account, route, or runtime was added.
- The user approved the complete Phase 6 baseline and authorized installation of `socket.io` and
  `socket.io-client` on 2026-08-28. ADR 0008 records the accepted implementation boundary.
- Exact `socket.io@4.8.3` and `socket.io-client@4.8.3` dependencies passed license, engine, and
  compatibility review; no Redis, BullMQ, broker, hosted channel, or additional package was added.
- Migration `20260828094016_phase_6_realtime_jobs` adds durable jobs, attempts, worker heartbeats,
  recipient-owned notifications, owner-only job permissions, constraints, and queue/read indexes.
- Transactional domain enqueueing now covers reservation expiry, payment reconciliation, webhook
  processing, refunds, support activity, persistent notification materialization, and both fixed
  maintenance schedules without weakening the existing audit or provider-recovery boundaries.
- The separate worker implements atomic MySQL claiming with `FOR UPDATE SKIP LOCKED`, leases and
  renewals, bounded exponential retry with jitter, dead-letter evidence, stale-work recovery,
  graceful shutdown, heartbeats, and audited owner-only replay.
- Persistent notification APIs and responsive UI provide bounded recipient-owned reads, unread
  counts, mark-one/mark-all-read behavior, and Socket.IO refresh hints with authenticated rooms,
  origin/session revalidation, connection/rate caps, and reconnect-safe database refresh.
- The owner-only jobs API and `/admin/jobs` UI provide bounded filters, detail/attempt evidence,
  manual refresh, and explicit replay for terminal jobs; customers and non-owner operators remain
  denied by default.
- Phase 6 documentation, operations/recovery guidance, threat and permission reviews, performance
  evidence, and acceptance report are synchronized. The final regression passes 121 API tests,
  36 web tests, coverage gates, build, migrations/drift, live API/worker/web smoke, performance
  targets, audit verification, whitespace, and secret checks.
- The reported Razorpay failure was reproduced on 2026-09-02 as fail-closed local configuration:
  the ignored API environment has no provider enablement, Test Mode key pair, or webhook secret.
- Phase 4 integration hardening now enforces `rzp_test_` key IDs, adds a redacted read-only provider
  preflight, preserves ambiguous/retriable Razorpay `408` and idempotent-write `409` outcomes, and
  makes failed, incomplete, or stalled hosted Checkout script loads recoverable.
- The 2026-09-02 Phase 1–6 rerun passes lint, formatting/Prisma validation, 26 API files / 123 tests,
  5 web files / 38 tests, both coverage gates, production build, development/test nine-migration
  status and drift, both audit-chain verifiers, live API/worker/built-web smoke, and all five Phase
  6 performance targets. Test-smoke queue evidence was removed afterward.
- The local API was restarted with Razorpay enabled and remains healthy with a reachable database,
  a freshly rotated matched Test Mode key pair passes the redacted provider preflight, and an
  existing pending payment was resumed to a verified Razorpay provider order with Checkout ready.
- The expired ephemeral zrok webhook was replaced for local testing by a temporary Cloudflare Quick
  Tunnel without adding a repository dependency. Public health returned `200`, and an invalid-signature
  webhook probe reached the raw-body route and was correctly rejected with `401` without data changes.
- The 2026-09-02 Razorpay Test Mode hardening, focused tests, redacted provider preflight, and
  synchronized Phase 4/6 evidence were reviewed for pending secrets, passed 15 API tests, 5 web
  tests, lint, and whitespace checks, and were committed as `cbaf163`.
- The user explicitly authorized Phase 7 decision-definition on 2026-09-02, selected xAI/Grok as
  the provider, and confirmed that an API key exists outside the repository. No key value was read,
  requested, logged, or added to a tracked file.
- The Phase 7 specification, existing session/RBAC/report/audit/log/rate/UI boundaries, installed
  Python 3.13.7 runtime, and current official xAI Responses API, Grok 4.6, ZDR, cost, rate, and key-
  scope behavior were reviewed.
- A complete proposed stateless Grok/FastAPI, signed internal service, two-intent, three-permission,
  explicit-consent/ZDR, metadata-only usage/cost, dependency, threat, evaluation, and test baseline
  is documented for explicit approval. No AI dependency, service, provider call, schema,
  permission, route, or UI was added.
- The user's 2026-09-03 instruction to start implementation accepts the complete Phase 7 baseline
  and authorizes installation of only its documented Python packages. ADR 0009 records the exact
  boundary and reviewed direct dependency pins; no real xAI call or secret access is authorized.
- The isolated Python 3.13/FastAPI service now implements strict redacted configuration, loopback-
  only binding, signed/replay-resistant internal health and response routes, immutable two-intent
  prompts, structured plain-text output, bounded concurrency, safe logging, and the raw REST
  `grok-4.6` adapter with required ZDR, exact cost, timeout, and no-retry enforcement.
- Migration `20260903060000_phase_7_ai_foundation` adds the three accepted permissions,
  assistant-scoped versioned consent, and metadata-only usage/cost state. It is applied without
  drift to both development and test databases; no chat/content table was added.
- The Node API implements consent, customer help, owner aggregate-overview explanation, aggregate
  usage, HMAC client, strict validation, CSRF/RBAC, burst/daily/concurrency/cost gates, at-most-once
  submission, safe failed/unknown outcomes, audit evidence, and post-call authorization/consent and
  cost-overrun suppression.
- React implements permission-gated `/assistant` and `/admin/assistant` pages with explicit scoped
  consent/revocation, new UUID per explicit request, plain-text response rendering, refusal/
  escalation/error states, authoritative owner overview separation, and metadata-only usage.
- The fixed 20-case synthetic live evaluation, redacted non-inference provider preflight, and
  explicit real HTTP Node-to-FastAPI deterministic smoke are implemented. The repository gate passes
  145 API tests, 43 web tests, 78 routine Python tests with one opt-in skip, all three coverage
  thresholds, lint/format/schema/build/migration-diff/audit/dependency checks, and the explicit
  cross-service smoke.
- Phase 7 architecture, database, API, permission, threat, implementation, operations, evaluation,
  review, ADR, and progress documents were synchronized. At the 2026-09-03 repository gate, no real
  xAI request had been made and `apps/ai/.env` was absent.
- On 2026-09-04, the ignored AI configuration was inspected without emitting secret values after a
  metadata preflight was rejected before inference. The supplied key was safely identified as a
  Groq credential, not the xAI inference credential required by ADR 0009. Provider enablement was
  restored to false. Python configuration now parses the documented dotenv ZDR boolean while still
  requiring it to remain true, rejects non-xAI keys before network access, and maps provider HTTP
  failures before enforcing the success-response ZDR header. The full Python rerun passes 78 tests
  with one intentional cross-service skip and 86.33% coverage; Ruff lint/format, dependency
  consistency, safe local configuration loading, the explicit signed cross-service smoke (one pass
  in 0.90 seconds), and whitespace checks pass.
- On 2026-09-04 the user explicitly authorized using the existing Groq key and implementing the
  provider migration. ADR 0010 supersedes only ADR 0009's xAI-specific portions. The fixed provider
  is now Groq Chat Completions with `openai/gpt-oss-120b`, strict schema output, low reasoning
  effort with reasoning excluded from responses, no tools/citations/retries, and exact
  cached/uncached token-price accounting.
- Migration `20260904090000_phase_7_groq_provider` preserves historical `XAI` evidence, adds
  `GROQ`, revokes active legacy xAI consent so it is not reused, permits the fixed model's slash,
  and is applied to development and test. Consent is now provider-scoped `groq-zdr-v1`.
- A redacted Groq model-list check successfully authenticated the existing ignored key and found one
  active `openai/gpt-oss-120b` model. It performed no inference and emitted no secret. The updated
  Python suite passes 96 tests with one opt-in skip and 88.31% coverage; focused API (19 tests) and
  web (5 tests) provider-migration suites pass. Full API (145 tests) and web (43 tests) regressions,
  both coverage gates, lint, format/schema validation, production build, both database
  status/drift checks, and the signed cross-service smoke (one pass in 0.68 seconds) also pass.
- The operator confirmed Global ZDR in Groq Data Controls and the user explicitly requested
  development enablement. The application preflight passed without inference. GPT-OSS request
  compatibility was corrected to use `include_reasoning: false` and Groq's supported strict-schema
  subset while retaining full local validation. The live runner now paces cases by eight seconds
  without retries to respect the observed 8K-token/minute limit.
- The final metered evaluation passed all 20 cases: 100% allowed-intent, critical-safety, and schema
  rates; zero unsupported-claim indicators; 1,459 ms p95; USD 0.0001326525 mean cost; and USD
  0.0001993500 maximum cost. A signed live Node-to-FastAPI-to-Groq smoke also passed. Ignored local
  provider and Node flags are enabled, and API health reports AI `ready`.
- On 2026-09-04, after the completion criteria and evidence passed, the user instructed that Phase
  7 be marked complete and committed. This records explicit Phase 7 acceptance for the
  repository/development scope. It does not approve production deployment or authorize Phase 8.
- On 2026-09-05, the user accepted the complete Phase 8 proposal, permission matrix, threat model,
  exact `qdrant-client==1.19.0` and `fastembed==0.8.0` pins, and one-time
  `sentence-transformers/all-MiniLM-L6-v2` cache download by explicitly answering “yes”. ADR 0011
  records the exact repository/development scope; no hosted vector/object account, PDF/OCR,
  LangChain/LangGraph, autonomous action, or production rollout was authorized.
- Three additive migrations implement logical documents, immutable versions/audiences,
  generation-aware chunk/citation metadata, document consent, and idempotent mutation receipts.
  All 14 migrations are current in development and test with no schema drift.
- Owner/admin document management, strict raw text/Markdown validation, encrypted private object
  storage, version/lifecycle/reindex/delete/recovery flows, idempotent worker jobs, and responsive
  document/status UI are implemented. Document-storage and RAG cache/vector roots are rejected when
  broad, repository-contained, repository-parent, or web-accessible; documents never use
  user-controlled paths.
- The isolated signed FastAPI retrieval boundary implements deterministic chunking, fixed cached
  MiniLM embeddings, private local Qdrant, opaque candidate results, and strict document answer
  contracts. Node remains the authority: it rechecks user/permission/consent/lifecycle/audience,
  decrypts/checksums only bounded approved excerpts, and rechecks citations after inference.
- The offline 50-case retrieval suite passes with 100% recall@5/MRR/no-evidence/audience/
  superseded/deleted controls and 50.862 ms p95. The paced 54-case Groq document-answer gate passes
  its 95% grounded-answer target at 97.5%, all 100% no-evidence/critical-safety/schema/citation
  targets, 1,046 ms p95, and bounded cost without content or secret output. The signed five-case
  Node-to-FastAPI-to-Groq sample also passes.
- The Phase 8 repository gate passes 35 API files / 193 tests, 7 web files / 48 tests, 144 Python
  tests with two explicit live skips, all configured coverage thresholds, lint/format/schema/build,
  both migration/drift checks, audit verification, dependency checks, whitespace, and credential
  hygiene. Architecture, persistence, API, permission, threat, implementation, operations,
  evaluation, and review documentation are synchronized.
- On 2026-09-06 the complete routine gate was rerun before handoff: 193 API tests, 48 web tests,
  144 Python tests with two intentional live skips, all coverage thresholds, lint/format/schema,
  Python dependency checks, production build, all 14 development/test migrations with no drift,
  both audit verifiers, the deterministic signed boundary smoke, Git whitespace, and the 50-case
  offline retrieval gate pass. The user instructed that Phase 8 be committed if complete; this
  records explicit Phase 8 acceptance for the repository/development scope. No production rollout
  or Phase 9 work is authorized by that instruction.
- The complete accepted Phase 8 repository/development implementation was committed as `41801e6`
  (`feat: complete phase 8 document intelligence`).
- On 2026-09-06 the user explicitly instructed OpsPilot to start Phase 9. This authorizes
  decision-definition work, not dependency installation or implementation of unresolved workflow,
  tool, approval, retention, or action policies.
- The Phase 9 specification and existing AI/RAG/support/report/RBAC/audit/job/configuration/
  persistence/UI boundaries were reviewed together with current official LangGraph persistence,
  interrupt, graph-version compatibility, recursion/timeout, SQLite checkpointer, and strict
  deserialization guidance.
- A complete proposed two-graph baseline is documented for review: owner-only read-only business
  briefs and owner/admin support reply drafting with customer-policy grounding, metadata-only
  LangGraph checkpoints, Node-owned encrypted artifacts, fixed graph-selected tools, mandatory
  human approval, and exactly one idempotent customer-visible reply action. At that proposal gate,
  no Phase 9 runtime change had been made.
- Current official package review proposes exact `langgraph==1.2.11` and
  `langgraph-checkpoint-sqlite==3.1.1` pins after separate approval. At that review gate no package
  was installed, no lock changed, no LangSmith/provider account was added, and no provider workflow
  call was made.
- The user explicitly approved the complete Phase 9 repository/development baseline and the
  separate installation of `langgraph==1.2.11` and `langgraph-checkpoint-sqlite==3.1.1` on
  2026-09-06. ADR 0012 records the authorization and its production, real-support-data, metered
  live-evaluation, provider/model/account, and deferred-action exclusions.
- The exact LangGraph dependencies are installed in the isolated Python environment and committed
  lock. Fixed `v1` owner-business-brief and support-reply graphs, strict metadata-only SQLite
  checkpoints, bounded provider steps, signed reverse Node tools, and checkpoint cleanup are
  implemented without LangSmith or a new account/service.
- Migration `20260906090000_phase_9_langgraph_workflows` implements three permissions, workflow
  runs/tool evidence/approvals, short-lived AES-256-GCM artifacts, AI usage/model-step links,
  AI-assisted support-message origin, constraints, indexes, and registered advance/retention jobs.
  All 15 migrations are applied to development/test with zero schema diff.
- Node implements default-off/production-rejected gates, separate signed internal boundaries,
  repeated RBAC/consent/scope/cost/freshness reauthorization, fixed business/support tools,
  artifact encryption, safe failure/unknown handling, approval/version/digest concurrency, and one
  idempotent customer-visible support reply after mandatory human approval.
- React implements permission-gated business workflow and support review experiences with explicit
  workflow consent, safe plain-text output, provenance/freshness/uncertainty, exact draft review,
  edit/approve/reject/cancel, and AI-assisted origin. Non-synthetic support processing remains
  disabled and unapproved.
- The final gate passes lint, formatting/schema validation, production build, 39 API files / 209
  tests, 8 web files / 53 tests, 165 routine Python tests with 3 opt-in skips, all coverage gates,
  both database drift/audit checks, Python dependency consistency, secret scan, the 100-case
  content-free offline evaluation, and the five-case bidirectional signed local workflow smoke.
  Workflow p95 is 270.757 ms and signed tool p95 is 71.660 ms.
- Architecture, database, API, AI, permissions, threat, implementation, operations, evaluation,
  review, phase, decision, and progress documentation are synchronized.
- On 2026-09-06, after the complete gate passed, the user explicitly accepted Phase 9 and instructed
  that the repository/development implementation be committed. This acceptance does not authorize
  production, metered workflow evaluation, non-synthetic support-data model processing, Phase 10,
  or any deferred workflow/tool/action.

## In Progress

- Phase 9 has no remaining repository/development work. Production, metered workflow evaluation,
  non-synthetic support-data model processing, and Phase 10 remain separately gated.
- Phase 8 production storage/vector topology, privacy/retention, networking, monitoring, backup,
  multi-instance operation, and rollout approval remain unresolved and separate from the accepted
  repository/development scope.
- The real Razorpay provider smoke matrix and explicit Phase 4 acceptance remain blocked on a
  completed hosted Test Mode payment plus copying the current temporary HTTPS webhook endpoint into
  the Test Mode dashboard, matching its separate secret, confirming automatic capture, and
  subscribing only to the seven allowlisted events. Live Mode remains prohibited.
- Phase 7 development AI prompts remain enabled after ZDR confirmation, redacted preflight,
  all-green live evaluation, signed live service smoke, and explicit phase acceptance. Broader
  account/privacy/legal/operations review and production rollout approval remain required before
  production deployment.

## Next Task

Await explicit authorization before beginning Phase 10, metered workflow evaluation,
non-synthetic local support-data processing, or production AI/document/workflow rollout. The
independent Phase 4 Razorpay Test Mode delivery/recovery gate also remains unresolved.

## Accepted Decisions

- JavaScript for the React frontend and Node.js/Express backend; Python 3.13 is isolated to the
  Phase 7 AI service.
- npm workspaces, ECMAScript modules, Node.js 24.19.x, React/Vite, Express, Prisma/MySQL, Vitest, ESLint, and Prettier.
- Single-business initial release.
- Public customer registration and interactive owner bootstrap.
- Database-backed opaque cookie sessions with CSRF and exact-origin protection.
- Argon2id and database-backed deny-by-default RBAC.
- Migration-controlled `OWNER`, `ADMIN`, and `CUSTOMER` roles and Phase 2 permissions.
- Public active catalog; protected business management; UUID products; normalized immutable SKU; flat categories; plain text; `DECIMAL(12,2)` prices; single `INR` currency; draft/active/archive lifecycle; optimistic versions.
- One aggregate nonnegative whole-number stock balance plus immutable atomic adjustment ledger; public boolean availability and protected exact stock.
- `products:manage`, `categories:manage`, `inventory:read`, and `inventory:adjust` assigned to `OWNER` and `ADMIN`.
- Product/category hard deletion, variants, images, hierarchy, multiple warehouses, fractional
  stock, taxes, discounts, currency conversion, and new employee models are deferred. The limited
  Phase 4 aggregate order-reservation model is implemented.
- Verification, recovery, MFA, employee invitations, and account deletion remain deferred until reviewed.
- Dependencies and services are reviewed before installation and are not added speculatively.
- Razorpay is selected as the Phase 4 payment provider; only a Test Mode credential is currently in
  scope. The complete Standard Checkout, automatic-capture, webhook/refund/reconciliation,
  inventory-reservation, permission, API/UI, and explicit-deferral baseline is accepted in ADR 0005.
- ADR 0006 defers the missing external Razorpay Test Mode smoke, keeps Phase 4 unaccepted and Live
  Mode prohibited, and authorizes Phase 5 decision-definition work to proceed.
- ADR 0007 accepts the Phase 5 support, report, HMAC-chained audit, dependency-free logging,
  single-instance rate/proxy, performance, permission, temporary retention, and implementation
  baseline. Attachments, exports, hosted observability, queues/realtime, distributed limits, live
  payments, and AI remain deferred.
- ADR 0008 accepts a MySQL transactional job/outbox, separate JavaScript worker, persistent
  recipient-owned in-app notifications, Socket.IO as a non-durable hint layer, owner-only job
  inspection/replay, and no Redis/BullMQ/external broker or multi-instance topology.
- ADR 0009 accepts the provider-neutral Phase 7 required-ZDR, stateless two-intent,
  signed-Node/FastAPI, assistant-scoped-consent, metadata-only usage/cost, three-permission,
  quota/evaluation, and exact Python dependency baseline.
- ADR 0010 supersedes ADR 0009's xAI-specific portions with Groq Chat Completions,
  `openai/gpt-oss-120b`, explicit ZDR operator confirmation, `groq-zdr-v1` consent, exact
  returned-token cost calculation, and a historical-data-preserving provider migration.

## Phase 3 Acceptance Evidence

- Accepted decision record: `docs/decisions/0004-phase-3-business-core.md`.
- Permission mapping: `docs/permissions/PHASE-03-PERMISSION-MATRIX.md`.
- Security review: `docs/security/PHASE-03-THREAT-MODEL.md`.
- API/UI behavior and review Q&A: `docs/phase-3/PHASE-03-IMPLEMENTATION-GUIDE.md`.
- Consolidated technical evidence: `docs/phase-3/PHASE-03-REVIEW-REPORT.md`.
- API coverage: 83.78% statements, 67.36% branches, 92.97% functions, 87.06% lines.
- Web coverage: 84.44% statements, 69.38% branches, 83.41% functions, 86.28% lines.
- Lint, formatting, Prisma validation, development/test migration status, production build, live API/web smoke, and Git whitespace checks pass.

## Phase 4 Review Evidence

- Accepted decision record: `docs/decisions/0005-phase-4-orders-payments.md`.
- Permission mapping: `docs/permissions/PHASE-04-PERMISSION-MATRIX.md`.
- Security review: `docs/security/PHASE-04-THREAT-MODEL.md`.
- API/UI behavior: `docs/phase-4/PHASE-04-IMPLEMENTATION-GUIDE.md`.
- Provider setup/recovery: `docs/phase-4/PHASE-04-OPERATIONS-RUNBOOK.md`.
- Consolidated evidence: `docs/phase-4/PHASE-04-REVIEW-REPORT.md`.
- API coverage: 80.24% statements, 68.17% branches, 94.67% functions, 84.54% lines.
- Web coverage: 82.56% statements, 71.09% branches, 80.25% functions, 85.10% lines.
- Lint, formatting/Prisma validation, development/test migration status, production build, local
  API/web smoke, Git whitespace, and secret-literal scans pass.
- 2026-09-02 re-verification: Phase 4 hardening is included in the passing 123-API/38-web full
  regression and current coverage/build/database/live-smoke gate. The redacted provider preflight
  correctly reports `PAYMENT_PROVIDER_NOT_CONFIGURED`; real Test Mode delivery remains pending.

## Phase 5 Acceptance Evidence

- Phase transition exception: `docs/decisions/0006-phase-4-provider-smoke-deferral.md`.
- Accepted baseline: `docs/decisions/0007-phase-5-production-backend-baseline.md` and
  `docs/phase-5/PHASE-05-DECISION-PROPOSAL.md`.
- Accepted authorization mapping: `docs/permissions/PHASE-05-PERMISSION-MATRIX.md`.
- Accepted security requirements: `docs/security/PHASE-05-THREAT-MODEL.md`.
- Acceptance report: `docs/phase-5/PHASE-05-ACCEPTANCE-REPORT.md`.
- Performance evidence: `docs/phase-5/PHASE-05-PERFORMANCE-EVIDENCE.md`.
- Operations and recovery runbook: `docs/phase-5/PHASE-05-OPERATIONS-RUNBOOK.md`.
- Persistence migration: `apps/api/prisma/migrations/20260827060000_phase_5_support_audit_foundation/migration.sql`.
- Actor-integrity migration:
  `apps/api/prisma/migrations/20260828060000_phase_5_audit_actor_restrict/migration.sql`.
- Report index migrations:
  `apps/api/prisma/migrations/20260828070000_phase_5_report_indexes/migration.sql` and
  `apps/api/prisma/migrations/20260828080000_phase_5_report_covering_indexes/migration.sql`.
- Development and test databases report all eight migrations applied; development schema drift is
  absent.
- Full regression: 19 API files / 87 tests and 4 web files / 34 tests pass.
- API coverage: 83.18% statements, 71.71% branches, 94.70% functions, 87.19% lines.
- Web coverage: 83.54% statements, 73.48% branches, 81.14% functions, 85.63% lines.
- Production build: 63 modules; 325.68 kB main JavaScript, 92.37 kB gzip.
- Representative p95: authenticated overview 206.022 ms, support management list 159.322 ms,
  customer order list 1.709 ms, and audit read 7.675 ms.
- Audit verification passes over the 25,000-event representative chain and over current
  development/test state after cleanup.
- Lint, formatting/Prisma validation, production build, live ephemeral API/database/request-ID and
  built-web smoke, Git whitespace, high-confidence credential scans, and ignored-environment checks
  pass.

## Known Issues

- The installed system Node.js remains 20.19.4 because active Node processes prevent MSI replacement. Verification uses an official portable Node.js 24.19.0 runtime; complete the system upgrade after active sessions are closed.
- The 2026-09-06 `npm audit --omit=dev` reports seven transitive findings (two moderate and five
  high): `deepmerge-ts` through Prisma configuration, MariaDB connector credential/TLS/escaping
  advisories through `@prisma/adapter-mariadb`, `mysql2` authentication-downgrade/decompression
  advisories through the Prisma CLI tree, and `qs` parsing/DoS advisories. npm proposes a breaking
  Prisma downgrade for part of the tree, the adapter path has no complete fix, and the `qs` update
  still requires a reviewed dependency/lock change. No unapproved dependency change was made.
- Phase 5 rate stores and Phase 6 connection/rate accounting are per process and need reviewed
  shared or edge policy before horizontal scaling.
- The Razorpay Test Mode provider-delivery gate is not yet complete end to end: the rotated API
  credentials authenticate, provider-order creation succeeds, and the temporary public HTTPS
  tunnel is verified, but dashboard capture, matching webhook secret/current endpoint, the
  seven-event allowlist, and the remaining payment/refund delivery matrix require confirmation.
  The real-looking Test Mode key pair found in the tracked example before commit remains rotated.
- Production retention/privacy/erasure/legal-hold rules, encrypted backup ownership/vendor,
  generations, RPO/RTO, restore cadence, hosted monitoring/alerting, and incident ownership remain
  undecided production blockers. The local performance result is a regression baseline, not an
  external SLA or concurrent-load/soak result.
- Job, attempt, heartbeat, and notification retention is temporarily indefinite in development and
  test. Production worker/API supervision, remote database TLS/credential handling, capacity/SLOs,
  deploy rollback, and Phase 6 retention/purge policy remain unresolved production blockers.
- The ignored Groq key, fixed-model access, Global ZDR, redacted preflight, live evaluation, and
  development service path are verified. The free-plan 8K-token/minute limit can still produce safe
  `429` failures under bursts. Credits, project/model permissions, billing controls, privacy/legal
  posture, monitoring, and production operations still require owner review.
- Phase 7's HMAC nonce cache, concurrency, and burst controls are per process. Production also lacks
  approved private TLS/mTLS/networking, supervision, monitoring/alerts, SLO/capacity, model rollback,
  unknown-cost reconciliation, and consent/usage/audit retention/erasure/legal-hold policy.
- The Python tests currently emit two upstream Starlette TestClient deprecation warnings for its
  HTTPX and AnyIO compatibility aliases. Tests pass; recheck on a future approved dependency update.

## Phase 6 Acceptance Evidence

- Phase specification: `docs/phases/PHASE-06-REALTIME-JOBS.md`.
- Accepted baseline: `docs/decisions/0008-phase-6-realtime-jobs-baseline.md` and
  `docs/phase-6/PHASE-06-DECISION-PROPOSAL.md`.
- Implemented authorization mapping: `docs/permissions/PHASE-06-PERMISSION-MATRIX.md`.
- Verified security requirements: `docs/security/PHASE-06-THREAT-MODEL.md`.
- Implementation guide: `docs/phase-6/PHASE-06-IMPLEMENTATION-GUIDE.md`.
- Operations and recovery runbook: `docs/phase-6/PHASE-06-OPERATIONS-RUNBOOK.md`.
- Performance evidence: `docs/phase-6/PHASE-06-PERFORMANCE-EVIDENCE.md`.
- Acceptance report: `docs/phase-6/PHASE-06-ACCEPTANCE-REPORT.md`.
- Persistence migration:
  `apps/api/prisma/migrations/20260828094016_phase_6_realtime_jobs/migration.sql`.
- Development and test databases report all nine migrations applied; development schema drift is
  absent. Current development and test audit chains verify successfully.
- Full regression: 26 API files / 121 tests and 5 web files / 36 tests pass.
- API coverage: 83.87% statements, 72.95% branches, 93.54% functions, 87.75% lines.
- Web coverage: 83.52% statements, 73.47% branches, 82.25% functions, 85.88% lines.
- Production build: 96 modules; 379.89 kB main JavaScript, 108.32 kB gzip; 25.20 kB CSS.
- Representative p95 at 10,000 notifications: list 19.195 ms, unread count 63.766 ms, committed-job
  visibility 41.988 ms, materialization 10.814 ms, and Socket.IO hint 36.674 ms.
- Lint, formatting/Prisma validation, build, migration/drift checks, live API/worker/built-web smoke,
  Git whitespace, high-confidence credential scans, and ignored-environment checks pass.
- Exact `socket.io@4.8.3` and `socket.io-client@4.8.3` are pinned. Existing MySQL is the only
  persistence service; no Redis, BullMQ, external broker/channel account, or new secret was added.
- 2026-09-02 re-verification passes 123 API tests, 38 web tests, API coverage
  83.90/73.04/93.54/87.77 and web coverage 83.55/73.36/82.36/85.93 (statements/branches/functions/
  lines), build, both database drift checks, both audit verifiers, and live API/worker/web smoke.
  Current Phase 6 p95 values are 15.781 ms list, 34.647 ms unread count, 22.369 ms committed-job
  visibility, 24.423 ms materialization, and 32.766 ms Socket.IO hint; all targets pass.

## Phase 7 Repository Review Evidence

- Phase specification: `docs/phases/PHASE-07-AI-FOUNDATION.md`.
- Accepted baseline: `docs/decisions/0009-phase-7-ai-foundation-baseline.md`,
  `docs/decisions/0010-phase-7-groq-provider.md`, and
  `docs/phase-7/PHASE-07-DECISION-PROPOSAL.md`.
- Implemented authorization mapping: `docs/permissions/PHASE-07-PERMISSION-MATRIX.md`.
- Verified security requirements: `docs/security/PHASE-07-THREAT-MODEL.md`.
- Implementation guide: `docs/phase-7/PHASE-07-IMPLEMENTATION-GUIDE.md`.
- Operations/recovery: `docs/phase-7/PHASE-07-OPERATIONS-RUNBOOK.md`.
- Deterministic and live evidence: `docs/phase-7/PHASE-07-EVALUATION-EVIDENCE.md`.
- Review and acceptance report: `docs/phase-7/PHASE-07-REVIEW-REPORT.md`.
- Implemented provider policy: Groq Chat Completions with `openai/gpt-oss-120b`, low reasoning
  effort with reasoning excluded from responses, strict structured output, required
  operator-confirmed ZDR, no tools/citations, and no automatic inference retry.
- Implemented capabilities: stateless public-feature customer help and owner-only explanation of the
  existing authorized aggregate overview; no personal/row-level context or action path.
- Implemented persistence: versioned consent and metadata-only usage/cost evidence; no prompt, answer,
  reasoning, chat session, or chat message storage.
- Exact dependencies: FastAPI, Uvicorn, HTTPX, Pydantic, Pydantic Settings, python-dotenv, pytest,
  pytest-cov, and Ruff in an isolated Python 3.13 environment and committed lock; no new npm
  dependency and no Groq/OpenAI SDK, LangChain, LangGraph, Redis, or vector dependency.
- Migrations `20260903060000_phase_7_ai_foundation` and
  `20260904090000_phase_7_groq_provider` are current in development/test.
- Full regression: 30 API files / 145 tests, 6 web files / 43 tests, and 97 routine Python tests
  pass; the Python routine suite has one intentional opt-in cross-service skip.
- Coverage: API 84.58/73.76/93.31/88.15, web 83.60/73.61/82.73/86.10, and Python 88.36% total
  (statements/branches/functions/lines where applicable); all configured thresholds pass.
- Production web build: 104 modules; 395.60 kB JavaScript (112.29 kB gzip); 28.23 kB CSS
  (6.26 kB gzip).
- Explicit signed Node-to-FastAPI loopback smoke passes against a deterministic provider in 0.68 s.
  Both audit chains verify over 105 development events and an empty cleaned test state; lint,
  formatting, schema, database diff, dependency, whitespace, and credential gates pass.
- Global ZDR confirmation, the redacted preflight, the paced 20-case live evaluation, and the signed
  live Node-to-FastAPI-to-Groq smoke pass without recording content or emitting secrets.
- Explicit Phase 7 acceptance was recorded on 2026-09-04 after every repository/development
  completion criterion passed. Production deployment and Phase 8 remain unauthorized.

## Phase 9 Repository Review Evidence

- Accepted baseline: `docs/decisions/0012-phase-9-langgraph-workflow-baseline.md` and
  `docs/phase-9/PHASE-09-DECISION-PROPOSAL.md`.
- Implemented authorization and security controls: `docs/permissions/PHASE-09-PERMISSION-MATRIX.md`
  and `docs/security/PHASE-09-THREAT-MODEL.md`.
- Implementation and operations: `docs/phase-9/PHASE-09-IMPLEMENTATION-GUIDE.md` and
  `docs/phase-9/PHASE-09-OPERATIONS-RUNBOOK.md`.
- Evaluation and final review: `docs/phase-9/PHASE-09-EVALUATION-EVIDENCE.md` and
  `docs/phase-9/PHASE-09-REVIEW-REPORT.md`.
- Exact dependencies: `langgraph==1.2.11` and `langgraph-checkpoint-sqlite==3.1.1`, with MIT
  license expressions and a consistent locked Python environment.
- Full regression and coverage: 209 API tests at 82.41/73.59/91.67/86.06, 53 web tests at
  80.62/71.79/80.60/82.81, and 165 passing routine Python tests at 82.87% total coverage.
- The fixed 100-case offline workflow evaluation passes all thresholds without a provider call.
  The five-case signed bidirectional local smoke passes at 270.757 ms workflow p95 and 71.660 ms
  tool p95 with exact usage/cost, encrypted artifacts, durable checkpoint cleanup, and no emitted
  content or secrets.
- All 15 migrations are current without development/test drift, both audit chains validate, and
  lint, formatting/schema, build, dependency consistency, and credential-hygiene checks pass.
- Explicit Phase 9 repository/development acceptance was recorded on 2026-09-06. Production,
  non-synthetic support-data processing, metered workflow evaluation, and Phase 10 remain
  unauthorized.

## Phase Gate

Phases 1, 2, and 3 are accepted. Phase 4 repository implementation and internal review gates pass,
but the phase remains unaccepted while real Test Mode delivery/recovery is deferred under ADR 0006.
Phase 5 is repository-complete and verified under ADR 0007 and its acceptance report. Phase 6 is
repository-complete and verified under ADR 0008 and its acceptance report. Phase 7 is explicitly
accepted and complete for the repository/development scope, live-verified, and enabled in local
development under ADRs 0009 and 0010. Production remains blocked on the broader
account/privacy/operations review and explicit rollout approval. Phase 8's complete baseline was
accepted under ADR 0011, its approved repository/development implementation and evaluation gates
pass, and explicit phase acceptance was recorded on 2026-09-06. Production is separately blocked
on approved storage/vector topology, privacy/retention, networking, operations, and rollout. Phase 9
baseline approval is recorded under ADR 0012, its complete repository/development implementation
and automated gate pass, and explicit phase acceptance was recorded on 2026-09-06. Production,
metered workflow evaluation, non-synthetic support-data model processing, Redis, BullMQ, external
channels, live payments, multi-instance deployment, unapproved workflows/actions, Phase 10, and
every later capability remain out of scope.
