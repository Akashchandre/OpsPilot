# API Contract

## Status

This document records accepted Phase 1/2 behavior, implemented Phase 3/4 contracts, and plans for
later public APIs. Every endpoint is prefixed with `/api/v1` unless explicitly documented as
infrastructure-only.

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

One aggregate balance, immutable adjustment history, whole-number quantities, optimistic concurrency, and nonnegative stock are implemented. `RESTOCK` requires a positive delta, `DAMAGE` requires a negative delta, and `CORRECTION` accepts either sign; zero is invalid. Warehouses and variants are deferred. Phase 4 now owns order reservations against this aggregate balance.

### `/api/v1/users`

Phase 2 customer/user administration remains unchanged. Employee profiles, invite/onboarding workflow, new roles, and self-service profile endpoints are deferred.

## Phase 4 — Orders and Payments

**Status:** Implemented on 2026-08-26 under ADR 0005; real Razorpay Test Mode delivery smoke and
explicit phase acceptance remain pending.

All customer commerce endpoints require an active authenticated session. Browser writes require
the accepted trusted-origin and CSRF controls. Ownership failures use not-found behavior so they do
not disclose another customer's records.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/v1/cart` | Authenticated owner | Read or lazily create the current cart and refresh price/availability review state |
| PUT | `/api/v1/cart/items/:productId` | Authenticated owner, CSRF | Set desired quantity `1`–`99` using the current cart version |
| DELETE | `/api/v1/cart/items/:productId` | Authenticated owner, CSRF | Remove one line using the current cart version |
| DELETE | `/api/v1/cart/items` | Authenticated owner, CSRF | Clear the cart using the current cart version |
| POST | `/api/v1/orders` | Authenticated owner, CSRF, `Idempotency-Key` | Convert the current cart into a reserved order and prepare safe hosted Checkout options |
| GET | `/api/v1/orders` | Authenticated owner; `orders:read` for `view=management` | List owned or authorized management orders |
| GET | `/api/v1/orders/:orderId` | Authenticated owner; `orders:read` for `view=management` | Read owned or authorized management order details/history |
| POST | `/api/v1/orders/:orderId/payment-session` | Authenticated owner, CSRF | Resume the same payable provider order while its reservation is active |
| POST | `/api/v1/orders/:orderId/cancellation` | Authenticated owner, CSRF | Cancel an owned unpaid pending order using its version |
| PATCH | `/api/v1/orders/:orderId/status` | `orders:manage`, CSRF | Apply an allowed versioned cancellation or fulfillment transition |
| POST | `/api/v1/payments/confirm` | Authenticated owner, CSRF | Verify the Checkout HMAC, fetch provider state, and apply only an exact capture |
| GET | `/api/v1/payments/:paymentId` | Owner or `payments:read` | Read safe local payment, attempt, and refund state |
| POST | `/api/v1/payments/:paymentId/refunds` | `payments:refund`, CSRF, `Idempotency-Key` | Request the server-derived normal full refund |
| POST | `/api/v1/payments/:paymentId/reconcile` | `payments:reconcile`, CSRF | Fetch provider order/payment/refund state and apply allowed monotonic transitions |
| POST | `/api/v1/payments/webhooks/razorpay` | Razorpay signature + event ID | Verify the exact raw body, deduplicate, and apply an allowlisted provider event |

Cart mutations set an exact quantity and require `{ version }`; stale writes return
`409 RESOURCE_VERSION_CONFLICT`. Cart reads expose observed/current prices and a review flag.
Checkout requires a UUID `Idempotency-Key` and body
`{ cartVersion, shippingAddress }`, where the bounded address is an India snapshot. The server
revalidates active products, exact current price, currency, and stock; computes all totals; reserves
stock for 15 minutes; clears the cart; and derives the provider amount in paise. A changed price or
stock state returns a stable conflict without silently substituting client-visible values.

Order lists accept `page`, `limit`, `view=self|management`, `status`, and `direction=asc|desc`.
Local order states are `PENDING_PAYMENT`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`,
`CANCELLED`, `EXPIRED`, and `PAYMENT_REVIEW`. Shipping requires bounded `carrierName` and
`trackingNumber`; partial fulfillment, returns, and post-shipment cancellation are not exposed.

The client never supplies payment or refund amounts. Checkout confirmation accepts only local
order ID plus provider order/payment IDs and a bounded hexadecimal signature; a valid callback
signature alone does not confirm an order. Provider fetch failure returns a safe pending result,
while exact captured evidence confirms idempotently. The raw webhook route is deliberately outside
browser origin/CSRF parsing and accepts only the documented payment/order/refund event allowlist.
Duplicate and out-of-order events return success after safe idempotent processing.

Detailed bodies, responses, state machines, safe errors, and recovery behavior are in
`docs/phase-4/PHASE-04-IMPLEMENTATION-GUIDE.md` and
`docs/phase-4/PHASE-04-OPERATIONS-RUNBOOK.md`.

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

- Phases 3 and 4 use bounded offset pagination with `page`, `limit`, and a maximum limit of 100. Later high-volume resources may choose cursors in their owning phase.
- Search/filter/sort values are resource-specific strict allowlists; user input never becomes an arbitrary database field or direction.
- Field names use camelCase and timestamps are serialized as ISO 8601 UTC strings.
- Phase 3/4 money uses decimal strings plus an uppercase three-letter currency code; Phase 4 is `INR` only.
- Phase 3/4 mutable business resources use integer optimistic versions and stable `409` conflicts.
- Phase 4 checkout/refund idempotency keys are UUIDs in `Idempotency-Key`; reuse with different normalized input returns `409 IDEMPOTENCY_KEY_REUSED`.
- Rate limits by endpoint/user/IP and safe `Retry-After` behavior.
- Deprecation and compatibility policy.

## Security-sensitive contract rules

- Authentication credentials are never passed in query strings.
- Authorization checks include action, role/permission, ownership, business scope, and object state where applicable.
- Payment webhooks verify provider authenticity against the raw payload requirements and deduplicate events.
- Upload endpoints restrict size/type and use protected storage and malware controls.
- AI endpoints apply rate/cost limits, content/prompt safeguards, retrieval access filtering, and tool allowlists.
- List endpoints must not leak records across users or businesses through filters, counts, errors, caches, or real-time channels.
