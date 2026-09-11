# Phase 10 Dependency and Tool Review

## Status

**BATCHES 10A AND 10B INSTALLED; BATCHES 10C-10E IMPLEMENTED BUT BLOCKED; BATCH 10F PROPOSAL
ONLY; BATCH 10G-1 APPROVED BUT BLOCKED BEFORE IMPLEMENTATION.** Docker Desktop
`4.89.0`, Microsoft WSL `2.7.13.0`, the exact Batch 10C pull/build, the six-change Batch 10D
remediation, and Batch 10E changes 10E-1 through 10E-4 were separately approved and verified.
MySQL now passes at `0C/0H` and local database restart recovery passes, but Node/migration/AI
critical/high results and the Prisma audit/warning items still block acceptance. No finding was
accepted. See
`PHASE-10-BATCH-10C-CONTAINER-EVIDENCE.md` and
`PHASE-10-BATCH-10D-REMEDIATION-EVIDENCE.md` and
`PHASE-10-BATCH-10E-REMEDIATION-EVIDENCE.md`. The separately authorized proposal-only Batch 10F
review found no upstream-compatible candidate that can clear the gate; it made no implementation
or finding-acceptance change. See `PHASE-10-BATCH-10F-UPSTREAM-REMEDIATION-PROPOSAL.md`.
On 2026-09-10 the owner approved the exact four-action 10G-1 repository CI batch. Its required
immediate upstream recheck found two high-severity advisories in the bundled dependencies of the
approved `actions/setup-node@v7.0.0` commit and no patched `v7.x` tag, so implementation stopped
before any workflow was created. No finding was accepted or suppressed.
The subsequent separately authorized proposal-only review rejected exact merged patch commit
`e51e5fe84fc33b4c73ebe40526b2694712b5b858`: its `brace-expansion@5.0.8` is affected by a newer
high-severity advisory, and both full and production lockfile audits fail. See
`PHASE-10-BATCH-10G-1-SETUP-NODE-PATCH-REVIEW.md`.

## Verified local state

- Docker Desktop `4.89.0.238018` is installed per-user with Docker CLI `29.7.2`, Docker Compose
  `5.5.0`, and Docker Buildx `0.36.1-desktop.1`.
- Windows Subsystem for Linux and Virtual Machine Platform are enabled. WSL reports version
  `2.7.13.0`, kernel `6.18.33.2-2`, WSLg `1.0.73.2`, and default WSL version `2`.
- Docker Engine reports server `29.7.2` on Linux/x86_64. No test container remains running; the
  approved bases and four locally built Node, migration, AI, and MySQL images remain in the image
  store.
- The repository pins Node.js `24.19.0` in `.node-version`, constrains Node to
  `>=24.19.0 <25`, pins npm dependencies through `package-lock.json`, and pins Python application
  dependencies through `apps/ai/pylock.toml`.
- The isolated host AI environment uses Python `3.13.7`; the reviewed container moves only the
  Python patch level to `3.13.15`. The installed local MySQL Community Server is `8.4.11`.
- `docker buildx imagetools inspect` resolved registry manifests only. It did not pull image
  layers, create containers, or perform a vulnerability scan.

## Batch 10A — local container prerequisite

| Item                              | Exact selection                                                        | Why it is needed                                                                       | Account, connection, or secret                                                                                                  | Operational burden                                                                             |
| --------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Docker Desktop for Windows x86_64 | `4.89.0`, official Docker distribution; bundled Docker Compose `5.5.0` | Build and verify the approved Linux API/worker/AI images and local/CI Compose topology | No Docker account or project secret is required for installation or local builds; anonymous public-image pulls are rate limited | Uses WSL 2/virtualization, consumes local disk/RAM, and must receive reviewed security updates |

Kubernetes, Docker Offload, Model Runner, Extensions, Windows containers, and sign-in are not
required and remain disabled or unused unless separately reviewed.

### Batch 10A installation evidence

- The exact official Windows installer was 595.7 MB and matched Docker's published SHA-256
  `854626704af28a160d5af68b96b3e32eacf08ab397ce6c12eb02a04788d73681`.
