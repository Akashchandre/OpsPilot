# Phase 6 — Real-time and Background Jobs

## Status

**REPOSITORY COMPLETE AND VERIFIED on 2026-08-29.** ADR 0008's MySQL job/outbox, worker,
notification, Socket.IO hint, permission, security, dependency, configuration, recovery, and test
baseline is implemented. Only exact `socket.io@4.8.3` and `socket.io-client@4.8.3` were added.
Redis, BullMQ, external services/accounts, and multi-instance topology remain out of scope.

## Objective

Introduce justified asynchronous processing and authorized real-time notifications with durable, observable, retry-safe behavior.

## Requirements and goals

- A queue/worker boundary for approved long-running or retryable workflows.
- Real-time delivery for defined notification events plus persistent notification history.
- Safe retry, idempotency, timeout, backoff, dead-letter/failure handling, and reconciliation.
- Redis only if the selected queue, Socket.IO scale-out, cache, or rate coordination demonstrably requires it.
- Operational visibility and controlled worker deployment/shutdown.

## Decisions required

Initial job/event inventory; queue technology and Redis role/topology; at-least-once delivery handling; outbox pattern; retry/backoff/dead-letter/replay; notification types/channels/preferences/retention; Socket.IO versus WebSockets; connection authentication, room design, reconnection, multi-instance scaling, and service targets.

## Tasks

- [x] Confirm the Phase 5 gate/commit and the user's authorization to start Phase 6 planning.
- [x] Inspect current transaction, session, audit, logging, rate, payment-recovery, schema, and
      deployment boundaries plus current official MySQL/Socket.IO/queue behavior.
- [x] Draft the complete Phase 6 decision proposal, proposed permission matrix, and proposed threat
      model.
- [x] Explicitly approve or change the architecture, event/job inventory, delivery/retry/replay,
      notification, real-time, permission, dependency, service/account, configuration, and test
      baseline.
- [x] Obtain explicit instruction before installing the proposed Socket.IO packages.
- [x] Record the accepted baseline in ADR 0008.
- [x] Implement the reviewed persistence migration.
- [x] Implement transactional enqueue/claims, worker execution/recovery, persistent notifications,
      owner failure tooling, and authenticated real-time hints.
- [x] Complete observability/runbooks, load/failure/security/regression tests, documentation, and
      explicit acceptance review.

## Acceptance criteria

- Committed events/jobs are not silently lost, and rolled-back business transactions do not produce invalid work.
- Duplicate/redelivered jobs and events do not duplicate business effects.
- Retryable and terminal failures follow documented policy and can be inspected/reconciled safely.
- Real-time clients receive only authorized events and can recover state after disconnect via persistent APIs.
- Worker/API shutdown does not corrupt claimed work; queue/connection health is observable.
- Redis or any cache never becomes the sole source of truth for durable business state.

## Testing requirements

Handler unit tests; integration tests for enqueue/outbox, retry, duplicate delivery, dead-letter/replay and crash recovery; WebSocket authentication/authorization/reconnection tests; cross-user/business isolation; multi-instance/load tests if required; dependency outage/recovery tests; regression suite for prior phases.

## Edge cases

Commit/enqueue split failure, worker crash mid-job, poison messages, out-of-order events, dependency outage, reconnect storms, expired/revoked sessions during connection, duplicate tabs, slow consumers, notification created while offline, deploy during active jobs, cache eviction.

## Security considerations

Authenticate handshake and revalidate sensitive subscriptions/actions; derive rooms from server identity; restrict origins/message size/rate; sign or authenticate internal producers; encrypt service connections as appropriate; keep secrets and PII out of payloads/logs; protect replay/admin tooling; isolate businesses/users.

## Completion criteria

Delivery semantics and failure/recovery behavior are documented and tested; observability/runbooks exist; isolation/load/recovery tests pass; prior phases remain stable; no AI is added; and explicit phase acceptance is recorded.

The repository completion review passes. See the
[implementation guide](../phase-6/PHASE-06-IMPLEMENTATION-GUIDE.md),
[operations runbook](../phase-6/PHASE-06-OPERATIONS-RUNBOOK.md),
[performance evidence](../phase-6/PHASE-06-PERFORMANCE-EVIDENCE.md), and
[acceptance report](../phase-6/PHASE-06-ACCEPTANCE-REPORT.md).

## Documentation updates

Update architecture/API/database, event/job/notification catalog, topology, environment configuration, retries/replay/incident runbooks, decision records, this phase status, and `WORK-PROGRESS.md`.

## Explicit exclusions

Python/FastAPI, model providers, AI assistants, embeddings, RAG, vector databases, and LangGraph remain out of scope.
