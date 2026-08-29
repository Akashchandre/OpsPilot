# Phase 6 Operations and Recovery Runbook

## Scope

This runbook covers the single-API/single-MySQL Phase 6 baseline. It does not approve production
deployment, horizontal scaling, Redis, an external broker, hosted monitoring, or external
notification channels.

## Start and stop

Apply migrations and start the API and worker as separately supervised processes:

```text
npm run db:deploy
npm run start --workspace @opspilot/api
npm run start:worker --workspace @opspilot/api
```

Send `SIGTERM`/`SIGINT` through the process supervisor. The worker stops new claims, marks its
heartbeat `STOPPING`, waits up to `WORKER_SHUTDOWN_GRACE_SECONDS` for in-flight handlers, then marks
itself `STOPPED`. Work that exceeds the grace period is not marked successful; its lease is later
reconciled. The API closes Socket.IO and then the HTTP server/database boundary.

## Normal health checks

- Public readiness: `GET /api/v1/health` must report `ok` and `reachable` database state.
- Owner queue view: `/admin/jobs` or `GET /api/v1/jobs/health`.
- Check counts by `PENDING`, `PROCESSING`, `SUCCEEDED`, and `DEAD_LETTER`.
- Investigate nonzero stale processing, growing oldest-pending age, dead-letter growth, or missing/
  stale active heartbeats.
- Worker logs are allowlisted JSON. Correlate only safe `workerId`, `jobId`, type, status, attempt,
  duration, queue age, and error code; payloads and stack traces are deliberately absent.

These are engineering signals, not production alert thresholds. Alert ownership and paging policy
remain undecided.

## Dead-letter inspection and replay

1. Sign in as an active owner with `jobs:read` and `jobs:replay`.
2. Inspect the registered safe descriptor, attempt outcomes, and safe error code.
3. Correct the underlying dependency/data issue. Do not edit the stored descriptor or state.
4. Select **Replay** once. The client keeps one UUID idempotency key across an ambiguous retry.
5. Confirm one linked `PENDING` replay and one `BACKGROUND_JOB_REPLAYED` audit event.

Do not replay `AUDIT_INTEGRITY_INVALID` until the audit incident is investigated. There is no
arbitrary enqueue, force-success, cancellation, or deletion endpoint.

## Worker crash or expired lease

- Start a healthy worker using the same reviewed configuration.
- The periodic reconciler finds `PROCESSING` rows whose lease expired.
- If attempts remain, the row returns to `PENDING` with `LEASE_EXPIRED`; otherwise it becomes a
  dead letter.
- A late/stale worker completion is rejected by token-and-owner matching.
- Repeated lease expiry indicates a handler exceeding its reviewed timeout, database latency, host
  suspension, or insufficient capacity; inspect before replaying.

## Database outage

- Both API REST authorization and worker claims fail closed because MySQL is authoritative.
- The worker records `worker.poll_failed`, waits the bounded poll interval, and retries; it does not
  synthesize success or discard leases.
- Socket notification polling logs one safe failure and retries on its next interval. Connected
  clients retain REST history/offline state.
- Restore database connectivity first, verify `GET /health`, restart supervision if needed, then
  inspect stale leases, pending age, dead letters, and the audit chain.
- Never point a worker at a partially restored database. Follow the Phase 5 checksum/restore and
  audit-verification procedure before resuming claims.

## Real-time degradation

Socket.IO is optional delivery acceleration. If hints fail:

- ordinary REST business actions continue;
- clients show offline/reconnecting state and read persistent history;
- reconnect triggers cursor catch-up; duplicate or missed hints are harmless;
- exact-origin, session, connection-rate, and per-user connection limits must not be disabled as a
  workaround.

Before adding a second API instance, approve and test load-balancer transport/stickiness,
cross-instance hint distribution, shared connection/rate accounting, and recovery semantics. Do
not assume the current in-process maps coordinate across instances.

## Fixed schedules

- Reservation expiry is deduped once per UTC minute and processes bounded batches.
- Audit verification is deduped once per UTC day.
- Multiple workers may attempt schedule insertion; the descriptor dedupe constraint makes only one
  logical job.
- Existing opportunistic reservation expiry remains a recovery path.

## Retention and deletion

No automatic purge exists for jobs, attempts, heartbeats, or notifications. Do not delete rows
manually: foreign keys preserve evidence and no deletion API is approved. Indefinite local/test
retention is temporary. Production requires business/legal decisions for privacy, erasure, legal
hold, audit interaction, schedules, capacity, and backup propagation.

## Dependency security blockers

The final local audit reports Prisma/deepmerge findings for which npm proposes only a breaking
forced Prisma downgrade, plus transitive `mariadb` connector advisories with no available fix in
the installed adapter tree. The local database uses loopback and `utf8mb4`; those facts do not
close the production risk. Before production, obtain compatible patched Prisma/adapter/connector
versions or an explicit reviewed alternative, and verify remote database TLS/credential handling.
