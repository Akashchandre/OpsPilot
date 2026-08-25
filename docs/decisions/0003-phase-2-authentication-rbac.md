# ADR 0003 — Phase 2 Authentication and RBAC

## Status

Accepted on 2026-08-25.

## Context

Phase 2 needs browser authentication, revocable sessions, and deny-by-default authorization without introducing Phase 6 infrastructure or an external identity provider. The initial product tenancy model also needs to be fixed before identity tables are created.

## Decision

- The initial release is single-business. Tenant tables and tenant claims are not introduced in Phase 2.
- Public registration creates active `CUSTOMER` users. `OWNER` accounts are created only through a local, one-time interactive bootstrap command.
- System roles are `OWNER`, `ADMIN`, and `CUSTOMER`. System role and permission definitions are migration-controlled; Phase 2 APIs can list them and manage user-role assignments but cannot create arbitrary roles or permissions.
- Authentication uses opaque, random, database-backed sessions. Only a SHA-256 digest of each session token is stored.
- The browser receives the session token only through an `HttpOnly`, `SameSite=Lax` cookie. Production cookies are `Secure`.
- Unsafe browser requests must come from the configured web origin. Authenticated unsafe requests also require a session-bound CSRF token in `X-CSRF-Token`.
- Passwords use Argon2id with reviewed parameters. Login and registration endpoints are rate-limited in process for Phase 2; a shared store is deferred until Phase 6 or an earlier scaling need.
- Permissions are loaded from MySQL on every protected request, so user status and role changes take effect immediately without embedding authorization claims in the browser session.
- The last active owner cannot be disabled or lose the `OWNER` role. Only owners can grant or remove the `OWNER` role, and administrators cannot modify owner accounts.
- Phase 2 records narrow authentication/authorization security events. The broader business audit-log model remains owned by Phase 5.
- Email verification, password reset, MFA, employee invitation, and self-service account deletion are deferred. Disabled status is used instead of deletion during Phase 2.

## Approved dependencies

| Package | Version | Purpose | Operational notes |
|---|---:|---|---|
| `argon2` | `0.45.1` | Argon2id password hashing | Native package; verify supported Windows/Node 24 binary during installation |
| `cookie-parser` | `1.4.7` | Parse the opaque session cookie | No signing secret is required because the random token is verified against its database digest |
| `express-rate-limit` | `8.6.2` | Rate-control sensitive authentication endpoints | In-memory Phase 2 store; not suitable for horizontally scaled deployment |
| `react-router-dom` | `7.18.2` | Browser and protected frontend navigation | Client-side guards remain a usability boundary only |

No external service or account is required. Configuration adds cookie, session-lifetime, and authentication rate-limit controls. Bootstrap passwords are entered interactively and are not accepted through command-line arguments or environment variables.

## Consequences

Sessions are immediately revocable and authorization remains server-authoritative. The approach is intentionally optimized for the current single API process and browser client. Multi-tenancy, distributed rate-limit/session caching, federated identity, recovery, verification, MFA, and custom-role administration require later explicit decisions and migrations.
