# OpsPilot AI Service

Internal-only Python/FastAPI policy, Groq provider, and Phase 8 local retrieval boundary. The
browser never calls this service, it has no CORS or database/object-store credential, and provider
and RAG access are disabled by default.

## Local environment

Use Python 3.13 from `apps/ai`:

```powershell
python -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --group dev
```

Copy `.env.example` to ignored `.env`. Generate a dedicated Base64 HMAC key containing at least 32
random bytes and use the same key and non-secret key ID in the ignored API and AI environments.
Keep both `AI_ENABLED=false` and `AI_PROVIDER_ENABLED=false` while setting up. Never paste the HMAC
key or Groq key into source, tests, logs, documentation, command arguments, or chat.

The Python source uses a `src` layout. Set its local import path once in each PowerShell terminal:

```powershell
$env:PYTHONPATH=(Resolve-Path -LiteralPath .\src).Path
```

## Run locally

Start the service on loopback only:

```powershell
& .\.venv\Scripts\python.exe -m uvicorn opspilot_ai.main:app --host 127.0.0.1 --port 8000
```

Start the Node API separately. Node is the only public API and must use the same internal signing
key and key ID. Do not expose port 8000 through a browser, tunnel, proxy, or wildcard bind.

## Provider activation gates

Put the dedicated Groq key only in ignored `apps/ai/.env`. Confirm model permissions, project
billing/rate limits, no-training terms, and Zero Data Retention in Groq Console Data Controls.
Set `GROQ_ZERO_DATA_RETENTION_CONFIRMED=true` only after checking that console control, then set
`AI_PROVIDER_ENABLED=true`. The adapter requires a `gsk_...` key and fixed production model
`openai/gpt-oss-120b`.

The current ignored file may retain the legacy local variable name `XAI_API_KEY`; configuration
accepts that name only as a migration alias for the existing `gsk_...` value. New setups must use
`GROQ_API_KEY`. The alias does not bypass key-type or ZDR checks.

The redacted preflight checks credential/model access, explicit operator ZDR confirmation, and the
code-owned reviewed price ceiling without performing inference:

```powershell
$env:OPSPILOT_LIVE_AI_PREFLIGHT='true'
& .\.venv\Scripts\python.exe -m opspilot_ai.preflight
```

The live evaluation is an explicit metered operation. It performs exactly 20 fixed synthetic
requests and emits only case IDs, outcomes, validity, latency, token/cost counts, safe error codes,
and aggregate thresholds—never questions, answers, or secrets:

```powershell
$env:OPSPILOT_LIVE_AI_EVAL='true'
& .\.venv\Scripts\python.exe -m opspilot_ai.evaluation
```

The CLI spaces live evaluation cases by eight seconds to remain below the documented 8K-token/min
free-plan baseline for the fixed model. This evaluation-only pacing does not retry inference.

Do not set Node's `AI_ENABLED=true` until both commands pass and the manual account checks are
recorded. A key alone is not authorization to send real user prompts.

If startup reports that the Groq key or ZDR confirmation is invalid, restore
`AI_PROVIDER_ENABLED=false`, leave `AI_ENABLED=false`, and correct only the ignored AI-service
configuration. Never paste the value into an issue, command, log, or chat.

## Checks

Routine checks never contact Groq:

```powershell
& .\.venv\Scripts\python.exe -m ruff check .
& .\.venv\Scripts\python.exe -m ruff format --check .
& .\.venv\Scripts\python.exe -m pip check
& .\.venv\Scripts\python.exe -m pytest --cov=opspilot_ai --cov-report=term-missing
```

Run the explicit local signed Node-to-FastAPI smoke with a deterministic mock provider:

```powershell
$env:OPSPILOT_RUN_CROSS_SERVICE_SMOKE='true'
$env:OPSPILOT_NODE_BINARY=(Get-Command node).Source
& .\.venv\Scripts\python.exe -m pytest tests\test_cross_service.py -q
```

## Phase 8 local retrieval

The accepted development adapter uses the exact cached
`sentence-transformers/all-MiniLM-L6-v2` revision recorded in configuration and a private local
Qdrant directory. Set `AI_RAG_MODEL_CACHE_DIR` and `AI_RAG_QDRANT_PATH` to absolute, distinct paths
outside the repository. Keep `AI_RAG_ENABLED=false` until the approved model is fully cached. Local
Qdrant mode is single-process and rejected in production.

Run the offline 50-case retrieval/isolation/deletion benchmark only against the approved cache:

```powershell
$env:OPSPILOT_RAG_EVAL='true'
$env:AI_RAG_MODEL_CACHE_DIR='C:\private\approved-minilm-cache'
& .\.venv\Scripts\python.exe -m evaluation.run_rag_evaluation
```

The explicit metered document-answer gate makes 54 fixed synthetic Groq calls, paced by eight
seconds. It emits safe case IDs, outcome/schema/rubric status, timing, tokens, cost, and aggregates;
it never emits questions, answers, source passages, provider bodies, or secrets:

```powershell
$env:OPSPILOT_LIVE_RAG_ANSWER_EVAL='true'
& .\.venv\Scripts\python.exe -m evaluation.run_document_answer_evaluation
```

Run the separate signed Node-to-FastAPI-to-Groq five-case live sample only with explicit metered
opt-in:

```powershell
$env:OPSPILOT_RUN_LIVE_RAG_CROSS_SERVICE='true'
$env:OPSPILOT_NODE_BINARY=(Get-Command node).Source
& .\.venv\Scripts\python.exe -m pytest tests\test_cross_service.py -q -s -k live_node_to_fastapi
```

See the Phase 7 and Phase 8 operations runbooks for startup, rotation, outage, unknown-outcome,
document recovery, and rollback guidance. Repository/development completion is not production
deployment approval.
