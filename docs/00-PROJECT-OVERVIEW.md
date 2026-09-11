# Project Overview

## Project identity

**Name:** OpsPilot — AI Business Operations Platform  
**Product type:** Full-stack business operations SaaS platform  
**Current lifecycle state:** Phases 1–3 accepted; Phase 4 repository-complete with external Razorpay
smoke deferred and acceptance pending; Phase 5 repository-complete and committed; Phase 6
repository-complete and verified under ADR 0008; Phase 7 accepted and complete for the
repository/development scope under ADRs 0009 and 0010, with production review still pending;
Phase 8 is accepted and complete for the repository/development scope under ADR 0011 as of
2026-09-06. Its local encrypted-storage and local-vector topology is not approved for production.
Phase 9's workflow/dependency baseline was accepted under ADR 0012 on 2026-09-06. Its complete
repository/development implementation and automated gate passed and were explicitly accepted that
day; production and separately gated data/live-evaluation uses remain unapproved. Phase 10's
production-configured personal-demo baseline, Razorpay Test Mode/no-real-money contract, staged
AWS/Docker/GitHub delivery direction, and progressive production AI gates were accepted under ADR
0013 on 2026-09-07. Controlled repository implementation is active; exact dependencies/tools,
cloud resources, production AI/data use, Live Mode, and deployment remain separately gated. The
selected profile is public, uses an existing AWS account and generated CloudFront domain, permits
eligible Free Tier credits but no paid spend, sends alerts by email, and uses public GitHub Free.
On 2026-09-09 the owner selected `us-east-1` and reported an AWS Free Plan account with USD 160 of
credit and 67 days remaining, MFA enabled, and billing alerts enabled. These are owner-supplied
facts and were not verified through AWS. The proposal-only CI/CD and infrastructure review found
that origin TLS, existing critical/high findings, and the finite credit window still block release
and provisioning. On 2026-09-10 Batch 10G-1 repository quality CI was approved, but its required
action recheck found two high-severity advisories in approved `actions/setup-node@v7.0.0` and no
patched `v7.x` release, so no workflow was created. The separately authorized exact upstream-patch
review also rejected merged commit `e51e5fe84fc33b4c73ebe40526b2694712b5b858` because current
full and production audits still report high findings. No provisioning is authorized.

On 2026-09-11 the owner separately approved implementation of a single-EC2 CloudFront personal-
demo pack and explicitly accepted HTTP only for the CloudFront-to-EC2 hop. ADR 0014 records this
narrow exception without changing ADR 0013's production baseline. The repository now contains a
locally verified unprivileged Nginx/React edge, Node API and worker, MySQL Compose profile, exact
Socket.IO `/api/v1` transport path, private environment example, deployment/bootstrap/smoke
scripts, and manual `us-east-1` runbook. Browser traffic remains HTTPS, Razorpay remains Test Mode,
and AI/documents/workflows remain disabled. No AWS account was accessed and no resource was
provisioned or deployed.

## Purpose

OpsPilot is intended to provide one platform for customer commerce and support activities and for business owners to manage day-to-day operations. Later phases add AI assistants that can answer questions from approved company documents and, where authorization allows, account, order, and business data.

## Problem being solved

Business commerce, inventory, orders, customer support, internal operations, reporting, and knowledge are often fragmented across tools. OpsPilot aims to provide a coherent application boundary for these workflows and introduce AI only after the underlying data, security, and operational foundations are stable.

No specific industry, company size, geography, legal regime, or business model has been selected. **Decision Required.**

## Target users

### Customers

Customers can eventually:

- Register and log in.
- Browse, search, filter, sort, and inspect products.
- Add products to a cart.
- Place and pay for orders.
- Track orders.
- Raise support tickets.
- Chat with a customer AI assistant.
- Ask questions about company policies and documents.
- Receive answers using their own account or order information where appropriate and authorized.

### Business owner and administrators

