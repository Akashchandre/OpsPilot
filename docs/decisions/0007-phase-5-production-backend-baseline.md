# ADR 0007 — Phase 5 Production Backend Baseline

## Status

Accepted on 2026-08-27 by the user's explicit instruction to start Phase 5 after review of the
complete decision proposal. Phase 4's external Razorpay smoke remains deferred under ADR 0006 and
is not accepted or waived by this decision.

## Context

Phases 1–4 provide the application foundation, identity/RBAC, catalog/inventory, and repository-
complete commerce/payment workflows. Phase 5 must add production-backend capabilities without
prematurely introducing Phase 6 queues/realtime infrastructure, Phase 8 object storage, hosted
observability, or live payments.

The project has fixed `OWNER`, `ADMIN`, and `CUSTOMER` roles, a single-business boundary, MySQL as
the source of truth, and no approved jurisdiction-specific retention policy or deployment vendor.
The complete proposed behavior, security boundaries, permissions, environment review, and test
gate are recorded in `docs/phase-5/PHASE-05-DECISION-PROPOSAL.md`.

## Decision

- Implement authenticated ownership-scoped support tickets with five categories, five statuses,
  four staff-controlled priorities, optional owned-order linkage, optional permission-qualified
  assignment, optimistic versions, immutable customer-visible/internal messages, append-only
  transition events, and UUID idempotency for ticket/message creation.
- Defer attachments, rich text, email/SMS, SLA automation, escalations, bulk actions, queues,
  realtime updates, and object storage.
- Implement a bounded, live MySQL overview report using explicit half-open UTC ranges, INR decimal
  strings, a rolling 30-day default, a 366-day maximum, and the exact payment-flow/order/customer/
  inventory/support definitions in the accepted proposal. Exports and accounting claims are
  deferred.
- Add an append-only globally sequenced audit stream protected by an HMAC-SHA256 previous-hash
  chain and singleton locked chain head. Audit metadata is action-specific and excludes secrets,
  raw bodies, payment instruments, addresses, and ticket content.
- Keep Phase 2 `security_events` and Phase 4 financial/status evidence as their existing specialized
  records; the general audit stream complements rather than replaces them.
- Add dependency-free JSON-lines request/error logging, server-generated request IDs, allowlisted
  fields, configurable single-instance rate limits, explicit proxy trust, and existing strict body
  boundaries. A shared rate store and hosted observability remain later decisions.
- Add `support:tickets:read`, `support:tickets:manage`, and `reports:read` to `OWNER` and `ADMIN`.
  Add `audit:read` only to `OWNER`. Customers receive ownership-scoped support access and none of
  these operator permissions.
- Add no npm dependency, external account, or hosted service for this phase baseline.
- Expose no ticket/message/event/audit deletion API. Temporary indefinite development/test
  retention remains a production blocker until jurisdiction, privacy, legal-hold, and deletion
  requirements are approved.
- Document and exercise a sanitized isolated backup/restore workflow; production destination,
  automation, RPO/RTO, and retention generations remain deployment decisions.

## Implementation sequence

1. Add the support/audit persistence foundation and permission migration, validate it in
   development/test, and test database constraints/mappings.
2. Implement the audit append/verification service and safe configuration boundary so later
   privileged support and business writes can emit evidence transactionally.
3. Implement support API/UI workflows with ownership, visibility, idempotency, state, assignment,
   and concurrency tests.
4. Implement the exact overview report/API/UI definitions.
5. Add structured logging, rate/proxy/request controls, performance evidence, recovery runbooks,
   regression gates, and final review.

## Considered alternatives

- Support attachments were deferred because safe private storage, malware policy, scanning, and
  retention would introduce an unapproved storage service before its planned phase.
- A hosted log/metrics vendor was deferred because deployment topology and vendor ownership remain
  undecided; allowlisted JSON output preserves a future shipping boundary.
- Redis/shared rate limiting was deferred to Phase 6; the accepted in-process baseline explicitly
  prohibits horizontal scaling until a shared store is approved.
- Plain append-only audit rows were rejected because they provide weaker mutation/deletion
  detection than the accepted keyed hash chain.
- Broad reports and exports were rejected because arbitrary dimensions, spreadsheet injection,
  accounting policy, and expensive unbounded queries are not approved.

## Consequences

Phase 5 introduces additional relational tables, operational secrets for audit integrity, and
cross-cutting transaction work. Audit-chain appends serialize briefly on one head row, which is
acceptable for the current single-business scale but requires performance measurement. Support
content and audit evidence increase privacy and backup obligations, so production launch remains
blocked on the unresolved retention and recovery decisions.

The unresolved Razorpay Test Mode smoke, exposed-key rotation, and live-payment prohibitions remain
unchanged.

## Related documents

- `docs/phase-5/PHASE-05-DECISION-PROPOSAL.md`
- `docs/permissions/PHASE-05-PERMISSION-MATRIX.md`
- `docs/security/PHASE-05-THREAT-MODEL.md`
- `docs/phases/PHASE-05-PRODUCTION-BACKEND.md`
- `docs/decisions/0006-phase-4-provider-smoke-deferral.md`
