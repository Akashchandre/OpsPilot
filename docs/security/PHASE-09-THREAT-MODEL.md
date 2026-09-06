# Phase 9 LangGraph Workflow and AI Support Threat Model

## Status

**ACCEPTED AND IMPLEMENTED under ADR 0012; verification passes as of 2026-09-06.** This threat
model covers only the two fixed workflows and controls in the Phase 9 repository/development
baseline. Production and deferred workflows/actions remain unapproved.

## Scope

This review covers:

- owner business-brief and support reply-draft workflows;
- MySQL workflow/tool/approval/artifact metadata and existing job/worker coordination;
- metadata-only local SQLite LangGraph checkpoints;
- signed Node-to-FastAPI start/resume and FastAPI-to-Node tool/model/artifact calls;
- narrow report, inventory, support, order-status, and customer-policy tools;
- Groq synthesis under the accepted fixed model and ZDR controls;
- support draft review/edit/reject/cancel and one approved public-reply action;
- permissions, consent, cost, audit, logs, UI, retention, cleanup, recovery, and kill switches.

General agents, model-selected tools, unrestricted SQL/HTTP/browser/code/shell/filesystem access,
internal-note processing, autonomous replies, ticket state changes, financial/destructive/
permission actions, external channels, production checkpoints, multi-instance deployment, and
production rollout are outside scope. Adding any of them requires a new threat review.

## Protected assets

- Business overview, exact stock, support aggregates, ticket/order status, public ticket messages,
  approved document excerpts, generated briefs/drafts, and human edits.
- User/session/permission/consent state and owner/admin/customer separation.
- Workflow run, tool, provider-step, approval, action, idempotency, freshness, and audit integrity.
- Encrypted artifact ciphertext/AAD/key, LangGraph checkpoint state/path, both internal signing keys,
  Groq key, document key, and audit key.
- Support message authorship, AI-assisted provenance, ticket history, and notification integrity.
- Provider usage/cost reservations and ambiguous-completion evidence.

## Trust boundaries

```text
Untrusted browser
  -> Node public API: session/RBAC/CSRF/schema/idempotency/rate/cost checks
  -> authoritative MySQL run + registered job + encrypted artifacts
  -> separate JavaScript worker
  -> signed/replay-resistant FastAPI graph boundary
  -> private metadata-only SQLite checkpoint
  -> signed/replay-resistant Node tool gateway
  -> existing scoped business/RAG/support services
  -> Groq under required ZDR and strict schema
  -> Node approval/action reauthorization
  -> plain-text React rendering
```

Neither LangGraph, its checkpoint, FastAPI, Qdrant, nor Groq is an authorization authority. A model
response cannot create a permission, approval, tool call, actor identity, or business effect.

## Threats, controls, and required verification

### 1. Unauthorized run creation, read, decision, or cancellation

**Threat:** An anonymous, customer, disabled user, admin outside the business workflow, stale
session, or guessed run ID exposes data or changes workflow state.

**Required controls:** Authenticate every public route; require exact workflow plus domain
permissions; enforce trusted origin, session-bound CSRF, UUID idempotency, target visibility,
initiator/support-team run scope, optimistic versions, and safe not-found responses. Reauthorize on
every read and transition; UI hiding is not authorization.

**Required verification:** Full anonymous/role/custom-permission/disabled/revoked-session matrix;
guessed/cross-user run and artifact IDs; CSRF/origin failures; permission/consent change before and
after generation; prove no raw checkpoint/artifact endpoint exists.

### 2. Internal tool-gateway forgery, replay, reflection, and confused deputy

**Threat:** A browser, provider, compromised request, replayed nonce, wrong-direction signature, or
FastAPI request invokes Node business tools outside a valid run.

**Required controls:** Separate AI-to-Node HMAC key/key ID; canonical timestamp/nonce/request ID/
method/path/body digest; constant-time verification; bounded skew; replay cache; exact private peer;
strict content type/length/schema; distinct route prefix; server-created run/tool IDs; current
run/version/tool/ordinal checks. Never accept cookie or model text as internal authority.

