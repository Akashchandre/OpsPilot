# Phase 4 Orders and Payments Implementation Guide

## Status

**IMPLEMENTED on 2026-08-26; Razorpay Test Mode delivery smoke and explicit phase acceptance are
pending.** ADR 0005 is authoritative. This guide describes the repository behavior that is ready
for review; it does not authorize live-money processing.

## Delivered scope

- One persistent, versioned cart per authenticated user with exact quantity updates from `1` to
  `99`, observed/current price comparison, and product/stock review states.
- Serializable cart-to-order conversion with immutable product, address, and money snapshots.
- Aggregate stock decrement plus immutable `ORDER_RESERVATION` evidence and 15-minute per-line
  reservations that are consumed or released exactly once.
- Razorpay Test Mode Orders API adapter and provider-hosted Standard Checkout without a new npm
  dependency or any OpsPilot payment-credential fields.
- Signed Checkout confirmation, exact raw-body webhook verification/deduplication, payment state
  reconciliation, and normal full refunds.
- Owned customer order history, payment retry, and unpaid cancellation, plus permission-gated
  operator fulfillment, cancellation, refund, and reconciliation.

Guest carts, reusable addresses, tax/GST, discounts, shipping rates, partial payments/refunds,
returns, carrier APIs, workers/queues, live keys, and real-money processing remain deferred.

## Customer and operator flow

1. An authenticated customer adds an active product from its detail page. The cart stores the
   observed unit price but reserves no stock.
2. Cart reads compare observed price, current price, product lifecycle, and current availability.
   A changed price must be acknowledged through a cart write before checkout.
3. Checkout accepts a bounded India shipping-address snapshot and the current cart version. The
   API derives every amount and rejects an empty, stale, mixed-currency, inactive, or
   insufficient-stock cart.
4. The local order, lines, stock adjustments, reservations, payment intent, status evidence, and
   cart clear commit atomically. The API then creates or recovers the Razorpay order by its unique
   receipt.
5. React opens only Razorpay's allowlisted hosted script. A dismissal or browser/network loss
   leaves the same order payable until its reservation expires.
6. A signed Checkout result is posted to OpsPilot. The API validates the HMAC and then fetches the
   payment; only an exact captured provider record confirms the order.
7. Customers can list and inspect only their orders, resume an active payment, or cancel their own
   unpaid pending order.
8. Authorized operators use `/admin/orders` to advance fulfillment, cancel eligible orders, issue
   the full refund, or reconcile provider state.

## Transaction and provider boundary

The local checkout transaction uses serializable isolation. Inventory is conditionally updated and
an immutable adjustment is appended for every line; concurrent last-unit checkout therefore has
at most one successful order. A captured reservation changes from `ACTIVE` to `CONSUMED` without a
second decrement. Expiry or unpaid cancellation changes active reservations to `RELEASED`, restores
stock, and appends `ORDER_RELEASE` adjustments.

Razorpay cannot participate in the MySQL transaction. The local `payments` row therefore starts
independently, has a unique `op_<uuid>` receipt, and is reconciled with provider I/O afterward. An
ambiguous create-order call is recovered by receipt before another create is attempted. Callback,
webhook, refund, and reconciliation paths use unique provider IDs and monotonic local transitions.

The trust rule is strict: browser data never decides totals, capture, refund amount, or state.
Provider data affects local state only after its authentication/provenance and provider order,
payment/refund relationship, amount, and currency match stored state. Any verified financial
inconsistency enters `PAYMENT_REVIEW`; it never restores stock allocation or fulfillment
automatically.

## State machines

```text
PENDING_PAYMENT -- exact captured payment --> CONFIRMED --> PROCESSING --> SHIPPED --> DELIVERED
       |                                      |
       +-- unpaid cancel -------------------->+--> CANCELLED (operator cancel requires full refund)
       +-- reservation timeout --------------> EXPIRED
       +-- verified financial inconsistency -> PAYMENT_REVIEW -- refunded/operator --> CANCELLED
```

`CANCELLED`, `EXPIRED`, and `DELIVERED` are terminal for customer/operator transitions. Verified
provider evidence may move a cancelled or expired order into `PAYMENT_REVIEW` so money is not
silently ignored. Shipping requires both carrier name and tracking number.

```text
Payment: CREATING -> OPEN -> CAPTURED -> REFUND_PENDING -> REFUNDED
                    \---------------------------> REVIEW_REQUIRED

Attempt: FAILED -> AUTHORIZED -> CAPTURED (monotonic priority)
Refund:  PENDING -> FAILED or PROCESSED
Reservation: ACTIVE -> CONSUMED or RELEASED
```

