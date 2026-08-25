# ADR 0001 — Phase 1 Toolchain

## Status

Accepted on 2026-08-24.

## Context

Phase 1 needs a reproducible JavaScript frontend/backend foundation without adding future-phase technologies. The repository also needs one consistent dependency and quality workflow.

## Decision

- Use npm workspaces with `apps/web` and `apps/api` and one root `package-lock.json`.
- Target Node.js 24.19.x LTS and use ECMAScript modules.
- Use React 19 with Vite 8 for the JavaScript web application.
- Use Express 5 for the JavaScript API.
- Use Prisma 7 with MySQL 8.4 LTS.
- Use plain CSS in Phase 1; defer the product UI-system choice.
- Use native `fetch`, ESLint, Prettier, Vitest, React Testing Library, and Supertest.
- Run the web and API development processes in separate terminals to avoid an unnecessary process-runner dependency.

## Consequences

The foundation stays small and cross-platform, dependency versions are locked, and frontend/backend responsibilities remain separate. React Router, Redux Toolkit, a UI framework, Docker, Redis, queues, payments, and AI remain uninstalled.

