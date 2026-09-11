# Work Progress

**Last updated:** 2026-09-11

## Current Phase

Phase 10 — Testing, Docker, CI/CD, and Production (baseline accepted under ADR 0013; separate ADR
0014 personal-demo pack locally ready; AWS not provisioned)

## Status

PHASE 10 BASELINE ACCEPTED — PERSONAL-DEMO PACK LOCALLY READY, DEPLOYMENT NOT AUTHORIZED

## Completed

- Phase 1 foundation implementation, review, and explicit acceptance.
- React/Vite and Express/Prisma/MySQL workspace foundation with validated configuration, versioned health API, centralized errors, tests, coverage, build, migrations, and live readiness checks.
- Phase 2 authentication/RBAC requirements, dependency review, ADR, permission matrix, and threat model.
- Phase 2 users, roles, permissions, assignments, opaque sessions, and security-event schema plus seeded migration.
- Argon2id registration/login, account lock windows, session lifecycle, logout, trusted-origin checks, CSRF, and per-process authentication rate limits.
- Deny-by-default authentication/permission middleware plus owner/admin and last-active-owner safeguards.
- Authorized user listing/retrieval, status management, role assignment/removal, and role/permission discovery APIs.
- Interactive one-time owner bootstrap without password arguments or password environment variables.
- React Router registration, login, session restoration, dashboard, access-denied, and user-administration UI.
- Phase 2 API/UI guide, acceptance report, security documentation, and synchronized architecture/schema/contracts.
- Phase 2 gate rerun: lint, formatting, Prisma validation, development/test migration status, 20 API tests, 8 web tests, enforced coverage, and production build passed.
- Phase 2 explicitly accepted and Phase 3 authorized on 2026-08-25.
- Phase 3 business rules approved and recorded in ADR 0004 with `INR` as the single-business currency.
- Phase 3 permission matrix and threat model accepted for implementation.
- Migration-controlled products, categories, assignments, aggregate inventory balances, immutable adjustments, database constraints, and four permissions implemented and deployed to development/test databases.
- Public active catalog and product details implemented with bounded allowlisted query behavior and boolean-only availability.
- Protected product/category management implemented with normalized uniqueness, lifecycle rules, CSRF, permissions, and optimistic versions.
- Protected exact inventory, threshold maintenance, and atomic balance-plus-ledger adjustments implemented with concurrency and nonnegative-stock safeguards.
- Responsive public products, product detail, protected catalog management, and protected inventory UI implemented.
- Phase 3 API/UI implementation guide plus synchronized architecture, database, API, permission, security, and phase documentation created.
- Phase 3 verification currently passes 34 API tests and 13 web tests with all configured coverage gates.
- Resolved the local owner-login database pool failure by allowing MySQL `caching_sha2_password` public-key retrieval only for loopback hosts; remote hosts remain deny-by-default.
- Phase 3 UI behavior validated by the user and the phase explicitly accepted on 2026-08-26.
- Phase 4 explicitly authorized to start on 2026-08-26, with Razorpay selected as the payment
  provider and Test Mode credentials available outside version control.
- Phase 4 repository flow, existing commerce boundaries, configuration, tests, and current official
  Razorpay Standard Checkout/order/webhook/refund guidance reviewed.
- Phase 4 decision proposal, proposed permission matrix, and payment threat model drafted for
  explicit approval before schema or application changes.
- Complete Phase 4 proposal explicitly approved on 2026-08-26; ADR 0005 records the accepted cart,
  checkout, order, reservation, Razorpay Test Mode, webhook, refund, reconciliation, and permission
  baseline.
- Phase 4 Prisma schema and migration implement carts, immutable orders/items, inventory
  reservations/status history, payment intents/attempts, refunds, webhook evidence, five
  permissions, database checks, relationships, indexes, and idempotency constraints.
- Authenticated cart, serializable checkout, opportunistic expiry, customer order/payment recovery,
  operator fulfillment/cancellation, full refund, reconciliation, raw verified webhooks, and the
  native Razorpay adapter are implemented without a new dependency.
- Responsive customer cart/checkout/order pages and permission-gated operator order management are
  implemented; all provider credential entry remains inside Razorpay-hosted Checkout.
- Phase 4 implementation guide, Test Mode operations runbook, permission matrix, threat model, ADR,
  synchronized architecture/database/API docs, and review report are complete.
- Phase 4 repository gate passes lint, formatting/schema validation, 53 API tests, 24 web tests,
  both coverage thresholds, production build, development/test migration status, local API/web
  smoke, Git whitespace, and workspace secret-literal scans.
- The local Razorpay configuration issue was rechecked without exposing values: the ignored API
  environment exists, but provider enablement, Test Mode keys, and webhook secret are unset; a
  public HTTPS webhook and automatic-capture confirmation are also not recorded.
- The pre-commit staged-content scan found a real-looking Razorpay Test Mode key pair and webhook
  endpoint in the tracked API example. The values were removed before commit, both example files
  now use disabled/empty placeholders, and the staged tree rescans cleanly.
- ADR 0006 records the user's explicit direction on 2026-08-27 to defer the unresolved external
  Razorpay smoke and start Phase 5 decision-definition work without accepting Phase 4 or enabling
  live payments.
- The Phase 5 decision proposal, proposed permission matrix, and proposed threat model define a
  dependency-free support/report/audit/hardening baseline for review.
- Phase 4 and its documented Phase 5 transition were committed as `2e5d009` after lint, 53 API
  tests, 24 web tests, coverage, formatting/schema validation, build, whitespace, and corrected
  staged-secret checks passed.
- The user explicitly authorized Phase 5 implementation on 2026-08-27; ADR 0007 accepts the full
  support, reporting, audit, hardening, permission, dependency, retention, and test baseline.
- Migration `20260827060000_phase_5_support_audit_foundation` adds versioned/idempotent support
  tickets, immutable messages/events, an audit chain head/event foundation, four permissions, and
  database constraints/indexes without a new dependency.
- The additive Phase 5 migration is deployed to development and test databases and the Prisma
  client is regenerated. A too-long initial compound-index name caused a development migration
  failure; only one empty Phase 5 table and its new permission mappings existed, they were verified
  and removed, the failed record was marked rolled back, and the corrected migration reapplied.
- Two Phase 5 foundation integration tests pass for role mappings, owner-only audit access, chain
  initialization, support persistence, and scoped message idempotency.
- Base64 audit-key and stable key-ID configuration now fails closed outside routine tests. Tracked
  examples remain empty, routine tests use an isolated test-only key, and the ignored development
  environment has a newly generated 32-byte local key without exposing it.
- The Phase 5 audit service validates a registered action/target/metadata contract, locks the
  singleton chain head, appends a canonical HMAC-SHA256 event and advances the head atomically, and
  verifies sequence, previous-hash, event-HMAC, key-ID, and head continuity.
- Additive migration `20260828060000_phase_5_audit_actor_restrict` prevents user deletion from
  rewriting a hashed audit actor ID to null; account erasure remains deferred to the accepted
  retention/anonymization decision boundary.
- `GET /api/v1/audit-events` now enforces owner-only `audit:read`, strict bounded UTC/filter/
  pagination validation, newest-first safe projections, and exactly one post-query access event.
  No audit mutation or public verification route exists.
- Focused audit tests cover canonicalization, concurrency, rollback, metadata rejection, mutation,
  deletion, reordering, wrong keys, broken heads, validation, authorization, disabled sessions,
  access-event recursion safety, and absence of mutation routes.
- Ownership-safe customer and staff support APIs implement creation, list/detail, public messages,
  internal notes, customer closure, assignment, priority/status transitions, idempotency, optimistic
  versions, and strict authorization. Responsive customer and management UI routes are complete.
- `GET /api/v1/reports/overview` and `/admin/reports` implement the accepted exact-INR, strict UTC,
  default-30-day/maximum-366-day operational overview with bounded authoritative queries and empty
  breakdowns.
- Sensitive Phase 2–5 business mutations now append registered audit evidence in the same local
  transaction. Provider-side effects retain the existing pending/webhook/reconciliation recovery
  boundary, and the owner-only audit read plus offline verifier are complete.
- Allowlisted structured JSON logging, request IDs, safe public errors, exact trusted-proxy hops,
  isolated general/support/report/webhook rate controls, payload limits, and URL-encoded rejection
  are implemented and redaction-tested.
