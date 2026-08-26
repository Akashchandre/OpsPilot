# OpsPilot — AI Business Operations Platform

OpsPilot is a planned full-stack business operations SaaS platform for customers and business operators. It will combine commerce and operational workflows with customer and owner AI assistants introduced in later phases.

The repository has completed and accepted **Phase 3 — Business Core**. The public catalog, protected catalog management, and concurrency-safe inventory workflows are available locally. Phase 4 has not started.

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

Phase 3 — Business Core is **accepted** as of 2026-08-26. Phase 4 — Orders and Payments has not started and requires a separate requirements/decision review before implementation. See [PHASE-03-BUSINESS-CORE.md](docs/phases/PHASE-03-BUSINESS-CORE.md), the [Phase 3 implementation guide](docs/phase-3/PHASE-03-IMPLEMENTATION-GUIDE.md), and [WORK-PROGRESS.md](docs/WORK-PROGRESS.md).

## Scope discipline

Phase 3 is limited to the approved product, category, aggregate inventory, and existing Phase 2 user-administration scope. Orders, payments, carts, variants, images/uploads, multiple warehouses, reservations, real-time infrastructure, background jobs, and AI remain unauthorized.
