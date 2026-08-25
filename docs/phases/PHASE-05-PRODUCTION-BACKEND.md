# Phase 5 — Production Backend Features

## Objective

Harden the backend and add agreed support, reporting/analytics foundations, auditability, and operational controls needed before asynchronous and AI capabilities.

## Requirements and goals

- Customer and authorized staff support-ticket workflows.
- Owner/admin dashboard and agreed reports over authoritative business data.
- Durable, access-controlled audit records for important actions.
- Production-oriented validation, error handling, structured logging, rate controls, performance review, and API documentation.
- Defined data retention, backup/restore direction, and operational runbooks appropriate to this phase.

## Decisions required

Ticket messages/attachments/status/priority/SLA/assignment/escalation; dashboard metrics and freshness; exports; audit event inventory/retention/access; logging/metrics vendors; rate policies; privacy/retention/deletion; backup targets; whether object storage is needed now for support attachments.

## Tasks

Finalize support/report/audit contracts and permissions; approve dependencies/services/env variables; implement schema/migrations and support workflows; implement bounded report queries and UI; add append-oriented audit recording; standardize structured logging/correlation/error/redaction; profile key APIs and indexes; establish rate/request controls and operational documentation; test security/performance/recovery behaviors; update progress.

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

## Documentation updates

Update schema/API/architecture, ticket/status and metric definitions, audit catalog, logging/redaction and operations runbooks, retention decisions, this phase document, and `WORK-PROGRESS.md`.

## Explicit exclusions

Real-time notifications, queues/workers/Redis, AI assistants, RAG, LangGraph, Docker/CI/CD production deployment remain in later phases.

