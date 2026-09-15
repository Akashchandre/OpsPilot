# OpsPilot — AI Business Operations Platform

OpsPilot is a planned full-stack business operations SaaS platform for customers and business operators. It will combine commerce and operational workflows with customer and owner AI assistants introduced in later phases.

Phases 1–3 are accepted. **Phase 4 — Orders and Payments** is repository-complete, but explicit
acceptance remains pending because the external Razorpay Test Mode delivery/recovery smoke is
deferred. **Phase 5 — Production Backend Features** is repository-complete and verified under ADR
0007, including support workflows and UI, authoritative overview reporting, HMAC-chained audit
evidence, structured logging, request/rate hardening, representative performance evidence, and a
sanitized backup/restore exercise. **Phase 6 — Real-time and Background Jobs** is repository-
complete and verified under ADR 0008 with a MySQL job/outbox, JavaScript worker, persistent
notifications, owner failure tooling, and authenticated Socket.IO hints. Redis, BullMQ, external
brokers/channels, and multi-instance topology remain out of scope. **Phase 7 — AI Foundation** has
a complete, deterministically verified repository implementation under ADRs 0009 and 0010: an isolated
Python/FastAPI Groq adapter, signed Node boundary, stateless customer/owner assistants, scoped
consent, metadata-only usage/cost evidence, permissions, and safe UI are implemented. On 2026-09-04,
Global ZDR, the redacted preflight, the paced 20-case live evaluation, and the signed live service
path passed; the user explicitly enabled development inference and accepted Phase 7 after its
completion gate passed. Phase 7 is complete for the repository/development scope. General
production rollout remains pending outside the narrow fictional-data personal-demo exception in
ADR 0017.

**Phase 8 — RAG and Document Intelligence** and **Phase 9 — LangGraph Business AI and AI Support**
are accepted and complete for repository/development under ADRs 0011 and 0012. Their local
filesystem/Qdrant/SQLite topology is not approved for general production. **Phase 10 — Testing,
Docker, CI/CD, and Production** began on 2026-09-07. ADR 0013 retains the production-readiness
baseline; unresolved Node/AI/Prisma and CI-action findings continue to block that general
production release.
For the separate personal-demo fast path, ADR 0014 accepts browser HTTPS through a generated
CloudFront domain and the explicitly approved HTTP CloudFront-to-EC2 hop. Its single-EC2 Nginx,
React, Node API/worker, MySQL, Compose, operator scripts, and manual runbook are implemented and
locally verified and deployed. ADR 0017 now records the owner's explicit, time-bounded acceptance
of the current AI image findings and the single-host local persistence limitations for fictional
demo data only. The production demo profile enables assistants, document RAG, business briefs, and
support workflows behind one explicit fail-closed topology flag; this AI-enabled release is locally
verified but not yet committed or deployed. Razorpay Live Mode and real data remain out of scope.

## Source of truth

Start with:

