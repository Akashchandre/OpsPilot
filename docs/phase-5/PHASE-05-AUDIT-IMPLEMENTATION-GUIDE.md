# Phase 5 Audit Integrity Implementation Guide

## Status

Implemented and focused verification passing as of 2026-08-28. This milestone provided the audit
integrity boundary required before Phase 5 support writes and later privileged mutation retrofits;
the completed phase gate is recorded in `PHASE-05-ACCEPTANCE-REPORT.md`.

## Configuration

- `AUDIT_INTEGRITY_KEY` is a Base64-encoded secret containing at least 32 random bytes.
- `AUDIT_INTEGRITY_KEY_ID` is a stable 1–64 character identifier using letters, numbers, `.`, `_`,
  or `-`.
- Both fields are required together in development and production. Startup reports field names,
  never rejected values.
- Routine `NODE_ENV=test` execution uses an isolated test-only key only when both fields are absent.
- Real values belong only in ignored environment files or an approved secret manager. Tracked
  examples remain empty.

The initial implementation has one active online key. Every row stores its key ID. Rotation must
retain prior keys through a reviewed offline-verification procedure before changing the active
pair; deleting an old key makes its historical events unverifiable by that procedure.

## Append and integrity behavior

The service accepts only registered actions. Each action fixes its allowed target type and strict
metadata schema. A defense-in-depth metadata walker rejects unsafe structures and field names for
passwords, secrets, tokens, cookies, authorization/CSRF data, signatures, headers/raw bodies,
payment instruments, addresses/contact fields, and ticket/message content. Registered metadata is
JSON-compatible and limited to 4 KiB.

An append performs these operations in its caller's transaction:

1. Validate the actor, action, target, request UUID, and action-specific metadata.
2. Lock singleton chain-head row `1` with `SELECT ... FOR UPDATE`.
3. Allocate `head_sequence + 1` and use the previous head hash.
4. Generate a server UUID and millisecond UTC occurrence time.
5. Canonicalize the versioned event payload with recursively sorted object keys.
6. Calculate HMAC-SHA256 with the active decoded key.
7. Insert the event and advance the singleton head.

Any validation, insert, or head-update failure rejects the transaction. This lets later local
privileged mutations fail closed when their audit evidence cannot commit. External provider side
effects retain Phase 4 reconciliation boundaries because they cannot join MySQL transactions.

Audit actor deletion is restricted because `actorUserId` participates in the HMAC payload. A
future account erasure/anonymization policy must preserve or explicitly supersede that immutable
historical identifier rather than silently setting it to null and breaking the chain.

The internal verifier reads a repeatable snapshot in ascending sequence order and checks sequence
continuity, previous hashes, event HMACs, known key IDs, and final head sequence/hash. It returns a
safe reason and first invalid sequence without exposing a key. The verifier has no public route in
this milestone.

## Owner-only read API

`GET /api/v1/audit-events` requires an active session and `audit:read`, which is seeded only for
`OWNER`. `ADMIN`, `CUSTOMER`, anonymous, and disabled callers are rejected.

| Query | Behavior |
|---|---|
| `page` / `limit` | Defaults `1` / `50`; limit maximum `100` |
| `from` / `to` | Strict RFC 3339 UTC, half-open range, default last 30 days, maximum 366 days |
| `action` / `outcome` | Exact allowlisted-shape filters |
| `actorKind` / `actorUserId` | Exact actor filters |
| `targetType` / `targetId` | Exact target filters |

Results are newest sequence first. BigInt sequences are decimal strings. Each successful read
appends exactly one `AUDIT_EVENTS_READ` event after the result query and before the response. That
event records only filter names, pagination, and result counts, never filter values or returned
content, and cannot recursively appear in its own response. There is no audit create, update, or
delete API.

## Registered action catalog

The strict registry includes audit reads; support ticket/message/closure/update actions; user
status and role changes; product/category create/update/status changes; inventory adjustments and
threshold changes; order create/cancel/status changes; provider-order linking and provider-state
application; refund request/provider-state application; reconciliation; and webhook processing.
Every action fixes its target type and metadata schema. Authentication outcomes remain in the
Phase 2 `security_events` stream and are not duplicated into the general audit chain.

Local privileged mutations append in the same transaction and fail closed. Provider calls cannot
join MySQL, so their returned/webhook/reconciled local state application and audit evidence commit
together at the existing external-effect recovery boundary.

Focused tests cover deterministic canonicalization, valid chains, mutation/deletion/reordering,
wrong keys, damaged heads, metadata rejection, transaction rollback, concurrent appends, time-range
validation, anonymous/role/disabled denial, one-event-per-read behavior, and absence of mutation
routes. Operators can run `npm run phase5:audit:verify --workspace @opspilot/api`; the command
returns only safe verification state and exits nonzero when integrity fails.
