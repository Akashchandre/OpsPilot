# Phase 4 Cart, Order, and Payment Threat Model

## Status

**IMPLEMENTED AND VERIFIED IN THE REPOSITORY on 2026-08-27.** The automated gate exercises these
controls with local provider fakes and exact signed fixtures. Real Razorpay Test Mode delivery
smoke and explicit phase acceptance remain pending.

## Scope

This model covers authenticated carts, server-authoritative checkout, inventory reservations,
immutable orders, customer/operator access, Razorpay Standard Checkout in Test Mode, payment
callbacks, webhooks, refunds, and reconciliation. It excludes live-money launch, tax/legal policy,
carrier integrations, settlement accounting, chargebacks, queues, real-time delivery, and AI.

## Assets and trust boundaries

- Order totals, stock allocation, order/payment/refund state, provider identifiers, address/phone,
  idempotency records, and transition evidence are protected assets.
- The browser, all request input, Razorpay Checkout callback fields, and third-party script runtime
  are untrusted until independently validated.
- The accepted opaque session, active-account check, CSRF token, exact-origin check, permissions,
  and ownership rules remain the browser-facing authorization boundary.
- Express owns route/body-parser ordering. The Razorpay webhook route is a narrow exception to
  browser origin/CSRF controls and authenticates the exact raw body with a separate secret.
- Commerce services own totals, state machines, idempotency, reservation lifecycle, and provider
  relationship checks.
- Prisma transactions, unique/check/foreign-key constraints, and conditional versions are the final
  local integrity boundary.
- Razorpay is authoritative only for provider payment/refund facts. It does not authorize local
  ownership, inventory, fulfillment, or operator actions.

## Threats and required controls

| Threat | Required Phase 4 control | Residual risk / follow-up |
|---|---|---|
| Client tampers with price, currency, totals, tax, shipping, or product identity | Client supplies only cart/address intent; checkout reloads products and computes exact INR totals/paise server-side | Future tax/discount/shipping engines need their own rule and rounding review |
| Oversell during concurrent checkout | Serializable transaction, conditional inventory versions, nonnegative database checks, atomic reservation ledger | High contention may need measured locking/retry tuning |
| Stock held forever by abandoned checkout | Server expiry, idempotent release, opportunistic bounded sweeps, operator reconciliation | Phase 6 should schedule the same service for timely cleanup |
| Release races with payment capture | Transactionally lock/order reservation state; exactly one transition consumes or releases; late capture enters review | Manual action is needed when capture follows release |
| Duplicate order or provider order from retries/timeouts | Mandatory user-scoped idempotency key, request digest, unique local order mapping, unique provider receipt, receipt lookup before retry | Provider outage can leave a recoverable pending setup state |
| Double charge across payment retries | One payable Razorpay order per local order; provider relationship/paid-state checks; unique captured attempt | An impossible second capture enters review and refund handling |
| Fake Checkout success | Constant-time HMAC using the stored provider order ID and server secret; fetch/verified webhook capture required before confirmation | Compromised provider credential requires rotation and incident response |
| Forged webhook | HMAC-SHA256 over exact raw bytes with separate webhook secret; missing/invalid signature rejected before parsing/application | The current single-secret build requires a controlled cutover and reconciliation of retries signed with the prior secret; dual-secret overlap needs a reviewed change |
| Duplicate or out-of-order webhook | Unique provider event ID, monotonic state rules, provider event time, idempotent transaction | Provider event loss is handled through manual reconciliation |
| Valid event for another account/order | Match stored provider order/payment IDs, receipt, exact amount, currency, and expected local relationship | Account/key mix-ups become review events, never fulfillment |
| Callback/webhook payload leaks card or customer data | Strict field projection; no raw payload/signature persistence; logs redact headers/body/payment instrument/contact/notes | Provider dashboard remains a separate data processor and access risk |
| Raw card/CVV/UPI credential reaches OpsPilot | Razorpay-hosted Standard Checkout only; no custom payment form or raw payment-instrument API fields | Third-party script/CSP and provider compromise remain supply-chain risks |
| Key secret exposed to browser/source/logs | Validated server-only environment config; only key ID returned; secret scans; safe provider error mapping | Local developer environment and deployed secret manager still need access control |
| Cross-user cart/order/payment access | Derive user from session, resource ownership predicate in every self-service query, indistinguishable safe not-found response | Single-business baseline still needs multi-tenant redesign before expansion |
| Customer invokes operator fulfillment/refund | Deny-by-default permissions plus CSRF/origin, state/version checks, and immutable actor evidence | Compromised privileged sessions require Phase 5 audit/incident controls |
| Refund duplication after timeout | Local idempotency/request digest and Razorpay `X-Refund-Idempotency`; provider ID uniqueness; reconciliation | Refund can remain pending/failed and requires operator attention |
| Refund amount manipulation | Full captured amount derived server-side; no client amount; exact currency/relationship validation | Partial refunds/returns are explicitly deferred |
| Stale or skipped order transitions | Explicit state machine, expected version, conditional update, append-only status event | Business exceptions require reviewed transitions rather than direct edits |
| PII leakage through administrative views | Permission-gated projections, bounded fields, no address in lists unless necessary, no sensitive logs | Privacy retention/deletion policy remains required before live launch |
| Webhook denial of service/oversized body | Dedicated small raw-body limit, content-type/header validation, bounded parsing, prompt response | Rate limiting must not block legitimate provider retries; production edge controls remain later work |
| Provider outage or ambiguous response | Durable pre-call local state, timeouts, safe retry/recovery by unique receipt, per-payment reconciliation | No automatic background retry until Phase 6 |
| Third-party checkout script compromise or blocking | Load only Razorpay's documented HTTPS URL, narrow CSP changes, explicit load-failure UI, no self-hosted copy | Browser extensions/network/provider remain external trust dependencies |

## Required verification

- Anonymous/disabled/cross-user callers cannot read or mutate carts, orders, payments, addresses, or
  refunds.
- Customers cannot invoke management fulfillment, refund, or reconciliation actions.
- Every unsafe browser operation enforces trusted origin, CSRF, validation, ownership/permission,
  state, and version/idempotency controls as applicable.
- Empty/stale/inactive/mixed-currency/insufficient-stock checkout creates no partial order or stock
  mutation.
- Concurrent last-unit checkout produces at most one successful reservation and never negative
  stock.
- Repeated checkout/refund/callback/webhook/reconciliation input creates one logical effect.
- Order items, address, and totals remain unchanged after catalog/customer edits.
- Reservation consume/release and capture/expiry races end in a supported state with exact ledger
  arithmetic.
- Invalid/missing webhook signatures are rejected using raw bytes; duplicates and older events do
  not regress state.
- Only exact captured provider state confirms an order; mismatch or late capture enters review.
- Provider failures never expose credentials, raw responses, stack traces, instrument details, or
  unrestricted notes.
- Full-refund timeout, processed, failed, duplicate, and reconciliation paths remain traceable and
  safe.
- No raw card, CVV, bank credential, UPI credential, Checkout signature, API secret, webhook
  secret, cookie, or full raw provider payload is stored or logged.

Automated evidence and the outstanding external provider gate are recorded in
`docs/phase-4/PHASE-04-REVIEW-REPORT.md`.

## Live-mode blockers

Before any real-money launch, separately approve tax/GST, shipping charges and service area,
cancellation/return/refund terms, privacy and PII retention, merchant/KYC state, live keys, secret
management, public webhook reliability, monitoring/alerting, incident response, reconciliation
ownership, provider terms, accessibility, production CSP, and an end-to-end go-live checklist.