- Two report-index migrations and one measured, parameterized refund query keep all accepted local
  representative-data p95 targets below their thresholds at 100,000 orders and 25,000 tickets/
  audit events.
- A checksum-verified sanitized backup/restore exercise restored 115,450,437 bytes into the
  isolated shadow database in 44.368 seconds with matching row counts and audit head. The dump,
  target data, and representative dataset were removed afterward.
- Phase 5 architecture, schema, API, permission, threat, audit, performance, recovery, runbook, and
  acceptance documents are synchronized. No Phase 6 service, dependency, or runtime was added.
- The final gate passes lint, formatting/Prisma validation, 87 API tests, 34 web tests, both
  coverage suites, production build, eight-migration status/drift checks, live ephemeral API/web
  smoke, audit verification, whitespace checks, and tracked/ignored secret checks.
- Phase 5 was committed as `10e73ac` (`feat: complete phase 5 production backend`) with no
  remaining Phase 5 worktree changes.
- Phase 6's specification and relevant transaction/session/audit/log/rate/provider boundaries were
  reviewed together with current official MySQL queue locking and Socket.IO delivery/recovery
  behavior.
- A complete proposed MySQL transactional job/outbox, worker, persistent notification, Socket.IO
  hint, permission, security, dependency, configuration, and test baseline is documented for
  explicit approval. No Phase 6 package, schema, service, account, route, or runtime was added.
- The user approved the complete Phase 6 baseline and authorized installation of `socket.io` and
  `socket.io-client` on 2026-08-28. ADR 0008 records the accepted implementation boundary.
- Exact `socket.io@4.8.3` and `socket.io-client@4.8.3` dependencies passed license, engine, and
  compatibility review; no Redis, BullMQ, broker, hosted channel, or additional package was added.
- Migration `20260828094016_phase_6_realtime_jobs` adds durable jobs, attempts, worker heartbeats,
  recipient-owned notifications, owner-only job permissions, constraints, and queue/read indexes.
- Transactional domain enqueueing now covers reservation expiry, payment reconciliation, webhook
  processing, refunds, support activity, persistent notification materialization, and both fixed
  maintenance schedules without weakening the existing audit or provider-recovery boundaries.
- The separate worker implements atomic MySQL claiming with `FOR UPDATE SKIP LOCKED`, leases and
  renewals, bounded exponential retry with jitter, dead-letter evidence, stale-work recovery,
  graceful shutdown, heartbeats, and audited owner-only replay.
- Persistent notification APIs and responsive UI provide bounded recipient-owned reads, unread
  counts, mark-one/mark-all-read behavior, and Socket.IO refresh hints with authenticated rooms,
  origin/session revalidation, connection/rate caps, and reconnect-safe database refresh.
- The owner-only jobs API and `/admin/jobs` UI provide bounded filters, detail/attempt evidence,
  manual refresh, and explicit replay for terminal jobs; customers and non-owner operators remain
  denied by default.
- Phase 6 documentation, operations/recovery guidance, threat and permission reviews, performance
  evidence, and acceptance report are synchronized. The final regression passes 121 API tests,
  36 web tests, coverage gates, build, migrations/drift, live API/worker/web smoke, performance
  targets, audit verification, whitespace, and secret checks.
- The reported Razorpay failure was reproduced on 2026-09-02 as fail-closed local configuration:
  the ignored API environment has no provider enablement, Test Mode key pair, or webhook secret.
- Phase 4 integration hardening now enforces `rzp_test_` key IDs, adds a redacted read-only provider
  preflight, preserves ambiguous/retriable Razorpay `408` and idempotent-write `409` outcomes, and
  makes failed, incomplete, or stalled hosted Checkout script loads recoverable.
- The 2026-09-02 Phase 1–6 rerun passes lint, formatting/Prisma validation, 26 API files / 123 tests,
  5 web files / 38 tests, both coverage gates, production build, development/test nine-migration
  status and drift, both audit-chain verifiers, live API/worker/built-web smoke, and all five Phase
  6 performance targets. Test-smoke queue evidence was removed afterward.
- The local API was restarted with Razorpay enabled and remains healthy with a reachable database,
  a freshly rotated matched Test Mode key pair passes the redacted provider preflight, and an
  existing pending payment was resumed to a verified Razorpay provider order with Checkout ready.
- The expired ephemeral zrok webhook was replaced for local testing by a temporary Cloudflare Quick
  Tunnel without adding a repository dependency. Public health returned `200`, and an invalid-signature
  webhook probe reached the raw-body route and was correctly rejected with `401` without data changes.
- The 2026-09-02 Razorpay Test Mode hardening, focused tests, redacted provider preflight, and
  synchronized Phase 4/6 evidence were reviewed for pending secrets, passed 15 API tests, 5 web
  tests, lint, and whitespace checks, and were committed as `cbaf163`.
- The user explicitly authorized Phase 7 decision-definition on 2026-09-02, selected xAI/Grok as
  the provider, and confirmed that an API key exists outside the repository. No key value was read,
  requested, logged, or added to a tracked file.
- The Phase 7 specification, existing session/RBAC/report/audit/log/rate/UI boundaries, installed
  Python 3.13.7 runtime, and current official xAI Responses API, Grok 4.6, ZDR, cost, rate, and key-
  scope behavior were reviewed.
- A complete proposed stateless Grok/FastAPI, signed internal service, two-intent, three-permission,
  explicit-consent/ZDR, metadata-only usage/cost, dependency, threat, evaluation, and test baseline
  is documented for explicit approval. No AI dependency, service, provider call, schema,
  permission, route, or UI was added.
- The user's 2026-09-03 instruction to start implementation accepts the complete Phase 7 baseline
  and authorizes installation of only its documented Python packages. ADR 0009 records the exact
  boundary and reviewed direct dependency pins; no real xAI call or secret access is authorized.
- The isolated Python 3.13/FastAPI service now implements strict redacted configuration, loopback-
  only binding, signed/replay-resistant internal health and response routes, immutable two-intent
  prompts, structured plain-text output, bounded concurrency, safe logging, and the raw REST
  `grok-4.6` adapter with required ZDR, exact cost, timeout, and no-retry enforcement.
- Migration `20260903060000_phase_7_ai_foundation` adds the three accepted permissions,
  assistant-scoped versioned consent, and metadata-only usage/cost state. It is applied without
  drift to both development and test databases; no chat/content table was added.
- The Node API implements consent, customer help, owner aggregate-overview explanation, aggregate
  usage, HMAC client, strict validation, CSRF/RBAC, burst/daily/concurrency/cost gates, at-most-once
  submission, safe failed/unknown outcomes, audit evidence, and post-call authorization/consent and
  cost-overrun suppression.
- React implements permission-gated `/assistant` and `/admin/assistant` pages with explicit scoped
  consent/revocation, new UUID per explicit request, plain-text response rendering, refusal/
  escalation/error states, authoritative owner overview separation, and metadata-only usage.
- The fixed 20-case synthetic live evaluation, redacted non-inference provider preflight, and
  explicit real HTTP Node-to-FastAPI deterministic smoke are implemented. The repository gate passes
  145 API tests, 43 web tests, 78 routine Python tests with one opt-in skip, all three coverage
  thresholds, lint/format/schema/build/migration-diff/audit/dependency checks, and the explicit
  cross-service smoke.
- Phase 7 architecture, database, API, permission, threat, implementation, operations, evaluation,
  review, ADR, and progress documents were synchronized. At the 2026-09-03 repository gate, no real
  xAI request had been made and `apps/ai/.env` was absent.
- On 2026-09-04, the ignored AI configuration was inspected without emitting secret values after a
  metadata preflight was rejected before inference. The supplied key was safely identified as a
  Groq credential, not the xAI inference credential required by ADR 0009. Provider enablement was
  restored to false. Python configuration now parses the documented dotenv ZDR boolean while still
  requiring it to remain true, rejects non-xAI keys before network access, and maps provider HTTP
  failures before enforcing the success-response ZDR header. The full Python rerun passes 78 tests
  with one intentional cross-service skip and 86.33% coverage; Ruff lint/format, dependency
  consistency, safe local configuration loading, the explicit signed cross-service smoke (one pass
  in 0.90 seconds), and whitespace checks pass.
- On 2026-09-04 the user explicitly authorized using the existing Groq key and implementing the
  provider migration. ADR 0010 supersedes only ADR 0009's xAI-specific portions. The fixed provider
  is now Groq Chat Completions with `openai/gpt-oss-120b`, strict schema output, low reasoning
  effort with reasoning excluded from responses, no tools/citations/retries, and exact
  cached/uncached token-price accounting.
