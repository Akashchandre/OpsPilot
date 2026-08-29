# Phase 6 Real-time and Background Jobs Decision Proposal

## Status

**ACCEPTED FOR IMPLEMENTATION on 2026-08-28.** The user approved this complete baseline and
explicitly authorized installation of `socket.io` and `socket.io-client` by instructing the agent
to “go ahead” after the approval/install handoff. ADR 0008 records the decision. Redis, BullMQ,
external services/accounts, multi-instance topology, and every explicitly deferred item remain
unauthorized.

## Objective and scope

Add a small, durable asynchronous boundary and authenticated in-app notifications without making
an ephemeral queue or socket connection the source of truth. The baseline covers:

- Transactionally created, MySQL-backed background jobs.
- A separately deployed JavaScript worker with leases, retries, dead-letter state, replay, and
  graceful shutdown.
- Persistent, recipient-owned in-app notifications and unread state.
- Authenticated Socket.IO hints that tell connected clients to refresh persistent notification
  state.
- Owner-only job inspection/replay, safe operational logs, health evidence, and failure runbooks.

Email, SMS, mobile push, support SLA/escalation automation, scheduled reports, report caching,
automatic payment reconciliation, multi-instance deployment, Redis, AI, and document processing
remain outside this initial baseline.

## Current constraints and evidence

- The application is single-business and currently runs one API instance against MySQL 8.4.
- Existing business transactions, opaque cookie sessions, CSRF/origin controls, deny-by-default
  permissions, HMAC audit evidence, and safe structured logging remain authoritative.
