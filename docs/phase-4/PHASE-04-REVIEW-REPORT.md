# Phase 4 Orders and Payments Review Report

## Review outcome

**REPOSITORY IMPLEMENTATION PASSED on 2026-08-27. EXTERNAL SMOKE IS DEFERRED AND PHASE ACCEPTANCE
IS PENDING.** The migration, API, React workflows, automated provider boundary, documentation, and
local quality gates meet the approved ADR 0005 scope. Real Razorpay Test Mode webhook/capture/refund
delivery has not been run because its external dashboard inputs are not yet configured.

This report does not authorize live keys, real-money processing, or production deployment. ADR
0006 separately authorizes Phase 5 decision-definition work while preserving this unresolved gate.

## 2026-09-02 repair and re-verification

The reported non-working local integration was reproduced before code changes. The ignored API
environment contains none of `RAZORPAY_ENABLED`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, or
`RAZORPAY_WEBHOOK_SECRET`, so the existing fail-closed checkout correctly returned
`PAYMENT_PROVIDER_NOT_CONFIGURED`. No current credential was recovered from source/history and no
secret was invented or logged.

Repository hardening completed within ADR 0005's Test Mode boundary:

- Enabled configuration rejects malformed and `rzp_live_` key IDs and accepts only `rzp_test_`.
- `npm run payments:razorpay:check` performs a read-only Orders API credential/connectivity
  preflight with redacted output and no financial write.
- HTTP `408` and in-progress idempotent-write `409` responses remain retriable/ambiguous, so a
  refund is not incorrectly classified as conclusively failed while Razorpay is processing it.
- A failed, incomplete, or 15-second-stalled hosted Checkout script is removed; the customer can
  retry with a fresh script element instead of waiting indefinitely.

The full Phase 1–6 rerun passes 26 API files / 123 tests, 5 web files / 38 tests, both coverage
gates, lint, formatting/Prisma validation, production build, nine-migration status and drift for
development/test, both audit-chain verifiers, live API/worker/built-web smoke, and all five Phase 6
performance targets.

Later on 2026-09-02, the API was restarted with an enabled ignored configuration. Public health
and rejected-signature webhook probes pass through a temporary Cloudflare Quick Tunnel. After the
initial Test Mode pair was rejected, a freshly rotated matched pair passed the redacted preflight;
resuming an existing pending order created and verified its Razorpay provider order and returned a
hosted Checkout payload. Payment completion plus dashboard capture, secret, endpoint, and event
configuration remain required; the external smoke row below is pending and Phase 4 is not accepted.

## Delivered implementation

- Versioned authenticated cart with authoritative price/lifecycle/stock review.
- Serializable checkout with immutable order/address/money snapshots, conditional inventory
  decrement, immutable adjustments, one reservation per line, and request idempotency.
- Customer-owned order history/detail, payment-session retry, Checkout confirmation, and unpaid
  cancellation.
- Razorpay Test Mode adapter using native Node.js `fetch`/`crypto`, receipt recovery, and hosted
  Standard Checkout.
- Exact raw-body signed webhook boundary with event allowlist, event-ID/body-digest deduplication,
  minimal normalized persistence, and monotonic state handling.
- Permission-gated order management, normal full refunds with provider/local idempotency, and
  per-payment reconciliation.
- Responsive customer/operator UI without card, CVV, bank, wallet, or UPI credential fields.

## Verification evidence

| Check | Result |
|---|---|
| `npm run format` | Passed; source and Prisma schema formatted |
| `npm run format:check` | Passed; includes valid Prisma schema |
| `npm run lint` | Passed |
| `npm test` | Passed: 12 API files / 53 tests; 2 web files / 24 tests |
| `npm run test:coverage` | Passed both configured global thresholds |
| API coverage | 80.24% statements, 68.17% branches, 94.67% functions, 84.54% lines |
| Web coverage | 82.56% statements, 71.09% branches, 80.25% functions, 85.10% lines |
| `npm run build` | Passed; Vite production bundle generated |
| Development migration status | Passed; four migrations, schema current |
| Test migration status | Passed; four migrations, schema current |
| Local smoke | API health reports database reachable; web root returns HTTP 200 with root mount |
| `git diff --check` | Passed |
| Workspace Razorpay literal scans | Passed after pre-commit remediation; tracked examples now contain only disabled, empty provider placeholders |

