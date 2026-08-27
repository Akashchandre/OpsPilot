# ADR 0006 — Phase 4 Provider-Smoke Deferral and Phase 5 Start

## Status

Accepted on 2026-08-27 by explicit user direction to record the Razorpay issue and begin Phase 5
immediately. This decision authorizes Phase 5 planning despite the unresolved external Phase 4
gate; it does not accept Phase 4 or authorize live payments.

## Context

The Phase 4 migration, API, web workflows, signed-fixture/provider-contract tests, and repository
quality gates pass under ADR 0005. The remaining acceptance gate requires real Razorpay Test Mode
delivery for successful capture, failure, lost callback, duplicate webhook, full refund, and
expiry/late-evidence scenarios.

That gate cannot currently run. The ignored `apps/api/.env` exists, but `RAZORPAY_ENABLED`,
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` are unset. The repository
also has no approved public HTTPS webhook endpoint or recorded confirmation of the Test Mode
automatic-capture setting. The user reported a Razorpay issue and directed work to continue into
Phase 5 rather than wait for these external inputs.

A later pre-commit staged-content scan found a real-looking Test Mode key pair and webhook endpoint
in the tracked API example file. They were replaced with disabled, empty placeholders before the
commit. The pair is treated as exposed and requires rotation; no value is retained in project
documentation or committed source.

## Decision

- Defer the real Razorpay Test Mode provider-delivery smoke as an explicit unresolved Phase 4
  acceptance item.
- Keep Phase 4 classified as repository-complete but not accepted. Signed local fixtures and
  provider fakes remain verification evidence, not substitutes for external delivery evidence.
- Keep Razorpay disabled by default. Do not add placeholder credentials, weaken startup checks,
  bypass webhook verification, or mark financial transitions successful manually.
- Prohibit Razorpay Live Mode and real-money processing until the Phase 4 provider smoke and the
  separate tax, shipping, privacy, monitoring, incident-response, and go-live decisions are
  completed.
- Authorize Phase 5 to enter decision-definition work immediately. Phase 5 schema or application
  implementation still requires approval of its own support, reporting, audit, hardening,
  permission, dependency, retention, and operational baseline.
- Preserve the unresolved provider smoke as a named backlog gate and rerun the Phase 1–4 regression
  suite during Phase 5 work.

## Considered alternatives

- Blocking all Phase 5 work until external Razorpay configuration was available was rejected by
  explicit user direction.
- Marking Phase 4 accepted from automated fixtures alone was rejected because it would erase a
  known external integration risk and contradict the Phase 4 acceptance contract.
- Enabling live credentials or weakening provider verification to obtain a quick result was
  rejected because it would expand scope and financial risk without the required operational
  decisions.

## Consequences

Phase 5 can progress while the payment-provider issue is investigated separately, but Phase 4
remains an inherited release risk. Any later provider smoke must use freshly rotated Test Mode
credentials, a separate webhook secret, confirmed automatic capture, and a reviewed public HTTPS
endpoint, then record the full matrix in the Phase 4 review report.

No Phase 5 decision is silently approved by this ADR. Until the Phase 5 proposal is reviewed, work
is limited to requirements, architecture, permission, threat, dependency, and test planning.

## Related documents

- `docs/decisions/0005-phase-4-orders-payments.md`
- `docs/phases/PHASE-04-ORDERS-PAYMENTS.md`
- `docs/phase-4/PHASE-04-OPERATIONS-RUNBOOK.md`
- `docs/phase-4/PHASE-04-REVIEW-REPORT.md`
- `docs/phases/PHASE-05-PRODUCTION-BACKEND.md`
- `docs/phase-5/PHASE-05-DECISION-PROPOSAL.md`
