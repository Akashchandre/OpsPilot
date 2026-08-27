# Phase 4 Orders and Payments Decision Proposal

## Status

**ACCEPTED on 2026-08-26.** The user explicitly approved the complete recommended baseline and
authorized implementation. Razorpay Test Mode credentials are available, but their values remain
absent from the repository. ADR 0005 is authoritative where this earlier proposal uses
recommendation language.

## Scope goal

Deliver a transactionally safe, single-business INR commerce baseline on the accepted Phase 2
identity boundary and Phase 3 catalog/inventory model. The implementation should support an
authenticated cart, checkout, immutable order history, test-mode Razorpay Standard Checkout,
customer tracking, authorized operator fulfillment, full refunds, and manual reconciliation.

This proposal does not authorize live-money processing. Live mode requires a later operational,
legal, tax, privacy, shipping, credential, and go-live review.

## Recommended baseline

### 1. Customer and cart audience

**Recommendation:** Require an active authenticated OpsPilot account for all cart, checkout,
order, and payment reads. Do not add guest carts or guest-to-account cart merging.

- Each user has one persistent current cart, created lazily.
- A cart does not expire. Its items are removed only by the user or by successful conversion into
  an order.
- Each product appears at most once in a cart.
- Item quantity is a whole number from 1 through 99.
- Cart writes set an exact desired quantity rather than incrementing implicitly, making browser
  retries naturally idempotent.
- Cart mutations require the last-read cart `version`; stale writes return
  `409 RESOURCE_VERSION_CONFLICT`.

Self-service access is enforced by authenticated ownership rather than a new customer permission.
An owner or administrator may use the same self-service flow for their own account, but cannot use
it to read or alter another user's cart.

### 2. Cart price and availability behavior

**Recommendation:** Treat a cart as editable intent, not a price or stock reservation.

- The cart stores the unit price observed when an item was added or last acknowledged.
- Cart reads also return the current authoritative product price, lifecycle, and availability.
- Adding an inactive, archived, unknown, or currently out-of-stock product is rejected.
- A later product price/lifecycle/stock change may make an existing item stale or unavailable.
- Checkout recomputes every line from the database. A changed price returns a review-required
  conflict and refreshes the cart; the server never silently charges a new amount.
- Inactive products or insufficient stock block checkout without a partial order.

### 3. Money, tax, discount, and shipping totals

**Recommendation:** Keep the first Phase 4 increment in the accepted single currency, `INR`.

- Money remains fixed precision in MySQL and a decimal string in JSON.
- Razorpay amounts are derived server-side as exact integer paise; the client never supplies an
  amount or currency.
- `subtotal` is the sum of immutable order lines.
- `taxTotal`, `discountTotal`, and `shippingTotal` are stored as explicit zero-valued order
  snapshots, and `total = subtotal`.
- Coupons, offers, inclusive/exclusive GST calculations, shipping rates, cash on delivery, partial
  payment, and multi-currency conversion are deferred.

This zero-tax/zero-shipping baseline is suitable only for the test-mode integration. Live commerce
is blocked until the business supplies its tax and delivery obligations.

### 4. Address and fulfillment baseline

**Recommendation:** Model physical-goods fulfillment with one immutable India shipping-address
snapshot supplied during checkout. Do not add a reusable address book in this phase.

Required snapshot fields: recipient name, phone, address line 1, city, state, postal code, and
country code `IN`. Address line 2 is optional. Fields are bounded plain text and are never copied to
provider notes, logs, analytics, or webhook evidence.

Fulfillment is manual. An authorized operator may record a bounded plain-text carrier name and
tracking number when marking an order shipped. No carrier API, label generation, delivery promise,
shipping-rate engine, or remote tracking URL is introduced.

This physical-goods/India interpretation is a material product decision and must be changed during
review if OpsPilot is intended for digital goods or another delivery geography.

### 5. Checkout transaction and inventory policy

**Recommendation:** Reserve stock at local order creation, not at cart time and not after charging
the customer.

Within one serializable MySQL transaction, checkout should:

1. Lock/revalidate the user's cart, its expected version, and every current product and inventory
   balance.
2. Reject an empty/stale cart, inactive product, mixed currency, price change, or insufficient
   stock.
3. Create the order and immutable order-item/address/total snapshots.
4. Decrement each inventory balance and append an `ORDER_RESERVATION` inventory adjustment.
5. Create one active reservation per order line with a 15-minute server expiry.
6. Create the local Razorpay payment intent and durable checkout idempotency record.
7. Clear the current cart and commit all local writes together.

