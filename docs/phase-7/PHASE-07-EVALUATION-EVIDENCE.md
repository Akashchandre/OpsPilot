# Phase 7 Evaluation Evidence

## Result

**Repository and deterministic evaluation: PASS on 2026-09-03.**

**Live Groq evaluation: PASS on 2026-09-04.** The operator confirmed that Global ZDR is enabled in
Groq Data Controls and overrides the enabled inference setting. The redacted application preflight
then passed credential, fixed-model, ZDR-attestation, and price-policy checks without inference.
The final paced 20-case run passed every quality, safety, schema, unsupported-claim, latency, and
cost threshold without recording content or emitting secrets. The user explicitly authorized
development enablement and subsequently accepted Phase 7. Production approval remains a separate
gate.

## Fixed evaluation set

`apps/ai/src/opspilot_ai/evaluation.py` defines 20 synthetic, versioned cases with no production or
user data:

- 10 allowed customer/owner cases covering product/support/order/cart/checkout guidance and exact
  aggregate overview interpretation; and
- 10 critical safety cases covering hidden prompts/credentials, personal/account or row-level
  data, actions, high-stakes advice, unsupported current information, causal attribution, prompt
  injection, and facts outside the supplied context.

The live runner sends only this fixed synthetic content. Its output includes case ID, assistant,
critical flag, schema validity, outcome, rubric result, unsupported-claim indicator, duration,
integer tokens/cost, and safe error code. It deliberately does not record or print questions,
answers, raw provider payloads, request IDs, headers, or secrets.

## Accepted live thresholds

| Metric | Required | Current evidence |
|---|---:|---|
| Allowed-intent rubric pass | At least 90% | 100%; pass |
| Critical safety/refusal pass | 100% | 100%; pass |
| Typed/plain-text schema pass | 100% | 100%; pass |
| Automated unsupported-claim indicators | 0 | 0; pass |
| Live p95 latency | Below 30,000 ms | 1,459 ms; pass |
| Mean billed cost | At most USD 0.01/response | USD 0.0001326525; pass |
| Maximum billed cost | At most USD 0.02/response | USD 0.0001993500; pass |
| ZDR control | Operator confirms Groq ZDR in Data Controls before enablement | Global ZDR confirmed; pass |

These checks are necessary but not sufficient for production. A human reviewer must still inspect
the provider/account/privacy posture and a safe, ephemeral review of live behavior without adding
response content to repository evidence.

## Deterministic automated evidence

| Gate | Result |
|---|---|
| API full regression | 30 files / 145 tests passed |
| Web full regression | 6 files / 43 tests passed |
| Python routine suite | 97 passed, 1 intentional opt-in cross-service skip; rerun 2026-09-04 |
| Python coverage | 88.36% total; 80% minimum enforced |
| API coverage | 84.58% statements, 73.76% branches, 93.31% functions, 88.15% lines |
| Web coverage | 83.60% statements, 73.61% branches, 82.73% functions, 86.10% lines |
| Explicit Node-to-FastAPI HTTP smoke | 1 passed against deterministic provider in 0.68 s on 2026-09-04 |
| ESLint | Pass |
| Prettier / Prisma validation | Pass |
| Ruff lint / format | Pass; 26 Python files formatted |
| Python dependency consistency | `pip check` pass |
| Production web build | Pass; 104 modules, 395.60 kB JS (112.29 kB gzip), 28.23 kB CSS (6.26 kB gzip) |
| Development/test migrations | All 11 migrations current in both databases; no schema difference |
| Groq credential/model access | Pass; non-inference model list, fixed active model, no secret emitted |
| Live signed Node-to-FastAPI-to-Groq smoke | Pass; ready health, valid answer outcome, ZDR true, no content/secret emitted |
| Development/test audit chain | Valid; 105 development events and 0 test events checked |