- Migration `20260904090000_phase_7_groq_provider` preserves historical `XAI` evidence, adds
  `GROQ`, revokes active legacy xAI consent so it is not reused, permits the fixed model's slash,
  and is applied to development and test. Consent is now provider-scoped `groq-zdr-v1`.
- A redacted Groq model-list check successfully authenticated the existing ignored key and found one
  active `openai/gpt-oss-120b` model. It performed no inference and emitted no secret. The updated
  Python suite passes 96 tests with one opt-in skip and 88.31% coverage; focused API (19 tests) and
  web (5 tests) provider-migration suites pass. Full API (145 tests) and web (43 tests) regressions,
  both coverage gates, lint, format/schema validation, production build, both database
  status/drift checks, and the signed cross-service smoke (one pass in 0.68 seconds) also pass.
- The operator confirmed Global ZDR in Groq Data Controls and the user explicitly requested
  development enablement. The application preflight passed without inference. GPT-OSS request
  compatibility was corrected to use `include_reasoning: false` and Groq's supported strict-schema
  subset while retaining full local validation. The live runner now paces cases by eight seconds
  without retries to respect the observed 8K-token/minute limit.
- The final metered evaluation passed all 20 cases: 100% allowed-intent, critical-safety, and schema
  rates; zero unsupported-claim indicators; 1,459 ms p95; USD 0.0001326525 mean cost; and USD
  0.0001993500 maximum cost. A signed live Node-to-FastAPI-to-Groq smoke also passed. Ignored local
  provider and Node flags are enabled, and API health reports AI `ready`.
- On 2026-09-04, after the completion criteria and evidence passed, the user instructed that Phase
  7 be marked complete and committed. This records explicit Phase 7 acceptance for the
  repository/development scope. It does not approve production deployment or authorize Phase 8.
- On 2026-09-05, the user accepted the complete Phase 8 proposal, permission matrix, threat model,
  exact `qdrant-client==1.19.0` and `fastembed==0.8.0` pins, and one-time
  `sentence-transformers/all-MiniLM-L6-v2` cache download by explicitly answering “yes”. ADR 0011
  records the exact repository/development scope; no hosted vector/object account, PDF/OCR,
  LangChain/LangGraph, autonomous action, or production rollout was authorized.
- Three additive migrations implement logical documents, immutable versions/audiences,
  generation-aware chunk/citation metadata, document consent, and idempotent mutation receipts.
  All 14 migrations are current in development and test with no schema drift.
- Owner/admin document management, strict raw text/Markdown validation, encrypted private object
  storage, version/lifecycle/reindex/delete/recovery flows, idempotent worker jobs, and responsive
  document/status UI are implemented. Document-storage and RAG cache/vector roots are rejected when
  broad, repository-contained, repository-parent, or web-accessible; documents never use
  user-controlled paths.
- The isolated signed FastAPI retrieval boundary implements deterministic chunking, fixed cached
  MiniLM embeddings, private local Qdrant, opaque candidate results, and strict document answer
  contracts. Node remains the authority: it rechecks user/permission/consent/lifecycle/audience,
  decrypts/checksums only bounded approved excerpts, and rechecks citations after inference.
- The offline 50-case retrieval suite passes with 100% recall@5/MRR/no-evidence/audience/
  superseded/deleted controls and 50.862 ms p95. The paced 54-case Groq document-answer gate passes
  its 95% grounded-answer target at 97.5%, all 100% no-evidence/critical-safety/schema/citation
  targets, 1,046 ms p95, and bounded cost without content or secret output. The signed five-case
  Node-to-FastAPI-to-Groq sample also passes.
- The Phase 8 repository gate passes 35 API files / 193 tests, 7 web files / 48 tests, 144 Python
  tests with two explicit live skips, all configured coverage thresholds, lint/format/schema/build,
  both migration/drift checks, audit verification, dependency checks, whitespace, and credential
  hygiene. Architecture, persistence, API, permission, threat, implementation, operations,
  evaluation, and review documentation are synchronized.
- On 2026-09-06 the complete routine gate was rerun before handoff: 193 API tests, 48 web tests,
  144 Python tests with two intentional live skips, all coverage thresholds, lint/format/schema,
  Python dependency checks, production build, all 14 development/test migrations with no drift,
  both audit verifiers, the deterministic signed boundary smoke, Git whitespace, and the 50-case
  offline retrieval gate pass. The user instructed that Phase 8 be committed if complete; this
  records explicit Phase 8 acceptance for the repository/development scope. No production rollout
  or Phase 9 work is authorized by that instruction.
- The complete accepted Phase 8 repository/development implementation was committed as `41801e6`
  (`feat: complete phase 8 document intelligence`).
- On 2026-09-06 the user explicitly instructed OpsPilot to start Phase 9. This authorizes
  decision-definition work, not dependency installation or implementation of unresolved workflow,
  tool, approval, retention, or action policies.
- The Phase 9 specification and existing AI/RAG/support/report/RBAC/audit/job/configuration/
  persistence/UI boundaries were reviewed together with current official LangGraph persistence,
  interrupt, graph-version compatibility, recursion/timeout, SQLite checkpointer, and strict
  deserialization guidance.
- A complete proposed two-graph baseline is documented for review: owner-only read-only business
  briefs and owner/admin support reply drafting with customer-policy grounding, metadata-only
  LangGraph checkpoints, Node-owned encrypted artifacts, fixed graph-selected tools, mandatory
  human approval, and exactly one idempotent customer-visible reply action. At that proposal gate,
  no Phase 9 runtime change had been made.
- Current official package review proposes exact `langgraph==1.2.11` and
  `langgraph-checkpoint-sqlite==3.1.1` pins after separate approval. At that review gate no package
  was installed, no lock changed, no LangSmith/provider account was added, and no provider workflow
  call was made.
- The user explicitly approved the complete Phase 9 repository/development baseline and the
  separate installation of `langgraph==1.2.11` and `langgraph-checkpoint-sqlite==3.1.1` on
  2026-09-06. ADR 0012 records the authorization and its production, real-support-data, metered
  live-evaluation, provider/model/account, and deferred-action exclusions.
- The exact LangGraph dependencies are installed in the isolated Python environment and committed
  lock. Fixed `v1` owner-business-brief and support-reply graphs, strict metadata-only SQLite
  checkpoints, bounded provider steps, signed reverse Node tools, and checkpoint cleanup are
  implemented without LangSmith or a new account/service.
- Migration `20260906090000_phase_9_langgraph_workflows` implements three permissions, workflow
  runs/tool evidence/approvals, short-lived AES-256-GCM artifacts, AI usage/model-step links,
  AI-assisted support-message origin, constraints, indexes, and registered advance/retention jobs.
  All 15 migrations are applied to development/test with zero schema diff.
- Node implements default-off/production-rejected gates, separate signed internal boundaries,
  repeated RBAC/consent/scope/cost/freshness reauthorization, fixed business/support tools,
  artifact encryption, safe failure/unknown handling, approval/version/digest concurrency, and one
  idempotent customer-visible support reply after mandatory human approval.
- React implements permission-gated business workflow and support review experiences with explicit
  workflow consent, safe plain-text output, provenance/freshness/uncertainty, exact draft review,
  edit/approve/reject/cancel, and AI-assisted origin. Non-synthetic support processing remains
  disabled and unapproved.
- The final gate passes lint, formatting/schema validation, production build, 39 API files / 209
  tests, 8 web files / 53 tests, 165 routine Python tests with 3 opt-in skips, all coverage gates,
  both database drift/audit checks, Python dependency consistency, secret scan, the 100-case
  content-free offline evaluation, and the five-case bidirectional signed local workflow smoke.
  Workflow p95 is 270.757 ms and signed tool p95 is 71.660 ms.
- Architecture, database, API, AI, permissions, threat, implementation, operations, evaluation,
  review, phase, decision, and progress documentation are synchronized.
- On 2026-09-06, after the complete gate passed, the user explicitly accepted Phase 9 and instructed
  that the repository/development implementation be committed. This acceptance does not authorize
  production, metered workflow evaluation, non-synthetic support-data model processing, Phase 10,
  or any deferred workflow/tool/action.
