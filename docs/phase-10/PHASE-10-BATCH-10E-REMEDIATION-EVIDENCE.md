# Phase 10 Batch 10E Remediation Evidence

## Status

**IMPLEMENTED AND VERIFIED; NOT ACCEPTED.** On 2026-09-09 the user approved only Batch 10E changes
10E-1 through 10E-4, the two non-secret database timing settings, the existing exact MySQL base
rebuild, and disposable tests. The implementation resolves MySQL's lower-layer gosu/Go attribution
and the demonstrated API/worker database-restart failure. It does not clear or accept the remaining
Node, migration, AI, or Prisma findings. No Trixie base, npm/Python dependency, MariaDB/Prisma
version, VEX, waiver, account, cloud resource, production data setting, or deployment changed.

## Implemented scope

### 10E-1 - final-filesystem MySQL image

`docker/mysql.Dockerfile` keeps the exact approved MySQL `8.4.11` base and existing 10D RPM changes,
then copies the prepared filesystem into a scratch final stage. The final image explicitly restores
only the reviewed runtime metadata: `999:999`, the original entrypoint and command, both ports, the
data volume, and MySQL version/PATH variables. It has the reviewed entrypoint checksum, exact MySQL,
OpenSSL, glibc, curl, libcurl, and sqlite RPM identities, and no gosu/mysql-shell history or runtime
metadata.

The final scan indexes 141 packages and reports `0C/0H`. Its SPDX SBOM contains zero `gosu` text and
zero `pkg:golang/` package URLs. Empty-volume initialization, 15 migrations, a second no-op deploy,
synthetic data persistence, health, and shutdown all pass in the disposable recovery gate.

### 10E-2 - dependency-free database supervision

`apps/api/src/db/databaseAvailability.js` owns one sequential `$connect` plus `SELECT 1` probe loop.
It does not overlap probes or retry an original request, transaction, provider call, or job action.
API and worker start fail closed until the probe succeeds, transition unavailable immediately after
a failed probe, recover only after a later successful probe, and exit non-zero exactly once after a
continuous outage reaches the configured bound. Shutdown cancels future probes and remains bounded.

The request guard returns the existing safe `503` error before route parsing or business/database
execution whenever availability is not proven. The worker stops heartbeat, scheduling,
reconciliation, and new claims while unavailable; existing leases continue through the accepted
lease/idempotency recovery path. Logs allow only the error class/code, duration, and database state.
Database URLs and credentials are not logged.

Two validated, non-secret settings were added to application and Compose examples:

| Setting | Default | Allowed range | Rule |
| --- | ---: | ---: | --- |
| `DATABASE_PROBE_INTERVAL_MS` | 5000 ms | 1000-60000 ms | Sequential probe interval |
| `DATABASE_FAILURE_EXIT_MS` | 30000 ms | 5000-300000 ms | Must be at least the probe interval |

### 10E-3 - explicit Compose dependency restart propagation

The API directly depends on healthy MySQL and the completed migration; API, worker, and optional AI
dependency edges use long-form `restart: true`. The existing deterministic `restart: "no"` process
policy remains. MySQL health now uses an authenticated application-user/database `SELECT 1`, so
dependents cannot start while the server accepts TCP but is not query-ready. No Docker socket is
mounted. Normal and raw-interruption recovery commands are documented in
`PHASE-10-CONTAINER-OPERATIONS-RUNBOOK.md`.

### 10E-4 - mandatory evidence

`docker/verify-images.ps1` now verifies the exact MySQL runtime identity, entrypoint checksum, RPMs,
configuration, history, SPDX absence of gosu/Go attribution, and the unchanged zero-critical/high
rule. `docker/verify-compose-recovery.ps1` creates a unique disposable project, credentials, and
volume; exercises startup failure, short and prolonged outages, concurrent health reads, an
ambiguous mutation, explicit Compose restart propagation, fresh process identity, migrations,
persistence, AI dependency ordering, and graceful shutdown; then always removes the disposable
resources.

## Artifact and reproducibility result

Maximum-mode provenance and the digest-pinned BuildKit SBOM generator remain enabled. Repeat builds
reproduced the exact runnable layer set and runtime configuration for both changed images. The outer
OCI indexes differ because their maximum-mode provenance attestations contain per-build metadata;
that is not the runnable identity.

| Image | Current local OCI index | Reproduced runnable manifest | Runnable config |
| --- | --- | --- | --- |
| Node | `sha256:d6c0c2a8211a665e24df43597b06100c9f4694cf3981f2dc463dd629c2a88f47` | `sha256:8a2015c9def03e1e208983f0364dca15c4aff5f8a549002ade2c06d4a7bd72e5` | `sha256:61b3ffe713e129d9612b9c186d964d7b0bedfc2cefc8c5fc92a3944047d3597d` |
| MySQL | `sha256:8e1900e093d27266dc0d62427aa816fb7720567a431a491ada7e49356e4e661e` | `sha256:7c53a23d07fece16c3a31f41b31b51e96cca4a2a3a461f7872038a4cea8e3278` | `sha256:4801f6588bd3612107ef1fa1f6b1497ecd52eac108cd381512091da3401f09fd` |

