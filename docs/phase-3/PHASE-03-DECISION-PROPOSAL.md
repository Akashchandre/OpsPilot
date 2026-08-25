# Phase 3 Business Core Decision Proposal

## Status

**REVIEW REQUIRED.** Phase 3 is authorized and has entered requirements/design. The choices in this document are recommendations, not accepted decisions. No catalog or inventory schema migration should be created until the user approves or changes them.

## Scope goal

Deliver a dependable single-business catalog and inventory baseline using the accepted React, Express, Prisma, MySQL, session, CSRF, and RBAC architecture. Phase 3 must not add cart, checkout, orders, payments, files/object storage, Redis, background jobs, real-time messaging, or AI.

## Recommended baseline

### 1. Catalog audience

**Recommendation:** Allow public read-only access to active catalog products/categories. Require Phase 2 authentication, permission middleware, trusted origin, and CSRF for every management write.

Why: product discovery normally should not require account creation, while every mutation remains server-authorized. If the intended business is private/wholesale, catalog reads can instead require authentication.

### 2. Product model

**Recommendation:** A product has a UUID, normalized unique SKU, name, plain-text description, fixed-precision price, ISO currency code, lifecycle status, timestamps, and optimistic version. Do not add variants in the first Phase 3 increment.

Proposed constraints:

- SKU: trimmed, uppercase, 1–64 characters, allowlisted letters, digits, hyphen, and underscore; unique.
- Name: trimmed, 2–160 characters.
- Description: plain text, maximum 5,000 characters; no HTML/rich-text rendering.
- Price: `DECIMAL(12,2)`, nonnegative.
- Currency: uppercase three-letter ISO-style code.
- Status: `DRAFT`, `ACTIVE`, or `ARCHIVED`.
- Version: nonnegative integer incremented on management updates.

Why: this supplies a safe sellable-product boundary without prematurely designing variants, tax, discounts, media storage, or order history.

### 3. Categories

**Recommendation:** Use flat categories and a many-to-many product/category relationship. A product may be uncategorized while in draft but must have at least one active category before activation.

Category fields: UUID, unique normalized slug, name, optional plain-text description, `ACTIVE`/`INACTIVE` status, timestamps, and version.

Why: flat categories avoid hierarchy cycle and subtree rules. Many-to-many supports practical browsing without forcing duplicate products. Hierarchical categories can be added through a reviewed self-reference later.

### 4. Variants and images

**Recommendation:** Defer product variants, image upload, and object storage. Use a deterministic UI placeholder and do not accept arbitrary HTML or file paths. An optional external image URL is also deferred to avoid an unreviewed remote-content/privacy policy.

Why: variants create independent SKU, price, and stock-unit rules. Image upload requires storage, file validation, authorization, malware policy, retention, and delivery decisions.

### 5. Currency, taxes, and discounts

**Recommendation:** Store money as decimal and return it as a JSON string plus currency. Require one configured business currency for all Phase 3 products; the exact currency value is a deployment/business decision. Defer taxes and discounts to Phase 4.

Why: a single currency prevents mixed-currency carts before conversion and settlement policies exist. Floating-point numbers must not represent money.

**Decision Required:** select the initial business currency, for example `INR`, `USD`, or another three-letter code.

### 6. Search, filters, sorting, and pagination

**Recommendation:** Use bounded MySQL/Prisma queries without a new search service.

- Search: normalized case-insensitive match on name or exact/prefix SKU behavior; maximum 100 characters.
- Filters: category slug, availability, minimum price, maximum price.
- Sort allowlist: `name`, `price`, `createdAt`, each `asc` or `desc`.
- Determinism: append `id` as the stable tie-breaker.
- Pagination: offset pages, default 20, maximum 100.
- Public catalog: `ACTIVE` products and active categories only.

Why: this meets the current scale-independent contract without Elasticsearch or unsafe dynamic fields. Query plans can be reviewed when representative data exists.

### 7. Inventory model

**Recommendation:** Use one aggregate inventory balance per product plus an immutable inventory-adjustment ledger.

`inventory_balances` should contain product ID, on-hand quantity, optimistic version, low-stock threshold, and timestamps. `inventory_adjustments` should contain product, signed delta, quantity before/after, controlled reason, optional safe note, acting user, request ID, and timestamp.

Rules:

- On-hand quantity must never become negative.
- Every successful quantity change and its ledger row are committed atomically.
- Optimistic version checks detect stale concurrent updates; conflicts return `409` rather than silently losing a change.
- Quantity is a whole number in the initial baseline.
- Proposed reasons: `INITIAL`, `RESTOCK`, `CORRECTION`, and `DAMAGE`.
- Adjustment rows are append-only through application APIs.

Why: a balance makes reads efficient, while a ledger explains how stock changed. Warehouses, reservations, lots, serial numbers, and order allocation remain deferred.

### 8. Availability and low stock