- On 2026-09-07 the user explicitly instructed OpsPilot to begin Phase 10 if Phase 9 was complete.
  Phase 9 acceptance, review evidence, clean tracked commit state, and commit `ccfbd88` on
  `main`/`origin/main` were verified; this authorizes Phase 10 decision-definition.
- The current package/runtime/configuration/test boundaries were inventoried. There is no Docker,
  Compose, GitHub Actions, infrastructure-as-code, browser E2E, hosted observability, or approved
  production data topology. Existing production guards intentionally reject local Phase 8/9
  storage and workflow persistence.
- Current official Docker, GitHub Actions, AWS ECS/RDS/CloudFront/CloudWatch, LangGraph production
  persistence, and Qdrant Cloud security/backup guidance was reviewed. A staged AWS personal-demo
  architecture, CI/release/test gates, dependency/account/configuration catalog, and production
  threat model are proposed in `docs/phase-10/PHASE-10-DECISION-PROPOSAL.md` and
  `docs/security/PHASE-10-THREAT-MODEL.md`.
- The user clarified that OpsPilot is a personal project and approved Razorpay Test Mode for the
  deployed production-configured demo. This does not approve Live Mode or real payment acceptance;
  the proposed UI/runbook/release contract requires `TEST MODE — NO REAL MONEY` labelling.
- On 2026-09-07 the user explicitly answered `approved` to the complete Phase 10 baseline and
  threat-model approval request. ADR 0013 accepts controlled repository implementation, the
  personal-demo/AWS delivery design, synthetic-data/default-off AI profile, staged release gates,
  and required production controls. New dependencies/tools, cloud changes, real data, production
  AI, Live Mode, and deployment keep separate gates.
- The web shell now persistently labels the personal project `TEST MODE — NO REAL MONEY` and
  explains that Razorpay payments are simulated. This is implemented entirely with the existing
  React/CSS/test stack and adds no dependency. The focused 21-test app suite and complete 53-test
  web suite pass, along with lint, formatting/Prisma validation, and the 113-module production web
  build. Web coverage remains above its gate at 80.62/71.79/80.60/82.81 percent for statements/
  branches/functions/lines.
- On 2026-09-08 the user explicitly approved Batch 10A. The official version-specific Docker
  Desktop for Windows x86_64 `4.89.0` installer matched its published SHA-256 and a valid Docker
  Inc Authenticode signature, then completed a per-user WSL 2 installation with exit code `0`.
  Installed versions are Desktop `4.89.0.238018`, Docker CLI `29.7.2`, Compose `5.5.0`, and Buildx
  `0.36.1-desktop.1`; no sign-in, Kubernetes, image pull, repository dependency, or cloud change
  occurred.
- On 2026-09-08 the user separately approved enabling Windows Subsystem for Linux and Virtual
  Machine Platform and restarting Windows. Elevated DISM enabled both, returned restart-required
  exit code `3010`, and both remained enabled after restart with `vmcompute` and `hns` running.
- The user then separately approved Batch 10B Microsoft WSL `2.7.13.0`. The exact official x64 MSI
  was 258,985,984 bytes, matched SHA-256
  `a3505a50f4cc585551d11d9de824ba4375448d7a68f2e71d3fb315fa986fc754`, and had a valid Microsoft
  Corporation Authenticode signature. Installation completed with exit code `0` and no restart
  requirement. WSL now reports version `2.7.13.0`, kernel `6.18.33.2-2`, and default version `2`.
- Restarting Docker Desktop cleared the stale pre-update backend. Docker Engine `29.7.2` now reports
  healthy Linux/x86_64 operation with zero running containers and zero local images.
- The user explicitly approved pulling and building the exact Batch 10C digests. Node
  `24.19.0-bookworm-slim`, Python `3.13.15-slim-bookworm`, and local/CI MySQL `8.4.11` were pulled,
  version-checked, and used without Docker sign-in or cloud changes. Dockerfiles pin the reviewed
  bases and Dockerfile/SBOM helpers; the Linux/amd64 AI runtime lock preserves the same 69 approved
  runtime versions and excludes development packages.
- Hardened Node, migration, and AI images plus a safe local/CI Compose topology are implemented.
  Stable-input repeat builds reproduce the runnable platform manifests. A fresh disposable stack
  applies all 15 migrations, returns healthy API/database status, starts the worker, enforces
  non-root/read-only/all-capabilities-dropped controls, exposes only the API on host loopback, and
  shuts down cleanly. The isolated AI image health/filesystem/shutdown checks also pass. Complete
  evidence is in `docs/phase-10/PHASE-10-BATCH-10C-CONTAINER-EVIDENCE.md`.
- Runtime hardening reduced the Node image from about 182 MB to 115 MB and removed npm, npx, tsx,
  and the Prisma CLI. The migration image uses a fresh 226 MB runtime without global npm/npx, but
  still carries unrelated workspace dev modules. Docker Scout SPDX SBOM generation passes, while
  scans report unresolved critical/high totals of Node `2/9`, migration `2/10`, AI `3/14`, and
  MySQL `2/30`; no risk acceptance has been granted. Prisma's successful generation/migration
  path also retains an OpenSSL detection warning because no OS package was approved.
- The Batch 10C regression gate passes JavaScript lint, formatting/Prisma validation, the
  113-module web build, 39 API files / 209 tests, 8 web files / 53 tests, Python dependency
  consistency/Ruff, and 165 Python tests with 3 opt-in skips. The initial Windows lint/format and
  pytest attempts exposed inaccessible generated cache/temp ACLs; source-tree cache exclusions and
  a unique task-owned pytest temp base produced clean reruns without deleting user cache data.
- The user approved only the six Batch 10D remediation changes and explicitly prohibited residual-
  finding acceptance. Exact `mariadb@3.4.7`, `mysql2@3.23.1`, and `qs@6.16.0` overrides; a
  dedicated migration lock; the Debian PCRE2 update/tool hardening; final AI pip removal; a
  non-root minimized local/CI MySQL image; and a mandatory content/SBOM/scan gate are implemented.
  Repeat builds reproduce all four runnable manifests. The migration image fell from 585 to 270
  indexed packages; exact content, Prisma engine/linkage, fresh 15-migration MySQL, initial health,
  controls, shutdown, and full JavaScript/Python regressions pass.
- Batch 10D remains unaccepted. The 2026-09-09 automated scan gate fails at Node `2/8`, migration
  `2/8`, AI `3/11`, and MySQL `2/20` critical/high totals; both npm production audits retain the
  three-node Prisma `deepmerge-ts` high chain. Scout attributes MySQL's Go results to deleted
  lower-layer gosu metadata despite runtime absence. A live MySQL restart also leaves API/worker
  pools in persistent Prisma `P2039` timeouts until dependency-ordered container recreation. No
  VEX, waiver, exception, or risk acceptance was created. See
  `docs/phase-10/PHASE-10-BATCH-10D-REMEDIATION-EVIDENCE.md`.
- On 2026-09-09 the user explicitly approved only Batch 10E changes 10E-1 through 10E-4, including
  the two non-secret database timing settings and disposable tests, while prohibiting Trixie,
  Prisma/MariaDB dependency changes, and residual acceptance. The exact approved final-filesystem
  MySQL image, dependency-free API/worker database supervisor, Compose restart propagation,
  authenticated MySQL healthcheck, and mandatory recovery/image gates are implemented. The
  disposable stack passes startup fail-close, short recovery, explicit Compose restart, prolonged
  supervised exit/recreation, concurrent read, mutation `503`, migration, persistence, AI ordering,
  and graceful-shutdown checks.
- Batch 10E resolves the MySQL lower-layer attribution and database-pool recovery blockers. MySQL's
  strengthened content/SBOM scan indexes 141 packages with zero gosu/Go attribution and reports
  `0C/0H`; repeat Node/MySQL builds reproduce runnable layers and configuration. Full gates pass at
  40 API files / 221 tests, 8 web files / 53 tests, and 165 Python passes / 3 opt-in skips. Node and
  migration remain `2C/8H`, AI remains `3C/11H`, and both npm audits retain the three-node Prisma
  high chain, so Batch 10E and Phase 10 release/deployment remain blocked and unaccepted. See
  `docs/phase-10/PHASE-10-BATCH-10E-REMEDIATION-EVIDENCE.md` and
  `docs/phase-10/PHASE-10-CONTAINER-OPERATIONS-RUNBOOK.md`.
