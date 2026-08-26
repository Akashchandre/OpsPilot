# ADR 0004 — Phase 3 Business Core Baseline

## Status

Accepted on 2026-08-25 by explicit user approval of the complete Phase 3 recommendation. The single-business currency is `INR`.

## Context

Phase 3 needs a catalog and concurrency-safe stock boundary before carts and orders. The product has not selected variants, warehouses, file storage, employee onboarding, tax, discount, or multi-currency rules. The implementation must reuse Phase 2 identity and authorization without adding speculative infrastructure.

## Decision

- Active products and categories are publicly readable. All management writes require the accepted session, exact-origin, CSRF, validation, and permission boundaries.
- A product has a UUID, immutable normalized unique SKU, plain-text name/description, `DECIMAL(12,2)` price, `INR` currency, `DRAFT`/`ACTIVE`/`ARCHIVED` lifecycle, timestamps, and optimistic version.
- Categories are flat, have unique normalized slugs, and relate many-to-many with products. A product must have at least one active category before activation.
- Variants, product images, arbitrary remote media, rich HTML, and object storage are deferred.
- Phase 3 uses one currency (`INR`), string money values in JSON, and no tax, discount, coupon, or currency conversion rules.
- Catalog queries use bounded offset pagination, allowlisted filters/sorts, stable ID tie-breakers, and MySQL/Prisma search. No search service is added.
- One aggregate inventory balance exists per product. Exact stock and adjustment history are protected; public catalog responses expose only `inStock`.
- Every inventory mutation atomically updates the balance and appends an adjustment with actor, controlled reason, before/after quantities, optional note, request ID, and timestamp.
- Inventory is whole-number, single-location, nonnegative, and guarded by optimistic version checks. Warehouses and reservations are deferred.
- Products use archive lifecycle rather than hard deletion. Categories use active/inactive lifecycle and cannot be deactivated while linked to an active product.
- Management updates require an expected integer version and return `RESOURCE_VERSION_CONFLICT` when stale.
- New migration-controlled permissions are `products:manage`, `categories:manage`, `inventory:read`, and `inventory:adjust`; `OWNER` and `ADMIN` receive them, while `CUSTOMER` does not.
- Phase 2 user administration remains the approved customer-administration boundary. Employee profiles, invitations, and new employee/manager roles are deferred.
- No new package, account, service, or secret is required. `BUSINESS_CURRENCY` centralizes the accepted value and defaults to `INR` for this single-business baseline.

## Consequences

The baseline is intentionally small but provides stable product, category, price, and stock semantics for Phase 4. Variant, warehouse, reservation, media, employee, multi-currency, tax, and discount requirements need later reviewed migrations rather than being inferred from this schema. Optimistic conflicts require clients to refresh before retrying. Public availability reveals only whether stock is positive.
