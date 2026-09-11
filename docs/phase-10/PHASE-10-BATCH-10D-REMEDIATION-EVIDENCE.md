# Phase 10 Batch 10D Remediation Evidence

## Status

**IMPLEMENTED AND VERIFIED; NOT ACCEPTED.** The user explicitly approved only the six Batch 10D
remediation changes and explicitly prohibited acceptance of residual findings. Implementation began
on 2026-09-08 and verification completed on 2026-09-09. The approved fixable dependency/package
findings and migration/AI content issues were remediated, but critical/high scan findings, the npm
Prisma configuration finding, the Prisma/OpenSSL detection warning, and a database-restart recovery
failure remain open. No VEX, waiver, exception, risk acceptance, release approval, cloud change, or
deployment was created.

## Implemented scope

- Root npm overrides now resolve `mariadb@3.4.7`, `mysql2@3.23.1`, and `qs@6.16.0` with their
  reviewed registry integrity values.
- `docker/migration/package.json` and its independent lock contain only direct
  `prisma@7.9.1` and `dotenv@17.4.2` requirements, with the approved `mysql2@3.23.1` override.
- Final Node, migration, and AI stages update only
  `libpcre2-8-0=10.42-1+deb12u1`, remove the `mount` setuid bit, and remove `nsenter` while keeping
  the exact Batch 10C base digests.
- The final AI stage removes system/virtual-environment pip packages, executables, and nested pip
  SBOM metadata after the builder's successful `pip check`.
- `docker/mysql.Dockerfile` derives from the exact approved MySQL index. It removes `mysql-shell`,
  updates exact `curl`, `libcurl`, and `sqlite-libs` RPMs, removes `gosu`, and runs as `999:999`.
  Compose now builds and uses `opspilot-mysql:phase10` for local/CI only.
- `docker/verify-images.ps1` checks exact content, users, package versions, the Prisma engine hash
  and dynamic linkage, SPDX generation, and critical/high findings. It fails while any scan finding
  remains and has no suppression or scan-skip path.

No Node/Prisma major or patch upgrade, `deepmerge-ts` override, OpenSSL installation, new service,
provider account, environment variable, production AI enablement, Razorpay Live Mode, real data,
AWS resource, or deployment was added.

## Locks and application dependency results

| Package | Locked result | Reviewed integrity |
| --- | --- | --- |
| `mariadb` | `3.4.7` | `sha512-3Ols2iyVAXJjjugGo96dce2OYv1XYkQY0vBDMuWYQi08mGiRXQjhybZM2ZgAnX7N4kUgPOV0x5A/sof2DDPylQ==` |
| `mysql2` | `3.23.1` | `sha512-tTuRnC7qCet2IOfSNMYZ5SwXuBnfvBPAcIA28P0gtruXyZlU1LMxA6uha32kYypoFgyYklMqhLWwt4laYwXR/Q==` |
| `qs` | `6.16.0` | `sha512-h6fhOIaRrID2CbEY2fqs+7t+UXZo+MLAnU5gRIq85uFtdiUPCdsApMlHhXogKVM4HM2DVbIjGNTTYH2OcmP1vA==` |

Clean root and migration `npm ci` runs pass. `npm ls` proves the three overrides at the intended
paths and the migration tree has only Prisma/dotenv as direct dependencies. License and Node engine
metadata match the reviewed candidates.

Both `npm audit --omit=dev` runs remain blocked at three high results representing one unresolved
chain: `prisma@7.9.1 -> @prisma/config@7.9.1 -> deepmerge-ts@7.1.5`
(`GHSA-ggr8-5vv4-36mx`). The previous MariaDB, mysql2, and qs findings cleared. No breaking Prisma
downgrade or unsupported `deepmerge-ts@8` override was applied.

## Resulting artifacts and reproducibility

The OCI indexes include per-run maximum-mode provenance attestations. A second build under separate
reproduction tags generated the same Linux/amd64 runnable manifests for all four targets.