- On 2026-09-09 the user authorized a proposal-only Batch 10F review of the next
  upstream-compatible Node/Python image and Prisma remediation. Read-only official manifest,
  registry scan, package metadata, advisory, issue, Debian tracker, lock, and runtime-linkage
  review found no candidate that meets both compatibility and the zero-critical/high gate. No
  image was pulled/built/tagged, no dependency changed, and no finding was accepted. See
  `docs/phase-10/PHASE-10-BATCH-10F-UPSTREAM-REMEDIATION-PROPOSAL.md`.
- The user selected public access, confirmed an AWS account, selected no custom domain and email
  alerts, limited spend to Free Tier/credits, described traffic as demo-only, and confirmed a
  public repository on GitHub Free. The public banner now also tells visitors to use fictional
  information and warns that demo data may be deleted. On 2026-09-09 the owner selected
  `us-east-1` and reported Free Plan status, USD 160 of free AWS credit with 67 days remaining,
  MFA enabled, and billing alerts enabled. These are owner-supplied facts; no AWS account/API,
  IAM, billing, or region access was performed to verify them.
- Current official AWS guidance was rechecked: the new-customer Free Plan is limited to six months
  or credit exhaustion, while Fargate and ALB are usage-priced and RDS eligibility depends on the
  account program. No paid spend or silent plan upgrade is approved. The accepted topology must
  stop before provisioning if unexpired credits/service eligibility cannot cover it.
- The user authorized only a proposal for CI/CD and AWS infrastructure in `us-east-1` and explicitly
  prohibited provisioning. The resulting
  `docs/phase-10/PHASE-10-CI-CD-AWS-INFRASTRUCTURE-PROPOSAL.md` defines independent repository-CI,
  GitHub-settings, repository-IaC, AWS-bootstrap, staging, and release gates. It inventories exact
  candidate action commits but authorizes none. No workflow, setting, dependency, template, AWS
  resource, credential, artifact, image, or deployment was created or changed.
- That review found two additional release/provisioning blockers. With no custom domain, the
  generated CloudFront viewer domain cannot supply the matching publicly trusted certificate
  required for strict HTTPS to the ALB custom origin; private HTTP is not accepted as encrypted in
  transit. Also, USD 160 over 67 days is only about USD 2.39/day, so the usage-priced topology is
  proposed as one ephemeral dynamic environment at a time and must be re-priced immediately before
  any later provisioning request.
- On 2026-09-10 the owner approved the exact four-action Batch 10G-1 repository-only pull-request
  quality CI scope. The required immediate official tag/advisory recheck found that approved
  `actions/setup-node@v7.0.0` commit `820762786026740c76f36085b0efc47a31fe5020` bundles versions
  affected by high-severity `GHSA-3jxr-9vmj-r5cp` and `GHSA-mh99-v99m-4gvg`. Upstream merged a
  rebuilt patched bundle, but no patched `v7.x` tag exists; `v7` and `v7.0.0` still resolve to the
  blocked commit. Implementation stopped before `.github` or a workflow was created. No finding
  was accepted/suppressed and no alternate action/runtime path was substituted.
- The owner then authorized proposal-only review of exact merged PR 1599 commit
  `e51e5fe84fc33b4c73ebe40526b2694712b5b858`. Its publisher/signature, nine-file patch, cumulative
  delta from `v7.0.0`, `node24` action metadata, MIT license, lock, and compiled bundles were
  inspected without installing anything. Fresh no-install audits fail at `0C/2H/1M` for production
  dependencies and `0C/3H/2M` for the complete lock because `brace-expansion@5.0.8` and other
  current findings remain. The exact commit is rejected; no workflow, GitHub/AWS change,
  deployment, suppression, or finding acceptance resulted. Evidence is in
  `docs/phase-10/PHASE-10-BATCH-10G-1-SETUP-NODE-PATCH-REVIEW.md`.
- On 2026-09-11 the owner authorized a proposal-only no-domain strict-HTTPS alternatives review for
  `us-east-1`. No drop-in candidate passes the accepted Free Plan, private-origin, Socket.IO,
  continuous-worker, cookie/CSRF, and no-residual gates. App Runner is a Paid Plan service in the
  new AWS experience, and Lightsail requires advanced features; neither is approved. A
  CloudFront/API Gateway/Lambda re-platform remains the only candidate for a separate detailed
  proposal, not an accepted topology. No template, install, workflow, GitHub/AWS access or change,
  provisioning, deployment, domain purchase, HTTP-origin exception, suppression, or finding
  acceptance occurred. Evidence is in
  `docs/phase-10/PHASE-10-NO-DOMAIN-STRICT-HTTPS-ALTERNATIVES.md`.
- The owner then authorized a detailed proposal-only API Gateway/Lambda compatibility and threat-
  model review for `us-east-1`. The least-incompatible candidate would adapt request-bounded REST
  work to Lambda, replace Socket.IO with API Gateway native WebSocket plus durable connection and
  revocation state, keep the continuous worker supervised on private compute, and evaluate RDS
  Proxy. It remains no-go: all fifteen findings are open, including protocol/cookie-path, generated-
  origin bypass, distributed controls, Prisma/database connection behavior, private egress/cost,
  Lambda packaging, and existing release findings. No code, dependency, workflow, template,
  GitHub/AWS access or change, provisioning, deployment, HTTP origin, suppression, or acceptance
  resulted. Evidence is in
  `docs/phase-10/PHASE-10-API-GATEWAY-LAMBDA-COMPATIBILITY-PROPOSAL.md` and
  `docs/security/PHASE-10-API-GATEWAY-LAMBDA-THREAT-MODEL.md`.
- The owner then separately approved implementation of a single-EC2 CloudFront personal-demo pack
  and explicitly accepted HTTP only for the CloudFront-to-EC2 hop. ADR 0014 preserves ADR 0013 as
  the production baseline while authorizing this narrower demo path. No AWS access or provisioning
  was authorized.
- The demo pack now includes an exact-digest unprivileged Nginx/React image, production-configured
  Compose overlay for one EC2, ignored private environment template, Linux deploy/bootstrap/smoke
  scripts, and the manual `us-east-1` AWS runbook. Socket.IO moved to `/api/v1/socket.io` so the
  browser sends the existing `/api/v1`-scoped session cookie; its client, integration, proxy-source,
  and UI coverage pass.
- Local verification passes lint, formatting/Prisma validation, production build, 41 API files /
  225 tests, 8 web files / 53 tests, Compose validation, fresh migration, non-root Nginx image and
  syntax checks, Linux script syntax/placeholder checks, healthy MySQL/API/web containers, worker
  jobs, SPA/API health, and authenticated WebSocket-through-Nginx smoke. The disposable stack uses
  synthetic values only and is removed after verification. No finding was accepted or suppressed.

## In Progress

- Phase 10's baseline and threat model are accepted. Batch 10A Docker Desktop and Batch 10B WSL are
  installed and verified; WSL and Docker engine health pass. The separately approved Batch 10E
  implementation is verified but not accepted: MySQL attribution and database-restart recovery are
  resolved, while Node/migration/AI image findings, the Prisma npm finding, and the Prisma/OpenSSL
  warning remain blocking with no residual accepted. The Batch 10F proposal-only review recommends
  no image/Prisma implementation until an upstream trigger occurs. Batch 10G-1 is approved but
  paused before workflow creation because both its exact tagged setup-node action and the separately
  reviewed PR 1599 patch have current high findings. No patched release has passed review. Later CI,
  E2E, accessibility, security pins, and any next remediation batch still require separate review
  and approval before use.
- The separate ADR 0014 personal-demo deployment pack is locally ready. It has not been tested
  through CloudFront or Razorpay's dashboard because AWS access/provisioning and public deployment
  were expressly excluded from this implementation approval. The next cloud action requires a
  new explicit authorization and must follow the manual runbook.
- The owner selected `us-east-1` and reports an AWS Free Plan with USD 160 of credit and 67 days
  remaining, MFA enabled, and billing alerts enabled. Account/service eligibility, actual
  balance/expiry, alert configuration/delivery, and exact costs still require independent
  verification immediately before any cloud request. The proposal-only no-domain review found no
  compatible drop-in strict-HTTPS origin. The detailed follow-up found the only retained material
  CloudFront/API Gateway/Lambda candidate no-go with fifteen open findings. Strict origin TLS
  remains unresolved for the ADR 0013 production design; ADR 0014 records only the accepted HTTP
  origin exception for the personal demo. No cloud resource, provider purchase, paid spend, real
  data use, production AI enablement, or deployment has been authorized.
