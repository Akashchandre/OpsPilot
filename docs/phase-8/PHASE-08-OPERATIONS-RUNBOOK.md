# Phase 8 Operations and Recovery Runbook

## Scope

This runbook covers the approved repository/development Phase 8 topology: one Node API/worker, one
loopback FastAPI process, MySQL, a private encrypted filesystem object root, a private local Qdrant
directory, and the pinned locally cached MiniLM model. It does not approve public FastAPI/Qdrant
exposure, multiple processes sharing local Qdrant, or production/customer deployment.

## Safe initial state

Keep secrets and local paths only in ignored environment files. Start from all optional gates off:

- API: `AI_ENABLED=false`, `DOCUMENTS_ENABLED=false`.
- AI: `AI_PROVIDER_ENABLED=false`, `AI_RAG_ENABLED=false`.
- API and AI: the same dedicated Base64 HMAC key and key ID.
- API only: a dedicated Base64 32-byte document encryption key, non-secret key ID, and absolute
  private object root outside the repository/web roots.
- AI only: absolute, distinct, non-repository model-cache and Qdrant paths.

Confirm ignore coverage without displaying values:

```powershell
git check-ignore apps/api/.env apps/api/.env.test apps/ai/.env
```

Never place a signing/encryption/Groq key, document content, provider body, or private path listing
in source, docs, shell arguments, logs, screenshots, issues, or evaluation reports.

## Install, migrate, and prepare the model

Use the exact committed Node lock and Python 3.13 dependency lock. No additional parser, OCR,
vector-server, SDK, or model package is approved.

```powershell
npm install --workspaces --include-workspace-root
cd apps/ai
python -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --group dev
$env:PYTHONPATH=(Resolve-Path -LiteralPath .\src).Path
```

`qdrant-client==1.19.0`, `fastembed==0.8.0`, and
`sentence-transformers/all-MiniLM-L6-v2` revision
`5f1b8cd78bc4fb444dd171e59b18f3a3af89a079` are the only accepted Phase 8 dependency/model
baseline. The model download is a deliberate one-time operation. After it is cached, verify the
offline retrieval evaluation with network unavailable; do not allow an unreviewed runtime model
download.

Apply migrations and verify both configured databases before enabling documents:

```powershell
cd ../..
npm run db:deploy
npm run db:status
```

Use the test environment separately and require all 14 migrations plus a zero-difference
`prisma migrate diff --from-migrations prisma/migrations --to-config-datasource --exit-code`.

## Start and enable in development

1. Create empty private object and Qdrant directories with access limited to the local service
   account. Do not place either directory below the repository, web root, synchronized/public
   folder, or a filesystem root.
2. Populate ignored configuration while all gates remain false.
3. Start FastAPI on loopback and verify signed internal health through Node or the deterministic
   cross-service smoke.
4. Set `AI_RAG_ENABLED=true` only after the pinned cache and Qdrant directory initialize and report
   `embedding: ready`, `vectorIndex: ready`.
5. Start the Node API and worker. Set `DOCUMENTS_ENABLED=true` only after storage health is ready.
6. Keep `AI_ENABLED=false` until Groq ZDR/account review, redacted preflight, retrieval evaluation,
   live grounded-answer evaluation, and signed live gate pass.
7. Enable Node AI last, restart it, and verify public health. Do not expose FastAPI or local Qdrant.

Start FastAPI from `apps/ai`:

```powershell
$env:PYTHONPATH=(Resolve-Path -LiteralPath .\src).Path
& .\.venv\Scripts\python.exe -m uvicorn opspilot_ai.main:app --host 127.0.0.1 --port 8000
```

Run the API and worker in separate supervised terminals/processes. The browser calls only Node.

## Routine verification

Routine checks make no provider request:

```powershell
npm run lint
npm run format:check
npm run test:coverage
npm run build

cd apps/ai
& .\.venv\Scripts\python.exe -m ruff check .
& .\.venv\Scripts\python.exe -m ruff format --check .
& .\.venv\Scripts\python.exe -m pip check
& .\.venv\Scripts\python.exe -m pytest --cov=opspilot_ai --cov-report=term-missing
```

Run the deterministic signed Node-to-FastAPI smoke explicitly:

```powershell
$env:OPSPILOT_RUN_CROSS_SERVICE_SMOKE='true'
$env:OPSPILOT_NODE_BINARY=(Get-Command node).Source
& .\.venv\Scripts\python.exe -m pytest tests\test_cross_service.py -q -k real_node_to_fastapi
```

Run the offline retrieval gate against the already-approved cache:

```powershell
$env:OPSPILOT_RAG_EVAL='true'
$env:AI_RAG_MODEL_CACHE_DIR='C:\private\approved-minilm-cache'
& .\.venv\Scripts\python.exe -m evaluation.run_rag_evaluation
```

This creates a temporary local evaluation index, never calls Groq, and emits only synthetic case
IDs, scores, ranks, resources, and aggregates. Require every threshold to pass; never tune the
application threshold against production questions.

## Explicit metered gates

After the Phase 7 Groq account/ZDR checks remain valid, run the 54-case document answer gate:

```powershell
$env:OPSPILOT_LIVE_RAG_ANSWER_EVAL='true'
& .\.venv\Scripts\python.exe -m evaluation.run_document_answer_evaluation
```

It makes exactly 54 fixed synthetic calls paced by eight seconds and emits no question, answer,
passage, request ID, provider body, or secret. Require at least 95% grounded-answer faithfulness,
100% no-evidence and critical-injection behavior, 100% schema/citation validity, p95 at most six
seconds, mean cost at most USD 0.01, and maximum cost at most USD 0.02. It never retries inference.

