# Phase 6 Real-time and Background Jobs Threat Model

## Status

**IMPLEMENTED AND VERIFIED on 2026-08-29.** ADR 0008 accepts these controls; the Phase 6 focused,
failure, security, performance, regression, and live-smoke gates pass. Production-only residual
risks remain listed at the end of this model and in the acceptance report.

## Scope

This model covers transactional background-job creation, MySQL queue claims and leases, worker
execution/retry/dead-letter/replay, worker health, persistent in-app notifications, notification
REST APIs/UI, and an authenticated Socket.IO notification-hint channel.

It inherits Phase 2 authentication/RBAC and origin/CSRF controls, Phase 3 inventory rules, Phase 4
commerce/payment recovery, and Phase 5 audit/logging/rate/payload boundaries. Redis, external
brokers, email/SMS/push, automatic provider reconciliation, multi-instance deployment, AI,
documents, hosted monitoring, and production retention remain out of scope.

## Assets and trust boundaries

- Business transaction state, job descriptors/status/attempts, leases, worker liveness,
  notifications/read state, session identity, permissions, audit evidence, and operational logs are
  protected assets.
- Browser socket handshakes/events, HTTP IDs/cursors, job JSON loaded from storage, clocks, worker
  instance claims, dependency failures, and replay requests are untrusted until validated.
- MySQL is the sole durable source of truth. A socket connection, process memory, timer, worker
  heartbeat, or future cache/broker can never establish business truth or authorization.
- Domain services own registered descriptors and insert jobs inside their current database
  transaction. Workers validate descriptors again, load current state, and execute only registered
  handlers.
- Socket identity and rooms derive only from an exact-origin, active opaque session. The browser
  receives a minimal change hint and reads persistent authorized state through REST.
- The worker process is a separately supervised application boundary sharing reviewed code and a
  least-privilege database connection. Production process supervision remains undecided.

## Threats and required controls