- Windows Authenticode validation returned `Valid` with signer `Docker Inc`.
- Per-user installation completed with exit code `0`, using `--backend=wsl-2` and
  `--no-windows-containers`, with no Docker sign-in.
- The installed Desktop, CLI, Compose, and Buildx versions match the reviewed selection.

## Windows host prerequisite evidence

The user separately approved enabling only `Microsoft-Windows-Subsystem-Linux` and
`VirtualMachinePlatform` and restarting Windows. Elevated DISM enabled both features, returned
restart-required exit code `3010`, and WMI reported both enabled after the restart. `vmcompute` and
`hns` run. `HypervisorPlatform` remains disabled because no separate need has been demonstrated.

## Batch 10B — WSL servicing prerequisite

| Item                                | Exact selection                                                                  | Why it is needed                                                                                      | Account, connection, or secret                                                 | Operational burden                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Windows Subsystem for Linux x64 MSI | Stable `2.7.13.0`, official `microsoft/WSL` release asset `wsl.2.7.13.0.x64.msi` | Replace the previous `2.4.13.0` package whose CLI timed out and blocked Docker's WSL engine preflight | No Microsoft/GitHub account, project secret, or Linux distribution is required | System-level MSI update requires elevation, consumes local disk, and needs future security servicing |

### Batch 10B review and installation evidence

- Microsoft published WSL `2.7.13` on 2026-09-04 as the stable release selected for this repair;
  prerelease `2.9.10` was rejected.
- The downloaded x64 MSI was exactly 258,985,984 bytes and matched the release SHA-256
  `a3505a50f4cc585551d11d9de824ba4375448d7a68f2e71d3fb315fa986fc754`.
- Windows Authenticode validation returned `Valid` with signer `Microsoft Corporation`.
- Silent installation completed with MSI exit code `0` and reported no restart requirement. No
  Linux distribution, Store sign-in, preview channel, Docker image, repository dependency, or cloud
  resource was added.
- WSL version/status checks pass. Restarting Docker Desktop cleared the stale pre-update backend,
  and Docker Engine health now passes.

### Alternatives considered

- **`wsl --update`:** Microsoft's normal update path, but rejected for this repair because every
  command from the previous WSL package timed out.
- **Microsoft Store UI update:** deferred because the exact MSI is more reproducible.
- **WSL prerelease:** rejected because Phase 10 needs a stable baseline, not preview features.
- **Uninstall/reset WSL or Docker:** rejected because the bounded servicing update fixed the fault
  without destructive state removal.

## Batch 10C — immutable official base images

These are the exact candidates for the first approved packaging slice. Dockerfiles must pin the
multi-platform index digest shown below; the Linux/amd64 child digest records the artifact selected
for this workstation and the initial x86_64 deployment target.

| Purpose                         | Exact official reference                         | Multi-platform index digest                                               | Linux/amd64 manifest digest                                               |
| ------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| API and worker build/runtime    | `docker.io/library/node:24.19.0-bookworm-slim`   | `sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df` | `sha256:e5a8dee7bc1e6a215d224a7ef8206f7e77271bc3cabd5febf2beafac0674f174` |
| AI build/runtime                | `docker.io/library/python:3.13.15-slim-bookworm` | `sha256:ed86c82274b3c69b52fb5820f358f0bd7df0b603332063cb5c6e32bd220c3e6e` | `sha256:2f2e5a876c71a6757f55ec57f2add0225ddaf01c802a33fcc29073943f94d907` |
| Isolated local/CI database only | `docker.io/library/mysql:8.4.11`                 | `sha256:b3b90af2a6552ae30c266fdb7d5dd55f3afb72404bb78d37fe8a23eb857fd3fb` | `sha256:1d6b6a8fcee8ff758ff151d017f5203cd06792a0e698f0a593c9dfcb14609cf0` |

### Selection rationale, licensing, and operations

- Node `24.19.0` exactly matches `.node-version`; moving the project baseline to current
  `24.20.0` would be a separate runtime upgrade. The official image source and Node runtime are
  MIT-licensed, with bundled components retaining their own notices.
