# Phase 5 — Production Backend Features

## Status

**REPOSITORY IMPLEMENTATION COMPLETE AND VERIFIED as of 2026-08-28.** ADR 0007's support,
reporting, audit, hardening, permission, dependency, retention, performance, recovery, and test
baseline is implemented. `docs/phase-5/PHASE-05-ACCEPTANCE-REPORT.md` records the passing gate and
retained production blockers.

## Objective

Harden the backend and add agreed support, reporting/analytics foundations, auditability, and operational controls needed before asynchronous and AI capabilities.

## Requirements and goals

- Customer and authorized staff support-ticket workflows.
- Owner/admin dashboard and agreed reports over authoritative business data.
- Durable, access-controlled audit records for important actions.
- Production-oriented validation, error handling, structured logging, rate controls, performance review, and API documentation.
- Defined data retention, backup/restore direction, and operational runbooks appropriate to this phase.

## Accepted decisions and retained blockers

ADR 0007 and `docs/phase-5/PHASE-05-DECISION-PROPOSAL.md` define the accepted ticket/message/state,
report, audit, logging, rate/proxy, performance, permission, dependency, and development-retention
baseline. Production retention/privacy/legal-hold policy, backup vendor and RPO/RTO, hosted
observability, distributed rate limiting, and deployment topology remain explicit production
blockers rather than invented defaults.

## Tasks

- [x] Record the explicit Phase 4 provider-smoke deferral and Phase 5 planning authorization.
- [x] Draft the Phase 5 decision proposal, permission matrix, and threat model.
- [x] Review and explicitly approve the complete Phase 5 baseline.
- [x] Record the accepted Phase 5 ADR and implementation sequence.
- [x] Implement and deploy the support/audit persistence and permission foundation.
- [x] Test permission mappings, chain-head seed state, support persistence, and scoped message
      idempotency constraints.
- [x] Implement the audit append/verification service and safe configuration boundary.
- [x] Implement owner-only bounded audit reads with self-access evidence and no mutation route.
- [x] Implement approved support API/UI workflows.
- [x] Implement bounded report queries and UI.
- [x] Retrofit registered audit evidence across sensitive workflows and add structured
      logging/correlation/redaction.
- [x] Add approved rate/request controls and profile key APIs/indexes.
- [x] Complete operational documentation, security/performance/recovery tests, regressions, and
      acceptance review.

## Acceptance criteria

- Customers can manage only their support cases; staff actions obey explicit permissions and transitions.
- Dashboard/report numbers match defined queries, currency/time-zone rules, and access boundaries.
- Sensitive actions produce useful tamper-resistant/access-restricted audit evidence without secret leakage.
- Logs correlate requests and redact sensitive fields; public errors remain safe.
- Key endpoints meet agreed performance targets on representative data.
- Rate and payload controls degrade safely and runbooks cover common operational failures.

## Testing requirements

Unit/integration tests for ticket transitions, permissions, reports and audit emission; negative access tests; log/error redaction tests; pagination/filter limits; representative-data query/performance checks; backup/restore exercise if introduced; frontend/E2E support and dashboard paths; regression suite for Phases 1–4.

## Edge cases

Concurrent ticket assignment/update, reopened/resolved cases, missing assignee, deleted user/order references, attachment failure, large report ranges, no data, timezone/currency boundaries, audit/log write failure, partial export, rate limit behind proxies, malformed correlation IDs.

## Security considerations

Separate audit access from ordinary administration; protect ticket/customer/payment data; prevent report/export injection and formula issues; validate uploads if enabled; configure trusted proxies deliberately; redact PII/secrets/tokens/payment/document content; set retention/access policies; test IDOR and role escalation.

## Completion criteria

Approved support/report/audit/hardening scope is complete; security, performance, recovery, and regression gates pass; runbooks/docs match behavior; prior phases remain stable; real-time/jobs/AI are not prematurely implemented; and explicit acceptance is recorded.

This criterion is satisfied by `docs/phase-5/PHASE-05-ACCEPTANCE-REPORT.md` under the user's
instruction to complete and commit the phase. Production launch remains blocked by the decisions
and residual risks listed there.

## Documentation updates

Update schema/API/architecture, ticket/status and metric definitions, audit catalog, logging/redaction and operations runbooks, retention decisions, this phase document, and `WORK-PROGRESS.md`.

## Explicit exclusions

Real-time notifications, queues/workers/Redis, AI assistants, RAG, LangGraph, Docker/CI/CD production deployment remain in later phases.
