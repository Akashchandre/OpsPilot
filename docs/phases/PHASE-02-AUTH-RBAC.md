# Phase 2 — Authentication and RBAC

## Objective

Add secure identity, authentication, and deny-by-default role-based authorization on the accepted Phase 1 foundation.

## Requirements and goals

- Customer registration/login and secure logout/session lifecycle.
- User, role, permission, and assignment persistence with server-side authorization.
- Protected API and frontend routes with correct unauthorized/forbidden states.
- Owner/admin bootstrap and role-management rules.
- Safe password handling, validation, rate controls, and audit-relevant events.

## Decisions required

Session cookie versus access/refresh tokens; CSRF strategy; email verification; password reset; MFA; registration policy; password policy; owner bootstrap; default roles/permissions; employee invitation; account lockout; session revocation; identity retention/deletion.

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

## Documentation updates

Update database design, API contract, architecture, environment/runbook, permission matrix, decision records, this phase document, and `WORK-PROGRESS.md`.

## Explicit exclusions

Catalog, inventory, orders, payments, AI, RAG, real-time, and background-job features remain out of scope.

