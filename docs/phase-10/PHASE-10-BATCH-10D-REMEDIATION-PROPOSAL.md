# Phase 10 Batch 10D Remediation Proposal

## Status

**APPROVED AND IMPLEMENTED; RESULT NOT ACCEPTED.** On 2026-09-08 the user approved only the six
changes in this proposal and explicitly prohibited acceptance of residual findings. Verification
completed on 2026-09-09. The approved fixable changes landed, but current critical/high scans, the
Prisma `deepmerge-ts` audit chain/OpenSSL warning, and database-restart recovery remain blocking.
No VEX, waiver, exception, cloud change, deployment, or release acceptance was created. Complete
post-build evidence is in `PHASE-10-BATCH-10D-REMEDIATION-EVIDENCE.md`.

## Objective

Reduce Batch 10C's actual attack surface, fix every currently fixable application and OS finding,
minimize the one-off migration and local/CI database images, and give the remaining findings a
finding-level review instead of accepting scanner totals as a group.

## Evidence boundary

The proposal uses the exact local Batch 10C artifacts and a fresh read-only review on 2026-09-08:

| Artifact            | Exact reviewed identity                                                                        |                                                               Critical/high result |
| ------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------: |
| Node API/worker     | runnable manifest `sha256:3ff38209fdf03dbec6b81ba0a8b7c545e36dd325de39703ee742644e56e25f8d`    |                                                                              `2/9` |
| Migration           | runnable manifest `sha256:f297f44abf54426895547aa7521807d7076bcb72f90d5f085f277b73f5554fcd`    |                                                                             `2/10` |
| AI                  | runnable manifest `sha256:106a32f5141a8134b01fb7e104020502c9c18a4f798cec0906f0588d3718cc58`    |                                                                             `3/14` |
| MySQL local/CI base | Linux/amd64 manifest `sha256:1d6b6a8fcee8ff758ff151d017f5203cd06792a0e698f0a593c9dfcb14609cf0` | raw `2/34`; Scout also reports four existing exceptions and `32` detected findings |

The current `npm audit --omit=dev` result remains seven findings: five high and two moderate.
Docker Scout and npm do not have identical advisory coverage, so both gates must be rerun after an
approved implementation.

No new base is silently substituted. Registry metadata still resolves the current approved Node,
Python, and MySQL tags to their Batch 10C digests. Node `24.20.0-bookworm-slim` resolves to index
`sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e` and Linux/amd64
manifest `sha256:6642ef280aebc09c4541bee0b15c9f89f0f3f3c247ddee79ae1d37eddfdcbbaa`, but it uses the
same vulnerable Debian base digest as Node `24.19.0`. It therefore does not remediate this batch's
Debian findings and is not proposed here.

## Proposed remediation set

### 10D-1 — exact npm transitive pins

Add narrowly scoped root overrides and regenerate the committed lock only after separate approval:

| Dependency path                      |  Current | Proposed exact pin | Findings addressed                                                                     | Rationale                                                                                                                                    |
| ------------------------------------ | -------: | -----------------: | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `@prisma/adapter-mariadb -> mariadb` |  `3.4.5` |            `3.4.7` | `CVE-2026-55215` / `GHSA-cqhc-2h57-wpxf`, `GHSA-42r5-vhpq-m858`, `GHSA-g5xc-5w98-jfvm` | Remains on Prisma's selected `3.4` maintenance line; `3.4.6` is identified as fixed but is not published in npm, while `3.4.7` is published. |
| `prisma -> mysql2`                   | `3.15.3` |           `3.23.1` | `GHSA-3f6p-5ww8-9rcr`, `GHSA-rgwj-5xj2-c3m3`                                           | `3.22.0` fixes credential downgrade, but the decompression finding affects through `3.23.0`; `3.23.1` is the minimum version fixing both.    |
| Express/body-parser -> `qs`          | `6.15.3` |           `6.16.0` | `GHSA-x5fp-wj9c-mxmx`, `GHSA-4mjr-xmp4-gh2g`                                           | The patched version satisfies the existing parents' `^6.14.x`/`^6.15.x` ranges.                                                              |

Candidate registry metadata reviewed without installation:

