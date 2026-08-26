# Planned API Contract

## Status

This document records accepted Phase 1/2 HTTP behavior, the implemented Phase 3 contract, and plans for later public APIs. Every endpoint is prefixed with `/api/v1` unless explicitly documented as infrastructure-only.

## Contract conventions

- Use JSON for normal request and response bodies.
- Use nouns for resources and HTTP methods for actions where practical.
- Validate every untrusted path, query, header, and body value.
- Apply authentication and resource/action authorization server-side.
- Use consistent pagination, filtering, sorting, field naming, dates, money, and error conventions.
- Return `201` for created resources, `204` only when no body is intended, and suitable `400`, `401`, `403`, `404`, `409`, `422`, `429`, and `5xx` responses.
- Do not expose whether protected resources exist to unauthorized callers.
- Phase 1 finalized the `{ success, data, meta? }` and `{ success, error, requestId }` envelopes and the `X-Request-Id` correlation header. Resource-specific pagination/filtering decisions remain phase-owned.

Illustrative response shapes (not finalized):

```json
{ "success": true, "data": {}, "meta": {} }
```

```json
{
  "success": false,
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "Safe message",
    "details": []
  },
  "requestId": "optional-correlation-id"
}
```

## Phase 1 — Foundation

| Method | Path | Purpose | Access |
|---|---|---|---|
| GET | `/api/v1/health` | Confirm API process readiness/liveness at the agreed level | Public, minimal data |

The implemented endpoint is a database-dependent readiness check. Separate liveness/readiness endpoints may be added only when deployment topology requires them.

## Phase 2 — Authentication and RBAC (accepted)

Implemented endpoints:

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Public, trusted origin, rate-limited | Create an active customer and opaque session |
| POST | `/api/v1/auth/login` | Public, trusted origin, rate-limited | Authenticate and create an opaque session |
| GET | `/api/v1/auth/me` | Authenticated | Return current identity, roles, and permissions |
| POST | `/api/v1/auth/logout` | Authenticated, CSRF | Revoke current session and clear cookies |
| GET | `/api/v1/users` | `users:read` | Paginated safe identity summaries |
| GET | `/api/v1/users/:userId` | `users:read` | Retrieve a safe identity summary |
| PATCH | `/api/v1/users/:userId/status` | `users:status:manage`, CSRF | Enable or disable subject to owner rules |
| POST | `/api/v1/users/:userId/roles` | `users:roles:manage`, CSRF | Assign a system role subject to owner rules |
| DELETE | `/api/v1/users/:userId/roles/:roleCode` | `users:roles:manage`, CSRF | Remove a system role subject to owner rules |
| GET | `/api/v1/roles` | `roles:read` | List migration-controlled roles and mappings |
| GET | `/api/v1/permissions` | `permissions:read` | List stable Phase 2 permissions |

Detailed requests, responses, cookies, error codes, and rationale are in `docs/phase-2/PHASE-02-IMPLEMENTATION-GUIDE.md`. Email verification, password reset, MFA, custom roles, refresh-token routes, employee invitation, and account deletion are deferred.

## Phase 3 — Business Core

**Status:** Implemented and accepted on 2026-08-26. The business rules are recorded in ADR 0004.

Public reads expose only `ACTIVE` products/categories and boolean `availability.inStock`; they never expose exact stock:

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/v1/products` | Public | Active catalog list with bounded search/filter/sort/pagination |
| GET | `/api/v1/products/:productId` | Public | Active product detail and public availability |
| GET | `/api/v1/categories` | Public | Active category list with bounded search/pagination |

Management collection reads use `?view=management`, require the matching management permission, and include all lifecycle states. Unsafe methods also require the accepted Phase 2 session, trusted origin, and CSRF token.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/v1/products?view=management` | `products:manage` | List draft, active, and archived products with exact management metadata but not exact stock |
| POST | `/api/v1/products` | `products:manage`, CSRF | Create a draft product and initial inventory state |
| PATCH | `/api/v1/products/:productId` | `products:manage`, CSRF | Update product/category data using a version precondition |
| PATCH | `/api/v1/products/:productId/status` | `products:manage`, CSRF | Apply `DRAFT → ACTIVE → ARCHIVED → DRAFT`; activation requires an active category |
| GET | `/api/v1/categories?view=management` | `categories:manage` | List active and inactive categories with management metadata |
| POST | `/api/v1/categories` | `categories:manage`, CSRF | Create a category |
| PATCH | `/api/v1/categories/:categoryId` | `categories:manage`, CSRF | Update a category using a version precondition |
| PATCH | `/api/v1/categories/:categoryId/status` | `categories:manage`, CSRF | Activate/deactivate; an active product blocks category deactivation |
| GET | `/api/v1/inventory` | `inventory:read` | List exact stock and low-stock state |
| GET | `/api/v1/inventory/:productId` | `inventory:read` | Retrieve one exact inventory balance |
| POST | `/api/v1/inventory/:productId/adjustments` | `inventory:adjust`, CSRF | Apply one atomic stock adjustment |
| GET | `/api/v1/inventory/:productId/adjustments` | `inventory:read` | Retrieve bounded adjustment history |
| PATCH | `/api/v1/inventory/:productId` | `inventory:adjust`, CSRF | Update the low-stock threshold using a version precondition |

