# Architecture

## Architectural goals

OpsPilot uses a phased modular architecture so that business correctness and security precede distributed infrastructure and AI. The initial system should be simple to run and reason about while maintaining boundaries that permit later services without premature deployment complexity.

## Phase 1 architecture

Phase 1 contains only the web application foundation, the Node.js API foundation, and the MySQL/Prisma data foundation.

```text
Browser
  |
  v
React application (JavaScript)
  |
  | HTTP /api/v1
  v
Node.js + Express (JavaScript)
  |-- configuration and middleware
  |-- routes -> controllers -> services
  |-- centralized error handling
  |
  v
Prisma
  |
  v
MySQL
```

Phase 1 implements only a health-check path and enough client-to-server communication to prove the foundation. Business modules, authentication, payments, messaging, queues, Redis, object storage, and AI are outside Phase 1.

The Phase 1 topology, npm workspaces, ports, Vite, Node.js 24.19.x, package manager, plain-CSS foundation, test tooling, and database-dependent readiness semantics are accepted in ADR 0001 and the Phase 1 specification. The eventual product UI system remains unresolved.

## Phase 2 identity architecture

Phase 2 adds a single-business identity boundary without changing the public service topology:

```text
React Router + AuthProvider
  |  credentials: include; CSRF header for unsafe authenticated actions
  v
Express /api/v1
  |-- exact-origin, cookie parsing, validation, rate limiting
  |-- authentication: opaque token digest -> auth_sessions
  |-- authorization: user status -> roles -> permissions
  |-- service rules: owner/admin boundaries and last-owner protection
  v
Prisma transactions
  |
  v
MySQL users / RBAC / sessions / security events
```

The raw session token exists only in an `HttpOnly` browser cookie; MySQL stores its SHA-256 digest. A second session-bound token is exposed as a readable SameSite cookie and must match `X-CSRF-Token`. Permissions and account status are read from MySQL for each protected request, giving immediate revocation and authorization changes. See ADR 0003 and the Phase 2 threat model.

Phase 2 was accepted on 2026-08-25 and remains the authorization boundary for all later business modules.

## Phase 3 business-core architecture

Phase 3 is implemented within the existing topology and layering:

```text
Public catalog / protected management pages
  |
  v
Express /api/v1
  |-- public active-catalog and boolean availability reads
  |-- Phase 2 authentication + permission + CSRF controls for management
  v
Catalog and inventory controllers -> services -> Prisma
  |-- lifecycle and money rules
  |-- optimistic version checks
  |-- atomic inventory balance + adjustment ledger
  v
MySQL catalog and inventory tables
```

The catalog module owns strict validation, public/management projections, product/category lifecycle, normalized uniqueness, and the configured `INR` money boundary. The inventory module owns exact-balance reads, low-stock thresholds, and atomic balance-plus-ledger transactions. Optimistic integer versions prevent silent lost updates. Prisma migration `20260825122320_phase_3_business_core` adds the tables, constraints, permissions, and default role mappings. Phase 3 introduces no new service, package, or infrastructure component.

## Phase 4 commerce architecture

Phase 4 keeps commerce inside the existing JavaScript API and MySQL topology while adding Razorpay
as a narrow external Test Mode boundary:

```text
React cart / checkout / order / operator pages
  |-- authenticated JSON + CSRF for browser writes
  |-- Razorpay-hosted Standard Checkout (provider credential fields only)
  v
Express /api/v1
  |-- cart -> order -> payment controllers and services
  |-- dedicated raw-body Razorpay webhook route
  |-- provider adapter using Node.js fetch + crypto
  v                                      |
Prisma serializable transactions         +--> Razorpay Test Mode HTTPS API
  |
  v
MySQL carts / orders / reservations / payment evidence
```

Checkout commits all local effects in one serializable transaction: it validates the versioned
cart, snapshots products/address/totals, decrements inventory, records immutable reservation
adjustments, creates active 15-minute reservations and local payment state, and clears the cart.
The Razorpay network call occurs only after that transaction. A unique stored receipt permits
recovery after an ambiguous create-order response without duplicating the local order or provider
order. Provider results re-enter through explicit, idempotent state-application transactions.

The browser receives only safe Checkout configuration and never sends an amount or financial
status decision. A Checkout signature is necessary but not sufficient for confirmation: the API
also fetches and matches captured provider state, or applies an exact captured state from a
verified webhook. Webhooks are authenticated over the exact raw body with a separate secret,
deduplicated by provider event ID, reduced to safe normalized evidence, and applied monotonically.
Request-driven expiry and an operator reconciliation action provide Phase 4 recovery without a
queue or worker. ADR 0005 and the Phase 4 implementation/operations guides define the state
machines and recovery boundary.

## Phase 5 production-backend foundation

ADR 0007 keeps Phase 5 inside the existing React/Express/Prisma/MySQL topology and adds no package,
external account, cache, queue, or hosted observability service:

```text
Browser support/report UI
  |
  v
Request UUID + proxy/rate/body/origin/session/permission boundaries
  |
  +--> Support service --> tickets + immutable messages/events --+
  |                                                            |
  +--> Report service --> bounded live aggregate queries        |
  |                                                            v
  +--> Existing sensitive mutation services --> transaction-bound audit append
                                                               |
                                                               v
                                        MySQL audit chain head/events
```

Support writes enforce requester ownership, strict state transitions, scoped idempotency,
assignee eligibility, immutable message visibility, and optimistic versions in their service
transactions. Customer projections filter internal notes. The overview report executes the exact
half-open UTC/INR aggregates directly against authoritative MySQL data; measured covering indexes
keep its target-sized path bounded without a cache or summary table.

