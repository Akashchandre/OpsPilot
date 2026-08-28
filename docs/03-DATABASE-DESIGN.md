# Database Design

## Status and design principles

This document records the accepted Phase 2 identity schema, implemented Phase 3 business-core
schema, implemented Phase 4 commerce schema, implemented Phase 5 support/report/audit persistence,
and conceptual planning for later phases. Later feature behavior, tenancy, deletion
rules, and production retention remain decisions for their owning phases.

- Use MySQL as the source of truth and Prisma for schema/migrations.
- Phase 2 uses generated UUID strings stored as `CHAR(36)`; later entities should review consistency before choosing another identifier form.
- Store timestamps in UTC.
- Store monetary values as fixed-precision decimals with an explicit currency code.
- Enforce foreign keys, uniqueness, and invariants in the database where possible.
- Add indexes from known access patterns and validate them using real query plans later.
- Do not store raw card data or provider secrets.
- Phase 2 is explicitly single-business. Multi-tenant expansion requires tenant ownership and compound constraints before any multi-business deployment.

## Implemented Phase 2 identity tables

| Table | Purpose | Important constraints |
|---|---|---|
| `users` | Login identity and account state | UUID primary key, normalized unique email, Argon2id hash, active/disabled status, failed-attempt and lock timestamps |
| `roles` | Migration-controlled system roles | Unique code; seeded `OWNER`, `ADMIN`, `CUSTOMER` |
| `permissions` | Stable operation permission definitions | Unique stable code; five Phase 2, four Phase 3, and five Phase 4 permissions |
| `user_roles` | User-role assignment and assigning actor | Composite primary key, foreign keys, deliberate actor `SET NULL` |
| `role_permissions` | System role-permission mapping | Composite primary key and constrained foreign keys |
| `auth_sessions` | Revocable opaque browser sessions | Unique token digest, CSRF digest, expiry/revocation, user-agent digest |
| `security_events` | Narrow Phase 2 authentication/authorization evidence | Event/outcome enums, optional actor/target/request ID, controlled JSON metadata |

The `20260825030732_phase_2_auth_rbac` migration creates these tables and seeds reviewed system authorization data. Phase 2 exposes no hard-delete endpoint.

Phase 2 and its two-migration development/test database state were accepted on 2026-08-25.

## Implemented Phase 3 business-core tables

Migration `20260825122320_phase_3_business_core` creates the following tables and seeds `products:manage`, `categories:manage`, `inventory:read`, and `inventory:adjust` for the `OWNER` and `ADMIN` roles:

| Table | Purpose | Important constraints |
|---|---|---|
| `categories` | Flat product classification | UUID primary key, unique normalized slug, `ACTIVE`/`INACTIVE` status, optimistic version |
| `products` | Single-SKU catalog item | UUID primary key, unique normalized SKU, `DECIMAL(12,2)` nonnegative price, three-letter currency, `DRAFT`/`ACTIVE`/`ARCHIVED` status, optimistic version |
| `product_categories` | Many-to-many product classification | Composite primary key and cascading foreign keys |
| `inventory_balances` | One aggregate stock balance per product | Product primary/foreign key, nonnegative whole-number on-hand and threshold values, optimistic version |
| `inventory_adjustments` | Immutable operational stock ledger | UUID primary key, product and actor foreign keys, nonzero delta, nonnegative before/after values, database-enforced balance arithmetic, reason, optional note/request ID |

Prices are represented as decimal strings plus `INR` in HTTP responses. Product/category edits and stock changes use version preconditions. The application exposes no hard-delete route. Product variants, images, hierarchy, warehouses, fractional quantities, tax, discounts, conversion, and new employee records remain outside this schema; Phase 4 adds the approved reservation model separately.

## Implemented Phase 4 commerce tables

Migration `20260826043501_phase_4_orders_payments` creates the commerce tables and seeds
`orders:read`, `orders:manage`, `payments:read`, `payments:refund`, and `payments:reconcile` for
`OWNER` and `ADMIN`:

