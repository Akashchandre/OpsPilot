# ADR 0005 — Phase 4 Orders and Razorpay Payments Baseline

## Status

Accepted on 2026-08-26 by explicit user approval of the complete Phase 4 decision proposal. The
initial provider boundary is Razorpay Test Mode; this decision does not authorize live-money
processing.

## Context

Phase 3 provides active single-SKU products, fixed INR prices, aggregate nonnegative inventory,
optimistic versions, and an immutable adjustment ledger. Phase 4 must add carts, transactionally
safe order placement, order tracking, and a provider-integrated payment lifecycle without
overselling, trusting browser totals, duplicating financial effects, storing payment instruments,
or introducing Phase 6 background infrastructure.

The project is single-business and has no approved tax engine, discount system, shipping-rate
provider, carrier integration, return workflow, or live-payment operational policy. Razorpay was
selected by the user and Test Mode credentials are available outside version control.

## Decision

- Cart, checkout, order, and payment self-service requires an active authenticated account and is
  always scoped to the authenticated user's records. Guest carts and merge behavior are deferred.
- Each user has one persistent versioned cart. Cart quantity is whole-number 1–99, writes set the
  desired quantity, and cart contents do not reserve price or stock.
- Checkout reloads active products and inventory, recomputes exact INR totals, and rejects stale
  price, lifecycle, or stock input. Money remains fixed-precision in MySQL and decimal strings in
  JSON; Razorpay receives exact integer paise derived on the server.
- Phase 4 Test Mode totals have explicit zero tax, discount, and shipping components, so total
  equals subtotal. Live commerce remains blocked pending business tax and delivery rules.
- Checkout captures one immutable India shipping-address snapshot. Saved addresses and carrier
  integrations are deferred; fulfillment and bounded carrier/tracking data are managed manually.
- Local order creation atomically snapshots the order, decrements stock, writes reservation
  adjustments, creates 15-minute per-line reservations, creates payment/idempotency state, and
  clears the cart in a serializable transaction.
- Reservation consumption never decrements stock twice. Expiry/cancellation releases stock exactly
  once with an immutable adjustment. Cleanup is an idempotent request-driven service plus explicit
  operator reconciliation; scheduled workers remain Phase 6.
- Order states are `PENDING_PAYMENT`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`,
  `CANCELLED`, `EXPIRED`, and `PAYMENT_REVIEW`, with the transitions and cancellation boundaries
  approved in the Phase 4 proposal. `CANCELLED` and `EXPIRED` are terminal for customer/operator
  actions; verified provider evidence of a financial inconsistency (including a late capture or
  mismatched payment/refund relationship) is the sole class of system exception into
  `PAYMENT_REVIEW` and never restores fulfillment automatically.
- Razorpay Standard Checkout uses the SPA handler flow, one Razorpay order per local order,
  `partial_payment: false`, a unique `op_<uuid>` receipt, and Test Mode account-level automatic
  capture. OpsPilot never accepts or stores raw card, CVV, bank, wallet, or UPI credentials.
- A Checkout callback must pass server-side HMAC verification using the stored provider order ID.
  Only an exact captured provider state proven through a provider fetch or verified webhook can
  confirm an order.
- Payment intents, provider payment attempts, refunds, webhook events, and order status evidence
  are distinct durable records. State changes are monotonic, idempotent, and amount/currency/
  relationship checked. Impossible or late-capture states enter review rather than fulfillment.
- Checkout and refund provider effects require caller-supplied UUID idempotency keys plus stored
  request digests. Razorpay order recovery uses the unique receipt; normal refunds use
  `X-Refund-Idempotency`.
- Razorpay webhooks use a dedicated small raw-body route outside browser CSRF/origin middleware.
  HMAC-SHA256 over exact bytes, the separate webhook secret, constant-time comparison, unique
  event IDs, an event allowlist, and minimal normalized persistence are mandatory.
- Operators may issue only normal full refunds for captured, unprocessed cancelled orders.
  Partial refunds, customer-initiated refunds, returns, exchanges, and post-shipment cancellation
  are deferred.
- Per-payment reconciliation is a permission-gated, retry-safe synchronous operator action. Bulk
  jobs, settlement reconciliation, disputes, and accounting exports are deferred.
- New permissions are `orders:read`, `orders:manage`, `payments:read`, `payments:refund`, and
  `payments:reconcile`. `OWNER` and `ADMIN` receive them; `CUSTOMER` receives none. Customer
  self-service uses ownership rather than these operator permissions.
- No npm dependency is added. Node.js 24 `fetch` and `node:crypto` implement the isolated provider
  adapter and signatures; React loads Razorpay's documented hosted Checkout script.
- Required provider configuration is `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and a separate
  `RAZORPAY_WEBHOOK_SECRET`. A configurable reservation TTL defaults to 15 minutes. Secret values
  never enter version control, browser bundles, responses, URLs, logs, fixtures, or documentation.

## Considered alternatives

- Guest checkout and merge were rejected for this increment because they add identity, cookie,
  abuse, and ownership complexity without an approved need.
- Reserving at cart time was rejected because abandoned browsing would hold stock. Reserving only
  after capture was rejected because customers could be charged after stock was exhausted.
- Razorpay Custom Checkout was rejected because it increases PCI and payment-instrument handling
  scope. Standard Checkout keeps sensitive entry with the provider.
- The Razorpay npm SDK was not selected because the small approved REST/HMAC surface is covered by
  Node.js platform APIs and an injected adapter. It may be reconsidered through dependency review.
- Manual capture was rejected for the Test Mode baseline because it adds another external state and
  failure boundary. Only captured state authorizes confirmation/fulfillment.
- A background reservation/refund worker was rejected because queues and workers begin in Phase 6.
- Partial refunds and post-shipment returns were rejected until product, logistics, and accounting
  policies exist.

## Consequences

Checkout has a deliberate local/provider split: local state commits before the network provider
call, and unique receipt reconciliation resolves ambiguous provider creation. Reservation expiry
can be delayed until an applicable request arrives because no scheduler exists; the same service is
designed for later Phase 6 scheduling.

Late capture after release, provider relationship mismatches, and ambiguous refunds require an
operator-visible review path. This is safer than silently fulfilling or discarding financial facts.
The database and tests are larger because carts, immutable snapshots, reservations, payment
attempts, refunds, idempotency, provider events, and lifecycle evidence have distinct invariants.

The Test Mode baseline is not production commerce. Live mode requires explicit tax/GST, shipping,
returns, privacy/retention, KYC, live-key, secret-management, webhook reliability, monitoring,
incident response, and go-live approval.

## Related documents

- `docs/phase-4/PHASE-04-DECISION-PROPOSAL.md`
- `docs/permissions/PHASE-04-PERMISSION-MATRIX.md`
- `docs/security/PHASE-04-THREAT-MODEL.md`
- `docs/phases/PHASE-04-ORDERS-PAYMENTS.md`
- `docs/phase-4/PHASE-04-IMPLEMENTATION-GUIDE.md`
- `docs/phase-4/PHASE-04-OPERATIONS-RUNBOOK.md`
- `docs/phase-4/PHASE-04-REVIEW-REPORT.md`