Owners and administrators can eventually:

- View a business dashboard.
- Manage products, categories, inventory, orders, customers, employees, roles, and permissions.
- Manage support tickets.
- View reports and analytics.
- Upload company documents.
- Use an owner AI assistant for business questions and generated insights.
- Receive real-time notifications.

For the accepted single-business identity baseline, owners alone can manage owner status while
administrators can manage non-owner identity access. Phase 3 assigns catalog/inventory permissions
to both `OWNER` and `ADMIN`. Phase 4 also assigns order-read/manage and payment-read/refund/
reconcile permissions to those roles; customer cart/order/payment access is authenticated and
ownership-scoped. Phase 5 adds support read/manage and report read for owners/admins, owner-only
audit read, and ownership-scoped customer support access.
Phase 6 gives only `OWNER` the cross-domain `jobs:read`/`jobs:replay` operations while every active
authenticated user receives only recipient-owned notification history and hints.
Phase 7 gives `CUSTOMER` only `ai:customer:use`, gives `OWNER` only `ai:owner:use` and
`ai:usage:read`, and gives `ADMIN` no AI permission. Owner inference also requires `reports:read`.
Phase 8 gives `OWNER` and `ADMIN` `documents:read`/`documents:manage`, but only `OWNER`
`documents:delete`. Document Q&A remains separate: customers can use only the customer assistant
and `CUSTOMER`-audience sources after current document consent; owners can use the owner assistant
for customer- or owner-audience sources; document-management permission never grants AI access.

### Future employees and managers

Employee and manager roles may be introduced with granular role-based access control (RBAC). Their workflows and default permissions are a **Decision Required** and must not be assumed during early implementation.

## Functional modules

| Module                  | Core responsibility                                                             | Planned phase |
| ----------------------- | ------------------------------------------------------------------------------- | ------------: |
| Platform foundation     | Repository, frontend, API, database tooling, configuration, health checks       |             1 |
| Identity and access     | Registration, login, users, roles, permissions, protected access                |             2 |
| Catalog and operations  | Products, categories, inventory, customers/employees as authorized              |             3 |
| Commerce                | Cart, order placement/tracking, payments                                        |             4 |
| Production backend      | Hardening, support workflows, reporting foundations, audit concerns             |             5 |
| Asynchronous operations | Real-time notifications, queues, background jobs, supporting cache if justified |             6 |
| AI service foundation   | Python/FastAPI boundary and initial assistants                                  |             7 |
| Document intelligence   | Upload pipeline, vector storage, retrieval-augmented generation                 |             8 |
| Agentic AI workflows    | LangGraph business analysis and AI-assisted support workflows                   |             9 |
| Production readiness    | Full testing, Docker, CI/CD, deployment preparation                             |            10 |

Module-to-phase boundaries may be refined during phase review, but moving a future capability earlier requires an explicit decision.

## AI capabilities

The eventual platform is expected to include:

1. A customer AI assistant.
2. A business owner AI assistant.
3. RAG over approved company documents.
4. Permission-aware business-data queries and analysis.
5. LangChain-based AI integration.
6. LangGraph workflows for multi-step business and support tasks.
7. A separate Python/FastAPI AI service.
8. AI-powered support workflows with controlled tools and human oversight where required.

The bounded stateless AI foundation is implemented in Phase 7. Phase 8 implements accepted and
verified document-grounded Q&A over approved company documents with separate consent, lifecycle,
and source authorization controls. The implemented Phase 9 baseline adds two fixed LangGraph
workflows, tightly scoped tools, and one human-approved idempotent support action.
Broader personal/row-level context, general agents, and deferred tools/actions remain prohibited.

## Technology direction

