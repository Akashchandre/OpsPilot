# OpsPilot AI Service

Internal-only Python/FastAPI policy and xAI/Grok provider boundary for Phase 7. The browser never
calls this service, it has no CORS or database credential, and provider access is disabled by
default.

## Local environment

Use Python 3.13 from `apps/ai`:

```powershell
python -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --group dev
```

Copy `.env.example` to ignored `.env`. Generate a dedicated Base64 HMAC key containing at least 32
random bytes and use the same key and non-secret key ID in the ignored API and AI environments.
Keep both `AI_ENABLED=false` and `AI_PROVIDER_ENABLED=false` while setting up. Never paste the HMAC
key or xAI key into source, tests, logs, documentation, command arguments, or chat.

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

Put the dedicated xAI key only in ignored `apps/ai/.env`. Confirm its endpoint/model ACL, team
billing/rate limits, Zero Data Retention, and no-training/data-improvement setting in the xAI
console. Then set `AI_PROVIDER_ENABLED=true` only in that ignored file.

The redacted preflight checks credential/model access, the required ZDR response header, and the
configured price ceiling without performing inference:

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

Do not set Node's `AI_ENABLED=true` until both commands pass and the manual account checks are
recorded. A key alone is not authorization to send real user prompts.

## Checks

Routine checks never contact xAI:

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

See `docs/phase-7/PHASE-07-OPERATIONS-RUNBOOK.md` for startup, rotation, outage, unknown-outcome,
and rollback guidance. Phase 7 is not production deployment approval.
