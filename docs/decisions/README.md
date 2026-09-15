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
- `0007-phase-5-production-backend-baseline.md` — accepted Phase 5 support, reporting, audit, hardening, permission, dependency, retention, and implementation baseline.
- `0008-phase-6-realtime-jobs-baseline.md` — accepted Phase 6 MySQL job/outbox, worker, persistent notification, Socket.IO hint, permission, dependency, recovery, and test baseline.
- `0009-phase-7-ai-foundation-baseline.md` — accepted Phase 7 isolated FastAPI, signed internal contract, stateless assistant, consent, metadata-only usage/cost, permission, dependency, and evaluation baseline; its xAI-specific portions are superseded by ADR 0010.
- `0010-phase-7-groq-provider.md` — accepted the Phase 7 Groq Chat Completions provider migration, fixed GPT-OSS model, ZDR attestation, versioned consent, exact token-price accounting, and historical-data-preserving schema migration.
- `0011-phase-8-rag-document-baseline.md` — accepted the Phase 8 secure document lifecycle, local FastEmbed/Qdrant retrieval, Node reauthorization, separate document consent, citation, deletion, and evaluation baseline.
- `0012-phase-9-langgraph-workflow-baseline.md` — accepted the Phase 9 bounded LangGraph workflows, Node-owned tools and encrypted artifacts, local metadata-only checkpoints, mandatory support approval, exact dependency pins, recovery, and evaluation baseline.
- `0013-phase-10-production-readiness-baseline.md` — accepted the Phase 10 personal-project production-readiness, AWS delivery, staged rollout, fictional-data, Test Mode, security, and explicit-gate baseline.
- `0014-single-ec2-cloudfront-personal-demo.md` — accepted the separate single-EC2 CloudFront personal-demo pack and narrow HTTP origin-hop exception.
- `0015-static-catalog-imagery-and-public-labelling.md` — accepted bundled static catalog photography, safe SKU-based presentation, removal of visible demo naming, and the shortened persistent Test Mode/fictional-data label.
- `0016-application-shell-and-action-feedback.md` — accepted the responsive application-shell refinement, grouped navigation, reusable notices, and centralized accessible Toastify mutation feedback.
- `0017-single-ec2-demo-production-ai-exception.md` — accepted all implemented AI capabilities on
  the fictional-data single-EC2 demo using explicitly guarded local encrypted document, Qdrant,
  and checkpoint persistence, with narrow time-bounded risk acceptance.
