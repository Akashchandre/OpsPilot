# Phase 7 Evaluation Evidence

## Result

**Repository and deterministic evaluation: PASS on 2026-09-03.**

**Live xAI evaluation: NOT RUN.** `apps/ai/.env` is absent, no provider key was read or used, and no
real xAI request was made. Phase 7 quality/latency/cost acceptance therefore remains pending even
though the implementation and mock-based safety gates pass.

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
| Allowed-intent rubric pass | At least 90% | Pending live run |
| Critical safety/refusal pass | 100% | Pending live run |
| Typed/plain-text schema pass | 100% | Pending live run; deterministic boundary tests pass |
| Automated unsupported-claim indicators | 0 | Pending live run |
| Live p95 latency | Below 30,000 ms | Pending live run |
| Mean billed cost | At most USD 0.01/response | Pending live run |
| Maximum billed cost | At most USD 0.02/response | Pending live run |
| ZDR response header | `true` on preflight and every response | Pending live preflight/run |

These checks are necessary but not sufficient for production. A human reviewer must still inspect
the provider/account/privacy posture and a safe, ephemeral review of live behavior without adding
response content to repository evidence.

## Deterministic automated evidence

| Gate | Result |
|---|---|
| API full regression | 30 files / 145 tests passed |
| Web full regression | 6 files / 43 tests passed |
| Python routine suite | 74 passed, 1 intentional opt-in cross-service skip |
| Python coverage | 86.18% total; 80% minimum enforced |
| API coverage | 84.58% statements, 73.76% branches, 93.31% functions, 88.15% lines |
| Web coverage | 83.60% statements, 73.61% branches, 82.73% functions, 86.10% lines |
| Explicit Node-to-FastAPI HTTP smoke | 1 passed against deterministic provider in 0.57 s |
| ESLint | Pass |
| Prettier / Prisma validation | Pass |
| Ruff lint / format | Pass; 26 Python files formatted |
| Python dependency consistency | `pip check` pass |
| Production web build | Pass; 104 modules, 395.58 kB JS (112.30 kB gzip), 28.23 kB CSS (6.26 kB gzip) |
| Development/test migrations | All 10 migrations current; no schema difference on either database |
| Development/test audit chain | Valid; 34 development events and 0 test events checked |

The Python suite emits two upstream deprecation warnings from Starlette TestClient's current HTTPX
and AnyIO compatibility aliases. They do not affect the passing gate; they should be rechecked when
an approved compatible FastAPI/Starlette stack removes them.

## Security and failure coverage

Deterministic Python tests cover configuration redaction, loopback binding, HMAC canonicalization,
wrong key/key ID, clock bounds, replay, body/path/method/request tampering, duplicate/malformed JSON,
body limits, CORS/docs absence, registered contracts, prompt separation, output markup/URL/control
rejection, provider authentication, ZDR, price/model/output/usage/cost validation, timeout/network/
`429`/`5xx`, unexpected tools/reasoning, safe errors, concurrency, and no inference retry.

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
contract parsing, ZDR propagation, and plain output without contacting xAI.

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

After the ignored AI environment and manual xAI account controls are configured:

1. Run `python -m opspilot_ai.preflight` only with
   `OPSPILOT_LIVE_AI_PREFLIGHT=true`; require all redacted checks to pass.
2. Run `python -m opspilot_ai.evaluation` only with `OPSPILOT_LIVE_AI_EVAL=true` and explicit
   awareness that exactly 20 calls are metered.
3. Record the date, provider, exact model, prompt versions, case counts, aggregate pass rates,
   latency, tokens, cost, threshold booleans, and safe failures only.
4. Do not commit prompts, answers, raw JSON bodies, provider request IDs, headers, account/team IDs,
   or credentials.
5. If any threshold or ZDR check fails, keep `AI_ENABLED=false`, investigate through safe codes,
   and rerun only after a reviewed model/prompt/config correction.

## Acceptance status

Repository implementation evidence is sufficient for code review and commit. Explicit Phase 7
acceptance and any real-user rollout remain blocked on the redacted provider preflight, all-green
metered live evaluation, manual account/privacy review, and explicit user approval.
