# Phase 6 Acceptance Report

## Result

**PASS - repository implementation complete and verified on 2026-08-29.** ADR 0008's MySQL
transactional job/outbox, separate JavaScript worker, persistent notification, owner tooling, and
authenticated Socket.IO hint baseline is implemented. This is a repository/phase gate, not
production-launch approval; retained blockers are listed below.

## 2026-09-02 re-verification

The Phase 1–6 gate was rerun while repairing the deferred Razorpay integration. It passes 26 API
files / 123 tests, 5 web files / 38 tests, API coverage 83.90/73.04/93.54/87.77 and web coverage
83.55/73.36/82.36/85.93 (statements/branches/functions/lines), lint, formatting/Prisma validation,
production build, nine-migration status and drift for development/test, both audit verifiers, and
live API/worker/built-web smoke. The worker completed `ORDER_RESERVATION_EXPIRY_SWEEP` and
`AUDIT_CHAIN_VERIFY`, stopped cleanly, and its isolated test evidence was removed.

The representative Phase 6 profile was also rerun at 10,000 notifications. Current p95 values are
15.781 ms list, 34.647 ms unread count, 22.369 ms committed-job visibility, 24.423 ms persistent
materialization, and 32.766 ms connected-client hint. Every accepted target remains green.

## Acceptance criteria

| Criterion | Evidence | Result |
|---|---|---|
| No commit/enqueue gap | Domain jobs use the owning Prisma transaction; rollback integration leaves no work | Pass |
| At-least-once safety | Strict versioned descriptors, unique dedupe keys, all handler duplicate tests, current-state materialization | Pass |
| Concurrent durable claims | MySQL `FOR UPDATE SKIP LOCKED`, token/owner leases, renew/expiry/stale-token tests | Pass |
| Retry and failure control | Capped exponential jitter, safe attempts, timeout, terminal poison, dead letter, owner-only audited replay | Pass |
| Persistent recipient isolation | Monotonic cursor, ownership predicates, IDOR not-found, read/high-water semantics, safe projections | Pass |
| Authenticated real-time recovery | Exact origin/session, server room, recheck/disconnect, hint-only payload, reconnect REST catch-up | Pass |
| Operational visibility | Owner jobs page/API, status/age/stale/heartbeat health, safe JSON logs, runbook | Pass |
| Scope discipline | Existing MySQL only; exact Socket.IO pins; no Redis, BullMQ, external channel/account, AI, or arbitrary job route | Pass |

## Focused failure and security evidence

- Migration tests inspect eligibility/lease/cursor indexes, restrictive evidence relationships,
  seeded owner-only permissions, monotonic sequences, uniqueness, state/resource/size/hash checks,
  and database-level delete protection.
- Queue tests cover transaction rollback, concurrent disjoint claims, renewal, expired-lease crash
  recovery, stale completion, retry delay, handler timeout, poison version, terminal failure,
  dead-letter state, schedule dedupe, graceful draining, and idempotent replay/audit evidence.
- Every one of the nine notification materializers and both scheduled handlers is exercised.
  Duplicate delivery produces no second effect; missing/rolled-back source events produce no
  notification; delayed work displays current order/payment/refund/support/inventory truth.
- Notification tests cover active permission resolution, disabled users, safe metadata, duplicate
  suppression, cursor pages, latest history, unread count, high-water reads, CSRF, and cross-user
  IDOR.
- Socket tests cover exact-origin/session authentication, recipient isolation, revoked/expired/
  disabled disconnects, duplicate tabs, a bounded 20-connection storm, inbound-event rejection,
  connection caps/rates, and gateway shutdown.
- Job APIs prove unauthenticated and admin denial, owner list/detail/health, list payload omission,
  CSRF replay, repeat idempotency, one replay row, and absence of arbitrary create/delete routes.
- Worker and API logs accept only fixed safe scalar fields; canary payload, cookie, body, and stack
  values are absent.

## Final automated gate

- Lint: pass.
- Prettier check and Prisma schema validation: pass.
- API: 26 files / 121 tests pass.
- Web: 5 files / 36 tests pass.
- API coverage: 83.87% statements, 72.95% branches, 93.54% functions, 87.75% lines.
- Web coverage: 83.52% statements, 73.47% branches, 82.25% functions, 85.88% lines.
- Production web build: pass; 96 modules, 379.89 kB JavaScript (108.32 kB gzip), 25.20 kB CSS.
- Development/test migration status: all nine migrations current; development schema drift: none.
- Development/test audit chain verification: valid.
- Live isolated smoke: API health/database pass; worker starts and completes scheduled work; built
  web preview returns the app root; smoke listeners are stopped and test queue evidence cleaned.
- Representative profile: all five targets pass; exact measurements are in
  `PHASE-06-PERFORMANCE-EVIDENCE.md`.
- Git whitespace and high-confidence credential scans: pass; ignored `.env` files remain ignored.
- `socket.io@4.8.3` and `socket.io-client@4.8.3` are exact MIT-licensed pins compatible with the
  repository Node engine.

The first combined coverage run identified web function coverage of 79.43%, below the unchanged
80% gate. Focused socket-state, notification-read, job-filter, and refresh interactions were added;
the rerun passes at 82.25%. The threshold was not reduced.

## Decisions and rationale

- MySQL remains the single durability boundary. A database-backed queue avoids adding an
  unjustified broker for the accepted low-volume workload and makes source mutation plus enqueue
  atomic.
- Socket.IO sends only UUID/cursor hints. Persistent REST state is authoritative, so disconnects,
  restarts, missed hints, and duplicate hints do not lose notification history.
- Notification handlers validate a committed source and reload current state. This prevents
  phantom work and avoids moving visible truth backward when jobs execute out of order.
- Owner-only replay copies a registered descriptor; it never accepts client type/payload edits.
- No automatic history purge was invented without retention, erasure, legal-hold, audit, and
  backup policy.

## Retained risks and production blockers

- The Phase 4 external Razorpay Test Mode delivery/recovery gate remains deferred. Live payments
  remain prohibited.
- The 2026-09-02 `npm audit --omit=dev` reports six dependency findings (one moderate, five high):
  the existing `deepmerge-ts`/Prisma configuration issue, MariaDB connector credential/TLS/escaping
  advisories in the Prisma adapter tree, and a newer `mysql2` authentication-downgrade advisory in
  the Prisma CLI tree. Stable Prisma 7.10.0 retains all three affected transitive versions; npm
  offers only a breaking downgrade for part of the tree and no adapter fix. No forced or
  out-of-scope dependency change was made; compatible patched releases or a reviewed adapter
  alternative are required before production.
- Connection and rate accounting is per process. Multi-instance transport, shared hint/rate state,
  proxy topology, and failure behavior require a new decision and testing.
- Production worker/API supervision, remote database TLS/credential handling, monitoring/alerts,
  incident/on-call ownership, capacity/SLOs, backups/RPO/RTO, and deploy rollback remain undecided.
- Job/attempt/notification retention is temporarily indefinite in development/test. Privacy,
  erasure, legal hold, audit interaction, backup propagation, and purge schedules are unresolved.
- Local performance is a deterministic regression baseline, not concurrent soak, failover, or
  external SLA evidence.

## Transition

Phase 6 is repository-complete. Phase 7 must not start without explicit authorization and a fresh
decision gate for the Python/FastAPI boundary, model/provider accounts, secrets, data transmission,
assistant authorization, cost/retention, evaluation, and failure behavior.
