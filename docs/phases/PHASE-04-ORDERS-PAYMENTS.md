# Phase 4 — Orders and Payments

## Status

**IMPLEMENTED — EXTERNAL PROVIDER SMOKE DEFERRED; PHASE NOT ACCEPTED as of 2026-08-27.** The
migration, API, UI, automated security/concurrency/provider-contract tests, documentation, and
repository quality gates pass. Real provider smoke is now underway with authenticated Test Mode
credentials and successful provider-order creation, while hosted payment completion and dashboard
webhook/capture confirmation remain pending. ADR 0006 records the user's direction to retain this
issue as a backlog gate and begin Phase 5 decision-definition work without accepting Phase 4.
ADR 0005 remains authoritative for commerce behavior.

On 2026-09-02, the repository integration was hardened and re-verified: enabled configuration now
accepts only `rzp_test_` key IDs, a redacted read-only provider preflight is available, provider
`408`/idempotent-write `409` responses preserve safe retry semantics, and failed, missing-SDK, or
stalled hosted Checkout loads recover cleanly. The API now loads an enabled local configuration,
the rotated Test Mode pair passes the preflight and creates a provider order, and a temporary public
HTTPS tunnel passes health and rejected-signature route probes. Hosted payment completion and the
dashboard configuration are still required to satisfy the external delivery gate and accept the phase.

## Objective

Implement a transactionally safe customer cart, order placement/tracking, and provider-integrated payment lifecycle on accepted catalog/inventory rules.

## Requirements and goals

- Customer cart add/update/remove/read behavior.
- Authoritative server-side checkout calculations and inventory validation/reservation.
- Immutable order and line-item snapshots with a defined status machine.
- Customer order list/details/tracking and authorized operator management.
- Secure provider payment initiation, verified idempotent webhooks, state reconciliation, and agreed refund/cancellation behavior.

## Resolved decisions and remaining provider inputs

- **Selected:** Razorpay is the provider and the first integration uses available Test Mode
  credentials. Secret values remain outside the repository.
- **Approved:** authenticated-only carts, India shipping snapshot, INR totals with no tax/discount/
  shipping charge, 15-minute reservations, state machines, idempotency, Standard Checkout,
  automatic capture, signed webhooks, full refunds, reconciliation, permissions, and explicit
  deferrals.
- **Still required for provider testing:** a separate webhook secret, Test Mode automatic-capture
  confirmation, and a public HTTPS webhook URL or an explicit signed-fixture-only deferral.

## Tasks

- [x] Approve workflows, state machines, provider boundary, permissions, deferrals, and environment names.
- [x] Record ADR, permission matrix, and checkout/payment threat model.
- [x] Add the reviewed Prisma schema/migration and deploy it to development/test databases.
- [x] Implement transactional cart/order/reservation services and Razorpay adapter.
- [x] Implement raw signed webhook verification, deduplication, monotonic state application,
  idempotent full refunds, and per-payment reconciliation.
- [x] Implement authenticated customer and permission-gated operator API/UI workflows.
- [x] Test failures, concurrency, ownership, idempotency, signed fixtures, and browser recovery states.
- [x] Synchronize architecture, database, API, setup, recovery, and review documentation.
- [x] Harden Test Mode configuration/preflight, provider conflict retry handling, and hosted-script
      recovery; rerun the Phase 1–6 repository gate on 2026-09-02.
- [ ] Resolve the deferred Razorpay configuration issue and execute the external provider smoke
      matrix.
- [ ] Obtain explicit Phase 4 acceptance after that evidence is recorded.

## Acceptance criteria

- Cart and checkout recompute price/availability on the server and reject invalid/stale input safely.
- Concurrent checkout cannot oversell under the selected inventory policy.
- Repeated checkout/payment/webhook requests do not create duplicate orders, charges, or state transitions.
- Order history preserves purchase-time data after catalog changes.
- Payment and order states remain reconcilable; verified provider events alone affect payment state.
- Customers see only their orders/payments; authorized operators see only permitted scope.
- No raw card data is stored or logged.

## Testing requirements

The repository passes 53 API tests and 24 web tests. Coverage passes at 80.24% statements, 68.17%
branches, 94.67% functions, and 84.54% lines for the API, and 82.56% statements, 71.09% branches,
80.25% functions, and 85.10% lines for the web client. Local provider fakes and raw signed fixtures
cover success/failure/timeout/idempotency/reconciliation behavior. Real Razorpay Test Mode smoke is
still pending the external inputs listed above.

The 2026-09-02 regression passes 26 API files / 123 tests and 5 web files / 38 tests. Coverage
passes at 83.90% statements, 73.04% branches, 93.54% functions, and 87.77% lines for the API, and
83.55% statements, 73.36% branches, 82.36% functions, and 85.93% lines for the web client.

## Edge cases

Price/stock changes during checkout, empty/expired carts, multiple currencies, rounding, network loss after provider success, delayed/out-of-order/duplicate webhook, partial failure, payment success with local timeout, cancellation racing fulfillment/payment, partial refund, abandoned reservation, deleted/inactive product.

## Security considerations

Minimize PCI scope; use provider-hosted/tokenized methods where selected; verify webhook raw payload/signatures; never trust client totals/status; protect endpoints with authorization/rate/idempotency controls; redact payment metadata; audit financial transitions; isolate test and live credentials.

## Completion criteria

State machines, reconciliation, and recovery are documented; repository transaction/concurrency/
idempotency/security/provider-contract tests pass; prior phases remain stable; and future
infrastructure/AI is absent. Completion still requires the documented real Test Mode smoke and
explicit phase acceptance. ADR 0006 defers that gate so Phase 5 planning can proceed; it does not
waive the gate.

## Documentation updates

Database/API/architecture, state diagrams, environment catalog, decisions, implementation guide,
provider setup/recovery runbook, review report, this phase status, and `WORK-PROGRESS.md` are
synchronized.

## Explicit exclusions

Redis/queues/realtime unless explicitly moved by an architectural decision, advanced support automation, RAG, and AI remain out of scope.