| Table | Purpose | Important constraints |
|---|---|---|
| `carts` | One persistent current cart per authenticated user | UUID primary key, unique user, optimistic version, cascading user cleanup |
| `cart_items` | Desired product quantity and observed price | Composite cart/product key, quantity 1–99, fixed-precision observed price, restricted product deletion |
| `orders` | Immutable purchase/address/totals and lifecycle | Unique order number; user-scoped UUID idempotency key plus request digest; `INR` totals; 15-minute reservation expiry; optimistic version |
| `order_items` | Purchase-time product and price snapshots | Positive quantity, exact line arithmetic, restricted order/product deletion |
| `inventory_reservations` | One stock reservation per order line | Unique order item, `ACTIVE`/`CONSUMED`/`RELEASED`, expiry and transition timestamps, optimistic version |
| `order_status_events` | Append-oriented order transition evidence | Previous/next state, trusted source, stable reason, optional actor/request context |
| `payments` | Provider-neutral intent and Razorpay order mapping | One payment per order, unique provider order/receipt, exact amount/currency, monotonic status, optimistic version |
| `payment_attempts` | Razorpay payment observations | Unique provider payment ID, amount/currency, safe failure code, monotonic attempt status |
| `refunds` | Normal full-refund state | Payment-scoped UUID idempotency key plus request digest, unique provider refund ID, actor and safe failure evidence |
| `provider_webhook_events` | Webhook deduplication and minimal evidence | Unique provider/event ID, body digest, event type/outcome, optional payment link; no raw payload or signature |

Database checks enforce positive quantities, nonnegative totals, exact order and line arithmetic,
currency-code shape, valid reservation timestamps, and the expected provider receipt shape.
Orders, items, reservations, status events, payments, attempts, refunds, and webhook evidence have
no hard-delete API.

## Implemented Phase 5 persistence

Migration `20260827060000_phase_5_support_audit_foundation` creates the accepted support and audit
storage boundary and seeds `support:tickets:read`, `support:tickets:manage`, `reports:read`, and
`audit:read`. `OWNER` receives all four; `ADMIN` receives support read/manage and report read;
`CUSTOMER` receives none and will use ownership-scoped support APIs.

| Table | Purpose | Important constraints |
|---|---|---|
| `support_tickets` | Versioned customer support case | Unique ticket number; requester-scoped UUID idempotency; optional owned-order/assignee links; category/priority/status enums; valid status timestamps; no cascading history deletion |
| `support_ticket_messages` | Immutable public replies and internal notes | Ticket/author-scoped UUID idempotency; request digest; 1–4,000-character database bound; restricted ticket/author deletion |
| `support_ticket_events` | Append-only lifecycle, priority, and assignment evidence | Typed source/event/change snapshots; optional actor/request context; restricted ticket deletion |
| `audit_chain_heads` | Singleton serialized audit-chain head | Fixed row ID `1`; nonnegative sequence; 64-character lowercase hexadecimal head hash |
| `audit_events` | Integrity-protected general audit evidence | Unique positive sequence and event hash; previous hash/key ID; bounded action/target/request fields; optional actor with restricted deletion so hashed actor IDs cannot be rewritten; no mutation API planned |

The migration is deployed to development and test databases. Foundation integration tests verify
role mappings, the zeroed chain head, support persistence, and scoped message idempotency. The
support service now owns creation/reply/closure/management transactions, version checks, visibility,
state timestamps, assignment eligibility, and append-only events. The audit service serializes
appends with `SELECT ... FOR UPDATE`, creates the event and advances the head in one transaction,
and verifies sequence, previous-hash, HMAC, key-ID, and head continuity from a repeatable-read
snapshot.

Additive migration `20260828060000_phase_5_audit_actor_restrict` changes the audit actor foreign
key from `SET NULL` to `RESTRICT`. An actor ID is part of the HMAC payload, so deleting its user and
rewriting the column would intentionally invalidate the chain. Account deletion/anonymization
remains deferred until it can preserve or deliberately supersede historical audit evidence.

Migrations `20260828070000_phase_5_report_indexes` and
`20260828080000_phase_5_report_covering_indexes` add only measured overview access paths: user
creation time, payment-attempt status/time, refund status/update time, ticket creation/status/
priority, and covering INR amount aggregates. The fixed refund aggregate uses its covering index
explicitly because MySQL 8.4 otherwise selected a materially slower older created-time index on the
representative dataset.

## Expected entities

