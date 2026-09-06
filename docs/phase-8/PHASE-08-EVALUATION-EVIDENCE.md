# Phase 8 Evaluation Evidence

## Result

**Repository/development evaluation: PASS on 2026-09-05; accepted on 2026-09-06.**
The Phase 8 suite covers encrypted-document lifecycle, audience isolation, retrieval, grounded
document answers, prompt-injection resistance, and the signed Node-to-FastAPI boundary. It uses
only synthetic fixtures and records aggregate metrics, case IDs, opaque identifiers, and safe error
codes. It does not record questions, answers, passages, provider bodies, request IDs, headers, or
secrets.

The metered evaluation and signed live sample use the already-authorized local Groq configuration.
They prove the development path; they do not approve a production privacy, deployment, monitoring,
or retention posture.

## Fixed evaluation sets

- The offline retrieval runner contains 50 synthetic cases: 40 answerable cases and 10
  insufficient-evidence/isolation/deleted/superseded cases. It evaluates customer/owner audiences,
  current-version selection, contradictory sources, and cross-audience denial against a private
  local index.
- The live document-answer runner contains 54 fixed synthetic requests: 40 answer cases, 10
  no-evidence cases, and 6 critical refusal/prompt-injection cases. Its rubric checks only safe
  outcome/citation properties and approved answer semantics.
- The signed live boundary sample sends five fixed synthetic cases through the actual Node signing
  client, loopback FastAPI application, RAG prompt/output contract, and Groq adapter.

No production document, customer, order, support, or account data is used by these runners.

## Offline retrieval result

The offline runner completed successfully on the pinned local `all-MiniLM-L6-v2` cache and Qdrant
directory. The local Qdrant payload-index warning is expected for embedded development mode and did
not affect result correctness.

| Metric | Required | Evidence | Result |
|---|---:|---:|---|
| Cases | 50 fixed synthetic cases | 50 | Pass |
| Answerable recall@5 | At least 95% | 100% | Pass |
| Mean reciprocal rank | At least 0.90 | 1.000 | Pass |
| No-evidence correctness | 100% | 100% | Pass |
| Audience isolation | 100% | 100% | Pass |
| Superseded-version exclusion | 100% | 100% | Pass |
| Deleted-source exclusion | 100% | 100% | Pass |
| Local retrieval p95 | At most 500 ms | 50.862 ms | Pass |
| Retrieval minimum-score threshold | Calibrated from fixed set | 0.36 | Pass |

Threshold calibration observed a maximum no-evidence score of `0.306362`, a minimum positive score
of `0.405420`, and a suggested separator of `0.356`; the reviewed runtime threshold is `0.36`.

Recorded local resource evidence: 22 documents / 22 chunks, 91,104,110-byte model cache,
94,780-byte vector index, 3,929.279 ms wall time, 3,375 ms CPU time, and 269,725,696-byte peak RSS.

## Metered document-answer result

The paced 54-case Groq run completed successfully on 2026-09-05. One allowed answer rubric was a
semantic wording variation, leaving the grounded-answer faithfulness rate at 97.5%; all accepted
thresholds still pass.

| Metric | Required | Evidence | Result |
|---|---:|---:|---|
| Grounded answer / faithfulness | At least 95% | 97.5% | Pass |
| No-evidence behavior | 100% | 100% | Pass |
| Critical prompt-injection/refusal safety | 100% | 100% | Pass |
| Output schema validity | 100% | 100% | Pass |
| Citation schema validity | 100% | 100% | Pass |
| Live p95 latency | At most 6,000 ms | 1,046 ms | Pass |
| Maximum latency | At most 10,000 ms | 1,206 ms | Pass |
| Mean billed cost | At most USD 0.01/response | USD 0.0001247028 | Pass |
| Maximum billed cost | At most USD 0.02/response | USD 0.0001690500 | Pass |
| Content or secret emitted by runner | Never | False / False | Pass |

