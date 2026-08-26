# Work Progress

**Last updated:** 2026-08-26

## Current Phase

Phase 3 — Business Core (accepted; Phase 4 not started)

## Status

ACCEPTED

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
- Phase 3 business rules approved and recorded in ADR 0004 with `INR` as the single-business currency.
- Phase 3 permission matrix and threat model accepted for implementation.
- Migration-controlled products, categories, assignments, aggregate inventory balances, immutable adjustments, database constraints, and four permissions implemented and deployed to development/test databases.
- Public active catalog and product details implemented with bounded allowlisted query behavior and boolean-only availability.
- Protected product/category management implemented with normalized uniqueness, lifecycle rules, CSRF, permissions, and optimistic versions.
- Protected exact inventory, threshold maintenance, and atomic balance-plus-ledger adjustments implemented with concurrency and nonnegative-stock safeguards.
- Responsive public products, product detail, protected catalog management, and protected inventory UI implemented.
- Phase 3 API/UI implementation guide plus synchronized architecture, database, API, permission, security, and phase documentation created.
- Phase 3 verification currently passes 34 API tests and 13 web tests with all configured coverage gates.
- Resolved the local owner-login database pool failure by allowing MySQL `caching_sha2_password` public-key retrieval only for loopback hosts; remote hosts remain deny-by-default.
- Phase 3 UI behavior validated by the user and the phase explicitly accepted on 2026-08-26.

## In Progress

- No implementation phase is active. Phase 4 has not started.

## Next Task

When explicitly instructed, review `docs/phases/PHASE-04-ORDERS-PAYMENTS.md`, resolve its business and security decisions, and plan Phase 4 before changing schema or code.

## Accepted Decisions

- JavaScript for the React frontend and Node.js/Express backend; Python remains reserved for the later AI service.
- npm workspaces, ECMAScript modules, Node.js 24.19.x, React/Vite, Express, Prisma/MySQL, Vitest, ESLint, and Prettier.
- Single-business initial release.
- Public customer registration and interactive owner bootstrap.
- Database-backed opaque cookie sessions with CSRF and exact-origin protection.
- Argon2id and database-backed deny-by-default RBAC.
- Migration-controlled `OWNER`, `ADMIN`, and `CUSTOMER` roles and Phase 2 permissions.
- Public active catalog; protected business management; UUID products; normalized immutable SKU; flat categories; plain text; `DECIMAL(12,2)` prices; single `INR` currency; draft/active/archive lifecycle; optimistic versions.
- One aggregate nonnegative whole-number stock balance plus immutable atomic adjustment ledger; public boolean availability and protected exact stock.
- `products:manage`, `categories:manage`, `inventory:read`, and `inventory:adjust` assigned to `OWNER` and `ADMIN`.
- Product/category hard deletion, variants, images, hierarchy, warehouses, reservations, fractional stock, taxes, discounts, currency conversion, and new employee models are deferred.
- Verification, recovery, MFA, employee invitations, and account deletion remain deferred until reviewed.
- Dependencies and services are reviewed before installation and are not added speculatively.

## Phase 3 Acceptance Evidence

- Accepted decision record: `docs/decisions/0004-phase-3-business-core.md`.
- Permission mapping: `docs/permissions/PHASE-03-PERMISSION-MATRIX.md`.
- Security review: `docs/security/PHASE-03-THREAT-MODEL.md`.
- API/UI behavior and review Q&A: `docs/phase-3/PHASE-03-IMPLEMENTATION-GUIDE.md`.
- Consolidated technical evidence: `docs/phase-3/PHASE-03-REVIEW-REPORT.md`.
- API coverage: 83.78% statements, 67.36% branches, 92.97% functions, 87.06% lines.
- Web coverage: 84.44% statements, 69.38% branches, 83.41% functions, 86.28% lines.
- Lint, formatting, Prisma validation, development/test migration status, production build, live API/web smoke, and Git whitespace checks pass.

## Known Issues

- The installed system Node.js remains 20.19.4 because active Node processes prevent MSI replacement. Verification uses an official portable Node.js 24.19.0 runtime; complete the system upgrade after active sessions are closed.
- `npm audit` reports three high-severity findings associated with the existing recursive-object stack-exhaustion advisory in `deepmerge-ts` through the local Prisma CLI configuration path. npm offers only a breaking Prisma downgrade; no forced fix was applied. Runtime application requests do not process Prisma configuration.
- The Phase 2 authentication rate limiter is per process and needs a shared store before horizontal scaling.

## Phase Gate

Phases 1, 2, and 3 are accepted. Phase 4 has not started and no cart, order, payment, production-backend, real-time, job, or AI implementation is authorized by this status update alone.
