# Phase 2 — Authentication and RBAC

## Status

**ACCEPTED on 2026-08-25.** Phase 1 was accepted, Phase 2 implementation was explicitly authorized, all acceptance gates passed, and the user authorized the project to proceed to Phase 3.

## Objective

Add secure identity, authentication, and deny-by-default role-based authorization on the accepted Phase 1 foundation.

## Requirements and goals

- Customer registration/login and secure logout/session lifecycle.
- User, role, permission, and assignment persistence with server-side authorization.
- Protected API and frontend routes with correct unauthorized/forbidden states.
- Owner/admin bootstrap and role-management rules.
- Safe password handling, validation, rate controls, and audit-relevant events.

## Accepted implementation decisions

- Single-business baseline with `OWNER`, `ADMIN`, and `CUSTOMER` system roles.
- Public customer registration and interactive one-time owner bootstrap.
- Database-backed opaque sessions in protected cookies; session-bound CSRF tokens and exact-origin checks.
- Argon2id passwords, per-process sensitive-route rate limits, immediate database-backed permission evaluation, account lock windows, and revocable sessions.
- System role/permission definitions are migration-controlled; Phase 2 manages assignments rather than arbitrary role definitions.
- Email verification, password reset, MFA, employee invitation, and account deletion are deferred.
- Narrow Phase 2 security events are separate from the Phase 5 general audit model.

See ADR 0003, the Phase 2 threat model, and the Phase 2 permission matrix.

## Implemented result

- Prisma identity, RBAC, opaque-session, and security-event schema plus migration-controlled system authorization data.
- Interactive one-time owner bootstrap.
- Registration, login, current-user, and logout endpoints.
- Trusted-origin, CSRF, rate-limit, password lock, validation, authentication, and permission middleware.
- Protected user status and role-assignment APIs with last-owner and administrator/owner safeguards.
- React Router registration/login/dashboard/user-administration experiences and protected/permission-aware navigation.
- Real-MySQL API integration tests, frontend behavior tests, enforced coverage thresholds, and updated security/API/run documentation.

## Tasks

1. Threat-model identity and authorization and approve dependencies/accounts/environment variables before installation.
2. Finalize user/RBAC schema, constraints, migrations, and seed/bootstrap policy.
3. Implement validation, password hashing, authentication lifecycle, and protected current-user contract.
4. Implement reusable permission/ownership middleware plus service-level checks.
5. Implement authorized role/permission management only to the agreed scope.
6. Add protected frontend navigation and accessible auth states/forms.
7. Add rate controls, security/audit events, and safe error behavior.
8. Test horizontal/vertical privilege boundaries and update documentation/progress.

## Acceptance criteria

- Valid users can complete the approved authentication lifecycle; invalid attempts fail safely.
- Passwords are never stored/logged in plaintext and credentials use agreed secure transport/storage semantics.
- Protected APIs reject unauthenticated users and deny authenticated users without the required permission.
- A user cannot access another user's protected resources by changing identifiers.
- Role/permission changes follow approved constraints and take effect according to documented session behavior.
- Frontend guards and states match the API, while the API remains authoritative.

## Testing requirements

Unit tests for password/auth and permission logic; API tests for success, duplicates, invalid input, invalid/expired/revoked credentials, `401` versus `403`, role assignment, ownership, disabled accounts, and rate limiting; frontend tests for auth loading/error/protected navigation; E2E smoke path for registration/login/logout if in scope.

## Edge cases

Normalized duplicate emails, concurrent registration, last-owner removal, stale permission sessions, deleted/disabled users, clock skew/expiry, cookie/CORS/CSRF failures, brute force, enumeration, and password/session rotation.

## Security considerations

Use reviewed password hashing; protect cookies/tokens; rotate/revoke credentials; prevent user enumeration; rate-limit sensitive routes; enforce least privilege and deny-by-default; audit sensitive role/account actions; never trust role claims without approved validation; do not log passwords/tokens.

## Completion criteria

All agreed identity/RBAC flows and negative authorization tests pass; threat-model findings are resolved or accepted; schema/API/UI/docs agree; Phase 1 remains stable; no Phase 3 functionality is implemented; and the phase receives explicit acceptance.

All completion criteria were satisfied. The recorded verification is in `docs/phase-2/PHASE-02-ACCEPTANCE-REPORT.md`.

## Documentation updates

Update database design, API contract, architecture, environment/runbook, permission matrix, decision records, this phase document, and `WORK-PROGRESS.md`.

## Explicit exclusions

Catalog, inventory, orders, payments, AI, RAG, real-time, and background-job features remain out of scope.
