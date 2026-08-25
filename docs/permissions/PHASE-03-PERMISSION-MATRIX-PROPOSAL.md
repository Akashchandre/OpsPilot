# Phase 3 Permission Matrix Proposal

## Status

**REVIEW REQUIRED.** This matrix is proposed for Phase 3 and has not been inserted into a migration.

## Proposed permissions

| Code | Meaning |
|---|---|
| `products:manage` | Create and maintain products, category assignments, pricing, and lifecycle state |
| `categories:manage` | Create and maintain categories and lifecycle state |
| `inventory:read` | View exact stock quantities, low-stock thresholds, and adjustment history |
| `inventory:adjust` | Apply controlled stock adjustments with a reason and immutable ledger entry |

## Proposed default role matrix

| Permission | `OWNER` | `ADMIN` | `CUSTOMER` |
|---|:---:|:---:|:---:|
| `products:manage` | Yes | Yes | No |
| `categories:manage` | Yes | Yes | No |
| `inventory:read` | Yes | Yes | No |
| `inventory:adjust` | Yes | Yes | No |

Public active-catalog reads do not require a permission under the recommended baseline. Exact inventory remains protected. Unknown permissions remain denied.

The permissions should be migration-controlled and evaluated through the accepted Phase 2 database-backed authorization middleware. Phase 3 does not add arbitrary role/permission administration.
