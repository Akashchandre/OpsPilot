# Phase 5 Production Backend Decision Proposal

## Status

**IMPLEMENTED AND VERIFIED on 2026-08-28.** The user explicitly instructed work to start after
reviewing this complete proposal. ADR 0007 records the accepted baseline. The Phase 5 acceptance,
performance, and operations reports record the completed evidence; the external Phase 4 Razorpay
smoke remains deferred under ADR 0006.

## Goal

Add a bounded support workflow, authoritative operational reporting, integrity-protected audit
evidence, and production-oriented API hardening without introducing the Phase 6 queue/realtime
stack, Phase 8 file storage, or a hosted observability platform prematurely.

## Recommended baseline

### 1. Phase boundary

- Keep the existing single-business, JavaScript/Express/React, Prisma/MySQL, opaque-session, and
  deny-by-default RBAC boundaries.
- Include support tickets/messages, an operator overview report and UI, durable audit events,
  structured request/error logging, bounded rate/payload controls, query/index review, and
  backup/restore documentation.
- Exclude attachments, email/SMS, realtime updates, queues/workers, Redis, exports, custom roles,
  live payment activation, and AI.
- Treat the unresolved Razorpay provider smoke as a release blocker, not as Phase 5 scope.

### 2. Support ownership and creation

- Only active authenticated users can create tickets. A requester is always derived from the
  session; creating on behalf of another user is deferred.
- Each ticket has a UUID, a unique human-readable number, requester, category, subject, priority,
  status, optional owned order reference, optional assignee, optimistic version, and UTC
  timestamps.
- Categories are `GENERAL`, `ORDER`, `PAYMENT`, `PRODUCT`, and `ACCOUNT`.
- Subjects are normalized plain text of 5–160 characters. The mandatory initial message and later
  messages are normalized plain text of 1–4,000 characters.
- A customer may link only one of their own orders. Staff views may follow that validated link but
  do not expose unrestricted payment-provider data through the support response.
- Ticket creation requires a UUID `Idempotency-Key` and a stored normalized request digest so a
  lost response cannot create duplicate cases.

### 3. Ticket state, priority, assignment, and concurrency

- Statuses are `OPEN`, `IN_PROGRESS`, `WAITING_CUSTOMER`, `RESOLVED`, and `CLOSED`.
- New tickets start `OPEN`; priority starts `NORMAL`. Staff may choose `LOW`, `NORMAL`, `HIGH`, or
  `URGENT`. Priority is an operator triage label, not an SLA guarantee.
- Staff transitions are:
  - `OPEN` → `IN_PROGRESS`, `WAITING_CUSTOMER`, `RESOLVED`, or `CLOSED`.
  - `IN_PROGRESS` → `OPEN`, `WAITING_CUSTOMER`, `RESOLVED`, or `CLOSED`.
  - `WAITING_CUSTOMER` → `OPEN`, `IN_PROGRESS`, `RESOLVED`, or `CLOSED`.
  - `RESOLVED` → `OPEN` or `CLOSED`.
  - `CLOSED` is terminal; a new issue requires a new ticket.
- A customer may close only their own non-closed ticket. A customer public reply to
  `WAITING_CUSTOMER` or `RESOLVED` atomically reopens it to `OPEN`; a closed ticket rejects new
  messages.
- One optional assignee may be selected from active users who currently possess
  `support:tickets:manage`. Disabling or deauthorizing an assignee leaves historical evidence but
  requires reassignment before the next management transition.
- Status, priority, and assignment mutations require the current ticket version. Concurrent stale
  writes return `409 RESOURCE_VERSION_CONFLICT`.

### 4. Ticket messages and history

- Messages are immutable and have `CUSTOMER_VISIBLE` or `INTERNAL` visibility. Customer-authored
  messages are always customer-visible; staff may add either kind.
- Customers can read only customer-visible messages on owned tickets. Staff with support-read
  permission can read both kinds.
- Message creation requires a UUID `Idempotency-Key` scoped to the ticket and author plus a request
  digest. There is no edit or delete route.
- Status, assignment, priority, and automatic reopen changes create append-only ticket events in
  the same transaction.
- Attachments, rich text, HTML, embedded media, outbound email, SLA timers, escalations, merge,
  bulk actions, and automated closure are deferred.

### 5. Support API and UI

Recommended versioned endpoints:

