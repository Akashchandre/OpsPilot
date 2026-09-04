# Phase 7 AI Foundation Threat Model

## Status

**IMPLEMENTED AND DETERMINISTICALLY VERIFIED on 2026-09-03 under ADR 0009.** This model defines the
mandatory security controls and verification gate for the Groq Phase 7 baseline. No real
provider call was made, and production/customer rollout is not authorized by repository completion.

## Scope

This model covers the React-to-Node assistant flow, consent and metadata-only usage evidence,
permission/quota/idempotency enforcement, signed Node-to-FastAPI requests, FastAPI prompt/output
policy, Groq Chat Completions calls, plain-text rendering, and synthetic evaluation.

It inherits Phase 2 opaque-session/RBAC/origin/CSRF controls, Phase 5 structured logging and
HMAC-chained audit evidence, Phase 6 single-instance/rate limitations, and the existing aggregate
report contract. Customer account/order context, row-level owner data, documents, RAG, tools,
LangChain/LangGraph, streaming, actions, multi-instance deployment, and production retention remain
out of scope.

## Assets and trust boundaries

- Protected assets include active identity/permissions, consent, aggregate business context,
  question text, generated answer, prompt templates, Groq and internal signing keys, service
  signatures/nonces, provider response IDs, token/cost usage, audit evidence, and operational logs.
- Browser input, model output, provider status/body/headers, internal HTTP traffic, clocks/nonces,
  environment configuration, and model behavior are untrusted until validated at their boundary.
- Node.js is the public authorization and business-data authority. FastAPI trusts only a valid
  signed, bounded scope and still enforces its registered assistant/intent contract.
- FastAPI has no database credential, user session, business API credential, callback URL, or tool.
  It cannot obtain more context after Node sends a request.
- Groq receives only the selected prompt, normalized question, and optional approved aggregate
  overview. It receives no OpsPilot user ID, email, cookie, permission list, request signature,
  database data outside that snapshot, or action capability.
- MySQL stores consent and metadata-only usage/audit evidence. It stores no question, answer,
  system prompt, reasoning, or raw provider payload.

## Threats and required controls

