# Phase 7 Operations and Recovery Runbook

## Scope

This runbook covers the development/test single-Node, single-FastAPI Phase 7 baseline. It does not
approve production/customer rollout, non-loopback service exposure, multi-instance operation, or
transmission of user prompts before the privacy/provider gates pass.

## Safe initial state

Keep these values in ignored files:

- API `apps/api/.env`: `AI_ENABLED=false`.
- AI `apps/ai/.env`: `AI_PROVIDER_ENABLED=false`.
- Both: the same dedicated canonical Base64 HMAC key containing at least 32 random bytes and the
  same non-secret key ID.
- AI only: the dedicated Groq key (`gsk_...`); never place it in the API or web environment.
  New configuration uses `GROQ_API_KEY`; `XAI_API_KEY` is accepted temporarily only as the
  legacy local name for the already ignored Groq value.

Confirm that both local files are ignored before adding any secret:

```powershell
git check-ignore apps/api/.env apps/ai/.env
```

Do not place secrets in shell history, command arguments, tracked examples, logs, screenshots,
tickets, chat, or evaluation evidence. Use a local secret manager or enter values directly into the
ignored environment file.

## Install, migrate, and start

From `apps/ai`, create the isolated Python environment using the approved lock/dependency groups:

```powershell
python -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --group dev
$env:PYTHONPATH=(Resolve-Path -LiteralPath .\src).Path
```

Apply the committed database migration from the repository root:

```powershell
npm run db:deploy
npm run db:status
```

Start FastAPI on loopback from `apps/ai`:

```powershell
& .\.venv\Scripts\python.exe -m uvicorn opspilot_ai.main:app --host 127.0.0.1 --port 8000
```

Start the Node API and web application in separate terminals. The browser continues to use only
the Node origin. Never proxy or tunnel FastAPI port 8000.

## Provider readiness and enablement

Before a real provider check, confirm in the Groq account without recording secret/account content:

1. The credential is a dedicated Groq project key and model permissions allow only the required
   `openai/gpt-oss-120b` capability wherever the console supports restrictions.
2. Credits/billing and the actual team rate limits are understood.
3. Zero Data Retention is enabled for inference in Data Controls.
4. Training/data-improvement opt-in is disabled.
5. The provider terms, DPA/subprocessors, jurisdiction, region/data-residency, and notice language
   are acceptable for the intended data.

After step 3, set `GROQ_ZERO_DATA_RETENTION_CONFIRMED=true` and
`AI_PROVIDER_ENABLED=true` only in ignored `apps/ai/.env`, leave Node `AI_ENABLED=false`, and run
the explicit non-inference preflight:

```powershell
$env:PYTHONPATH=(Resolve-Path -LiteralPath .\src).Path
$env:OPSPILOT_LIVE_AI_PREFLIGHT='true'
& .\.venv\Scripts\python.exe -m opspilot_ai.preflight
```

The redacted result must report successful credential/model access, operator ZDR confirmation,
reviewed pinned price policy, `inferencePerformed: false`, and `secretValuesEmitted: false`. It
does not independently read the Console's ZDR, training, DPA, region, credit, or rate-tier settings;
those remain manual checks.

If startup reports that the Groq key or ZDR confirmation is invalid, set
`AI_PROVIDER_ENABLED=false` again and leave Node `AI_ENABLED=false`. Correct only the ignored
AI-service configuration. Authentication, request, rate-limit, and provider-availability statuses
are safely classified without returning provider bodies or secrets.

Then run the explicit metered synthetic evaluation:

```powershell
$env:OPSPILOT_LIVE_AI_EVAL='true'
& .\.venv\Scripts\python.exe -m opspilot_ai.evaluation
```

The CLI spaces cases by eight seconds, so the 20-case run takes about three minutes and remains
below the documented 8K-token/min free-plan baseline. This is pacing only; failed inference is not
retried.

Review and record only its redacted result under the evaluation evidence rules. Every threshold
must pass. Only after the preflight, evaluation, privacy review, and an explicit rollout decision
may Node's ignored `AI_ENABLED` be changed to `true` and the API restarted.

## Routine non-provider verification

Routine tests do not need a Groq key and never contact Groq:

```powershell
& .\.venv\Scripts\python.exe -m ruff check .
& .\.venv\Scripts\python.exe -m ruff format --check .
& .\.venv\Scripts\python.exe -m pip check
& .\.venv\Scripts\python.exe -m pytest --cov=opspilot_ai --cov-report=term-missing
```

The routine Python suite skips the cross-service case. Run it deliberately with a local Node 24
binary; it starts a loopback FastAPI server with a deterministic provider and sends no Groq traffic:

```powershell
$env:OPSPILOT_RUN_CROSS_SERVICE_SMOKE='true'
$env:OPSPILOT_NODE_BINARY=(Get-Command node).Source
& .\.venv\Scripts\python.exe -m pytest tests\test_cross_service.py -q
```

## Health and expected states

- `GET /api/v1/health` remains the public readiness endpoint. `status: ok` and
  `database: reachable` are core readiness; `ai` is independently `disabled`, `ready`, or
  `unavailable`.
- FastAPI internal health is signed and must be called through the Node client or the controlled
  cross-service smoke. It reports only `ready`/`unavailable` and provider state.
- An AI outage must not make non-AI routes unavailable. Do not weaken authentication, consent,
  ZDR, signature, schema, timeout, or quota checks to restore AI service.

## Usage and cost monitoring

An owner with `ai:usage:read` can inspect `/admin/assistant` or
`GET /api/v1/ai/usage?from=...&to=...`. Monitor:

- `PENDING` and `UNKNOWN` growth;
- safe error-code counts;
- completed latency average/maximum;
- successful input/output/total token totals;
- confirmed exact USD cost; and
- reserved exposure for pending or ambiguous requests.

Provider billing is the external authority. Reconcile aggregate confirmed cost against the Groq
console without exporting prompts, answers, user attribution, or provider raw payloads.

## Timeout, outage, and ambiguous result recovery

- Definite pre-provider failures become `FAILED` and release their cost hold.
- Timeouts, connection loss, invalid/unknown internal completion, and recording ambiguity become
  `UNKNOWN` or remain fail-safe `PENDING`; they retain the full configured hold.
- A stale `PENDING` request becomes `UNKNOWN` on the same user's next reservation.
- Every submission key is consumed permanently. Never retry automatically or reuse a key. A user
  may explicitly submit a genuinely new request with a new UUID after seeing the safe failure.
- Do not edit usage rows, mark an outcome successful, release an unknown hold, or replay the
  provider request manually. Phase 7 has no reviewed reconciliation proof for ambiguous Groq work.
- If unknown exposure blocks the daily ceiling, leave AI disabled until an explicit reconciliation
  or forward migration/policy is reviewed. Core workflows remain available.

## Consent and permission changes

- Revocation blocks future calls immediately and clears current browser-held output.
- Permission/status/consent is rechecked before an answer is returned. A completed but newly
  unauthorized response is recorded for exact cost but not exposed.
- Users may read and revoke their own existing scoped consent after losing the assistant
  permission. Do not remove that recovery path.
- A new notice, provider, assistant scope, or data inventory requires a new notice version,
  renewed consent, tests, documentation, and privacy review.

## Key rotation

### Internal HMAC key

The baseline accepts one key ID at a time and has no dual-key overlap:

1. Set API `AI_ENABLED=false` and restart it so no new calls begin.
2. Stop both AI and API processes after bounded in-flight work finishes.
3. Generate a new dedicated Base64 key and new key ID in the secret manager.
4. Update both ignored environments without logging the value.
5. Start FastAPI, run the deterministic signed cross-service smoke, then start the API.
6. Re-enable Node only if health is ready; invalidate/delete the old secret in the secret manager.

### Groq key

1. Disable Node AI and `AI_PROVIDER_ENABLED`; stop provider traffic.
2. Revoke/rotate the key in Groq and update only the ignored AI environment.
3. Reconfirm ACL, ZDR, training opt-out, credits, and rate limits.
4. Rerun the redacted preflight and live synthetic evaluation before re-enabling.

Treat any suspected key disclosure as an incident: disable AI, revoke the exposed key, preserve
content-free audit/usage evidence, inspect secret-safe logs, and rotate before recovery.

## Model, prompt, endpoint, or price change

The endpoint, model, reasoning, output schema, tools, and prompt versions are code-owned. Do not
work around a provider change with an environment override. A change requires a reviewed code/ADR
update, new prompt version where applicable, deterministic regression, redacted preflight, complete
metered evaluation, cost-limit review, and rollback plan.

## Retention and deletion

Development/test consent, usage metadata, and associated audit evidence are retained indefinitely
because no deletion/purge policy is approved. Do not delete rows manually: restrictive foreign
keys and the audit chain preserve evidence. Production use is blocked until retention periods,
withdrawal/erasure or anonymization, legal holds, backup propagation, provider deletion, and
responsible owners are approved and tested.

## Disable and rollback

The safe immediate rollback is configuration-only: set API `AI_ENABLED=false` and restart Node.
This removes provider use while preserving consent/usage/audit evidence and all core routes. Stop
FastAPI or set `AI_PROVIDER_ENABLED=false` after in-flight calls end. Do not roll back the additive
migration by dropping its tables or permissions in a populated environment; use a reviewed forward
migration if schema removal is ever authorized.
