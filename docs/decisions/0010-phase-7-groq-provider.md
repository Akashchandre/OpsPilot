# ADR 0010 — Phase 7 Groq Provider Migration

## Status

Accepted on 2026-09-04 by the user's explicit instruction to use the existing key and implement the
provider change. This supersedes only the xAI/Grok-specific portions of ADR 0009. ADR 0009's
stateless assistant scopes, signed internal boundary, authorization, consent, data minimization,
usage evidence, cost/quota controls, evaluation thresholds, and deferred capabilities remain in
force.

This decision authorizes the repository migration and a redacted, non-inference credential/model
check. It does not authorize real user prompts, the 20-request metered evaluation, production
deployment, or Phase 8/9 capabilities. Those gates remain separate.

On 2026-09-04 the user subsequently confirmed Global ZDR, explicitly authorized the metered live
evaluation and development enablement, and accepted Phase 7 after every repository/development
gate passed. This follow-up acceptance does not authorize production deployment or Phase 8/9.

## Context

Secret-safe inspection on 2026-09-04 established that the ignored credential supplied for Phase 7
is a Groq key, not an xAI key. Renaming it could not make the xAI adapter work. The user chose to
use that existing Groq key rather than obtain another provider credential.

The current official Groq documentation identifies `openai/gpt-oss-120b` as a production model
with strict JSON Schema output and low/medium/high reasoning. Groq documents Chat Completions as a
supported stable endpoint and its Responses API as beta. Groq also documents an account-level Zero
Data Retention control in Console Data Controls; the inference API does not document a
per-response ZDR proof header.

Official references reviewed on 2026-09-04:

- https://console.groq.com/docs/model/openai/gpt-oss-120b
- https://console.groq.com/docs/api-reference
- https://console.groq.com/docs/structured-outputs
- https://console.groq.com/docs/your-data
- https://console.groq.com/docs/prompt-caching
- https://console.groq.com/docs/responses-api

## Decision

- Replace the xAI Responses adapter with a raw `httpx` Groq Chat Completions adapter at the
  code-owned `https://api.groq.com/openai/v1/chat/completions` endpoint. No dependency is added.
- Fix the only allowed model to production model `openai/gpt-oss-120b`. Use low reasoning effort,
  exclude reasoning from the response with `include_reasoning: false`, request one non-streaming
  choice, at most 500 completion tokens, strict JSON Schema output, explicit `tool_choice: none`,
  disabled citations, no tools, and no automatic inference retry.
- Use `GET https://api.groq.com/openai/v1/models` for the non-inference authentication/model-access
  preflight and require exactly one active match for the fixed model.
- Require Groq ZDR. Because Groq documents the control in its Console rather than a response proof
  header, fail closed unless an operator has checked Data Controls and explicitly set
  `GROQ_ZERO_DATA_RETENTION_CONFIRMED=true`. The separate
  `GROQ_REQUIRE_ZERO_DATA_RETENTION=true` policy cannot be disabled.
- Use `GROQ_API_KEY` for new configurations and require the Groq `gsk_...` key family. To use the
  already ignored value without reading or rewriting the secret, temporarily accept
  `XAI_API_KEY` as a legacy local environment-name alias. The alias grants no policy bypass and
  should be removed after the local ignored file is manually renamed.
- Pin reviewed 2026-09-04 public cost constants using 10,000,000,000 integer ticks per US dollar:
  1,500 ticks per uncached input token ($0.15/M), 750 per cached input token ($0.075/M), and 6,000
  per completion token ($0.60/M). Calculate confirmed request cost from Groq's returned
  `prompt_tokens`, `prompt_tokens_details.cached_tokens`, and `completion_tokens`; reject
  malformed or inconsistent usage.
- Change the current provider contract to `GROQ`, model contract to
  `openai/gpt-oss-120b`, and consent notice to `groq-zdr-v1`. Do not reuse xAI consent for a
  different processor.
- Add `GROQ` to the persistent provider enum while retaining `XAI` for historical evidence.
  Revoke active legacy xAI consent during migration and permit `/` in recorded model IDs. Existing
  usage evidence remains unchanged.
- Make browser actions provider-neutral while clearly naming Groq in the processing notice.
- Keep `AI_PROVIDER_ENABLED=false` and Node `AI_ENABLED=false` during setup. Development enablement
  requires ZDR confirmation, the redacted application preflight, metered evaluation, and explicit
  authorization. Production additionally requires the retained privacy/account/operations review
  and explicit rollout approval.

## Rationale and alternatives

- Keeping xAI was rejected because the existing key cannot authenticate that provider and the user
  explicitly authorized Groq.
- Groq Responses was rejected for this baseline because it is documented as beta; Chat
  Completions provides the strict structured-output behavior Phase 7 needs without adding state,
  tools, or an SDK.
- `openai/gpt-oss-120b` was chosen as the fixed production quality baseline. The cheaper
  `openai/gpt-oss-20b` remains a future evaluated alternative, not an automatic fallback.
- Treating Groq's default limited-retention posture as equivalent to ZDR was rejected because it
  would silently weaken ADR 0009's privacy gate.
- Reusing `xai-zdr-v1` consent was rejected because provider identity and retention language are
  material to informed consent.

## Consequences and follow-up

- Operators must confirm Groq ZDR in Console Data Controls before enablement; the API key alone
  cannot prove that setting.
- Price constants are application policy, not returned currency data. Any Groq price change
  requires documentation review, constant/version update, deterministic tests, and a new live
  evaluation before continued use.
- A model/provider/endpoint/structured-output change requires the same change-control gate.
- On 2026-09-04 the existing ignored key successfully authenticated and the model-list endpoint
  returned exactly one active `openai/gpt-oss-120b` match. No inference was performed and no
  secret value was emitted.
- The provider migration's deterministic Python, focused Node API, web, Prisma generation, and
  local development/test migration checks passed. Full repository checks and documentation sync
  remain recorded in the Phase 7 review/evidence documents.
- The completed live evaluation and signed service path are recorded in the evidence report. The
  user explicitly accepted the repository/development phase on 2026-09-04; production remains a
  separate unapproved gate.

## Related decisions

- ADR 0009 — Phase 7 AI Foundation Baseline (provider-specific portions superseded)
- ADR 0008 — Phase 6 Real-time and Background Jobs Baseline
- ADR 0006 — Phase 4 Provider Smoke Deferral