| Threat                                                  | Required Phase 7 control                                                                                                                                                    | Residual risk / follow-up                                                                               |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Browser calls FastAPI directly                          | Bind loopback by default; do not expose URL/CORS; private production network; require HMAC on every internal endpoint                                                       | Production ingress/network policy remains a deployment decision                                         |
| Attacker forges Node identity                           | Dedicated >=32-byte HMAC key, key ID, canonical method/path/body/request fields, constant-time comparison                                                                   | A stolen shared key remains privileged and requires rotation/incident response                          |
| Captured internal request is replayed                   | 30-second clock window, UUID nonce, bounded five-minute replay cache, body digest, exact path/method                                                                        | Multi-instance/restart-safe replay state requires a later shared or mTLS design                         |
| Body or assistant scope changes after signing           | Signature covers raw body digest; strict schema, internal contract version, and registered assistant/intent                                                                 | Node compromise can still submit valid authorized scopes                                                |
| User selects another role/assistant                     | Separate public routes plus exact permission checks; ignore/reject client-supplied role/model/prompt/context; FastAPI revalidates signed kind/intent                        | Future custom-role mappings require explicit review                                                     |
| Owner AI permission bypasses report permission          | Require both `ai:owner:use` and `reports:read` before calling existing report service                                                                                       | Existing report correctness remains the factual-data boundary                                           |
| Customer receives another user's data                   | `CUSTOMER_HELP` sends no account/order/ticket data; no user-selectable context or cross-user read route                                                                     | Future personal context needs ownership and minimization redesign                                       |
| Admin gains cross-domain AI by default                  | Assign no Phase 7 AI permission to `ADMIN`; negative route and migration tests                                                                                              | Owners can later assign system roles under existing governance                                          |
| Disabled/revoked user completes an expensive call       | Resolve active session/permissions before reservation; one short bounded request; recheck before returning where practical                                                  | State can change during an in-flight external call; cost may already be incurred                        |
| Missing/forged or over-broad consent                    | Session-derived user plus provider/assistant/notice scope checked before reservation; permission required to accept; CSRF/origin writes; revoke survives permission removal | Provider/legal notice changes require version migration and renewed consent                             |
| User prompt contains personal or secret data            | Clear notice; 2,000-character bound; no app-added PII; recommend ZDR; canary tests and UI warning not to paste secrets                                                      | Users can still voluntarily type sensitive data; production privacy policy remains required             |
| Groq retains prompt/answer unexpectedly                 | Require Console Data Controls ZDR and explicit operator confirmation before enablement; use only stateless inference; do not opt in to training/data improvement; fail closed without confirmation | Console ZDR cannot be independently read through the inference API; account administrators remain trusted |
| Provider key leaks in browser/source/log/error          | Keep only in ignored FastAPI env/secret manager; never send to Node/browser; redact config/errors; staged/ignored scans; rotation runbook                                   | Local process/host compromise can access environment secrets                                            |
| Provider key can access excessive capabilities          | Dedicated Groq project key and fixed `openai/gpt-oss-120b`; restrict project/model permissions where available; no management credential                                  | Console/account administrators remain privileged                                                        |
| Arbitrary provider URL causes SSRF/key exfiltration     | Hard-code HTTPS Groq base URL/path; no redirects; TLS verification; no request/env URL override; injected transport only in tests                                           | DNS/CA/platform compromise is outside application control                                               |
| Model invokes web/X/code/files/tools                    | Send no tool definitions, URLs, file IDs, previous response ID, MCP, or provider agent settings; reject tool outputs                                                        | Provider implementation defects remain external risk                                                    |
| Prompt injection overrides policy                       | Separate trusted policy/context/untrusted question; fixed intents; no secrets/tools in prompt; injection/refusal evals                                                      | Text-only policy cannot guarantee perfect compliance, so authority/data are minimized outside the model |
| User extracts hidden system prompt                      | Prompts contain no secrets; explicit refusal policy; structured output and evaluation; never return raw provider body/reasoning                                             | Some non-secret prompt wording may still be inferred or reproduced                                      |
| Owner prompt causes aggregate data exfiltration         | Only authorized owner receives their single-business aggregate; no external tool/link/action; response stays in authenticated session                                       | Owner access intentionally includes aggregate business information                                      |
| Model fabricates policies or business facts             | Customer uses a small allowlisted fact set; owner context is explicit with `asOf`; require refusal when unsupported; label generated interpretation                         | Probabilistic unsupported claims require ongoing eval/monitoring                                        |
| Model claims causation from aggregates                  | Owner prompt forbids causation; output distinguishes supplied fact from hypothesis/check; rubric tests                                                                      | Human may still over-trust plausible interpretation                                                     |
| Model gives legal/tax/medical/high-stakes advice        | Intent policy requires refusal/escalation and ordinary professional/support pathways; eval critical refusal                                                                 | Classifying every edge case perfectly is not guaranteed                                                 |
| Malicious output becomes stored/reflected XSS           | Strict structured schema; control/length validation; plain React text; no Markdown/HTML/links/`dangerouslySetInnerHTML`                                                     | Social-engineering text remains possible and is labeled AI-generated                                    |
| Malformed/oversized provider response exhausts service  | HTTP/body/output/token limits; strict Pydantic schema; unknown fields not forwarded; safe failure                                                                           | Provider can consume bounded bandwidth/latency before rejection                                         |
| Provider returns reasoning or internal metadata         | Do not request encrypted reasoning; select only final typed output and safe usage fields; raw body never projected/logged                                                   | Provider may add fields that must remain ignored by default                                             |
| Provider timeout is retried and double-billed           | No automatic inference retry; mark ambiguous internal outcome `UNKNOWN`; consumed submission key cannot call again; retain full cost hold                                   | Exact cost may be unavailable for a lost response                                                       |
| Provider `429`/`5xx` leaks internal error               | Map to stable safe code and `503`/`429` public behavior; no provider body/message; user explicitly retries                                                                  | Extended outage makes AI unavailable but does not affect core workflows                                 |
| Duplicate browser submit duplicates cost                | UUID submission key unique per user; reserve before external call; consumed keys return conflict and never replay content; disable UI while pending                         | New explicit keys intentionally create new billed requests                                              |
| Concurrent requests bypass quota/cost ceiling           | Serializable/locked count plus pessimistic cost-hold reservation, indexed UTC-day sums, one active request per user, global semaphore                                       | Multi-instance exact concurrency/shared burst limits remain unresolved                                  |
| One request causes unbounded spend                      | Bound question/context/output/reasoning/time; fixed model/no tools; durable daily counts and global exact-cost ceiling                                                      | Daily cost may overshoot by at most one bounded in-flight request                                       |
| Cost precision/visibility is wrong                      | Store integer reserved ticks and nullable provider-exact ticks; no floating point; project confirmed cost and unknown exposure separately                                   | Provider billing remains external authority and console reconciliation is needed                        |
| Usage table becomes conversation surveillance           | Store only registered metadata; no question/answer/digest/reasoning/report JSON; safe owner aggregate projections                                                           | Actor/model/time/cost metadata is still personal operational data                                       |
| Logs/audit leak content or credentials                  | Allowlisted fields only; canary secret/PII/prompt/answer tests; no headers/body/nonce/signature/provider response                                                           | Hosted log access/retention remains undecided                                                           |
| Audit failure hides provider use                        | Append start evidence with reservation before provider; completion/failure transaction updates usage and audit; stale pending becomes unknown                               | External cost can occur after start even if completion evidence fails                                   |
| Model alias changes behavior silently                   | Exact allowlisted model string, recorded prompt/model eval evidence, startup model check, change-control gate                                                               | Provider may update an alias behind the same string; live regression is still required                  |
| AI service reads database or invokes OpsPilot actions   | No DB/business credential/library/tool/callback; outbound adapter accepts only the hard-coded Groq endpoint                                                                 | Host-level compromise can escape application boundaries                                                 |
| AI outage breaks main API readiness                     | Optional dependency; AI endpoints fail safe; public health reports separate AI state; core routes remain available                                                          | Users lose assistant availability during outage                                                         |
| Local wildcard bind exposes service                     | Default/validate `127.0.0.1`; reject `0.0.0.0` unless a later production topology explicitly authorizes it                                                                  | Container networking will require a Phase 10 decision                                                   |
| Internal cleartext leaks on remote deployment           | Loopback only locally; production private TLS/mTLS and network ACL required before non-loopback use                                                                         | Phase 7 repository baseline is not production deployment approval                                       |
| Synthetic eval leaks real data or creates surprise cost | Versioned synthetic fixtures only; explicit live flag; preflight; fixed case count/output; record aggregate cost only                                                       | Provider/model stochasticity means repeated runs can vary and cost money                                |

