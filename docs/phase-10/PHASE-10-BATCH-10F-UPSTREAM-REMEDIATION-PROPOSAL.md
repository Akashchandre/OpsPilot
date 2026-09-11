# Phase 10 Batch 10F Upstream-Compatible Remediation Proposal

## Status and authorization boundary

**PROPOSAL ONLY — NO IMPLEMENTATION CANDIDATE IS RECOMMENDED.** On 2026-09-09 the user
authorized a proposal-only review of the next upstream-compatible image and Prisma remediation
batch. This authorization did not permit an image pull, local image build or tag, dependency or
lockfile change, service installation, finding acceptance, waiver/VEX/exception, cloud account
access, AWS provisioning, or paid spend. None occurred.

Batch 10E remains implemented but unaccepted. Its MySQL final filesystem passes at `0C/0H` and its
database recovery controls pass, while the Node and migration images remain at `2C/8H`, the AI
image remains at `3C/11H`, and the root and migration production audits retain the three-node
Prisma `deepmerge-ts` high-severity chain. The zero-critical/high release gate is unchanged.

## Review method

The review used only read-only repository inspection, public package metadata, official-image
manifests, registry manifest metadata, remote Docker Scout analysis, official upstream issue and
release data, and the Debian security tracker. `docker buildx imagetools inspect` resolved remote
manifests without pulling their layers into the engine. No candidate tag was used as an immutable
approval: the exact Linux/amd64 manifest digests below are evidence for this review only.

The existing local Batch 10E images were also inspected in disposable read-only containers to
check shared-library requirements. This did not modify an image or the repository.

## Image candidate results

| Candidate                      | Linux/amd64 manifest digest                                               |                 Read-only Scout result | Compatibility result                                                        | Disposition |
| ------------------------------ | ------------------------------------------------------------------------- | -------------------------------------: | --------------------------------------------------------------------------- | ----------- |
| `node:24.20.0-bookworm-slim`   | `sha256:6642ef280aebc09c4541bee0b15c9f89f0f3f3c247ddee79ae1d37eddfdcbbaa` |          `2C/13H` in 273 base packages | Same vulnerable Bookworm base lineage as the current image                  | Reject      |
| `node:24.20.0-alpine3.24`      | `sha256:4caaaf42195bcd6f6f3559a413b20cb8f8ad089e231ee874cf7701643966689f` |          `2C/11H` in 170 base packages | OpenSSL accounts for `2C/7H`; final-image npm removal cannot clear it       | Reject      |
| `python:3.13.15-slim-bookworm` | `sha256:2f2e5a876c71a6757f55ec57f2add0225ddaf01c802a33fcc29073943f94d907` | Existing Batch 10E AI remains `3C/11H` | This is the already approved and tested Python base, not an upstream change | No change   |
| `python:3.13.15-alpine3.24`    | `sha256:46ee549c88617e9bc8acb843a326f1a5c0fa5608d7f9703509efe6d53b55f318` |            `0C/7H` in 57 base packages | Current Linux lock contains manylinux/glibc wheels, not musllinux wheels    | Reject      |

The corresponding reviewed multi-platform index digests are:

- Node Bookworm: `sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e`.
- Node Alpine: `sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf`.
- Python Bookworm: `sha256:ed86c82274b3c69b52fb5820f358f0bd7df0b603332063cb5c6e32bd220c3e6e`.
- Python Alpine: `sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a`.

The remote Python Alpine report noted one scanner exception. It was not used to suppress, waive,
or reduce the seven high findings recorded here.

### Why selective library deletion is not proposed

The current Node executable does not directly link to OpenSSL or zlib, so a future purpose-built
minimal runtime could merit a separate supply-chain review. Removing Debian metadata or copying a
hand-selected filesystem solely to make a scanner quiet would, however, weaken package provenance
and SBOM visibility. It is not an acceptable Batch 10F remediation.

The AI runtime cannot use the same shortcut. Its Python standard-library extensions link to
OpenSSL, libcrypto, libuuid, and zlib, and installed NumPy/Pillow/OpenBLAS components also require
zlib-linked native libraries. Deleting those libraries would break actual runtime paths. Moving to
Alpine would additionally require a new musl-compatible dependency resolution, lock, and native
wheel test matrix; that is a broader dependency/platform change and still would not clear the
reviewed Alpine high findings.

## Prisma candidate results

| Candidate                                                | Relevant upstream resolution                                                                                             | Disposition                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Current stable `prisma@7.10.0` / `@prisma/client@7.10.0` | `@prisma/config@7.10.0` still pins `deepmerge-ts@7.1.5`                                                                  | Reject: audit finding remains                     |
| Current Prisma 8 dist-tag                                | `8.0.0-rc.13`, not a stable release                                                                                      | Reject: prerelease and broad major-version change |
| Root override to `deepmerge-ts@8.0.2`                    | Advisory is fixed, but Prisma has not published this dependency combination and the major release changes merge behavior | Reject: unsupported compatibility override        |
| Remove/bypass Prisma CLI                                 | Would replace the accepted Prisma migration boundary while the dedicated migration image still needs a supported CLI     | Reject: architectural regression                  |

