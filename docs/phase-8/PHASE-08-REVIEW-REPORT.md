# Phase 8 Review and Acceptance Report

## Result

**PASS — accepted and complete for the repository/development scope on 2026-09-06.** ADR 0011's
approved text/Markdown-only document baseline,
encrypted filesystem storage, local FastEmbed/Qdrant retrieval, two-step Node authorization,
document consent, source-grounded Groq answers, citations, lifecycle/recovery handling, and
evaluation harness are implemented.

After the complete gate passed, the user instructed that Phase 8 be committed if complete; this
records explicit repository/development acceptance. It does not authorize production deployment or
replace the remaining privacy, retention, network, backup, monitoring, or multi-instance decisions.

## Scope delivered

- Additive MySQL persistence for logical documents, immutable versions/audiences, generation-aware
  chunk metadata, citations, document consent, and idempotent mutation receipts; all 14 migrations
  are current without development or test drift.
- Owner/admin document metadata, version/upload, protected original-read, archive/reindex, and
  owner-only deletion/recovery routes. The browser receives safe metadata or protected response
  headers, never a storage path or vector point identifier.
- Strict raw UTF-8 `.txt` / `.md` validation, a 256 KiB limit, normalized checksum, application
  AES-256-GCM encryption, opaque object keys, atomic private writes, integrity validation, and
  private-root containment checks for both document objects and RAG cache/vector persistence.
- Idempotent ingestion, reindex, and deletion work through the existing transactional job/outbox
  and worker. Lifecycle publication is staged, version-aware, and safe to retry; an owner-only
  orphan inventory/recovery endpoint supplies aggregate evidence without exposing objects.
- Isolated FastAPI chunking, pinned local FastEmbed model, private Qdrant local persistence,
  signed index/retrieve/publish/delete contracts, and a fixed retrieval threshold of `0.36`.
- Candidate retrieval returns opaque references only. Node rechecks current user state, assistant
  permission, scoped consent, document/version/audience lifecycle, chunk metadata, object
  authenticity, and checksum before bounded context reaches Groq; the same relevant checks repeat
  after inference before a response/citation can be returned.
- Separate customer and owner document assistants, versioned document-processing consent, strict
  output/citation contracts, prompt-injection-as-data rules, insufficient-evidence/refusal outcomes,
  citation UI, document-management UI, and safe plain-text rendering.
- Fixed synthetic retrieval, live document-answer, and signed live boundary evaluations, plus
  full API/web/Python regression, coverage, migration, format, build, audit, dependency, whitespace,
  and credential-hygiene checks.

PDF/office/archive parsing, OCR, binary/document scanning services, hosted object/vector services,
LangChain, LangGraph, tools/actions, arbitrary source selection, production deployment, and Phase 9
workflows remain outside the delivered scope.

## Acceptance criteria review

| Criterion                                               | Evidence                                                                                                                                                        | Result |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Only allowed managers manage documents                  | Deny-by-default permissions, session/CSRF/origin/idempotency checks, transaction-time role/status reauthorization and locks, integration tests, and role matrix | Pass   |
| Originals remain confidential and tamper-evident        | Private external root, opaque keys, AES-256-GCM AAD, atomic writes, encrypted-read/checksum tests                                                               | Pass   |
| Invalid/stale/deleted data cannot reach an answer       | Strict validation, lifecycle state machine, staged index publication, active-version and final source reauthorization                                           | Pass   |
| Reprocessing/replacement is unambiguous                 | Immutable versions, row locks, idempotent jobs, generation metadata, concurrency/retry tests                                                                    | Pass   |
| Customer/owner sources remain isolated                  | Fixed server-derived audiences, opaque candidates, MySQL reauthorization, golden isolation/deletion/supersession cases                                          | Pass   |
| Answers are grounded and cited or safely decline        | Source-only prompt, typed outcomes/citations, 97.5% grounded answer rate, 100% no-evidence/citation-schema pass                                                 | Pass   |
| Prompt injection cannot grant authority or leak sources | Delimited untrusted context, no tools, strict schema, 100% critical safety result, safe UI rendering                                                            | Pass   |
| Outage/recovery/deletion behavior is bounded            | Safe failures, queue retry/replay constraints, vector deletion, object recovery inventory, runbook                                                              | Pass   |
| Quality, latency, and cost meet approved targets        | 100% retrieval recall@5, 50.862 ms retrieval p95, 1,046 ms live p95, bounded live cost                                                                          | Pass   |
| Prior phases remain stable                              | 193 API, 48 web, and 144 Python tests pass with all configured coverage gates                                                                                   | Pass   |

Detailed metrics and safe evidence are in
[`PHASE-08-EVALUATION-EVIDENCE.md`](PHASE-08-EVALUATION-EVIDENCE.md).

## Decisions and rationale

- Node remains the only public authentication, authorization, document-lifecycle, and source-access
  authority. FastAPI has neither session/database nor object-store credentials; a valid HMAC request
  is not end-user authorization.
