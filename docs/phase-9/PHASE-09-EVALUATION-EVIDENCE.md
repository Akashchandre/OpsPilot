# Phase 9 Evaluation Evidence

## Result

**PASS for the approved repository/development baseline on 2026-09-06.** Deterministic workflow,
adversarial, approval, recovery, privacy, performance, cost, and full regression gates pass. No
metered workflow inference or non-synthetic support-data processing was performed.

## Fixed offline workflow evaluation

The content-free evaluator uses 40 business and 60 support cases with no provider call. Its fixed
business set rotates the three authoritative source labels. Its support set evenly covers normal,
policy, escalation, prompt-injection, exfiltration, and insufficient-context cases.

| Metric | Required | Measured |
| --- | ---: | ---: |
| Business cases | 40 | 40 |
| Supported-finding accuracy | >= 95% | 100% |
| Source-label validity | 100% | 100% |
| Unsupported numeric claims | 0 | 0 |
| Support cases | 60 | 60 |
| Helpful/correct outcome rubric | >= 90% | 100% |
| Critical escalation/injection/exfiltration safety | 100% | 100% |
| Policy citation validity | 100% | 100% |
| Prompt-injection boundary | 100% | 100% |
| No automatic send | 100% | 100% |

The final run used zero provider calls, recorded no content, emitted no secrets, completed in
19.292 ms wall / 15.625 ms CPU, and peaked at 143,191 allocated bytes. The serialized evidence
contains case IDs and aggregate metrics, not prompts, drafts, or synthetic message text.

## Bidirectional signed contract and performance smoke

The explicit opt-in local smoke starts a real FastAPI app with a deterministic provider and a real
Node API against `opspilot_test`. It exercises Node -> FastAPI start/resume, FastAPI -> Node fixed
tools/model reservation/finalization, AES-GCM artifacts, SQLite checkpoints/cleanup, exact usage
accounting, and five synthetic workflow runs.

| Metric | Gate | Measured |
| --- | ---: | ---: |
| Workflow cases | 5 | 5 |
| Provider steps | 5 | 5 |
| Signed tool calls | 15 | 15 |
| Authoritative sources | 15 | 15 |
| Workflow p95 | <= 8,000 ms | 270.757 ms |
| Tool p95 | <= 250 ms | 71.660 ms |
| Total tokens | exact | 600 |
| Cost ticks | exact | 500,000 |
| Encrypted artifact bytes | > 0 | 6,300 |
| Checkpoint bytes | > 0 | 362,376 |
| Checkpoint cleanup | observed | 74.809 ms |
| Process CPU / RSS | observed | 1,375 ms / 247,332,864 bytes |

The boundary signature passed in both directions. The emitted evidence confirmed no application
content and no signing/artifact secrets. The existing Phase 7 signed smoke also passed in the same
run; the separately gated live RAG test remained skipped.

## Security, state, and recovery coverage

Automated tests cover:

- fixed graph/tool sequences, strict request/output schemas, bounded prompts, step/recursion and
  invocation timeouts, support gate enforcement, and no automatic inference retry;
- HMAC key/timestamp/nonce/body validation, replay rejection, raw-body handling, strict duplicate-
  JSON rejection on FastAPI, and separate signing domains;
- owner/admin/customer permission isolation; missing, disabled, or changed authority; consent
  acceptance/revocation; kill switches; and authorized recovery reads/cancellation;
- fixed server-derived tool arguments, source freshness/provenance, artifact encryption/AAD/digest
  validation, absence of plaintext persistence, and content-free logging/audit evidence;
- support nonreviewable outcomes, interrupt/resume, exact-digest edit/approve, rejection, stale or
  expired approval, permission change immediately before effect, concurrent decision/cancel, and
  exactly-once AI-assisted public reply;
- duplicate completed resume, checkpoint identity mismatch/deletion/corruption, provider/tool
  failure, pending usage cleanup, safe unknown state, cancellation, expiry, and retention cleanup.

## Full regression and coverage

- API: 39 files / 209 tests pass. Coverage is 82.41% statements, 73.59% branches, 91.67%
  functions, and 86.06% lines.
- Web: 8 files / 53 tests pass. Coverage is 80.62% statements, 71.79% branches, 80.60% functions,
  and 82.81% lines.
- Python: 165 pass, 3 explicit opt-in skips, and 2 non-failing upstream/local-adapter warnings.
  Total coverage is 82.87% against the enforced 80% minimum.
- ESLint, Prettier, Prisma format/validation, Ruff lint/format, `pip check`, and the Vite production
  build pass. The build transforms 113 modules and emits 432.10 kB JavaScript (120.33 kB gzip),
  34.62 kB CSS (7.25 kB gzip), and a 0.46 kB HTML entry.
- All 15 migrations are applied to development and test with zero schema diff. Audit verification
  passes over 132 development events and the cleaned zero-event test state.
- A high-confidence tracked literal-secret/private-key scan is clean.

## Dependency review

The exact new direct pins are `langgraph==1.2.11` and
`langgraph-checkpoint-sqlite==3.1.1`; both installed distributions report MIT license expressions,
and `pip check` reports no broken requirements.

`npm audit --omit=dev` currently reports seven transitive findings: five high and two moderate in
`deepmerge-ts`, `mariadb`, `mysql2`, and `qs`. The Prisma/MariaDB chain was already documented;
`qs` adds a current moderate finding. npm proposes a breaking Prisma downgrade for part of the
tree, and the MariaDB adapter path has no complete fix. No unapproved dependency mutation was made.

## Limits of this evidence

The offline evaluator validates deterministic policy/output invariants, not probabilistic model
quality. The signed smoke uses a deterministic synthetic provider and single-machine local
services; it is not a concurrent load/soak test or production SLO. A metered Groq workflow
evaluation, any real local support-ticket model processing, production checkpoint/storage/network
topology, and ongoing model-quality monitoring all require separate approval.
