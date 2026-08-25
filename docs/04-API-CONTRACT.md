# Planned API Contract

## Status

This document plans the public HTTP API. It does not implement endpoints or freeze unspecified request/response fields. Every endpoint is prefixed with `/api/v1` unless explicitly documented as infrastructure-only.

## Contract conventions

- Use JSON for normal request and response bodies.
- Use nouns for resources and HTTP methods for actions where practical.
- Validate every untrusted path, query, header, and body value.
- Apply authentication and resource/action authorization server-side.
- Use consistent pagination, filtering, sorting, field naming, dates, money, and error conventions.
- Return `201` for created resources, `204` only when no body is intended, and suitable `400`, `401`, `403`, `404`, `409`, `422`, `429`, and `5xx` responses.
- Do not expose whether protected resources exist to unauthorized callers.
- Exact envelope, pagination style, field casing, validation error format, and correlation header are a **Decision Required** before Phase 1 implementation.

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

Whether to expose separate `/live` and `/ready` endpoints and whether readiness checks MySQL are **Decision Required**.

## Phase 2 — Authentication and RBAC

Planned group: `/api/v1/auth`, `/api/v1/users`, and authorization administration endpoints.

Candidate operations include registration, login, logout, current-user retrieval, session/token renewal where chosen, and authorized management of users, roles, and permissions. Email verification, password reset, MFA, refresh-token routes, role assignment, owner bootstrap, and public registration policy are **Decision Required**.

## Phase 3 — Business Core

### `/api/v1/products`

Planned customer read endpoints: list with search/filter/sort/pagination and retrieve details. Planned administrative endpoints: create, update, activate/archive, and manage product data.

### `/api/v1/categories`

Planned customer read endpoints: list/retrieve. Planned administrative endpoints: create, update, organize, and deactivate/delete according to an agreed policy.

### `/api/v1/inventory`

Planned authorized endpoints: view stock and adjust inventory under explicit business rules. Warehouses, variants, reservations, adjustment reasons, and ledger history are **Decision Required**.

### `/api/v1/users`

Planned authorized owner/admin operations for customers and employees. Employee profile shape, invite/onboarding workflow, role limits, and self-service profile endpoints are **Decision Required**.

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

## Query and collection standards requiring decisions

- Cursor versus offset pagination, page size, and maximum limits.
- Search semantics and supported filter/sort allowlists per resource.
- Field casing and timestamp representation (ISO 8601 UTC is expected).
- Money representation in JSON; string decimals plus currency are preferred pending decision.
- Optimistic concurrency/conditional update strategy.
- Rate limits by endpoint/user/IP and safe `Retry-After` behavior.
- Deprecation and compatibility policy.

## Security-sensitive contract rules

- Authentication credentials are never passed in query strings.
- Authorization checks include action, role/permission, ownership, business scope, and object state where applicable.
- Payment webhooks verify provider authenticity against the raw payload requirements and deduplicate events.
- Upload endpoints restrict size/type and use protected storage and malware controls.
- AI endpoints apply rate/cost limits, content/prompt safeguards, retrieval access filtering, and tool allowlists.
- List endpoints must not leak records across users or businesses through filters, counts, errors, caches, or real-time channels.

