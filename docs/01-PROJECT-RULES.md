# Project Rules

These rules apply throughout OpsPilot unless a recorded architectural decision explicitly supersedes them.

## Language and service boundaries

- Use JavaScript for the React frontend and Node.js/Express backend.
- Do not migrate the main application to TypeScript.
- Reserve Python for the separate AI service introduced in Phase 7 or later.
- Keep the Node.js API as the public application boundary; do not expose internal AI or infrastructure services directly to browsers.

## Coding conventions

- Prefer small modules with one clear responsibility.
- Use descriptive names and consistent formatting enforced by agreed tooling.
- Avoid duplicated business rules; centralize them in services/domain logic rather than controllers or UI components.
- Use asynchronous code consistently and handle rejected operations explicitly.
- Do not commit commented-out code, secrets, generated clutter, or unrelated changes.
- Formatting, linting, ECMAScript modules, and Node.js 24.19.x are accepted in ADR 0001.

## Folder boundaries

The accepted Phase 1 scaffold uses npm workspaces under `apps/web` and `apps/api` and keeps these responsibilities clear:

- Frontend pages/routes, reusable UI components, feature logic, API client, state, and tests.
- Backend routes, controllers, services, repositories/data access where useful, middleware, validation, configuration, errors, and tests.
- Shared contracts must not create unsafe coupling between the JavaScript application and future Python service.
- Infrastructure and AI folders are added only in the phase that needs them.

## API standards

- Prefix public application endpoints with `/api/v1`.
- Use resource-oriented URLs and appropriate HTTP methods and status codes.
- Keep route handlers thin: route → middleware → controller → service → data access.
- Validate path, query, header, and body input at the API boundary.
- Return a consistent JSON response and error structure finalized before Phase 1 implementation.
- Support pagination for unbounded collections and define maximum page sizes.
- Never leak stack traces, SQL details, secrets, internal service messages, or unauthorized resource existence.
- Document contract changes and introduce breaking changes through deliberate versioning.
- Idempotency behavior for order creation, payments, and retried jobs is a **Decision Required** before those features are built.

## Database standards

- Use MySQL and Prisma with version-controlled migrations.
- Use relational constraints, foreign keys, unique constraints, and indexes to preserve correctness and query performance.
- Use transactions for multi-write operations such as inventory reservation, checkout, payment state transitions, and related audit changes.
- Use fixed-precision decimal values for money; never floating-point arithmetic.
- Store timestamps consistently in UTC and convert for presentation.
- Avoid premature denormalization; justify and measure it when introduced.
- Prevent race conditions using database constraints, transactions, and appropriate concurrency controls.
- Define deletion/retention behavior deliberately; do not assume hard or soft deletion.
- Seed only safe development/test data and keep production data out of the repository.

## Security standards

- Keep secrets in environment variables or an approved secret manager; commit only safe examples.
- Hash passwords with a current, reviewed password-hashing algorithm and safe parameters.
- Authenticate every protected request and authorize every protected resource/action server-side.
- Apply deny-by-default RBAC and ownership checks. UI hiding is not authorization.
- Validate and normalize untrusted input and use Prisma safely; avoid raw queries unless reviewed and parameterized.
- Configure CORS to known origins per environment.
- Apply security headers, safe cookie/token settings, request-size limits, and rate limiting where risks justify them.
- Avoid sensitive values in URLs, logs, analytics, errors, and AI prompts.
- Protect uploads by file type, size, malware policy, storage isolation, and authorization when document features begin.
- Threat-model authentication, payments, uploads, cross-tenant access, AI tools, and administrative workflows before implementation.
- Phase 2 uses database-backed opaque cookie sessions, exact-origin checks, and session-bound CSRF tokens per ADR 0003.

## Frontend standards

- Build accessible, responsive, reusable UI elements.
- Represent loading, empty, success, validation, authorization, and failure states.
- Centralize API communication and normalize server errors for the UI.
- Keep local state local; introduce Redux Toolkit only for state that is genuinely shared or operationally complex.
- Enforce protected navigation for usability while relying on API authorization for security.
- Avoid embedding business-critical rules only in the client.

