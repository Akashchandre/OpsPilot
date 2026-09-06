# Phase 9 Review and Acceptance Report

## Result

**PASS — explicitly accepted and complete for repository/development on 2026-09-06.** After all
completion criteria passed, the user explicitly accepted Phase 9 and instructed that it be
committed. ADR 0012's two fixed LangGraph workflows, Node-owned signed tools and model controls,
encrypted artifacts, metadata-only checkpoints, mandatory support approval, exactly-once support
effect, recovery, and deterministic evaluation baseline are implemented and verified.

Production, metered workflow evaluation, non-synthetic support-data model processing, and every
deferred workflow/tool/action remain unapproved.

## Scope delivered

- Exact reviewed LangGraph and SQLite checkpoint dependencies in the committed Python lock.
- Additive migration-controlled workflow runs, tool evidence, encrypted artifacts, approvals,
  usage linkage, AI-assisted support origin, jobs, permissions, constraints, and indexes.
- Two fixed `v1` graphs with strict state/output contracts, metadata-only durable pause/resume,
  bounded execution, safe checkpoint identity/version handling, and no model-selected tools.
- Separate signed Node-to-FastAPI and FastAPI-to-Node boundaries with replay protection and strict
  raw-body/schema validation.
- Owner read-only business brief with authoritative aggregate facts, source labels, freshness, and
  uncertainty separated from generated interpretation.
- Owner/admin support reply drafting with public ticket/customer-policy scope, nonreviewable safe
  outcomes, mandatory digest-bound human review, edit/reject/cancel, and one idempotent AI-assisted
  public reply action.
- Default-off configuration, production rejection, support-data defense-in-depth gate, rate/daily/
  active-run/cost/step/output bounds, audit/redaction, artifact/checkpoint expiry, and kill switches.
- Permission-aware responsive UI, content-free deterministic evaluation, signed cross-service
  smoke, full regressions/coverage, operations guidance, and synchronized system documentation.

## Acceptance criteria review

| Criterion | Evidence | Result |
| --- | --- | --- |
| Only approved tools with scoped bounded input/output | Static graph registry and sequences, Node-derived arguments, strict schemas, signed gateway, integration/adversarial tests | Pass |
| Prompt cannot gain data or authority | Untrusted-data prompt boundary, no model tool API, repeated Node RBAC/consent/scope checks, exfiltration/injection cases | Pass |
| Consequential step requires correct human | LangGraph interrupt, approval permission, digest/version/expiry/source binding, final locked reauthorization | Pass |
| Duplicate/resume/cancel/timeout/recovery is safe | Optimistic versions, idempotency receipts, unique workflow reply, checkpoint identity tests, terminal no-retry/unknown policy | Pass |
| Business provenance/freshness/uncertainty is visible | Authoritative tool snapshots plus source labels, scope/as-of fields, separate UI presentation and output schema | Pass |
| Support policy is bounded and auditable | Public-only context, customer-policy sources, escalation/refusal/insufficient outcomes, AI-assisted origin and audit evidence | Pass |
| Privacy/content retention boundary holds | AES-256-GCM artifacts, metadata-only MySQL/checkpoints/audit/logs, content-free evidence and secret scan | Pass |
| Quality/performance/cost gates pass | 100-case offline evaluation and five-case bidirectional smoke meet every threshold with exact accounting | Pass |
| Prior phases remain stable | 209 API, 53 web, and 165 routine Python tests pass with all coverage/static/build/database gates | Pass |

Detailed metrics are in `PHASE-09-EVALUATION-EVIDENCE.md`.

## Decisions and rationale

- Node remains authoritative because existing sessions, RBAC, consent, domain transactions, audit,
  jobs, usage/cost, document authorization, and support idempotency already live there. FastAPI
  receives neither database nor browser authority.
- Static graph paths and server-owned arguments make the tool surface reviewable and prevent model
  text from widening scope. Adding any graph/version/tool/action requires a new proposal and gate.
- Short-lived encrypted MySQL artifacts preserve review/recovery without adding plaintext workflow
  content to relational evidence. Strict metadata-only SQLite checkpoints provide local restart
  recovery without accepting unsafe pickle fallback or pretending local SQLite is production-ready.
- Support publication is separated from generation by a durable interrupt and a fresh Node
  transaction. An edited reply changes the digest and is explicitly bound to the reviewer decision.
- Recovery reads and cancellation deliberately survive consent revocation/kill switches; execution,
  model finalization, resume, and action do not.
- Offline deterministic policy evaluation is sufficient for this approved gate. Metered model
  quality and real support-data processing remain separately controlled decisions.

## Final automated gate

- API: 39 files / 209 tests, coverage 82.41/73.59/91.67/86.06
  (statements/branches/functions/lines).
- Web: 8 files / 53 tests, coverage 80.62/71.79/80.60/82.81.
- Python: 165 pass / 3 opt-in skips / 2 warnings, total coverage 82.87%.
- Offline evaluation: 40 business + 60 support cases; all measured correctness/safety rates 100%,
  zero unsupported numeric claims, zero provider calls, no content/secret evidence.
- Signed local smoke: 5 cases, 15 tools, workflow p95 270.757 ms, tool p95 71.660 ms, exact 600
  tokens / 500,000 cost ticks, encrypted artifacts and checkpoints confirmed and cleaned.
- ESLint, Prettier, Prisma format/validation, Ruff lint/format, `pip check`, production build,
  development/test migration status and zero-diff checks, both audit verifiers, and high-confidence
  secret scan pass.

## Retained risks and blockers

- Seven current transitive npm advisories remain (five high, two moderate). No safe complete fix is
  available within the approved dependency boundary; a breaking Prisma downgrade was rejected.
- The local SQLite checkpointer, artifact key, replay/rate/concurrency stores, and loopback HTTP
  topology are single-machine development controls, not a production architecture.
- Production still lacks approved TLS/mTLS/private networking, KMS and multi-key rotation, durable
  multi-instance checkpoints, backup/restore, retention/erasure/legal holds, privacy/legal and
  subprocessor review, monitoring/alerts, SLO/load/soak, incident ownership, and rollout controls.
- Model output is probabilistic. The deterministic evaluator and mock-provider smoke prove policy
  plumbing and invariants, not live Groq workflow quality. Metered evaluation requires explicit
  authorization.
- Non-synthetic support context includes customer-visible messages and related order/policy data;
  the support processing gate must stay false until separately approved.
- Two upstream/local-adapter Python warnings remain non-failing. The system Node installation is
  still older; verification uses the approved portable Node 24.19.0 runtime.
- Independent Phase 4 Razorpay Test Mode delivery/recovery and earlier production decisions remain
  unresolved and unchanged by Phase 9.

## Transition

Phase 9 is accepted and complete for the repository/development scope. Keep every workflow
default-disabled unless the runbook conditions are met, keep real support-data processing and
metered workflow evaluation disabled, and do not begin Phase 10 or production rollout without
separate authorization.