**Required verification:** Missing/wrong/stale/replayed/reflected signatures, key ID rotation,
method/path/body mutation, duplicate JSON, oversized/truncated body, forwarded-source spoofing,
browser-cookie-only requests, unknown tool/run/version/ordinal, and concurrent duplicate calls.

### 3. Prompt injection chooses or widens a tool

**Threat:** Ticket or document text instructs the model to call a different tool, alter arguments,
query another ticket, access owner documents, reveal secrets, or claim an action occurred.

**Required controls:** Do not bind tools to the model. Static graph code chooses exact registered
nodes; Node derives all arguments from immutable run scope. Delimit ticket/document content as
untrusted data; strict output schemas contain no tool/action fields. Unknown source labels or action
claims invalidate output.

**Required verification:** Direct/indirect injection corpus with fake system/tool/approval JSON,
encoded instructions, guessed IDs, cross-ticket/source requests, SQL/HTTP/shell requests, secret
bait, and false action-completion claims. Required unauthorized tool/effect count is zero.

### 4. Cross-role, cross-ticket, or document-audience leakage

**Threat:** An owner/admin reads another user's owner result without policy, a customer discovers a
run, a support tool fetches the wrong ticket/order, or an owner-only document becomes support
context.

**Required controls:** Initiator-only owner results; current support-management visibility for
support runs; immutable target ID; ticket-to-order relationship check; `CUSTOMER`-audience document
filter plus Phase 8 Node reauthorization; no internal notes; safe indistinguishable errors; final
authorization on every artifact read.

**Required verification:** Guessed run/ticket/order/document/chunk/artifact/approval IDs;
owner-to-owner result isolation; admin business denial; customer denial; mismatched order; owner
audience source; archived/superseded/deleted document during generation; zero leaked canaries.

### 5. Sensitive support data or secret exposure to Groq

**Threat:** Customer messages contain email, phone, address, payment credentials, passwords,
tokens, health/legal data, or other sensitive content that is unnecessarily sent or retained.

**Required controls:** Latest eight public messages only; exclude requester/author identity,
addresses, provider IDs, internal notes, and full order/payment data; deterministic high-risk secret/
payment-pattern detection and redaction; 8,000-byte cap; separate workflow notice; Global ZDR check;
default-disabled support gate; synthetic-only provider use until explicitly approved. Production
legal basis and sensitive-data policy remain blockers.

**Required verification:** Seeded emails/phones/addresses/card-like values/passwords/tokens/API keys,
internal notes, long messages, mixed Unicode, encoded secrets, and provider/log/checkpoint/database
canaries. Prove blocked/redacted content never reaches provider fixtures or durable plaintext.

### 6. Plaintext artifact or checkpoint disclosure

**Threat:** Tool output, ticket content, policy excerpts, drafts, edits, or final results appear in
MySQL plaintext, SQLite checkpoints, jobs, audit, logs, errors, repository files, or backups.

**Required controls:** Node AES-256-GCM artifact encryption with separate key domain and
authenticated relationships; metadata-only graph schema; private absolute checkpoint path;
strict msgpack safe-type allowlist; no content in jobs/tool receipts/usage/audit; short cleanup;
no plaintext temporary files; content-redacted logging.

**Required verification:** Cipher round trip, random nonce, bit flip, tag/header/AAD/run/purpose/
digest swap, wrong/missing key, rotation interruption, checkpoint byte scan, job/audit/usage/log/
error/repository scans, unsafe path/symlink/reparse tests, and cleanup after every terminal state.

### 7. Unsafe checkpoint deserialization or database tamper

**Threat:** A modified SQLite blob triggers unsafe object construction, changes node/state, or
resumes a run with forged metadata.

**Required controls:** `LANGGRAPH_STRICT_MSGPACK=true`, explicit primitive allowlist, typed state
validation after load, Node comparison of run/graph/thread/tool/approval/digest/version, private
single-process path, no browser checkpoint access, and terminal failure on any mismatch. Production
rejects SQLite.