Repeated capture evidence after `CAPTURED`, `REFUND_PENDING`, or `REFUNDED` is idempotent and does
not reverse a refund. A failed event cannot demote an authorized/captured attempt.

## API and authorization

The implemented endpoint table and request rules are in `docs/04-API-CONTRACT.md`.

- Cart and self-order operations use authenticated ownership; there is no customer permission.
- `orders:read` enables `view=management`; `orders:manage` enables fulfillment/cancellation.
- `payments:read` enables non-owned safe payment reads; `payments:refund` and
  `payments:reconcile` protect their respective actions.
- All five permissions are migration-controlled and assigned to `OWNER` and `ADMIN`, not
  `CUSTOMER`.
- Browser writes require exact trusted origin and session-bound CSRF. Order creation and refund
  additionally require a UUID `Idempotency-Key`.
- The Razorpay webhook route is not a browser route: it bypasses browser origin/CSRF handling but
  requires the exact raw-body HMAC and unique provider event ID.

## Failure and recovery behavior

| Condition | Safe behavior | Recovery |
|---|---|---|
| Price, lifecycle, or stock changed | Checkout returns a conflict; no partial order | Review/update cart and retry |
| Local checkout request repeated | Same key/body returns the original order | Reuse the original key for the same operation |
| Provider order create is ambiguous | Local order remains durable; adapter searches by receipt | Retry payment session |
| Checkout script fails or modal closes | Order remains pending and payable until expiry | Retry from checkout/order detail |
| Callback HMAC invalid | No provider fetch or financial transition | Treat as failed/tampered client result |
| Provider fetch unavailable after valid callback | API returns confirmation pending | Wait for webhook or reconcile |
| Duplicate/out-of-order webhook | Event is deduplicated; state is monotonic | No manual action unless review is shown |
| Capture after expiry/cancellation or mismatch | Order/payment enter review; no fulfillment | Operator reconciles and refunds as required |
| Refund call times out ambiguously | Refund remains pending | Retry with the same key and reconcile |
| Refund fails conclusively | Failure is retained; order stays non-fulfillable | Retry with a new key after reviewing provider state |

## Configuration

Safe variable names are present in `apps/api/.env.example` and
`apps/api/.env.test.example`:

| Variable | Meaning |
|---|---|
| `RAZORPAY_ENABLED` | Explicitly activates provider calls and webhook verification |
| `RAZORPAY_KEY_ID` | Test Mode API identity and browser-safe Checkout key |
| `RAZORPAY_KEY_SECRET` | Server-only API authentication and Checkout HMAC secret |
| `RAZORPAY_WEBHOOK_SECRET` | Separate server-only dashboard webhook HMAC secret |
| `CHECKOUT_RESERVATION_TTL_MINUTES` | Reservation timeout from 3 to 15 minutes; default 15 |

When Razorpay is enabled, all three provider values are required. Secret values belong only in
ignored local environment files or a future approved secret manager. They must never enter source,
documentation, fixtures, migrations, responses, browser bundles, URLs, or logs.

## Main implementation locations

- Prisma schema/migration: `apps/api/prisma/schema.prisma` and
  `apps/api/prisma/migrations/20260826043501_phase_4_orders_payments/`.
- API commerce modules: `apps/api/src/modules/cart/`, `orders/`, `payments/`, and `commerce/`.
- Raw webhook registration: `apps/api/src/app.js`.
- Web API/Checkout boundary: `apps/web/src/api/commerce.js` and
  `apps/web/src/payments/razorpayCheckout.js`.
- Customer/operator pages: `apps/web/src/pages/CartPage.jsx`, `CheckoutPage.jsx`,
  `OrdersPage.jsx`, `OrderDetailPage.jsx`, and `AdminOrdersPage.jsx`.

## Automated evidence

The Phase 4 integration suite covers cart versions and ownership, price review, idempotent and
concurrent checkout, self/management reads, exact-capture confirmation, fulfillment, cancellation,
refund retry/idempotency, invalid/duplicate/out-of-order webhooks, expiry/late capture, and
reconciliation. Frontend tests cover cart actions, hosted Checkout success/recovery, owned order
flows, permission-gated operations, fulfillment, refund, reconciliation, and script-load failure.

The final command/coverage snapshot is recorded in `docs/phase-4/PHASE-04-REVIEW-REPORT.md`.