- [Project overview](docs/00-PROJECT-OVERVIEW.md)
- [Project rules](docs/01-PROJECT-RULES.md)
- [Architecture](docs/02-ARCHITECTURE.md)
- [Database design](docs/03-DATABASE-DESIGN.md)
- [API contract](docs/04-API-CONTRACT.md)
- [AI architecture](docs/05-AI-ARCHITECTURE.md)
- [Work progress](docs/WORK-PROGRESS.md)
- [Phase specifications](docs/phases/)
- [Phase 3 implementation guide](docs/phase-3/PHASE-03-IMPLEMENTATION-GUIDE.md)
- [Phase 3 review report](docs/phase-3/PHASE-03-REVIEW-REPORT.md)
- [Phase 3 accepted decisions](docs/decisions/0004-phase-3-business-core.md)
- [Phase 4 implementation guide](docs/phase-4/PHASE-04-IMPLEMENTATION-GUIDE.md)
- [Phase 4 Test Mode operations runbook](docs/phase-4/PHASE-04-OPERATIONS-RUNBOOK.md)
- [Phase 4 review report](docs/phase-4/PHASE-04-REVIEW-REPORT.md)
- [Phase 4 accepted decisions](docs/decisions/0005-phase-4-orders-payments.md)
- [Phase 4 provider-smoke deferral](docs/decisions/0006-phase-4-provider-smoke-deferral.md)
- [Phase 5 decision proposal](docs/phase-5/PHASE-05-DECISION-PROPOSAL.md)
- [Phase 5 audit implementation guide](docs/phase-5/PHASE-05-AUDIT-IMPLEMENTATION-GUIDE.md)
- [Phase 5 operations runbook](docs/phase-5/PHASE-05-OPERATIONS-RUNBOOK.md)
- [Phase 5 performance evidence](docs/phase-5/PHASE-05-PERFORMANCE-EVIDENCE.md)
- [Phase 5 acceptance report](docs/phase-5/PHASE-05-ACCEPTANCE-REPORT.md)
- [Phase 5 permission matrix](docs/permissions/PHASE-05-PERMISSION-MATRIX.md)
- [Phase 5 threat model](docs/security/PHASE-05-THREAT-MODEL.md)
- [Phase 5 accepted decisions](docs/decisions/0007-phase-5-production-backend-baseline.md)
- [Phase 6 decision proposal](docs/phase-6/PHASE-06-DECISION-PROPOSAL.md)
- [Phase 6 implementation guide](docs/phase-6/PHASE-06-IMPLEMENTATION-GUIDE.md)
- [Phase 6 operations runbook](docs/phase-6/PHASE-06-OPERATIONS-RUNBOOK.md)
- [Phase 6 performance evidence](docs/phase-6/PHASE-06-PERFORMANCE-EVIDENCE.md)
- [Phase 6 acceptance report](docs/phase-6/PHASE-06-ACCEPTANCE-REPORT.md)
- [Phase 6 permission matrix](docs/permissions/PHASE-06-PERMISSION-MATRIX.md)
- [Phase 6 threat model](docs/security/PHASE-06-THREAT-MODEL.md)
- [Phase 6 accepted decisions](docs/decisions/0008-phase-6-realtime-jobs-baseline.md)
- [Phase 7 decision proposal](docs/phase-7/PHASE-07-DECISION-PROPOSAL.md)
- [Phase 7 implementation guide](docs/phase-7/PHASE-07-IMPLEMENTATION-GUIDE.md)
- [Phase 7 operations runbook](docs/phase-7/PHASE-07-OPERATIONS-RUNBOOK.md)
- [Phase 7 evaluation evidence](docs/phase-7/PHASE-07-EVALUATION-EVIDENCE.md)
- [Phase 7 review and acceptance report](docs/phase-7/PHASE-07-REVIEW-REPORT.md)
- [Phase 7 permission matrix](docs/permissions/PHASE-07-PERMISSION-MATRIX.md)
- [Phase 7 threat model](docs/security/PHASE-07-THREAT-MODEL.md)
- [Phase 7 Groq provider decision](docs/decisions/0010-phase-7-groq-provider.md)
- [Phase 8 review and acceptance report](docs/phase-8/PHASE-08-REVIEW-REPORT.md)
- [Phase 8 accepted decisions](docs/decisions/0011-phase-8-rag-document-baseline.md)
- [Phase 9 review and acceptance report](docs/phase-9/PHASE-09-REVIEW-REPORT.md)
- [Phase 9 accepted decisions](docs/decisions/0012-phase-9-langgraph-workflow-baseline.md)
- [Phase 10 decision proposal](docs/phase-10/PHASE-10-DECISION-PROPOSAL.md)
- [Phase 10 dependency and tool review](docs/phase-10/PHASE-10-DEPENDENCY-REVIEW.md)
- [Phase 10 Batch 10C container evidence](docs/phase-10/PHASE-10-BATCH-10C-CONTAINER-EVIDENCE.md)
- [Phase 10 single-EC2 demo deployment runbook](docs/phase-10/PHASE-10-SINGLE-EC2-DEMO-DEPLOYMENT-RUNBOOK.md)
- [Phase 10 accepted threat model](docs/security/PHASE-10-THREAT-MODEL.md)
- [Phase 10 accepted decisions](docs/decisions/0013-phase-10-production-readiness-baseline.md)
- [Phase 10 personal-demo exception](docs/decisions/0014-single-ec2-cloudfront-personal-demo.md)
- [Agent instructions](AGENTS.md)