| Layer                     | Direction                                                                                                                              | Status                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Web client                | React with JavaScript and React Router                                                                                                 | Agreed                                                                                          |
| Client state              | Redux Toolkit only where shared complexity justifies it                                                                                | Conditional                                                                                     |
| UI system                 | Material UI or Tailwind CSS                                                                                                            | **Decision Required**                                                                           |
| Main API                  | Node.js, Express, JavaScript                                                                                                           | Agreed                                                                                          |
| Relational data           | MySQL with Prisma                                                                                                                      | Agreed                                                                                          |
| AI service                | Python/FastAPI boundary; Groq Chat Completions with fixed `openai/gpt-oss-120b`; LangGraph only for approved bounded Phase 9 workflows | Phases 7–9 accepted for repository/development; production unapproved                           |
| Retrieval                 | Local Qdrant plus FastEmbed `sentence-transformers/all-MiniLM-L6-v2` for Phase 8 repository/development                                | Verified under ADR 0011; production vector topology remains **Decision Required**               |
| Supporting infrastructure | MySQL jobs/JavaScript worker/Socket.IO hints; encrypted private filesystem document storage for Phase 8 repository/development         | Local document storage is not approved for production; Redis/shared adapters remain conditional |
| Delivery                  | Accepted Docker, GitHub Actions, CloudFormation, and AWS ECS/RDS/S3/CloudFront design direction                                        | ADR 0013; exact tools, infrastructure changes, and deployment remain separately gated           |

The main frontend and backend must remain JavaScript. TypeScript migration is out of scope unless the project direction is explicitly changed.

## Development phases

1. Foundation.
2. Authentication and RBAC.
3. Business Core.
4. Orders and Payments.
5. Production Backend Features.
6. Real-time and Background Jobs.
7. AI Foundation.
8. RAG and Document Intelligence.
9. LangGraph Business AI and AI Support.
10. Testing, Docker, CI/CD, and Production.

Each phase must define requirements, goals, tasks, acceptance criteria, tests, edge cases, security
considerations, completion criteria, and documentation updates. Phase 3 was explicitly accepted on
2026-08-26. The Phase 4 Razorpay Test Mode baseline was approved and implemented on 2026-08-26;
repository verification passed on 2026-08-27. External provider-delivery smoke and explicit Phase
4 acceptance remain required. ADR 0006 records the user's 2026-08-27 direction to defer that
external gate and begin Phase 5 decision-definition work without accepting Phase 4 or authorizing
live payments.

The Phase 5 baseline was accepted on 2026-08-27 in ADR 0007 and completed on 2026-08-28. Customer
and staff support workflows, authoritative overview reporting, HMAC-chained audit evidence,
structured logging, request/rate hardening, representative-data performance evidence, and a
sanitized backup/restore exercise all pass their repository gates. Its acceptance report records
the retained production decisions and blockers. Its transition did not pre-authorize a queue,
real-time transport, cache, worker, or new dependency; those choices were made separately in ADR 0008.

Phase 6's complete baseline was approved on 2026-08-28 in ADR 0008. It uses a MySQL transactional
job/outbox, a separate JavaScript worker, persistent recipient-owned notifications, and Socket.IO
only as an authenticated change-hint layer. The repository implementation and verification gate
passed on 2026-08-29 with exact `socket.io@4.8.3`/`socket.io-client@4.8.3` pins. Redis, BullMQ,
distributed scaling, and external channels remain out of scope. That transition did not
pre-authorize Phase 7 or decide its AI/provider/data-governance boundary.

On 2026-09-02 the user explicitly started Phase 7 and initially selected xAI/Grok. On 2026-09-03,
ADR 0009 accepted the complete stateless assistant, signed internal service, permission,
consent/ZDR, metadata-only usage/cost, dependency, and evaluation baseline. On 2026-09-04,
secret-safe inspection established that the existing ignored credential is a Groq key, and the user
explicitly authorized using that key and implementing Groq. ADR 0010 switches only the provider
adapter and provider-scoped contracts to Groq Chat Completions with fixed
`openai/gpt-oss-120b`. Global ZDR, the redacted key/model access preflight, the paced metered live
evaluation, and the signed live service path passed without exposing secrets or retaining content.
The user explicitly enabled development inference and accepted Phase 7 on 2026-09-04. Production
deployment remains unapproved pending the manual account/privacy/operations review.

