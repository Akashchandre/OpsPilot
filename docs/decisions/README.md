# Architectural Decision Records

Store durable architectural decisions in this directory when they are made.

Suggested filename: `NNNN-short-decision-title.md`.

Each record should include:

- Status: proposed, accepted, superseded, or rejected.
- Date and decision owners.
- Context and constraints.
- Considered options.
- Decision and rationale.
- Consequences, risks, and follow-up work.
- Links to superseded or related decisions.

Do not create a decision record merely to disguise an unresolved choice. Until reviewed, mark the item **Decision Required** in the relevant specification.

## Current records

- `0001-phase-1-toolchain.md` — accepted Phase 1 toolchain and topology.
- `0002-prisma-generated-code-boundary.md` — accepted generated-code boundary.
- `0003-phase-2-authentication-rbac.md` — accepted Phase 2 identity, session, and authorization baseline.

Phase 3 currently has a decision proposal rather than an ADR. Create ADR 0004 only after the Phase 3 business rules are reviewed and accepted.