- Phase 9 has no remaining repository/development work. Production, metered workflow evaluation,
  and non-synthetic support-data model processing remain separately gated inside Phase 10.
- Phase 8 production storage/vector topology, privacy/retention, networking, monitoring, backup,
  multi-instance operation, and rollout approval remain unresolved and separate from the accepted
  repository/development scope.
- The real Razorpay provider smoke matrix and explicit Phase 4 acceptance remain blocked on a
  completed hosted Test Mode payment plus copying the current temporary HTTPS webhook endpoint into
  the Test Mode dashboard, matching its separate secret, confirming automatic capture, and
  subscribing only to the seven allowlisted events. The personal deployed demo may use Test Mode
  with explicit no-real-money labelling; Live Mode remains prohibited.
- Phase 7 development AI prompts remain enabled after ZDR confirmation, redacted preflight,
  all-green live evaluation, signed live service smoke, and explicit phase acceptance. Broader
  account/privacy/legal/operations review and production rollout approval remain required before
  production deployment.

## Next Task

The repository pack is ready. Before deployment, the owner must recheck the AWS console for the
actual credit balance/expiry and expected EC2/EBS/public-IPv4/CloudFront charges, then give separate
explicit authorization to provision the ADR 0014 resources in `us-east-1`. After that approval,
follow `docs/phase-10/PHASE-10-SINGLE-EC2-DEMO-DEPLOYMENT-RUNBOOK.md`: create the EC2 and CloudFront
resources, install Docker, clone the exact approved commit, create `demo.env` on EC2, start the
stack, bootstrap the owner interactively, run public/browser smoke checks, and configure the seven
Razorpay Test Mode webhook events. Do not use real data, Live Mode, production AI, or unapproved
paid-plan changes.

In parallel, keep Batch 10F proposal-only and Batch 10G-1 unimplemented until official patched
upstream releases pass the existing immutable-pin/license/advisory/compatibility gates. The ADR
0013 production blockers are not waived by the demo path, and no finding may be accepted or
suppressed silently.

## Accepted Decisions

- JavaScript for the React frontend and Node.js/Express backend; Python 3.13 is isolated to the
  Phase 7 AI service.
- npm workspaces, ECMAScript modules, Node.js 24.19.x, React/Vite, Express, Prisma/MySQL, Vitest, ESLint, and Prettier.
- Single-business initial release.
- Public customer registration and interactive owner bootstrap.
- Database-backed opaque cookie sessions with CSRF and exact-origin protection.
- Argon2id and database-backed deny-by-default RBAC.
- Migration-controlled `OWNER`, `ADMIN`, and `CUSTOMER` roles and Phase 2 permissions.
- Public active catalog; protected business management; UUID products; normalized immutable SKU; flat categories; plain text; `DECIMAL(12,2)` prices; single `INR` currency; draft/active/archive lifecycle; optimistic versions.
- One aggregate nonnegative whole-number stock balance plus immutable atomic adjustment ledger; public boolean availability and protected exact stock.
- `products:manage`, `categories:manage`, `inventory:read`, and `inventory:adjust` assigned to `OWNER` and `ADMIN`.
- Product/category hard deletion, variants, images, hierarchy, multiple warehouses, fractional
  stock, taxes, discounts, currency conversion, and new employee models are deferred. The limited
  Phase 4 aggregate order-reservation model is implemented.
- Verification, recovery, MFA, employee invitations, and account deletion remain deferred until reviewed.
- Dependencies and services are reviewed before installation and are not added speculatively.
- ADR 0013 accepts the Phase 10 personal-demo production-readiness baseline, AWS design target,
  staged release controls, threat model, synthetic-data/default-off AI launch profile, and exact-
  digest release gate. It does not approve dependency installation, cloud changes, production AI,
  Live Mode, real data, or deployment.
- ADR 0014 separately accepts the single-EC2 CloudFront personal-demo repository pack and the HTTP
  CloudFront-to-EC2 hop explicitly approved by the owner. It does not replace ADR 0013, authorize
  AWS access/provisioning, or accept any existing release finding.
- The initial profile is a public, synthetic-data personal demo on AWS using the generated
  CloudFront domain, email alerts, and a public GitHub Free repository. Only eligible Free Tier
  credits may be consumed; paid spend and automatic paid-plan upgrades are not approved.
- OpsPilot's initial deployed target is a personal production-configured demo. Razorpay Test Mode is
  allowed there only for simulated payments with explicit `TEST MODE — NO REAL MONEY` labelling;
  Live Mode and real payment acceptance remain prohibited.
- Razorpay is selected as the Phase 4 payment provider; only a Test Mode credential is currently in
  scope. The complete Standard Checkout, automatic-capture, webhook/refund/reconciliation,
  inventory-reservation, permission, API/UI, and explicit-deferral baseline is accepted in ADR 0005.
- ADR 0006 defers the missing external Razorpay Test Mode smoke, keeps Phase 4 unaccepted and Live
  Mode prohibited, and authorizes Phase 5 decision-definition work to proceed.
- ADR 0007 accepts the Phase 5 support, report, HMAC-chained audit, dependency-free logging,
  single-instance rate/proxy, performance, permission, temporary retention, and implementation
  baseline. Attachments, exports, hosted observability, queues/realtime, distributed limits, live
  payments, and AI remain deferred.
- ADR 0008 accepts a MySQL transactional job/outbox, separate JavaScript worker, persistent
  recipient-owned in-app notifications, Socket.IO as a non-durable hint layer, owner-only job
  inspection/replay, and no Redis/BullMQ/external broker or multi-instance topology.
- ADR 0009 accepts the provider-neutral Phase 7 required-ZDR, stateless two-intent,
  signed-Node/FastAPI, assistant-scoped-consent, metadata-only usage/cost, three-permission,
  quota/evaluation, and exact Python dependency baseline.
- ADR 0010 supersedes ADR 0009's xAI-specific portions with Groq Chat Completions,
  `openai/gpt-oss-120b`, explicit ZDR operator confirmation, `groq-zdr-v1` consent, exact
  returned-token cost calculation, and a historical-data-preserving provider migration.

## Phase 3 Acceptance Evidence

- Accepted decision record: `docs/decisions/0004-phase-3-business-core.md`.
- Permission mapping: `docs/permissions/PHASE-03-PERMISSION-MATRIX.md`.
- Security review: `docs/security/PHASE-03-THREAT-MODEL.md`.
- API/UI behavior and review Q&A: `docs/phase-3/PHASE-03-IMPLEMENTATION-GUIDE.md`.
- Consolidated technical evidence: `docs/phase-3/PHASE-03-REVIEW-REPORT.md`.
- API coverage: 83.78% statements, 67.36% branches, 92.97% functions, 87.06% lines.
- Web coverage: 84.44% statements, 69.38% branches, 83.41% functions, 86.28% lines.
- Lint, formatting, Prisma validation, development/test migration status, production build, live API/web smoke, and Git whitespace checks pass.

## Phase 4 Review Evidence

- Accepted decision record: `docs/decisions/0005-phase-4-orders-payments.md`.
- Permission mapping: `docs/permissions/PHASE-04-PERMISSION-MATRIX.md`.
- Security review: `docs/security/PHASE-04-THREAT-MODEL.md`.
- API/UI behavior: `docs/phase-4/PHASE-04-IMPLEMENTATION-GUIDE.md`.
- Provider setup/recovery: `docs/phase-4/PHASE-04-OPERATIONS-RUNBOOK.md`.
- Consolidated evidence: `docs/phase-4/PHASE-04-REVIEW-REPORT.md`.
- API coverage: 80.24% statements, 68.17% branches, 94.67% functions, 84.54% lines.
- Web coverage: 82.56% statements, 71.09% branches, 80.25% functions, 85.10% lines.
- Lint, formatting/Prisma validation, development/test migration status, production build, local
  API/web smoke, Git whitespace, and secret-literal scans pass.
- 2026-09-02 re-verification: Phase 4 hardening is included in the passing 123-API/38-web full
  regression and current coverage/build/database/live-smoke gate. The redacted provider preflight
  correctly reports `PAYMENT_PROVIDER_NOT_CONFIGURED`; real Test Mode delivery remains pending.

## Phase 5 Acceptance Evidence

