# Phase 4 — Orders and Payments

## Objective

Implement a transactionally safe customer cart, order placement/tracking, and provider-integrated payment lifecycle on accepted catalog/inventory rules.

## Requirements and goals

- Customer cart add/update/remove/read behavior.
- Authoritative server-side checkout calculations and inventory validation/reservation.
- Immutable order and line-item snapshots with a defined status machine.
- Customer order list/details/tracking and authorized operator management.
- Secure provider payment initiation, verified idempotent webhooks, state reconciliation, and agreed refund/cancellation behavior.

## Decisions required

Guest carts; cart expiry/merge; addresses; shipping/fulfillment; tax/discounts; currencies; stock reservation and expiry; oversell policy; order states/transitions; payment provider/account; client payment flow; idempotency; webhook/refund/retry/reconciliation; PCI scope; cancellation/return policy.

## Tasks

Approve workflows, provider/dependencies/accounts/env variables; threat-model checkout/payment; finalize schema and state machines; implement transactional cart-to-order service; integrate provider through an adapter; verify/deduplicate webhooks using provider rules; implement authorized customer/operator UI/API; add reconciliation/auditing; test failures/concurrency; document operations and update progress.

## Acceptance criteria

- Cart and checkout recompute price/availability on the server and reject invalid/stale input safely.
- Concurrent checkout cannot oversell under the selected inventory policy.
- Repeated checkout/payment/webhook requests do not create duplicate orders, charges, or state transitions.
- Order history preserves purchase-time data after catalog changes.
- Payment and order states remain reconcilable; verified provider events alone affect payment state.
- Customers see only their orders/payments; authorized operators see only permitted scope.
- No raw card data is stored or logged.

## Testing requirements

Unit tests for totals and state machines; database/API tests for cart rules, checkout transaction rollback, concurrency, idempotency, permissions, cancellation/refund transitions; provider sandbox/contract tests for success, decline, timeout, duplicate/out-of-order/invalid-signature webhooks and reconciliation; frontend/E2E critical purchase and failure paths.

## Edge cases

Price/stock changes during checkout, empty/expired carts, multiple currencies, rounding, network loss after provider success, delayed/out-of-order/duplicate webhook, partial failure, payment success with local timeout, cancellation racing fulfillment/payment, partial refund, abandoned reservation, deleted/inactive product.

## Security considerations

Minimize PCI scope; use provider-hosted/tokenized methods where selected; verify webhook raw payload/signatures; never trust client totals/status; protect endpoints with authorization/rate/idempotency controls; redact payment metadata; audit financial transitions; isolate test and live credentials.

## Completion criteria

State machines and reconciliation are documented; all transaction/concurrency/idempotency/security/provider tests pass; operational failure recovery is demonstrated; prior phases remain stable; future infrastructure/AI is absent; and explicit phase acceptance is recorded.

## Documentation updates

Update database/API/architecture, order/payment state diagrams, provider setup and webhook/reconciliation runbooks, environment catalog, decisions, this phase status, and `WORK-PROGRESS.md`.

## Explicit exclusions

Redis/queues/realtime unless explicitly moved by an architectural decision, advanced support automation, RAG, and AI remain out of scope.