On 2026-09-05, the user accepted the Phase 8 baseline in ADR 0011, including its exact local
Qdrant/FastEmbed dependencies and one-time approved MiniLM artifact cache. Repository/development
implementation now adds strict text/Markdown document ingestion, encrypted private local objects,
versioned audience/lifecycle metadata, MySQL-backed ingest/reindex/deletion jobs, signed retrieval,
bounded grounded context, and citation handling. Final Phase 8 verification passed, and the user
instructed that the completed phase be committed on 2026-09-06, recording explicit acceptance for
the repository/development scope. Local filesystem/Qdrant operation is deliberately rejected in
production.

On 2026-09-06, the user explicitly instructed OpsPilot to start Phase 9 and then approved the
complete repository/development baseline under ADR 0012. It defines an owner-only read-only
business brief and an owner/admin support reply-draft workflow with
fixed graph-selected Node tools, metadata-only local checkpoints, short-lived encrypted artifacts,
and mandatory human approval before one idempotent public reply. The permission/approval matrix,
threat model, exact LangGraph dependency pins, and evaluation gates are accepted. The complete
implementation and repository/development gate passed and were explicitly accepted on 2026-09-06.

On 2026-09-07, the user verified that Phase 10 should start if Phase 9 was complete and clarified
that OpsPilot is a personal project whose deployed demo may continue to use Razorpay Test Mode.
The user then explicitly accepted the complete baseline and threat model under ADR 0013. Controlled
repository implementation is active for a cost-aware production-configured demo with persistent
public-demo/fictional-data/`TEST MODE — NO REAL MONEY` labelling, staged container/CI/cloud gates,
synthetic/non-sensitive data, and progressive AI enablement. The user selected public AWS access,
no custom domain, eligible Free Tier credits only, demo traffic, email alerts, and public GitHub
Free. The owner later reported USD 160 of free credit and selected `us-east`, which still requires
an exact `us-east-1` or `us-east-2` choice. On 2026-09-09 the owner resolved the region as
`us-east-1` and reported 67 credit-days remaining, Free Plan status, MFA, and billing alerts.
Those account facts remain owner-reported rather than independently verified. No new
dependency/tool, provider account, cloud resource, paid
spend, real data use, Live Mode payment, production AI enablement, or deployment is approved by
that acceptance.

On 2026-09-08 the user separately approved the exact Batch 10C Node/Python/MySQL image pull and
build. Hardened local images, Compose, SBOM/provenance, fresh migrations, health, shutdown, and
regression checks pass. Critical/high scan findings, migration-image dev content, and a
Prisma/OpenSSL warning block Batch 10C acceptance; no cloud resource or deployment was authorized.

The user then approved only the six Batch 10D remediation changes and prohibited residual-finding
acceptance. Exact npm/PCRE2/MySQL fixes and migration/AI minimization are implemented and their
regressions pass, but the image gate still reports critical/high findings and npm retains the
Prisma `deepmerge-ts` chain. A live MySQL restart also leaves API/worker pools unrecovered until
dependent containers are recreated. Batch 10C/10D, AWS work, release use, and deployment remain
blocked; no residual finding was accepted.

Batch 10E subsequently cleared the MySQL scan and database-pool recovery blockers without
accepting the remaining Node/migration/AI or Prisma findings. The proposal-only Batch 10F upstream
review then found no current official image or stable Prisma candidate that clears the required
zero-critical/high compatibility gate. No Batch 10F implementation is recommended or authorized.