The total 54-call synthetic run remained within the account's reviewed development pacing and did
not persist content. The output contract requires bounded, unique citation labels after FastAPI
decoding. Groq accepts a narrower provider wire-schema subset, so unsupported JSON-Schema bounds
are deliberately enforced by the full Pydantic contract after decoding rather than silently dropped.

## Signed live boundary result

The explicit five-case Node-to-FastAPI-to-Groq sample passed with a valid signature/replay boundary,
safe outcomes, and no content or secret emitted:

| Metric | Evidence |
|---|---:|
| Cases / signed boundary | 5 / valid |
| Outcome mix | 2 `ANSWER`, 2 `INSUFFICIENT_EVIDENCE`, 1 `REFUSAL` |
| Citation counts | 1, 1, 0, 0, 0 |
| p95 / maximum latency | 722 ms / 722 ms |
| Tokens | 3,486 total (3,103 input; 383 output) |
| Exact cost | USD 0.0006568500 total |
| Content or secret emitted | False / False |

The test application suppresses application request logging for this metered evidence path. The final
rerun emitted only the safe aggregate test result plus a pytest cache-permission warning; it emitted
no request IDs, questions, answers, sources, provider bodies, or secrets. Production logging policy
is unchanged.

## Deterministic and regression evidence

| Gate | Result |
|---|---|
| API regression | 35 files / 193 tests passed |
| API coverage | 82.96% statements, 73.81% branches, 92.55% functions, 86.69% lines |
| Web regression | 7 files / 48 tests passed |
| Web coverage | 80.19% statements, 71.04% branches, 80.12% functions, 82.30% lines |
| Python regression | 144 passed; 2 explicit opt-in live smoke skips |
| Python coverage | 86.35% total; 80% minimum enforced |
| Deterministic signed Node-to-FastAPI smoke | Passed |
| ESLint / Prettier / Prisma validation | Passed |
| Ruff lint / format / Python dependency consistency | Passed |
| Production web build | Passed; 108 modules, 416.24 kB JS (116.77 kB gzip), 32.10 kB CSS (6.87 kB gzip) |
| Development and test migrations | All 14 migrations current; schema drift absent |
| Audit-chain verification | Development valid (127 events checked); test valid (127 events checked) |
| npm package-lock audit | 0 vulnerabilities reported in the offline package-lock check |
| Git whitespace and high-confidence credential scans | Passed |

The Python suite retains two upstream Starlette TestClient deprecation warnings for current HTTPX
and AnyIO compatibility aliases, plus the expected local-Qdrant payload-index warning. They are
non-failing warnings and should be reevaluated with the next approved framework update or a
production Qdrant topology.

## Security and failure coverage

The deterministic tests exercise strict text/Markdown upload validation, byte limits, encrypted
storage tamper handling, document/RAG private-root rejection, idempotency, job retries,
active-version races, transaction-time actor status/permission reauthorization with role/status
locking, delete/recovery behavior, vector/provider outage failure, signed request
canonicalization/replay, current authorization and consent checks before and after inference,
audience isolation, citation authorization, deleted/superseded source exclusion, prompt injection
treated as data, safe insufficient-evidence/refusal outcomes, and HTML-safe rendering.

The Node API is the public authority. FastAPI has no database/session/object-storage credentials;
it receives only signed bounded indexing, retrieval, and context requests. Node retrieves opaque
candidate references, re-authorizes the source/version/audience, decrypts and checksum-verifies a
bounded excerpt, and rejects unknown citations before returning a result.

## Acceptance status

All repository/development acceptance thresholds and regression checks listed above pass. On
2026-09-06 the user instructed that Phase 8 be committed if complete, and the routine gate,
development/test migration and drift checks, audit verification, deterministic signed smoke, and
50-case offline retrieval evaluation passed again. This records repository/development acceptance,
not production rollout or completion of the broader operational/privacy gate.
