# ADR 0012 — Phase 9 LangGraph Workflow Baseline

## Status

Accepted on 2026-09-06 by the user's explicit “approve” response to the complete Phase 9 approval
request. That request named the decision proposal, permission/approval matrix, threat model, and
the exact Python package pins.

This authorizes repository/development implementation of the baseline below and installation of
`langgraph==1.2.11` and `langgraph-checkpoint-sqlite==3.1.1` in the ignored AI virtual environment.
It does not authorize production deployment, non-synthetic support-data processing by the model,
metered live evaluation, another provider/model/account, or any deferred workflow or action.

The unresolved Phase 4 provider-delivery gate and the production gates from Phases 7 and 8 remain
unchanged.

## Context

Phase 7 established a stateless signed Node/FastAPI/Groq boundary. Phase 8 added secure document
retrieval and Node-side reauthorization. Phase 9 needs durable, bounded workflow orchestration and
human review without turning model output into authorization or exposing business credentials to
the AI service. The reviewed baseline is recorded in:

- `docs/phase-9/PHASE-09-DECISION-PROPOSAL.md`
- `docs/permissions/PHASE-09-PERMISSION-MATRIX.md`
- `docs/security/PHASE-09-THREAT-MODEL.md`
- `docs/phases/PHASE-09-LANGGRAPH-AI.md`

## Decision

- Implement only `OWNER_BUSINESS_BRIEF_V1` and `SUPPORT_REPLY_DRAFT_V1`. There is no general agent,
  free-form workflow construction, model-selected tool, persistent chat memory, or time travel.
- Keep Node as the authentication, authorization, scope, data, artifact, approval, action,
  idempotency, and audit authority. FastAPI receives no MySQL, document-store, or business-service
  credentials.
- Give each graph an immutable code-owned version and retain registered old versions while their
  runs can still resume. Limit every path, step, tool call, provider call, payload, timeout, and
  concurrency setting.
- Use a separately keyed signed and replay-resistant FastAPI-to-Node gateway. Tools are fixed by
  graph code, take opaque run/tool identifiers, and are reauthorized against immutable run scope
  and current permissions at every execution.
- Store only opaque identifiers, versions, digests, and statuses in LangGraph state. Store tool
  snapshots, generated drafts, reviewer edits, and results in short-lived Node-owned AES-256-GCM
  encrypted MySQL artifacts using a separate key domain.
- Use the async SQLite LangGraph checkpointer only for single-process local repository/development
  operation at an absolute private path outside repository, document, vector, and web roots. Enable
  strict msgpack, allow primitive state only, delete terminal/expired threads, and reject SQLite in
  production.
- Reuse the MySQL transactional job/outbox for all graph starts, resumes, and retention cleanup.
  Provider-step reservations enforce at-most-once inference; ambiguous outcomes become `UNKNOWN`
  and are not retried automatically.
- Restrict the owner brief to the approved read-only report, inventory-attention, and aggregate
  support-queue tools. Preserve exact facts, provenance, freshness, and uncertainty separately
  from generated interpretation.
- Restrict support drafting to one authorized ticket's customer-visible context, minimal related
  order state, and reauthorized `CUSTOMER` policy excerpts. Exclude identity/contact/payment fields
  and internal notes. Keep real support model processing disabled until separately approved.
- Require an eligible current `OWNER` or `ADMIN` to approve, edit-and-approve, reject, or cancel a
  support draft. Recheck permission, consent, freshness digest, expiry, and kill switches before
  publishing exactly one idempotent customer-visible reply through the existing support service.
  Mark that reply `AI_ASSISTED` and link it to its workflow run.
- Add only the three approved permissions, the `SUPPORT` AI scope, the versioned workflow consent,
  the documented default-off feature gates, redacted audit events, retention controls, recovery
  paths, evaluation suites, and UI necessary for these workflows.
- Require the deterministic, adversarial, privacy, authorization, approval, idempotency, recovery,
  performance, cost, and prior-phase regression gates in the accepted proposal before Phase 9 can
  be called repository/development complete.

## Approved dependencies

Direct Python packages:

- `langgraph==1.2.11`
- `langgraph-checkpoint-sqlite==3.1.1`

The complete transitive resolution must be locked in `apps/ai/pylock.toml`, checked for Python 3.13
compatibility, dependency consistency, licenses, and known advisories. No LangSmith account,
LangChain agent package, provider SDK, or additional service is approved.

## Considered alternatives

- In-memory checkpoints were rejected because the support approval must survive process restart.
- A production checkpoint service or custom MySQL saver was deferred because it adds an
  unapproved service or a high-maintenance persistence implementation before local behavior is
  proven.
- Model-selected tools and general agents were rejected because deterministic graphs and typed
  Node tools provide tighter authorization, evaluation, and failure boundaries.
- Storing business/support plaintext in graph state was rejected because checkpoints have a
  different lifecycle and serializer attack surface; encrypted Node artifacts keep authority and
  retention in the business tier.
- Automatic support replies were rejected because a generated draft is not authorization and a
  public customer message is consequential.

## Consequences and follow-up

Phase 9 adds workflow persistence, encrypted artifacts, three permissions, two registered job
types, a signed reverse gateway, two versioned graphs, a support approval path, and operator/UI
surfaces. It also adds cleanup, corruption, expiry, stale-context, and unknown-provider recovery
responsibilities.

Repository/development completion remains conditional on all accepted gates. Production requires a
separately approved checkpoint/artifact topology, multi-instance coordination, network identity,
privacy/legal/retention/erasure policy, monitoring/SLO/capacity, backup/restore, model rollout, and
explicit deployment authorization.

## Related decisions

- `docs/decisions/0011-phase-8-rag-document-baseline.md`
- `docs/decisions/0010-phase-7-groq-provider.md`
- `docs/decisions/0009-phase-7-ai-foundation-baseline.md`
- `docs/decisions/0008-phase-6-realtime-jobs-baseline.md`
- `docs/decisions/0006-phase-4-provider-smoke-deferral.md`
