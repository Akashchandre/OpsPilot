# OpsPilot — AI Business Operations Platform

OpsPilot is a planned full-stack business operations SaaS platform for customers and business operators. It will combine commerce and operational workflows with customer and owner AI assistants introduced in later phases.

The repository has implemented **Phase 1 — Foundation** and is ready for review. The JavaScript web/API workspaces, quality tooling, local MySQL/Prisma foundation, and live health path are verified. Phase 2 must not begin until Phase 1 is explicitly accepted.

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

If the local database password contains reserved URL characters, URL-encode the password portion in `DATABASE_URL` and `SHADOW_DATABASE_URL`.

## Development commands

From the repository root:

```text
npm install --workspaces --include-workspace-root
npm run db:generate
npm run db:validate
npm run db:deploy
npm run db:status
npm run dev:api
npm run dev:web
```

Use separate terminals for the API and web development processes. The web app uses `http://127.0.0.1:5173`; the API uses `http://127.0.0.1:4000`; the versioned health endpoint is `GET /api/v1/health`.

`npm run db:deploy` applies committed migrations to a fresh database. After a future phase explicitly approves schema changes, create a development migration with `npm run db:migrate -- --name meaningful_name`; do not add future business models during Phase 1.

Quality gates:

```text
npm run lint
npm run format:check
npm test
npm run test:coverage
npm run build
```

## Current phase

Phase 1 — Foundation is **ready for review**. See [PHASE-01-FOUNDATION.md](docs/phases/PHASE-01-FOUNDATION.md) and [WORK-PROGRESS.md](docs/WORK-PROGRESS.md).

## Scope discipline

Do not implement authentication, commerce features, payments, real-time infrastructure, background jobs, or AI during Phase 1. Future capabilities are documented to support planning; documentation does not authorize early implementation.
