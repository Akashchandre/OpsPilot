# Phase 1 — Foundation

## Status

**ACCEPTED.** Implementation began after explicit approval on 2026-08-24 and was reviewed and explicitly accepted before Phase 2 began.

## Objective

Create the smallest reliable JavaScript frontend/backend and MySQL/Prisma foundation, prove basic browser-to-API communication, and establish development and testing conventions without implementing business features.

## Requirements and goals

- Establish an understandable repository structure for the React frontend and Node.js/Express backend.
- Initialize only approved Phase 1 packages after explicit review; do not install automatically.
- Configure JavaScript, scripts, lint/format tooling, and environment validation.
- Configure MySQL connectivity and Prisma with an initial migration strategy.
- Create an Express application with `/api/v1`, a health-check endpoint, not-found handling, and centralized errors.
- Create a minimal React application that can display API health/connection state.
- Establish initial unit/integration testing appropriate to the chosen toolchain.
- Provide safe environment examples and local setup/run/test documentation.

## Decisions required before implementation

- Monorepo/package layout, package manager, Node.js version, module system, React build tool, ports, and scripts.
- Material UI versus Tailwind CSS; the health UI does not justify installing both.
- Validation, test, lint, formatter, and backend request-test libraries.
- Local MySQL provisioning and database naming/credential conventions.
- Final success/error envelope and health semantics (liveness, readiness, database dependency).
- Browser/API development origin and CORS policy.

## Accepted implementation decisions

- npm workspaces with `apps/web` and `apps/api` and one root lockfile.
- Node.js 24.19.x LTS target and npm package manager.
- ECMAScript modules with authored application code remaining JavaScript.
- React with Vite; development web origin `http://127.0.0.1:5173`.
- Express on `127.0.0.1:4000` with API prefix `/api/v1`.
- Plain CSS for the Phase 1 status page; neither Material UI nor Tailwind is installed.
- Native browser `fetch`; no extra HTTP client.
- ESLint 10, Prettier 3, Vitest 4, React Testing Library, and Supertest.
- A consistent `{ success, data }` or `{ success, error, requestId }` response envelope.
- `GET /api/v1/health` is a readiness check and returns `503` when MySQL is unreachable.
- Prisma 7 generated TypeScript is an ignored tool artifact only; all authored frontend/backend source remains JavaScript. See ADR 0002.

## Current implementation status

- Repository and npm workspace: complete.
- JavaScript React/Vite status UI: complete and tested.
- Layered Express API, health endpoint, request IDs, CORS, security headers, not-found and centralized errors: complete and tested with injected database behavior.
- Environment validation and safe examples: complete and tested.
- Prisma schema, configuration, generation, validation, and zero-table foundation migration: complete; no future models added.
- MySQL 8.4 service installation: complete.
- Local development, test, and shadow databases plus a project-only application user: complete.
- Live frontend, CORS, API, Prisma migration, and API-to-MySQL smoke checks: complete.
- Node.js 24 system replacement: pending a restart/maintenance window; verification currently uses the official portable Node 24.19 runtime because active Node processes prevent MSI replacement.

## Tasks

1. Review and record the required decisions and proposed dependency list; obtain approval before installation.
2. Create frontend and backend folder boundaries and root developer scripts only as justified.
3. Initialize React in JavaScript with a minimal accessible status page—no product UI or feature routes.
4. Initialize Express with configuration loading/validation, JSON limits, CORS for the known development origin, API router, 404 handling, and centralized errors.
5. Add `/api/v1/health` with a stable, minimal response and agreed status behavior.
6. Configure Prisma/MySQL, safe `.env.example`, migration workflow, and an initial schema only to the extent required to prove setup; do not create future entities prematurely.
7. Connect the frontend status page to the health endpoint with loading, success, and failure states.
8. Add focused tests for health, 404, errors/configuration where practical, and the frontend connection state.
9. Document prerequisites, environment variables, database setup, scripts, structure, and troubleshooting.
10. Update `WORK-PROGRESS.md` at milestones and phase review.

## Acceptance criteria

- A fresh approved setup can install dependencies and run frontend/backend using documented commands.
- The API starts only with valid required configuration and provides a versioned health endpoint.
- Unknown API routes produce the documented safe error response.
- The React app reports health loading, success, and unavailable states without crashing.
- Prisma can connect to the approved local MySQL database and the documented migration workflow succeeds.
- No real secrets are committed and `.env.example` contains safe placeholders.
- Relevant automated checks pass and documentation matches actual behavior.
- No authentication, business, payment, real-time, job, or AI functionality exists.

## Testing requirements

- Backend integration test: health endpoint method, status, content type, and shape.
- Backend integration test: unknown route and centralized error response.
- Configuration tests: required values are validated without exposing secrets.
- Frontend tests: loading, healthy response, and network/server failure state.
- Manual smoke test: clean start, frontend loads, API call succeeds, and database connectivity follows documented health semantics.

## Edge cases

- Missing/invalid environment values or occupied ports.
- MySQL unavailable or credentials/database invalid.
- API unavailable, slow, or returning malformed/non-JSON output.
- CORS origin mismatch.
- Repeated start/stop and migrations on a clean database.
- Development error detail accidentally appearing in production mode.

## Security considerations

- Keep secrets out of Git, client bundles, logs, health output, and errors.
- Restrict CORS rather than using an unreviewed wildcard.
- Apply body-size limits and safe headers as justified.
- Expose no database credentials, stack traces, internal hostnames, or dependency versions through health/error responses.
- Ensure test data and configuration are isolated from non-test environments.

## Explicit exclusions

Do not implement authentication/RBAC, users, products, categories, inventory business logic, carts, orders, payments, support, reports, notifications, Redis, queues, workers, Socket.IO/WebSockets, object storage, Docker, CI/CD, AWS, Python, FastAPI, LLM providers, LangChain, LangGraph, RAG, or vector databases.

## Documentation updates

Update `README.md`, architecture details that changed, project rules/tool decisions, this phase status, `WORK-PROGRESS.md`, `.env.example`, and a decision record for any durable choice.

## Definition of Done

Every acceptance criterion and required test passes; setup is repeatable from documentation; configuration/security review finds no secret leakage; exclusions remain absent; changes are reviewed; and the user explicitly accepts Phase 1 before Phase 2 begins.
