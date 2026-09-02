# Phase 4 Razorpay Test Mode Operations Runbook

## Status and safety boundary

This runbook is for Razorpay **Test Mode only**. Phase 4 does not authorize live keys, real-money
transactions, production deployment, or business launch. Never paste credentials into source,
documentation, issue trackers, test fixtures, shell history, logs, screenshots, or chat. If a key
secret has been shared outside the intended secret channel, rotate the Test Mode key pair before
using it.

The current repository is ready for signed local fixtures. Real provider delivery smoke remains
blocked until a separate webhook secret, a public HTTPS endpoint, and dashboard automatic capture
are configured.

## Dashboard and local setup

1. In the Razorpay dashboard, select **Test Mode** and confirm account-level automatic capture.
2. Generate or rotate a Test Mode key pair. The key ID must begin with `rzp_test_`. Put the key ID
   and secret only in the ignored `apps/api/.env`; do not modify either example file with real
   values.
3. Create a separate strong webhook secret in the Test Mode webhook configuration. It is not the
   API key secret.
4. Expose the API through a reviewed public HTTPS URL and configure this exact endpoint:

   ```text
   POST https://<test-host>/api/v1/payments/webhooks/razorpay
   ```

5. Subscribe only to:

   ```text
   payment.authorized
   payment.captured
   payment.failed
   order.paid
   refund.created
   refund.processed
   refund.failed
   ```

6. Configure the ignored API environment file with values obtained through the secret channel:

   ```text
   RAZORPAY_ENABLED=true
   RAZORPAY_KEY_ID=<test-mode-key-id>
   RAZORPAY_KEY_SECRET=<test-mode-key-secret>
   RAZORPAY_WEBHOOK_SECRET=<separate-test-webhook-secret>
   CHECKOUT_RESERVATION_TTL_MINUTES=15
   ```

7. Restart the API so startup validation reads the new environment. Keep the web and API origins
   aligned with the existing CORS/CSRF configuration.

The API uses `https://api.razorpay.com/v1`; the browser loader accepts only
`https://checkout.razorpay.com/v1/checkout.js`.

## Pre-smoke checks

- From the repository root, run:

  ```text
  npm run payments:razorpay:check
  ```

  The command is read-only and redacts all credential/provider-response values. It must report
  `razorpay.preflight_completed`, `mode: test`, and `apiCredentials: verified`. Its listed external
  checks are reminders, not failures: automatic capture, public HTTPS webhook delivery, and
  webhook event subscriptions are verified in the dashboard steps below.
- Apply all committed migrations and confirm both development and test databases are current.
- Confirm the API health endpoint reports database readiness.
- Ensure there is one active `INR` product with sufficient whole-number stock and an active
  category.
- Have one active customer account and one `OWNER` or `ADMIN` account available.
- Confirm the public webhook URL preserves the request body byte-for-byte and does not parse/rewrite
  it before Express.
- Send a Razorpay dashboard test webhook and verify an HTTP `200` response. Do not record the raw
  payload or signature in project artifacts.

## Required Test Mode smoke scenarios

Record only local/provider IDs, timestamps, safe statuses, and request IDs. Redact contact/address
data and all credentials.

1. **Successful capture**
   - Add stock to a cart, place the order, and complete Razorpay's successful test payment.
   - Expect one local order/provider order, `CONFIRMED` order, `CAPTURED` payment and attempt,
     consumed reservations, and a single inventory decrement.
2. **Failed payment**
   - Use a Razorpay failure test path.
   - Expect no confirmation or fulfillment. A failed attempt may be stored while the order remains
     payable until expiry.
3. **Lost client callback**
   - Close or disconnect the browser after provider completion before the SPA confirmation returns.
   - Expect the verified webhook to confirm the order; otherwise use operator reconciliation.
4. **Duplicate delivery**
   - Redeliver the same dashboard webhook/event ID.
   - Expect HTTP `200`, one stored event identity, and no duplicate transition/inventory effect.
5. **Full refund**
   - As an operator, cancel an eligible captured `CONFIRMED` order, then issue its full refund.
   - Expect `REFUND_PENDING` until proven, followed by `REFUNDED` and one processed refund record.
6. **Expiry and late evidence**
   - Allow one unpaid reservation to expire and verify stock release once.
   - If a capture is later proven, expect `PAYMENT_REVIEW`, never automatic fulfillment.

Do not mark Phase 4 accepted until these scenarios are recorded in the review report or an explicit
review decision defers the unavailable provider-delivery cases.

## Operational recovery

| Local state/symptom | Operator action | Do not do |
|---|---|---|
| Payment `CREATING` with no provider order ID | Ask the owner to retry the payment session; receipt recovery runs before create | Create a second local order or edit provider IDs |
| Payment `OPEN`, callback lost | Wait for verified webhook, then run per-payment reconciliation if needed | Mark the order paid manually |
| Order/payment `PAYMENT_REVIEW` / `REVIEW_REQUIRED` | Compare safe local IDs/status in the Razorpay dashboard, run reconciliation, then full-refund if required | Fulfill, rewrite amount/currency, or bypass state checks |
| Refund `PENDING` after timeout | Retry with the same idempotency key and reconcile known provider state | Generate changing keys on network retries |
| Refund `FAILED` | Verify provider state, then retry intentionally with a new key | Return the order to a fulfillable state |
| Webhook signature failures | Confirm the Test Mode endpoint and webhook secret, proxy raw-body preservation, and clock-independent configuration | Log raw signatures/payloads or substitute the API secret |
| Repeated provider `5xx`/timeout | Pause manual retries, preserve local pending state, and retry/reconcile after provider recovery | Loop unbounded requests or assume failure means no charge |

The operator action is deliberately per payment. Bulk retry jobs, settlement reconciliation,
chargebacks, disputes, accounting exports, and automated alerting are deferred.

## Secret rotation and incident response

- **API key pair:** rotate the Test Mode key pair in Razorpay, update the ignored environment or
  future approved secret store, restart the API, and verify a new test order. Reconcile outstanding
  orders rather than recreating them.
- **Webhook secret:** the current application accepts one webhook secret at a time. Schedule a
  controlled change, update dashboard and server configuration together, restart, send a test
  webhook, and reconcile events that may have retried with the previous secret. A dual-secret
  overlap would require a reviewed code change.
- **Suspected exposure:** revoke/rotate immediately, stop Test Mode provider activity if needed,
  inspect the Razorpay dashboard for unexpected orders/refunds, preserve only redacted incident
  evidence, and reconcile affected local payments.
- Never copy Test Mode values into a live environment. Live activation requires a separate
  operational, legal, tax, privacy, fulfillment, credential, monitoring, and go-live review.

## Official Razorpay references

- [Standard Checkout integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
- [Orders API](https://razorpay.com/docs/api/orders/create/)
- [Webhook validation and testing](https://razorpay.com/docs/webhooks/validate-test/)
- [Payment webhook events](https://razorpay.com/docs/webhooks/payments/)
- [Idempotent normal refunds](https://razorpay.com/docs/api/refunds/normal-refunds-idempotent/)
- [Refund webhook events](https://razorpay.com/docs/webhooks/refunds/)
- [Test and Live modes](https://razorpay.com/docs/payments/dashboard/test-live-modes/)