- `POST /api/v1/support/tickets`
- `GET /api/v1/support/tickets`
- `GET /api/v1/support/tickets/:ticketId`
- `POST /api/v1/support/tickets/:ticketId/messages`
- `POST /api/v1/support/tickets/:ticketId/closure`
- `GET /api/v1/support/tickets?view=management`
- `GET /api/v1/support/tickets/:ticketId?view=management`
- `PATCH /api/v1/support/tickets/:ticketId`

Customer reads are ownership-scoped and use not-found behavior for other users' records.
Management collections use strict allowlists for status, priority, category, assignee, requester,
search, sort, and direction. Pagination uses the existing `page`/`limit` contract with default 20
and maximum 100. Search covers only ticket number and normalized subject.

The React baseline adds `/support`, `/support/new`, `/support/:ticketId`, and
`/admin/support`. Every page includes loading, empty, validation, conflict, authorization, and
failure states. Staff-only notes are visually and accessibly distinct.

### 6. Reports and dashboard definitions

- Add `GET /api/v1/reports/overview` and `/admin/reports` for authorized operators.
- Inputs are explicit RFC 3339 UTC instants in a half-open `[from, to)` range. The default is the
  previous rolling 30 days and the maximum range is 366 days. Responses include `asOf`, `from`,
  `to`, `timeZone: "UTC"`, and `currency: "INR"`.
- The initial report returns exact, labeled definitions rather than accounting claims:
  - Orders created in the range and their current status breakdown.
  - Captured payment amount from captured attempts in the range.
  - Processed refund amount in the range.
  - Net payment flow defined only as captured amount minus processed refunds.
  - New customer accounts created in the range.
  - Current low-stock and out-of-stock product counts as of `asOf`.
  - Tickets created in the range plus current open-state and priority breakdowns.
- Money remains decimal strings and INR. Empty datasets return zeros, not omitted fields.
- Queries run against authoritative MySQL data at request time. Caches and precomputed jobs remain
  Phase 6 concerns.
- CSV/spreadsheet exports, tax/profit/revenue recognition, forecasts, arbitrary grouping, custom
  report builders, and cross-currency results are deferred.

### 7. Audit evidence

- Add a general append-only audit stream without replacing the existing narrow Phase 2
  `security_events` table or Phase 4 financial/status evidence.
- Each audit event records a monotonically increasing sequence, action, outcome, actor kind and
  optional actor ID, target type/ID, request ID, UTC occurrence time, allowlisted metadata,
  previous hash, key identifier, and HMAC-SHA256 event hash.
- A singleton chain-head row is locked while appending so event insert and head movement occur in
  one transaction. The HMAC key is server-only configuration. This detects application-database
  mutation, deletion, and reordering when the chain is verified; it does not protect against an
  attacker who also controls the application secret and backups.
- Retrofit successful sensitive mutations from identity, role, catalog, inventory, order,
  payment/refund/reconciliation, and Phase 5 support workflows. Read access to the audit stream is
  itself audited. Authentication outcomes continue in `security_events` and are not duplicated.
- Critical local privileged mutations fail closed if their audit append cannot commit in the same
  transaction. External provider effects retain their existing pending/reconciliation recovery
  boundary because Razorpay cannot join a MySQL transaction.
- Add `GET /api/v1/audit-events` with bounded time, action, actor, target, and outcome filters.
  There is no create, update, or delete endpoint and no customer access.
- Metadata is action-specific and rejects passwords, cookies, tokens, authorization headers,
  CSRF values, provider signatures/secrets, raw request/response bodies, payment instruments, and
  full address/contact content.

### 8. Structured logging and correlation

- Add a small injectable JSON-lines logger using Node.js platform APIs; add no logging package or
  hosted vendor in this phase.
- Generate a new server UUID for every request and return it as `X-Request-Id`. Client-supplied
  request IDs are never trusted or echoed; malformed values therefore cannot forge log context.
- Emit one completion record with timestamp, level, service, environment, event name, request ID,
  method, normalized route or safe path, response status, and duration. Unexpected errors add a
  safe error class/code; stack traces remain restricted to protected non-production diagnostics.
- Log by construction from allowlisted fields. Do not serialize headers, cookies, query objects,
  request/response bodies, credentials, PII, payment metadata, ticket content, or audit metadata.
- `LOG_LEVEL` controls the minimum level. Production disables debug logging. Metrics/tracing and a
  log shipping vendor remain decisions for a deployment-owning phase.

### 9. Rate, proxy, and request controls