| Threat                                                       | Required Phase 6 control                                                                                               | Residual risk / follow-up                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Business transaction commits but work is lost                | Insert registered job in the same MySQL transaction; indexed durable eligible state; restart recovery                  | MySQL availability/backup remains the durability boundary                       |
| Rolled-back change produces invalid work                     | Job insertion participates in the owning transaction; rollback integration tests                                       | External provider effects retain their existing Phase 4 reconciliation boundary |
| Worker processes one job twice                               | At-least-once is explicit; unique effect/dedupe key; atomic conditional effect; matching lease token on completion     | Every new handler requires an idempotency review                                |
| Two workers claim the same job                               | Short `FOR UPDATE SKIP LOCKED` claim transaction; lease token/owner/expiry; concurrency tests                          | Bad indexes or long claim transactions can cause contention                     |
| Crashed worker leaves work stuck                             | Expiring renewable lease; safe startup reconciliation; another worker reclaims after expiry                            | Lease duration must exceed ordinary progress/renewal jitter                     |
| Stale worker overwrites reclaimed result                     | Completion/renewal condition includes current random lease token and `PROCESSING` state                                | Long blocking calls must respect timeout and cancellation signals               |
| Poison job retries forever                                   | Type-specific schema/version validation; eight-attempt ceiling; terminal classification; visible dead letter           | Operator must investigate root cause before replay                              |
| Malicious payload selects code or injects content            | Registered type/version dispatch only; no dynamic module/function/URL; bounded allowlisted JSON; parameterized queries | Registry expansion is a security-sensitive review point                         |
| Secrets/PII leak through job payload/history                 | Prohibited-field policy; safe ID/scalar schemas; no raw bodies/text/address/provider data; canary tests                | Resource IDs remain sensitive operational metadata                              |
| Retry storm overloads MySQL                                  | Bounded concurrency/batches; capped exponential backoff with jitter; indexed eligibility; queue-age health             | Production capacity/SLOs require deployment evidence                            |
| Out-of-order jobs move state backward                        | Handler reloads current version/state; monotonic domain transitions; notification presents current truth               | Human-visible notification order may differ from event occurrence order         |
| Replay duplicates a completed effect                         | Dead-letter-only eligibility; new linked job with UUID request idempotency; handler idempotency; audit append          | A broken handler must be fixed before replay                                    |
| Operator edits/forces/deletes job evidence                   | No edit, arbitrary enqueue, force-success, cancel, or delete API; owner-only read/replay                               | Direct database administrators remain privileged                                |
| Admin/customer accesses cross-domain jobs                    | `jobs:read`/`jobs:replay` owner-only; safe list/detail projection; negative authorization tests                        | Custom roles require later explicit mapping                                     |
| Job read/replay leaks payload or errors                      | List omits payload; detail allowlists safe fields; safe error codes only; no stack/body                                | Owner access still exposes cross-domain metadata by design                      |
| Worker logs leak notification/user/resource data             | Allowlisted IDs/type/status/duration/error code only; no payload/text/email/header/cookie/stack                        | Hosted log shipping and access policy remain undecided                          |
| Heartbeat exposes infrastructure identity                    | Generated instance UUID only; no hostname, filesystem path, command line, IP, or credentials                           | Process supervisor may hold additional infrastructure data                      |
| Another user reads a notification                            | Session-derived recipient predicate on every query/write; not-found behavior; IDOR tests                               | Multi-business use still requires tenant schema/isolation redesign              |
| Notification links reveal unauthorized resource              | Explicit resource FKs; safe generic text; linked REST route rechecks current ownership/permission                      | Previously visible resources may later become unavailable                       |
| Duplicate transition creates duplicate notification          | Unique source-event/recipient dedupe key in same materialization transaction                                           | Deliberately repeated events need a distinct source transition ID               |
| Notification content becomes stored XSS                      | Registered server presentation; bounded plain text/scalars; React text rendering; no HTML/URLs from payload            | Rich content remains deferred                                                   |
| Client chooses another socket room                           | Server joins only `user:<sessionUserId>`; no subscribe/join application event; room names never trusted from client    | Compromised server/session remains privileged                                   |
| Cross-site socket handshake rides cookies                    | Exact configured Origin required before opaque-session authentication; connection-rate limits                          | Deployment proxy must preserve reviewed origin behavior                         |
| Revoked/expired/disabled session remains connected           | Revalidate on connect/recovery and at most every 30 seconds; `skipMiddlewares: false`; disconnect failures             | Minimal hint exposure is bounded by recheck interval; REST rechecks immediately |
| Socket sends unauthorized mutation                           | Initial namespace accepts no application event; business writes remain REST with CSRF/origin/version rules             | Future bidirectional events require a new contract/threat review                |
| Socket payload leaks ticket/payment/job data                 | Emit only notification UUID and monotonic cursor; REST returns recipient-scoped safe projection                        | UUID/cursor remain low-sensitivity metadata                                     |
| Disconnect causes silent notification loss                   | Persistent notification commits first; client REST catch-up on connect/reconnect; socket is at-most-once hint only     | Real-time timeliness is best effort, not durable delivery                       |
| Duplicate tabs/hints duplicate effects                       | No socket-side business effect; client dedupes by cursor/UUID; read operations idempotent                              | Excess tabs consume connection resources                                        |
| Reconnect storm exhausts API/database                        | Source/user handshake ceiling, per-user connection cap, exponential client reconnect, bounded catch-up                 | Distributed limits/edge controls required before horizontal scale               |
| Slow consumer grows unbounded memory                         | Small hint only, bounded Socket.IO buffers, disconnect slow clients, REST recovery                                     | Exact thresholds require measured tests                                         |
| Oversized or unknown socket event consumes resources         | Small transport buffer, strict event allowlist, reject/disconnect inbound application events                           | Engine/proxy limits require configuration tests                                 |
| Redis/broker becomes accidental truth                        | No Redis/broker in baseline; MySQL owns jobs/notifications; future cache must be disposable                            | Scale decision remains required before replicas                                 |
| Database outage corrupts claims                              | Fail closed, stop new claims, safe error code/backoff, preserve leases, reconnect/reclaim tests                        | Long outages delay jobs and notifications                                       |
| Shutdown marks unfinished work successful                    | Stop claims, renew active leases during grace, mark only handler-confirmed results, otherwise allow lease recovery     | Non-cooperative external calls may exceed grace window                          |
| Audit-chain verification failure is hidden or corrupts chain | Scheduled verifier safely logs/dead-letters failure; does not append into a reported-invalid chain                     | External alert delivery/anchoring remains deferred                              |
| Indefinite history violates privacy/retention duties         | No casual purge API; explicitly label temporary development retention as production blocker                            | Jurisdiction, erasure, legal hold, and schedules need business/legal input      |

## Required verification

- Transaction commit/rollback and crash tests prove no enqueue gap or phantom work.
- Concurrent workers prove unique live claims, lease renewal, stale-token rejection, expiry reclaim,
  retries, timeout, dead-letter, and replay idempotency.
- Every registered handler proves duplicate/out-of-order safety and validates its exact payload
  version before loading current state.
- Anonymous, disabled, expired, cross-user, `ADMIN`, and `CUSTOMER` callers cannot inspect/replay
  jobs or cross notification boundaries.
- Socket tests cover exact origin, opaque-session handshake, middleware on recovery, server-derived
  rooms, revocation recheck, no inbound business events, size/rate/connection limits, missed/
  duplicate hints, reconnect catch-up, slow consumers, and API/server shutdown.
- Canary credentials, cookies, tokens, addresses, ticket/message text, payment/provider data, job
  payloads, notification content, and stack traces remain absent from logs/attempt evidence.
- Representative queue/notification data proves claim plans, latency targets, bounded catch-up,
  reconnect-storm behavior, database outage recovery, and safe cleanup of test data.
- Full Phase 1–5 regression, migration/drift, coverage, build, audit-chain, smoke, whitespace, and
  credential checks remain green.

## Production blockers retained

Before production launch, define process supervision, proxy/TLS topology, hosted metrics/alerts,
incident/on-call ownership, production SLOs/capacity, privacy/retention/erasure/legal-hold rules,
backup/RPO/RTO, multi-instance behavior, shared rate controls, and any Redis/broker ownership and
security. Phase 4 provider delivery/recovery and all live-payment gates remain unresolved.
