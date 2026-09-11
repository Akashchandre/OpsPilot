# Phase 10 Batch 10E Recovery and Image-Evidence Proposal

## Status

**APPROVED AND IMPLEMENTED; NOT ACCEPTED.** On 2026-09-09 the user explicitly approved only changes
10E-1 through 10E-4, including the two non-secret database timing settings and disposable tests,
while prohibiting Trixie adoption, Prisma/MariaDB dependency changes, and acceptance of residual
findings. The approved implementation and verification are complete. MySQL now passes the mandatory
zero-critical/high image gate and the database recovery drills pass, but the unchanged Node,
migration, AI, and npm findings still block Batch 10E, Phase 10 release, and deployment. See
`PHASE-10-BATCH-10E-REMEDIATION-EVIDENCE.md`.

## Objective

Correct the MySQL final-filesystem evidence, make API/worker behavior deterministic across a database
restart, and identify honest fixed-base and Prisma options without hiding or accepting any residual
finding. Batch 10E must preserve the existing transaction, idempotency, authorization, audit, and
non-root boundaries.

## Current blocking evidence

The approved Batch 10D artifacts remain unaccepted:

| Artifact  | Runnable identity | Current critical/high gate |
| --------- | ----------------- | -------------------------: |
| Node      | `sha256:3df5bb5119535e2c38b2e8c1bbef144396b51f88e86206d0dce4050205f1b346` | `2C/8H` |
| Migration | `sha256:d5bebf9ad0ece5b81b7141efef077875ea68c365da4ed56942481796e9417bcc` | `2C/8H` |
| AI        | `sha256:e490b223b017682918a513979723eac5e70662f9d85a074470f905d214d413e3` | `3C/11H` |
| MySQL     | `sha256:80eae00f5dfc0c7f34d994152af82ead123ccded53b9208989d9e0d9e22a6807` | `2C/20H` |

Root and migration production audits each retain one three-node high path:
`prisma@7.9.1 -> @prisma/config@7.9.1 -> deepmerge-ts@7.1.5`. A live MySQL restart preserves the
database and migrations but leaves the API and worker in repeated Prisma `P2039` pool timeouts until
their containers are recreated in dependency order.

## Read-only candidate review

### Official Node and Python Trixie candidates

Registry manifest inspection on 2026-09-09 resolved these official candidates without creating a
Docker Engine image or tag:

| Candidate | Multi-platform index | Linux/amd64 manifest |
| --------- | -------------------- | -------------------- |
| `node:24.19.0-trixie-slim` | `sha256:ab3eebe934147fee049b5eb83c570f68c849a13c930bdfa482de99fcdfa3b3de` | `sha256:db4f733c26868756bae92ac764d7e99bf31809ce7db886ed525960fe7d544601` |
| `python:3.13.15-slim-trixie` | `sha256:9d2e5553305c7c7b0097999bb17187c69b921ccd6bc9d40e4bb5ebe652c00285` | `sha256:cc9dffa47c8294ba9bb795a8dfaeb7b76f2b30acade2c52a461a2999d127eb00` |

Docker Scout's `registry://` review fetched the public artifacts into its own indexing cache. It did
not add an Engine image/tag or run a build. The raw Node candidate reports `2C/11H`; the raw Python
candidate reports `0C/4H`. Those totals are not directly comparable with the minimized OpsPilot
final stages because the raw bases still contain npm or pip metadata that OpsPilot removes.

The more important result is that both candidate SBOMs still contain:

- `perl`/`perl-base` `5.40.1-6`;
- `util-linux` `2.41.5-0+deb13u1`; and
- `zlib` `1:1.3.dfsg+really1.3.1-1` / `zlib1g` `1:1.3.dfsg+really1.3.1-1+b1`.