- Phase transition exception: `docs/decisions/0006-phase-4-provider-smoke-deferral.md`.
- Accepted baseline: `docs/decisions/0007-phase-5-production-backend-baseline.md` and
  `docs/phase-5/PHASE-05-DECISION-PROPOSAL.md`.
- Accepted authorization mapping: `docs/permissions/PHASE-05-PERMISSION-MATRIX.md`.
- Accepted security requirements: `docs/security/PHASE-05-THREAT-MODEL.md`.
- Acceptance report: `docs/phase-5/PHASE-05-ACCEPTANCE-REPORT.md`.
- Performance evidence: `docs/phase-5/PHASE-05-PERFORMANCE-EVIDENCE.md`.
- Operations and recovery runbook: `docs/phase-5/PHASE-05-OPERATIONS-RUNBOOK.md`.
- Persistence migration: `apps/api/prisma/migrations/20260827060000_phase_5_support_audit_foundation/migration.sql`.
- Actor-integrity migration:
  `apps/api/prisma/migrations/20260828060000_phase_5_audit_actor_restrict/migration.sql`.
- Report index migrations:
  `apps/api/prisma/migrations/20260828070000_phase_5_report_indexes/migration.sql` and
  `apps/api/prisma/migrations/20260828080000_phase_5_report_covering_indexes/migration.sql`.
- Development and test databases report all eight migrations applied; development schema drift is
  absent.
- Full regression: 19 API files / 87 tests and 4 web files / 34 tests pass.
- API coverage: 83.18% statements, 71.71% branches, 94.70% functions, 87.19% lines.
- Web coverage: 83.54% statements, 73.48% branches, 81.14% functions, 85.63% lines.
- Production build: 63 modules; 325.68 kB main JavaScript, 92.37 kB gzip.
- Representative p95: authenticated overview 206.022 ms, support management list 159.322 ms,
  customer order list 1.709 ms, and audit read 7.675 ms.
- Audit verification passes over the 25,000-event representative chain and over current
  development/test state after cleanup.
- Lint, formatting/Prisma validation, production build, live ephemeral API/database/request-ID and
  built-web smoke, Git whitespace, high-confidence credential scans, and ignored-environment checks
  pass.

## Known Issues

- The installed system Node.js remains 20.19.4 because active Node processes prevent MSI replacement. Verification uses an official portable Node.js 24.19.0 runtime; complete the system upgrade after active sessions are closed.
- The owner selected `us-east-1` and reports an AWS Free Plan, USD 160 of free credit with 67 days
  remaining, MFA, and billing alerts. The account facts, service eligibility, alert delivery,
  exact balance/expiry, and prices are unverified. ECS/Fargate, ALB, private networking, WAF, RDS,
  logging, and related services cannot be assumed permanently free, so provisioning is blocked.
- The accepted generated-CloudFront-domain topology has no currently approved path for strict
  certificate-validated HTTPS from CloudFront to the ALB without an owned domain and matching
  certificate. Private HTTP is not accepted as satisfying the encryption-in-transit gate. The
  2026-09-11 no-domain review found no compatible drop-in replacement. The separately authorized
  detailed API Gateway/Lambda review found its only retained material re-platform candidate no-go
  with all fifteen compatibility/security findings open; it is not accepted or authorized for
  implementation. ADR 0014 permits HTTP on that origin hop only for the separate personal demo;
  the production requirement remains unchanged.
- The ADR 0014 demo is deliberately one EC2 host with one local MySQL Docker volume, one API
  process, one worker, and no HA or zero-downtime guarantee. Browser-to-CloudFront traffic is
  HTTPS, but origin traffic is plaintext HTTP; only fictional, disposable data is permitted.
- Approved `actions/setup-node@v7.0.0` bundles `brace-expansion@1.1.13`, `2.1.1`, and `5.0.6`, which
  are affected by two high-severity denial-of-service advisories. Exact merged PR 1599 commit
  `e51e5fe84fc33b4c73ebe40526b2694712b5b858` upgrades them to `5.0.8`, but that version is affected
  by high-severity `GHSA-rgw5-rvv9-x895`; its production lock also retains moderate findings, and
  its full lock has further high/moderate findings. No patched `v7.x` release has passed review.
  Batch 10G-1 is therefore approved but unimplemented, with no waiver or alternate bootstrap path
  accepted.
- The 2026-09-09 root and migration `npm audit --omit=dev` runs each report three high nodes in the
  one unresolved `prisma@7.9.1 -> @prisma/config@7.9.1 -> deepmerge-ts@7.1.5` chain. The approved
  MariaDB, mysql2, and qs fixes cleared their findings. npm proposes a breaking Prisma downgrade;
  stable Prisma `7.10.0` still includes `deepmerge-ts@7.1.5`, Prisma 8 is prerelease, the rejected
  `deepmerge-ts@8` override remains unapplied, and no finding is accepted.
- The Batch 10E image gate remains blocking at Node `2C/8H`, migration `2C/8H`, and AI `3C/11H`.
  Bookworm Perl/OpenSSL/util-linux/zlib results remain, including `CVE-2026-57432`. The rebuilt
  MySQL final filesystem now passes at `0C/0H` with zero gosu/Go SBOM attribution. Prisma's exact
  migration engine remains unlinked from OpenSSL but still emits the known detection warning. No
  VEX, exception, waiver, or risk acceptance exists. Batch 10F's Node `24.20.0` Bookworm/Alpine and
  Python `3.13.15` Alpine reviews also fail the zero-critical/high gate; the AI lock is additionally
  incompatible with musl without a broader dependency/platform change.
- The prior API/worker `P2039` restart blocker is verified resolved for the local/CI topology.
  Short interruptions recover without process replacement; prolonged failures fail closed and
  exit non-zero, then explicit dependency-ordered Compose recreation restores fresh processes with
  migrations and data intact. Production ECS/RDS supervision remains a separate unapproved design.
- Phase 5 rate stores and Phase 6 connection/rate accounting are per process and need reviewed
  shared or edge policy before horizontal scaling.
- The Razorpay Test Mode provider-delivery gate is not yet complete end to end: the rotated API
  credentials authenticate, provider-order creation succeeds, and the temporary public HTTPS
  tunnel is verified, but dashboard capture, matching webhook secret/current endpoint, the
  seven-event allowlist, and the remaining payment/refund delivery matrix require confirmation.
  The real-looking Test Mode key pair found in the tracked example before commit remains rotated.
- Production retention/privacy/erasure/legal-hold rules, encrypted backup ownership/vendor,
  generations, RPO/RTO, restore cadence, hosted monitoring/alerting, and incident ownership remain
  undecided production blockers. The local performance result is a regression baseline, not an
  external SLA or concurrent-load/soak result.
- Job, attempt, heartbeat, and notification retention is temporarily indefinite in development and
  test. Production worker/API supervision, remote database TLS/credential handling, capacity/SLOs,
  deploy rollback, and Phase 6 retention/purge policy remain unresolved production blockers.
- The ignored Groq key, fixed-model access, Global ZDR, redacted preflight, live evaluation, and
  development service path are verified. The free-plan 8K-token/minute limit can still produce safe
  `429` failures under bursts. Credits, project/model permissions, billing controls, privacy/legal
  posture, monitoring, and production operations still require owner review.
- Phase 7's HMAC nonce cache, concurrency, and burst controls are per process. Production also lacks
  approved private TLS/mTLS/networking, supervision, monitoring/alerts, SLO/capacity, model rollback,
  unknown-cost reconciliation, and consent/usage/audit retention/erasure/legal-hold policy.
- The Python tests currently emit two upstream Starlette TestClient deprecation warnings for its
  HTTPX and AnyIO compatibility aliases. Tests pass; recheck on a future approved dependency update.

## Phase 6 Acceptance Evidence

- Phase specification: `docs/phases/PHASE-06-REALTIME-JOBS.md`.
- Accepted baseline: `docs/decisions/0008-phase-6-realtime-jobs-baseline.md` and
  `docs/phase-6/PHASE-06-DECISION-PROPOSAL.md`.
- Implemented authorization mapping: `docs/permissions/PHASE-06-PERMISSION-MATRIX.md`.
- Verified security requirements: `docs/security/PHASE-06-THREAT-MODEL.md`.
- Implementation guide: `docs/phase-6/PHASE-06-IMPLEMENTATION-GUIDE.md`.
- Operations and recovery runbook: `docs/phase-6/PHASE-06-OPERATIONS-RUNBOOK.md`.
- Performance evidence: `docs/phase-6/PHASE-06-PERFORMANCE-EVIDENCE.md`.
- Acceptance report: `docs/phase-6/PHASE-06-ACCEPTANCE-REPORT.md`.
- Persistence migration:
  `apps/api/prisma/migrations/20260828094016_phase_6_realtime_jobs/migration.sql`.
