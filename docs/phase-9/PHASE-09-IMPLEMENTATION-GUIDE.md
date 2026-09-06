# Phase 9 Implementation Guide

## Result

The ADR 0012 repository/development baseline is implemented and verified. OpsPilot now has two
fixed, versioned LangGraph workflows: an owner-only read-only business brief and an owner/admin
support reply draft. Node remains the sole public, business-data, authorization, cost, artifact,
approval, and action authority. FastAPI runs only registered graphs and calls only the fixed signed
Node tool boundary.

All workflow gates default to disabled. Production use, non-synthetic support-data model
processing, metered workflow evaluation, and every deferred graph/tool/action remain unapproved.

## Runtime topology

```text
Browser -> authenticated /api/v1/ai routes -> Node/MySQL transaction -> durable job
                                                        |
Worker -> signed FastAPI start/resume -> fixed LangGraph v1 graph
                                      -> signed Node tool/model/artifact gateway
                                                        |
                                      Node reauthorizes -> business service / Groq / AES-GCM
                                                        |
Support graph -> metadata-only interrupt -> human decision -> idempotent public reply
```

The two signing directions use distinct keys. Browser cookies never authorize the internal tool
gateway. FastAPI has no database, session, audit, document-object, or support-action credentials.

## Released workflow registry

| Workflow | Authority | Fixed path | Outcome |
| --- | --- | --- | --- |
| `OWNER_BUSINESS_BRIEF_V1` / graph `v1` | Owner plus business-AI, report, inventory, and support-read permissions | reports overview -> inventory attention -> aggregate support queue -> one model step | Encrypted final brief with scope, source labels, freshness, and uncertainty; no action |
| `SUPPORT_REPLY_DRAFT_V1` / graph `v1` | Owner/admin plus support-use, ticket read/manage, and order-read permissions | public ticket context -> customer-policy context -> one model step -> interrupt -> optional public reply | Reviewable encrypted draft, or safe escalation/refusal/insufficient-context terminal result |

The graph registry, graph version, tool order, arguments, token/cost limits, and output schemas are
server controlled. There is no free-form workflow prompt, model-selected tool, SQL, shell, browser,
or infrastructure tool.

## Authority and lifecycle

Node creates each immutable run scope and queues `AI_WORKFLOW_ADVANCE`. Every tool execution,
model reservation/finalization, approval, resume, and support action rechecks the relevant active
user, permissions, consent, feature gates, run version/state, expiry, and scoped source identity.

Normal lifecycle states are `QUEUED`, `RUNNING`, `AWAITING_APPROVAL`, `APPROVED`, and `SUCCEEDED`.
Safe terminal alternatives are `FAILED`, `UNKNOWN`, `CANCELLED`, and `EXPIRED`. A provider or
boundary ambiguity is not automatically retried. Authorized list/get/cancel recovery remains
available after consent revocation or a kill switch, while new execution, resume, and action paths
remain blocked.

Support drafts cannot publish before an interrupt. `APPROVE` and `EDIT_AND_APPROVE` bind the exact
draft/edit digest, source-freshness evidence, approval/run versions, reviewer, and expiry.
`REJECT` has no effect. Immediately before publication, Node locks and rechecks all authority and
freshness conditions. The existing support-message idempotency boundary plus the unique workflow
relationship allows at most one `AI_ASSISTED` public reply.

## Persistence and content handling

Migration `20260906090000_phase_9_langgraph_workflows` adds:

- `ai_workflow_runs` for immutable scope and metadata-only lifecycle evidence;
- `ai_workflow_tool_calls` for fixed ordinal/tool/digest/status/freshness evidence;
- `ai_workflow_artifacts` for short-lived AES-256-GCM ciphertext and authenticated metadata;
- `ai_workflow_approvals` for digest-bound decisions and effect receipts;
- optional workflow/model-step links on `ai_usage_events`; and
- `HUMAN` / `AI_ASSISTED` support-message origin with an optional unique workflow-run link.

MySQL never stores plaintext tool snapshots, prompts, drafts, edits, or final narratives. Those
values exist only in authenticated ciphertext artifacts. LangGraph SQLite checkpoints contain only
workflow metadata and opaque IDs/digests, use strict msgpack with pickle fallback disabled, and
live at an absolute private path outside repository/public roots.

Approvals expire after 30 minutes and nonterminal runs after 24 hours. Terminal checkpoint and
artifact cleanup is handled by the registered retention sweep. Metadata-only run, tool, approval,
usage, and audit retention remains indefinite for development pending a production retention and
legal-hold decision.

## Public API and UI

The implemented authenticated endpoints are documented in `docs/04-API-CONTRACT.md`:

- workflow consent read/accept/revoke for `OWNER` or `SUPPORT` scope;
- owner business-brief and support-reply run creation;
- authorized run list/detail and cancellation; and
- support approval, edit-and-approve, or rejection.

Mutation routes require trusted origin, CSRF, UUID idempotency keys, strict bodies, optimistic run
versions, and the applicable permissions. The business workflow UI is at `/admin/business-ai`.
The support workflow panel is embedded in authorized support-ticket management. Both render model
content as plain text and show provenance, freshness, approval expiry, and AI-assisted origin.

## Internal contracts

Node calls FastAPI through signed `/internal/v1/workflows/start`, `/resume`, and thread-delete
routes. FastAPI calls Node through separately signed model reserve/finalize and fixed tool-execute
routes. Both directions enforce canonical HMAC signatures, key IDs, timestamps, nonces, replay
protection, body digests, raw-body limits, strict schemas, and safe errors.

The six registered Node tool codes are `REPORTS_OVERVIEW_V1`, `INVENTORY_ATTENTION_V1`,
`SUPPORT_QUEUE_SUMMARY_V1`, `SUPPORT_TICKET_PUBLIC_CONTEXT_V1`,
`DOCUMENTS_CUSTOMER_POLICY_CONTEXT_V1`, and `SUPPORT_PUBLIC_REPLY_V1`. The final tool is reachable
only in the support graph after a valid human approval.

## Failure and recovery behavior

- A disabled gate, missing consent, revoked permission, stale scope, expired approval, or digest
  mismatch fails closed before inference or effect.
- Timeout, recursion exhaustion, invalid/corrupt checkpoint identity, and missing graph version
  produce bounded safe errors; no arbitrary migration or replay is attempted.
- Failed model steps close pending usage/cost reservations and append safe audit evidence.
- Duplicate starts/resumes are state/version checked; a completed resume is harmless.
- Concurrent approval/reject/cancel requests serialize through optimistic versions and row locks.
- Retention deletes the FastAPI thread before marking checkpoint cleanup complete and records a
  metadata-only summary audit event.

Operational procedures are in `PHASE-09-OPERATIONS-RUNBOOK.md`; measured gates are in
`PHASE-09-EVALUATION-EVIDENCE.md`.

## Explicit exclusions

No production topology or rollout, non-synthetic support-data provider use, metered workflow
evaluation, customer-facing workflow, persistent chat/memory, free-form agent, model-selected
tool, internal-note ingestion, automatic ticket mutation, finance/payment/refund/order/inventory/
user/permission action, external message, LangSmith, multi-instance checkpoint coordination, or
new provider/model/account is delivered or authorized.