The audit service locks a singleton head, inserts a canonical HMAC-SHA256 event, and advances the
head in one transaction. Sensitive local identity, catalog, inventory, order, payment, refund,
reconciliation, webhook-state, and support mutations append registered evidence inside their
owning transaction. Provider effects retain their Phase 4 external boundary, while returned,
webhook, or reconciled local state and audit evidence commit together. Authentication outcomes
remain in `security_events`. Owner-only reads append one post-query access event and cannot recurse.

Before routing, the API creates a server UUID, rejects URL-encoded bodies, applies exact proxy trust,
resolves a valid session for user-plus-source rate keys, and enforces isolated general/support/
report/webhook limits. Completion logging emits one allowlisted JSON record with no header, cookie,
query, body, PII, payment, ticket, or audit content. This remains a single-process boundary until a
later phase approves shared rate/observability infrastructure. Attachments, realtime, workers,
Redis, exports, and AI do not enter this topology.

## Main application layering

### React web client

- Routes organize customer and administrative experiences as features are introduced.
- Pages coordinate feature-level presentation.
- Reusable components provide consistent accessible UI.
- A centralized API client handles base URL, serialization, safe credentials, and normalized errors.
- Local component state is preferred; Redux Toolkit is used only where shared state or workflows justify it.
- Client route protection supports user experience but is never the security boundary.

### Node.js/Express API

- **Routes** define versioned endpoints and attach middleware.
- **Middleware** handles request context, validation, authentication, authorization, and cross-cutting controls as applicable.
- **Controllers** translate HTTP input/output and delegate decisions.
- **Services** own business rules, workflow coordination, and transaction boundaries.
- **Repositories/data access** encapsulate complex persistence where it adds clarity; Prisma must not spread uncontrolled persistence logic through controllers.
- **Errors** are classified centrally and converted to safe, consistent responses.
- **Configuration** validates environment variables at startup.

### MySQL and Prisma

- MySQL is the system of record for application entities.
- Prisma supplies schema, migrations, and safe data access.
- Database constraints enforce invariants in addition to application validation.
- Services use transactions and concurrency controls for workflows such as inventory and checkout.

## Eventual architecture

```text
Customers / Owners / Admins / Future Employees
                      |
                      v
             React web application
                      |
                      v
          Node.js + Express public API
             |        |         |
             |        |         +--> Object storage (documents/files)
             |        +------------> Redis / queues / workers
             |                       and Socket.IO notifications
             v
        Business services
             |
             +---------------------> MySQL via Prisma
             |
             v
       Python FastAPI AI service
             |
             v
        LangChain / LangGraph
          |        |        |
          v        v        v
         RAG   business   support
               data tools  tools
          |
          v
    Vector database + approved model provider
```

This is a target direction, not an instruction to deploy every component. Each supporting component is added only when its owning phase demonstrates the need.

## Future supporting infrastructure

| Component | Intended responsibility | Earliest planned phase | Unresolved choice |
|---|---|---:|---|
| Redis | Cache, coordination, rate-limit or job support if justified | 6 | Use cases and topology |
| Queue and workers | Durable asynchronous/background work | 6 | Queue technology, delivery semantics, retry/dead-letter policy |
| Socket.IO/WebSockets | Authorized real-time notifications | 6 | Protocol, scale-out adapter, fallback behavior |
| Object storage | Durable private document/file storage | 8 unless earlier justified | Provider, access model, scanning, retention |
| Python/FastAPI | Isolated AI orchestration boundary | 7 | Service authentication and deployment topology |
| Vector database | Permission-aware document retrieval | 8 | Technology, metadata/filter model, tenancy |
| Docker | Reproducible packaging and local/production topology | 10 | Images, registry, orchestration |
| GitHub Actions | Automated quality and delivery gates | 10 | Workflows and environments |
| AWS | Potential hosting platform | 10 | Services, regions, network and cost model |

## Request and trust boundaries

1. The browser is untrusted. All protected operations are authenticated, authorized, and validated by the API.
2. The Node.js API is the public control plane and establishes user/resource scope.
3. MySQL constraints are a final integrity boundary, not a replacement for service rules.
4. Razorpay is an external financial authority. Only signature-verified and relationship/amount/
   currency-checked evidence may affect local payment state; provider responses are never trusted
   as arbitrary application input.
5. Workers revalidate permissions or operate from immutable authorized job context; they do not trust arbitrary queued payloads.
6. The AI service is internal and receives the minimum data and tools needed for an authorized request.
7. LLM output cannot authorize actions, bypass business services, or serve as an authoritative source for financial/operational state.

## Cross-cutting concerns

- Versioned APIs and consistent response/error shapes.
- Input validation at external and service boundaries.
- Authentication, deny-by-default authorization, and future tenant isolation.
- Structured logging, correlation, metrics, and safe audit trails as their phases introduce them.
- Idempotency for payment and asynchronous workflows.
- UTC timestamps and fixed-precision money.
- Accessible client experiences for loading, empty, error, and unauthorized states.
- Tested migrations, rollback/forward-fix planning, backup, restore, and disaster recovery before production.

## Key architectural decisions still required

- Multi-tenant expansion and tenant isolation beyond the accepted single-business baseline.
- UI system: Material UI or Tailwind CSS.
- Identity recovery, verification, MFA, and future employee onboarding workflows.
- A future change to the accepted catalog model: variants, media, hierarchy, multi-currency,
  tax/discount rules, multiple warehouses, or employee onboarding.
- Notification channels and delivery guarantees.
- File storage, vector database, LLM/embedding providers, and AI data governance.
- Hosting, network boundaries, environments, observability, backup, and recovery targets.