## Technology direction

- Frontend: React, JavaScript, React Router, Redux Toolkit where justified, and a UI system still requiring a decision.
- Main API: Node.js, Express, JavaScript.
- Data: MySQL and Prisma.
- AI service: the Phase 7 Python/FastAPI and Groq boundary, Phase 8 local Qdrant/FastEmbed RAG, and
  Phase 9 fixed LangGraph workflows are implemented for repository/development. Their production
  data/services remain separately gated.
- Phase 6 runtime: MySQL-backed jobs, a separate JavaScript worker, and Socket.IO notification hints.
- Phase 10 retains Docker, GitHub Actions, CloudFormation, and the managed AWS production design
  under ADR 0013. ADR 0014 separately defines the locally verified single-EC2/CloudFront demo pack;
  AWS provisioning still requires explicit approval.

## Local prerequisites

- Node.js 24.19.x LTS and its bundled npm.
- Python 3.13.x for the isolated Phase 7 AI service.
- MySQL Community Server 8.4.x LTS, bound to localhost.
- Databases named `opspilot_dev`, `opspilot_test`, and `opspilot_shadow`.
- A non-root local MySQL user with access only to those databases.

Open a MySQL shell as a local administrator (`mysql -u root -p`) and provision the Phase 1 databases with a unique local password:

```sql
CREATE DATABASE IF NOT EXISTS opspilot_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS opspilot_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS opspilot_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'opspilot_local'@'localhost'
  IDENTIFIED BY 'replace-with-a-unique-local-password';
GRANT ALL PRIVILEGES ON opspilot_dev.* TO 'opspilot_local'@'localhost';
GRANT ALL PRIVILEGES ON opspilot_test.* TO 'opspilot_local'@'localhost';
GRANT ALL PRIVILEGES ON opspilot_shadow.* TO 'opspilot_local'@'localhost';
FLUSH PRIVILEGES;
```

Copy the safe examples and replace their placeholders locally:

- `apps/api/.env.example` → `apps/api/.env`
- `apps/api/.env.test.example` → `apps/api/.env.test`
- `apps/web/.env.example` → `apps/web/.env`
- `apps/ai/.env.example` → `apps/ai/.env` only when configuring the internal AI service

Never commit the resulting `.env` files.

Keep `AUTH_CSRF_COOKIE_NAME` and `VITE_CSRF_COOKIE_NAME` identical. Set `AUTH_COOKIE_SECURE=true` in production; production startup rejects insecure authentication cookies.

`BUSINESS_CURRENCY` controls the single Phase 3 catalog currency and defaults to `INR`. It must be an uppercase three-letter ISO currency code and should not be changed after products exist without a deliberate data migration.

Phase 4 provider variables are listed, without values, in the API example files. Routine local and
automated work keeps `RAZORPAY_ENABLED=false`. Before Test Mode provider smoke, use a freshly
rotated Test Mode key pair plus a separate webhook secret in the ignored `apps/api/.env`, confirm
automatic capture, and configure a public HTTPS webhook endpoint. Follow the
[Phase 4 operations runbook](docs/phase-4/PHASE-04-OPERATIONS-RUNBOOK.md). Never commit or paste
provider secrets into project artifacts.

Phase 5 audit writes require `AUDIT_INTEGRITY_KEY` and `AUDIT_INTEGRITY_KEY_ID` outside routine
tests. The key is a Base64-encoded value containing at least 32 random bytes; the key ID is a
stable, non-secret rotation identifier. Store both only in the ignored API environment or an
approved secret manager. Routine tests use an isolated test-only key when both variables are
absent. See the [audit implementation guide](docs/phase-5/PHASE-05-AUDIT-IMPLEMENTATION-GUIDE.md).

Phase 6 worker and real-time limits are listed in both API environment examples and validated at
startup. Keep API and worker values aligned. The web Socket.IO origin is derived from
`VITE_API_BASE_URL`; no socket token, room, user ID, or separate browser secret is configured.
See the [Phase 6 operations runbook](docs/phase-6/PHASE-06-OPERATIONS-RUNBOOK.md).

