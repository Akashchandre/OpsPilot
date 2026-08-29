# Phase 6 Permission Matrix

## Status

**IMPLEMENTED AND VERIFIED on 2026-08-29.** ADR 0008 accepts this matrix. Migration
`20260828094016_phase_6_realtime_jobs` seeds the mappings; foundation and API tests verify them.

## Ownership-scoped notification actions

Every active authenticated user may perform only these actions for notifications whose
`recipientId` equals the session user ID:

- List persistent notifications after a bounded monotonic cursor.
- Retrieve their unread count.
- Mark one owned notification read.
- Mark owned notifications through a validated high-water cursor read.
- Receive a server-derived real-time hint for their own notification cursor.

These actions need no new RBAC permission. Recipient identity and the Socket.IO user room come only
from the validated opaque session. A client cannot supply a recipient, role, permission, room, job
type, or job payload. Another user's notification ID receives safe not-found behavior.

Notification access does not expose background job payloads/attempts, internal support notes,
reports, audit evidence, exact inventory state without an existing permission, or provider/payment
metadata. The persistent REST projection rechecks current authorization for any linked resource.

## Operator permissions

| Code          | Meaning                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| `jobs:read`   | Read bounded background-job status, safe attempt outcomes, queue aggregate health, and worker heartbeat state |
| `jobs:replay` | Create one idempotent linked replay of an eligible dead-letter job after current schema/state validation      |

`jobs:replay` does not permit creating an arbitrary job, replacing a type/payload, editing state,
forcing success, cancelling active work, deleting evidence, or changing worker configuration.

## Default role matrix

| Permission    | `OWNER` | `ADMIN` | `CUSTOMER` |
| ------------- | :-----: | :-----: | :--------: |
| `jobs:read`   |   Yes   |   No    |     No     |
| `jobs:replay` |   Yes   |   No    |     No     |

Job inspection/replay is deliberately owner-only because job metadata spans support, identity,
inventory, commerce, payment-state, and audit-integrity workflows. An administrator's domain
permission does not automatically grant cross-domain operational control. Unknown permissions
remain denied.

## Endpoint and connection mapping

| Operation                              | Required access                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| List notifications/unread count        | Active session + session-derived recipient predicate + bounded cursor/limit                                               |
| Mark one notification read             | Active session + resource ownership + CSRF/exact origin                                                                   |
| Mark notifications through cursor read | Active session + session-derived recipient + CSRF/exact origin + bounded cursor                                           |
| Connect to `/notifications`            | Exact origin + active opaque session + handshake/user/source limits; server joins only `user:<sessionUserId>`             |
| Read job list/detail/queue health      | `jobs:read`; safe projections; the read is audited once                                                                   |
| Replay an eligible dead-letter job     | `jobs:replay` + CSRF/exact origin + UUID idempotency key + current handler/state checks + same-transaction audit evidence |
| Enqueue a registered background job    | Internal domain service inside its owning database transaction; no public arbitrary enqueue route                         |
| Claim/renew/complete a job             | Internal worker with a valid database connection and matching lease token; no browser route                               |

Possessing `jobs:read` never grants access to arbitrary source resources. Detail presenters expose
only registered safe descriptor fields, and any resource link remains subject to the resource's
existing permission/ownership checks.