Collection pagination uses `page` (default `1`) and `limit` (default `20`, maximum `100`). Successful list responses include `meta: { page, limit, total, totalPages }`. Product lists accept `search`, normalized category `slug`, `availability=all|inStock|outOfStock`, `minPrice`, `maxPrice`, `sort=name|price|createdAt`, and `direction=asc|desc`; management view additionally accepts `status=ALL|DRAFT|ACTIVE|ARCHIVED`. Category lists accept `search`; management view additionally accepts `status=ALL|ACTIVE|INACTIVE`. Inventory lists accept `search`.

Money values are nonnegative decimal strings with at most two fractional digits and use the configured `INR` currency. Quantity and threshold values are whole numbers. Product/category/inventory writes include a nonnegative integer `version`; stale or concurrent writes return `409 RESOURCE_VERSION_CONFLICT`. Detailed request bodies, responses, errors, UI workflows, and examples are in `docs/phase-3/PHASE-03-IMPLEMENTATION-GUIDE.md`.

### `/api/v1/products`

The default view is public even for authenticated users. Draft/archived collection visibility requires the explicit permission-gated `view=management` query mode. Public product detail returns `404` for non-active products.

### `/api/v1/categories`

Flat many-to-many category assignment and inactive lifecycle behavior are implemented; hierarchy and hard deletion are deferred.

### `/api/v1/inventory`

One aggregate balance, immutable adjustment history, whole-number quantities, optimistic concurrency, and nonnegative stock are implemented. `RESTOCK` requires a positive delta, `DAMAGE` requires a negative delta, and `CORRECTION` accepts either sign; zero is invalid. Warehouses, variants, and reservations are deferred.

### `/api/v1/users`

Phase 2 customer/user administration remains unchanged. Employee profiles, invite/onboarding workflow, new roles, and self-service profile endpoints are deferred.

## Phase 4 — Orders and Payments

### `/api/v1/cart`

Planned operations: get current cart, add/update/remove item, and clear cart. Guest carts, merge behavior, price refresh, stock validation timing, and cart expiry are **Decision Required**.

### `/api/v1/orders`

Planned customer operations: place/list/retrieve own orders and track state. Planned administrative operations: list/retrieve authorized orders and make approved state transitions. Cancellation, returns, fulfillment, shipping integration, taxes, discounts, address handling, and order status machine are **Decision Required**.

### `/api/v1/payments`

Planned operations: initiate/prepare payment as the selected provider requires, retrieve safe payment state, and accept verified provider webhooks on a deliberately designed endpoint. Payment provider, webhook URL, idempotency keys, refunds, retries, reconciliation, and PCI scope are **Decision Required**.

## Phase 5 — Production Backend Features

### `/api/v1/support`

Planned customer operations: create/list/retrieve own tickets and participate in an approved conversation model. Planned staff operations: list, assign, update, and resolve tickets. Ticket comments, attachments, priority, escalation, SLA, visibility, and status model are **Decision Required**.

Reporting/dashboard endpoints and audit-log access may be added for authorized administrators. Exact metrics, aggregation boundaries, export behavior, retention, and permissions are **Decision Required**.

## Phase 6 — Real-time and Background Jobs

### `/api/v1/notifications`

Planned operations: list a user's notifications, retrieve unread state, and mark notifications read. WebSocket/Socket.IO handshake and rooms must derive identity server-side. Notification types, channels, preferences, retention, delivery receipts, and bulk-read behavior are **Decision Required**.

Background job management endpoints should not be public unless an explicit administrative need is approved.

## Phase 7 — AI Foundation

### `/api/v1/ai`

Planned authorized operations: create/list/retrieve permitted chat sessions and send a message to the appropriate customer or owner assistant. Streaming protocol, limits, retention, deletion, model provider, usage visibility, and owner/customer assistant separation are **Decision Required**.

The browser calls Node.js only. Node.js authorizes scope before making an authenticated internal request to the Python AI service.

## Phase 8 — RAG and Document Intelligence

Planned authorized document operations may use `/api/v1/documents` or an administrative subset of `/api/v1/ai`; the final resource boundary is a **Decision Required**. Operations may include upload, list, retrieve metadata, process/reprocess, replace/version, and remove under retention rules. AI answers can use only documents allowed for the requesting identity and business scope.

## Phase 9 — LangGraph Business AI and AI Support

Planned AI operations expand to permission-aware business analysis and support workflows. Each tool/action requires a contract with validated inputs, authorization, timeout, idempotency where relevant, audit behavior, and human confirmation for consequential actions. Exact workflows are a **Decision Required**.

## Query and collection standards

- Phase 3 uses bounded offset pagination with `page`, `limit`, and a maximum limit of 100. Later high-volume resources may choose cursors in their owning phase.
- Search/filter/sort values are resource-specific strict allowlists; user input never becomes an arbitrary database field or direction.
- Field names use camelCase and timestamps are serialized as ISO 8601 UTC strings.
- Phase 3 money uses decimal strings plus an uppercase three-letter currency code.
- Phase 3 mutable business resources use integer optimistic versions and stable `409` conflicts.
- Rate limits by endpoint/user/IP and safe `Retry-After` behavior.
- Deprecation and compatibility policy.

## Security-sensitive contract rules

- Authentication credentials are never passed in query strings.
- Authorization checks include action, role/permission, ownership, business scope, and object state where applicable.
- Payment webhooks verify provider authenticity against the raw payload requirements and deduplicate events.
- Upload endpoints restrict size/type and use protected storage and malware controls.
- AI endpoints apply rate/cost limits, content/prompt safeguards, retrieval access filtering, and tool allowlists.
- List endpoints must not leak records across users or businesses through filters, counts, errors, caches, or real-time channels.