Reservation consumption on verified capture changes only reservation state; it does not decrement
inventory again. Cancellation or expiry releases active reservations exactly once, increments
inventory, and appends `ORDER_RELEASE` adjustments in one transaction.

A bounded, idempotent expiry service runs opportunistically on relevant cart, checkout, order,
inventory, and reconciliation requests. An explicit operator reconciliation action invokes the
same service. A scheduled worker is deferred to Phase 6; no queue, Redis, or background process is
introduced in Phase 4.

Concurrent checkout must use serializable transactions plus conditional inventory versions so
successful orders cannot oversell. A capture that arrives after a reservation was released moves
the order to `PAYMENT_REVIEW`; it never silently reallocates stock or fulfills the order.

### 6. Checkout and provider idempotency

**Recommendation:** Require an `Idempotency-Key` header for local order creation and every refund
request.

- Keys are UUIDs, scoped to the authenticated user and operation, and stored with a digest of the
  normalized request.
- Repeating the same key and payload returns the original result.
- Reusing a key with different cart/address/refund input returns
  `409 IDEMPOTENCY_KEY_REUSED`.
- A local UUID-backed Razorpay receipt in the form `op_<uuid>` is unique and fits Razorpay's
  40-character receipt limit.
- If Razorpay order creation times out, reconciliation queries Razorpay by that receipt before a
  retry. It never creates a second local order or exposes two payable provider orders.
- Provider IDs and database unique constraints deduplicate callback, webhook, refund, and
  reconciliation retries.

### 7. Order state machine

**Recommendation:** Use a local state machine independent of Razorpay's provider order states.

```text
PENDING_PAYMENT -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED
       |               |
       +-> CANCELLED    +-> CANCELLED (full refund required)
       +-> EXPIRED
       +-> PAYMENT_REVIEW

CANCELLED, EXPIRED, and DELIVERED are terminal for customer and operator transitions. Verified
provider evidence of a financial inconsistency, including a late capture or mismatched payment/
refund relationship, is the sole class of system exception from `CANCELLED` or `EXPIRED` to
`PAYMENT_REVIEW`; it never restores fulfillment automatically.
PAYMENT_REVIEW may move only to CANCELLED after an authorized reconciliation/refund workflow.
```

- Only a verified exact captured payment can move `PENDING_PAYMENT` to `CONFIRMED`.
- Customers may cancel only an unpaid, unexpired `PENDING_PAYMENT` order they own.
- Operators may cancel `PENDING_PAYMENT` or `CONFIRMED`; a captured payment requires a full refund.
- `PROCESSING`, `SHIPPED`, and `DELIVERED` cannot be cancelled in this baseline.
- Only `orders:manage` may perform fulfillment transitions.
- Status updates require the current order version and append immutable order-status evidence with
  actor/request context.

Returns, exchanges, partial fulfillment, partial cancellation, and post-shipment refunds are
deferred.

### 8. Razorpay client and server flow

**Recommendation:** Use Razorpay Standard Checkout with the SPA handler flow and account-level
automatic capture enabled in Razorpay Test Mode.

1. OpsPilot creates the local order/reservation and a provider-neutral payment intent.
2. The server calls Razorpay `POST /v1/orders` with the server-calculated amount in paise, `INR`,
   the unique local receipt, and `partial_payment: false`.
3. A successful provider order response is stored before the API returns safe Checkout options:
   key ID, provider order ID, amount, currency, local order ID, and 15-minute timeout.
4. The React client loads `https://checkout.razorpay.com/v1/checkout.js` directly from Razorpay and
   opens the hosted modal. OpsPilot never renders or receives card, CVV, bank, wallet, or UPI
   credential fields.
5. The SPA handler sends the returned provider order ID, payment ID, and signature to the server.
6. The server uses its stored provider order ID and secret to verify the HMAC in constant time. A
   callback cannot confirm fulfillment by itself: capture is confirmed through a matching provider
   API response or a verified `payment.captured`/`order.paid` webhook.
7. Amount, currency, provider order ID, provider payment ID, local ownership, and current state must
   all match before an order is confirmed.

Checkout dismissal or browser/network loss does not cancel the local order immediately. The user
may reopen the same provider order while the reservation is active, and a webhook can complete the
state even when the browser callback is lost.