## Required verification

The unit, integration, web, migration, cross-service, coverage, build, schema-diff, audit-chain,
dependency, whitespace, and credential gates below pass for the repository implementation. Global
ZDR, the versioned live Groq evaluation, and the signed development service path also pass. Broader
production provider/account/privacy/operations review and production approval remain pending;
Phase 7 repository/development acceptance was recorded on 2026-09-04.

- Unit/contract tests cover canonical signing, constant-time rejection, key ID, timestamp bounds,
  duplicate nonce, method/path/body/request tampering, malformed/oversized input, and replay-cache
  bounds.
- Anonymous, disabled, expired, missing-CSRF, non-consenting, cross-role, `ADMIN`, missing-report-
  permission, duplicate-idempotency, quota, cost, concurrency, and consent-revocation paths fail
  before the provider mock is called.
- Context canaries prove that only registered public facts or the exact safe aggregate overview
  reach the provider adapter; user IDs, emails, cookies, roles, raw records, support text, payment
  provider fields, jobs, audit data, keys, signatures, and request headers remain absent.
- Provider mock tests cover supported structured answers/refusals/escalations plus authentication,
  ZDR mismatch, `429`, timeout, network, `5xx`, malformed/oversized JSON, wrong model, invalid schema,
  invalid usage/cost, unexpected tools/reasoning, and no automatic retry.
- Persistence tests prove assistant-scoped consent ownership/versioning and revocation after
  permission removal, unique user/submission behavior, safe pending/success/failure/unknown
  transitions, exact/reserved integer cost, atomic quota/hold concurrency, restrictive
  relationships, role mappings, safe usage projection, and registered content-free audit metadata.
- Web tests prove plain-text rendering and loading, consent, permission, range, refusal, escalation,
  quota, timeout, provider-failure, and retry states without direct FastAPI/provider access.
- Versioned live synthetic evaluation meets every critical refusal, quality, unsupported-claim,
  latency, schema, and cost threshold with ZDR verified; recorded evidence contains no case content.
- Full Phase 1-6 regression, coverage, build, migrations/drift, audit-chain verification, live
  service smoke, whitespace, dependency, and credential scans remain green.

## Production blockers retained

Before any production/customer rollout, approve jurisdiction and privacy notice language,
controller/processor responsibilities, Groq terms/DPA/subprocessors/regions, ZDR contractual and
technical verification, consent withdrawal/deletion handling, usage/audit/backup retention and
legal holds, incident/complaint/correction ownership, key rotation, service TLS/mTLS/private network,
multi-instance replay/quota/rate state, process supervision, monitoring/alerts, SLO/capacity, model
change/rollback policy, and independent human safety review. Phase 4 provider delivery/recovery and
all live-payment gates also remain unresolved.