**Required verification:** Corrupt/truncated blobs, unexpected type/module, forged run/tool/digest/
decision, missing node/state field, unknown graph version, copied checkpoint across threads, second
process, and wrong checkpoint path. No business tool/action executes after mismatch.

### 8. Human-approval bypass or forged decision

**Threat:** Model output, a resume payload, initiator, stale browser, or internal caller marks a
draft approved without a qualified current human.

**Required controls:** Approval is a locked Node row created only by the public authenticated
decision endpoint; FastAPI state is not authority. Require separate approval permission, current
support/order permissions, CSRF, idempotency, optimistic version, draft/context digests, expiry,
reviewer actor, and audit. Action tool reloads the approval immediately before effect.

**Required verification:** Model-generated approval strings, direct internal resume, missing/
revoked approval permission, disabled reviewer, stale version, expired/rejected/cancelled decision,
wrong draft/ticket, forged reviewer, and approval changed during action. Required bypass count is
zero.

### 9. Duplicate reply through resume, worker retry, or partial failure

**Threat:** Interrupt node restart, job replay, network timeout, checkpoint failure, or crash after
commit creates multiple customer-visible replies.

**Required controls:** Side-effect-free approval node; separate publication node; deterministic
server-stored support idempotency key; unique approval/action/run relationships; existing support
service idempotency; action receipt committed with message/audit/job effects; resume returns the
recorded result. Owner job replay cannot clear receipts.

**Required verification:** Crash before/after approval commit, action start, support-message commit,
response, and checkpoint write; duplicate worker claim; lease expiry; concurrent resume; manual job
replay; lost HTTP response. Every matrix produces zero or exactly one message as expected.

### 10. Duplicate or unaccounted provider calls

**Threat:** Worker retries or a crash after Groq accepts a request causes duplicate spend or
different drafts under one run.

**Required controls:** One server-created model-step usage reservation per run; existing global cost
hold; no provider retry; no second call when usage is `PENDING`, `SUCCEEDED`, or `UNKNOWN`; exact
provider request/token/cost metadata when known; ambiguous completion suppresses output/action and
marks the run `UNKNOWN`.

**Required verification:** Timeout/connection reset before and after response, `429`, `5xx`, invalid
JSON/schema, finalization failure, worker restart, checkpoint failure, duplicate advance job, cost
ceiling, and unknown-cost recovery. Provider fixture call count must be one or zero.

### 11. Stale business brief or stale support approval

**Threat:** Tool snapshots disagree in time, business facts change, or a ticket/customer reply
changes after a draft is reviewed.

**Required controls:** UTC range and `asOf` per tool; 30-second snapshot spread and 60-second
synthesis freshness bounds; facts displayed separately from interpretation; support context digest
includes current ticket status and latest public-message identity; action rechecks immediately
before commit. Stale approval cannot be overridden.

**Required verification:** Clock boundaries, delayed tool, data mutation between tools, ticket
status/message/order change before decision and before action, document lifecycle change, and
database replica-like stale fixture. Stale paths fail or require a new run.

### 12. Hallucinated facts, policy, certainty, or completed actions

**Threat:** A brief invents metrics or causal claims; a support draft fabricates policy/refund
status, hides uncertainty, or says a change was completed.

**Required controls:** Strict source-labelled schema; exact facts rendered separately; policy claims
require supplied customer-document labels; unsupported/contradictory evidence yields uncertainty or
escalation; fixed prompts prohibit action claims and forecasts; deterministic output validator;
plain AI-generated labels.

**Required verification:** Missing/zero/contradictory/stale tool data, unsupported arithmetic,
misleading percentages, policy-free ticket, conflicting documents, refund/security requests,
fabricated citations/actions, and human rubric evaluation. Critical numeric/policy/action errors
must be zero.

### 13. Unsafe human edit, XSS, or authorship laundering

**Threat:** A reviewer edits a draft to executable markup, oversized/invalid content, or content
attributed to the model rather than the accountable operator.

