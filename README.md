# OpsPilot — AI Business Operations Platform

OpsPilot is a planned full-stack business operations SaaS platform for customers and business operators. It will combine commerce and operational workflows with customer and owner AI assistants introduced in later phases.

Phases 1–3 are accepted. **Phase 4 — Orders and Payments** is repository-complete, but explicit
acceptance remains pending because the external Razorpay Test Mode delivery/recovery smoke is
deferred. **Phase 5 — Production Backend Features** is repository-complete and verified under ADR
0007, including support workflows and UI, authoritative overview reporting, HMAC-chained audit
evidence, structured logging, request/rate hardening, representative performance evidence, and a
sanitized backup/restore exercise. Phase 6 decision definition is next; no real-time or job
technology is pre-approved.

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
- [Agent instructions](AGENTS.md)

## Technology direction

- Frontend: React, JavaScript, React Router, Redux Toolkit where justified, and a UI system still requiring a decision.
- Main API: Node.js, Express, JavaScript.
- Data: MySQL and Prisma.
- AI service (later phases only): Python, FastAPI, LangChain, LangGraph, RAG, and a vector database selected when required.
- Future infrastructure only when its phase requires it: Redis, queues, Socket.IO/WebSockets, object storage, Docker, GitHub Actions, and AWS.

## Local prerequisites

- Node.js 24.19.x LTS and its bundled npm.
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
npm run dev:web
```

Use separate terminals for the API and web development processes. The web app uses `http://127.0.0.1:5173`; the API uses `http://127.0.0.1:4000`; the versioned health endpoint is `GET /api/v1/health`.

`npm run db:deploy` applies committed migrations to a fresh database. Create a development migration with `npm run db:migrate -- --name meaningful_name` only after the owning phase's schema and business rules are approved.

Quality gates:

```text
npm run lint
npm run format:check
npm test
npm run test:coverage
npm run build
```

The owner bootstrap prompts for the password and confirmation without accepting the password in command-line arguments or environment variables. Run it only after migrations and only once.

## Current phase

Phase 5 — Production Backend Features is **repository-complete and verified** as of 2026-08-28.
Phase 4 remains repository-complete but unaccepted because external Razorpay Test Mode smoke is
deferred. Phase 6 may now begin at decision definition, with its architecture and dependencies
still requiring explicit approval. See the
[Phase 5 specification](docs/phases/PHASE-05-PRODUCTION-BACKEND.md),
[Phase 5 decision proposal](docs/phase-5/PHASE-05-DECISION-PROPOSAL.md),
[Phase 5 acceptance report](docs/phase-5/PHASE-05-ACCEPTANCE-REPORT.md), and
[WORK-PROGRESS.md](docs/WORK-PROGRESS.md).

## Scope discipline

Phase 5 stayed within the accepted support, overview reporting, audit, logging, rate, performance,
and recovery baseline in ADR 0007. Live payments, unresolved Phase 4 provider/go-live gates,
attachments, exports, real-time infrastructure, background jobs, hosted observability, and AI were
not introduced. Phase 6 must make and record its own infrastructure, authorization, delivery,
failure/recovery, and testing decisions before implementation.