- Strict inert UTF-8 text/Markdown avoids introducing an unreviewed binary parser, OCR, archive, or
  rendered-HTML attack surface. The local encrypted object/vector adapters are development-only and
  reject production use.
- Qdrant payloads are intentionally insufficient to authorize source use. Node treats them as
  candidates and resolves each one through current relational metadata and decrypted-object
  integrity checks.
- Groq's strict-schema endpoint supports only a compatible subset of JSON Schema. The provider wire
  schema remains compatible, while the stricter Pydantic output contract fails closed after decode.
- Retrieval failure is intentionally safer than a general-knowledge answer: below-threshold,
  unavailable, unauthorized, stale, deleted, or contradictory evidence produces a safe no-evidence
  result rather than a partial answer.
- Document answer content remains transient. Usage, audit, and citation evidence retain identifiers,
  quantities, and state only; no documents, chunks, questions, prompt context, or answers are added
  to application logs, audit metadata, or database evidence tables.

## Final automated gate

- ESLint, Prettier, Prisma validation, Ruff lint/format, and `pip check`: pass.
- API regression: 35 files / 193 tests pass; coverage is 82.96% statements, 73.81% branches,
  92.55% functions, and 86.69% lines.
- Web regression: 7 files / 48 tests pass; coverage is 80.19% statements, 71.04% branches,
  80.12% functions, and 82.30% lines.
- Python regression: 144 pass, with two explicit opt-in live smoke skips; coverage is 86.35% with
  the enforced 80% minimum. Two upstream non-failing Starlette TestClient deprecation warnings and
  one expected local-Qdrant payload-index warning remain.
- Offline retrieval: 50/50 fixed cases pass; recall@5 100%, MRR 1.000, no-evidence/audience/
  deleted/superseded controls 100%, p95 50.862 ms.
- Metered document answer gate: 54 fixed cases; 97.5% grounded-answer faithfulness, 100% no-evidence,
  critical-safety, output-schema, and citation-schema rates; p95 1,046 ms; mean USD 0.0001247028;
  maximum USD 0.0001690500; no content/secret emitted.
- Signed live Node-to-FastAPI-to-Groq sample: five synthetic cases pass with a valid signature,
  bounded outcomes/citations, 722 ms p95, USD 0.0006568500 total cost, and no content/secret
  emitted. The final test-app logging rerun emitted no request IDs or application content.
- Development and test schemas have all 14 migrations applied and no diff. Development and test
  audit-chain verification each checked 127 valid events.
- Production web build passes: 108 modules; 416.24 kB JavaScript (116.77 kB gzip); 32.10 kB CSS
  (6.87 kB gzip). Git whitespace, high-confidence credential scans, and the offline package-lock
  audit pass.

The 2026-09-06 acceptance rerun also passes lint, formatting, Prisma validation, 193 API tests,
48 web tests, 144 Python tests with two intentional live skips, all coverage gates, Python
dependency consistency, the production build, all 14 development/test migration status and drift
checks, both audit verifiers, the deterministic signed boundary smoke, Git whitespace, and the
50-case offline retrieval gate. The offline rerun retained 100% recall@5, MRR 1.000, and 100%
no-evidence/audience/deleted/superseded controls with 42.096 ms p95. The already-passing metered
Groq gates were not repeated because routine acceptance verification does not make provider calls.

## Retained risks and production blockers

- The filesystem object store and embedded local Qdrant are single-process development adapters;
  production requires approved private storage/vector topology, TLS/IAM/KMS/key rotation, backup
  ownership, multi-instance coordination, and deployment/rollback supervision.
- No approved retention, erasure, legal-hold, backup deletion-propagation, privacy/legal basis,
  DPA/subprocessor, region/data-residency, incident ownership, or human review policy exists for
  documents, derived vectors, consent, citations, usage, or audit evidence.
- PDF/office/OCR, malware-scanning/quarantine infrastructure, non-English documents, images/tables,
  hosted parsers, and production vector performance are deliberately deferred. Do not broaden input
  support without a new threat review and approval.
- Model behavior remains probabilistic and the Groq account has rate/billing/model-change exposure.
  The fixed synthetic evaluation passes but does not replace ongoing safe quality monitoring or an
  approved production account/privacy review.
- HMAC replay/concurrency/rate state and local vector state are per process. Production requires
  a reviewed shared/edge policy, private networking, monitoring/alerts, SLO/capacity planning, and
  resilience testing.
- The existing independent Phase 4 Razorpay Test Mode delivery/recovery gate and prior npm advisory
  note remain unresolved and unchanged by Phase 8.

## Transition

Phase 8 is accepted and complete for the repository/development scope. Keep document and AI feature
gates subject to the runbook, keep FastAPI loopback-only, and retain all private roots outside the
repository and web roots. Phase 9 decision-definition was subsequently authorized on 2026-09-06;
its proposed runtime/dependency baseline remains unapproved and unimplemented. Production requires
a separate approved architecture, privacy/retention plan, operations readiness review, and rollout
authorization.
