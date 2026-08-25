# OpsPilot — AI Business Operations Platform

OpsPilot is a planned full-stack business operations SaaS platform for customers and business operators. It will combine commerce and operational workflows with customer and owner AI assistants introduced in later phases.

The repository has completed and accepted **Phase 2 — Authentication and RBAC**. **Phase 3 — Business Core** is now in requirements/design review. Catalog and inventory implementation will begin after the proposed business rules are approved.

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
- [Phase 3 decision proposal](docs/phase-3/PHASE-03-DECISION-PROPOSAL.md)
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

If the local database password contains reserved URL characters, URL-encode the password portion in `DATABASE_URL` and `SHADOW_DATABASE_URL`.

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

Phase 2 — Authentication and RBAC is **accepted**. Phase 3 — Business Core is **in progress: requirements/design review**. See [PHASE-03-BUSINESS-CORE.md](docs/phases/PHASE-03-BUSINESS-CORE.md), the [Phase 3 decision proposal](docs/phase-3/PHASE-03-DECISION-PROPOSAL.md), and [WORK-PROGRESS.md](docs/WORK-PROGRESS.md).

## Scope discipline

Phase 3 may implement only the approved catalog, category, inventory, and user-administration scope. Orders, payments, real-time infrastructure, background jobs, and AI remain unauthorized. A proposed Phase 3 design is not authorization to create schema or APIs until its decisions are approved.
