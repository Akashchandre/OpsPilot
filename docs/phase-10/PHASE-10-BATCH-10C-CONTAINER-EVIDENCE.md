# Phase 10 Batch 10C Container Evidence

## Status

**IMPLEMENTED AND FUNCTIONALLY VERIFIED; ACCEPTANCE BLOCKED.** On 2026-09-08 the user explicitly
approved pulling and building only the reviewed digest-pinned Batch 10C Node, Python, and MySQL
images. The images were pulled, built, scanned, and exercised locally without Docker sign-in,
Kubernetes, cloud resources, production data, or deployment. Runtime and regression checks pass,
but the critical/high vulnerability gate does not pass. No risk acceptance has been granted.

## Immutable inputs

| Purpose | Pinned multi-platform index | Linux/amd64 manifest |
| --- | --- | --- |
| Node 24.19.0 Bookworm slim | `sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df` | `sha256:e5a8dee7bc1e6a215d224a7ef8206f7e77271bc3cabd5febf2beafac0674f174` |
| Python 3.13.15 Bookworm slim | `sha256:ed86c82274b3c69b52fb5820f358f0bd7df0b603332063cb5c6e32bd220c3e6e` | `sha256:2f2e5a876c71a6757f55ec57f2add0225ddaf01c802a33fcc29073943f94d907` |
| MySQL 8.4.11 | `sha256:b3b90af2a6552ae30c266fdb7d5dd55f3afb72404bb78d37fe8a23eb857fd3fb` | `sha256:1d6b6a8fcee8ff758ff151d017f5203cd06792a0e698f0a593c9dfcb14609cf0` |

Dockerfiles also pin the Dockerfile frontend to
`sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e`. Build SBOMs use the
pinned BuildKit Syft scanner index
`sha256:ae4f3b554449e7e25548e7d8ccc029d17357348e30c6e3df01b92bc93654d6a9`.

The container-specific Linux/amd64 Python runtime lock contains the same 69 approved runtime
versions as the existing lock, excludes test/lint/coverage packages, and has repository SHA-256
`0c25ce9ad0986e7783a1fe26d77c44fa1eba596a63b49bdf055c5c75616ea0b5`.

## Resulting local artifacts

OCI index digests include per-invocation maximum-mode provenance metadata and therefore are not the
runtime reproducibility identity. Repeated stable-input builds reproduced each Linux/amd64 runnable
manifest exactly.

| Target | Current local OCI index | Reproduced Linux/amd64 manifest | Size | User |
| --- | --- | --- | ---: | --- |
| `opspilot-node:phase10` | `sha256:586046bdb3d9a618eaa9453067ba1ae3d1ac81ea0b3545740f28c3a22c25b5db` | `sha256:3ff38209fdf03dbec6b81ba0a8b7c545e36dd325de39703ee742644e56e25f8d` | 114,918,826 bytes | `1000:1000` |
| `opspilot-migration:phase10` | `sha256:96fdf55e9f76729993b006331bc4e319252edb66f11e097cc94c6091f7d5490f` | `sha256:f297f44abf54426895547aa7521807d7076bcb72f90d5f085f277b73f5554fcd` | 226,107,674 bytes | `1000:1000` |
| `opspilot-ai:phase10` | `sha256:2f2b9518480da6f1e990c25f93756e555d558b568f3ac5217be1c7347cff97f3` | `sha256:106a32f5141a8134b01fb7e104020502c9c18a4f798cec0906f0588d3718cc58` | 143,179,377 bytes | `10002:10002` |

The Node runtime uses a fresh production-only install, removes the unused Prisma CLI and all global
`npm`, `npx`, and `tsx` executables, and is about 67 MB smaller than the first build. The migration
image uses a fresh base, fixed Prisma entrypoint, no application source, and no global `npm`/`npx`,
but its locked workspace tree still includes unrelated dev modules such as `tsx` and `vitest`.
That remaining content must be minimized or explicitly justified before acceptance.

## Compose and runtime verification

