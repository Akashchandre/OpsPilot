# Phase 2 Implementation, UI, API, and Q&A Guide

## Status

Phase 2 was accepted on 2026-08-25 after its implementation, documentation, security review, tests, coverage gates, migrations, build, and live smoke path were verified. Phase 3 requirements planning is authorized.

## What Phase 2 adds

Phase 2 turns the Phase 1 health scaffold into an identity-aware application:

- Public customer registration.
- Email/password login.
- Database-backed, revocable browser sessions.
- Secure logout.
- Current-session restoration after a page refresh.
- `OWNER`, `ADMIN`, and `CUSTOMER` system roles.
- Deny-by-default server-side permissions.
- User listing and identity-summary retrieval for authorized operators.
- User enable/disable controls.
- System-role assignment and removal.
- Immediate authorization changes because the API reloads roles and status on every protected request.
- Last-active-owner protection.
- Interactive one-time owner bootstrap.
- Authentication rate limiting and account lock windows.
- Exact-origin and CSRF protection.
- Narrow authentication/authorization security events.
- Responsive registration, login, dashboard, permission-denied, and user-administration experiences.

## What a user can do in the UI

### Public home: `/`

- View the current web/API/MySQL readiness state.
- Navigate to registration or login.
- Understand that identity uses opaque sessions and deny-by-default RBAC.

### Customer registration: `/register`

- Enter a display name, normalized email address, and password.
- The browser enforces basic required/minimum input and the API performs authoritative Zod validation.
- A successful registration creates an active `CUSTOMER` account, creates a secure session, and redirects to the dashboard.
- A duplicate or otherwise unavailable registration returns a generic response that does not confirm unnecessary account details.

### Login: `/login`

- Log in using email and password.
- A successful login creates a new opaque session and redirects to the originally requested protected page or the dashboard.
- Invalid credentials use the same public error for known and unknown accounts.
- Repeated failures can temporarily lock a known active account and are also limited per API process/IP.

### Dashboard: `/dashboard`

- Available only to an authenticated session.
- Shows display name, email, active/disabled state, assigned roles, and effective permissions.
- A customer normally sees `CUSTOMER` with no administrative permissions.
- An owner or administrator sees the permission codes granted by the current migration-controlled matrix.

### User administration: `/admin/users`

- Visible only when the current UI session includes `users:read`; the API independently enforces the same permission.
- Lists identity summaries and role/status state.
- Allows an authorized operator to add a system role.
- Allows an authorized operator to remove a role.
- Allows an authorized operator to enable or disable an account.
- Displays safe API failures such as last-owner or owner-boundary violations.
- Administrators cannot change owner accounts. Only owners can grant/remove `OWNER`, and the last active owner cannot be disabled or demoted.

### Logout

- Available from the authenticated header.
- Sends the session-bound CSRF token, revokes the database session, clears both cookies, and redirects protected navigation to login.

## Owner bootstrap

System roles and permissions are inserted by the Phase 2 migration. After applying migrations, create the first owner in an interactive terminal:

```text
npm run auth:bootstrap-owner -- --display-name "Business Owner" --email owner@example.com
```

The command prompts for and confirms the password without accepting it in a command-line argument or environment variable. It fails when an owner already exists.

## Authentication and request security

### Session cookie

- Configured name: `AUTH_SESSION_COOKIE_NAME`.
- Random 256-bit opaque value.
- Only its SHA-256 digest is stored in MySQL.
- `HttpOnly` prevents normal browser JavaScript from reading it.
- `SameSite=Lax` reduces cross-site sending.
- `Secure` is mandatory when `NODE_ENV=production`.
- Scope is `/api/v1` and expiry is fixed by `AUTH_SESSION_TTL_HOURS`.

### CSRF cookie and header

- Configured name: `AUTH_CSRF_COOKIE_NAME` and matching frontend `VITE_CSRF_COOKIE_NAME`.
- The readable cookie allows the frontend to copy the random token into `X-CSRF-Token`.
- Only its digest is stored with the session.
- Authenticated state-changing requests must present both matching cookie and header values.
- All unsafe browser requests must also use the exact configured `CORS_ORIGIN`.

