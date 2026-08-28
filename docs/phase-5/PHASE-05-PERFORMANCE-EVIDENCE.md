# Phase 5 Performance Evidence

## Status

**PASS — recorded 2026-08-28.** The accepted local engineering targets are met on deterministic,
synthetic, target-sized data. These results are regression evidence, not a production SLA.

## Dataset and method

`npm run phase5:performance:data --workspace @opspilot/api -- seed` refuses production and ordinary
development databases, accepts only an `_test` or `_perf` database, and requires
`PERFORMANCE_DATA_CONFIRM=replace-isolated-synthetic-data`. It resets that isolated target and
creates only deterministic `.invalid` identities and synthetic business content.

| Resource | Rows |
|---|---:|
| Customers / products | 10,000 / 1,000 |
| Orders | 100,000 |
| Payments / captured attempts / processed refunds | 50,000 / 50,000 / 50,000 |
| Support tickets | 25,000 |
| Valid HMAC-chained audit events | 25,000 |

`npm run phase5:performance:profile --workspace @opspilot/api` validates those counts, performs five
warm-ups followed by 30 measured serial samples, verifies the audit chain, and emits MySQL
`EXPLAIN ANALYZE` plans. The range was the half-open UTC interval
`[2025-08-29T00:00:00.000Z, 2026-08-29T00:00:00.000Z)`.

Runtime context: Node.js 24.19.0, MySQL 8.4.11, Windows x64, 11th Gen Intel Core i5-11320H (8
logical CPUs), 15.7 GiB RAM, and the application's five-connection local database pool.

## Final latency results

| Path | p50 | p95 | Maximum | Target | Result |
|---|---:|---:|---:|---:|---|
| Authenticated `GET /api/v1/reports/overview` | 181.461 ms | 206.022 ms | 240.954 ms | p95 < 1,000 ms | Pass |
| Overview service/query path | 177.679 ms | 209.892 ms | 229.084 ms | p95 < 1,000 ms | Pass |
| Support management list, page 1 / 20 | 103.879 ms | 159.322 ms | 163.385 ms | p95 < 300 ms | Pass |
| Customer order list, first 20 | 1.085 ms | 1.709 ms | 1.927 ms | p95 < 300 ms | Pass |
| Bounded audit read, first 100 plus count | 5.483 ms | 7.675 ms | 13.589 ms | p95 < 300 ms | Pass |

The full API measurement includes request context, cookie parsing, server-side session resolution,
general and report limits, authorization, validation, controller serialization, and response
parsing. The performance session and permission assignment are synthetic and exist only in the
isolated dataset.

## Query-plan review

| Access path | Final `EXPLAIN ANALYZE` observation |
|---|---|
| Order status breakdown | Covering `orders_status_created_at_idx` scan; 100,000 rows; 44.6 ms aggregate plan |
| Captured amount | Covering `payment_attempts_status_currency_created_at_amount_idx` range scan; 50,000 rows; 25.9 ms |
| Processed refund amount | Forced covering `refunds_status_currency_updated_at_amount_idx` range scan; 50,000 rows; 36.9 ms |
| New customers | `users_created_at_idx` range plus primary user-role lookup; 10,000 rows; 114 ms |
| Inventory snapshot | 1,000 inventory rows plus primary product lookup; 4.76 ms |
| Ticket breakdown | `support_tickets_created_at_status_priority_idx` range scan; 25,000 rows; 21.3 ms |
| Support management page | Bounded top-20 sort after covering scan; 25,000 rows; 16 ms plan / 159.322 ms service p95 |
| Audit page | Reverse unique sequence-index scan limited to 100; 0.791 ms |

The first target-sized overview profile was 963.004 ms p95. MySQL selected the older
`refunds_status_created_at_idx` for the updated-time refund sum, taking about 757 ms. Migration
`20260828080000_phase_5_report_covering_indexes` added covering attempt/refund indexes. MySQL 8.4
continued to underestimate the older refund path after statistics refresh, while a forced check of
the covering index was materially faster. The fixed, parameterized refund aggregate therefore
uses that specific index hint. The final API p95 is 206.022 ms. No cache, summary table, service, or
new dependency was added.

The synthetic 25,000-event audit chain verified as valid after profiling. Uniform synthetic data
cannot model every production distribution, concurrent-load/soak behavior, network topology, or
multi-instance contention; those remain deployment-phase capacity work.
