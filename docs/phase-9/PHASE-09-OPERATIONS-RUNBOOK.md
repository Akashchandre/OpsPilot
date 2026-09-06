# Phase 9 Operations and Recovery Runbook

## Scope

This runbook covers the approved single-machine repository/development topology only. It does not
authorize production, non-synthetic support-data processing by a model, metered workflow
evaluation, or a new graph/tool/action.

## Safe initial state

Keep these Node settings false until the required development checks and approvals are satisfied:

```dotenv
AI_WORKFLOWS_ENABLED=false
AI_BUSINESS_BRIEF_ENABLED=false
AI_SUPPORT_WORKFLOW_ENABLED=false
AI_SUPPORT_DATA_PROCESSING_CONFIRMED=false
```

Keep FastAPI `AI_WORKFLOWS_ENABLED=false` as well. Both services reject the local Phase 9 topology
in production. The support gate additionally requires the Phase 8 document boundary and the exact
support-data confirmation; under the current approval it must remain disabled for non-synthetic
data.

## Dependencies and database preparation

The only new direct dependencies are exactly `langgraph==1.2.11` and
`langgraph-checkpoint-sqlite==3.1.1`, recorded in `apps/ai/pylock.toml`. Do not float or upgrade
them without a compatibility, license, checkpoint, and security review.

From the repository root, use the project Python 3.13 environment and approved Node 24 runtime:

```powershell
apps\ai\.venv\Scripts\python.exe -m pip check
npm run db:validate
npm run db:deploy
```

Verify `20260906090000_phase_9_langgraph_workflows` is applied and run `prisma migrate diff` against
both development and test before enabling workflows. Never edit an applied migration.

## Private keys and checkpoint path

Configure four non-empty identifiers/secrets across the existing ignored environment files:

- the existing Node-to-FastAPI `AI_SERVICE_SIGNING_KEY` and key ID;
- a distinct FastAPI-to-Node `AI_WORKFLOW_NODE_SIGNING_KEY` and key ID, identical on both services;
- a separate exact 32-byte Base64 `AI_WORKFLOW_ARTIFACT_KEY` and key ID on Node; and
- an absolute `AI_WORKFLOW_CHECKPOINT_PATH` outside the repository, web roots, document store,
  vector store, and model cache.

Use independently generated cryptographically random key material. Never place real values in
tracked examples, command arguments, logs, tickets, screenshots, or audit metadata. Preserve
`LANGGRAPH_STRICT_MSGPACK=true` and `AI_WORKFLOW_MAX_CONCURRENCY=1`.

## Development enablement order

1. Confirm MySQL, Phase 7 provider/ZDR configuration, Phase 8 RAG health if support is ever
   separately approved, and both audit verifiers.
2. Configure the private checkpoint directory with access limited to the AI service identity.
3. Start Node API and FastAPI with all workflow gates still false; verify normal health.
4. Enable FastAPI `AI_WORKFLOWS_ENABLED=true` with the loopback Node URL and reverse signing key.
5. Enable Node `AI_WORKFLOWS_ENABLED=true` and `AI_BUSINESS_BRIEF_ENABLED=true`; restart API,
   worker, and AI service so validated configuration is immutable for the process lifetime.
6. Accept the `groq-zdr-workflows-v1` owner workflow notice through the UI before a run.
7. Do not enable `AI_SUPPORT_WORKFLOW_ENABLED` or set support-data confirmation for real local data
   without the separately documented approval.

Run the API, worker, AI service, and web app using their existing workspace commands. The worker is
required because starts, resumes, and retention use the durable MySQL job queue.

## Routine checks

Before and after a workflow change, run:

```powershell
npm run lint
npm run format:check
npm run test:coverage --workspace @opspilot/api
npm run test:coverage --workspace @opspilot/web
npm run build
apps\ai\.venv\Scripts\ruff.exe check apps/ai
apps\ai\.venv\Scripts\ruff.exe format --check apps/ai
apps\ai\.venv\Scripts\python.exe -m pytest --cov=opspilot_ai
apps\ai\.venv\Scripts\python.exe -m pip check
```

