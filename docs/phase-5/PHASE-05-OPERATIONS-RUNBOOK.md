# Phase 5 Operations Runbook

## Scope and production boundary

This runbook covers the single-instance Phase 5 implementation: structured logs, request/rate
controls, support/report operations, audit verification, deterministic performance checks, and a
sanitized MySQL backup/restore exercise. It does not approve a production backup vendor,
deployment topology, RPO/RTO, retention generations, legal retention, hosted observability, or a
distributed rate store. Those remain production blockers.

## Runtime controls

- `LOG_LEVEL` is `debug`, `info`, `warn`, or `error` and defaults to `info`. Production never emits
  debug records even if configured.
- `TRUST_PROXY_HOPS` is an exact hop count from `0` to `10` and defaults to `0`. Change it only when
  the deployed proxy chain is documented and tested; never use blanket trust.
- General traffic defaults to 300 requests / 5 minutes, support writes to 30 / 15 minutes, reports
  to 60 / 5 minutes, and Razorpay webhooks to 600 / 5 minutes. All use an in-process store.
- Authenticated general/support/report keys combine the server-resolved user and Express source IP;
  anonymous and webhook keys use source IP. Client identity headers are ignored.
- A limited response is `429 RATE_LIMITED` with `Retry-After`. Do not retry before that boundary.
- Ordinary JSON is limited to 100 KiB, the raw Razorpay webhook to 64 KiB, and URL-encoded bodies
  are rejected with `415 UNSUPPORTED_MEDIA_TYPE`.

Each request receives a new server UUID in `X-Request-Id`. One JSON completion record can contain
only timestamp, level, service, environment, event, request ID, method, normalized route, status,
duration, and safe unexpected-error class/code. Headers, cookies, query/body objects, credentials,
PII, payment data, ticket text, and audit metadata are never logger inputs.

## Common operational responses

- Repeated support `409 SUPPORT_VERSION_CONFLICT`: reload the ticket, compare its version and
  history, and deliberately reapply a still-valid transition. Never overwrite blindly.
- `SUPPORT_ASSIGNEE_INVALID`: confirm the account is active and currently has
  `support:tickets:manage`.
- Slow/rejected report: confirm a strict UTC range no larger than 366 days, check the report limiter,
  and run the approved performance profile before adding caches or summary tables.
- `429`: honor `Retry-After`; if legitimate traffic repeatedly reaches a ceiling, collect
  normalized route and request-ID evidence before changing the documented setting.
- Webhook `429`: preserve the separate high ceiling and Razorpay retry window. Do not lower it to
  match ordinary API traffic.
- Unexpected `500`: correlate by server request ID. Public errors and standard logs intentionally
  omit exception messages and stacks; protected non-production debugging must not copy request
  content or secrets into logs.

## Audit integrity

Run from the repository root:

```text
npm run phase5:audit:verify --workspace @opspilot/api
npm run phase5:audit:verify --workspace @opspilot/api -- --test
```

The command emits a safe result and exits nonzero for a sequence gap, previous-hash mismatch,
event-HMAC mismatch, unknown key ID, or broken head. On failure, stop privileged local writes,
preserve the database and backups, restrict access, record the first invalid sequence, and
investigate as an integrity incident. Never repair rows or the head manually.

Audit-key rotation requires a reviewed offline verifier that retains every old key by key ID. Do
not replace or delete the current key merely to clear a verification failure.

## Representative-data performance check

The data command destroys only the explicitly confirmed isolated `_test`/`_perf` database. Never
point it at development or production.

```text
PERFORMANCE_DATA_CONFIRM=replace-isolated-synthetic-data \
  npm run phase5:performance:data --workspace @opspilot/api -- seed
npm run phase5:performance:profile --workspace @opspilot/api
PERFORMANCE_DATA_CONFIRM=replace-isolated-synthetic-data \
  npm run phase5:performance:data --workspace @opspilot/api -- clear
```

PowerShell uses `$env:PERFORMANCE_DATA_CONFIRM='replace-isolated-synthetic-data'` before the npm
command. See `PHASE-05-PERFORMANCE-EVIDENCE.md` for the recorded baseline.

## MySQL backup procedure

Before any real backup, an operator must approve the exact source database, UTC artifact name,
encrypted destination, least-privilege database identity, and retention owner. Credentials must
come from an interactive prompt or approved secret manager; never place a password in an argument,
script, log, checksum file, or shell history.

1. Confirm the source name twice and record migration status plus row/audit-head counts.
2. Create a UTC filename such as `opspilot-backup-20260828T083110Z.sql` on an encrypted,
   access-controlled destination.
3. Run MySQL 8.4 `mysqldump` with `--single-transaction --quick --routines --triggers --events
   --set-gtid-purged=OFF --no-tablespaces --result-file=<approved-path> <source>`. Use `-p` for an
   interactive password prompt when a secret manager cannot inject it safely.
4. Fail the operation on a nonzero exit code. Record byte size, UTC completion time, MySQL/tool
   versions, and SHA-256 checksum separately from the database credential.
5. Restrict artifact access immediately. A checksum proves transfer integrity, not confidentiality;
   the destination still must provide encryption at rest and controlled transport.

## Restore and validation procedure

1. Obtain explicit approval for a new isolated target. Never restore over the source or a serving
   database during validation.
2. Verify the artifact checksum before import and use an equal/newer compatible MySQL 8.4 runtime.
3. Create the empty isolated schema with the expected `utf8mb4` collation and restore the dump.
4. Compare source/manifest counts for users, products, orders, payments, attempts, refunds, support
   tickets, audit events, audit head sequence, last event sequence, and head/last-event hash.
5. Point a temporary ignored environment file only at the isolated restore; run migration status,
   health/configuration smoke, and `phase5:audit:verify` before considering any cutover.
6. Keep the source unchanged. Cutover, rollback, RPO/RTO evaluation, and production authorization
   require a deployment-phase plan.
7. Securely remove temporary plaintext artifacts and reset/delete the isolated target after the
   exercise according to its approval. Preserve only non-secret evidence.

## Phase 5 sanitized exercise evidence

On 2026-08-28, deterministic synthetic `opspilot_test` data was dumped with MySQL 8.4.11 and
restored only into `opspilot_shadow`.

| Evidence | Result |
|---|---|
| UTC artifact | `opspilot-phase5-sanitized-20260828T083110Z.sql` |
| Size / SHA-256 | 115,450,437 bytes / `9fc285ca89de73c9bfb3405e47e559b82743bc84ae014562b6cc6f536ddc5b39` |
| Dump / restore time | 2.970 s / 44.368 s |
| Restored counts | 10,000 users; 1,000 products; 100,000 orders; 50,000 payments; 50,000 attempts; 50,000 refunds; 25,000 tickets; 25,000 audit events |
| Audit continuity snapshot | Head sequence 25,000; last sequence 25,000; head hash matched last event hash |
| Cleanup | Source unchanged; `opspilot_shadow` reset; temporary SQL artifact removed |

The exercise used only synthetic content and an ignored local test credential. Production storage,
encryption ownership, schedule, retention generations, restore cadence, RPO/RTO, geography, legal
hold, and incident ownership remain unresolved and block production launch.

## Temporary retention rule

There is no hard-delete API or automatic purge for support messages/events or audit evidence.
Indefinite development/test retention is only a temporary behavior, not a legal policy. Production
must not launch until jurisdiction, account erasure/anonymization, legal hold, retention periods,
backup propagation, and deletion ownership are approved.