Migration and AI inputs did not change; the 10D repeat-build evidence remains applicable to them.

## Recovery result

The final disposable Compose run passed:

```text
Migrations=15; startup-fail-closed=pass; short-outage=pass;
compose-restart=pass; prolonged-outage=pass; persistence=pass;
graceful-shutdown=pass
```

The gate proved all of the following:

- bad startup database credentials fail closed without exposing the supplied sentinel;
- a short pause returns to healthy without replacing API/worker processes;
- eight concurrent health reads complete during the recovery scenario;
- `docker compose restart mysql` propagates dependency recreation in order, including optional AI;
- a prolonged raw MySQL stop makes readiness and a login mutation return `503`, then API
  and worker exit non-zero once the failure bound is reached;
- explicit dependency-ordered recreation starts a fresh worker identity without duplicate action;
- the synthetic persistence marker and all 15 migrations survive; and
- the final API and worker shutdown cleanly.

A focused worker outage test additionally holds a claimed handler in flight while availability
changes to false and completion, failure, and stop-state lease writes return `P2039`. The worker
drains locally, calls the handler exactly once, attempts completion/failure recording once, and does
not claim or replay the action. Durable recovery remains the existing lease/idempotency path.

Earlier disposable attempts exposed two real evidence gaps: an unreferenced worker polling timer
allowed Node to exit with unsettled top-level await after the pool lost its last handles, and a
TCP-only MySQL healthcheck admitted dependents before queries were ready. Retaining the polling
timer and using the authenticated query healthcheck corrected those gaps. A Windows PowerShell
HTTP-client incompatibility affected only the first test harness revision. Every failed attempt was
cleaned before the final passing run.

## Regression and security evidence

- JavaScript: lint and formatting/Prisma validation pass; the production web build has 113 modules;
  40 API files / 221 tests and 8 web files / 53 tests pass. Coverage is API
  `82.38/73.40/91.29/86.03` and web `80.62/71.79/80.60/82.81` percent for statements/branches/
  functions/lines.
- Python: dependency consistency, Ruff lint, and Ruff formatting pass; 165 tests pass and 3
  opt-in cross-service tests skip, with 85% total coverage. The ACL-safe rerun used a unique
  task-owned `C:\\tmp` base after the known temp ACL problem produced 131 passes, 3 skips, and 34
  setup errors in an earlier run. The passing run still reports non-blocking Starlette deprecation,
  local-Qdrant payload-index, and source-tree pytest-cache permission warnings.
- Both development and test databases report all 15 migrations applied. Audit chains verify over
  144 development events and the empty post-test chain.
- The Phase 6 synthetic performance gate passes: p95 values are 41.843 ms notification list,
  47.737 ms unread count, 43.962 ms committed-job visibility, 14.316 ms materialization, and
  35.249 ms connected-client hint.
- The repository high-confidence credential scan finds only the intentional invalid-key fixture in
  `apps/api/src/config/env.test.js`. All four image history/configuration scans have zero
  high-confidence matches.

One combined JavaScript validation command reached its 120-second shell wrapper limit after lint,
schema validation, build, and all 221 API tests had passed while the web coverage command was
starting. The web coverage command was rerun separately and passed all 53 tests; no product test
failed.

## Blocking results retained

The strengthened image gate intentionally exits non-zero because findings remain:

| Artifact | Critical | High | Status |
| --- | ---: | ---: | --- |
| Node | 2 | 8 | Blocked |
| Migration | 2 | 8 | Blocked |
| AI | 3 | 11 | Blocked |
| MySQL | 0 | 0 | Pass |

Both root and migration `npm audit --omit=dev` commands also intentionally exit `1` with the same
three-node high path:
`prisma@7.9.1 -> @prisma/config@7.9.1 -> deepmerge-ts@7.1.5`
(`GHSA-ggr8-5vv4-36mx`). npm proposes a breaking Prisma downgrade. The prohibited Trixie,
Prisma/MariaDB, and `deepmerge-ts` changes were not made. The known Prisma/OpenSSL detection warning
also remains under the unchanged exact-engine/linkage check.

No residual finding is accepted. Batch 10E, the Phase 10 release, and deployment remain blocked.

## Cleanup and next gate

The disposable Compose project, containers, network, synthetic-data volume, generated environment
file, and scanner reports were removed. Reproduction-only image tags are removed after digest
comparison; the four primary local Phase 10 images remain for later approved work.

The next recommended action is proposal-only review of an honest upstream-fixed Node/Python base
and a Prisma release with a compatible `deepmerge-ts` fix when available. CI/CD, AWS region/account
eligibility, cloud provisioning, and deployment are separate approval gates.
