# Phase 3 Catalog and Inventory Threat Model Draft

## Status

**DRAFT — REVIEW REQUIRED.** Controls depend on approval of the Phase 3 decision proposal and must be verified before Phase 3 acceptance.

## Scope

This draft covers public catalog reads, authorized catalog writes, category lifecycle, exact inventory visibility, stock adjustments, and concurrency. It excludes cart, orders, payments, file upload, multiple warehouses, real-time delivery, and AI.

## Assets and trust boundaries

- Product prices, lifecycle state, category relationships, exact stock, adjustment history, and actor identity are business assets.
- Public catalog requests and all browser input are untrusted.
- Express authenticates management calls and loads permissions from MySQL through the accepted Phase 2 boundary.
- Services enforce lifecycle, category, money, and stock rules.
- Prisma transactions and MySQL constraints provide the final integrity boundary.
- Client-side route hiding never authorizes a management operation.

## Threats and proposed controls

| Threat | Proposed Phase 3 control | Residual risk / follow-up |
|---|---|---|
| Unauthorized catalog mutation | `products:manage`/`categories:manage`, CSRF, trusted origin, strict schemas | Compromised privileged sessions still require incident response and later broader audit review |
| Exact-stock disclosure | Public responses expose only availability; exact balances/history require `inventory:read` | Aggregate availability may still reveal business signals |
| Inventory tampering | `inventory:adjust`, controlled reasons, actor/request ID, append-only adjustment API | Direct database access remains an administrative risk |
| Lost concurrent updates | Required optimistic version and atomic balance-plus-ledger transaction | Clients must refresh after a conflict; high-contention strategy should be measured |
| Negative or overflow stock | Integer bounds, conditional update, database constraints where supported | Future reservations and returns need separate invariants |
| Mass assignment | Strict Zod objects and explicit Prisma data mapping | Every new mutable field requires schema review |
| Unsafe dynamic query | Allowlisted filters/sorts, bounded page size, normalized search | Substring search cost must be measured with representative volume |
| Hidden inactive data leak | Public services force active lifecycle predicates independent of query input | Cache/CDN policy must preserve visibility rules if introduced later |
| Stored/script injection | Plain-text descriptions, React escaping, no rich HTML or upload | A future rich-content feature needs sanitization and CSP review |
| Malicious remote media | No image upload or arbitrary remote image URL in the baseline | Revisit when a storage/delivery policy is approved |
| Destructive deletion | Archive/inactive lifecycle only; no hard-delete endpoint | Legal deletion and retention remain separate policy work |
| Price precision errors | MySQL decimal, string money in JSON, single approved currency | Taxes, discounts, and conversions remain Phase 4 work |
| Enumeration/denial through collections | Maximum page/search sizes, deterministic query allowlists, generic errors | Public catalog availability is intentional; rate limits may be justified after measurement |

## Required verification

- Public users can retrieve only active catalog data and cannot retrieve exact stock.
- Customers cannot call any product, category, or inventory management operation.
- Owners/admins can act only through the proposed permission checks and CSRF/origin boundary.
- Duplicate normalized SKU and slug operations fail deterministically.
- Invalid money, currency, quantity, category, status, and sort/filter input returns safe validation errors.
- Stale product/category/inventory versions return conflicts without partial writes.
- Concurrent inventory adjustments preserve nonnegative stock and one matching ledger entry per success.
- Archived/inactive catalog data cannot leak through list, detail, search, category, count, or pagination behavior.
- Responses and ledger notes exclude secrets, credentials, cookies, and uncontrolled metadata.
