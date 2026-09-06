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
Redis, exports, and AI did not enter the Phase 5 topology.

## Phase 6 real-time and background-job foundation

Phase 6 adds two runtime boundaries without changing MySQL's authority:

```text
React notification center                         owner /admin/jobs
        |                                               |
        | REST history + Socket.IO UUID/cursor hint     | owner-only REST
        v                                               v
Node.js/Express API + API-local notification cursor poller
        |                         |
        | source mutation + job  | notification reads
        | in one transaction     |
        v                         v
MySQL background jobs/attempts/heartbeats/notifications
        ^
        | lease/renew/complete/fail + current-state handler
        |
separately supervised JavaScript worker
```

The MySQL queue uses registered versioned descriptors, unique dedupe keys, bounded
`FOR UPDATE SKIP LOCKED` claims, opaque owner/token leases, attempt evidence, capped exponential
retry with jitter, terminal dead letters, fixed UTC schedules, and owner-only audited replay.
Domain services enqueue notification work inside their current business transaction. Every
handler validates the stored descriptor and committed source, reloads current state, and creates a
recipient/type/source-deduped notification.

Socket.IO is attached to the existing HTTP server only as a best-effort hint layer. Exact-origin
opaque-session middleware derives one user room, periodically revalidates the session, applies
in-process connection/rate/packet/event bounds, and emits only notification UUID plus cursor. REST
and MySQL remain the authorization, recovery, and durability path. Redis/BullMQ, external channels,
shared adapters, multi-instance topology, attachments, exports, and AI remain outside this phase.

## Phase 7 AI foundation boundary

ADRs 0009 and 0010's Phase 7 repository baseline is implemented and deterministically verified. One
separately run Python/FastAPI service sits behind Node.js. Node remains the only
public API and owns session authentication, permissions, provider-processing consent, aggregate
report access, quota/idempotency reservations, and metadata-only usage/audit evidence. It sends a
minimal HMAC-signed internal request. FastAPI has no MySQL or business-API credential and can call
only the fixed Groq Chat Completions endpoint with `openai/gpt-oss-120b`, no tools/citations,
strict structured output, and explicitly operator-confirmed ZDR.

Only stateless public-feature customer help and owner explanation of the existing aggregate
overview are implemented by the Phase 7 assistant paths. Questions, answers, reasoning, context,
and chat history are not stored. Consent and metadata-only usage/cost evidence are stored in MySQL.
Persistent chat, personal/row-level context, LangChain/LangGraph, streaming, and AI actions remain
deferred. Phase 8 adds a separate document-Q&A path below; it does not broaden the Phase 7
assistant permissions or context.

Global ZDR, the redacted application preflight, the paced metered synthetic evaluation, and the
signed live path passed on 2026-09-04; the user explicitly enabled the development routes. The
user subsequently accepted Phase 7 after its repository/development completion gate passed. The
remaining manual privacy/account/operations review and explicit production approval are still
required before production deployment.

## Phase 8 document intelligence boundary

ADR 0011 authorizes the repository/development implementation now verified. Node remains the
only public API and authorization authority. The document path accepts only normalized UTF-8
English `.txt` and `.md` content up to 256 KiB, keeps the original outside the web root in an
AES-256-GCM encrypted filesystem store, and keeps authoritative lifecycle, audience, chunk, and
citation metadata in MySQL. The local filesystem adapter is rejected by production configuration.

```text
React document management / document Q&A
                 |
                 v
Node.js + Express public API
  |-- session, RBAC, CSRF, idempotency, lifecycle, document consent
  |-- encrypted private filesystem objects (repository/development only)
  |-- MySQL documents / versions / audiences / chunks / citations / jobs
  |                                      ^
  |                                      | registered UUID/index descriptors
  |                                      |
  |                         separate JavaScript job worker
  |
  | HMAC-signed index, candidate, publication, deletion, and response calls
  v
FastAPI RAG boundary
  |-- deterministic chunking + pinned local FastEmbed MiniLM model
  |-- local Qdrant collection with opaque point/filter metadata
  v
candidate IDs/scores only ----> Node reauthorizes current MySQL state, decrypts and
                                 checksum-checks bounded excerpts, then sends only that
                                 bounded context for Groq generation
```

