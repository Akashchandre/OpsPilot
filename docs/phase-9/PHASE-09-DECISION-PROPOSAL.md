# Phase 9 LangGraph Business AI and AI Support Decision Proposal

## Status

**ACCEPTED on 2026-09-06 under ADR 0012.** The user's explicit “approve” response authorized this
complete repository/development baseline and the separate installation of the two exact Python
packages listed below. It does not authorize production rollout, non-synthetic support-data model
processing, metered live evaluation, or any explicitly deferred workflow or action.

## Objective and scope

Add two fixed, versioned workflows:

1. `OWNER_BUSINESS_BRIEF_V1`: an owner-only, read-only operational brief assembled from three
   narrow business tools and one bounded Groq synthesis call.
2. `SUPPORT_REPLY_DRAFT_V1`: an owner/admin workflow that reads one scoped ticket, retrieves only
   customer-audience policy evidence, creates a draft, pauses for explicit human review, and can
   publish exactly one customer-visible reply through the existing support service after approval.

The proposed baseline includes:

- LangGraph `StateGraph` definitions with immutable application-level graph versions.
- Node-owned run, authorization, tool, approval, idempotency, artifact, and audit authority.
- A signed, replay-resistant FastAPI-to-Node tool gateway with an independent signing key.
- The existing MySQL transactional job/outbox for asynchronous graph start and resume.
- Metadata-only LangGraph state and a private local SQLite checkpointer for the interrupting support
  graph in repository/development.
- Application AES-256-GCM encryption for short-lived tool snapshots, model drafts, edited drafts,
  and final workflow results stored by Node in MySQL.
- A new workflow-specific Groq ZDR notice, strict provider schemas, existing cost accounting, and
  synthetic evaluation gates.
- Approval, edit, reject, cancel, expiry, recovery, kill-switch, and cleanup behavior.

The proposal does not add a general chat agent, model-selected tools, unrestricted SQL, arbitrary
HTTP/browser/code/shell tools, autonomous ticket changes, refunds, payments, order changes,
inventory changes, user/role changes, external email/SMS, LangSmith, LangChain agents, a new model,
a new provider, or a production checkpoint service.

## Existing constraints and reusable foundations

- OpsPilot remains single-business under ADR 0003. Phase 9 must not invent tenant rows or claims.
- Browsers call only the Node `/api/v1` boundary. Node owns sessions, permissions, CSRF, resource
  scope, business rules, transactions, audit, and final output authorization.
- Phase 5 already provides bounded reporting, support-ticket services, HMAC-chained audit, safe
  errors, structured redacted logging, and per-process rate controls.
- Phase 6 already provides registered MySQL jobs, leases, retries, dead-letter evidence, a separate
  JavaScript worker, and owner-only job inspection/replay.
- Phase 7 already provides signed Node-to-FastAPI calls, fixed Groq Chat Completions behavior,
  operator-confirmed Global ZDR, strict schemas, no automatic inference retry, and exact
  metadata-only usage/cost evidence.
- Phase 8 already provides customer-audience document retrieval in which Node reauthorizes every
  source and Groq receives only bounded approved excerpts.
- FastAPI currently has no MySQL or business-service credential. This proposal preserves that
  boundary: graph nodes use only the signed Node tool gateway.
- The existing support `addMessage` service already provides author-scoped UUID idempotency,
  transactional audit, and customer-notification enqueueing. The approved workflow action must
  call that service rather than duplicate its rules.