### Authorization

- The browser never supplies a trusted user ID, role, or permission claim.
- The API resolves the session digest, user status, roles, and role permissions from MySQL on every protected request.
- Missing/expired/revoked/disabled sessions return `401`.
- Authenticated users lacking a required permission return `403`.
- Service rules add owner protections even when an administrator has general role/status permissions.

## Complete Phase 2 API reference

All endpoints are prefixed by `/api/v1` and use the standard success/error envelopes.

### `GET /health`

Access: public.

Purpose: readiness check for API and MySQL.

Success `200`:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "opspilot-api",
    "database": "reachable",
    "timestamp": "2026-08-25T00:00:00.000Z"
  }
}
```

MySQL failure: `503 SERVICE_UNAVAILABLE`.

### `POST /auth/register`

Access: public; trusted origin and authentication rate limiter required.

Body:

```json
{
  "displayName": "Akash Customer",
  "email": "customer@example.com",
  "password": "at least 12 characters"
}
```

Behavior:

- Trims display name.
- Trims and lowercases email.
- Hashes password with Argon2id.
- Creates an active user and `CUSTOMER` assignment transactionally.
- Creates session/CSRF cookies and a `USER_REGISTERED` security event.

Success: `201` with `{ "data": { "user": ... } }`.

Important failures: `403 ORIGIN_NOT_ALLOWED`, `409 REGISTRATION_UNAVAILABLE`, `422 VALIDATION_ERROR`, `429 AUTH_RATE_LIMITED`.

### `POST /auth/login`

Access: public; trusted origin and authentication rate limiter required.

Body:

```json
{
  "email": "customer@example.com",
  "password": "the account password"
}
```

Behavior:

- Uses dummy Argon2 verification for unknown accounts to reduce timing differences.
- Returns the same `INVALID_CREDENTIALS` response for unknown, wrong-password, disabled, or currently locked accounts.
- Locks a known active account for 15 minutes after five consecutive wrong-password attempts.
- Resets failed-attempt state after valid login.
- Creates a new independent session and security event.

Success: `200` plus session/CSRF cookies.

Important failures: `401 INVALID_CREDENTIALS`, `403 ORIGIN_NOT_ALLOWED`, `422 VALIDATION_ERROR`, `429 AUTH_RATE_LIMITED`.

### `GET /auth/me`

Access: authenticated.

Purpose: restore the current UI session and retrieve current roles/permissions.

Success `200`:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "UUID",
      "email": "customer@example.com",
      "displayName": "Akash Customer",
      "status": "ACTIVE",
      "roles": ["CUSTOMER"],
      "permissions": [],
      "createdAt": "ISO timestamp",
      "updatedAt": "ISO timestamp"
    }
  }
}
```

Failure: `401 AUTHENTICATION_REQUIRED` for missing, expired, revoked, or disabled sessions.

### `POST /auth/logout`

Access: authenticated; trusted origin and valid CSRF cookie/header required.

Behavior: revokes the current session, records `LOGOUT_SUCCEEDED`, and clears authentication cookies.

Success `200`:

```json
{ "success": true, "data": { "loggedOut": true } }
```

Important failures: `401 AUTHENTICATION_REQUIRED`, `403 CSRF_INVALID`, `403 ORIGIN_NOT_ALLOWED`.

### `GET /users?page=1&limit=20`

Access: authenticated with `users:read`.

Rules: page starts at 1; limit is 1–100; default limit is 20.

Success `200`: `data.users` contains safe identity summaries; `meta` contains `page`, `limit`, `total`, and `totalPages`.

