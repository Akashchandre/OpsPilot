# Phase 3 Permission Matrix

## Status

Accepted on 2026-08-25. The definitions and mappings are migration-controlled.

## Permissions

| Code | Meaning |
|---|---|
| `products:manage` | Create and maintain products, category assignments, pricing, and lifecycle state |
| `categories:manage` | Create and maintain categories and lifecycle state |
| `inventory:read` | View exact stock quantities, low-stock thresholds, and adjustment history |
| `inventory:adjust` | Apply controlled stock adjustments with a reason and immutable ledger entry |

## Default role matrix

| Permission | `OWNER` | `ADMIN` | `CUSTOMER` |
|---|:---:|:---:|:---:|
| `products:manage` | Yes | Yes | No |
| `categories:manage` | Yes | Yes | No |
| `inventory:read` | Yes | Yes | No |
| `inventory:adjust` | Yes | Yes | No |

Public active-catalog reads do not require a permission. Exact inventory remains protected. Unknown permissions remain denied. Phase 3 does not add arbitrary role/permission administration.