Debian still marks the reviewed Trixie Perl and util-linux versions vulnerable, and no fixed Debian
zlib version exists. The Node candidate also carries vulnerable OpenSSL `3.5.6-1~deb13u2`; Trixie
security publishes `3.5.7-1~deb13u2`, already present in the newer Python candidate. Updating
OpenSSL would fix that subset only. A Trixie switch could improve scanner totals but would not meet
the user's no-residual requirement, so **neither Trixie base is proposed for adoption in Batch 10E**.

Do not mix Bookworm/Trixie with unstable or sid packages, compile ad-hoc Perl/util-linux/zlib, delete
package databases, or use a severity change as proof that a vulnerability disappeared. Recheck an
official maintained base only after fixed stable packages or an official image that genuinely
excludes the affected components is published.

### MySQL image availability

Oracle documents MySQL `8.4.12` as an August 2026 critical security patch update, but the Docker
Official Image catalog still publishes `8.4.11` for the `8.4` line as of this review. Batch 10E must
not pull an unpublished/unsupported tag or silently upgrade the database server. The existing exact
`8.4.11` base index remains the only proposed local/CI input.

### Prisma and `deepmerge-ts`

Current registry metadata shows Prisma `7.10.0` still pins `@prisma/config@7.10.0`, which still pins
`deepmerge-ts@7.1.5`. The advisory affects every version below `8.0.0`; therefore published
`7.1.6` is not a fix. Prisma 8 is currently an RC and introduces a broad breaking toolchain rather
than a bounded security patch.

Batch 10E proposes no Prisma upgrade, downgrade, global `deepmerge-ts@8` override, or audit
exception. Keep `7.9.1`, keep the production audit failing, and recheck only when Prisma publishes a
compatible stable dependency graph. The existing exact Prisma engine hash, dynamic-link, warning,
and empty-database migration gates remain mandatory.

## Proposed implementation scope

Only the following four changes are proposed for a later separately approved implementation. They
can improve correctness and evidence, but they cannot make Batch 10C/10D or Phase 10 acceptable
while any critical/high or npm high finding remains.

### 10E-1 - rebase the minimized MySQL final filesystem

Refactor `docker/mysql.Dockerfile` into a prepared stage based on the existing exact MySQL `8.4.11`
index, followed by a `FROM scratch` runtime stage that copies only the prepared stage's final
filesystem. This is a reproducible multi-stage copy, not `docker export/import` and not deletion of
the RPM database.

The scratch runtime must explicitly restore only the official runtime metadata actually required:

- `PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`;
- `MYSQL_MAJOR=8.4` and `MYSQL_VERSION=8.4.11-1.el9`;
- entrypoint `docker-entrypoint.sh`, command `mysqld`, ports `3306`/`33060`, and
  `/var/lib/mysql` volume;
- `USER 999:999`.

Do not retain the obsolete `GOSU_VERSION` or `MYSQL_SHELL_VERSION` environment metadata. The copied
entrypoint must match the current reviewed SHA-256
`30f0e863cd9de49752045c01b2e4a4e3e065da48889d464a65ceeb4d69be4e5a`. The final RPM database must
still identify `mysql-community-server-minimal-8.4.11-1.el9.x86_64`,
`openssl-libs-3.5.5-5.0.1.el9_8.x86_64`, and `glibc-2.34-274.0.1.el9_8.x86_64` plus the exact 10D
curl/libcurl/sqlite updates.

The purpose is to make the image layers and final filesystem agree: `mysql-shell` and `gosu` are
absent, while provenance still records the exact official base material. If Scout still reports Go
stdlib/gosu after this rebase, stop. Do not suppress, waive, or replace the scanner.

### 10E-2 - supervised database recovery contract

Add a dependency-free database-availability supervisor shared by the API and worker:

1. explicitly connect and probe the database before the API listens or the worker registers;
2. run one sequential, non-overlapping constant `SELECT 1` probe every configured interval;
3. mark the process unavailable on probe failure and allow the existing driver pool a bounded
   recovery window;
4. if the database remains unavailable for that complete window, stop accepting/claiming new work,
   perform the existing bounded graceful drain, disconnect, and exit non-zero; and
5. reconnect by starting a fresh process and therefore a fresh Prisma/MariaDB pool.