Phase 7 variables are listed with disabled/empty defaults in the API and AI examples. Use the same
dedicated Base64 HMAC key and key ID in both ignored service environments. Keep `AI_ENABLED=false`
and `AI_PROVIDER_ENABLED=false` during setup. Development enablement requires confirmed ZDR, the
redacted provider preflight, the metered synthetic evaluation, and explicit authorization;
production additionally requires the retained privacy/account/operations review and approval. The
Groq key belongs only in ignored `apps/ai/.env`; never put it in Node, React, tracked files, logs, or
chat. Follow the
[Phase 7 operations runbook](docs/phase-7/PHASE-07-OPERATIONS-RUNBOOK.md).

If the local database password contains reserved URL characters, URL-encode the password portion in `DATABASE_URL` and `SHADOW_DATABASE_URL`.

The runtime adapter permits MySQL RSA public-key retrieval only for loopback database hosts so local `caching_sha2_password` accounts work reliably after MySQL restarts. Remote database hosts must use a reviewed TLS or pinned-public-key configuration; the application does not enable remote key retrieval implicitly.

## Development commands

From the repository root:

```text
npm install --workspaces --include-workspace-root
npm run db:generate
npm run db:validate
npm run db:deploy
npm run db:status
npm run auth:bootstrap-owner -- --display-name "Business Owner" --email owner@example.com
npm run dev:api
npm run dev:worker --workspace @opspilot/api
npm run dev:web
```

Use separate terminals for the API, worker, and web development processes. The web app uses
`http://127.0.0.1:5173`; the API uses `http://127.0.0.1:4000`; the versioned health endpoint is
`GET /api/v1/health`. The worker shares the API's validated environment and MySQL connection but
runs as an independently supervised process.

The separately supervised AI service is started from `apps/ai` after creating its approved Python
3.13 environment and ignored configuration:

```powershell
$env:PYTHONPATH=(Resolve-Path -LiteralPath .\src).Path
& .\.venv\Scripts\python.exe -m uvicorn opspilot_ai.main:app --host 127.0.0.1 --port 8000
```

`npm run db:deploy` applies committed migrations to a fresh database. Create a development migration with `npm run db:migrate -- --name meaningful_name` only after the owning phase's schema and business rules are approved.

Quality gates:

```text
npm run lint
npm run format:check
npm test
npm run test:coverage
npm run build
npm run phase6:performance:profile --workspace @opspilot/api
```

Phase 7 Python lint, format, coverage, cross-service, preflight, and evaluation commands are in
`apps/ai/README.md`. Routine tests and the cross-service smoke use deterministic providers and do
not contact Groq.

The owner bootstrap prompts for the password and confirmation without accepting the password in command-line arguments or environment variables. Run it only after migrations and only once.

## Current phase

Phase 10 is in progress. The ADR 0014 single-EC2 CloudFront personal demo is deployed. ADR 0017's
AI-enabled update is repository-ready and locally verified but still requires an exact clean
commit/release deployment. The broader ADR 0013 production release remains blocked by its recorded
zero-residual findings and strict origin-TLS requirements. Earlier accepted phase status is
unchanged; Phase 4 remains repository-complete but unaccepted because its external Razorpay Test
Mode smoke is deferred. See the
[single-EC2 demo deployment runbook](docs/phase-10/PHASE-10-SINGLE-EC2-DEMO-DEPLOYMENT-RUNBOOK.md)
and [WORK-PROGRESS.md](docs/WORK-PROGRESS.md).

## Scope discipline

Phase 5 stayed within ADR 0007 and is committed as `10e73ac`. Phase 6 stayed within ADR 0008's
approved job/outbox, worker, notification, real-time hint, owner tooling, and verification baseline.
Phase 7 implementation is limited to ADRs 0009 and 0010. Live payments, unresolved Phase 4 provider/go-live
gates, attachments, exports, Redis, BullMQ, external brokers/channels, hosted observability,
multi-instance/general production deployment, and every AI capability outside ADR 0017's
fictional-data single-host demo exception remain outside scope.