### 9. Payment, attempt, and refund states

**Recommendation:** Separate the local payment intent from provider payment attempts.

- Payment intent: `CREATING`, `OPEN`, `CAPTURED`, `REFUND_PENDING`, `REFUNDED`, or
  `REVIEW_REQUIRED`.
- Payment attempt: `AUTHORIZED`, `CAPTURED`, or `FAILED`, keyed uniquely by Razorpay payment ID.
- Refund: `PENDING`, `PROCESSED`, or `FAILED`, keyed by local idempotency key and provider refund
  ID when available.

State application is monotonic and event-time aware. A late `payment.failed` event cannot demote a
captured payment. A mismatched amount/currency/order, duplicate successful payment, capture after
expiry, or impossible transition is stored as safe reconciliation evidence and moves the local
payment/order to review rather than fulfillment.

### 10. Webhook boundary

**Recommendation:** Expose `POST /api/v1/payments/webhooks/razorpay` outside browser-origin and
CSRF middleware but behind a dedicated small raw-body parser.

- Require the configured `X-Razorpay-Signature` and validate HMAC-SHA256 over the exact raw body
  using the separate Razorpay webhook secret and constant-time comparison.
- Require and uniquely store `x-razorpay-event-id` for deduplication.
- Accept only allowlisted event types: `payment.authorized`, `payment.captured`, `payment.failed`,
  `order.paid`, `refund.created`, `refund.processed`, and `refund.failed`.
- Handle duplicate and out-of-order delivery idempotently.
- Persist only normalized IDs, amounts, states, timestamps, an event/body digest, and safe failure
  codes. Do not persist the raw webhook payload, signatures, card details, contact details, or
  unrestricted notes.
- Return success promptly after the local transaction. Provider API reconciliation is not run
  inline in a webhook request.

Changing a webhook secret requires an overlap/rotation plan because provider retries signed with
the previous secret may still arrive.

### 11. Cancellation and refunds

**Recommendation:** Support normal full refunds only, initiated by `payments:refund` after an
operator cancels a captured but unprocessed order.

- The server derives the full captured amount; clients cannot choose a refund amount.
- Razorpay receives a stable `X-Refund-Idempotency` value for safe retry.
- A provider timeout leaves the refund `PENDING` until a webhook or reconciliation proves the
  outcome.
- `refund.processed` and `refund.failed` are verified and applied idempotently.
- Refund failure is visible to authorized operators and never changes a cancelled order back to a
  fulfillable state.

Customer-initiated refunds, partial refunds, returns, exchanges, refund-to-alternate-instrument,
and instant-refund fees are deferred.

### 12. Reconciliation

**Recommendation:** Add a per-payment operator reconciliation action protected by
`payments:reconcile`.

It fetches the Razorpay order, payments, and any known refund using stored provider IDs/receipt;
checks amount/currency/relationships; then applies only allowed monotonic transitions in a local
transaction. It is safe to retry and records actor/request/time and a result code. It is used for
provider timeouts, lost callbacks, delayed webhooks, refund ambiguity, and `PAYMENT_REVIEW`.

Bulk schedules, automated retry queues, settlement reconciliation, chargebacks, disputes, and
accounting exports are deferred to later operational phases.

### 13. Permissions

**Recommendation:** Add migration-controlled permissions:

- `orders:read`
- `orders:manage`
- `payments:read`
- `payments:refund`
- `payments:reconcile`

Assign all five to `OWNER` and `ADMIN`; assign none to `CUSTOMER`. Customer cart/order/payment
access is authenticated and ownership-scoped. The detailed mapping is in
`docs/permissions/PHASE-04-PERMISSION-MATRIX.md`.

### 14. API boundary

**Recommendation:** Keep these resources under `/api/v1`:

- `GET /cart`
- `PUT /cart/items/:productId`
- `DELETE /cart/items/:productId`
- `DELETE /cart/items`
- `POST /orders` with `Idempotency-Key` to convert the current cart
- `GET /orders` and `GET /orders/:orderId` for owned records
- `POST /orders/:orderId/cancellation` for allowed customer cancellation
- `GET /orders?view=management` and management detail for `orders:read`
- `PATCH /orders/:orderId/status` for `orders:manage`
- `POST /orders/:orderId/payment-session` to safely resume provider setup/Checkout
- `POST /payments/confirm` for the signed Standard Checkout result
- `GET /payments/:paymentId` for owner or `payments:read`
- `POST /payments/:paymentId/refunds` with `Idempotency-Key` and `payments:refund`
- `POST /payments/:paymentId/reconcile` with `payments:reconcile`
- `POST /payments/webhooks/razorpay` for the signed provider webhook

