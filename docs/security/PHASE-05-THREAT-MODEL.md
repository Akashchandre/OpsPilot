# Phase 5 Support, Reporting, Audit, and Hardening Threat Model

## Status

**PROPOSED on 2026-08-27 — IMPLEMENTATION AND VERIFICATION PENDING.** This threat model accompanies
the Phase 5 decision proposal and does not claim that the proposed controls exist yet.

## Scope

This model covers support tickets/messages, linked-order context, staff triage, the overview
report, audit evidence, structured logs/correlation, rate/proxy/payload controls, performance data,
and backup/restore procedures. It inherits Phase 2 authentication/RBAC, Phase 3 catalog/inventory,
and Phase 4 order/payment boundaries.

Attachments, email/SMS, realtime delivery, queues/workers, hosted observability, production backup
infrastructure, live payments, and AI remain out of scope.

## Assets and trust boundaries

- Ticket content, internal notes, requester/assignee identities, linked orders, report totals,
  audit evidence, logs, backups, credentials, and request-rate identity are protected assets.
- Browser input, ticket text, filters, correlation/proxy headers, timestamps, IDs, and restored data
  are untrusted until validated and authorized.
- The Node.js API derives requester/actor scope from the authenticated session and checks explicit
  permissions for every staff, report, and audit action.
- Services own ticket transitions, idempotency, assignment eligibility, report definitions, audit
  field allowlists, and transaction boundaries. Prisma/MySQL constraints are the final local
  integrity boundary.
- Structured stdout/stderr and backup destinations are external operational boundaries. They must
  never be treated as authorization sources.
- Razorpay remains a separate unresolved external boundary governed by the Phase 4 threat model.

## Threats and required controls

| Threat | Required Phase 5 control | Residual risk / follow-up |
|---|---|---|
| Customer reads or mutates another user's ticket | Session-derived requester predicate on every self-service query; not-found behavior; negative IDOR tests | Multi-business use still requires tenant isolation redesign |
| Customer links another user's order | Ownership check in the ticket-creation transaction; no client-supplied requester; safe not-found response | Staff-linked resources beyond one order remain deferred |
| Internal note leaks through customer detail, count, search, or events | Separate visibility enum and projection/query filters at the service boundary; response-shape tests | Privileged staff can still see internal notes by design |
| Stored script/HTML injection in ticket content | Plain-text-only normalization, bounded length, JSON transport, React text rendering, no raw HTML | Links/markdown/rich text require a later sanitizer decision |
| Duplicate ticket/message after retry | UUID idempotency key, normalized request digest, scoped unique constraint, same-result replay | Management PATCH retries rely on versions and explicit conflict recovery |
| Concurrent status/priority/assignment overwrites | Optimistic version condition plus append-only event in one transaction | High contention may require measured retry guidance |
| Unauthorized or stale assignee | Resolve current `support:tickets:manage` permission and active account in the write transaction | Later custom-role changes need equivalent eligibility checks |
| Customer manipulates status or priority | Separate customer closure route and strict management permission/state allowlists | Compromised staff sessions remain a privileged risk |
| Support spam or resource exhaustion | Authentication, field/body limits, per-user/source support-write limit, bounded pagination, no attachments | Distributed abuse control requires a shared Phase 6 store/edge controls |
| Report reveals unauthorized row-level or financial data | `reports:read`, aggregate-only response, exact metric contract, no arbitrary dimensions or raw records | Small-group inference needs review if future segmentation is added |
| Expensive or malformed report range causes denial of service | Strict RFC 3339 UTC parsing, half-open range, 366-day cap, allowlisted metrics, report rate limit, reviewed indexes | Live-query growth may later justify summaries/caching |
| Decimal/time boundary produces wrong totals | Prisma decimal aggregation/review, INR-only strings, explicit UTC range, refund/capture tests at boundaries | Results are payment flow, not tax/accounting recognition |
| Attacker edits, deletes, or reorders audit rows | Serialized append, previous hash, HMAC-SHA256, sequence, key ID, verification procedure, restricted read/no mutation API | Database plus key compromise can forge history; external anchoring/SIEM is deferred |
| Secret or PII enters audit metadata | Per-action metadata schemas and denylist defense; no raw bodies/headers/ticket text/address/payment instrument | New audit actions require security review before registration |
| Audit failure leaves an unrecorded privileged local change | Audit append participates in the same transaction and local mutation fails closed | External provider side effects retain reconciliation risk |
| Audit read recursively creates unbounded events | Read event is appended once outside the result query and never triggers another read | Failed logging/audit storage still needs operational alerting later |
| Log forging or correlation spoofing | Server-generated UUID request ID, JSON serialization, allowlisted scalar fields, ignore client IDs | Cross-service trace propagation needs a later trusted-boundary contract |
| Credentials, PII, payment data, or ticket content enters logs | Never serialize headers/cookies/query/body; safe error classification; redaction tests with canary secrets | Developer-added fields remain a review risk |
| Forwarded-header spoofing bypasses rate limits | Proxy trust disabled by default; exact configured hop count only; tests for untrusted chains | Deployment topology must supply the correct hop count |
| In-process limiter is bypassed across replicas/restarts | Explicit single-instance limitation and documented Phase 6 shared-store gate | It is not a production-scale distributed abuse control |
| Webhook abuse limit blocks legitimate Razorpay retries | Separate high ceiling, strict raw size/signature boundary, stable `Retry-After`, operational tuning | Provider delivery remains unverified until Phase 4 smoke |
| Backup exposes database contents or secrets | Encrypted destination, least privilege, checksums, secret-safe commands, isolated restore, sanitized exercise | Vendor, geography, RPO/RTO, retention, and legal obligations remain undecided |
| Indefinite retention violates privacy duties | Clearly label temporary no-purge behavior as a production blocker; no casual delete endpoint | Jurisdiction, erasure, legal hold, and schedules require business/legal input |
| Representative-data test leaks real data | Deterministic synthetic generator only; reject production connection; no copied identifiers/content | Performance may differ from production distributions |

## Required verification after approval

- Anonymous, disabled, cross-user, and under-permissioned callers cannot access ticket, internal
  note, report, or audit data.
- Every support write enforces trusted origin, CSRF, validation, ownership/permission, state,
  idempotency or version controls, and transaction-safe event/audit evidence.
- Ticket text renders as text and never executes markup; internal content is absent from all
  customer projections, counts, searches, and errors.
- Report ranges, UTC boundaries, empty datasets, decimals, captured/refunded states, and current
  snapshots match the documented query definitions.
- Audit chain verification detects field mutation, deletion, insertion/reordering, wrong keys, and
  broken head state; unauthorized users cannot read or mutate the stream.
- Injected audit failures roll back critical local privileged mutations. Provider-bound ambiguity
  remains recoverable through existing payment state and reconciliation.
- Logs contain request correlation and operational outcome but no canary cookies, tokens,
  passwords, CSRF values, provider signatures, bodies, addresses, payment metadata, or ticket text.
- General/support/report/webhook limits expire correctly, return safe `429` responses, and do not
  trust spoofed forwarding headers.
- Query-plan/performance evidence uses synthetic data and the restore exercise uses an isolated,
  non-production target with no secrets in artifacts or command history.

## Production blockers retained

Before production launch, select the jurisdiction/privacy obligations, retention and deletion
rules, legal-hold process, production backup destination and encryption ownership, RPO/RTO,
restore cadence, hosted monitoring/alerting, incident response, proxy topology, horizontally shared
rate controls, and all Phase 4 live-payment gates.