## Error handling

- Use centralized Express error handling.
- Classify operational errors and map them predictably to HTTP responses.
- Assign a stable machine-readable error code and a safe human-readable message.
- Attach request/correlation identifiers to server logs and safe error responses when logging is established.
- Treat unexpected errors as internal failures and retain diagnostic context only in protected logs.
- Define retry behavior only for operations proven safe or made idempotent.

## Logging and observability

- Use structured logs when logging is introduced; do not rely on scattered console output in production.
- Include timestamps, severity, service, environment, and correlation identifiers.
- Redact credentials, tokens, cookies, personal data, payment data, document content, and prompts as required.
- Separate operational logs from durable audit events.
- Monitoring, metrics, tracing, log platform, retention, and alert thresholds are a **Decision Required** in the appropriate production phase.

## Environment variables

- Access environment variables through validated configuration modules.
- Fail fast when required configuration is missing or invalid.
- Maintain a `.env.example` with names and safe explanations only—never real secrets.
- Distinguish development, test, staging, and production configuration.
- Document ownership, purpose, required/optional status, and rotation expectations for each variable.

## Testing standards

- Use unit tests for isolated business logic and utilities.
- Use integration/API tests for routing, validation, persistence, authentication, authorization, and transactional behavior.
- Use E2E tests for critical user journeys where appropriate.
- Cover success, validation, not-found, conflict, failure, authentication, authorization, and important edge cases.
- Keep tests deterministic and independent; do not call real payment or AI providers in routine automated tests.
- Every phase defines its minimum test gate. Fix or explicitly report failures before handoff.
- Vitest is the accepted unit/integration framework. The accepted Phase 2 global minimums of 80% statements, 65% branches, 80% functions, and 80% lines remain the baseline for Phase 3 API and web coverage runs.

## Git standards

- Use meaningful, focused commits and feature branches.
- Avoid unrelated edits and keep accepted phases stable.
- Never commit secrets, local environment files, database dumps, large uploads, or generated dependencies.
- Review migrations and lockfile changes like source code.
- Repository hosting, branch naming, protected branch rules, and merge strategy are a **Decision Required**.

## Documentation standards

- Treat `docs/` as the implementation source of truth.
- Update contracts, architecture, schema design, phase status, and run instructions when behavior changes.
- Record significant durable decisions and alternatives in `docs/decisions/`.
- Mark unresolved points exactly as **Decision Required** and resolve them through review, not guesswork.
- Update `WORK-PROGRESS.md` after milestones and before phase handoff.

## Dependency and phased-installation rules

- Add a dependency only for a demonstrated current-phase requirement.
- Before installation, identify the package/service, reason, version policy, required account, connection steps, environment variables, operational burden, and alternatives.
- Do not automatically execute installation commands.
- Do not install Redis, Socket.IO, queues, payment providers, AWS tooling, Docker, LangChain, LangGraph, vector databases, or LLM SDKs before their approved phase.
- Remove unused dependencies rather than keeping speculative tooling.

## AI-specific rules

- AI begins no earlier than Phase 7; RAG begins no earlier than Phase 8; LangGraph business/support workflows begin no earlier than Phase 9.
- Keep authorization and business-rule enforcement outside model discretion.
- Use allowlisted, typed tools with least privilege and explicit user/business scope.
- Treat prompts, retrieved documents, tool output, and model output as untrusted data.
- Defend against prompt injection, data exfiltration, cross-user/tenant retrieval, unsafe actions, and hallucinated claims.
- Require citations/provenance for document-grounded answers where the product contract requires them.
- Do not give an LLM direct unrestricted database or production infrastructure access.
- Define retention, consent, provider data usage, human approval, fallback, evaluation, cost, and audit policies before production AI use. These are **Decision Required**.