Collections use the accepted bounded pagination convention. Management filters/sorts are strict
allowlists. Public payment-provider errors are mapped to stable safe OpsPilot codes.

### 15. UI boundary

**Recommendation:** Add:

- A cart indicator and `/cart` page with quantity, stale price, unavailable product, totals,
  loading, empty, conflict, and error states.
- A checkout form with the immutable address fields and a single submit action protected against
  double clicks.
- Razorpay Standard Checkout with clear script-load, dismissal, failure, pending confirmation,
  success, and retry states.
- `/orders` and `/orders/:orderId` for owned history/tracking/payment state.
- `/admin/orders` for permission-gated fulfillment, cancellation/refund, and reconciliation.

The client never infers that payment succeeded from the modal alone; it renders the server's local
state and supports refresh/recovery after network loss.

### 16. Proposed persistence boundary

The final reviewed migration should add:

- `carts` and `cart_items` for one versioned current cart per user.
- `orders` and `order_items` for immutable customer, address, product, price, and total snapshots.
- `inventory_reservations` for per-line active/consumed/released state and expiry.
- `order_status_events` for append-only lifecycle evidence.
- `payments` for provider-neutral intents and Razorpay order/receipt mapping.
- `payment_attempts` for unique provider payment IDs and monotonic attempt state.
- `refunds` for full-refund state and provider idempotency.
- `provider_webhook_events` for deduplication, normalized evidence, and processing outcome.

Foreign keys, amount/quantity checks, unique constraints, timestamps, lookup indexes, optimistic
versions, and safe deletion behavior must reinforce the service rules. Orders, items, payment
records, refunds, and financial evidence have no hard-delete API.

## Provider and dependency review

### Selected service

Razorpay is explicitly selected by the user. The first implementation is limited to Test Mode and
Standard Checkout. Razorpay's Orders API, payment/order status APIs, normal-refund API, and signed
webhooks are the only approved provider capabilities for this increment.

### Package decision

**Recommendation:** Add no npm package. Node.js 24 already provides `fetch` for the small
server-to-server REST adapter and `node:crypto` for HMAC/timing-safe verification. The React client
loads Razorpay's provider-hosted `checkout.js`, as required by Razorpay. Provider calls are isolated
behind an injected adapter so routine automated tests never call Razorpay.

The official `razorpay` Node SDK remains an alternative if direct REST maintenance becomes
burdensome. Choosing it later would require a separate version/license/supply-chain review and
explicit installation instruction.

### Required account and connections

- Existing Razorpay merchant account in Test Mode.
- Outbound HTTPS from the API to `https://api.razorpay.com`.
- Browser HTTPS access to Razorpay Standard Checkout loaded from
  `https://checkout.razorpay.com/v1/checkout.js`.
- A public HTTPS webhook URL configured in the Razorpay Test Mode dashboard.
- Dashboard automatic-capture setting confirmed before end-to-end testing.
- Test webhook subscriptions for the allowlisted payment/order/refund events.

No tunnel, queue, Redis, worker, SDK, or new deployment account is approved by this proposal.

### Environment variables

| Variable | Required | Secret | Purpose |
|---|:---:|:---:|---|
| `RAZORPAY_KEY_ID` | Yes outside routine mocked tests | No | Test-mode API identity and safe Checkout key |
| `RAZORPAY_KEY_SECRET` | Yes outside routine mocked tests | Yes | Server-to-server API authentication and Checkout signature verification |
| `RAZORPAY_WEBHOOK_SECRET` | Yes for webhook operation | Yes | Separate dashboard-configured webhook HMAC secret |
| `CHECKOUT_RESERVATION_TTL_MINUTES` | No | No | Server reservation/Checkout timeout; proposed default `15` |

Secrets belong only in ignored local environment files during development and in an approved
secret manager in deployed environments. They must never appear in source, examples, migrations,
fixtures, documentation, responses, browser bundles, URLs, or logs. Key ID and key secret must be
rotated as a pair; the separate webhook secret follows a retry-aware rotation runbook.

### Operational burden