| Target | Current local OCI index | Reproduced runnable manifest | Size (bytes) | User | Indexed packages |
| --- | --- | --- | ---: | --- | ---: |
| Node | `sha256:51a11f270c9ff83a0f45e647cf6ff39a190fc720d2f2f9d5807c119b27a93c29` | `sha256:3df5bb5119535e2c38b2e8c1bbef144396b51f88e86206d0dce4050205f1b346` | 115,272,844 | `1000:1000` | 262 |
| Migration | `sha256:ea708f0855d3a6078353f416c14a491d19d8fddbd5ebfdfe3b6cc8355d09ea07` | `sha256:d5bebf9ad0ece5b81b7141efef077875ea68c365da4ed56942481796e9417bcc` | 150,072,969 | `1000:1000` | 270 |
| AI | `sha256:e62a251daa5bf60a52dca5917902e0f4b6c431bd51962d6f19bf2d8d1953d57c` | `sha256:e490b223b017682918a513979723eac5e70662f9d85a074470f905d214d413e3` | 143,535,584 | `10002:10002` | 213 |
| MySQL local/CI | `sha256:4c52ba3a307b924b68d259846e2e72be56631e2e73185f1f0d895f8111797a30` | `sha256:80eae00f5dfc0c7f34d994152af82ead123ccded53b9208989d9e0d9e22a6807` | 245,471,101 | `999:999` | 145 |

Docker Scout generated fresh SPDX reports for all targets. Temporary report hashes were:

- Node: `FA565368284000A1F053BC3F213A711DCC1175044548089F3FDB4D47284F5AA1`.
- Migration: `70DDE3E6BB40B6CE729C6809B24BBFA48555CBD120A215DB2CBA0FD6DEA6C929`.
- AI: `CB960D279C7DBEF725E529771347100BB26DB7CB96F5E47143AFA28076EDDC12`.
- MySQL: `A543B2A80A22BCD8DF1888212130C666038CB0F6EE6E026A8827DAACB6496FCD`.

## Content and runtime verification

- Node, migration, and AI contain the exact PCRE2 security package; `mount` is not setuid and
  `nsenter` is absent. Final Node/migration have no global npm/npx.
- The migration image has no API source, MariaDB application adapter, `mariadb`, `tsx`, Vitest,
  ESLint, Prettier, or workspace test/coverage content. Its package count fell from 585 to 270 and
  its size fell from 226,107,674 to 150,072,969 bytes.
- The migration CLI reports Prisma `7.9.1` and default engine hash
  `e922089b7d7502aff4249d5da3420f6fa55fc6ad`. `ldd` reports no missing library and no `libssl` or
  `libcrypto` linkage.
- AI runtime inspection finds no installed `pip`, `setuptools`, or `msgpack` distribution, no pip
  executable/package, and no `pip/_vendor/bom.cdx.json`. FastAPI, HTTPX, Uvicorn, and the service
  module still import.
- MySQL contains the exact approved RPM updates, has no `mysql-shell` package and no runtime
  `/usr/local/bin/gosu`, retains server `8.4.11`, and initializes an empty named volume as
  `999:999` without unsafe permission changes.
- A corrected disposable Compose run proved that Compose actually resolves
  `opspilot-mysql:phase10`. It initialized MySQL, applied exactly 15 migrations, returned no
  pending migration on a second run, and preserved the database through a MySQL container restart.
- Before that restart, API health was `ok/reachable`; worker jobs completed and AI was healthy.
  API/worker/AI ran non-root with read-only roots, writable bounded tmpfs, no-new-privileges, and all
  capabilities dropped. Only API port 4000 was published to host loopback (test host port 4100);
  MySQL had no host binding. AI loopback reachability through the API namespace returned the
  expected unsigned `401`.
- Clean shutdown completed in 226 ms for worker and 452 ms for API with exit code 0. AI completed
  all Uvicorn shutdown hooks in 281 ms; Docker's init process recorded the terminating SIGTERM as
  exit 143 and did not require SIGKILL.

## Unresolved operational result

The live application did not recover its Prisma/MariaDB pools after MySQL restarted. MySQL itself
returned healthy with the 15-migration database intact, but API health remained `503/unhealthy` and
API/worker logs repeatedly reported Prisma `P2039`, MariaDB pool timeouts with
`active=0 idle=0 limit=5`, and the original connection refusal. A simultaneous dependent-service
restart then exited API/worker non-zero; recreating API first and worker/AI afterward restored
`ok/reachable` health in 171 ms.

This recovery failure is not accepted or remediated in Batch 10D because application reconnect/
supervision behavior is outside the approved six-change scope. It remains a release blocker for a
separately proposed change.

## Current critical/high scan results

Fresh local-only Docker Scout data on 2026-09-09 reports:

| Image | Critical | High | Packages | Change from Batch 10C |
| --- | ---: | ---: | ---: | --- |
| Node | 2 | 8 | 3 | MariaDB and PCRE2 cleared; one newly published Perl high appeared |
| Migration | 2 | 8 | 3 | mysql2, PCRE2, and dev content cleared; one newly published Perl high appeared |
| AI | 3 | 11 | 4 | pip-only packages and PCRE2 cleared; one newly published Perl high appeared |
| MySQL | 2 | 20 | 1 | mysql-shell/RPM findings cleared; Scout still attributes lower-layer gosu Go metadata |

Node and migration retain the same ten reports:

- Perl: critical `CVE-2026-13221`, `CVE-2026-12087`; high `CVE-2026-57432`,
  `CVE-2026-48959`, and `CVE-2026-48962`.
- util-linux: high `CVE-2026-76642`, `CVE-2026-78408`, `CVE-2026-78409`, and
  `CVE-2026-78410`.
- zlib: high `CVE-2026-85091`.

AI retains those ten plus OpenSSL critical `CVE-2026-75803` and high `CVE-2026-63076`,
`CVE-2026-63072`, and `CVE-2026-54874`. Production AI remains disabled, but that control is not a
risk acceptance.

The MySQL report contains Go `stdlib@1.24.6` critical `CVE-2025-68121` and `CVE-2026-39821`, plus
high `CVE-2026-56862`, `CVE-2026-56859`, `CVE-2026-56853`, `CVE-2026-42504`,
`CVE-2026-42499`, `CVE-2026-39836`, `CVE-2026-39820`, `CVE-2026-33818`, `CVE-2026-33814`,
`CVE-2026-33811`, `CVE-2026-32283`, `CVE-2026-32281`, `CVE-2026-32280`, `CVE-2026-25679`,
`CVE-2025-61729`, `CVE-2025-61726`, `CVE-2025-61725`, `CVE-2025-61723`, `CVE-2025-58188`, and
`CVE-2025-58187`. Scout locates this metadata at the deleted lower image layer
`/usr/local/bin/gosu (evident by)` even though direct runtime inspection proves that path is absent.
The scan remains blocking; no false-positive declaration, VEX, or exception was created.

Official Debian tracker checks on 2026-09-09 still mark the Bookworm versions for
`CVE-2026-57432`, `CVE-2026-13221`, `CVE-2026-12087`, and `CVE-2026-75803` vulnerable. This is
current evidence, not a durable risk disposition.

## Regression and gate results

- Root and migration clean installs: pass; both production audits: fail as required on the
  unresolved three-node `deepmerge-ts` chain.
- JavaScript: ESLint pass; Prettier/Prisma validation pass; 113-module web build pass; 39 API files
  / 209 tests pass; 8 web files / 53 tests pass.
- Python: host `pip check`, Ruff lint/format, and 165 routine tests pass with 3 documented opt-in
  skips and the two existing upstream warnings. Builder `pip check` passed during image build.
- The first clean root install could not unlink a native Rolldown module held by the running local
  API/Vite dev servers. Only those six verified OpsPilot dev processes were stopped, then clean
  install passed. The user must restart the dev commands if wanted.
- The first Python run used a sandbox-denied `C:\tmp` base and produced 34 fixture setup errors
  after 131 passes/3 skips. The complete ACL-safe rerun with a new task-owned base passed
  165/165 routine tests; this was an environment failure, not an application regression.
- Stable-input reproduction, Compose validation, image content/dynamic-link checks, fresh-volume
  initialization/migrations, initial health, controls, and graceful shutdown pass.
- Git whitespace and PowerShell parse checks pass. The repository high-confidence scan finds only
  the intentional negative-test credential fixture already documented in
  `apps/api/src/config/env.test.js`; all four image-history scans have zero high-confidence hits.
- The automated image gate intentionally fails on every current critical/high result. The live
  database-restart recovery test fails. Therefore Batch 10D and the images are not accepted.
- The exact disposable Compose containers/networks/synthetic-data volume, reproduction-only tags,
  temporary SPDX/CVE/pytest files, and migration install tree were removed after verification.
  The four primary remediated local images remain.

## Gate decision and next action

Batch 10D implementation is complete only as an unaccepted remediation attempt. Batch 10C/10D,
Phase 10 release use, AWS infrastructure, and deployment remain blocked. The next recommended task
is a proposal-only Batch 10E review for fixed base/image options, accurate final-filesystem MySQL
SBOM handling, the new Perl advisory, the Prisma `deepmerge-ts`/OpenSSL items, and explicit
API/worker database reconnection and dependency-ordered restart behavior. Any implementation or
finding disposition requires new explicit approval.