The installed audit path is
`prisma@7.9.1 -> @prisma/config@7.9.1 -> deepmerge-ts@7.1.5`; the migration lock contains the same
production chain. The reviewed stable Prisma update therefore does not resolve
`GHSA-ggr8-5vv4-36mx`. Upstream issue `prisma/prisma#30052`, requesting a compatible bump to
`deepmerge-ts >=8`, remains open. A Prisma upgrade is not proposed until a stable upstream release
contains and tests that fix.

The existing Prisma/OpenSSL detection warning also remains a mandatory exact-engine and linkage
gate. It was not reclassified or accepted by this review.

## Debian finding disposition

Bookworm and Trixie remain blocked by current upstream package availability:

- the Debian tracker still marks Bookworm/Trixie Perl findings `CVE-2026-13221`,
  `CVE-2026-12087`, and `CVE-2026-57432` vulnerable;
- `CVE-2026-85091` remains unresolved for Debian zlib, including newer tracked suites; and
- Bookworm/Trixie util-linux findings `CVE-2026-76642` and `CVE-2026-78408` do not have a suitable
  stable-suite fix for this image path.

Importing packages from Debian unstable/Sid, mixing distribution suites, or moving to Trixie does
not meet the approved upstream-compatible and zero-residual boundary. None is proposed.

## Proposal conclusion

There is no honest, upstream-compatible Batch 10F implementation candidate today. The approved
action is to preserve the current reproducible Batch 10E state, preserve every blocker, and wait
for upstream releases. This proposal does not authorize an implementation batch.

Reopen the image review only when at least one of these triggers occurs:

1. An official Node 24 slim image is published with stable-suite fixes and a remote Linux/amd64
   analysis that can plausibly reach `0C/0H` after the already documented final-image hardening.
2. An official Python 3.13 glibc-compatible image is published with fixed runtime libraries and a
   remote analysis that can plausibly reach `0C/0H` without deleting required libraries.
3. A musl move is separately proposed only after all locked native dependencies have official
   compatible artifacts and the candidate itself passes the zero-critical/high gate.
4. Prisma publishes a stable, Node-24-compatible release whose `@prisma/config` dependency uses a
   fixed `deepmerge-ts` line and whose MariaDB adapter remains compatible with the application.

After a trigger, a new proposal must first resolve official manifests and exact digests, enumerate
licenses/accounts/environment changes, compare the full dependency graph, and run remote scans.
Only a separately approved implementation may then pull/build candidates and run SBOM, provenance,
non-root, linkage, migration, health, recovery, shutdown, audit, and complete regression gates.
Any remaining critical/high result stops the batch; no automatic waiver is allowed.

## AWS information recorded, with no provisioning

The owner reports an existing AWS account and **USD 160 of free promotional credit**. This is an
owner statement, not an account-verified balance. Credit balance/issuance/expiry, current Free
Plan status, and eligibility of each proposed service remain unknown and must be checked in AWS
Billing before infrastructure approval.

The owner supplied `us-east`, which is a region family rather than an exact AWS region code. AWS
defines both `us-east-1` (US East, N. Virginia) and `us-east-2` (US East, Ohio). The exact selection
therefore remains unresolved. Before any provisioning, the owner must provide one exact code and
confirm the credit expiry and Free Plan/service eligibility. No AWS credentials, identifiers,
billing pages, APIs, or resources were accessed in this review.

## Costs, accounts, and secrets

- New dependencies, tools, accounts, services, environment variables, and secrets: none.
- Local image pulls/builds/tags and Docker sign-in: none.
- AWS access, infrastructure changes, and spend: none.
- Residual finding acceptance, scanner suppression, exception, waiver, or VEX: none.

## Review caveats

Two initial disposable shared-library inspection commands failed because PowerShell-to-container
shell quoting malformed a `find -exec` expression and a regular expression. They made no state
change. A simplified read-only inspection then completed and produced the linkage conclusions
above. No application, image, audit, or regression result failed during this proposal-only work;
code tests were not rerun because no executable source, lockfile, or image changed.

## Official references

- Node official-image manifest:
  <https://github.com/docker-library/official-images/blob/master/library/node>
- Python official-image manifest:
  <https://github.com/docker-library/official-images/blob/master/library/python>
- Node.js `24.20.0` release:
  <https://github.com/nodejs/nodejs.org/blob/main/apps/site/pages/en/blog/release/v24.20.0.md>
- Prisma releases: <https://github.com/prisma/orm/releases>
- Prisma upstream remediation issue: <https://github.com/prisma/orm/issues/30052>
- `deepmerge-ts` security advisory: <https://github.com/advisories/GHSA-ggr8-5vv4-36mx>
- `deepmerge-ts` upstream repository: <https://github.com/RebeccaStevens/deepmerge-ts>
- Debian `CVE-2026-13221`: <https://security-tracker.debian.org/tracker/CVE-2026-13221>
- Debian `CVE-2026-12087`: <https://security-tracker.debian.org/tracker/CVE-2026-12087>
- Debian `CVE-2026-57432`: <https://security-tracker.debian.org/tracker/CVE-2026-57432>
- Debian `CVE-2026-85091`: <https://security-tracker.debian.org/tracker/CVE-2026-85091>
- Debian `CVE-2026-76642`: <https://security-tracker.debian.org/tracker/CVE-2026-76642>
- Debian `CVE-2026-78408`: <https://security-tracker.debian.org/tracker/CVE-2026-78408>
- AWS region codes:
  <https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-region-billing-codes.html>
- AWS Free Tier FAQ:
  <https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-FAQ.html>
