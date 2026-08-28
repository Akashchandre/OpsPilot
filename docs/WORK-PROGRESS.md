# Work Progress

**Last updated:** 2026-08-28

## Current Phase

Phase 5 — Production Backend Features (complete)

## Status

REPOSITORY COMPLETE AND VERIFIED — PHASE 6 DECISION DEFINITION NEXT

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

## In Progress

- No Phase 5 implementation remains.
- The real Razorpay provider smoke matrix and explicit Phase 4 acceptance remain a deferred backlog
  gate and a live-payment blocker.

## Next Task

Begin Phase 6 by reading its specification and defining the real-time/job architecture, dependency,
service/account, event/job semantics, authorization, delivery, failure/recovery, observability, and
testing decisions. Do not install or implement a queue, Redis, Socket.IO, worker, or other Phase 6
technology until that baseline is explicitly approved.

## Accepted Decisions

- JavaScript for the React frontend and Node.js/Express backend; Python remains reserved for the later AI service.
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
- `npm audit` reports three high-severity findings associated with the existing recursive-object stack-exhaustion advisory in `deepmerge-ts` through the local Prisma CLI configuration path. npm offers only a breaking Prisma downgrade; no forced fix was applied. Runtime application requests do not process Prisma configuration.
- Phase 5 rate stores are per process and need a shared store or edge policy before horizontal scaling.
- The Razorpay Test Mode provider-delivery gate is not runnable: the ignored API environment has no
  enabled provider/key/webhook-secret configuration, and the public HTTPS endpoint plus
  automatic-capture dashboard setting are not recorded. The real-looking Test Mode key pair found
  in the tracked example before commit must be treated as exposed and rotated before this smoke.
- Production retention/privacy/erasure/legal-hold rules, encrypted backup ownership/vendor,
  generations, RPO/RTO, restore cadence, hosted monitoring/alerting, and incident ownership remain
  undecided production blockers. The local performance result is a regression baseline, not an
  external SLA or concurrent-load/soak result.

## Phase Gate

Phases 1, 2, and 3 are accepted. Phase 4 repository implementation and internal review gates pass,
but the phase remains unaccepted while real Test Mode delivery/recovery is deferred under ADR 0006.
Phase 5 is repository-complete and verified under ADR 0007 and its acceptance report. Phase 6 may
start only with decision definition; real-time/job implementation remains unauthorized until that
baseline is approved. Live-payment and AI implementation remain out of scope.