Run the actual signed Node-to-FastAPI-to-Groq five-case latency/safety sample separately:

```powershell
$env:OPSPILOT_RUN_LIVE_RAG_CROSS_SERVICE='true'
$env:OPSPILOT_NODE_BINARY=(Get-Command node).Source
& .\.venv\Scripts\python.exe -m pytest tests\test_cross_service.py -q -s -k live_node_to_fastapi
```

This operation is also metered and explicit. Do not run either live gate from routine CI.

## Health and expected failure states

`GET /api/v1/health` reports core API/database state plus coarse document storage, embedding, and
vector-index states. Internal health is signed. Never expose model cache paths, object paths,
collection details, error bodies, or credentials in health.

- Storage unavailable: management/content/retrieval fail safely; existing core APIs remain ready.
- Embedding/vector unavailable: ingestion/retrieval fail safely; no unfiltered or general-knowledge
  fallback is allowed.
- Groq unavailable: retrieval may complete internally, but no answer is exposed and the existing
  `FAILED`/`UNKNOWN` cost rules apply.
- Worker unavailable: uploaded versions remain queued and non-retrievable; the prior active
  version remains authoritative.
- MySQL unavailable: core readiness is unavailable; no object/vector state can authorize a source.

Do not weaken content validation, checksums, audience filters, source reauthorization, citation
validation, signing, consent, ZDR, or lifecycle checks to restore service.

## Ingestion and reindex recovery

- `AWAITING_UPLOAD` means no accepted content exists; upload the intended version once with a new
  idempotency key.
- `QUEUED` means durable work exists. Confirm the worker heartbeat/job before any replay.
- `PROCESSING` with an expired lease is recovered by the existing queue semantics.
- `FAILED` exposes only a registered safe failure code. Correct the component, then use the
  reviewed reindex/replacement path; never edit the status or chunk rows manually.
- `STAGED` is not retrievable. Investigate vector publication/finalization; replay only through the
  owner job UI and only when the descriptor remains eligible.
- A failed replacement or reindex must preserve the last good `READY` version. If it does not,
  disable documents and treat it as an integrity incident.

Reindex creates a new generation. Do not mutate model/revision/dimension/collection metadata or
delete old points manually. A model change requires a new reviewed artifact, collection,
generation, complete reindex, offline/live evaluation, and atomic publication plan.

## Delete and orphan recovery

Delete makes the document non-retrievable synchronously by entering `DELETING`; physical object
and vector cleanup is asynchronous and idempotent. If cleanup dead-letters, keep the tombstone and
retry through the owner job recovery path after correcting the failing component. Never reactivate
a deleting/deleted row or mark it deleted by hand.

Use `/admin/documents` owner recovery scan or `GET /api/v1/documents/recovery/orphans` after:

- a backup restore;
- a storage/vector outage;
- an interrupted deletion or manual infrastructure recovery; or
- an unexpected disk-count change.

The scan is aggregate and advisory. In-flight jobs can create temporary differences. Record the
counts and correlate with lifecycle/jobs; do not delete a reported orphan manually. There is no
automatic repair endpoint. A confirmed orphan requires a reviewed, target-specific recovery plan.

## Backup and restore

The repository baseline does not implement or approve production backups. For a development
restore:

1. Disable `AI_ENABLED` and `DOCUMENTS_ENABLED`; stop the worker and FastAPI after bounded work.
2. Restore MySQL, encrypted objects, and the Qdrant directory as one dated recovery set. Never
   restore plaintext document exports.
3. Keep documents disabled and verify database migrations/audit chain plus filesystem ownership,
   object-root safety, and vector/model metadata.
4. Start FastAPI/Node privately and run the owner orphan inventory.
5. Reindex current eligible versions through jobs if vector state cannot be proven consistent.
6. Verify deleted/superseded exclusion, retrieval evaluation, and signed smoke before enabling.

A stale backup must not resurrect access: MySQL lifecycle remains authoritative, and restored
vectors/objects alone cannot become context. Production backup retention, legal holds, and erasure
propagation remain blockers.

## Key handling and rotation

The current development factory configures one document encryption key ID at a time and has no
approved online bulk re-encryption workflow. Do not replace or retire a key while objects depend on
it. A rotation requires documents disabled, a reviewed migration tool that reads old and writes new
authenticated envelopes, per-object checksum verification, interruption recovery, inventory
reconciliation, backup handling, and proof before old-key retirement.

Rotate the internal HMAC key only with both services stopped and Node AI disabled, following the
Phase 7 no-overlap rotation procedure. Rotate Groq credentials only after disabling provider
traffic and rerunning account/ZDR preflight plus both live evaluations. Suspected disclosure is an
incident: disable affected gates, revoke/contain the credential, preserve content-free evidence,
and do not resume until rotation and verification finish.

## Retention and privacy

Development deletion removes retrievable vector/object/source material and retains sanitized
document/version tombstones, mutation receipts, citation IDs, usage metadata, and append-only audit
evidence indefinitely. No production retention/erasure/legal-hold schedule is approved. Do not
invent a purge, delete audit/citation/receipt rows manually, or represent repository deletion as a
provider/account/legal erasure guarantee.

## Immediate rollback

Set Node `AI_ENABLED=false` to stop provider document responses, then `DOCUMENTS_ENABLED=false` to
stop management/storage use. Stop the worker and FastAPI after bounded in-flight work. Preserve
MySQL, encrypted objects, vector state, jobs, receipts, and audit evidence. Do not drop additive
migrations or recursively delete object/vector roots; any removal requires an exact reviewed
forward migration or recovery plan.
