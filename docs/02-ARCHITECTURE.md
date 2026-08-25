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

The development topology, package/workspace layout, ports, build tool, supported Node.js version, package manager, UI system, test tooling, and whether the database health check is separate from process health are a **Decision Required** before implementation.

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
4. Workers revalidate permissions or operate from immutable authorized job context; they do not trust arbitrary queued payloads.
5. The AI service is internal and receives the minimum data and tools needed for an authorized request.
6. LLM output cannot authorize actions, bypass business services, or serve as an authoritative source for financial/operational state.

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

- Single-business versus multi-tenant product model and tenant isolation.
- Monorepo/package layout and toolchain.
- UI system: Material UI or Tailwind CSS.
- Authentication/session design and identity recovery/verification workflows.
- Payment provider and payment/webhook state model.
- Inventory reservation and overselling policy.
- Notification channels and delivery guarantees.
- File storage, vector database, LLM/embedding providers, and AI data governance.
- Hosting, network boundaries, environments, observability, backup, and recovery targets.