| Entity | Purpose | Key relationships | Planned phase |
|---|---|---|---:|
| `users` | Customer, owner, admin, and future employee identities | Roles, orders, tickets, chats, audit events | 2 |
| `roles` | Named authorization roles | Many permissions and users | 2 |
| `permissions` | Granular allowed operations | Many roles | 2 |
| `user_roles` | User-to-role assignment | User + role | 2 |
| `role_permissions` | Role-to-permission assignment | Role + permission | 2 |
| `auth_sessions` | Revocable opaque browser session state | User; token/CSRF digests | 2 |
| `security_events` | Narrow authentication/authorization evidence | Optional actor and target user | 2 |
| `categories` | Flat product classification | Products through `product_categories` | 3 |
| `products` | Single-SKU catalog items | Categories, one balance, adjustments; future order/cart items | 3 |
| `inventory_balances` | Aggregate whole-number stock state | One-to-one with product | 3 |
| `inventory_adjustments` | Immutable stock-change evidence | Product and actor | 3 |
| `carts` | Active/saved customer cart | User; cart items | 4 |
| `cart_items` | Product, quantity, and display context in a cart | Cart + product | 4 |
| `orders` | Customer purchase lifecycle | User, items, payments | 4 |
| `order_items` | Immutable purchase snapshot lines | Order; optional reference to product | 4 |
| `inventory_reservations` | Per-line reservation lifecycle | Order + order item + product | 4 |
| `order_status_events` | Immutable order transition evidence | Order; optional actor | 4 |
| `payments` | Provider-neutral payment attempts/state | Order | 4 |
| `payment_attempts` | Provider payment observations | Payment | 4 |
| `refunds` | Full-refund request and provider state | Payment + captured attempt | 4 |
| `provider_webhook_events` | Provider event deduplication/evidence | Optional payment | 4 |
| `support_tickets` | Customer support case | Requester, assignee, order if relevant | 5 |
| `support_ticket_messages` | Immutable public/internal support conversation | Ticket + author | 5 |
| `support_ticket_events` | Append-only support state evidence | Ticket + optional actor | 5 |
| `audit_chain_heads` | Serialized integrity-chain state | One application audit stream | 5 |
| `audit_events` | Integrity-protected security/business action evidence | Optional actor; generic bounded target | 5 |
| `notifications` | In-app/delivery notification state | Recipient; related resource | 6 |
| `documents` | Company document metadata and processing state | Uploader; chunks/index records later | 8 |
| `chat_sessions` | Customer/owner AI conversation scope | User; messages | 7 |
| `chat_messages` | Individual conversation messages | Session | 7 |

Employee records, reusable addresses, product images/variants, ticket comments, document chunks,
password reset/verification tokens, notification deliveries, and AI tool executions may need
separate entities. Their need and shape are a **Decision Required** in their owning phases.

## Conceptual relationships

- A user may have many roles through `user_roles`; a role may have many permissions through `role_permissions`.
- A category has many products and a product may have many flat categories through `product_categories`; category hierarchy is deferred.
- A product has one aggregate inventory balance and many immutable adjustments. Multiple warehouses
  and variants/SKUs are deferred; Phase 4 reservations reference that aggregate product balance.
- A user has at most one persistent current cart; a cart contains unique product lines.
- A user has many orders; an order contains one or more immutable items, one payment intent, and
  one reservation per order line.
- An order item stores immutable product name/SKU/price/tax/discount context required to preserve order history even if the product changes.
- A payment has many provider attempts and refunds. Provider identifiers and idempotency keys
  prevent duplicate financial effects, while webhook events store only normalized evidence.
- A support ticket belongs to a requester, may reference one order and one assignee, has immutable
  public/internal messages, and records typed append-only state/priority/assignment events. SLA and
  escalation automation are deferred.
- A notification belongs to a recipient and may reference a domain resource without unsafe polymorphic integrity.
- A document belongs to the relevant business scope and tracks upload/processing lifecycle; chunks and vector records must preserve document/version/access metadata.
- A chat session belongs to a user and assistant context; messages belong to the session. Data retention and provider transmission require policy.
- Audit events form one globally sequenced previous-hash chain rooted in the singleton chain head;
  each event records actor kind, action, outcome, target, request context, safe metadata, key ID,
  and HMAC hash. Registered sensitive mutations append inside their local transaction.

## Candidate columns and constraints

Implemented Phase 2–4 rows are recorded alongside planning hints for future entities.