The first compatibility attempt was rejected before inference because GPT-OSS does not support
`reasoning_format` and Groq strict output accepts a constrained JSON Schema subset. The adapter now
uses `include_reasoning: false`; provider-facing unsupported bounds were removed while the full
Pydantic contract continues to enforce them after decoding. A subsequent unpaced run passed all 15
completed cases before the free-plan 8K-token/minute limit rejected five cases. The final runner
paces cases by eight seconds without retrying inference and passed all 20 cases in 170 seconds.

The Python suite emits two upstream deprecation warnings from Starlette TestClient's current HTTPX
and AnyIO compatibility aliases. They do not affect the passing gate; they should be rechecked when
an approved compatible FastAPI/Starlette stack removes them.

## Security and failure coverage

Deterministic Python tests cover configuration redaction, loopback binding, HMAC canonicalization,
wrong key/key ID, clock bounds, replay, body/path/method/request tampering, duplicate/malformed JSON,
body limits, CORS/docs absence, registered contracts, prompt separation, output markup/URL/control
rejection, provider authentication, operator-confirmed ZDR, model/output/usage/calculated-cost
validation, timeout/network/`429`/`5xx`, unexpected tools, safe errors, concurrency, and no
inference retry.

API tests cover permission seeds, restrictive relationships and database checks, scoped consent,
revocation after permission loss, anonymous/disabled/CSRF/role crossover/admin denial, owner
`reports:read`, context minimization, exact reservation/cost state, duplicate keys, per-user
in-flight, daily quota, global cost ceiling, stale/ambiguous failure, result recording failure,
mid-flight authorization change, cost-overrun suppression, safe aggregate usage, audit metadata,
and optional health degradation.

Web tests cover permission-gated routing, explicit consent/revocation, range validation, loading and
safe error states, new UUID on explicit retry, refusal/escalation, authoritative owner-data
separation, aggregate usage, and malicious HTML rendered as text.

The explicit cross-service test starts a real loopback Uvicorn server with a deterministic provider
and launches the actual Node client script. It proves signed internal health and response exchange,
contract parsing, ZDR propagation, and plain output without contacting Groq.

## Dependency review

The approved exact direct pins are recorded in ADR 0009 and locked in `apps/ai/pylock.toml` for the
local Python 3.13 environment. The generated lock contained 27 non-pip packages at review time; an
OSV batch scan found no known vulnerability matches. License metadata was permissive. PyPI metadata
for `coverage` and `python-dotenv` omitted a classifier in the inspected path; their upstream
licenses are Apache-2.0 and BSD-3-Clause respectively. No npm package, SDK, LangChain/LangGraph,
Redis, vector, or telemetry dependency was added for Phase 7.

The existing npm audit findings documented under Phase 6 remain unresolved and unchanged; Phase 7
did not introduce them or approve a breaking dependency workaround.

## Required live procedure

After the ignored AI environment and manual Groq account controls are configured:

1. Confirm Groq Zero Data Retention for inference in Console Data Controls, then set
   `GROQ_ZERO_DATA_RETENTION_CONFIRMED=true` and `AI_PROVIDER_ENABLED=true` only in the ignored AI
   environment; leave Node `AI_ENABLED=false`.
2. Run `python -m opspilot_ai.preflight` only with
   `OPSPILOT_LIVE_AI_PREFLIGHT=true`; require all redacted checks to pass.
3. Run `python -m opspilot_ai.evaluation` only with `OPSPILOT_LIVE_AI_EVAL=true` and explicit
   awareness that exactly 20 calls are metered.
4. Record the date, provider, exact model, prompt versions, case counts, aggregate pass rates,
   latency, tokens, cost, threshold booleans, and safe failures only.
5. Do not commit prompts, answers, raw JSON bodies, provider request IDs, headers, account/team IDs,
   or credentials.
6. If any threshold or ZDR check fails, keep `AI_ENABLED=false`, investigate through safe codes,
   and rerun only after a reviewed model/prompt/config correction.

## Acceptance status

Repository implementation, the redacted preflight, all-green metered evaluation, and user-approved
development enablement are complete. The user explicitly accepted Phase 7 on 2026-09-04 after the
completion condition passed. Production rollout remains blocked on the broader manual
account/privacy/operations review and explicit production approval.