Add two validated, non-secret settings to the API example and Compose configuration:

| Variable | Proposed default | Allowed range | Purpose |
| -------- | ---------------- | ------------- | ------- |
| `DATABASE_PROBE_INTERVAL_MS` | `5000` | `1000..60000` | Sequential database liveness cadence |
| `DATABASE_FAILURE_EXIT_MS` | `30000` | `5000..300000`, and not less than the probe interval | Continuous-failure window before supervised exit |

This deliberately uses process/task replacement rather than mutating a Prisma pool underneath
concurrent transactions. It must never retry the original HTTP mutation, transaction, job handler,
payment/provider call, or AI call. Existing idempotency keys, job leases, receipts, audit evidence,
and client-visible recovery routes remain the only replay controls. Logs may include only safe
error class/code, duration, and state transition - never the database URL or credentials.

### 10E-3 - explicit Compose restart propagation

Preserve the local/CI-only topology and add Compose long-form dependency restart propagation:

- API directly depends on healthy MySQL with `restart: true` in addition to the successful
  migration dependency;
- worker depends on healthy API with `restart: true`;
- optional AI depends on healthy API with `restart: true` because it shares the API network
  namespace; and
- the current local/CI `restart: "no"` policy remains visible and deterministic rather than
  concealing an unexpected failure loop. Future ECS whole-task supervision remains a later,
  separately approved production concern.

The documented operator path must use `docker compose restart mysql`, not raw `docker restart`, so
Compose can apply dependency ordering. A raw runtime restart/crash drill must still show API and
worker exit safely; local recovery must then use a dependency-ordered
`docker compose up --force-recreate api worker`, appending `ai` only when its profile is enabled.
No Docker socket may be mounted into an application container.

### 10E-4 - extend the mandatory evidence gate

Extend `docker/verify-images.ps1` and the container evidence procedure without adding a bypass:

- require MySQL's final SBOM to contain zero Go packages and zero path/package reference to gosu;
- require the reviewed entrypoint checksum, RPM identities, non-root user, health, empty-volume
  initialization, 15 migrations, second no-op migration, persistence, and restart behavior;
- require startup-unavailable, short-outage recovery, prolonged-outage supervised exit/restart,
  concurrent read, ambiguous mutation, in-flight job lease, shutdown, and dependency-order tests;
- retain reproducible manifests, provenance/SBOM, content, dynamic-link, secret, npm audit, and
  zero-critical/high scan gates for all four images; and
- fail if a scanner cannot run, a report is empty, a base digest moves, or a residual finding is
  present.

No VEX, ignore list, waiver, severity threshold reduction, or alternate scanner result is proposed.

## Required tests after separate approval

- Focused database supervisor unit tests with fake time and injected probes: startup success/fail,
  non-overlap, transient recovery, continuous failure, one fatal transition, shutdown races, and
  safe logs.
- API tests: readiness before/after outage, `503` during unavailability, no automatic replay of
  authenticated mutations, graceful non-zero supervised shutdown, and restored service with a new
  process/pool.
- Worker tests: stop claiming while unavailable, preserve in-flight lease/idempotency behavior,
  bounded shutdown, fresh registration after restart, and no duplicate completed action.
- Disposable Compose drills for explicit Compose restart and raw MySQL interruption, including API,
  worker, optional AI namespace, migrations, persistence, and cleanup.
- Full existing JavaScript/Python regressions, coverage, lint, formatting/schema validation, build,
  audit-chain verification, and high-confidence secret checks.
- Reproducible MySQL build plus content/RPM/entrypoint/SBOM/provenance/scan checks; all four existing
  image scans and both npm production audits must still run and must remain blocking on findings.

## Stop conditions

Stop implementation and return evidence without acceptance if any of the following occurs:

- scratch-copy changes the entrypoint, MySQL version, ownership, RPM database, initialization,
  migration, persistence, or shutdown behavior;