- Development and test databases report all nine migrations applied; development schema drift is
  absent. Current development and test audit chains verify successfully.
- Full regression: 26 API files / 121 tests and 5 web files / 36 tests pass.
- API coverage: 83.87% statements, 72.95% branches, 93.54% functions, 87.75% lines.
- Web coverage: 83.52% statements, 73.47% branches, 82.25% functions, 85.88% lines.
- Production build: 96 modules; 379.89 kB main JavaScript, 108.32 kB gzip; 25.20 kB CSS.
- Representative p95 at 10,000 notifications: list 19.195 ms, unread count 63.766 ms, committed-job
  visibility 41.988 ms, materialization 10.814 ms, and Socket.IO hint 36.674 ms.
- Lint, formatting/Prisma validation, build, migration/drift checks, live API/worker/built-web smoke,
  Git whitespace, high-confidence credential scans, and ignored-environment checks pass.
- Exact `socket.io@4.8.3` and `socket.io-client@4.8.3` are pinned. Existing MySQL is the only
  persistence service; no Redis, BullMQ, external broker/channel account, or new secret was added.
- 2026-09-02 re-verification passes 123 API tests, 38 web tests, API coverage
  83.90/73.04/93.54/87.77 and web coverage 83.55/73.36/82.36/85.93 (statements/branches/functions/
  lines), build, both database drift checks, both audit verifiers, and live API/worker/web smoke.
  Current Phase 6 p95 values are 15.781 ms list, 34.647 ms unread count, 22.369 ms committed-job
  visibility, 24.423 ms materialization, and 32.766 ms Socket.IO hint; all targets pass.

## Phase 7 Repository Review Evidence

- Phase specification: `docs/phases/PHASE-07-AI-FOUNDATION.md`.
- Accepted baseline: `docs/decisions/0009-phase-7-ai-foundation-baseline.md`,
  `docs/decisions/0010-phase-7-groq-provider.md`, and
  `docs/phase-7/PHASE-07-DECISION-PROPOSAL.md`.
- Implemented authorization mapping: `docs/permissions/PHASE-07-PERMISSION-MATRIX.md`.
- Verified security requirements: `docs/security/PHASE-07-THREAT-MODEL.md`.
- Implementation guide: `docs/phase-7/PHASE-07-IMPLEMENTATION-GUIDE.md`.
- Operations/recovery: `docs/phase-7/PHASE-07-OPERATIONS-RUNBOOK.md`.
- Deterministic and live evidence: `docs/phase-7/PHASE-07-EVALUATION-EVIDENCE.md`.
- Review and acceptance report: `docs/phase-7/PHASE-07-REVIEW-REPORT.md`.
- Implemented provider policy: Groq Chat Completions with `openai/gpt-oss-120b`, low reasoning
  effort with reasoning excluded from responses, strict structured output, required
  operator-confirmed ZDR, no tools/citations, and no automatic inference retry.
- Implemented capabilities: stateless public-feature customer help and owner-only explanation of the
  existing authorized aggregate overview; no personal/row-level context or action path.
- Implemented persistence: versioned consent and metadata-only usage/cost evidence; no prompt, answer,
  reasoning, chat session, or chat message storage.
- Exact dependencies: FastAPI, Uvicorn, HTTPX, Pydantic, Pydantic Settings, python-dotenv, pytest,
  pytest-cov, and Ruff in an isolated Python 3.13 environment and committed lock; no new npm
  dependency and no Groq/OpenAI SDK, LangChain, LangGraph, Redis, or vector dependency.
- Migrations `20260903060000_phase_7_ai_foundation` and
  `20260904090000_phase_7_groq_provider` are current in development/test.
- Full regression: 30 API files / 145 tests, 6 web files / 43 tests, and 97 routine Python tests
  pass; the Python routine suite has one intentional opt-in cross-service skip.
- Coverage: API 84.58/73.76/93.31/88.15, web 83.60/73.61/82.73/86.10, and Python 88.36% total
  (statements/branches/functions/lines where applicable); all configured thresholds pass.
- Production web build: 104 modules; 395.60 kB JavaScript (112.29 kB gzip); 28.23 kB CSS
  (6.26 kB gzip).
- Explicit signed Node-to-FastAPI loopback smoke passes against a deterministic provider in 0.68 s.
  Both audit chains verify over 105 development events and an empty cleaned test state; lint,
  formatting, schema, database diff, dependency, whitespace, and credential gates pass.
- Global ZDR confirmation, the redacted preflight, the paced 20-case live evaluation, and the signed
  live Node-to-FastAPI-to-Groq smoke pass without recording content or emitting secrets.
- Explicit Phase 7 acceptance was recorded on 2026-09-04 after every repository/development
  completion criterion passed. Production deployment and Phase 8 remain unauthorized.

## Phase 9 Repository Review Evidence

- Accepted baseline: `docs/decisions/0012-phase-9-langgraph-workflow-baseline.md` and
  `docs/phase-9/PHASE-09-DECISION-PROPOSAL.md`.
- Implemented authorization and security controls: `docs/permissions/PHASE-09-PERMISSION-MATRIX.md`
  and `docs/security/PHASE-09-THREAT-MODEL.md`.
- Implementation and operations: `docs/phase-9/PHASE-09-IMPLEMENTATION-GUIDE.md` and
  `docs/phase-9/PHASE-09-OPERATIONS-RUNBOOK.md`.
- Evaluation and final review: `docs/phase-9/PHASE-09-EVALUATION-EVIDENCE.md` and
  `docs/phase-9/PHASE-09-REVIEW-REPORT.md`.
- Exact dependencies: `langgraph==1.2.11` and `langgraph-checkpoint-sqlite==3.1.1`, with MIT
  license expressions and a consistent locked Python environment.
- Full regression and coverage: 209 API tests at 82.41/73.59/91.67/86.06, 53 web tests at
  80.62/71.79/80.60/82.81, and 165 passing routine Python tests at 82.87% total coverage.
- The fixed 100-case offline workflow evaluation passes all thresholds without a provider call.
  The five-case signed bidirectional local smoke passes at 270.757 ms workflow p95 and 71.660 ms
  tool p95 with exact usage/cost, encrypted artifacts, durable checkpoint cleanup, and no emitted
  content or secrets.
- All 15 migrations are current without development/test drift, both audit chains validate, and
  lint, formatting/schema, build, dependency consistency, and credential-hygiene checks pass.
- Explicit Phase 9 repository/development acceptance was recorded on 2026-09-06. Production,
  non-synthetic support-data processing, metered workflow evaluation, and Phase 10 remain
  unauthorized.

## Phase Gate

Phases 1, 2, and 3 are accepted. Phase 4 repository implementation and internal review gates pass,
but the phase remains unaccepted while real Test Mode delivery/recovery is deferred under ADR 0006.
Phase 5 is repository-complete and verified under ADR 0007 and its acceptance report. Phase 6 is
repository-complete and verified under ADR 0008 and its acceptance report. Phase 7 is explicitly
accepted and complete for the repository/development scope, live-verified, and enabled in local
development under ADRs 0009 and 0010. Production remains blocked on the broader
account/privacy/operations review and explicit rollout approval. Phase 8's complete baseline was
accepted under ADR 0011, its approved repository/development implementation and evaluation gates
pass, and explicit phase acceptance was recorded on 2026-09-06. Production is separately blocked
on approved storage/vector topology, privacy/retention, networking, operations, and rollout. Phase 9
baseline approval is recorded under ADR 0012, its complete repository/development implementation
and automated gate pass, and explicit phase acceptance was recorded on 2026-09-06. On 2026-09-07,
the user explicitly authorized Phase 10 and accepted its production-readiness baseline and threat
model under ADR 0013. Controlled repository implementation is active, starting with persistent
Razorpay Test Mode/no-real-money labelling. Exact new tools, cloud resources, real data, production
AI, deployment, and final release remain separately gated. Metered workflow evaluation,
non-synthetic support-data model processing, Redis/Valkey, external channels, live payments,
multi-instance deployment, unapproved workflows/actions, and every unaccepted production
capability remain out of scope.