- Python `3.13.15` is the current patched official `3.13` slim Bookworm image and remains within the
  existing Python 3.13 boundary. The image source uses an MIT-style license; CPython uses the PSF
  license and includes third-party notices.
- MySQL `8.4.11` is the current tag in Docker's official-images manifest and matches local MySQL
  `8.4.11`. It is GPL-2.0 and is approved only for isolated local/CI Compose. Production remains
  targeted at separately approved Amazon RDS for MySQL 8.4, not this container.
- The Node and Python images share the Debian Bookworm slim Linux/amd64 base digest
  `sha256:5ae3c39ebd15e229dcedd5cee596b2497182493d41ff162e824ba13fc1b2b867`.
  The MySQL image uses Oracle Linux 9 slim base digest
  `sha256:431feabc43183b2f10e1401b0dfd504d8bbd32a851824c137a3e7a334fc054c8`.
- No account or secret is needed for anonymous public pulls, but Docker Hub rate limits and local
  disk/network use apply. No OS build package has been approved yet; Dockerfile design must avoid
  adding one unless inspection proves it necessary.
- Vulnerability scanning cannot inspect layers until they are downloaded. Immediately after an
  approved pull/build, generate image metadata/SBOM evidence and scan every resulting image. Any
  critical or high finding blocks acceptance unless fixed or explicitly risk-accepted under the
  Phase 10 release gate.

Tag names are retained for human readability, but builds must use `tag@sha256:index-digest`. A tag
change or digest change requires a new review. No web-server base image is planned: production web
assets are built and uploaded to private S3, while local development keeps the existing Vite flow.

## Batch 10C execution result

The exact approved images were pulled and version-checked. Hardened Node, migration, and AI targets
were built with pinned Dockerfile/SBOM helpers and maximum-mode provenance. Repeated stable-input
builds reproduced the Linux/amd64 runnable manifests. The Compose application profile applied all
15 migrations to a fresh disposable MySQL volume, returned healthy API/database status, ran the
worker, enforced non-root/read-only/cap-drop controls, exposed only the API on host loopback, and
cleaned up. The network-disabled AI smoke also passed.

Docker Scout generated SPDX SBOMs but reported the following unresolved critical/high totals:
Node `2/9`, migration `2/10`, AI `3/14`, and MySQL `2/30`. Those findings block acceptance under
this document's gate. Prisma also emits an OpenSSL detection warning in the slim Node image, and
the one-off migration image still contains unrelated workspace dev modules. Complete commands,
digests, package counts, regression results, and caveats are recorded in
`PHASE-10-BATCH-10C-CONTAINER-EVIDENCE.md`.

## Batch 10D execution result

The approved exact npm pins, dedicated migration lock, PCRE2 update/tool hardening, AI pip removal,
and non-root minimized MySQL image are implemented. Repeat builds reproduce the four runnable
manifests, migration content fell from 585 to 270 indexed packages, fresh non-root MySQL applied all
15 migrations, initial application/AI health and controls pass, and all JavaScript/Python
regressions pass.

The 2026-09-09 automated gate still fails at Node `2/8`, migration `2/8`, AI `3/11`, and MySQL
`2/20` critical/high totals. Root and migration npm audit each retain the three-node high
`deepmerge-ts` chain. Scout attributes MySQL's remaining Go results to the deleted lower-layer
`/usr/local/bin/gosu` path even though it is absent in the running filesystem. A live MySQL restart
also leaves API/worker Prisma pools unavailable until dependency-ordered container recreation.
The Prisma/OpenSSL warning remains under the exact engine/linkage gate. No result is accepted;
complete evidence is in `PHASE-10-BATCH-10D-REMEDIATION-EVIDENCE.md`.

## Batch 10E proposal result

The proposal-only Batch 10E review found no honest zero-residual Node/Python base replacement yet.
Exact official Trixie candidates were resolved by registry metadata, but their SBOMs still contain
vulnerable stable Perl, util-linux, and unfixed zlib versions. Prisma `7.10.0` still depends on
`deepmerge-ts@7.1.5`, while its advisory is fixed only in the incompatible `8.x` line. Neither base
change nor dependency change is proposed for implementation now.

