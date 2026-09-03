# Phase 7 AI Foundation Permission Matrix

## Status

**IMPLEMENTED AND VERIFIED on 2026-09-03 under ADR 0009.** Migration
`20260903060000_phase_7_ai_foundation` seeds the exact permissions and role mappings below in both
development and test. Integration and route tests cover the positive and deny-by-default cases.

## Implemented permissions

| Code              | Meaning                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `ai:customer:use` | Submit one stateless `CUSTOMER_HELP` request using only the registered public-product-help context                 |
| `ai:owner:use`    | Submit one stateless `OWNER_OVERVIEW_EXPLAIN` request using only the approved aggregate overview context           |
| `ai:usage:read`   | Read bounded metadata-only request, token, confirmed-cost, reserved-exposure, latency, and safe-failure aggregates |

None of these permissions grants access to prompts, answers, provider/internal keys, reasoning,
provider raw payloads, another user's consent or individually attributed usage, row-level business
data, documents, tools, model configuration, or AI actions. No route permits editing prompts,
selecting a provider/model, creating arbitrary intents, replaying a provider request, or bypassing
ordinary domain services.

## Implemented default role matrix

| Permission        | `OWNER` | `ADMIN` | `CUSTOMER` |
| ----------------- | :-----: | :-----: | :--------: |
| `ai:customer:use` |   No    |   No    |    Yes     |
| `ai:owner:use`    |   Yes   |   No    |     No     |
| `ai:usage:read`   |   Yes   |   No    |     No     |

The assistants remain deliberately distinct. `OWNER` does not inherit the customer assistant,
`CUSTOMER` cannot select the owner assistant, and `ADMIN` receives neither assistant by default.
Unknown/custom permissions remain denied.

`ai:owner:use` alone is insufficient for overview context: the request must also hold existing
`reports:read` at the time Node loads the aggregate snapshot. This matters for future custom roles;
AI access never implies a domain-data permission.

## Consent and ownership-scoped actions

An active user may read or revoke only their own existing assistant-scoped xAI consent even after a
role or permission changes. Accepting a notice additionally requires the corresponding current
`ai:customer:use` or `ai:owner:use` permission. Revocation never requires continued AI permission.

Consent endpoints derive user ID from the active opaque session and accept only a registered
`customer` or `owner` path scope. Consent is keyed by user, provider, assistant scope, and notice
version, so a customer consent cannot authorize later owner aggregate processing. A client cannot
act for another user or select a provider, notice version, role, or arbitrary assistant. Cross-user
consent IDs are not exposed. Consent is necessary but never grants an assistant permission.

An assistant user may receive only the immediate result of their own request/submission key. A
duplicate consumed key cannot replay an answer because no answer is stored; a new explicit request
requires a new key. There is no list/detail endpoint for another user's request.

## Endpoint and service mapping

| Operation                             | Required access                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Read/revoke own scoped consent        | Active session + registered assistant scope + session-derived user predicate; revoke also requires exact origin/CSRF and audit evidence       |
| Accept own scoped consent             | Same as read + corresponding assistant-use permission + exact origin/CSRF + server-owned current notice version + audit evidence              |
| Create customer response              | Active session + `ai:customer:use` + matching current consent + UUID at-most-once submission + customer burst/daily/cost/concurrency checks   |
| Create owner overview response        | Active session + `ai:owner:use` + `reports:read` + matching current consent + UUID at-most-once submission + validated UTC range/quota checks |
| Read aggregate AI usage               | `ai:usage:read` + bounded UTC range + non-user-attributed aggregate projection + audited read                                                 |
| Load overview context                 | Internal Node service call to the existing report service only after both owner permissions pass; not a browser-selectable tool               |
| Call FastAPI `/internal/v1/responses` | Node-owned HMAC signature, key ID, timestamp, UUID nonce/request ID, body digest, replay check, and registered assistant/intent contract      |
| Call xAI                              | FastAPI provider adapter only with the server-held least-privilege key, fixed endpoint/model, no tools, and verified ZDR policy               |
| Change provider/model/prompt/quotas   | No public API; reviewed code/config/deployment change plus evaluation and decision record                                                     |

## Deny-by-default examples

- A `CUSTOMER` posting `assistant: OWNER`, adding report context, or calling the owner route receives
  a safe authorization failure before any internal/provider call.
- An `OWNER` posting `assistant: CUSTOMER` receives a safe authorization failure; owning one AI
  permission does not grant both policies.
- An `ADMIN` with `reports:read` still cannot invoke the owner assistant without
  `ai:owner:use`.
- A future custom role with `ai:owner:use` but without `reports:read` cannot load or send overview
  data.
- Browser knowledge of the FastAPI URL, request body, or user UUID cannot create a valid internal
  signature or select a different scope.
- A role change cannot reuse customer consent for owner processing, and permission removal cannot
  prevent the user from revoking their own existing consent.
- `ai:usage:read` cannot retrieve prompt/answer content, hidden prompts, per-user conversation
  history, or provider credentials because those are neither stored nor projected.
