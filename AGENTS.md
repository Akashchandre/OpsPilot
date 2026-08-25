# OpsPilot Agent Instructions

This file governs all future Codex work in this repository.

## Required reading order

Before modifying anything:

1. Read this file completely.
2. Read `docs/00-PROJECT-OVERVIEW.md`.
3. Read `docs/01-PROJECT-RULES.md`.
4. Read `docs/WORK-PROGRESS.md`.
5. Read the document for the current phase named in `WORK-PROGRESS.md`.
6. Inspect the existing implementation, configuration, tests, and pending changes relevant to the task.

If these sources conflict, stop and document the conflict. Do not silently choose a different scope or architecture.

## Working model

- **SOL:** planning, architecture, requirements, technical decisions, code review, phase review, and risk analysis.
- **Terra:** implementation, coding, refactoring, testing, and bug fixing.
- Keep planning and implementation responsibilities distinct unless the user explicitly requests otherwise.

## Change rules

- Work only within the current phase unless the user explicitly authorizes a later phase.
- Do not begin future phases merely because their design is documented.
- Understand existing behavior before modifying it.
- Do not unnecessarily modify completed phases or destabilize accepted work.
- Do not introduce a technology, service, dependency, account, or infrastructure component without a current-phase need and documented justification.
- Follow the JavaScript-first boundary: React and Node.js/Express remain JavaScript; Python is reserved for the later AI service.
- Do not install dependencies automatically. First document what is needed, why, required accounts, connections, and environment variables; obtain explicit instruction before installation.
- Preserve separation of concerns, API versioning, validation, centralized errors, authorization, relational integrity, and transaction safety described in the project rules.
- Never hardcode secrets or expose sensitive information in source, logs, responses, fixtures, or documentation.

## Quality and documentation

- Run tests, linting, and other checks relevant to every implementation change.
- Add or update tests for changed behavior, including important success, failure, authentication, authorization, and business-rule paths.
- Update affected documentation after meaningful work.
- Update `docs/WORK-PROGRESS.md` after milestones, scope changes, important decisions, blockers, or phase completion.
- Record durable architectural decisions in `docs/decisions/`.
- Do not label a phase complete until its acceptance criteria, testing requirements, security checks, documentation updates, and Definition of Done are satisfied.

## Required handoff report

At the end of meaningful work, report:

1. Changed files.
2. Tests and checks run, including failures or checks not run.
3. Decisions made and their rationale.
4. Issues, risks, assumptions, and unresolved decisions.
5. Current status and the next recommended task.