| Entity | Candidate constraints and important data |
|---|---|
| `users` | Unique normalized email within applicable scope; password hash; status; timestamps; no plaintext password |
| `roles` | Unique role name/code within applicable scope; system/custom marker |
| `permissions` | Unique stable permission code |
| Join tables | Composite unique keys preventing duplicate assignments; foreign keys with deliberate delete behavior |
| `products` | Stable normalized unique SKU; name; plain-text description; fixed-precision nonnegative price; `INR`; lifecycle status; optimistic version |
| `inventory_balances` | One row per product; nonnegative whole-number on-hand and threshold; optimistic version |
| `inventory_adjustments` | Nonzero bounded delta; before/after arithmetic; reason, note, actor, request ID, and timestamp; no update/delete API |
| `carts` / `cart_items` | One versioned cart per user; unique product per cart; quantity 1–99; observed price/currency |
| `orders` | Unique human-facing number; user-scoped idempotency; status/version; `INR` immutable totals and India address snapshot |
| `order_items` | Positive quantity; immutable SKU/name/unit-price/line-total/currency snapshot; restricted product reference |
| `inventory_reservations` | Unique order item; positive quantity; active/consumed/released state; expiry and transition timestamps |
| `order_status_events` | Append-oriented from/to/source/reason plus optional actor/request evidence |
| `payments` | One per order; unique provider order/receipt; exact amount/currency; provider-neutral monotonic state |
| `payment_attempts` | Unique provider payment ID; exact relationship/amount/currency; safe status/failure evidence |
| `refunds` | Full amount; payment-scoped idempotency; unique provider refund ID; pending/processed/failed state |
| `provider_webhook_events` | Unique provider event ID and body digest; allowlisted type/outcome; no raw webhook body |
| `support_tickets` | Unique ticket number; requester-scoped idempotency/digest; optional order/assignee; category; subject; priority/status timestamps; optimistic version |
| `support_ticket_messages` | Immutable bounded plain text; customer-visible/internal visibility; ticket/author-scoped idempotency/digest |
| `support_ticket_events` | Append-only typed source/change snapshots plus optional actor/request evidence |
| `notifications` | Recipient; type; safe payload/reference; read/delivery timestamps; deduplication key if needed |
| `documents` | Owner/uploader; storage key, display name, MIME/size, checksum/version, processing status; never public raw storage path |
| `chat_messages` | Session; role; safe content/reference; ordering/timestamp; model metadata only if policy permits |
| `audit_chain_heads` / `audit_events` | Singleton sequence/hash head; unique positive event sequence/hash; actor/action/outcome/target/request; previous hash; key ID; redacted metadata |

## Important indexes

Indexes must align with chosen tenancy and query patterns. Implemented and future paths include:

- User normalized email and status.
- Role and permission stable codes; both directions of assignment join tables.
- Product SKU, status, category relationship, name/search strategy, and price when filters justify it.
- Inventory product/SKU and location keys.
- Cart user/status and cart-item cart key.
- Order user plus creation time, order number, and status plus creation time.
- Payment order, provider transaction/event ID, and state.
- Ticket requester/updated time, status/priority/updated time, assignee/status/updated time, and
  report creation/status/priority.
- Notification recipient/read state/creation time.
- Document business scope/status/creation time/checksum.
- Chat session user/updated time and message session/sequence.
- Audit unique sequence/hash, target/time, actor/time, action/time, and correlation ID.
- Report covering indexes over captured attempt status/currency/creation/amount and processed refund
  status/currency/update/amount.

Do not add broad indexes blindly: write amplification, cardinality, prefix limits, sort order, and data volume must be reviewed.

## Transaction-sensitive operations

- Assigning/removing roles and permissions when policy requires related audit records.
- Creating/updating catalog and inventory together where the workflow demands atomicity.
- Reserving, decrementing, releasing, or restoring stock without overselling.
- Converting a cart into an order and snapshotting prices/totals.
- Applying coupons, tax, shipping, and totals once those policies exist.
- Creating payment attempts and processing idempotent provider webhooks/state transitions.
- Cancelling/refunding orders and restoring inventory under defined rules.
- Creating/replying/closing/managing support tickets plus their event and general-audit evidence.
- Recording registered identity, catalog, inventory, commerce, payment, refund, reconciliation, and
  provider-state mutations with the local change in one transaction.
- Claiming jobs and recording delivery/notification outcomes.
- Publishing a new document version and replacing its searchable index safely.

Payment providers and external queues cannot join database transactions. Phase 4 therefore commits
local checkout state first, calls Razorpay through an adapter, recovers ambiguous order creation by
the unique receipt, and applies verified results in later idempotent transactions. Signed webhooks
and an authorized per-payment reconciliation action recover lost or delayed effects. A durable
outbox/worker and bulk scheduling remain decisions for Phase 6.

## Retention and deletion

Phases 4–5 expose no deletion for orders, financial evidence, support history, or audit evidence and
use restrictive foreign keys for historical integrity. No automatic purge is implemented.
Indefinite development/test retention is temporary behavior, not an approved production policy.
The final duration remains unresolved: orders, payments, audit events, documents, tickets, chats,
personal information, and AI traces may have different legal and operational requirements.
**Decision Required:** jurisdiction, privacy obligations, account deletion/anonymization, backup
propagation, soft deletion, legal holds, and retention schedules.
