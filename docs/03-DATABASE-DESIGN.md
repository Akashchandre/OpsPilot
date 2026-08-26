# Database Design

## Status and design principles

This document records the accepted Phase 2 identity schema, implemented Phase 3 business-core schema, and conceptual planning for later phases. Later entity fields, enums, nullability, tenancy, deletion rules, and retention remain decisions for their owning phases.

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
| `permissions` | Stable operation permission definitions | Unique stable code; five Phase 2 and four Phase 3 permissions |
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

Prices are represented as decimal strings plus `INR` in HTTP responses. Product/category edits and stock changes use version preconditions. The application exposes no hard-delete route. Product variants, images, hierarchy, warehouses, reservations, fractional quantities, tax, discounts, conversion, and new employee records are not part of this schema.

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
| `payments` | Provider-neutral payment attempts/state | Order | 4 |
| `support_tickets` | Customer support case | Requester, assignee, order if relevant | 5 |
| `notifications` | In-app/delivery notification state | Recipient; related resource | 6 |
| `documents` | Company document metadata and processing state | Uploader; chunks/index records later | 8 |
| `chat_sessions` | Customer/owner AI conversation scope | User; messages | 7 |
| `chat_messages` | Individual conversation messages | Session | 7 |
| `audit_logs` | Security/business action evidence | Actor, action, target, correlation context | 5 |

Employee records, addresses, product images/variants, ticket comments, document chunks, inventory reservations/movements, password reset/verification tokens, notification deliveries, and AI tool executions may need separate entities. Their need and shape are a **Decision Required** in their owning phases.

## Conceptual relationships

- A user may have many roles through `user_roles`; a role may have many permissions through `role_permissions`.
- A category has many products and a product may have many flat categories through `product_categories`; category hierarchy is deferred.
- A product has one aggregate inventory balance and many immutable adjustments. Multiple warehouses, variants/SKUs, and reservations are deferred.
- A user may have one or more carts; a cart contains many cart items. Active-cart uniqueness is a **Decision Required**.
- A user has many orders; an order contains one or more order items and may have multiple payment attempts.
- An order item stores immutable product name/SKU/price/tax/discount context required to preserve order history even if the product changes.
- A support ticket belongs to a requester and may reference an order; assignment, conversation/comments, status history, and SLA data require decisions.
- A notification belongs to a recipient and may reference a domain resource without unsafe polymorphic integrity.
- A document belongs to the relevant business scope and tracks upload/processing lifecycle; chunks and vector records must preserve document/version/access metadata.
- A chat session belongs to a user and assistant context; messages belong to the session. Data retention and provider transmission require policy.
- An audit log records actor, action, target, time, outcome, and safe metadata. Audit records should be append-oriented and access restricted.

## Candidate columns and constraints

Implemented Phase 2/3 rows are recorded alongside planning hints for future entities.

| Entity | Candidate constraints and important data |
|---|---|
| `users` | Unique normalized email within applicable scope; password hash; status; timestamps; no plaintext password |
| `roles` | Unique role name/code within applicable scope; system/custom marker |
| `permissions` | Unique stable permission code |
| Join tables | Composite unique keys preventing duplicate assignments; foreign keys with deliberate delete behavior |
| `products` | Stable normalized unique SKU; name; plain-text description; fixed-precision nonnegative price; `INR`; lifecycle status; optimistic version |
| `inventory_balances` | One row per product; nonnegative whole-number on-hand and threshold; optimistic version |
| `inventory_adjustments` | Nonzero bounded delta; before/after arithmetic; reason, note, actor, request ID, and timestamp; no update/delete API |
| `cart_items` | Positive quantity; uniqueness strategy for product/variant per cart |
| `orders` | Unique human-facing order number; user; status; currency; immutable totals; addresses/snapshots as required |
| `order_items` | Positive quantity; unit price and calculated line snapshot; optional product reference preserving historical rows |
| `payments` | Unique provider event/transaction identifiers; order; amount/currency; state; safe provider metadata only |
| `support_tickets` | Unique ticket number; requester; status; priority if selected; subject; timestamps |
| `notifications` | Recipient; type; safe payload/reference; read/delivery timestamps; deduplication key if needed |
| `documents` | Owner/uploader; storage key, display name, MIME/size, checksum/version, processing status; never public raw storage path |
| `chat_messages` | Session; role; safe content/reference; ordering/timestamp; model metadata only if policy permits |
| `audit_logs` | Actor or system identity; stable action; target type/id; outcome; timestamp; correlation identifier; redacted metadata |

## Important indexes

Indexes must align with chosen tenancy and query patterns. Candidates include:

- User normalized email and status.
- Role and permission stable codes; both directions of assignment join tables.
- Product SKU, status, category relationship, name/search strategy, and price when filters justify it.
- Inventory product/SKU and location keys.
- Cart user/status and cart-item cart key.
- Order user plus creation time, order number, and status plus creation time.
- Payment order, provider transaction/event ID, and state.
- Ticket requester/status, assignee/status, and updated time.
- Notification recipient/read state/creation time.
- Document business scope/status/creation time/checksum.
- Chat session user/updated time and message session/sequence.
- Audit target/time, actor/time, action/time, and correlation ID.

Do not add broad indexes blindly: write amplification, cardinality, prefix limits, sort order, and data volume must be reviewed.

## Transaction-sensitive operations

- Assigning/removing roles and permissions when policy requires related audit records.
- Creating/updating catalog and inventory together where the workflow demands atomicity.
- Reserving, decrementing, releasing, or restoring stock without overselling.
- Converting a cart into an order and snapshotting prices/totals.
- Applying coupons, tax, shipping, and totals once those policies exist.
- Creating payment attempts and processing idempotent provider webhooks/state transitions.
- Cancelling/refunding orders and restoring inventory under defined rules.
- Recording ticket assignment/status transitions plus audit/history.
- Claiming jobs and recording delivery/notification outcomes.
- Publishing a new document version and replacing its searchable index safely.

Payment providers and external queues cannot join database transactions. Those workflows require idempotency, an outbox or equivalent consistency pattern, and reconciliation. The exact pattern is a **Decision Required** in Phases 4 and 6.

## Retention and deletion

Deletion behavior is deliberately unresolved. Orders, payments, audit events, documents, tickets, chats, personal information, and AI traces may have different legal and operational retention requirements. **Decision Required:** jurisdiction, privacy obligations, account deletion/anonymization, backups, soft deletion, legal holds, and retention schedules.
