# ADR 0002 — Prisma Generated Code Boundary

## Status

Accepted for Phase 1 on 2026-08-24; revisit before a Prisma major upgrade.

## Context

OpsPilot requires JavaScript for the authored frontend and backend. Prisma 7's supported default generator emits TypeScript source into a configured output directory and requires a driver adapter for direct MySQL connections.

Using the deprecated `prisma-client-js` generator would preserve JavaScript output but creates immediate maintenance debt. Pinning an older Prisma major would also move the project away from the supported current toolchain.

## Decision

- Use Prisma 7's current `prisma-client` generator and MySQL/MariaDB driver adapter.
- Treat generated TypeScript as an ignored, reproducible tool artifact rather than authored application source.
- Keep all maintained frontend/backend files in JavaScript.
- Use `prisma.config.js`; do not author TypeScript configuration or application modules.
- Generate the client during setup/build workflows and never manually modify or commit it.

## Consequences

The application retains its JavaScript-first rule while using Prisma's supported generator. `tsx` is a tooling/runtime bridge for generated output only and is not permission to migrate application code to TypeScript. The boundary must be reviewed if Prisma changes generator/runtime requirements.