Important failures: `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `422 VALIDATION_ERROR`.

### `GET /users/:userId`

Access: authenticated with `users:read`.

Path: `userId` must be a UUID.

Success: `200` with a safe user summary. Failures include `404 USER_NOT_FOUND` and `422 VALIDATION_ERROR` after authorization.

### `PATCH /users/:userId/status`

Access: authenticated with `users:status:manage`; trusted origin and CSRF required.

Body:

```json
{ "status": "DISABLED" }
```

Allowed statuses: `ACTIVE`, `DISABLED`.

Behavior:

- Disabling revokes all active sessions for the target immediately.
- Administrators cannot change an owner.
- The last active owner cannot be disabled.
- Repeating the current status is idempotent.

Important failures: `403 FORBIDDEN`, `403 CSRF_INVALID`, `404 USER_NOT_FOUND`, `409 LAST_OWNER_REQUIRED`, `422 VALIDATION_ERROR`.

### `POST /users/:userId/roles`

Access: authenticated with `users:roles:manage`; trusted origin and CSRF required.

Body:

```json
{ "roleCode": "ADMIN" }
```

Allowed roles: `OWNER`, `ADMIN`, `CUSTOMER`.

Behavior:

- Assignment is idempotent.
- Only owners can assign `OWNER`.
- Administrators cannot modify an existing owner.
- New assignment includes the actor and records `ROLE_ASSIGNED`.

Important failures: `403 FORBIDDEN`, `404 USER_NOT_FOUND`, `404 ROLE_NOT_FOUND`, `422 VALIDATION_ERROR`.

### `DELETE /users/:userId/roles/:roleCode`

Access: authenticated with `users:roles:manage`; trusted origin and CSRF required.

Behavior:

- Removing an absent assignment is idempotent.
- Only owners can remove `OWNER`.
- Administrators cannot modify owners.
- The last active owner cannot lose `OWNER`.

Important failures: `403 FORBIDDEN`, `404 USER_NOT_FOUND`, `404 ROLE_NOT_FOUND`, `409 LAST_OWNER_REQUIRED`, `422 VALIDATION_ERROR`.

### `GET /roles`

Access: authenticated with `roles:read`.

Success: lists the three migration-controlled system roles with descriptions and permission codes. Phase 2 does not permit arbitrary role creation.

### `GET /permissions`

Access: authenticated with `permissions:read`.

Success: lists the five Phase 2 permission definitions.

## Stable Phase 2 errors

| HTTP | Code | Meaning |
|---:|---|---|
| 401 | `AUTHENTICATION_REQUIRED` | Session is missing or no longer usable |
| 401 | `INVALID_CREDENTIALS` | Login cannot be accepted |
| 403 | `FORBIDDEN` | Authenticated user lacks permission or violates an owner rule |
| 403 | `CSRF_INVALID` | CSRF cookie/header is absent or invalid |
| 403 | `ORIGIN_NOT_ALLOWED` | Unsafe request did not come from the configured web origin |
| 404 | `USER_NOT_FOUND` | Authorized operator requested an unknown user |
| 404 | `ROLE_NOT_FOUND` | Authorized operator requested an unknown role |
| 409 | `REGISTRATION_UNAVAILABLE` | Registration details cannot be used |
| 409 | `LAST_OWNER_REQUIRED` | Operation would remove the last active owner |
| 422 | `VALIDATION_ERROR` | Path, query, or body input is invalid |
| 429 | `AUTH_RATE_LIMITED` | Authentication request rate exceeded |

All error envelopes include a request identifier and safe message. Passwords, session tokens, CSRF tokens, database details, and stack traces are excluded.

## Why these choices were made

### Why opaque database sessions instead of JWT access tokens?

The current product is a browser application with one API process. Database sessions give immediate revocation, immediate disabled-user enforcement, and no stale embedded role claims. JWTs would add rotation, refresh-token, claim-staleness, and revocation complexity without a current distributed-service requirement.

### Why store token digests?

A database leak should not provide immediately usable bearer session tokens. The API hashes presented tokens and looks up only the SHA-256 digest.

### Why both SameSite and CSRF protection?

SameSite is valuable defense-in-depth but is not the only policy boundary. Exact-origin validation and a session-bound header token make the accepted browser origin explicit for unsafe actions.

### Why Argon2id?

Argon2id is a current memory-hard password hashing choice. The implementation uses explicit memory, time, and parallelism parameters and never stores plaintext passwords.

### Why load permissions on every request?

It makes account disables and role changes effective immediately. Phase 2 favors security clarity over premature caching. Caching can be introduced later with explicit invalidation rules and measured need.

### Why fixed roles instead of custom role creation?

The product's administrator/employee policy is not yet broad enough to define safe custom-role governance. Migration-controlled roles provide a reviewable least-privilege baseline and avoid inventing Phase 3 employee workflows.

### Why an interactive owner bootstrap?

Public “first user becomes owner” logic is vulnerable to races and accidental exposure. An explicit local command makes ownership creation deliberate and keeps the password out of shell history and committed configuration.

### Why an in-memory rate limiter?

Phase 2 runs one API process and Phase 6 owns Redis/queues. An in-memory limit provides useful local protection now without prematurely installing distributed infrastructure. It must be replaced or backed by a shared store before horizontal scaling.

## Phase 2 questions and answers

### Q1. Is Phase 2 the same as complete product authentication?

No. It provides the approved registration, login, session, logout, status, and RBAC foundation. Email verification, recovery, MFA, federated login, employee invitations, and user-controlled deletion remain deferred decisions.

### Q2. Can a customer make themselves an administrator by changing frontend data?

No. The browser does not supply trusted roles. The API loads role assignments from MySQL and denies customer access to administration endpoints.

### Q3. Can hiding the Users link protect the API?

No. The link is hidden for usability only. API middleware and service rules enforce every protected operation independently.

### Q4. What is the difference between `401` and `403`?

`401` means no valid authenticated session. `403` means the session is valid but the user lacks a required permission or violates a protected owner rule.

### Q5. What happens when an administrator is disabled?

The status becomes `DISABLED`, all active sessions are revoked in the same transaction, and subsequent protected requests return `401`.

### Q6. What happens when a role changes?

The next API request reloads authorization from the database, so server access changes immediately. An already-rendered browser page may display old navigation until session refresh/reload, but the API decision is current.

### Q7. Can an administrator create another owner?

No. Only an existing owner can assign or remove `OWNER`.

### Q8. Can the final owner disable themselves or remove their owner role?

No. Transactional checks return `409 LAST_OWNER_REQUIRED`.

### Q9. Are passwords returned by any endpoint or stored in security events?

No. Only Argon2id hashes are stored in the user table, and passwords are excluded from responses, logs, event metadata, and fixtures.

### Q10. Are session tokens stored in plaintext?

No. The raw value exists only in the protected browser cookie. MySQL stores a SHA-256 digest.

### Q11. Why is the CSRF cookie readable by JavaScript?

The frontend must copy it to `X-CSRF-Token`. It is not the authentication bearer credential; the actual session cookie remains `HttpOnly`. XSS defenses still matter because an injected script can act as the user.

### Q12. Does logout revoke every device?

No. Phase 2 logout revokes the current session. Disabling an account revokes all sessions. A user-facing “log out all devices” flow is a future lifecycle enhancement.

### Q13. What happens after five wrong passwords?

The known active account receives a 15-minute lock window, but the public response remains the generic invalid-credentials error. The IP limiter provides an additional boundary.

### Q14. Does the rate limiter work across multiple API servers?

No. The approved Phase 2 store is in memory per process. A shared store is required before horizontal scaling.

### Q15. Can arbitrary permissions be added through the API?

No. Roles, permissions, and mappings are version-controlled in the migration. The API lists them and manages approved user-role assignments.

### Q16. Is OpsPilot multi-tenant now?

No. ADR 0003 explicitly selects a single-business Phase 2 baseline. Tenant ownership and isolation require a future reviewed schema change before multi-business use.

### Q17. Why are security events separate from `audit_logs`?

Phase 2 needs durable evidence for authentication and authorization changes. Phase 5 still owns the wider audit model, retention, access, export, and business-event policy.

### Q18. Can a session be reused after expiry or logout?

No. Authentication rejects expired or revoked rows. The opaque token cannot be refreshed implicitly.

### Q19. Why is production startup blocked when secure cookies are disabled?

Sending session cookies over non-TLS production transport would expose credentials. Configuration validation fails fast instead of silently weakening the boundary.

### Q20. What should be built next?

Phase 3 Business Core requirements and data rules are now being reviewed. Phase 3 must reuse these identity and permission boundaries rather than introducing its own authentication logic.
