# Phase 3 — Business Core

## Status

**ACCEPTED on 2026-08-26.** Phase 2 was accepted and committed as `1f0d252`. The user approved the complete recommended Phase 3 baseline on 2026-08-25, validated the delivered UI, and explicitly accepted Phase 3 after the final gate. ADR 0004, the migration, API, UI, tests, and documentation are complete. Phase 4 has not started.

## Objective

Implement the authorized catalog and core operational data needed before commerce: products, categories, inventory, and approved customer/employee administration.

## Requirements and goals

- Customer product browsing, details, search, filter, sort, and pagination.
- Authorized product/category creation and maintenance.
- Inventory visibility and adjustments with concurrency safety.
- Authorized customer/employee management consistent with Phase 2 RBAC.
- Responsive UI with complete loading, empty, validation, error, and authorization states.

## Accepted implementation decisions

Phase 3 uses a single-SKU product, flat many-to-many active categories, `INR` decimal prices, strict MySQL/Prisma search/filter/sort, one aggregate whole-number inventory balance, immutable adjustments, optimistic versions, archive/inactive lifecycle, public boolean availability, and protected exact stock.

The rationale and consequences are recorded in `docs/decisions/0004-phase-3-business-core.md`. The earlier proposal is retained as decision history in `docs/phase-3/PHASE-03-DECISION-PROPOSAL.md`. The enforced role mappings and security controls are in `docs/permissions/PHASE-03-PERMISSION-MATRIX.md` and `docs/security/PHASE-03-THREAT-MODEL.md`.

No new dependency, account, external service, or infrastructure component was required. Employee invitation/profile models and new staff roles remain deferred; existing Phase 2 user administration satisfies the approved Phase 3 identity scope.

## Tasks

Finalize requirements and schema; approve any current-phase dependencies/storage; implement migrations and constraints; build services/controllers/routes and validation; implement customer catalog UI and protected admin management UI; implement safe inventory adjustments and audit trail; add tests, documentation, and progress updates.

All implementation, verification, documentation, and acceptance tasks are complete. The next phase may begin only after a separate explicit instruction and Phase 4 requirements review.

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

The accepted schema/business rules are implemented; migration and authorization/concurrency tests pass; customer/admin workflows are usable; API/docs match; prior phases remain stable; order/payment code is absent; and explicit user acceptance was received on 2026-08-26.

## Documentation updates

Update database/API/architecture documents, product and inventory rules, permission matrix, decision records, run/test instructions, this phase status, and `WORK-PROGRESS.md`.

## Explicit exclusions

Cart, checkout, orders, payment providers, real-time infrastructure, background jobs, and AI remain out of scope.

The accepted baseline also defers variants, image/file handling, category hierarchies, multiple warehouses, reservations, fractional quantities, taxes/discounts, currency conversion, and new employee onboarding/profile models.
