# Phase 5 Proposed Permission Matrix

## Status

**PROPOSED on 2026-08-27 — NOT IMPLEMENTED.** Phase 5 planning is authorized by ADR 0006, but this
matrix requires explicit approval with the complete Phase 5 decision proposal before migration or
application changes.

## Ownership-scoped customer actions

An active authenticated user may perform these actions without a new RBAC permission and only for
their own requester ID:

- Create a support ticket and its first customer-visible message.
- Optionally link an order owned by the same user.
- List and retrieve owned tickets and customer-visible messages/events.
- Add a customer-visible message to an owned non-closed ticket.
- Close an owned non-closed ticket.

Ownership comes from the authenticated session, never a client-supplied requester ID. Cross-user
lookups use safe not-found behavior. Customers cannot set priority/assignment, write/read internal
notes, use management filters, read reports, or read audit evidence.

## Proposed operator permissions

| Code | Meaning |
|---|---|
| `support:tickets:read` | List/retrieve all business tickets, customer-visible messages, internal notes, events, and bounded linked-order context |
| `support:tickets:manage` | Assign eligible staff, change status/priority, and add public replies or internal notes |
| `reports:read` | Read the defined authoritative overview metrics and bounded operational breakdowns |
| `audit:read` | Read and verify restricted audit evidence; access is itself audited |

## Proposed default role matrix

| Permission | `OWNER` | `ADMIN` | `CUSTOMER` |
|---|:---:|:---:|:---:|
| `support:tickets:read` | Yes | Yes | No |
| `support:tickets:manage` | Yes | Yes | No |
| `reports:read` | Yes | Yes | No |
| `audit:read` | Yes | No | No |

`audit:read` is deliberately owner-only so ordinary administration does not imply access to
oversight evidence. Unknown permissions remain denied. This phase does not add a new employee role,
custom roles, or permission-management endpoints.

## Proposed endpoint mapping

| Operation | Required access |
|---|---|
| Create/read/reply/close through customer support view | Active session + resource ownership; CSRF/origin and idempotency/version controls for writes |
| Management ticket list/detail | `support:tickets:read` |
| Change status, priority, or assignee | `support:tickets:manage` + CSRF/origin + version/state checks |
| Add a staff public reply or internal note | `support:tickets:manage` + CSRF/origin + idempotency/state checks |
| Read overview report | `reports:read` + bounded UTC range + report rate limit |
| Read/verify audit events | `audit:read`; the read action creates separate audit evidence |
| Append application audit evidence | Internal service action only; no public write endpoint |

Possessing support-management access does not imply report or audit access. Possessing report
access does not expose row-level ticket messages, addresses, payment-provider metadata, or audit
metadata.
