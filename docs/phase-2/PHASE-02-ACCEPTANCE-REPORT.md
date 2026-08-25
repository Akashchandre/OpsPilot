# Phase 2 Acceptance Report

## Decision

Phase 2 — Authentication and RBAC was accepted on 2026-08-25. The user instructed the project to verify Phase 2, update the documentation, and begin Phase 3. The verification below passed without a product-code correction.

## Acceptance-criteria evidence

| Criterion | Evidence | Result |
|---|---|---|
| Approved registration, login, session restoration, and logout work | Real-MySQL API integration coverage and live web/API/MySQL smoke path | Pass |
| Passwords and credentials are handled safely | Argon2id unit tests, digest-only sessions, safe response/event review, credential scan | Pass |
| Protected APIs distinguish unauthenticated and forbidden access | Integration tests cover `401`, `403`, expired sessions, customer denial, and owner/admin access | Pass |
| Role/status changes follow owner constraints and take effect immediately | Integration tests cover immediate permission changes, disabled-session revocation, administrator/owner boundaries, and last-owner protection | Pass |
| Frontend guards and states agree with the API | Web tests cover redirects, login, registration, access denial, administration, CSRF, logout, and health failure | Pass |
| Database schema and migrations agree | Prisma schema validation and migration status for development and test databases | Pass |
| Documentation and security artifacts agree with implementation | ADR 0003, permission matrix, threat model, API guide, architecture, schema design, and runbook reviewed | Pass |
| Phase 1 remains stable and no Phase 3 business code exists | Full lint, coverage, build, schema, migration, and Git integrity checks | Pass |

## Verification run

- ESLint: passed.
- Prettier check: passed.
- Prisma schema validation: passed.
- Development database: two migrations found; schema up to date.
- Test database: two migrations found; schema up to date.
- API: 6 test files and 20 tests passed.
- API coverage: 90.66% statements, 80% branches, 97.19% functions, 92.67% lines.
- Web: 1 test file and 8 tests passed.
- Web coverage: 81.60% statements, 69.91% branches, 83.33% functions, 83.75% lines.
- Vite production build: passed.
- Previously completed live registration/session/logout smoke path: passed and temporary test data removed.
- Git whitespace check and known-local-credential scan: passed.

The first attempted gate command resolved to the machine's old Node.js 20.19.4 and failed before running the project because of the documented local toolchain condition. The complete gate was rerun with the approved portable Node.js 24.19.0 runtime and passed.

## Accepted residual issues

- The machine-wide Node.js installation remains 20.19.4; repository verification uses the approved portable Node.js 24.19.0 runtime until a maintenance window permits replacement.
- `npm audit` reports three high-severity transitive findings in `deepmerge-ts` through the local Prisma CLI configuration path. npm proposes only a breaking Prisma downgrade, so no forced change was made. Runtime HTTP requests do not process Prisma configuration.
- Authentication rate limiting is in memory per API process and must use a shared store before horizontal scaling.
- Verification/recovery, MFA, employee invitations, custom roles, account deletion, multi-tenancy, and broader auditing remain owned by later reviewed work.

## Phase transition

Phase 3 — Business Core is authorized to begin. Its first milestone is requirements and decision review because the Phase 3 specification deliberately leaves catalog, inventory, currency, lifecycle, and employee boundaries unresolved. No Phase 3 schema migration or business API should be created until those choices are approved.
