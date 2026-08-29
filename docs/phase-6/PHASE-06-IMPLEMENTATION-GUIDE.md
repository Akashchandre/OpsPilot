# Phase 6 Implementation Guide

## Result

Phase 6 implements the ADR 0008 single-instance baseline: MySQL is the durable job/outbox and
notification store, a separate JavaScript process executes registered work, and Socket.IO carries
recipient-scoped change hints only. Redis, BullMQ, external notification channels, arbitrary job
submission, and multi-instance coordination were not added.

## Runtime topology

```text
React browser
  |-- versioned REST + opaque cookie session --> Express API
  |                                               |-- domain transaction
  |-- /notifications Socket.IO hint <-------------|-- API-local cursor poller
                                                  |
                                                  v
                                      MySQL jobs + notifications
                                                  ^
                                                  |
                                      separate JavaScript worker
```

Domain services insert a validated job in the same Prisma transaction as the source mutation.
Workers claim eligible rows with `FOR UPDATE SKIP LOCKED`, a random lease token, owner ID, expiry,
and immutable attempt evidence. A handler reloads current domain state before producing an effect.
This is at-least-once execution: dedupe keys and notification uniqueness make redelivery safe.

## Registered job and notification catalog

All descriptors use schema version `1`, strict bounded JSON, UUID resource/source IDs, and a stable
dedupe key. Payloads never contain message bodies, ticket subjects, addresses, payment credentials,
provider payloads, cookies, or secrets.

| Job type | Source/trigger | Durable effect and recipients |
|---|---|---|
| `NOTIFICATION_ORDER_PLACED` | Committed order status event | Current order state to its customer |
| `NOTIFICATION_ORDER_STATUS_CHANGED` | Committed order status event | Current order state to its customer |
| `NOTIFICATION_PAYMENT_STATUS_CHANGED` | Committed audit, order, or verified webhook event | Current payment state to the order customer |
| `NOTIFICATION_REFUND_STATUS_CHANGED` | Committed refund, audit, or verified webhook event | Current refund state to the order customer |
| `NOTIFICATION_SUPPORT_TICKET_CREATED` | Committed support-created event | Active users currently holding `support:tickets:read` |
| `NOTIFICATION_SUPPORT_PUBLIC_REPLY_CREATED` | Committed customer-visible message | Requester or assigned/authorized operator, excluding the author |
| `NOTIFICATION_SUPPORT_ASSIGNMENT_CHANGED` | Committed assignment event | Current requester and current assignee |
| `NOTIFICATION_SUPPORT_STATUS_CHANGED` | Committed status event | Current requester and current assignee |
| `NOTIFICATION_INVENTORY_LOW` | Committed adjustment crossing the threshold | Active users currently holding `inventory:read`; no effect after stock recovers |
| `ORDER_RESERVATION_EXPIRY_SWEEP` | One idempotent UTC-minute schedule | Bounded expiry batches through the existing safe reservation service |
| `AUDIT_CHAIN_VERIFY` | One idempotent UTC-day schedule | Verifies the full HMAC audit chain; integrity failure is terminal |

Notification dedupe is recipient/type/source-event scoped. The materializer validates that the
source event committed and belongs to the referenced resource, resolves permissions at execution
time, and renders only allowlisted metadata from current authoritative state. Missing sources,
unsupported versions, invalid payloads, and integrity failures are terminal poison work.

## Queue lifecycle

1. A source transaction inserts a `PENDING` job with a unique descriptor key.
2. A worker heartbeat becomes `ACTIVE`; a short read-committed claim transaction locks a bounded
   eligible batch with `SKIP LOCKED`.
3. Each claimed row becomes `PROCESSING`, receives an opaque lease token/owner/expiry, increments
   its attempt, and creates an attempt row containing only the token hash and safe timing fields.
4. The worker renews the lease while a handler runs. Completion succeeds only with the matching
   token and owner.
5. Retryable failure returns the job to `PENDING` with capped exponential backoff plus 0-20%
   jitter. Terminal or exhausted work becomes `DEAD_LETTER`.
6. Expired leases are reconciled to a retry or dead letter. A stale process cannot complete them.
7. Owner replay copies the original registered descriptor into one linked job using a UUID
   idempotency key and appends one audit event in the same transaction.

There is no public create, edit, cancel, force-success, or delete job operation.

## Persistent notification contract and UI

Every active authenticated user can:

- list the latest history or catch up after a decimal monotonic cursor, at most 100 rows per page;
- read an unread count;
- mark one owned notification read; and
- mark owned notifications through a high-water cursor.

The React notification center loads REST history first, keeps the latest 100 rows, catches up in
bounded pages after connection/reconnection/hints, tolerates duplicate hints, and remains usable
when the socket is offline. A link still passes through the target resource's normal API
authorization.

Owners with `jobs:read` can use `/admin/jobs` to inspect aggregate queue health, recent heartbeats,
safe job detail, and immutable attempts. Owners with `jobs:replay` can replay only an eligible dead
letter. Admins and customers have neither permission.

## Socket.IO boundary

The `/notifications` namespace requires the exact configured origin and an active opaque database
session. The server derives only `user:<sessionUserId>`, rechecks revocation/expiry/user status,
bounds source/user handshake rate and concurrent connections, caps inbound packets at 8 KiB, and
disconnects any browser-originated application event. Recovery middleware is never skipped.

The only application event emitted is:

```json
{"id":"notification-uuid","cursor":"monotonic-decimal-string"}
```

It is a best-effort hint, not authorization or durable delivery. REST/MySQL recovery remains the
source of truth.

## Configuration and commands

The API examples document poll interval, worker concurrency, lease, attempts, retry bounds,
shutdown grace, notification polling, session recheck, connection cap, and handshake rate. Values
are validated at startup. The browser derives the Socket.IO origin from `VITE_API_BASE_URL`.

Run API, web, and worker in separate terminals:

```text
npm run dev:api
npm run dev:web
npm run dev:worker --workspace @opspilot/api
```

Production supervision, TLS/proxy topology, shared rate coordination, monitoring/alerts, capacity,
retention/privacy, backups, and multi-instance distribution remain explicit deployment blockers.