- Credential generation, rotation, test/live isolation, and later KYC/live activation.
- Dashboard capture and webhook configuration.
- Provider outage/timeout handling and per-record reconciliation.
- Checkout Content Security Policy and third-party-script review.
- Webhook endpoint availability, event monitoring, and secret rotation.
- Refund failure and late-capture review.
- A later live tax/shipping/legal/privacy/go-live decision.

## Minimum implementation and test gate after approval

- Unit tests for paise conversion, totals, request hashing, signatures, state machines, expiry, and
  monotonic event application.
- Database/API tests for ownership, permissions, CSRF/origin, cart version conflicts, price/stock
  staleness, transactional rollback, concurrent last-stock checkout, idempotent checkout, exact
  immutable snapshots, cancellation, release, capture/release races, and full refunds.
- Provider-adapter contract tests with local fakes for success, decline, 4xx, 5xx, timeout,
  ambiguous create recovered by receipt, amount/currency mismatch, and reconciliation.
- Webhook tests using raw signed fixtures for invalid/missing signature, duplicate event ID,
  out-of-order events, captured/failed races, late capture, refund processed/failed, and safe
  persistence.
- Frontend tests for cart/checkout/order/management success and recovery states.
- Razorpay Test Mode smoke for one successful capture, one failure, one lost-client-callback
  recovery, one duplicate webhook, and one full refund after a webhook URL is configured.
- Existing Phase 1-3 lint, formatting, Prisma validation/migration status, coverage gates, build,
  and smoke checks remain green.

## Explicitly deferred

- Guest carts, cart merge, wish lists, saved addresses, and anonymous checkout.
- Live Razorpay keys or real-money processing.
- Cash on delivery, subscriptions, payment links, partial payments, saved instruments, and custom
  card/UPI forms.
- Tax/GST calculation, coupons, discounts, offers, shipping rates, and currency conversion.
- Carrier APIs, labels, multi-package/partial fulfillment, and delivery guarantees.
- Partial refunds, returns, exchanges, post-shipment cancellation, disputes, chargebacks, and
  settlement/accounting exports.
- Multiple warehouses, backorders, split reservations, and preorder behavior.
- Queues, scheduled workers, Redis, real-time notifications, email/SMS, and AI.

## Approval checklist

Approval of the complete baseline authorizes an ADR, schema design, migration, API/UI
implementation, tests, and Test Mode integration. Reviewers should explicitly approve or change:

1. Authenticated-only carts and one persistent cart per user.
2. Quantity limit, cart versions, and explicit price-change confirmation.
3. INR-only subtotal-equals-total with zero tax/discount/shipping in Test Mode.
4. Required India shipping-address snapshot and manual fulfillment.
5. 15-minute stock reservation, opportunistic expiry, and no Phase 4 worker.
6. The proposed order/payment/attempt/refund states and transition rules.
7. Customer versus operator cancellation boundaries.
8. Razorpay Standard Checkout, Test Mode, automatic capture, and one provider order per local
   order.
9. Mandatory checkout/refund idempotency and provider receipt recovery.
10. Raw-body webhook verification, event allowlist, deduplication, and minimal evidence retention.
11. Full refunds only and manual per-payment reconciliation.
12. Five permissions and default role mappings.
13. Proposed API/UI/persistence boundaries and explicit deferrals.

## Provider smoke inputs still required

- A freshly rotated Razorpay Test Mode key pair placed only in the ignored API environment file.
- Confirmation that Razorpay Test Mode automatic capture is enabled.
- A separately generated webhook secret placed in the ignored API environment file.
- A public HTTPS Test Mode webhook URL or a decision to postpone live webhook delivery smoke while
  keeping signed-fixture coverage.

## Official provider references

- [Razorpay Standard Checkout integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
- [Razorpay create-order API](https://razorpay.com/docs/api/orders/create/)
- [Razorpay fetch-orders API and receipt filter](https://razorpay.com/docs/api/orders/fetch-all/)
- [Razorpay webhook validation and idempotency](https://razorpay.com/docs/webhooks/validate-test/)
- [Razorpay payment webhook events](https://razorpay.com/docs/webhooks/payments/)
- [Razorpay idempotent normal refunds](https://razorpay.com/docs/api/refunds/normal-refunds-idempotent/)
- [Razorpay refund webhook events](https://razorpay.com/docs/webhooks/refunds/)
- [Razorpay Test and Live modes](https://razorpay.com/docs/payments/dashboard/test-live-modes/)