- MySQL documents `FOR UPDATE SKIP LOCKED` as suitable for multiple sessions consuming a
  queue-like table. This permits safe bounded claims without adding a second data service:
  [MySQL 8.4 SELECT documentation](https://dev.mysql.com/doc/refman/8.4/en/select.html).
- Socket.IO preserves message order but defaults to at-most-once arrival and does not replay
  server events missed while disconnected. Durable notification history and cursor recovery must
  therefore be implemented by OpsPilot, not assumed from the socket transport:
  [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees).
- Socket.IO rooms are server-only, which fits the requirement to derive recipient scope from the
  authenticated session rather than client-selected channels:
  [Socket.IO rooms](https://socket.io/docs/v4/rooms/).
- Socket.IO connection-state recovery is useful but explicitly not guaranteed, and authentication
  middleware must not be skipped during recovery:
  [Socket.IO connection-state recovery](https://socket.io/docs/v4/connection-state-recovery).
- BullMQ offers useful retry/backoff features, but requires Redis and still cannot atomically join
  a MySQL business transaction. Its own guidance also requires idempotent jobs:
  [BullMQ retries](https://docs.bullmq.io/guide/retrying-failing-jobs) and
  [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs).

## Proposed architecture decisions

### 1. Queue and outbox boundary

Use one MySQL `background_jobs` table as a transactional job outbox and durable work queue.
Business services insert a registered job descriptor through the same Prisma transaction as the
state change that produced it. A rolled-back transaction therefore produces no job, while a
committed job remains claimable after API or worker restarts.

Do not enqueue to an external broker after commit. That would recreate a commit/enqueue split and
still require an outbox. Do not use database triggers or MySQL Event Scheduler; application-owned
descriptors, validation, audit behavior, and tests remain visible in JavaScript.

Each descriptor contains only:

- A registered job type and integer schema version.
- A generated UUID job ID.
- A bounded deduplication key.
- Safe resource IDs and allowlisted scalar metadata in bounded JSON.
- `availableAt`, maximum attempts, and source request/actor context where permitted.

Passwords, cookies, session/CSRF tokens, provider credentials/signatures, raw webhook bodies,
addresses, ticket/message text, payment instruments, arbitrary URLs, and executable module/function
names are prohibited from job payloads. Handlers validate type-specific schemas before loading
current authoritative records from MySQL.

### 2. Worker process and claims

Run the worker as a distinct process from the existing API using an `@opspilot/api` script such as
`npm run start:worker --workspace @opspilot/api`. It remains Node.js/JavaScript and reuses reviewed
database, configuration, logger, audit, and domain-service boundaries; no Python service is added.

Workers claim a small ordered batch in a short transaction using indexed eligible-state/
`availableAt` predicates and `FOR UPDATE SKIP LOCKED`. Claiming assigns a random lease token,
worker instance UUID, and lease expiry. Business work occurs outside the claim transaction. A
completion update must match the job ID and lease token so a stale worker cannot overwrite a
reclaimed job.

One worker instance starts with concurrency `4`; each handler may set a lower concurrency. Worker
instances emit a database heartbeat identified only by a generated UUID, not a hostname or user
path. More workers may consume the same table, but representative concurrency tests are required
before raising the default.

### 3. Delivery, retry, timeout, and dead-letter semantics

Delivery is **at least once**. Duplicate execution is expected after timeouts, lease expiry, process
crash, or uncertain completion. Every handler must prove idempotency through a unique effect key,
an atomic conditional update, or both. A job may never rely only on an in-memory “seen” set.

Default policy:

- Claim poll interval: 500 ms.
- Lease: 30 seconds, renewed while an eligible handler is making progress.
- Default handler timeout: 30 seconds; type-specific overrides require documentation and an
  absolute ceiling.
- Maximum attempts: 8 including the first attempt.
- Retry: capped exponential backoff from 1 second to 15 minutes with bounded jitter.
- Retryable failures: transient database connectivity/deadlock, timeout, or explicitly registered
  temporary dependency state.
- Terminal failures: unknown type/version, invalid payload, missing required resource, forbidden
  state, unsupported handler version, or other registered non-retryable business error.
- Exhausted or terminal jobs enter `DEAD_LETTER`; they are never silently deleted.

Every attempt appends safe timing/outcome/error-code evidence. Stack traces and payloads are not
stored in database evidence or ordinary production logs.

### 4. Crash recovery, shutdown, and replay

If a worker dies, another worker may reclaim a `PROCESSING` job only after its lease expires. The
original worker can no longer complete it because its lease token is stale. Startup reconciliation
returns expired claims to eligible work without incrementing attempts twice.

On `SIGINT`/`SIGTERM`, the worker stops claiming, continues renewing current leases, waits up to 30
seconds for handlers, then disconnects. Work still running after the grace window is left for lease
recovery and is never marked successful merely because shutdown occurred.

Replay is owner-only and accepts no replacement type or payload. It creates a new linked job from a
dead-letter record using a UUID `Idempotency-Key`, revalidates that the handler schema is still
supported, preserves the original attempt history, and appends registered audit evidence in the
same transaction. There is no job edit, arbitrary enqueue, force-success, or deletion API.

### 5. Initial event and job inventory

Only the following business events may enqueue notification-materialization jobs in the initial
baseline:

| Event                                                      | Recipient rule                                                        | Notification outcome                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Order placed or status changed                             | Order owner                                                           | Current order state and safe order reference                                   |
| Payment state changed                                      | Order owner                                                           | Current payment state; no provider/payment-instrument data                     |
| Refund state changed                                       | Order owner                                                           | Current refund state and safe order reference                                  |
| Support ticket created                                     | Active users currently holding `support:tickets:read`                 | New-ticket operational notice                                                  |
| Support public reply created                               | Requester for staff reply; assigned/eligible staff for customer reply | Thread-update notice without message text                                      |
| Support assignment or status changed                       | Requester and current assignee as applicable                          | Current assignment/status notice                                               |
| Inventory crosses from above threshold to low/out-of-stock | Active users currently holding `inventory:read`                       | Product/stock attention notice without exact stock for unauthorized recipients |

The job handler resolves recipients and resource state at execution time. Deduplication keys include
the source transition/event ID and recipient, so retries cannot create duplicate notifications.
Out-of-order delivery presents current authoritative state and never moves a resource backward.

The initial scheduled job types are:

- `ORDER_RESERVATION_EXPIRY_SWEEP`: invoke the existing transaction-safe expiry behavior in bounded
  batches. Existing opportunistic expiry remains a recovery path.
- `AUDIT_CHAIN_VERIFY`: run the existing verifier on a documented schedule and dead-letter/log a
  safe integrity failure without trying to append to a chain already reported invalid.

Automatic Razorpay reconciliation, refund retries, email/SMS, support SLA/escalation, report
materialization, cleanup/purge, arbitrary cron expressions, and user-authored jobs are deferred.

Fixed schedules are registered in code rather than accepted from users or environment-provided
cron expressions. Every active worker may attempt to insert the current UTC time bucket; a unique
schedule deduplication key makes one insert win safely across workers. Reservation expiry runs once
per minute and the audit verifier once per UTC day. A worker starting after downtime inserts only
the current bucket because both handlers inspect all currently eligible state; it does not create
an unbounded job for every missed interval.

### 6. Persistence model

The reviewed migration should introduce:

| Table                     | Purpose                                          | Required controls                                                                                                                           |
| ------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `background_jobs`         | Durable transactional job/outbox and lease state | UUID ID; registered type/version/status; unique dedupe key; bounded JSON; available/lease/attempt/version timestamps; indexed claims        |
| `background_job_attempts` | Append-only execution evidence                   | Job/attempt uniqueness; worker UUID; safe outcome/error code; start/finish/duration; no payload/stack                                       |
| `worker_heartbeats`       | Observable worker liveness                       | Generated instance UUID; state; started/last-seen/stopped timestamps; no hostname/path                                                      |
| `notifications`           | Persistent recipient-owned history               | UUID plus monotonic cursor; recipient FK; registered type; unique dedupe key; explicit optional resource FKs; safe metadata; read timestamp |

Use explicit nullable foreign keys such as `orderId`, `supportTicketId`, `paymentId`, or `productId`
for notification actions rather than an unconstrained polymorphic resource string. MySQL remains the
sole durable source of business, job, and notification state. Redis/cache state, if added by a
later decision, may be discarded without losing this history.

No automatic purge is implemented in this baseline. Temporary indefinite development/test
retention remains clearly documented as a production blocker until privacy, erasure, legal-hold,
and operations policies define notification and job-evidence schedules.

### 7. Notification API and UI

Recommended versioned endpoints:

- `GET /api/v1/notifications?after=<cursor>&limit=<1..100>`
- `GET /api/v1/notifications/unread-count`
- `PATCH /api/v1/notifications/:notificationId/read`
- `POST /api/v1/notifications/read-all` with a validated high-water cursor
- `GET /api/v1/jobs` and `GET /api/v1/jobs/:jobId` for `jobs:read`
- `POST /api/v1/jobs/:jobId/replay` for `jobs:replay`, CSRF, UUID idempotency, and audit evidence

Notification queries always derive recipient ID from the active session and use not-found behavior
for another user's ID. Cursor pagination uses the monotonic notification sequence; clients cannot
choose a recipient. Mark-one and mark-through-cursor operations are idempotent and cannot alter
notification type/resource/data.

The React baseline adds a notification indicator/history panel for every authenticated user and an
owner-only job health/dead-letter page. Loading, empty, offline, reconnecting, permission, stale,
duplicate, replay-conflict, and failure states are required. Socket availability never blocks REST
history or ordinary business workflows.

### 8. Real-time transport

Add Socket.IO to the existing Node HTTP server and `socket.io-client` to the React application.
Use one `/notifications` namespace. No browser-originated business mutation is accepted over the
socket; all writes remain versioned REST operations with the existing CSRF/origin protections.

Handshake controls:

- Require the exact configured web origin.
- Authenticate the existing opaque session cookie against MySQL; never accept a user/role/room or
  bearer token from query parameters.
- Run authentication middleware for every new or recovered connection (`skipMiddlewares: false`).
- Join only a server-derived `user:<userId>` room. Clients cannot request rooms.
- Recheck session status/expiry at least every 30 seconds and disconnect inactive, expired, or
  revoked sessions.
- Bound handshake rate, per-user connection count, inbound packet size, and event allowlist. The
  initial client sends no application event.

The server emits only a small `notification.changed` hint containing the notification UUID and
monotonic cursor. It does not send ticket text, addresses, report data, payment/provider metadata,
job payloads, permissions, or arbitrary resource content. The client then reads its authorized
persistent state through REST.

An API-local poller watches new notification cursors and emits hints to sockets connected to that
API instance. On first connect, reconnect, missed hint, server restart, or unsuccessful Socket.IO
state recovery, the client performs a bounded REST catch-up from its last cursor. Duplicate hints
are harmless. This deliberately treats Socket.IO as an availability optimization, not a durable
delivery mechanism.

### 9. Redis, caching, and scaling decision

**Recommendation: do not add Redis, BullMQ, a Socket.IO Redis adapter, or distributed cache in the
initial Phase 6 baseline.** The proposed workload is low-volume internal notification and
maintenance work, MySQL already supplies transactional durability and queue-like locking, and the
current deployment is single-instance.

Before more than one API instance, separately approve and test proxy stickiness/transport,
cross-instance hint distribution or per-instance MySQL polling, connection recovery, shared rate
limits, worker sizing, and dependency outage behavior. Socket.IO documents that its ordinary Redis
adapter uses Pub/Sub, loses cross-node packets during a Redis outage, and does not support
connection-state recovery. A future scale decision must compare the Redis Streams adapter and
other supported choices rather than silently enabling the first adapter:
[Socket.IO Redis adapter](https://socket.io/docs/v4/redis-adapter/).

### 10. Permissions and audit

Add two permissions:

- `jobs:read`: owner-only access to safe job/attempt/worker health projections.
- `jobs:replay`: owner-only idempotent replay of an eligible dead-letter job.

Customer and staff notification access is ownership-scoped and needs no new permission. `ADMIN`
does not receive job inspection/replay by default. The full proposed mapping is in
`docs/permissions/PHASE-06-PERMISSION-MATRIX.md`.

Register audit actions for successful job-health reads and replay requests/results. Do not append a
general audit event for each ordinary notification read/unread click or every internal worker state
transition; immutable job attempts and existing domain audit events provide the narrower evidence.

### 11. Operational visibility and service targets

Allowlisted worker logs may contain timestamp, service, environment, event, worker UUID, job UUID,
registered type, attempt, status, duration, queue age, and safe error code. They must not contain job
payloads, notification text, user email/name, resource content, headers, cookies, or stack traces in
ordinary production output.

The owner health projection should expose bounded aggregate counts by state/type, oldest eligible
job age, dead-letter count, and worker last-seen state. It must not return payload JSON in list
responses. A detail projection may return only the registered safe descriptor fields.

Initial engineering targets on the documented local baseline:

- Committed notification job visible to a worker: p95 below 1 second.
- Persistent notification materialized: p95 below 5 seconds.
- Connected-client hint after notification commit: p95 below 2 seconds.
- Bounded notification list/unread API: p95 below 300 ms on representative data.
- Graceful shutdown completes within 30 seconds for normal handlers.

These are repository regression targets, not external SLAs. Hosted monitoring, alert delivery,
on-call ownership, multi-instance availability, and production SLOs remain deployment decisions.

## Dependency, account, connection, and environment review

### Proposed packages

| Workspace       | Package            | Why needed                                                                             | Alternative rejected                                                                                                           |
| --------------- | ------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `@opspilot/api` | `socket.io`        | Authenticated namespace, middleware, rooms, reconnect protocol, and server integration | Raw WebSocket requires rebuilding protocol/rooms/reconnect; SSE does not match the proposed future-capable connection boundary |
| `@opspilot/web` | `socket.io-client` | Browser reconnect and Socket.IO protocol compatibility                                 | Hand-written transport would duplicate maintained client behavior                                                              |

Pin exact compatible current versions only after approval and run license, engine, package-audit,
test, and build checks. Do not install `bullmq`, `redis`, `ioredis`, `@socket.io/redis-adapter`, `ws`
directly, or a hosted telemetry SDK under this proposal.

### Accounts and connections

No new account or hosted service is required. The worker and API use the existing least-privilege
MySQL connection configuration. Production process supervision, network topology, hosted metrics,
and alert delivery remain unresolved deployment concerns.

### Proposed non-secret environment variables

| Variable                                 |  Default | Purpose                                                 |
| ---------------------------------------- | -------: | ------------------------------------------------------- |
| `WORKER_POLL_INTERVAL_MS`                |    `500` | Delay between empty job claims                          |
| `WORKER_CONCURRENCY`                     |      `4` | Maximum concurrent ordinary handlers per worker process |
| `JOB_LEASE_SECONDS`                      |     `30` | Claim lease and renewal interval basis                  |
| `JOB_MAX_ATTEMPTS`                       |      `8` | Default total attempts including first execution        |
| `JOB_RETRY_BASE_MS`                      |   `1000` | Exponential retry base                                  |
| `JOB_RETRY_MAX_MS`                       | `900000` | Retry delay ceiling                                     |
| `WORKER_SHUTDOWN_GRACE_SECONDS`          |     `30` | Maximum normal shutdown drain window                    |
| `REALTIME_NOTIFICATION_POLL_INTERVAL_MS` |    `500` | API-local notification cursor poll interval             |
| `REALTIME_SESSION_RECHECK_SECONDS`       |     `30` | Maximum interval before connection session revalidation |
| `REALTIME_MAX_CONNECTIONS_PER_USER`      |      `5` | Per-process duplicate-tab/device ceiling                |
| `REALTIME_CONNECTION_RATE_LIMIT_MAX`     |     `20` | Per-user/source handshake ceiling per minute            |

All values receive bounded fail-fast validation. None is secret. No `REDIS_URL`, broker credential,
socket token, or client-visible secret is introduced.

## Proposed implementation sequence after approval

1. Record accepted decisions in ADR 0008 and obtain explicit package-install instruction.
2. Pin/install the two Socket.IO packages; run dependency/license/engine/audit review before code.
3. Add the reviewed job/attempt/heartbeat/notification schema, constraints, indexes, two
   permissions, and migration tests.
4. Implement registered job descriptors, transactional enqueue, MySQL claim/lease/renewal,
   retries, attempts, dead-letter state, replay, and graceful worker shutdown.
5. Retrofit only the approved domain transitions and implement the two scheduled handlers with
   same-transaction enqueue and idempotency tests.
6. Implement ownership-safe notification APIs/UI and owner-only job health/replay tooling.
7. Attach the authenticated Socket.IO namespace and REST catch-up behavior; keep business writes
   on REST.
8. Add failure, crash, duplicate, ordering, disconnect, authorization, load/performance, recovery,
   regression, runbook, and acceptance evidence.

## Minimum test and acceptance gate

- Migration constraints, permission mappings, claim indexes, monotonic cursor, dedupe uniqueness,
  and safe delete relationships.
- Commit/rollback enqueue behavior; concurrent `SKIP LOCKED` claims; stale lease tokens; lease
  renewal/expiry; crash recovery; graceful shutdown; timeout; retry/backoff; terminal failure;
  dead-letter; idempotent replay; poison payload/version rejection.
- Every registered handler proves duplicate and out-of-order safety and never performs an effect
  for a rolled-back source transaction.
- Notification recipient, cross-user IDOR, safe projection, unread/read-all cursor, duplicate,
  pagination, disabled-session, and permission-change tests.
- Socket exact-origin/session authentication, recovery middleware, server-derived rooms,
  cross-user isolation, revoked/expired session disconnect, duplicate tabs, reconnect/REST catch-up,
  missed/duplicate hint, inbound-event rejection, rate/size limits, and shutdown tests.
- Worker/queue health and replay APIs prove owner-only access, payload/log redaction, CSRF,
  idempotency, audit evidence, and no arbitrary enqueue/edit/delete route.
- Representative queue latency, notification API p95, reconnect storm, worker concurrency, database
  outage/recovery, and API/worker termination evidence.
- Full Phase 1–5 lint, format/Prisma validation, unit/integration, coverage, build, migration/drift,
  live API/web/worker smoke, audit verification, whitespace, and credential scans remain green.

## Approval checklist

Explicitly approve or change:

1. MySQL `background_jobs` as both transactional outbox and durable queue; no external broker.
2. At-least-once delivery, lease-token claims, 30-second default lease/timeout, eight attempts,
   capped exponential backoff, and dead-letter behavior.
3. Owner-only immutable replay that creates a linked job; no arbitrary enqueue/edit/delete.
4. The exact initial business event, notification, and scheduled-job inventory.
5. Four proposed tables and explicit notification foreign keys.
6. Persistent in-app history, cursor pagination, unread/read-all behavior, no preferences, and no
   automatic purge during the temporary development baseline.
7. Socket.IO as a hint layer only; REST/MySQL remain authoritative.
8. Exact-origin opaque-session handshake, server-only user rooms, 30-second revalidation, no socket
   business writes, and safe hint payload.
9. Single-instance API baseline and no Redis/BullMQ/cache/shared limiter in this implementation.
10. `jobs:read` and `jobs:replay` assigned only to `OWNER`.
11. Operational projections/log fields, worker heartbeat, and engineering latency/shutdown targets.
12. The proposed environment variables and no new secret/account/hosted service.
13. Later explicit installation of only `socket.io` and `socket.io-client` after approval.
14. Test, failure, security, performance, recovery, documentation, and acceptance gates.

## Explicitly deferred

- Redis, BullMQ, broker hosting, Socket.IO scale adapters, horizontal API scale, distributed rate
  limits, cache/materialized reports, and production load-balancer topology.
- Email, SMS, mobile/web push, third-party notification providers, user notification preferences,
  arbitrary subscriptions, and client-to-server socket business events.
- Payment-provider reconciliation/refund retry automation until Phase 4 provider delivery and
  operational rules are accepted.
- Support SLA/escalation/auto-close, scheduled report delivery, general cron, user-authored jobs,
  and automatic data purge.
- Production retention/privacy/legal-hold policy, hosted monitoring/alerting, on-call ownership,
  deployment supervision, Docker/CI/CD/AWS, and final external SLOs.
- Python/FastAPI, AI assistants, model providers, documents, embeddings, RAG, vector databases, and
  LangGraph.