**Recommendation:** A product is customer-visible only when `ACTIVE` and linked only through active catalog data. Zero stock remains visible as out of stock. The initial API exposes `inStock` to public clients, not the exact quantity. Exact quantity and low-stock state require `inventory:read`.

Why: visibility and availability are separate product states, and exact stock can be commercially sensitive.

### 9. Lifecycle and deletion

**Recommendation:** Use lifecycle status instead of hard deletion.

- Products: `DRAFT` → `ACTIVE` → `ARCHIVED`; archived products may be restored to draft after validation.
- Categories: `ACTIVE` or `INACTIVE`; a category with active product links cannot be made inactive until those links are changed.
- No product/category/inventory hard-delete API in Phase 3.

Why: Phase 4 orders will need stable historical references. Archive semantics also avoid accidental destructive operations.

### 10. Management concurrency

**Recommendation:** Require the current integer `version` in update and status requests. A stale version returns `409 RESOURCE_VERSION_CONFLICT` with no mutation.

Why: two browser sessions must not silently overwrite product, category, or inventory changes.

### 11. Phase 3 permissions

**Recommendation:** Add migration-controlled permissions:

- `products:manage`
- `categories:manage`
- `inventory:read`
- `inventory:adjust`

Assign them to `OWNER` and `ADMIN`; assign none to `CUSTOMER`. Keep Phase 2 owner safeguards unchanged. Public catalog reads need no permission.

Why: catalog and inventory actions are distinct capabilities even though the initial fixed roles receive the same baseline.

### 12. Customer and employee administration

**Recommendation:** Reuse Phase 2 user administration for customers. Defer employee profiles, invitations, and new employee/manager roles until their required attributes, onboarding, and permission boundaries are explicitly approved.

Why: inventing a generic employee model would create security and HR-data assumptions not present in the product requirements. This deferral must be accepted as the Phase 3 interpretation of “approved customer/employee administration.”

### 13. Business events

**Recommendation:** Keep inventory adjustments as the durable Phase 3 operational ledger. Do not turn Phase 2 `security_events` into a general audit table. The Phase 5 audit model remains separate.

Why: operational stock evidence is a domain requirement now; enterprise-wide audit retention and querying remain Phase 5 decisions.

### 14. API shape

**Recommendation:** Keep resource URLs under `/api/v1`:

- Public: `GET /products`, `GET /products/:productId`, `GET /categories`.
- Authorized product management: `POST /products`, `PATCH /products/:productId`, `PATCH /products/:productId/status`.
- Authorized category management: `POST /categories`, `PATCH /categories/:categoryId`, `PATCH /categories/:categoryId/status`.
- Authorized inventory: `GET /inventory`, `GET /inventory/:productId`, `POST /inventory/:productId/adjustments`, `GET /inventory/:productId/adjustments`.

Administrative collection visibility for draft/archived data should use an explicitly permission-gated query mode rather than exposing inactive records to public callers.

### 15. UI shape

**Recommendation:** Add:

- `/products` public catalog with search, filters, sort, pagination, loading, empty, and error states.
- `/products/:productId` public product detail.
- `/admin/catalog` protected product/category management.
- `/admin/inventory` protected inventory list and adjustment workflow.

Management actions must show validation, stale-version conflict, authorization, unavailable, and success states. The API remains authoritative.

## Dependencies and services

No new package, external service, account, connection, storage provider, or environment secret is required for this recommended baseline. React Router, Zod, Express, Prisma, MySQL, and the Phase 2 security middleware are sufficient.

The only proposed new configuration is the single-business currency code. It should be validated server-side and exposed safely to the frontend through catalog data, not treated as a secret.

## Explicitly deferred

- Product variants and variant SKUs.
- Product image upload or remote image policy.
- Category hierarchy.
- Multiple warehouses or stock locations.
- Stock reservations, carts, and order allocation.
- Fractional inventory quantities.
- Lots, batches, serial numbers, expiry dates, and suppliers.
- Tax, discounts, coupons, shipping, and currency conversion.
- Employee profiles, invitations, and manager/staff roles.
- Hard deletion and generalized audit APIs.
- Search engines, caches, queues, Redis, and real-time stock updates.

## Approval checklist

Before implementation, confirm or change:

1. Public versus authenticated catalog.
2. Flat many-to-many categories.
3. No variants or images in the first baseline.
4. Initial business currency.
5. Product statuses and archive-only deletion policy.
6. Balance plus immutable adjustment ledger.
7. One stock location, whole-number quantities, and no reservations.
8. Public `inStock` only versus exact authorized quantity.
9. Optimistic `version` conflict handling.
10. Four proposed permissions and their default role mappings.
11. Deferral of new employee models/workflows.
12. Proposed API and UI route boundaries.

An approval can be stated as: “Approve the Phase 3 recommended baseline with currency `XYZ`,” followed by any exceptions.
