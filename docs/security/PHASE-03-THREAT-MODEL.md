# Phase 3 Catalog and Inventory Threat Model

## Status

Accepted for implementation on 2026-08-25. The automated authorization, visibility, validation, lifecycle, stale-write, and concurrent-adjustment controls were verified, and Phase 3 was explicitly accepted on 2026-08-26.

## Scope

This model covers public catalog reads, authorized catalog writes, category lifecycle, exact inventory visibility, stock adjustments, and concurrency. It excludes cart, orders, payments, file upload, multiple warehouses, real-time delivery, and AI.

## Assets and trust boundaries

- Product prices, lifecycle state, category relationships, exact stock, adjustment history, and actor identity are business assets.
- Public catalog requests and all browser input are untrusted.
- Express authenticates management calls and loads permissions from MySQL through the accepted Phase 2 boundary.
- Services enforce lifecycle, category, money, and stock rules.
- Prisma transactions and MySQL constraints provide the final integrity boundary.
- Client-side route hiding never authorizes a management operation.

## Threats and controls

| Threat | Phase 3 control | Residual risk / follow-up |
|---|---|---|
| Unauthorized catalog mutation | `products:manage`/`categories:manage`, CSRF, trusted origin, strict schemas | Compromised privileged sessions still require incident response and later broader audit review |
| Exact-stock disclosure | Public responses expose only availability; exact balances/history require `inventory:read` | Aggregate availability may still reveal business signals |
| Inventory tampering | `inventory:adjust`, controlled reasons, actor/request ID, append-only adjustment API | Direct database access remains an administrative risk |
| Lost concurrent updates | Required optimistic version and atomic balance-plus-ledger transaction | Clients must refresh after a conflict; high-contention strategy should be measured |
| Negative or overflow stock | Integer bounds, conditional update, database checks, and service validation | Future reservations and returns need separate invariants |
| Mass assignment | Strict Zod objects and explicit Prisma data mapping | Every new mutable field requires schema review |
| Unsafe dynamic query | Allowlisted filters/sorts, bounded page size, normalized search | Search cost must be measured with representative volume |
| Hidden inactive data leak | Public services force active lifecycle predicates independent of input | Future cache/CDN policy must preserve visibility rules |
| Stored/script injection | Plain-text descriptions, React escaping, no rich HTML or upload | Future rich content needs sanitization and CSP review |
| Malicious remote media | No image upload or arbitrary remote image URL | Revisit when storage and delivery are approved |
| Destructive deletion | Archive/inactive lifecycle only; no hard-delete endpoint | Legal deletion and retention remain separate policy work |
| Price precision errors | MySQL decimal, string money in JSON, one accepted currency | Taxes, discounts, and conversions remain Phase 4 work |
| Collection abuse | Maximum page/search sizes, deterministic allowlists, safe errors | Public catalog rate limits may be justified after measurement |

## Required verification

- Public users retrieve only active catalog data and never exact stock.
- Customers cannot call product, category, or inventory management operations.
- Owners/admins act only through permission, CSRF, and origin controls.
- Duplicate normalized SKU and slug operations fail deterministically.
- Invalid money, currency, quantity, category, status, and sort/filter input returns safe errors.
- Stale product/category/inventory versions return conflicts without partial writes.
- Concurrent inventory adjustments preserve nonnegative stock and one ledger entry per success.
- Archived/inactive data cannot leak through lists, details, search, categories, counts, or pagination.
- Responses and ledger notes exclude credentials, cookies, and uncontrolled metadata.