- gosu/Go attribution remains or a new critical/high result appears;
- database recovery retries an original business/provider operation, duplicates an audit/job/action,
  drops an in-flight lease without recovery evidence, or logs sensitive configuration;
- API, worker, or AI cannot recover in dependency order within the measured test bound;
- a proposed exact image/package is unavailable or resolves to a different digest/version; or
- any routine regression fails.

Passing these limited changes still does not accept Batch 10C/10D, because the Debian/zlib and
Prisma findings remain upstream-blocked. Phase 10 release/deployment stays blocked until the
mandatory zero-residual gates pass.

## Dependency, account, and cost impact

- No new npm/Python dependency, provider account, cloud service, secret, or paid resource.
- Two non-secret environment settings are proposed and must be documented/validated.
- Uses the already installed Docker/Compose/Scout tools and the already approved exact MySQL base.
- A later approved build requires public-registry access and may consume anonymous pull allowance,
  local disk, CPU, and RAM. No Docker sign-in is required.
- Docker Scout analysis handles package URLs/layer digests under the already used Scout boundary;
  it must not be treated as the only source of advisory truth.

## Rejected alternatives

- **Adopt Trixie now:** affected stable packages remain; lower scanner totals are not remediation.
- **Use Debian unstable/sid or cross-release packages:** mixes unsupported distributions and creates
  an unowned patch stream.
- **Prisma 8 RC or `deepmerge-ts@8` override:** broad/breaking and outside Prisma's compatible graph.
- **Prisma downgrade suggested by npm audit:** breaks the accepted Prisma 7 implementation and is
  not a security-forward fix.
- **MariaDB connector 3.5.x override as a guessed reconnect fix:** crosses Prisma's exact dependency
  and its release notes do not establish a database-restart fix. Reconsider only with focused
  compatibility evidence and separate approval.
- **In-place pool swap with automatic query retry:** unsafe for concurrent/ambiguous transactions and
  provider side effects.
- **`docker export/import`, deleting RPM metadata, or ignoring gosu:** loses reproducibility,
  provenance, or vulnerability evidence.
- **Mount the Docker socket for self-restart:** grants excessive host control to the application.
- **Upgrade to MySQL 8.4.12 before an official reviewed image exists:** unavailable in the current
  Docker Official Image catalog and changes the database binary without an exact artifact review.

## Approval boundary

The user's 2026-09-09 approval covered only 10E-1 through 10E-4, the two non-secret settings, the
existing exact MySQL base rebuild, and the required disposable tests. It did not authorize a
Node/Python base switch, Prisma or MariaDB dependency change, VEX/waiver, residual finding, Docker
sign-in, cloud resource, production data/AI, Razorpay Live Mode, release, or deployment. The
implementation stayed within that boundary.

## Primary references

- Debian CVE tracker: <https://security-tracker.debian.org/tracker/>
- Docker Official Node manifest: <https://github.com/docker-library/official-images/blob/master/library/node>
- Docker Official Python manifest: <https://github.com/docker-library/official-images/blob/master/library/python>
- Docker Official MySQL catalog: <https://hub.docker.com/_/mysql>
- Docker multi-stage builds: <https://docs.docker.com/build/building/multi-stage/>
- Docker Compose startup/restart order: <https://docs.docker.com/compose/how-tos/startup-order/>
- Docker Scout SBOM behavior: <https://docs.docker.com/scout/how-tos/view-create-sboms/>
- Docker Scout data handling: <https://docs.docker.com/scout/deep-dive/data-handling/>
- Prisma connection management: <https://docs.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-management>
- Prisma driver-adapter pool settings: <https://docs.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool>
- MariaDB Connector/Node.js pool guidance: <https://mariadb.com/docs/connectors/mariadb-connector-nodejs/connector-nodejs-promise-api>
- `deepmerge-ts` advisory: <https://github.com/advisories/GHSA-ggr8-5vv4-36mx>
- MySQL 8.4.12 release note: <https://dev.mysql.com/doc/relnotes/mysql/8.4/en/news-8-4-12.html>