- MySQL and migrations use an internal-only network. MySQL publishes no host port.
- The API also joins a separate edge bridge so Docker Desktop can publish only
  `127.0.0.1:${OPSPILOT_COMPOSE_API_HOST_PORT}:4000`; it is not bound to all host interfaces.
- Worker and AI containers share the API network namespace and publish no independent ports.
- Razorpay, AI, RAG, document, and workflow behavior is off by default in the Compose profile.
- API and worker ran as `1000:1000` with a read-only root filesystem, `no-new-privileges`, and all
  Linux capabilities dropped. AI ran as `10002:10002` with the same controls.
- A fresh disposable MySQL volume applied all 15 migrations. API health returned `status=ok` and
  `database=reachable`; the worker completed jobs. API/worker graceful shutdown completed in
  1,967 ms, followed by successful container/network/volume cleanup.
- The final migration-only run again applied all 15 migrations and cleaned up its disposable
  volume.
- The AI image was healthy with network mode `none`; loopback was reachable, `/app` writes were
  blocked, `/tmp` writes succeeded, SIGTERM shutdown completed in 655 ms, and no telemetry-device-ID
  persistence warning remained after setting `HOME=/tmp`.
- Prisma 7.9.1 still warns that it cannot detect an OpenSSL version in the Node slim image. Client
  generation and all fresh-volume migrations succeed, but adding an OS package was not approved;
  this warning remains open for a separately reviewed remediation.

## SBOM and vulnerability results

Docker Scout `1.24.0` scanned only local images through `local://`. SPDX SBOM generation passed for
all four artifacts; Node, migration, and AI builds also contain BuildKit SBOM/provenance
attestations.

| Image | Indexed packages | Critical | High | Fixable critical | Fixable high |
| --- | ---: | ---: | ---: | ---: | ---: |
| Node runtime | 262 | 2 | 9 | 0 | 2 |
| Migration | 585 | 2 | 10 | 0 | 3 |
| AI runtime | 228 | 3 | 14 | 0 | 4 |
| Exact MySQL base | 166 | 2 | 30 | 2 | 30 |

Node findings affect `mariadb`, `pcre2`, `perl`, `util-linux`, and `zlib`. Migration adds `mysql2`.
AI findings affect `msgpack`, `openssl`, `pcre2`, `perl`, `setuptools`, `util-linux`, and `zlib`.
MySQL findings affect `cryptography`, `curl`, `libcurl`, `pyopenssl`, `sqlite`, `sqlite-libs`, Go
`stdlib`, and `urllib3`.

Scout recommends a Node 24.20.0 Bookworm refresh, but it still reports critical findings and would
change the accepted Node runtime/digest. Python 3.13.15 is current in the same line and has no
same-line refresh; Python 3.14/Alpine changes the accepted runtime/ABI boundary. MySQL 8.4.11 is
current and Scout offers no tag recommendation. No candidate was pulled because every digest or
dependency change requires a separate review and approval.

## Other checks

- Dockerfile build checks and rendered Compose configuration pass with no warnings.
- Repository high-confidence secret scanning found only an intentional negative-test fixture in
  `apps/api/src/config/env.test.js`; image history scanning found no high-confidence secret.
- JavaScript: lint pass; Prettier and Prisma validation pass; 113-module production web build pass;
  39 API files / 209 tests pass; 8 web files / 53 tests pass.
- Python: `pip check` and Ruff pass; 165 tests pass with 3 documented opt-in skips.
- The first host Python test attempt hit stale inaccessible Windows pytest temp/cache ACLs. The
  complete rerun passed using a unique `C:\\tmp` base with the cache plugin disabled; that task-owned
  directory was removed.
- `git diff --check` passes. Disposable Compose resources and task-owned lock/Scout temporary files
  were removed. Built and approved base images remain local.

## Gate decision and next action

Batch 10C is not accepted because critical/high findings remain, the migration image retains
unrelated dev modules, and the Prisma/OpenSSL warning is unresolved. Phase 10 remains in progress.
The next repository task is a separately reviewed remediation batch covering exact dependency/base
changes or documented exploitability-based risk decisions. No AWS or deployment work is authorized
by this evidence.
