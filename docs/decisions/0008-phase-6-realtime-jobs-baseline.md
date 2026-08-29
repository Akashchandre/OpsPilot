# ADR 0008 — Phase 6 Real-time and Background Jobs Baseline

## Status

Accepted on 2026-08-28 by the user's explicit “go ahead” after receiving the complete Phase 6
decision proposal and the request to approve that baseline plus installation of `socket.io` and
`socket.io-client`.

Phase 4's external Razorpay Test Mode smoke remains deferred under ADR 0006. This decision does
not accept Phase 4, authorize Live Mode, or approve automatic provider reconciliation.

## Context

Phase 5 is repository-complete and committed as `10e73ac`. OpsPilot now needs a small durable
asynchronous boundary and authorized real-time notification experience before later AI phases.
The current topology is one JavaScript API instance and MySQL 8.4; there is no approved Redis,
broker, hosted notification provider, deployment vendor, or multi-instance topology.

The complete behavior, security controls, permissions, event/job inventory, configuration,
dependency review, service targets, and test gate are recorded in
`docs/phase-6/PHASE-06-DECISION-PROPOSAL.md`.

## Decision

- Use a MySQL `background_jobs` table as both the transactional outbox and durable work queue.
  Domain services enqueue registered descriptors in the same transaction as their source change.
- Run a separate Node.js/JavaScript worker process that claims bounded batches with indexed
  `FOR UPDATE SKIP LOCKED`, random lease tokens, expiry/renewal, and stale-token-safe completion.
- Use at-least-once delivery. Every handler must be idempotent through unique effect evidence,
  atomic conditional changes, or both.
- Use an eight-attempt default, capped exponential retry with bounded jitter, explicit retryable/
  terminal errors, append-only attempt evidence, visible dead-letter state, and owner-only linked
  replay. No arbitrary enqueue, payload edit, force-success, cancel, or delete endpoint is added.
- Add only the accepted notification-producing order, payment, refund, support, and inventory
  transition events plus fixed reservation-expiry and audit-verification schedules. Arbitrary cron,
  support SLA automation, report jobs, and automatic Razorpay reconciliation are deferred.
- Persist recipient-owned notifications in MySQL with a monotonic cursor, unique deduplication,
  explicit resource foreign keys, safe registered metadata, and idempotent read state.
- Add Socket.IO as an authenticated notification-change hint layer only. Persistent REST/MySQL
  state is authoritative; socket disconnects recover through cursor-based REST catch-up.
- Authenticate the exact-origin Socket.IO handshake with the existing opaque session, run
  middleware during recovery, derive only a server-side user room, recheck sessions periodically,
  accept no browser business mutation, and emit only notification ID/cursor hints.
- Add `jobs:read` and `jobs:replay` only to `OWNER`. Customer/staff notification access remains
  session-derived and ownership-scoped.
- Add `socket.io` to `@opspilot/api` and `socket.io-client` to `@opspilot/web`, pinned to reviewed
  compatible versions. The user explicitly authorized this installation.
- Add no Redis, BullMQ, broker, external account, hosted notification channel, cache, distributed
  rate store, or new secret.
- Keep the API topology single-instance for this baseline. Horizontal scaling requires a later
  explicit decision covering proxy stickiness/transport, cross-instance hints, shared rate limits,
  adapter outage/recovery, and representative load evidence.
- Implement no automatic notification/job purge while retention, erasure, legal-hold, and
  production operations policy remains unresolved. Temporary indefinite development/test
  retention remains a production blocker.

## Initial inventory

Notification-producing transitions:

- Order placed or order status changed.
- Payment status changed.
- Refund status changed.
- Support ticket created, public reply created, assignment changed, or status changed.
- Inventory crossing from above its threshold into low/out-of-stock state.

Fixed scheduled jobs:

- Reservation expiry sweep once per UTC minute.
- Audit-chain verification once per UTC day.

Handlers load current authoritative state and resolve recipients at execution time. Source-event/
recipient deduplication prevents retry duplicates, and out-of-order work never moves domain state
backward.

## Persistence and authorization

The reviewed migration will add `background_jobs`, `background_job_attempts`,
`worker_heartbeats`, and `notifications`, plus the two owner-only job permissions. Notification
resource links use explicit nullable foreign keys rather than an unconstrained polymorphic target.

Job payloads are registered, versioned, bounded, and safe by construction. They cannot contain
credentials, session material, provider signatures, raw bodies, addresses, ticket/message text,
payment instruments, arbitrary URLs, or executable module/function names.

## Implementation sequence

1. Verify and pin the two approved Socket.IO dependencies with engine/license/audit review.
2. Add configuration validation plus the four-table/two-permission migration and constraint tests.
3. Implement descriptor registry, transactional enqueue, claims/leases, worker execution,
   retries/attempts/dead-letter/replay, fixed scheduling, heartbeats, and graceful shutdown.
4. Retrofit only the accepted domain transitions and scheduled handlers with duplicate/rollback/
   out-of-order tests.
5. Implement notification APIs/UI and owner job health/replay tooling.
6. Attach the authenticated Socket.IO namespace and cursor-based REST recovery.
7. Complete security, failure, concurrency, outage, load/performance, recovery, regression,
   runbook, documentation, and acceptance gates.

## Considered alternatives

- BullMQ/Redis was rejected for the initial workload because it adds another service and failure
  boundary while still requiring a MySQL transactional outbox to prevent commit/enqueue gaps.
- A raw WebSocket server was rejected because it would require rebuilding maintained connection,
  middleware, room, and reconnection protocol behavior.
- Server-Sent Events was rejected for this baseline in favor of the approved future-capable
  Socket.IO connection boundary, while still prohibiting socket business mutations.
- Treating Socket.IO delivery as durable was rejected because missed server events require
  application persistence/recovery; notifications remain durable in MySQL.
- Automatic payment reconciliation and refund retry jobs were deferred until the unresolved Phase
  4 provider delivery/recovery gate and operational policy are accepted.
- Redis-backed shared rate limiting and Socket.IO adapters were deferred until horizontal scaling
  is approved and measured.

## Consequences

Phase 6 adds two npm packages, four relational tables, new cross-cutting transactional job inserts,
a separately supervised worker process, and an authenticated connection lifecycle. MySQL receives
additional polling and claim traffic, so indexes, bounded batches, query plans, concurrency tests,
and representative latency evidence are mandatory.

At-least-once execution simplifies durable recovery but requires every handler to prove
idempotency. Real-time delivery remains best effort; the persistent REST API is the recovery and
authorization boundary. Production process supervision, monitoring/alerts, retention/privacy,
backup/RPO/RTO, capacity/SLOs, and multi-instance behavior remain blockers rather than invented
defaults.

## Related documents

- `docs/phase-6/PHASE-06-DECISION-PROPOSAL.md`
- `docs/permissions/PHASE-06-PERMISSION-MATRIX.md`
- `docs/security/PHASE-06-THREAT-MODEL.md`
- `docs/phases/PHASE-06-REALTIME-JOBS.md`
- `docs/decisions/0007-phase-5-production-backend-baseline.md`
- `docs/decisions/0006-phase-4-provider-smoke-deferral.md`