The bounded proposed implementation is instead: reproducibly rebase the already minimized local/CI
MySQL final filesystem from the existing exact `8.4.11` base; add dependency-free supervised
API/worker database recovery with two validated non-secret timing settings; add explicit Compose
dependency restart propagation; and extend the mandatory zero-finding/runtime evidence. This does
not accept or clear the upstream blockers. Full scope and stop conditions are in
`PHASE-10-BATCH-10E-PROPOSAL.md`.

## Batch 10E execution result

On 2026-09-09 the user explicitly approved only changes 10E-1 through 10E-4, including the two
non-secret database timing settings and disposable tests, while prohibiting Trixie adoption,
Prisma/MariaDB dependency changes, and residual-finding acceptance. No package or service dependency
was added or changed.

The final-filesystem MySQL rebuild keeps the exact approved `8.4.11` base and exact 10D RPMs. Its
strengthened SPDX/content/scan gate now indexes 141 packages, contains no gosu or Go attribution,
and passes at `0C/0H`. The dependency-free API/worker database supervisor, explicit Compose restart
propagation, authenticated MySQL healthcheck, and disposable outage/recovery tests also pass.

Node and migration remain `2C/8H`, AI remains `3C/11H`, and both production npm audits retain the
three-node high Prisma `deepmerge-ts` chain. These results remain blocking and unaccepted. Complete
evidence is in `PHASE-10-BATCH-10E-REMEDIATION-EVIDENCE.md`.

## Batch 10F proposal result

On 2026-09-09 the user authorized proposal-only review of the next upstream-compatible image and
Prisma remediation. Registry metadata and remote scans show that Node `24.20.0-bookworm-slim`
still has `2C/13H` at the base level and `24.20.0-alpine3.24` has `2C/11H`. Python
`3.13.15-slim-bookworm` is unchanged, while `3.13.15-alpine3.24` has `0C/7H` and is incompatible
with the current manylinux/glibc native-wheel lock without a broader platform/dependency change.

Stable Prisma `7.10.0` still pins `@prisma/config` to a dependency graph containing
`deepmerge-ts@7.1.5`; Prisma 8 is currently prerelease, and a direct `deepmerge-ts@8` override is
not an upstream-supported compatibility fix. Debian stable package availability also does not
clear the remaining Perl, util-linux, and zlib results. Consequently no Batch 10F implementation
is recommended. No image was pulled/built/tagged, no dependency changed, and no finding was
accepted. Exact digests, dispositions, recheck triggers, and stop conditions are in
`PHASE-10-BATCH-10F-UPSTREAM-REMEDIATION-PROPOSAL.md`.

## Batch 10G-1 pre-implementation result

The owner approved repository-only pull-request quality CI using existing dependencies and these
four exact official Action commits:

| Action                           | Approved commit                            | Result on 2026-09-10                                               |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| `actions/checkout@v7.0.1`        | `3d3c42e5aac5ba805825da76410c181273ba90b1` | Official tag still matches; no published repository advisory found |
| `actions/setup-node@v7.0.0`      | `820762786026740c76f36085b0efc47a31fe5020` | **Blocked:** bundled vulnerable `brace-expansion` versions         |
| `actions/setup-python@v7.0.0`    | `5fda3b95a4ea91299a34e894583c3862153e4b97` | Official tag still matches; no published repository advisory found |
| `actions/upload-artifact@v7.0.1` | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` | Official tag still matches; no published repository advisory found |

GitHub's official setup-node issue 1596 records that `v7.0.0` bundles affected
`brace-expansion@1.1.13`, `2.1.1`, and `5.0.6`. GitHub-reviewed
`GHSA-3jxr-9vmj-r5cp` / `CVE-2026-13149` and `GHSA-mh99-v99m-4gvg` /
`CVE-2026-14257` are both high severity. Upstream pull request 1599 merged rebuilt patched bundles
to `main`, but no patched `v7.x` tag exists: both `v7` and `v7.0.0` still resolve to the blocked
commit.

No `.github` directory, workflow, cache, artifact, secret, OIDC permission, GitHub setting, cloud
access, or deployment was created. Reusing the blocked commit, relying on exploitability assumptions,
pinning an unreviewed untagged commit, using the runner's floating Node installation, or replacing
setup-node with another downloader/image would exceed the approval or accept new risk. Wait for an
official patched setup-node release. At that gate, review of the exact merged upstream commit still
required separate authorization; the owner later supplied it, and its result follows.

## Batch 10G-1 exact upstream patch review

The owner separately authorized review-only inspection of PR 1599's exact merged commit
`e51e5fe84fc33b4c73ebe40526b2694712b5b858`. GitHub reports a valid signature and 223 passing PR
checks. The commit keeps the MIT license and `node24` action metadata, removes the previously
reported `brace-expansion` versions, pins `5.0.8`, and rebuilds both distributed bundles. It is
seven commits ahead of `v7.0.0`, including an earlier Node-install verification/manifest-retry
runtime change and an `@actions/cache` update.

The current audit result is blocking. GitHub-reviewed `GHSA-rgw5-rvv9-x895` /
`CVE-2026-69152` affects `brace-expansion@5.0.8` and is fixed in `5.0.9`. With no install and an
unchanged lockfile hash, the production lock reports `0C/2H/1M` and the complete lock reports
`0C/3H/2M`. Both distributed bundles contain the affected implementation. The exact commit is
rejected; no workflow, dependency, GitHub setting, AWS access, deployment, waiver, suppression, or
finding acceptance resulted.

## Next approval gate

Batch 10E implementation is complete but unaccepted, Batch 10F concludes with no viable image/
Prisma implementation candidate, and Batch 10G-1 is approved but blocked before workflow creation.
The exact PR 1599 patch was separately reviewed and rejected. Wait for one of Batch 10F's upstream
triggers and an official setup-node release that clears every current audit finding; then perform a
new exact release review before requesting implementation. Do not change to Trixie/Alpine, override
`deepmerge-ts`, use a Prisma prerelease, use the vulnerable setup-node release, or substitute an
unreviewed runtime/bootstrap path. Docker sign-in, Kubernetes, cloud resources, AWS deployment,
production data, Razorpay Live Mode, residual acceptance, and paid spend remain unauthorized.

## Official references

- Docker Desktop release notes: <https://docs.docker.com/desktop/release-notes/>
- Docker Desktop Windows installation: <https://docs.docker.com/desktop/setup/install/windows-install/>
- Docker build best practices: <https://docs.docker.com/build/building/best-practices/>
- Microsoft WSL update commands: <https://learn.microsoft.com/windows/wsl/basic-commands#update-wsl>
- Microsoft WSL `2.7.13` release: <https://github.com/microsoft/WSL/releases/tag/2.7.13>
- Node official-image manifest: <https://github.com/docker-library/official-images/blob/master/library/node>
- Python official-image manifest: <https://github.com/docker-library/official-images/blob/master/library/python>
- MySQL official-image manifest: <https://github.com/docker-library/official-images/blob/master/library/mysql>
- Node Docker image license: <https://github.com/nodejs/docker-node/blob/main/LICENSE>
- Python Docker image license: <https://github.com/docker-library/python/blob/master/LICENSE>
- MySQL Docker image license: <https://github.com/docker-library/mysql/blob/master/LICENSE>
- Prisma releases: <https://github.com/prisma/orm/releases>
- Prisma `deepmerge-ts` remediation issue: <https://github.com/prisma/orm/issues/30052>
- `deepmerge-ts` advisory: <https://github.com/advisories/GHSA-ggr8-5vv4-36mx>
- setup-node bundled dependency finding: <https://github.com/actions/setup-node/issues/1596>
- setup-node upstream patch: <https://github.com/actions/setup-node/pull/1599>
- `brace-expansion` exponential-time advisory: <https://github.com/advisories/GHSA-3jxr-9vmj-r5cp>
- `brace-expansion` out-of-memory advisory: <https://github.com/advisories/GHSA-mh99-v99m-4gvg>
- `brace-expansion@5.0.8` bypass advisory: <https://github.com/advisories/GHSA-rgw5-rvv9-x895>