LangGraph's official documentation says checkpoints are required for pause/resume human review,
interrupt nodes restart from the beginning on resume, and side effects before an interrupt must be
idempotent. It also warns that the latest deployed graph normally runs against existing threads, so
application-level version routing and drain/cancel rules are required here:
[persistence](https://docs.langchain.com/oss/python/langgraph/persistence),
[interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts), and
[backward compatibility](https://docs.langchain.com/oss/python/langgraph/backward-compatibility).

## Proposed architecture

```text
Browser
  |
  v
Node public API -- transaction --> MySQL workflow run + AI usage + job
                                      |             |
                                      |             +--> encrypted short-lived artifacts
                                      v
JavaScript worker -- signed start/resume --> FastAPI LangGraph registry
                                               |
                                               +--> private local SQLite checkpoints
                                               |    (opaque metadata only)
                                               |
                                               +--> signed fixed tool request
                                                       |
                                                       v
                                              Node internal tool gateway
                                                       |
                                                       +--> existing report/support/RAG services
                                                       +--> current RBAC/consent/run checks
                                                       +--> idempotent approved support reply

FastAPI fixed generation node --> existing Groq adapter under required ZDR
  |
  +--> Node stages encrypted result/draft and records metadata-only usage
  +--> support graph interrupts with IDs/digests only
  +--> human decision in Node resumes exact graph version through a job
```

The model is not given a network client, database connection, tool registry, or function-calling
interface. Graph code, not model text, chooses the next node and exact registered tool. Node derives
tool arguments from the immutable workflow run; FastAPI cannot widen them.

## Proposed decisions

### 1. Initial workflow inventory

Only these graphs are released in the v1 baseline:

| Workflow                  | Audience         | Effect                                               |              Provider calls | Checkpoint behavior                                      |
| ------------------------- | ---------------- | ---------------------------------------------------- | --------------------------: | -------------------------------------------------------- |
| `OWNER_BUSINESS_BRIEF_V1` | `OWNER`          | Read-only generated brief                            |                 Exactly one | Durable metadata-only checkpoints until terminal cleanup |
| `SUPPORT_REPLY_DRAFT_V1`  | `OWNER`, `ADMIN` | Draft plus at most one approved public support reply | Exactly one before approval | Durable metadata-only interrupt/resume                   |

No graph has an open-ended agent loop. Graph definitions have a static allowlisted node set,
explicit terminal paths, and a hard recursion limit of 12 super-steps. New graphs, graph versions,
tools, effects, or approval types require an additive proposal, threat review, evaluation set, and
explicit approval.

### 2. Node remains the authority

Node creates every workflow run and stores its immutable workflow code, graph version, initiator,
resource/range scope, tool-call plan, current lifecycle version, provider/model/prompt versions,
and expiry. A signed FastAPI request alone never grants data or action authority.

For every tool call Node must:

1. Authenticate the independent internal signing key, timestamp, nonce, body digest, method, path,
   and request ID.
2. Load the server-created run and exact registered tool-call ordinal.
3. Recheck that the run, graph version, lifecycle state, tool code, target, and arguments match.
4. Re-read the current active user and exact required permissions and consent.
5. Execute the narrow existing or reviewed business service with fixed limits.
6. Store only a safe metadata receipt plus an encrypted short-lived result artifact.
7. Return a bounded tool result or artifact materialization to the graph over loopback HTTP.

The tool gateway is not mounted under `/api/v1`, accepts no browser cookie as authority, and is
rejected when the source is not the configured private/loopback peer in the development topology.

### 3. Graph execution and versioning

Use the Python Graph API and typed `StateGraph` definitions. State contains only JSON-serializable
workflow metadata: run/thread IDs, graph code/version, tool call IDs, artifact IDs and SHA-256
digests, safe status/reason codes, approval ID/version, step count, and timestamps. It must never
contain a question, ticket subject/body, internal note, document excerpt, report payload, generated
draft, edited reply, final narrative, provider body, secret, or credential.

The service keeps an explicit registry keyed by `(workflowCode, graphVersion)`. A run always starts
and resumes through its stored version. Old definitions and node names remain available until all
their nonterminal runs drain, expire, or are explicitly cancelled. A new deployment cannot silently
resume an old checkpoint through changed business logic. State-field changes are additive and
optional during a drain window.

User-visible time travel, checkpoint editing, forking, and arbitrary replay are disabled. A failed
or completed run is never rewound. The only resume operation is the exact next transition for one
valid pending human decision or recovery-safe internal attempt.

### 4. Asynchronous run coordination

Starting a run creates its row and enqueues `AI_WORKFLOW_ADVANCE` in the same MySQL transaction.
The job payload contains only the workflow-run UUID and expected transition version. The separate
worker reauthorizes the run, reserves any provider exposure, and calls FastAPI.

An approval/rejection creates an immutable decision receipt and, when needed, enqueues another
`AI_WORKFLOW_ADVANCE` transactionally. Provider failures are converted to terminal `FAILED` or
ambiguous `UNKNOWN` workflow state inside the handler; the job must not retry inference. Worker
retry is permitted only for pre-inference idempotent coordination or post-provider metadata/action
recovery whose receipt proves that a second model call cannot occur.

Add `AI_WORKFLOW_RETENTION_SWEEP` for expiry, encrypted-artifact clearing, and checkpoint deletion.
It carries a UTC day bucket only and cannot approve, publish, or regenerate anything.

### 5. Owner business brief workflow

Input is limited to a UTC `from`/`to` range of 1 to 90 days and a focus enum of `GENERAL`,
`REVENUE`, `INVENTORY`, or `SUPPORT`. There is no free-form prompt.

The graph executes these fixed read tools:

- `reports.overview.v1`: the existing authoritative overview contract.
- `inventory.attention.v1`: at most 20 active low/out-of-stock products with ID, SKU, name,
  on-hand, threshold, and an `asOf` timestamp.
- `support.queue.summary.v1`: aggregate open-ticket counts by status, priority, category, and
  fixed age buckets; no subject, message, requester, assignee, order, email, or other row content.

Each result is validated and staged as an encrypted artifact. A final node materializes those exact
artifacts, checks the run and freshness again, and calls Groq once. The strict result contains a
bounded summary, at most five source-labelled findings, at most five non-executing next-step
suggestions, and at most five uncertainties. Exact facts, ranges, calculation bases, and `asOf`
timestamps remain separately rendered as authoritative Node data.

The graph cannot forecast, set targets, change records, start another workflow, or describe a
suggestion as completed. Missing, contradictory, or stale tool data produces a safe incomplete or
failed result rather than a fabricated brief.

### 6. Support reply draft workflow

Input is one existing support-ticket UUID. The initiator cannot provide a prompt, tool name,
customer identity, order ID, audience, source ID, system message, or desired state transition.

The graph uses:

- `support.ticket.public-context.v1`: ticket number/category/priority/status/subject, at most the
  latest eight customer-visible messages, role labels rather than author identity, and a minimal
  related-order status snapshot when one belongs to the ticket. Names, email, phone, address,
  provider IDs, payment credentials, and internal notes are excluded.
- `documents.customer-policy-context.v1`: at most three currently authorized `CUSTOMER`-audience
  excerpts through the accepted Phase 8 candidate and Node reauthorization boundary.
- `support.reply.stage.v1`: stores the validated model draft and internal policy citations as a
  short-lived encrypted Node artifact and returns IDs/digests only.
- `support.reply.publish.v1`: after approval only, calls the existing idempotent support
  `addMessage` service for exactly one customer-visible message.

Ticket text and document excerpts are untrusted data. The graph does not expose internal notes to
Groq. The provider schema returns `READY_FOR_REVIEW`, `ESCALATE`, `INSUFFICIENT_CONTEXT`, or
`REFUSAL`, a draft of at most 2,000 characters when eligible, bounded reason codes, and only supplied
policy-source labels. It does not return or select a business action.

Payment/refund/account-security claims, missing policy evidence, contradictory policy, suspected
credentials, threats, or a request to bypass normal business rules force escalation or a cautious
request for more information. A numeric self-confidence value is not treated as authority.

### 7. Human approval and support action policy

Every model draft pauses before publication. The interrupt contains only run, approval, artifact,
digest, ticket, expiry, and decision-schema identifiers. It contains no draft or ticket text.

An authorized reviewer may:

- approve the exact draft;
- edit it under the existing 1-to-4,000-character plain-text support-body contract and approve the
  edited digest;
- reject it with an allowlisted reason; or
- cancel the run.

The same operator may initiate and approve because that operator already has direct authority to
post a support reply; the mandatory confirmation still prevents model autonomy. Two-person approval
remains required for any future financial, credential, permission, destructive, or external-channel
action, none of which exists in this baseline.

Before publication Node locks and verifies the approval/run, active reviewer, current permissions,
ticket state, latest customer-visible message/context digest, approved draft digest, decision
version, expiry, and kill switch. Any changed ticket context, closed ticket, revoked permission,
expired approval, cancellation, or digest mismatch invalidates the approval and requires a new run.

Publication uses a server-stored deterministic UUID idempotency key. The support message records
`AI_ASSISTED` origin and the workflow-run ID; both staff and customer UI show the AI-assisted label.
The human approver remains the message author and accountable actor. The model cannot set that actor
or marker.

### 8. Permission and consent boundary

Add three deny-by-default permissions:

- `ai:workflows:business:use` for `OWNER` only.
- `ai:workflows:support:use` for `OWNER` and `ADMIN`.
- `ai:workflows:support:approve` for `OWNER` and `ADMIN`.

Business-brief use also requires current `ai:owner:use`, `reports:read`, `inventory:read`, and
`support:tickets:read`. Support-draft use requires current `support:tickets:read`,
`support:tickets:manage`, and `orders:read`. Approval repeats the support permissions and requires
the approval permission. `CUSTOMER` receives no Phase 9 permission. `ADMIN` receives no owner
assistant or business-brief access.

Extend the assistant enum with `SUPPORT` for consent/usage scope. Add a separate
`groq-zdr-workflows-v1` notice for owner business data and support workflow processing. Consent is a
processing notice, never authorization or a determination of legal basis. Support workflow calls
against non-synthetic customer-derived content remain disabled until an explicit development data
approval; production requires a separate privacy/legal decision.

The complete mapping is in `docs/permissions/PHASE-09-PERMISSION-MATRIX.md`.

### 9. Persistence and encrypted artifacts

Add these MySQL records through reviewed additive migrations:

| Record                   | Purpose                                                                                        | Content rule                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `ai_workflow_runs`       | Immutable graph/scope identity, lifecycle/version, initiator, expiry, safe outcome             | No prompt, tool payload, ticket body, excerpt, draft, or narrative |
| `ai_workflow_tool_calls` | Registered tool ordinal, input/output digest, status, timing, row count, freshness, safe error | No plaintext input/output                                          |
| `ai_workflow_approvals`  | Target/action, draft digest, reviewer decision/version, expiry, execution/idempotency receipt  | No plaintext draft                                                 |
| `ai_workflow_artifacts`  | AES-256-GCM encrypted tool snapshots, drafts, edits, and final results                         | Ciphertext plus authenticated metadata only                        |

Extend `ai_usage_events` with an optional workflow-run/model-step relationship while preserving its
metadata-only rule. Extend support messages with `HUMAN`/`AI_ASSISTED` origin and an optional unique
workflow-run relationship. Existing rows default to `HUMAN`.

Artifact encryption uses a new 32-byte Base64 key and key ID, separate from document and audit keys.
Authenticated data includes artifact ID, workflow run, purpose, content digest, schema version, and
key ID. Plaintext exists only in bounded process memory and signed internal HTTP. Reads authenticate
before decode; any wrong key, tag, digest, purpose, or run relationship fails closed.

### 10. LangGraph checkpoint policy

Use `AsyncSqliteSaver` only for repository/development. Its path must be absolute, private, outside
the repository/document/vector/web roots, and owned by one AI process. Production configuration
rejects SQLite.

Checkpoint state is metadata-only as described above. Enable strict msgpack deserialization through
`LANGGRAPH_STRICT_MSGPACK=true` and an explicit safe-type allowlist. Tests seed sensitive canaries in
ticket, document, tool, draft, and final text and prove none appear in checkpoint bytes.

Awaiting approvals expire after 30 minutes; nonterminal runs expire after 24 hours. Checkpoint
threads are deleted within one hour of terminal/expired state, and encrypted artifact ciphertext is
cleared within 24 hours. Metadata-only run/tool/approval/usage/audit evidence remains indefinitely
in development, matching existing temporary policy. Production checkpoint technology, encryption,
retention, backups, erasure, legal holds, multi-instance coordination, and restore are **Decision
Required**.

The official checkpoint reference describes SQLite as a lightweight local option and not a
production topology, provides thread deletion, and recommends strict deserialization controls:
[checkpoint reference](https://reference.langchain.com/python/langgraph/checkpoints) and
[SQLite saver](https://reference.langchain.com/python/langgraph.checkpoint.sqlite).

### 11. Idempotency, retry, interruption, cancellation, and recovery

- Public run creation, decisions, and cancellation require a UUID `Idempotency-Key`; reuse with a
  different normalized request returns `409 IDEMPOTENCY_KEY_REUSED`.
- Every tool call has a server-created `(run, tool, ordinal)` identity and request digest. A repeat
  returns the same encrypted artifact/receipt or a conflict; it never widens scope.
- Every provider step has one server-created usage reservation. `PENDING`/`UNKNOWN` provider state
  prevents a second inference call after ambiguous failure.
- The approval node has no side effect before `interrupt()`. Publication is a separate node and the
  Node action remains idempotent if that node restarts.
- Concurrent approve/edit/reject/cancel requests serialize on run/approval versions. One transition
  wins; others receive a stable conflict without action.
- Cancellation blocks new tool/provider/action execution. Completed effects are not rolled back or
  represented as cancelled.
- Checkpoint corruption, missing graph version, artifact tamper, or state mismatch produces a
  terminal safe failure. Recovery may delete/cancel and start a new run; it never guesses state.
- Owner job replay cannot replay an inference or approved action. The workflow handler rechecks the
  provider-step and action receipts and returns the existing outcome.

### 12. Freshness, provenance, and uncertainty

Every tool result records a UTC `asOf`, requested range, calculation/source code, schema version,
row count, and digest. Business tool snapshots must be no more than 30 seconds apart and no more
than 60 seconds old when synthesis starts. Support approval is invalid if the ticket context digest
changes after draft creation.

The owner UI renders exact authoritative facts and source timestamps separately from generated
interpretation. Every generated finding references one or more supplied tool source labels. The
support UI renders the source ticket snapshot time, policy citations, escalation state, draft
digest, and approval expiry. Missing/contradictory facts appear as uncertainty; they are not filled
from model knowledge.

### 13. Audit, logging, and content retention

Register audit events for workflow create/start/pause/decision/cancel/complete/fail/unknown/expire,
tool execution, artifact read/clear, and approved action execution. Metadata may contain only opaque
IDs, workflow/tool/version codes, digests, counts, freshness, decision/outcome, safe reason/error
codes, and duration/cost. It must not contain ticket/document/tool/draft/result text, personal data,
provider bodies, keys, or checkpoint blobs.

Logs follow the same allowlist. Public errors never reveal graph nodes, prompts, internal tool names,
checkpoint paths, provider bodies, or unauthorized run/ticket existence. Workflow result and draft
reads reauthorize every time and are plain-text rendered.

### 14. Limits and kill switches

Initial reviewed limits:

- 3 active runs per user, 5 starts per user per 15 minutes, and 30 starts per user per UTC day.
- 12 graph super-steps, 5 registered tool executions, and 1 provider call per run.
- 2 seconds per Node read tool, 22 seconds per active graph invocation, and no automatic provider
  retry.
- 90-day maximum business range, 20 inventory rows, aggregate-only support queue, 8 public ticket
  messages, 3 policy chunks, 8,000 UTF-8 bytes of support context, and 2,000 generated draft
  characters.
- Existing global daily cost and maximum request-cost ceilings remain authoritative; Phase 9 cannot
  configure a higher ceiling from the browser or graph.
- One FastAPI graph/checkpoint process for local development.

`AI_WORKFLOWS_ENABLED`, `AI_BUSINESS_BRIEF_ENABLED`, and `AI_SUPPORT_WORKFLOW_ENABLED` default to
`false`. Support execution additionally requires an exact
`AI_SUPPORT_DATA_PROCESSING_CONFIRMED=true` operator attestation after the separate approved-data
review. Disabling the global or workflow-specific switch blocks start, resume, and action execution
but still permits authorized status reads and cancellation. Core commerce, reports, support,
documents, jobs, and notifications remain available during AI failure.

### 15. Evaluation and acceptance gate

Before Phase 9 acceptance, record and pass:

- Deterministic tests for every graph path, state transition, interrupt, resume, rejection,
  cancellation, expiry, timeout, recursion limit, checkpoint deletion/corruption, and version drain.
- 100% tool schema, registered-order, authorization, scope, row/byte, freshness, and idempotency
  enforcement across owner/admin/customer/disabled/permission-revoked cases.
- 100% approval-bypass, digest-tamper, stale-ticket, concurrent decision/cancel, and duplicate-action
  prevention; exactly one support message in every replay/failure matrix.
- At least 40 business-brief cases with at least 95% supported-finding accuracy, zero unsupported
  numeric claims, and 100% source-label validity.
- At least 60 support cases with at least 90% human-rubric helpfulness and 100% critical escalation,
  policy-citation, prompt-injection, secret-exfiltration, and no-autosend behavior.
- No sensitive canary in checkpoints, jobs, usage, audit, logs, public errors, or repository output;
  encrypted-artifact tamper and cleanup tests pass.
- Local tool p95 at or below 250 ms and paced synthetic end-to-end active execution p95 at or below
  8 seconds. Record provider tokens/exact cost, CPU/memory, checkpoint/artifact size, and cleanup
  time. Threshold changes require explicit evidence review.
- Kill-switch, Node/FastAPI/Groq/MySQL/checkpoint outage, ambiguous provider completion, worker crash,
  and crash-after-approved-action drills.
- Complete Phase 1-8 API/web/Python regression, configured coverage thresholds, lint/format/schema/
  build, development/test migration status and drift, audit verification, dependency checks,
  whitespace, and credential/content hygiene.

Routine tests use deterministic fake tools/provider and in-memory/temporary checkpoint stores. Any
metered Groq evaluation uses synthetic non-customer data, pacing for current account limits, no
content logging, and separate explicit authorization after deterministic gates pass.

## Proposed public API

- `GET|PUT|DELETE /api/v1/ai/workflow-consents/:scope`
- `POST /api/v1/ai/workflows/owner-business-brief/runs`
- `POST /api/v1/ai/workflows/support-reply/runs`
- `GET /api/v1/ai/workflow-runs`
- `GET /api/v1/ai/workflow-runs/:workflowRunId`
- `POST /api/v1/ai/workflow-runs/:workflowRunId/decisions`
- `POST /api/v1/ai/workflow-runs/:workflowRunId/cancellation`

All writes require active authentication, exact permissions, trusted origin, CSRF, strict schemas,
and UUID idempotency. Lists are bounded and scoped. A caller cannot submit graph/tool/provider/
prompt versions, actor/customer/order/source IDs, raw checkpoints, arbitrary state, resume payloads,
or model settings.

## Proposed internal APIs

Node-to-FastAPI, using the existing signing direction:

- `POST /internal/v1/workflows/start`
- `POST /internal/v1/workflows/resume`
- `DELETE /internal/v1/workflows/threads/:threadId`

FastAPI-to-Node, using a new independent signing direction:

- `POST /internal/v1/ai/workflow-tools/:toolCallId/execute`
- `POST /internal/v1/ai/workflow-model-steps/:modelStepId/reserve`
- `POST /internal/v1/ai/workflow-model-steps/:modelStepId/finalize`
- `POST /internal/v1/ai/workflow-artifacts/stage`

Every contract is strict, versioned, signed, replay-resistant, request-ID correlated, and
byte-bounded. Node derives business inputs from stored run scope. Raw checkpoint access, arbitrary
tool invocation, SQL, URLs, headers, cookies, filesystem paths, and secrets are never accepted.

## Dependency, account, connection, and environment review

### New direct dependencies requiring explicit installation approval

| Package                       | Proposed exact pin | Purpose                                                                                  | Account/secret | Operational burden                                                                  | Alternative considered                                                                                                     |
| ----------------------------- | -----------------: | ---------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `langgraph`                   |           `1.2.11` | Typed `StateGraph`, conditional edges, interrupts, recursion limits, and graph execution | None           | New Python/transitive lock; fast-moving API; version-drain discipline               | Custom state machine rejected because Phase 9 explicitly requires reviewed LangGraph behavior                              |
| `langgraph-checkpoint-sqlite` |            `3.1.1` | Async local durable checkpoints and thread deletion for repository/development           | None           | Private SQLite path; one-process limit; cleanup/corruption recovery; not production | In-memory saver cannot survive restart; Postgres adds an unapproved service; custom MySQL saver adds high maintenance risk |

As checked on 2026-09-06, PyPI lists `langgraph 1.2.11` and
`langgraph-checkpoint-sqlite 3.1.1` as the current releases; both require Python 3.10 or newer and
publish under MIT terms: [LangGraph](https://pypi.org/project/langgraph/) and
[SQLite checkpointer](https://pypi.org/project/langgraph-checkpoint-sqlite/).

The installation step must lock and inspect all transitive packages, including the checkpoint and
`langchain-core` surfaces brought by LangGraph. No `langchain` meta-package, provider SDK,
`langchain-groq`, LangSmith package/account, Postgres, Redis, BullMQ, Docker, npm dependency, new
model, or new hosted service is proposed.

### Accounts and connections

- Existing Groq account/key/model/Global ZDR only; no new provider account or model.
- New local connection: FastAPI calls the Node internal tool gateway over loopback/private HTTP
  using a separate HMAC key. No browser or Groq endpoint can reach this authority by design.
- New local persistence: one private SQLite checkpoint file outside the repository. It stores only
  opaque state metadata and is rejected in production.
- Support workflow provider calls remain synthetic-only until a separate local data approval and
  remain prohibited in production pending privacy/legal review.

### Proposed Node/API variables

| Variable                               | Purpose                                                   | Rule                                                                                             |
| -------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `AI_WORKFLOWS_ENABLED`                 | Global start/resume/action gate                           | Default `false`; rejected in production                                                          |
| `AI_BUSINESS_BRIEF_ENABLED`            | Owner graph gate                                          | Default `false`; requires global AI/workflow enablement                                          |
| `AI_SUPPORT_WORKFLOW_ENABLED`          | Support graph gate                                        | Default `false`; requires explicit approved-data confirmation                                    |
| `AI_SUPPORT_DATA_PROCESSING_CONFIRMED` | Operator attestation for support-derived provider context | Default `false`; exact `true` only after separate local data approval; production still rejected |
| `AI_WORKFLOW_NODE_SIGNING_KEY`         | Verify FastAPI-to-Node tool calls                         | Secret canonical Base64, at least 32 random bytes; distinct from other keys                      |
| `AI_WORKFLOW_NODE_SIGNING_KEY_ID`      | Rotation identifier                                       | Strict bounded non-secret identifier                                                             |
| `AI_WORKFLOW_ARTIFACT_KEY`             | Encrypt MySQL workflow artifacts                          | Secret canonical Base64, exactly 32 bytes; separate cryptographic domain                         |
| `AI_WORKFLOW_ARTIFACT_KEY_ID`          | Artifact key rotation identifier                          | Strict bounded non-secret identifier                                                             |
| `AI_WORKFLOW_RATE_LIMIT_MAX`           | Per-user start burst                                      | Fixed default `5`; bounded downward operationally                                                |
| `AI_WORKFLOW_DAILY_RUN_LIMIT`          | Per-user UTC run limit                                    | Fixed default `30`; cannot exceed reviewed maximum                                               |

### Proposed FastAPI variables

| Variable                               | Purpose                                   | Rule                                                      |
| -------------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| `AI_WORKFLOWS_ENABLED`                 | Graph subsystem gate                      | Default `false`; rejected in production for this baseline |
| `AI_WORKFLOW_NODE_URL`                 | Node tool gateway                         | Required loopback URL when enabled                        |
| `AI_WORKFLOW_NODE_SIGNING_KEY`         | Sign AI-to-Node requests                  | Same secret as Node verifier; never logged/tracked        |
| `AI_WORKFLOW_NODE_SIGNING_KEY_ID`      | Rotation identifier                       | Must match Node configuration                             |
| `AI_SUPPORT_DATA_PROCESSING_CONFIRMED` | Defense-in-depth support-data attestation | Default `false`; must match the approved Node posture     |
| `AI_WORKFLOW_CHECKPOINT_PATH`          | Local SQLite file                         | Required absolute private non-repository path             |
| `LANGGRAPH_STRICT_MSGPACK`             | Safe checkpoint deserialization           | Required exact `true`                                     |
| `AI_WORKFLOW_MAX_CONCURRENCY`          | Local graph execution bound               | Default and maximum `1`                                   |

Graph/tool/step/row/message/context/approval/retention limits are reviewed code constants, not
browser-controlled environment expansion points.

## Proposed implementation sequence after approval

1. Record the accepted baseline in ADR 0012 and separately approve the two exact Python packages.
2. Install and lock only those direct packages; inspect transitive licenses, Python 3.13/Windows
   compatibility, dependency conflicts, advisories, import behavior, and credential scans.
3. Implement configuration and two-direction signed boundary tests before enabling any workflow.
4. Add migration-controlled permissions, workflow/approval/artifact/tool schema, AI enum/link
   changes, support origin, constraints, indexes, and safe migration tests.
5. Implement Node workflow lifecycle, encryption, tool gateway, fixed tool adapters, provider-step
   reservations, audit contracts, and registered jobs.
6. Implement typed versioned LangGraph definitions, metadata-only checkpoint validation,
   start/resume/delete contracts, and deterministic fake-provider paths.
7. Implement public API and responsive owner/support run, review/edit/approve/reject/cancel UI.
8. Implement cleanup/recovery, kill switches, all authorization/concurrency/tamper/outage tests, and
   the synthetic evaluation suites.
9. Run the complete repository gate, document evidence/runbooks, and request separate authorization
   before any metered synthetic live evaluation or non-synthetic local support data use.
10. Request explicit Phase 9 repository/development acceptance only after all criteria pass.

## Approval checklist

- [x] The two fixed workflows and no general-purpose agent.
- [x] Node authority, fixed graph-selected tools, independent signed reverse gateway, and no AI
      database credential.
- [x] Owner business brief inputs/tools/freshness/provenance and read-only behavior.
- [x] Support public-context/customer-policy inputs, encrypted draft, mandatory human approval,
      AI-assisted source label, and exactly one idempotent reply action.
- [x] The proposed three permissions and permission/approval matrix.
- [x] Separate `groq-zdr-workflows-v1` processing notice and synthetic-only support provider use
      until separately approved.
- [x] MySQL workflow metadata plus short-lived AES-256-GCM encrypted artifact storage.
- [x] Metadata-only local SQLite checkpoints, strict msgpack, cleanup, no time travel/fork/replay,
      and production rejection.
- [x] Limits, kill switches, audit/redaction, retention, evaluation, and recovery gates.
- [x] Separate installation approval for `langgraph==1.2.11` and
      `langgraph-checkpoint-sqlite==3.1.1`.

## Explicitly deferred

- Customer-facing Phase 9 workflows, persistent chat/memory, free-form agents, model-selected tools,
  dynamic planning, subagents, arbitrary graph construction, and streaming.
- Internal-note processing, full customer profile/address/email/phone data, unrestricted order or
  payment records, broad document audiences, or owner-document use in support drafts.
- Automatic public replies, ticket priority/status/assignment changes, refunds, payment/order/
  inventory/catalog/user/role changes, exports, emails, SMS, webhooks, or any other external action.
- Financial/destructive/credential/permission actions and their mandatory two-person approval.
- LangChain agents, LangSmith tracing/account, provider SDKs, unrestricted HTTP/browser/code/shell/
  SQL/filesystem tools, and AI access to MySQL credentials.
- Production checkpoint/artifact topology, hosted tracing/monitoring, multi-instance tool/nonces/
  rates/checkpoints, production privacy/legal basis, retention/erasure/legal holds, SLO/load/soak,
  backup/restore, and rollout approval.
