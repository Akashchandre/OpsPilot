# Phase 4 Permission Matrix

## Status

**IMPLEMENTED on 2026-08-26 and verified on 2026-08-27.** The reviewed migration assigns these
stable permissions to the fixed system roles in both development and test databases.

## Ownership-scoped customer actions

An active authenticated user may perform these actions without a new RBAC permission, but only for
their own user ID:

- Read and mutate the current cart.
- Convert the current cart to an order.
- List and retrieve owned orders and their safe payment/refund state.
- Resume Razorpay Checkout for an owned payable order.
- Submit a Razorpay Checkout result for an owned order; the provider signature remains mandatory.
- Cancel an owned order only while it is unpaid and `PENDING_PAYMENT`.

Ownership is established from the authenticated session, never from a client-supplied user ID. An
owner or administrator using the customer flow still receives only their own records.

## Implemented operator permissions

| Code | Meaning |
|---|---|
| `orders:read` | List and retrieve all business orders, addresses, lifecycle history, and safe fulfillment context |
| `orders:manage` | Apply approved fulfillment transitions, tracking data, and pre-fulfillment cancellation rules |
| `payments:read` | View provider-neutral payment attempts, refunds, and reconciliation state without secrets or instrument data |
| `payments:refund` | Initiate an idempotent normal full refund for an eligible captured payment |
| `payments:reconcile` | Fetch provider state and apply safe monotonic reconciliation for an identified payment |

## Implemented default role matrix

| Permission | `OWNER` | `ADMIN` | `CUSTOMER` |
|---|:---:|:---:|:---:|
| `orders:read` | Yes | Yes | No |
| `orders:manage` | Yes | Yes | No |
| `payments:read` | Yes | Yes | No |
| `payments:refund` | Yes | Yes | No |
| `payments:reconcile` | Yes | Yes | No |

Unknown permissions remain denied. Phase 4 does not add arbitrary role/permission administration
or a new employee role.

## Endpoint mapping

| Operation | Required access |
|---|---|
| Current cart reads/writes | Active session + cart ownership; CSRF/origin for writes |
| Create order from current cart | Active session + ownership + CSRF/origin + idempotency key |
| Own order/payment reads | Active session + resource ownership |
| Own unpaid-order cancellation | Active session + ownership + CSRF/origin + state/version checks |
| Management order list/detail | `orders:read` |
| Fulfillment/tracking transition | `orders:manage` + CSRF/origin + state/version checks |
| Management payment/refund detail | `payments:read` |
| Full refund | `payments:refund` + CSRF/origin + state checks + idempotency key |
| Reconcile one payment | `payments:reconcile` + CSRF/origin + state checks |
| Razorpay webhook | Valid raw-body provider signature + unique provider event ID; no browser session/CSRF |

Possessing `orders:manage` does not imply refund or reconciliation authority; the route checks the
specific payment permission even though the initial fixed roles receive all five.
