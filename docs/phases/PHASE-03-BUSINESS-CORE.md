# Phase 3 — Business Core

## Status

**IN PROGRESS — REQUIREMENTS/DESIGN REVIEW.** Phase 2 passed its acceptance gate and was accepted on 2026-08-25. The user authorized Phase 3 to begin. No Phase 3 schema or product code has been created because the business rules below require review first.

## Objective

Implement the authorized catalog and core operational data needed before commerce: products, categories, inventory, and approved customer/employee administration.

## Requirements and goals

- Customer product browsing, details, search, filter, sort, and pagination.
- Authorized product/category creation and maintenance.
- Inventory visibility and adjustments with concurrency safety.
- Authorized customer/employee management consistent with Phase 2 RBAC.
- Responsive UI with complete loading, empty, validation, error, and authorization states.

## Decisions required

Product/category model; category hierarchy/multiplicity; SKU/variant/product image support; pricing/currency; tax/discount scope; search method; inventory ledger versus counters; warehouses/reservations/low-stock rules; archival/deletion; employee data/onboarding and permission boundaries.

The recommended answers, alternatives, consequences, proposed API/UI boundary, and approval checklist are documented in `docs/phase-3/PHASE-03-DECISION-PROPOSAL.md`. The proposed permission matrix and draft threat model are in `docs/permissions/PHASE-03-PERMISSION-MATRIX-PROPOSAL.md` and `docs/security/PHASE-03-THREAT-MODEL-DRAFT.md`.

The proposal deliberately remains unaccepted until the user confirms or changes it, including the initial business currency. No new dependency or external service is proposed for the baseline.

## Tasks

Finalize requirements and schema; approve any current-phase dependencies/storage; implement migrations and constraints; build services/repositories/controllers/routes and validation; implement customer catalog UI and protected admin management UI; implement safe inventory adjustments and audit trail; add tests, seed/fixture strategy, documentation, and progress updates.

Current task: approve the Phase 3 decision proposal. The next implementation task after approval is ADR 0004 plus the permission/catalog/inventory schema and migration.

## Acceptance criteria

- Customers see only available/approved catalog data under documented rules.
- Search/filter/sort/pagination are allowlisted, deterministic, bounded, and documented.
- Authorized operators can maintain catalog and inventory; unauthorized users cannot.
- Concurrent inventory adjustments preserve invariants and cannot silently produce invalid stock.
- Product changes do not violate referenced historical data strategy.
- UI fully represents empty, unavailable, invalid, conflict, and success states.

## Testing requirements

Unit tests for catalog/inventory rules; API tests for CRUD boundaries, validation, duplicate SKU, pagination/filter/sort, permissions, not-found/conflict, archive/delete policy, and concurrent adjustments; frontend behavior/accessibility tests; E2E customer browse and admin update smoke paths.

## Edge cases

Duplicate/normalized SKUs, zero/out-of-stock, negative or huge quantities, concurrent adjustments, inactive category/product, category with products, stale edits, price precision/currency mismatch, special characters and empty searches, page boundaries, deleted employee/user references.

## Security considerations

Enforce write permissions server-side; prevent mass assignment and unsafe dynamic sort/filter queries; sanitize rich content/file handling if introduced; limit enumeration and payload sizes; audit sensitive inventory/admin changes; preserve future tenant isolation.

## Completion criteria

Accepted schema/business rules are implemented; migration and authorization/concurrency tests pass; customer/admin workflows are usable; API/docs match; prior phases remain stable; order/payment code is absent; and the phase receives explicit acceptance.

## Documentation updates

Update database/API/architecture documents, product and inventory rules, permission matrix, decision records, run/test instructions, this phase status, and `WORK-PROGRESS.md`.

## Explicit exclusions

Cart, checkout, orders, payment providers, real-time infrastructure, background jobs, and AI remain out of scope.

The current recommended baseline also defers variants, image/file handling, category hierarchies, multiple warehouses, reservations, fractional quantities, taxes/discounts, currency conversion, and new employee onboarding/profile models. These proposal-specific deferrals require approval.
