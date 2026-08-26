# Phase 3 Business Core Implementation Guide

## Status

Phase 3 was explicitly accepted on 2026-08-26 after its business decisions, implementation, UI behavior, documentation, migrations, security controls, and quality gates were reviewed. Its durable decisions are recorded in ADR 0004.

## What Phase 3 adds

- A public active-product catalog with search, category, stock-availability, price, sorting, and pagination controls.
- Public product details that expose boolean availability but never exact stock.
- Protected category and product maintenance for owners and administrators.
- Product lifecycle transitions and category safety rules.
- Protected exact inventory, low-stock thresholds, immutable adjustment history, and concurrency-safe adjustments.
- Four migration-controlled permissions assigned to `OWNER` and `ADMIN`.
- MySQL constraints and Prisma transactions that reinforce application rules.
- Responsive React pages with loading, empty, validation, error, success, permission, and stale-data states.

No new npm package, external account, storage service, or infrastructure component was added.

## What you can do in the UI

Start the API and web application, then open `http://127.0.0.1:5173`.

### As a visitor or customer

1. Open **Products** in the navigation or visit `/products`.
2. Search active products by name or SKU.
3. Filter by an active category, in-stock/out-of-stock availability, or a minimum/maximum price.
4. Sort by newest, name, or price in ascending or descending order.
5. Move through bounded result pages.
6. Open a product card to visit `/products/:productId` and view its description, price, categories, and in-stock/out-of-stock state.

Visitors and customers cannot see exact quantities, low-stock thresholds, draft/archived products, inactive categories, or management controls.

### As an owner or administrator

Log in with an `OWNER` or `ADMIN` account. The navigation displays **Catalog** and **Inventory** when the current account has the required permissions.

At `/admin/catalog` you can:

- Create an active category with a normalized unique slug.
- Edit a category name, slug, or description.
- Deactivate a category when it is not linked to an active product, and reactivate it later.
- Create a draft product with a normalized unique SKU, plain-text details, `INR` price, active categories, initial quantity, and low-stock threshold.
- Edit a product name, description, price, and category assignments.
- Move products through `DRAFT → ACTIVE → ARCHIVED → DRAFT`.
- See a clear conflict message if another client changed the record after the page loaded.

At `/admin/inventory` you can:

- Search exact inventory by product name or SKU.
- See on-hand quantity, threshold, in-stock state, low-stock state, product state, and record version.
- Apply a positive `RESTOCK`, negative `DAMAGE`, or signed `CORRECTION` adjustment with an optional note.
- Change the low-stock threshold.
- Open or hide the immutable adjustment history, including before/after quantities, reason, actor, and time.
- Refresh and retry after a stale-version conflict.

The UI hides routes based on permissions for usability. Express remains the authorization boundary and independently rejects unauthorized calls.

## Permissions

| Permission | Purpose | Default roles |
|---|---|---|
| `products:manage` | Product creation, editing, category assignment, and lifecycle | `OWNER`, `ADMIN` |
| `categories:manage` | Category creation, editing, and lifecycle | `OWNER`, `ADMIN` |
| `inventory:read` | Exact balances, thresholds, and adjustment history | `OWNER`, `ADMIN` |
| `inventory:adjust` | Stock adjustments and threshold changes | `OWNER`, `ADMIN` |

`CUSTOMER` receives none of these permissions. Public active-catalog reads require no session.

## API conventions

- All routes below are prefixed with `/api/v1`.
- Success uses `{ "success": true, "data": ..., "meta": ... }`.
- Failure uses `{ "success": false, "error": { "code", "message", "details" }, "requestId" }`.
- List pagination uses `page` (default 1) and `limit` (default 20, maximum 100).
- List metadata is `{ page, limit, total, totalPages }`.
- Protected calls use the Phase 2 opaque session cookie.
- Unsafe protected calls also send the readable CSRF cookie value as `X-CSRF-Token` and must originate from the trusted web origin.
- Product, category, and inventory IDs are UUIDs.
- Prices are JSON strings with exactly two displayed decimals and a three-letter currency (`INR`).
- Mutable resource requests include their last-read `version`. A stale version returns `409 RESOURCE_VERSION_CONFLICT` without a partial write.

## Product APIs

### `GET /products`

Access: public by default. `view=management` requires `products:manage`.

Supported query fields:

| Field | Values |
|---|---|
| `page` | Integer 1 or greater |
| `limit` | Integer 1–100 |
| `view` | `public` or `management` |
| `search` | 1–100 trimmed characters; matches name or SKU |
| `category` | Normalized category slug |
| `availability` | `all`, `inStock`, or `outOfStock` |
| `minPrice`, `maxPrice` | Nonnegative decimal with at most two fractional digits |
| `sort` | `name`, `price`, or `createdAt` |
| `direction` | `asc` or `desc` |
| `status` | Management only: `ALL`, `DRAFT`, `ACTIVE`, or `ARCHIVED` |

Example response:

```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "e730e1f0-12f6-4521-9158-eb7e77ed7c71",
        "sku": "CHAIR-001",
        "name": "Ergonomic Chair",
        "description": "Adjustable office chair",
        "price": "12999.50",
        "currency": "INR",
        "status": "ACTIVE",
        "version": 2,
        "categories": [],
        "availability": { "inStock": true },
        "createdAt": "2026-08-25T12:00:00.000Z",
        "updatedAt": "2026-08-25T12:30:00.000Z"
      }
    ]
  },
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

The public view always forces active-product visibility. Supplying a status filter without `view=management` is invalid. Management mode still excludes exact stock; use the inventory API for it.

### `GET /products/:productId`

Access: public. Returns one active product in the same public shape. A draft, archived, or unknown product returns `404 PRODUCT_NOT_FOUND`.

### `POST /products`

Access: `products:manage` plus CSRF. Creates a `DRAFT` product, its inventory balance, and—only when initial quantity is positive—an `INITIAL` ledger entry.

```json
{
  "sku": "chair-001",
  "name": "Ergonomic Chair",
  "description": "Adjustable office chair",
  "price": "12999.50",
  "categoryIds": ["2ab5644e-4100-48c2-9662-f242bc7a58bf"],
  "initialQuantity": 10,
  "lowStockThreshold": 3
}
```

SKU is trimmed and uppercased. Category IDs are deduplicated and must identify active categories. The currency comes from validated server configuration and cannot be supplied by the client.

### `PATCH /products/:productId`

Access: `products:manage` plus CSRF. At least one editable field is required.

```json
{
  "version": 0,
  "name": "Ergonomic Chair Pro",
  "description": "Revised plain-text description",
  "price": "14999.00",
  "categoryIds": ["2ab5644e-4100-48c2-9662-f242bc7a58bf"]
}
```

An active product cannot be left without an active category.

### `PATCH /products/:productId/status`

Access: `products:manage` plus CSRF.

```json
{ "status": "ACTIVE", "version": 1 }
```

The allowed sequence is `DRAFT → ACTIVE → ARCHIVED → DRAFT`. Repeating the current status is idempotent. Activation requires at least one active category. There is no hard-delete API.

## Category APIs

### `GET /categories`

Access: public by default. `view=management` requires `categories:manage`.

Queries: `page`, `limit`, optional `search`, `view`, and management-only `status=ALL|ACTIVE|INACTIVE`. Public mode returns only active categories. Management responses additionally include `productCount`.

### `POST /categories`

Access: `categories:manage` plus CSRF.

```json
{
  "slug": "office-chairs",
  "name": "Office Chairs",
  "description": "Chairs for office use"
}
```

Slug is trimmed, lowercased, converted to hyphen-separated ASCII, and globally unique.

### `PATCH /categories/:categoryId`

Access: `categories:manage` plus CSRF. Send `version` plus one or more of `slug`, `name`, or `description`. Description may be `null` to clear it.

### `PATCH /categories/:categoryId/status`

Access: `categories:manage` plus CSRF.

```json
{ "status": "INACTIVE", "version": 2 }
```

An inactive transition is blocked by `409 CATEGORY_IN_USE` while any active product uses the category. There is no category hard-delete API.

## Inventory APIs

### `GET /inventory`

Access: `inventory:read`. Queries: `page`, `limit`, and optional `search` by product name/SKU.

Each result contains:

```json
{
  "product": {
    "id": "e730e1f0-12f6-4521-9158-eb7e77ed7c71",
    "sku": "CHAIR-001",
    "name": "Ergonomic Chair",
    "status": "ACTIVE"
  },
  "onHand": 10,
  "lowStockThreshold": 3,
  "inStock": true,
  "lowStock": false,
  "version": 1,
  "updatedAt": "2026-08-25T12:30:00.000Z"
}
```

### `GET /inventory/:productId`

Access: `inventory:read`. Returns one exact balance or `404 INVENTORY_NOT_FOUND`.

### `GET /inventory/:productId/adjustments`

Access: `inventory:read`. Supports `page` and `limit`. Entries are newest first and include `delta`, before/after quantities, reason, optional note, actor summary, and creation time.

### `POST /inventory/:productId/adjustments`

Access: `inventory:adjust` plus CSRF. Success is `201` and returns the updated balance.

```json
{
  "delta": 5,
  "reason": "RESTOCK",
  "note": "Supplier delivery 1042",
  "version": 1
}
```

Rules:

- `RESTOCK` requires a positive delta.
- `DAMAGE` requires a negative delta.
- `CORRECTION` accepts a positive or negative delta.
- Zero is never valid.
- One request is limited to ±1,000,000 units.
- Resulting stock cannot be negative or exceed 2,000,000,000.
- The balance update and immutable ledger insert occur in one serializable transaction.
- Exactly one of two same-version concurrent writes can succeed; the other receives a version conflict.

### `PATCH /inventory/:productId`

Access: `inventory:adjust` plus CSRF. Updates only the nonnegative whole-number threshold.

```json
{ "lowStockThreshold": 5, "version": 2 }
```

Repeating the current threshold is idempotent and does not increment the version.

## Important Phase 3 error codes

| HTTP | Code | Meaning |
|---:|---|---|
| 401 | `AUTHENTICATION_REQUIRED` | Protected route has no valid active session |
| 403 | `PERMISSION_DENIED` | Identity lacks the required Phase 3 permission |
| 403 | CSRF/origin error from Phase 2 | Unsafe request failed the browser-origin or token control |
| 404 | `PRODUCT_NOT_FOUND`, `CATEGORY_NOT_FOUND`, `INVENTORY_NOT_FOUND` | Requested visible resource does not exist |
| 409 | `PRODUCT_SKU_EXISTS` | Normalized SKU is already used |
| 409 | `CATEGORY_SLUG_EXISTS` | Normalized slug is already used |
| 409 | `RESOURCE_VERSION_CONFLICT` | Record changed since it was read |
| 409 | `PRODUCT_STATUS_TRANSITION_INVALID` | Requested product transition skips the lifecycle |
| 409 | `PRODUCT_NOT_READY` | Draft has no active category for activation |
| 409 | `ACTIVE_PRODUCT_CATEGORY_REQUIRED` | Edit would leave an active product without a category |
| 409 | `CATEGORY_IN_USE` | Active product prevents category deactivation |
| 409 | `INVENTORY_BELOW_ZERO` | Adjustment would make on-hand negative |
| 409 | `INVENTORY_LIMIT_EXCEEDED` | Adjustment exceeds the supported balance limit |
| 422 | `VALIDATION_ERROR` | Path, query, or body failed its strict schema |
| 422 | `CATEGORY_SELECTION_INVALID` | Selected category is missing or inactive |

## Why these choices were used

- **Why public catalog reads?** Browsing is the customer-entry workflow and does not require private identity data. The service still forces active-only visibility.
- **Why hide exact inventory?** A simple in-stock flag supports buying decisions without disclosing sensitive operational quantities.
- **Why `INR` and decimal strings?** A single configured currency avoids unsupported conversion rules; fixed decimal storage and strings avoid binary floating-point corruption in JSON clients.
- **Why normalize SKU and slug?** It prevents visually different duplicates such as `chair-1` and ` CHAIR-1 ` and gives deterministic lookups.
- **Why draft/active/archived instead of delete?** Catalog history and future order references need stable product identity. Archive is recoverable and avoids destructive data loss.
- **Why one balance plus a ledger?** The balance makes reads cheap while the immutable ledger explains every successful change. Both are updated atomically.
- **Why optimistic versions?** They prevent silent overwrites without holding a database lock while a person edits a browser form.
- **Why database checks as well as Zod?** HTTP validation improves errors; database constraints protect integrity from bugs and non-HTTP writes.
- **Why no variants, images, or warehouses yet?** Each introduces major schema, storage, security, or reservation decisions that are not needed for the approved baseline.
- **Why no new employee model?** Phase 2 already provides safe owner/admin/customer identity administration. Inventing HR or invitation semantics would exceed approved requirements.

## Phase 3 review questions and answers

### Is Phase 2 still intact?

Yes. Phase 3 reuses its session, CSRF, origin, user-status, and deny-by-default permission middleware. Phase 2 tests remain in the full test suite.

### Can a customer create or edit a product by calling the API directly?

No. The API independently requires `products:manage`; hiding a UI link is not relied on for security.

### Can an administrator see an archived product on the public route?

No. The default route remains public even for an authenticated administrator. The caller must request `view=management` and pass its permission check.

### Can stock become negative during concurrent requests?

No successful transaction can produce negative stock. Version checks, a serializable transaction, conditional update, and database constraints protect the balance; a losing concurrent request receives `409`.

### Can adjustment history be edited?

No update or delete API exists for adjustments. Each successful stock change writes one new ledger row with the actor and request correlation ID.

### Does product activation depend on inventory?

No. A product needs an active category but may be active and out of stock. Availability is a separate operational state.

### What happens when a stale form is submitted?

The API returns `RESOURCE_VERSION_CONFLICT`. The UI tells the operator to refresh, preserving the newer database value.

### Can the currency be changed per product?

No. The server supplies the validated single-business currency. Changing it after product data exists requires an explicit migration and business decision.

### Are taxes, discounts, cart, orders, and payments included?

No. They belong to Phase 4 and must not be inferred from the Phase 3 price field.

### Is Phase 3 complete?

Yes. The implementation and technical gates passed, the UI behavior was validated, and the user explicitly accepted Phase 3 on 2026-08-26. Phase 4 still requires a separate instruction and requirements review.

## Verification coverage

The automated suite covers public visibility, exact-stock privacy, permissions, CSRF, normalized uniqueness, active-category requirements, lifecycle transitions, stale versions, category-in-use protection, initial stock, adjustment history, nonnegative stock, threshold changes, concurrent same-version writes, frontend browsing, product detail, catalog maintenance, and inventory workflows. Run the repository quality commands documented in the root README to reproduce the gate.