Qdrant is a candidate-ranking boundary, never an authorization source. Node derives the allowed
audiences from the registered assistant, rechecks current `ACTIVE`/`READY`/active-version state
before text is used, and repeats authorization/consent/source checks after generation. Groq has no
tool or callback capability; the provider receives the question plus at most the bounded
reauthorized excerpts. Staged publication, superseding, reindexing, deletion, and advisory orphan
inventory are fail-closed repository/development paths. Final Phase 8 verification passes and
explicit repository/development acceptance was recorded on 2026-09-06.

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

## Current Phase 8 and later architecture

```text
Customers / Owners / Admins / Future Employees
                      |
                      v
             React web application
                      |
                      v
          Node.js + Express public API
             |        |          |
             |        |          +--> encrypted local document objects
             |        |                (Phase 8 repository/development only)
             |        +-------------> MySQL job worker + Socket.IO hints
             |        |                (implemented single-instance baseline)
             v        v
        Business services --> MySQL via Prisma
             |
             v
       Python FastAPI AI service
             |        |
             |        +--> local Qdrant + local FastEmbed (implemented Phase 8 RAG)
             v
        Groq document generation

       Phase 9 implemented: versioned LangGraph + signed Node tool gateway
```

The local Phase 8 object/vector/embedding and Phase 9 checkpoint/workflow topology is deliberately a
single-process repository/development boundary, not a production deployment design. Phase 9's two
fixed graphs, reverse signed tool boundary, encrypted workflow artifacts, and local metadata-only
checkpoint store are implemented, verified, and explicitly accepted for repository/development but
remain default-disabled. Later components remain direction only until their own phase approves them.

## Future supporting infrastructure

| Component               | Intended responsibility                                                                | Earliest planned phase | Unresolved choice                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------- | ---------------------: | --------------------------------------------------------------------------------------------------------------------------- |
| Redis/shared adapters   | Future cache or multi-instance queue/socket/rate coordination if justified             |                After 6 | Need, topology, ownership, failure behavior                                                                                 |
| Document object storage | AES-256-GCM private filesystem objects for strict text/Markdown originals              |                      8 | Verified locally under ADR 0011; production provider, IAM/KMS, scanning, retention, backups, and recovery remain unresolved |
| Python/FastAPI          | Isolated provider/prompt and signed document-index boundary                            |                      7 | Phase 7 provider/live development gates pass; Phase 8 adds local RAG; production mTLS/network topology remains unresolved   |
| Vector database         | Local Qdrant candidate index with FastEmbed MiniLM vectors and opaque payload metadata |                      8 | Verified locally under ADR 0011; production topology, tenancy, network controls, backups, and capacity remain unresolved    |
| Workflow checkpointer   | Private metadata-only SQLite checkpoints for bounded LangGraph pause/resume            |                      9 | Verified locally under ADR 0012; production durable/encrypted multi-instance topology and recovery remain unresolved        |
| Docker                  | Reproducible packaging and local/production topology                                   |                     10 | Images, registry, orchestration                                                                                             |
| GitHub Actions          | Automated quality and delivery gates                                                   |                     10 | Workflows and environments                                                                                                  |
| AWS                     | Potential hosting platform                                                             |                     10 | Services, regions, network and cost model                                                                                   |

## Request and trust boundaries

1. The browser is untrusted. All protected operations are authenticated, authorized, and validated by the API.
2. The Node.js API is the public control plane and establishes user/resource scope.
3. MySQL constraints are a final integrity boundary, not a replacement for service rules.
4. Razorpay is an external financial authority. Only signature-verified and relationship/amount/
   currency-checked evidence may affect local payment state; provider responses are never trusted
   as arbitrary application input.
5. Workers revalidate permissions or operate from immutable authorized job context; they do not trust arbitrary queued payloads.
6. The AI service is internal and receives only the minimum data for an authorized request. For
   Phase 8, it receives opaque candidate requests or bounded reauthorized source excerpts, never
   browser authority or database credentials; it has no tool or callback capability.
7. Qdrant/local embedding storage may rank candidates but cannot authorize them. Node must verify
   current MySQL lifecycle, audience, integrity, permission, and consent before and after provider
   work.
8. LLM output cannot authorize actions, bypass business services, or serve as an authoritative source for financial/operational state.

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
- Phase 7 provider/account/privacy review and the production service topology; Phase 8 production
  object storage, KMS/key rotation, vector service/networking, model/cache ownership, parser/
  malware policy, retention/legal-hold, deletion propagation, and later AI governance remain
  unresolved in their owning phases.
- Hosting, network boundaries, environments, observability, backup, and recovery targets.
