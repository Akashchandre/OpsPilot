# Phase 2 Authentication and RBAC Threat Model

**Status:** Reviewed and accepted with Phase 2 on 2026-08-25. Revisit the residual risks when their owning phases introduce scaling, recovery, multi-tenancy, or additional administrative workflows.

## Scope

This threat model covers public registration, login, logout, opaque sessions, CSRF protection, user status, role assignments, owner bootstrap, and protected Phase 2 APIs. It does not authorize Phase 3 business resources or future tenant, payment, upload, real-time, or AI features.

## Assets and trust boundaries

- Passwords, password hashes, session tokens, CSRF tokens, user status, roles, permissions, and security events are sensitive assets.
- The browser and all request input are untrusted.
- Express establishes authenticated identity and authorization scope for every protected request.
- MySQL is the durable identity/session/authorization source of truth.
- Frontend route guards improve navigation only; they never grant access.

## Threats and controls

| Threat | Phase 2 control | Residual risk / follow-up |
|---|---|---|
| Credential theft from storage | Argon2id hashes only; passwords excluded from responses, logs, and events | Host/database compromise still requires incident response and credential rotation |
| Session theft | Random opaque token, digest-only database storage, `HttpOnly`, `SameSite=Lax`, production `Secure`, fixed expiry, revocation | Device compromise remains possible; MFA and session-management UI are deferred |
| CSRF | Exact trusted-origin check for unsafe methods plus session-bound `X-CSRF-Token` | Deployment must keep the configured web origin accurate |
| Brute force and credential stuffing | Per-IP authentication limiter, failed-attempt lock window, generic login failure | In-memory limiter is per process until a shared Phase 6 store exists |
| User enumeration | Generic login and duplicate-registration responses; no raw email in security events | Timing is reduced with dummy password verification but cannot be guaranteed identical |
| Horizontal privilege escalation | Authenticated subject is derived from session; protected user operations enforce permissions and target rules | Future business resources need their own ownership checks |
| Vertical privilege escalation | Deny by default; permissions loaded from database; only owners can manage owner role | Owner endpoint and bootstrap access require operational discipline |
| Stale authorization | Roles and active status resolved on each request; disabled users lose session access immediately | Existing sessions remain stored until expiry/revocation cleanup |
| Last-owner loss | Transactional last-active-owner checks for disable and role removal | Out-of-band direct database changes remain an administrative risk |
| Session/CSRF disclosure in logs | Tokens are never logged or placed in URLs/security-event metadata | Reverse proxies and production logging still require redaction review |
| Malicious payloads | Zod allowlisted schemas, body-size limit, stable safe errors | Denial via expensive valid password hashes is bounded by rate limits |
| Audit tampering or omission | Narrow append-only application writes for authentication and role/status events | Full audit retention/access policy remains Phase 5 work |

## Required verification

- Test valid and invalid registration, login, logout, expired/revoked sessions, CSRF, `401` versus `403`, rate limits, disabled users, immediate role changes, administrator/owner boundaries, and last-owner protection.
- Verify cookies in development and production modes without exposing their values.
- Revisit this threat model before enabling multiple API instances, a proxy topology, tenant isolation, verification/recovery, MFA, or externally accessible administration.
