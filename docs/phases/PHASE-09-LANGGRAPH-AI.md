# Phase 9 — LangGraph Business AI and AI Support

## Objective

Introduce controlled, permission-aware LangGraph workflows for business analysis and AI-assisted support using narrow tools, explicit state, and human approval for consequential actions.

## Requirements and goals

- Versioned graphs for approved business and support use cases only.
- Allowlisted typed tools using Node.js business services rather than unrestricted SQL or infrastructure access.
- Explicit workflow state, bounds, timeouts, errors, resumption, and audit behavior.
- Human-in-the-loop approval for customer-visible or state-changing actions as policy requires.
- Clear factual provenance, freshness, uncertainty, and separation of computed facts from generated interpretation.

## Decisions required

Initial workflows/tools; read-only versus action capabilities; approval matrix; graph state/checkpoint store/retention; interruption/replay/cancellation; metrics/data freshness; confidence/escalation thresholds; support response policy; audit detail; workflow evaluation and production limits.

## Tasks

Select bounded use cases and threat-model each; approve dependencies/services/config; define tool schemas/permissions/limits/idempotency; implement versioned graphs and explicit failure paths; add approval/cancel/resume UI and service contracts; enforce audit and policy gates; build scenario/adversarial/tool evaluations; add monitoring/kill switches/runbooks; document and update progress.

## Acceptance criteria

- Graphs invoke only approved tools with validated scoped input and bounded output.
- A prompt cannot obtain unauthorized data or cause an unapproved action.
- Consequential steps pause for the correct authorized human and cannot be bypassed by model text.
- Duplicate/resumed workflows do not duplicate effects; timeouts/cancellation/recovery are safe.
- Business results show scope, time range, freshness, sources/calculation basis, and uncertainty.
- Support suggestions/escalations follow approved policy and are auditable.

## Testing requirements

Graph path/state/loop/timeout/resume tests; tool schema/authorization/data-isolation/idempotency tests; approval bypass and privilege-change tests; prompt/indirect injection and exfiltration tests; adversarial scenario evaluations; quality/latency/cost/load thresholds; kill-switch and dependency failure drills; full regression.

## Edge cases

Ambiguous request, no/contradictory/stale data, long tool output, repeated tool failure, graph loop, checkpoint corruption, approver unavailable or permission revoked, concurrent approval/cancel, partial external success, model/provider change, workflow definition upgrade mid-run.

## Security considerations

No unrestricted SQL/code/shell/browser or infrastructure tools; least-privilege service identities; authorization at every tool execution and approval; output and argument validation; limit rows/time/tokens/steps/cost; protect checkpoint/audit content; require confirmation for irreversible/external/financial/permission actions; provide emergency disable controls.

## Completion criteria

Every released graph has an owner, contract, permissions, approval policy, version, evaluation set, limits, monitoring, rollback/kill switch, and runbook; security/quality/recovery gates pass; prior phases remain stable; and explicit acceptance is recorded.

## Documentation updates

Update AI/system architecture, API/tool contracts, graph diagrams/state and approval matrices, evaluations, monitoring/incident runbooks, decisions, phase status, and `WORK-PROGRESS.md`.

## Explicit exclusions

Any unapproved autonomous action, unrestricted data/infrastructure access, or workflow without evaluation and a kill switch is out of scope.