- `mariadb@3.4.7`: LGPL-2.1-or-later, Node `>=14`, integrity
  `sha512-3Ols2iyVAXJjjugGo96dce2OYv1XYkQY0vBDMuWYQi08mGiRXQjhybZM2ZgAnX7N4kUgPOV0x5A/sof2DDPylQ==`.
- `mysql2@3.23.1`: MIT, Node `>=8`, integrity
  `sha512-tTuRnC7qCet2IOfSNMYZ5SwXuBnfvBPAcIA28P0gtruXyZlU1LMxA6uha32kYypoFgyYklMqhLWwt4laYwXR/Q==`.
- `qs@6.16.0`: BSD-3-Clause, Node `>=0.6`, integrity
  `sha512-h6fhOIaRrID2CbEY2fqs+7t+UXZo+MLAnU5gRIq85uFtdiUPCdsApMlHhXogKVM4HM2DVbIjGNTTYH2OcmP1vA==`.

Do not upgrade Prisma as a substitute. Current stable Prisma `7.10.0` still pins
`mariadb@3.4.5`, `mysql2@3.15.3`, and `deepmerge-ts@7.1.5`; it would add a framework/runtime change
without closing these findings.

### 10D-2 — dedicated migration dependency closure

Replace the copied workspace-wide development tree with a dedicated, committed migration manifest
and lock under `docker/migration/`. Its only direct runtime requirements should be the already
accepted `prisma@7.9.1` CLI and `dotenv@17.4.2`, plus the exact `mysql2@3.23.1` override above.

The final migration image must contain only:

- the dedicated locked Prisma migration dependency closure;
- `apps/api/prisma.config.js`;
- the schema and all version-controlled migrations; and
- the fixed Prisma CLI entrypoint.

It must not contain API/web source, `tsx`, Vitest, ESLint, Prettier, test/coverage packages, the
MariaDB application adapter, global npm/npx, or unrelated workspace modules. A post-build allowlist
and negative-content check must prove this rather than relying only on image size.

This adds no new product dependency or account. It adds a purpose-specific lock that must receive
the same integrity, license, advisory, and update review as the root lock.

### 10D-3 — Debian package fix and residual dispositions

For the Node, migration, and AI targets, install only the currently published Bookworm security
fix `libpcre2-8-0=10.42-1+deb12u1` from the official Debian security repository, then remove apt
indexes in the same layer. Keep the exact Batch 10C base digests. The package transaction and its
network access require separate approval; they were not run while preparing this proposal.

The remaining Debian findings do not currently have fixed Bookworm packages. They are not proposed
for blanket risk acceptance:

| Findings                                                               | Affected artifact(s) | Evidence and proposed disposition                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CVE-2026-13221`, `CVE-2026-12087`                                     | Node, migration, AI  | Perl/Socket code is present, but OpsPilot has no child-process execution path and never invokes Perl. If still present after the approved rebuild, prepare digest-scoped `not_affected` VEX evidence; do not approve it before the new scan.                                                                                               |
| `CVE-2026-48959`, `CVE-2026-48962`                                     | Node, migration, AI  | The affected `IO::Compress` and `IO::Uncompress` modules were directly tested and are absent. Prepare digest-scoped `not_affected` VEX evidence if the source-package match remains.                                                                                                                                                       |
| `CVE-2026-76642`, `CVE-2026-78408`, `CVE-2026-78409`, `CVE-2026-78410` | Node, migration, AI  | OpsPilot does not invoke `mount`/`nsenter`; runtime containers are non-root, read-only, capability-free, no-new-privileges, and receive no host mounts. Also remove the `mount` setuid bit and unused `nsenter` executable in the final stages. Re-scan, then review a digest-scoped disposition.                                          |
| `CVE-2026-85091`                                                       | Node, migration, AI  | The described non-blocking `gzwrite`/`gzprintf` path is not used by OpsPilot. Keep the library for required transitive/runtime compatibility, re-scan, and prepare a digest-scoped disposition only if still reported.                                                                                                                     |
| `CVE-2026-75803`, `CVE-2026-63076`, `CVE-2026-63072`, `CVE-2026-54874` | AI only              | The affected one-shot empty AEAD, CMP, CMS, and DTLS paths are not used; HTTPX uses ordinary TLS over TCP. Initial production AI remains disabled. Debian Bookworm still lists `3.0.20-1~deb12u2` vulnerable and has no fixed Bookworm package. Recheck before any AI release and prefer a fixed official base over a permanent exception. |

Any residual VEX/waiver must name the exact CVE, package, image manifest, justification, controls,
owner, review date, and expiry. The proposed maximum expiry is 2026-10-08 or the publication of a
fixed Bookworm image/package, whichever occurs first. The user must separately approve the final
post-remediation list; this proposal approves none of it.

### 10D-4 — remove pip metadata false positives from the AI runtime

The AI scan's `msgpack@1.1.2` and `setuptools@70.3.0` matches come only from
`pip/_vendor/bom.cdx.json` in system and virtual-environment pip. Runtime distribution inspection
confirmed that neither `msgpack` nor `setuptools` is installed; `pip@26.2.1` is installed but is not
needed after the locked environment is assembled.

After an approved build, remove pip executables, pip packages, and pip-generated nested SBOM
metadata from both the system Python and copied virtual environment in the final stage. Do not add
`msgpack` or `setuptools` to the application lock, and do not create misleading VEX statements for
packages that are absent. Verify imports, `importlib.metadata`, `pip check` in the builder, the full
Python suite, health, and a new final-image SBOM.

### 10D-5 — minimized non-root MySQL image for local/CI only

Create `docker/mysql.Dockerfile` from the exact approved MySQL `8.4.11` index digest. It remains
excluded from production, which targets separately approved RDS MySQL.

The derived local/CI image should:

1. remove unused `mysql-shell-8.4.10-1.el9`, which owns the flagged `cryptography`, `pyOpenSSL`, and
   `urllib3` trees under `/usr/lib/mysqlsh`;
2. update only `curl` and `libcurl` to `7.76.1-40.el9_8.5` and `sqlite-libs` to
   `3.34.1-11.el9_8`, all confirmed available in the official Oracle Linux repositories;
3. set `USER 999:999` (`mysql:mysql`) and remove the now-unused `gosu@1.19` binary; and
4. retain the official entrypoint, server `8.4.11`, health check, internal-only network, no host
   port, resource limits, and named-volume behavior.

Running the official entrypoint as `mysql` skips its root-only `gosu` branch. Removing gosu removes
the scanner's Go `stdlib@1.24.6` package and its `2` critical/`20` high matches without introducing
a replacement binary. The non-root empty-volume initialization, restart, migration, and cleanup
paths must be proven after approval; if they fail, stop rather than restoring vulnerable gosu or
forcing unsafe permissions.

No new account, secret, license, or production service is introduced. The build adds official
Oracle repository availability and monthly rebuild/re-scan work.

### 10D-6 — Prisma/OpenSSL warning disposition

Do not install OpenSSL solely to silence Prisma. Prisma's official requirements list OpenSSL, but
the exact migration image's selected schema engine
`schema-engine-debian-openssl-1.1.x` is not dynamically linked to `libssl`; `ldd` reports only
glibc/libgcc and related base libraries. All 15 fresh migrations have already passed twice.

Installing Bookworm OpenSSL `3.0.20-1~deb12u2` would add one critical and three high findings to an
ephemeral image even though this exact engine does not load it. The proposed resolution is:

- retain and record the exact Prisma `7.9.1` engine hash
  `e922089b7d7502aff4249d5da3420f6fa55fc6ad`;
- make `ldd`/missing-library inspection and empty-database migration part of the image gate;
- allow only the exact known detection warning for that engine/base combination; and
- fail on a changed engine, a missing dynamic library, a new warning, or a migration failure.

This is a warning disposition, not acceptance of an OpenSSL vulnerability. Revisit it when Prisma
changes engines or Debian publishes a fixed Bookworm OpenSSL package.

## Rejected alternatives

- **Node `24.20.0` in this batch:** same Debian base digest and does not close the listed OS
  findings; handle the normal Node patch upgrade separately.
- **Prisma `7.10.0`:** still pins the vulnerable transitive versions and does not remediate the
  audit tree.
- **Global `deepmerge-ts@8.0.0` override:** crosses Prisma's exact major-version boundary. The
  installed `7.1.5` is used only for tracked operator-controlled Prisma configuration, not an
  attacker-supplied recursive graph. Keep it as a separately reviewed, expiring build/migration
  disposition until Prisma publishes a compatible fix.
- **Python 3.14 or Alpine migration:** crosses the accepted Python runtime/ABI boundary and risks
  native wheel compatibility without solving every finding.
- **Vendored OpenSSL build or cross-release Debian packages:** adds a new source-build and patch
  maintenance burden or mixes distributions for a warning whose exact engine does not load
  OpenSSL.
- **Suppressing scanner output by deleting package databases:** would hide provenance rather than
  remediate risk and is prohibited.

## Approved implementation plan

The user approved, and implementation made, only these repository changes:

1. add the three exact npm overrides and regenerate/review `package-lock.json`;
2. add the dedicated migration manifest/lock and refactor the migration stage;
3. add the exact Debian PCRE2 update plus final-stage unused-tool hardening;
4. remove pip from the final AI runtime only;
5. add the minimized local/CI MySQL Dockerfile and point Compose at it; and
6. add automated content, dynamic-link, SBOM, vulnerability, and warning checks.

No Docker Hub sign-in, new provider account, environment variable, cloud resource, secret, real
data, AI production enablement, Razorpay Live Mode, or deployment is needed.

## Required verification after approval

- Lock review, `npm audit --omit=dev`, `npm ls`, license/engine checks, and clean `npm ci`.
- Full JavaScript lint/format/Prisma validation, web build, 209 API tests, and 53 web tests.
- Linux AI lock consistency, builder `pip check`, Ruff, and all 165 routine Python tests with the
  three existing opt-in skips.
- Reproducible runnable manifests, Dockerfile/Compose validation, fresh 15-migration database,
  upgrade migration, API/worker/AI health, graceful shutdown, read-only/non-root/capability checks,
  and disposable-volume cleanup.
- Final-image negative-content checks and SPDX SBOM/provenance for Node, migration, AI, and MySQL.
- Fresh Docker Scout details for every critical/high finding and a separate owner decision for any
  residual digest-scoped VEX/waiver.
- Git whitespace and high-confidence tracked/image-history secret scans.

Batch 10D must stop if a proposed exact version is unavailable, a lock resolves differently, the
MySQL image cannot initialize as non-root, the Prisma engine linkage changes, a test regresses, or
the post-build scan introduces a new critical/high finding.

## Approval boundary

The implementation instruction authorized only the six repository/build changes above and did not
accept residual findings. The post-build finding list and exact resulting manifests are recorded in
`PHASE-10-BATCH-10D-REMEDIATION-EVIDENCE.md`; Batch 10C/10D acceptance and release use remain
blocked pending a separate explicitly approved resolution.

## Primary references

- Prisma Linux runtime requirements: <https://www.prisma.io/docs/orm/reference/system-requirements>
- Docker build best practices: <https://docs.docker.com/build/building/best-practices/>
- Debian Security Tracker: <https://security-tracker.debian.org/tracker/>
- MariaDB credential advisory: <https://github.com/advisories/GHSA-cqhc-2h57-wpxf>
- MariaDB credential-handling advisory: <https://github.com/advisories/GHSA-42r5-vhpq-m858>
- MariaDB escaping advisory: <https://github.com/advisories/GHSA-g5xc-5w98-jfvm>
- mysql2 authentication advisory: <https://github.com/advisories/GHSA-3f6p-5ww8-9rcr>
- mysql2 decompression advisory: <https://github.com/advisories/GHSA-rgwj-5xj2-c3m3>
- deepmerge-ts advisory: <https://github.com/advisories/GHSA-ggr8-5vv4-36mx>
- qs parsing advisories: <https://github.com/advisories/GHSA-x5fp-wj9c-mxmx> and
  <https://github.com/advisories/GHSA-4mjr-xmp4-gh2g>
- OpenSSL 2026-08-25 advisory: <https://openssl-library.org/news/secadv/20260825.txt>
- gosu releases: <https://github.com/tianon/gosu/releases>