**Required controls:** Reuse the existing plain-text support-body validation and React text
rendering; no Markdown/HTML execution; 4,000-character edit maximum; approver is stored as message
author; `AI_ASSISTED` origin and workflow ID are server-set; digest binds reviewed text. The
workflow grants no capability beyond the reviewer's ordinary support permission.

**Required verification:** HTML/script/Markdown/Unicode controls, oversized/empty edit, digest swap,
different reviewer, source-marker tamper, direct message API comparison, UI DOM escaping, and audit
actor/source checks.

### 14. Graph loop, timeout, version drift, or unavailable approver

**Threat:** A graph loops, exceeds cost/time, resumes under changed nodes, waits forever, or gets
stuck when a reviewer disappears.

**Required controls:** Static acyclic v1 paths, recursion limit 12, async node/run timeouts, one
provider call, graph version registry, old-version drain, 30-minute approval expiry, 24-hour run
expiry, cancellation, safe terminal states, and cleanup sweep. No automatic migration or guessed
resume.

**Required verification:** Forced cycle, recursion error, node/run timeout, missing/renamed node,
new graph deployed over paused thread, unavailable/permission-revoked approver, expiry race,
cancel/resume race, and cleanup/restart. No effect occurs outside the stored version/state.

### 15. Kill-switch, dependency, service, or storage failure

**Threat:** Disabled workflows still start/resume/act, or Node/FastAPI/Groq/MySQL/SQLite/Qdrant
failure causes unsafe fallback or blocks core services.

**Required controls:** Global plus workflow-specific fail-closed gates at public route, worker,
FastAPI, tool gateway, and action; no general-knowledge/unfiltered fallback; stable safe failures;
status reads/cancellation remain available where safe; core APIs are independent. Production rejects
the local checkpoint topology.

**Required verification:** Toggle each switch at every step, missing/corrupt/read-only/full SQLite,
Node tool outage, FastAPI/Groq/Qdrant/MySQL outage, document retrieval failure, worker loss, and
restart. Core catalog/commerce/support/report/document APIs remain healthy.

### 16. Dependency or observability supply-chain expansion

**Threat:** LangGraph/checkpointer transitives add unsafe deserialization, incompatible packages,
unexpected network/tracing, telemetry, runtime download, or unsupported Python behavior.

**Required controls:** Exact direct pins and committed lock; license/advisory/dependency/wheel review;
strict imports; no LangSmith key/account/tracing; no runtime package/model download; outbound network
allowlist remains only the existing Groq endpoint; dependency checks in the routine gate.

**Required verification:** Lock consistency, Python 3.13/Windows installation, dependency conflicts,
licenses/advisories, import/startup with network blocked except explicit provider tests, absence of
LangSmith variables/traffic, and credential scan.

## Security acceptance requirements

- Zero unauthorized tool, document, ticket, run, artifact, checkpoint, approval, or action access.
- Zero approval bypass and zero duplicate support messages across retry/resume/crash tests.
- Zero model-selected/arbitrary tool execution and zero financial/destructive/permission action.
- Zero sensitive plaintext in checkpoints, jobs, usage, audit, logs, errors, or repository files.
- 100% critical injection/exfiltration/escalation/citation/action-claim cases pass.
- Every tool/provider/action step rechecks current Node authority and fixed run scope.
- Kill-switch, timeout, corruption, ambiguous provider, stale approval, and recovery drills pass.
- Prior-phase authentication/RBAC/audit/job/support/report/RAG/AI regressions remain green.

## Retained production blockers

- Approved production graph/checkpoint service, encryption/KMS, database/network/IAM, multi-instance
  consistency, backup/restore, version drain, corruption recovery, capacity, SLO, and cost.
- Final legal basis and notices for processing customer support content, sensitive-data handling,
  AI-assisted disclosure, retention/erasure/legal holds, complaints/corrections, and incident owner.
- Production internal service identities, mTLS/private networking, shared nonce/rate/concurrency
  controls, supervision, monitoring/alerts/tracing, provider/model rollback, and load/soak evidence.
- Any future financial, destructive, permission, credential, bulk, or external-channel action and
  its independent two-person approval design.
- Explicit production rollout approval. Repository/development completion does not grant it.
