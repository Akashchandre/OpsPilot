# ADR 0013 — Phase 10 Production Readiness Baseline

## Status

Accepted on 2026-09-07 by the user's explicit `approved` response to the Phase 10 approval
request. That request covered the complete production-readiness decision proposal and production
threat model, including the user's prior clarification that OpsPilot is a personal project and the
deployed demo may use Razorpay Test Mode only.

This acceptance authorizes Phase 10 repository implementation within the controls below. It does
not authorize installing a new dependency or tool, creating or changing a cloud/provider resource,
using real customer or regulated data, enabling production AI/document/workflow processing,
enabling Razorpay Live Mode, accepting real payments, or deploying a release. Each of those actions
keeps its documented separate gate.

On 2026-09-07 the user supplied the initial deployment profile: public access, an existing AWS
account, no custom domain, Free Tier/credit-constrained spending, demo-only traffic, email alerts,
and a public repository on GitHub Free. The exact non-Mumbai AWS region and the account's current
Free Plan/credit eligibility, balance, and expiry remain unresolved rather than inferred. The
alert address is configured outside the repository during the later SNS subscription step.

On 2026-09-09 the owner clarified the exact region as `us-east-1` and reported that the account is
on the AWS Free Plan with USD 160 of credit and 67 days remaining, with MFA and billing alerts
enabled. These are owner-supplied operational facts, not independently verified AWS account
evidence. The separately authorized proposal-only CI/CD and infrastructure review did not change
this ADR or authorize implementation. It found that the existing critical/high findings, the
finite credit window, and strict CloudFront-to-ALB TLS with no owned domain must be resolved before
release or provisioning. See `docs/phase-10/PHASE-10-CI-CD-AWS-INFRASTRUCTURE-PROPOSAL.md`.

## Context

Phases 1–9 provide a verified local repository/development platform, but Phase 10 began without
container packaging, CI/CD, infrastructure as code, browser E2E coverage, hosted observability, or
an approved production data topology. Local Phase 8 document/vector storage and Phase 9 SQLite
checkpoints intentionally fail closed in production. Process-local rate, replay, socket, and job
controls also constrain safe horizontal scaling.

The accepted baseline and required controls are recorded in:

- `docs/phase-10/PHASE-10-DECISION-PROPOSAL.md`
- `docs/security/PHASE-10-THREAT-MODEL.md`
- `docs/phases/PHASE-10-PRODUCTION.md`

## Decision

- Treat the initial deployed target as a public personal production-configured demo, not a
  commercial or highly available service. Use synthetic/non-sensitive, wipeable demo data unless
  a later data policy is explicitly accepted. The UI must tell visitors to use fictional data.
- Permit Razorpay Test Mode for simulated payments only. Every deployed web experience and
  operations/release record must say `TEST MODE — NO REAL MONEY`; the API continues to reject Live
  Mode key identifiers. Live Mode and real payment acceptance require a new decision.
- Use the accepted five-gate delivery sequence: baseline acceptance, repository packaging/PR CI,
  isolated staging proof, release-blocker closure, and separate approval of an exact immutable
  release digest.
- Use AWS as the design target with private application/data planes, the generated CloudFront HTTPS
  domain as the public edge, private S3 web hosting, ALB to ECS Fargate, ECR, RDS MySQL, Secrets
  Manager/KMS, CloudWatch, and GitHub Actions OIDC. Do not provision this topology until the exact
  region and account-plan/credit state are resolved and the exact change is reviewed.
- Authorize no paid AWS spend. The accepted ECS/Fargate, ALB, and RDS design is usage-priced and can
  consume Free Tier credits; it is not assumed to be perpetually free. If the account is not on an
  eligible Free Plan or lacks sufficient unexpired credits, stop and revise the topology or obtain
  a separate budget decision. Prefer ephemeral staging and mandatory teardown over two always-on
  stacks.
- Preserve the existing loopback trust boundary by colocating the Node API, Node worker, and
  FastAPI sidecar in one task for the initial single-task profile. Do not claim high availability;
  require shared coordination and multi-instance security work before horizontal scaling.
- Keep AI, document retrieval, and LangGraph workflows disabled at the initial deployed-demo gate.
  Evaluate Qdrant Managed Cloud and an official AWS DynamoDB LangGraph checkpointer, with the
  documented PostgreSQL fallback, only under separate dependency/account/privacy/cost review.
- Apply least-privilege, non-root/read-only container, immutable artifact, provenance, protected
  environment, secret rotation, migration, backup/restore, rollback, observability, incident, load,
  accessibility, security, and full-regression gates from the accepted proposal and threat model.
- Keep the proposal's 25-concurrent-user/5-request-per-second personal-demo profile as a bounded
  verification target, not a demand forecast or availability promise. Use the preliminary recovery
  and service targets as test baselines while avoiding unnecessary paid cloud load generation.
- Make the project owner the initial release approver and incident owner. Use email for operational
  and billing alerts; delivery and subscription confirmation must be verified before release.
- Use the public GitHub repository on the Free plan with repository rulesets, required checks, and
  protected staging/demo environments where supported. Do not store long-lived AWS credentials.

## Dependency and external-service gate

This ADR approves the need and boundaries for Phase 10 tooling, but not an installation. Before
adding any package, action, image, scanner, browser binary, infrastructure module, checkpointer, or
hosted service, record its exact version or immutable digest, purpose, account/secret needs,
compatibility, license/advisory result, maintenance burden, and rejected alternative, then obtain
separate explicit user instruction.

Repository work that uses only already-pinned dependencies may proceed now. Cloud resource changes
and deployment remain independently gated even after tooling is approved.

## Considered alternatives

- Treating Test Mode as real production payments was rejected because it creates false payment and
  commercial claims even for a personal project.
- Launching every AI capability on day one was rejected because hosted storage, vector,
  checkpoint, privacy, retention, backup, monitoring, and provider gates are not yet closed.
- A public database, public internal AI service, self-hosted single-node production Qdrant, mutable
  image/action tags, long-lived GitHub cloud keys, and unprotected push-to-production flow were
  rejected by the threat model.
- Multi-instance or multi-AZ operation is retained as an upgrade path, not implied by the initial
  cost-aware personal-demo profile.

## Consequences and follow-up

Phase 10 implementation can begin with dependency-free repository changes and an exact tooling
review. Container, CI, infrastructure, staging, recovery, security, performance, and release
evidence must be added incrementally without weakening completed phases.

No deployed release may be called Phase 10 complete until all acceptance criteria pass, every
critical/high finding is resolved or explicitly accepted, restore/rollback/incident/kill-switch
exercises succeed, missing owner inputs are resolved, and the user separately approves the exact
release digest.

## Related decisions

- `docs/decisions/0012-phase-9-langgraph-workflow-baseline.md`
- `docs/decisions/0011-phase-8-rag-document-baseline.md`
- `docs/decisions/0010-phase-7-groq-provider.md`
- `docs/decisions/0006-phase-4-provider-smoke-deferral.md`