The opt-in local bidirectional smoke requires no provider call and must use the isolated test
database:

```powershell
$env:OPSPILOT_RUN_CROSS_SERVICE_SMOKE='true'
$env:OPSPILOT_NODE_BINARY='C:\tmp\opspilot-node24\node-v24.19.0-win-x64\node.exe'
apps\ai\.venv\Scripts\python.exe -m pytest apps/ai/tests/test_cross_service.py -m cross_service -s
```

Do not set the live RAG/workflow opt-in or run a metered model evaluation without separate approval.

## Monitoring and evidence

Use authorized run detail, jobs, audit, and aggregate AI-usage views. Investigate growth or age in
`QUEUED`, `RUNNING`, `AWAITING_APPROVAL`, `APPROVED`, or `UNKNOWN`; repeated signature/replay
failures; cost reservation mismatches; stale approvals; retention failures; or missing worker
heartbeats. Logs and audit evidence must remain metadata-only.

Business output must show its UTC scope, facts/source labels, snapshot freshness, calculation basis,
and uncertainty. Support review must show approval expiry, draft digest, source freshness, and the
AI-assisted label if published.

## Kill switch and cancellation

For an incident, first set the relevant workflow-specific Node gate false; use the global Node and
FastAPI workflow gates for a broad stop, then restart the affected processes. Disabled gates block
new start/resume/effect execution. Existing authorized users can still inspect and cancel their
runs so incident recovery is not trapped behind the kill switch.

Do not delete MySQL run/usage/audit rows manually. Cancel nonterminal runs through the public API or
UI. Preserve evidence for any `UNKNOWN` run until reconciled.

## Recovery matrix

| Condition | Safe response |
| --- | --- |
| FastAPI/provider unavailable before a known response | Run becomes failed, reservation closes, and no automatic inference retry occurs; correct the dependency and start a new run |
| Ambiguous model/tool boundary | Keep `UNKNOWN`, disable the affected graph if repeated, inspect metadata and authoritative domain state, and never replay an action blindly |
| Checkpoint missing/corrupt/mismatched | Cancel or expire the run, retain metadata/audit evidence, delete the bad thread through the signed route, and start a new graph version/run |
| Approval expired, digest changed, or source stale | No publish; reject/cancel and create a fresh run from current sources |
| Reviewer permission/consent revoked | No resume or effect; another currently authorized reviewer may act only if all bound evidence remains valid |
| Concurrent decision/cancel | Treat the successful optimistic transition as authoritative; the loser receives conflict and must refresh |
| Reply receipt present but client timed out | Read the run/ticket; the unique workflow relationship prevents a second customer-visible reply |
| Retention sweep partially fails | Leave cleanup markers incomplete, repair connectivity/path, and rerun the idempotent sweep; do not mark checkpoint deletion before FastAPI confirms it |

## Retention, backup, and key rotation

The local SQLite checkpoint and encrypted artifacts are intentionally short-lived and are not an
approved production backup source. Run the registered retention sweep with the worker active and
alert on overdue terminal artifacts/checkpoints.

Key-ID changes require a coordinated drain: disable starts, allow or cancel active runs, confirm no
artifact needed for approval/recovery depends on the old key, deploy both sides for signing-key
rotation, verify the signed smoke, then re-enable. There is no automatic artifact re-encryption or
multi-key checkpoint migration in this baseline.

## Immediate rollback and escalation

Disable the graph-specific gate, then the global gates if the issue is shared. Preserve MySQL and
private checkpoint evidence, verify the audit chain, and record safe IDs/reason codes only. Escalate
any suspected data exposure, unauthorized tool attempt, approval bypass, duplicate action,
signature-key compromise, plaintext persistence/logging, or unbounded cost/loop immediately.

Production remains blocked on private networking/TLS or mTLS, shared replay/rate/concurrency state,
durable encrypted multi-instance checkpoints, KMS rotation, backup/restore, retention/erasure/legal
holds, privacy/legal/subprocessor review, monitoring/alerts, SLO/load/soak testing, incident
ownership, model/account controls, and explicit rollout approval.
