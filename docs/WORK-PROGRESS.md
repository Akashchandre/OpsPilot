# Work Progress

**Last updated:** 2026-08-25

## Current Phase

Phase 3 — Business Core

## Status

IN PROGRESS — REQUIREMENTS/DESIGN REVIEW

## Completed

- Phase 1 foundation implementation, review, and explicit acceptance.
- React/Vite and Express/Prisma/MySQL workspace foundation with validated configuration, versioned health API, centralized errors, tests, coverage, build, migrations, and live readiness checks.
- Phase 2 authentication/RBAC requirements, dependency review, ADR, permission matrix, and threat model.
- Phase 2 users, roles, permissions, assignments, opaque sessions, and security-event schema plus seeded migration.
- Argon2id registration/login, account lock windows, session lifecycle, logout, trusted-origin checks, CSRF, and per-process authentication rate limits.
- Deny-by-default authentication/permission middleware plus owner/admin and last-active-owner safeguards.
- Authorized user listing/retrieval, status management, role assignment/removal, and role/permission discovery APIs.
- Interactive one-time owner bootstrap without password arguments or password environment variables.
- React Router registration, login, session restoration, dashboard, access-denied, and user-administration UI.
- Phase 2 API/UI guide, acceptance report, security documentation, and synchronized architecture/schema/contracts.
- Phase 2 gate rerun: lint, formatting, Prisma validation, development/test migration status, 20 API tests, 8 web tests, enforced coverage, and production build passed.
- Phase 2 explicitly accepted and Phase 3 authorized on 2026-08-25.
- Phase 3 specification reviewed; initial decision proposal, permission proposal, and threat-model draft created without adding dependencies or schema.

## In Progress

- Review and approval of the Phase 3 product, category, money, inventory, lifecycle, permission, API/UI, and employee-scope decisions.

No Phase 3 product code or migration has been created. This is deliberate: the governing specification marks these choices as **Decision Required**.

## Next Task

Approve or amend `docs/phase-3/PHASE-03-DECISION-PROPOSAL.md`, including the initial three-letter business currency. After approval:

1. Record the accepted decisions in ADR 0004.
2. Add migration-controlled Phase 3 permissions.
3. Implement and migrate the approved catalog/inventory schema.
4. Build catalog/category/inventory services and APIs with concurrency tests.
5. Build the public catalog and protected management UI.

## Accepted Decisions

- JavaScript for the React frontend and Node.js/Express backend; Python remains reserved for the later AI service.
- npm workspaces, ECMAScript modules, Node.js 24.19.x, React/Vite, Express, Prisma/MySQL, Vitest, ESLint, and Prettier.
- Single-business initial release.
- Public customer registration and interactive owner bootstrap.
- Database-backed opaque cookie sessions with CSRF and exact-origin protection.
- Argon2id and database-backed deny-by-default RBAC.
- Migration-controlled `OWNER`, `ADMIN`, and `CUSTOMER` roles and Phase 2 permissions.
- Verification, recovery, MFA, employee invitations, and account deletion remain deferred until reviewed.
- Dependencies and services are reviewed before installation and are not added speculatively.

## Phase 3 Decisions Requiring Approval

- Public versus authenticated active-catalog reads.
- Product fields, normalized SKU, flat many-to-many categories, and no initial variants/images.
- Single-business currency code; fixed-precision price and string money responses.
- Search/filter/sort/pagination allowlists.
- Product/category lifecycle and archive-only deletion.
- One aggregate inventory balance plus immutable adjustments, optimistic concurrency, and nonnegative whole-number stock.
- Public availability versus protected exact stock.
- `products:manage`, `categories:manage`, `inventory:read`, and `inventory:adjust` mappings.
- Deferral of employee profiles/invitations/new staff roles.
- Proposed Phase 3 API and UI routes.

## Known Issues

- The installed system Node.js remains 20.19.4 because active Node processes prevent MSI replacement. Verification uses an official portable Node.js 24.19.0 runtime; complete the system upgrade after active sessions are closed.
- `npm audit` reports three high-severity findings associated with the existing recursive-object stack-exhaustion advisory in `deepmerge-ts` through the local Prisma CLI configuration path. npm offers only a breaking Prisma downgrade; no forced fix was applied. Runtime application requests do not process Prisma configuration.
- The Phase 2 authentication rate limiter is per process and needs a shared store before horizontal scaling.

## Phase Gate

Phase 2 is accepted. Phase 3 planning is active. Do not create Phase 3 schema, business APIs, or UI until the Phase 3 decision proposal is approved. Do not begin orders, payments, production-backend, real-time, job, or AI phases.