Verification used the approved portable Node.js 24.19.0 runtime because the installed system
runtime remains Node.js 20. No dependency was added for Phase 4. The existing npm audit issue noted
in `WORK-PROGRESS.md` was not changed or force-fixed.

## Automated behavior coverage

The API suite covers owned cart CRUD, quantity/version validation, price review, permission-scoped
reads, signed confirmation with provider fetch, fulfillment/cancellation, full-refund success and
retry, post-refund capture idempotency, invalid/duplicate/out-of-order/unsupported webhooks,
reservation expiry, verified late-capture review, reconciliation, and concurrent final-unit
checkout. Provider calls use injected fakes; webhook cases use exact raw signed fixtures.

The web suite covers product-to-cart, cart update/remove/clear, order list/filter/detail, address
checkout, hosted modal launch and server confirmation, modal dismissal/payment retry, unpaid
cancellation, permission-gated refund/reconciliation/fulfillment, invalid script URL, and new/
existing script-load failures.

## Acceptance assessment

| Criterion | Repository evidence | Status |
|---|---|---|
| Server recomputes price/availability and rejects stale input | Cart/checkout service and integration tests | Pass |
| Concurrent checkout cannot oversell | Serializable conditional update and final-unit concurrency test | Pass |
| Retries do not duplicate orders/refunds/events/transitions | UUID request keys, request digests, unique provider IDs/receipt/event ID, tests | Pass |
| Order history survives catalog changes | Immutable order/address/product/money snapshots | Pass |
| Financial states are verifiable and reconcilable | Exact match checks, state applier, webhook evidence, manual reconcile | Pass internally |
| Customer/operator data scope is enforced | Ownership not-found behavior and five permission gates/tests | Pass |
| OpsPilot does not collect raw payment credentials | Razorpay-hosted Checkout and safe projections | Pass |
| Real provider success/failure/lost callback/duplicate/refund delivery | Requires external Test Mode dashboard and HTTPS webhook | Pending |

## Security and risk review

- Client totals, refund amounts, callback state, and provider identifiers are never authoritative.
- Checkout callback and webhook secrets are separate; the webhook validates HMAC over exact raw
  bytes in constant time before parsing or persistence.
- Raw webhook bodies/signatures and unrestricted provider/contact/card data are not persisted.
- Customer reads are ownership-scoped; operator actions require migration-controlled permissions,
  CSRF, trusted origin, and valid object state.
- Financial mismatches and late captures enter review and cannot silently trigger fulfillment.
- A pre-commit staged-content scan found a real-looking Test Mode key pair and webhook endpoint in
  the tracked API example file. They were removed before commit and the staged tree was rescanned
  successfully. Treat that Test Mode pair as exposed and rotate it before any provider smoke.
- The request-driven expiry design has no scheduler; abandoned stock is released when relevant
  commerce/reconciliation traffic occurs. A durable worker remains deferred to Phase 6.
- Business tax, shipping, privacy/retention, monitoring, and live-operational obligations remain
  unresolved; this is why live mode is prohibited.

## Deferred remaining gate

Follow `PHASE-04-OPERATIONS-RUNBOOK.md` to provide a separate webhook secret, confirm Test Mode
automatic capture, configure the public HTTPS endpoint, and record successful capture, failure,
lost-callback recovery, duplicate webhook, full refund, and expiry/late-evidence scenarios. Then
request explicit Phase 4 acceptance. ADR 0006 now permits Phase 5 planning despite this issue, but
Phase 4 acceptance and live payments remain blocked.