- Keep exact JSON/body limits and add explicit URL-encoded rejection because no route requires it.
- Retain the authentication limiter and add configurable in-process limits for general API traffic,
  support writes, and reports. Return stable `429 RATE_LIMITED` errors plus `Retry-After`.
- Key authenticated limits by user plus source IP and anonymous limits by source IP. Never accept
  a client header as identity.
- Keep Express proxy trust disabled by default. A bounded `TRUST_PROXY_HOPS` setting may be enabled
  only from a documented deployment topology; arbitrary forwarded chains remain untrusted.
- The Razorpay webhook keeps its strict 64 KiB raw-body/signature boundary and receives a separate
  high, configurable abuse ceiling that must not interfere with ordinary provider retries.
- The in-process store supports only a single API instance. A shared limiter is required before
  horizontal scaling and belongs with the Phase 6 infrastructure decision.

Proposed safe development defaults are 300 general requests per 5 minutes per source, 30 support
writes per 15 minutes per authenticated user/source, 60 report reads per 5 minutes per user, and
600 webhook requests per 5 minutes per source. These are configurable operational starting points,
not business SLAs.

### 10. Performance and query review

- Add indexes only for the accepted support, audit, and report access paths and review them with
  MySQL `EXPLAIN ANALYZE`.
- Build a deterministic, non-production representative-data script with synthetic content and no
  real personal or payment data.
- Engineering targets on the documented local Node 24/MySQL 8.4 baseline are p95 below 300 ms for
  bounded ordinary API reads and below 1 second for the overview report with 100,000 orders,
  50,000 payment attempts/refunds, and 25,000 tickets after warm-up. These are regression targets,
  not an external availability or latency SLA.
- Record query plans, dataset size, hardware/runtime context, and deviations. Do not add caching or
  denormalized summary tables without evidence and a new decision.

### 11. Retention, backup, and recovery direction

- Expose no hard-delete API for tickets, messages, events, or audit evidence. Do not implement an
  automatic purge while jurisdiction, privacy, legal-hold, and account-deletion duties remain
  unresolved.
- Treat indefinite retention as a temporary development/test behavior and an explicit blocker for
  production launch, not as an approved legal policy.
- Add a MySQL backup/restore runbook that requires encrypted storage, least-privilege access,
  checksums, secret-safe invocation, UTC timestamps, and restore into an isolated target before
  cutover.
- Exercise a sanitized development/test backup and restore once for the Phase 5 gate. Automated
  scheduling, cloud storage, final RPO/RTO, retention generations, and disaster-recovery topology
  remain deployment decisions and require explicit approval.

## Proposed permission baseline

Add four permissions:

- `support:tickets:read`
- `support:tickets:manage`
- `reports:read`
- `audit:read`

Assign support read/manage and reports read to `OWNER` and `ADMIN`. Assign `audit:read` only to
`OWNER` so ordinary administration does not imply access to sensitive oversight evidence. Assign
none to `CUSTOMER`; customer support access is authenticated and ownership-scoped. The complete
mapping is in `docs/permissions/PHASE-05-PERMISSION-MATRIX.md`.

## Dependency, account, and environment review

### Package decision

**Recommendation: add no npm package.** Existing Express, Prisma, Zod, Vitest, Node.js `crypto`,
and structured `console` output cover the proposed scope. A logging library, OpenAPI UI, cache,
queue, upload SDK, metrics agent, or hosted service would add operational/supply-chain burden
without an accepted current-phase requirement.

### Accounts and connections

No new external account or network connection is required. MySQL remains the only new-data system
of record. Backup destination and hosted log/metrics vendors remain unselected and are not silently
introduced.

### Proposed environment variables