The subsequent proposal-only CI/CD and `us-east-1` infrastructure review is recorded in
`docs/phase-10/PHASE-10-CI-CD-AWS-INFRASTRUCTURE-PROPOSAL.md`. Repository-only quality CI is a
viable separately gated next batch. The owner approved 10G-1 on 2026-09-10, but implementation
stopped before workflow creation because its exact setup-node action bundles two high-severity
findings and no patched release exists. The exact PR 1599 merge commit was then reviewed under a
proposal-only authorization and rejected because `brace-expansion@5.0.8` is affected by a newer
high-severity advisory. Release/provisioning remain blocked by the existing scan findings, an
unresolved strict TLS path between CloudFront and ALB when no custom domain exists, and the need to
re-price every usage-based resource against the expiring credit immediately before creation. No
workflow, GitHub setting, CloudFormation template, AWS access, or resource change was made.

## Overall system flow

### Core application flow

1. A user interacts with the React web client.
2. The client calls versioned Node.js/Express APIs.
3. Middleware authenticates, authorizes, validates, and adds request context where applicable.
4. Controllers delegate to business services.
5. Services enforce business rules and transactions and use the data-access boundary.
6. For payment workflows, the API calls Razorpay through a narrow adapter and accepts only verified,
   relationship/amount/currency-matched provider evidence; payment credentials stay in hosted
   Checkout.
7. Prisma reads or writes relational data in MySQL.
8. Committed transitions that need asynchronous notification insert a registered job inside the
   same transaction; a separately supervised worker later validates and executes it from MySQL.
9. Persistent notification state is read through REST. Socket.IO may send a recipient-scoped UUID/
   cursor hint, but it never establishes business truth or authorization.
10. The API returns a consistent success or error response to the client.

### Phase 7 AI flow

1. The React client sends an authorized AI request to the Node.js API.
2. Node.js establishes the active user, exact permissions, assistant-scoped consent, quota/cost
   reservation, and minimum approved context.
3. Node.js invokes the loopback Python/FastAPI AI service over a signed, replay-resistant boundary.
4. FastAPI selects a fixed prompt and calls Groq's fixed Chat Completions endpoint with strict
   structured output, no tools/citations, low reasoning, and no automatic retry. Calls are blocked
   unless Groq ZDR has been explicitly confirmed.
5. Node.js records metadata-only outcome/cost evidence, rechecks authorization/consent, and returns
   plain text. Questions, answers, reasoning, and chat history are not stored.

### Phase 8 document-Q&A flow

1. An authorized owner or administrator creates immutable document metadata and uploads only an
   approved UTF-8 `.txt` or `.md` English version through the Node.js API; the API validates and
   encrypts the normalized original in private local storage for repository/development use.
2. MySQL records document/version/audience lifecycle metadata and atomically enqueues only a
   registered UUID/index job descriptor; the separate JavaScript worker performs ingestion,
   reindexing, and deletion work.
3. The signed FastAPI boundary chunks approved text deterministically, embeds it with the pinned
   local MiniLM model, and stores opaque vector/filter metadata in local Qdrant. It returns only
   candidate IDs and scores for retrieval.
4. Node reauthorizes every candidate against current MySQL lifecycle and audience metadata,
   decrypts and checksum-verifies only approved byte ranges, then sends bounded source excerpts to
   the AI service through the signed boundary.
5. Groq receives the question and bounded authorized excerpts only after the separate
   document-processing consent check. Node rechecks authorization after generation, persists
   citation identifiers and metadata-only usage evidence, and returns a plain-text answer with
   current authorized citations or an insufficient-evidence result.

Broader LangChain/LangGraph agents, personal/row-level context, and actions remain deferred. The
implemented narrow Phase 9 boundary is documented in `docs/phase-9/`; it remains default-disabled
and is not approved for production or separately gated support-data/live-evaluation use.

The initial release is single-business per ADR 0003. Multi-tenancy and tenant isolation require a later explicit architectural decision and schema migration.

## Success boundaries

This document defines product direction, not detailed behavior. Where a requirement has not been discussed, documents use **Decision Required** rather than inventing a rule.
