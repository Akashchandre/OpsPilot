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
- `0004-phase-3-business-core.md` — accepted Phase 3 catalog, money, lifecycle, inventory, permission, and scope baseline.
- `0005-phase-4-orders-payments.md` — accepted Phase 4 cart, order, inventory reservation, Razorpay Test Mode, refund, reconciliation, permission, and scope baseline.
- `0006-phase-4-provider-smoke-deferral.md` — accepted deferral of the unresolved external Razorpay Test Mode smoke and authorization to begin Phase 5 decision-definition work without accepting Phase 4 or live payments.