| Variable | Required | Secret | Purpose |
|---|:---:|:---:|---|
| `AUDIT_INTEGRITY_KEY` | Yes outside routine tests | Yes | At least 32 random bytes for HMAC-protected audit chaining |
| `AUDIT_INTEGRITY_KEY_ID` | Yes with audit key | No | Stable identifier used by verification/rotation procedures |
| `LOG_LEVEL` | No | No | `debug`, `info`, `warn`, or `error`; default `info` |
| `TRUST_PROXY_HOPS` | No | No | Exact trusted reverse-proxy hop count; default `0` |
| `API_RATE_LIMIT_WINDOW_MINUTES` | No | No | General in-process window; default `5` |
| `API_RATE_LIMIT_MAX` | No | No | General request ceiling; default `300` |
| `SUPPORT_RATE_LIMIT_WINDOW_MINUTES` | No | No | Support-write window; default `15` |
| `SUPPORT_RATE_LIMIT_MAX` | No | No | Support-write ceiling; default `30` |
| `REPORT_RATE_LIMIT_WINDOW_MINUTES` | No | No | Report window; default `5` |
| `REPORT_RATE_LIMIT_MAX` | No | No | Report ceiling; default `60` |
| `WEBHOOK_RATE_LIMIT_WINDOW_MINUTES` | No | No | Razorpay webhook abuse window; default `5` |
| `WEBHOOK_RATE_LIMIT_MAX` | No | No | Webhook ceiling; default `600` |

Real audit keys belong only in ignored environment files or a future approved secret manager.
Examples contain placeholders, never usable values. Rotation must preserve prior keys for offline
verification; the first implementation supports one active write key and records its identifier.

## Minimum implementation and test gate after approval

- Reviewed Prisma migration with support, message, event, audit-chain, permission, constraint,
  foreign-key, and index definitions; development/test migration status must pass.
- API tests for customer ownership, staff permissions, internal-note isolation, order linking,
  transition rules, assignment eligibility, idempotency, optimistic conflicts, pagination, and
  stored-XSS-safe plain text.
- Report definition tests for boundaries, refunds, current snapshots, empty data, large/invalid
  ranges, permissions, UTC, and exact decimal arithmetic.
- Audit tests for action coverage, transaction rollback, metadata rejection, HMAC/chain verification,
  mutation/deletion/reordering detection, owner-only access, and access-event recursion safety.
- Logging tests that prove correlation, stable errors, safe production diagnostics, and absence of
  cookie/token/password/body/payment/ticket content.
- Rate/proxy/body-limit tests for expiry, `Retry-After`, user/source scoping, forwarded-header
  handling, and webhook isolation.
- React tests for customer and operator support plus report loading/empty/success/conflict/error/
  authorization states.
- Deterministic representative-data query-plan and latency evidence plus a sanitized backup/restore
  exercise.
- Full Phase 1–4 lint, format/Prisma validation, unit/integration, coverage, build, migration,
  smoke, whitespace, and secret-literal gates remain green.

## Explicitly deferred

- Support attachments, HTML/rich text, email/SMS, customer-service integrations, SLA automation,
  escalation jobs, realtime updates, and bulk workflows.
- CSV/spreadsheet exports, accounting/tax recognition, forecasts, arbitrary report builders,
  scheduled report delivery, and caching/materialized summaries.
- A hosted log/metric/trace vendor, alert delivery, SIEM integration, Redis/shared rate limiting,
  queues, and workers.
- Production backup infrastructure, final RPO/RTO, legal retention, privacy erasure/anonymization,
  and legal holds until business/jurisdiction requirements are supplied.
- Razorpay Live Mode and all unresolved Phase 4 provider/go-live gates.
- AI, RAG, LangGraph, document storage, Docker, CI/CD, and deployment implementation.

## Approval checklist

Approval of the complete baseline authorizes the Phase 5 ADR, schema/migration, API/UI work,
hardening, tests, and operational documents. Reviewers should explicitly approve or change:

1. Ticket ownership, categories, bounded plain-text fields, optional owned-order link, and
   idempotent creation.
2. Five ticket statuses, four priorities, transitions, customer close/reopen behavior, optimistic
   versions, and permission-qualified assignment.
3. Customer-visible versus internal immutable messages, idempotency, and no attachments.
4. Support API/UI boundaries, filters, and pagination.
5. UTC 30-day/default and 366-day/max overview report with the exact listed metrics and no exports.
6. HMAC hash-chained append-only audit evidence, action inventory, fail-closed local mutations,
   owner-only reads, and metadata exclusions.
7. Dependency-free JSON logging, server-generated correlation IDs, allowlisted fields, and no
   hosted observability vendor.
8. Configurable single-instance rate limits, explicit proxy trust, payload limits, and Phase 6
   shared-store requirement before scaling.
9. Representative-data performance targets and query-plan evidence.
10. No automatic deletion, temporary indefinite development retention, sanitized restore exercise,
    and production retention/backup decisions remaining blocked.
11. Four permissions and their default role assignments.
12. No new npm dependency, account, service, attachment storage, realtime/job infrastructure, or
    live-payment scope.
