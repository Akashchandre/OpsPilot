# Phase 10 Batch 10G-1 setup-node Patch Review

## Status and authorization boundary

**PROPOSAL ONLY — EXACT UPSTREAM COMMIT REJECTED.** On 2026-09-10 the owner authorized only a
review of the exact merged `actions/setup-node` patch for Batch 10G-1. This review did not create a
workflow, install a package or tool, configure GitHub, access AWS, deploy, or accept/suppress a
finding. Batch 10G-1 remains approved but paused before implementation.

## Outcome

Do not use commit `e51e5fe84fc33b4c73ebe40526b2694712b5b858` in OpsPilot. It fixed the two
`brace-expansion` advisories that blocked `actions/setup-node@v7.0.0`, but it pins
`brace-expansion@5.0.8`. A later GitHub-reviewed high-severity advisory,
`GHSA-rgw5-rvv9-x895` / `CVE-2026-69152`, affects `5.0.8` and is patched in `5.0.9`.

A fresh lockfile-only audit therefore fails both the full and production-dependency gates. The
candidate does not satisfy OpsPilot's zero-critical/high action requirement, and no exploitability
assumption, waiver, suppression, or residual acceptance is proposed.

## Exact candidate identity

| Field                     | Verified value                                              |
| ------------------------- | ----------------------------------------------------------- |
| Repository                | `https://github.com/actions/setup-node.git`                 |
| Pull request              | `actions/setup-node#1599`                                   |
| PR head                   | `47cfa637119f995e62fad0960368835eca3969be`                  |
| Merged commit reviewed    | `e51e5fe84fc33b4c73ebe40526b2694712b5b858`                  |
| Parent                    | `32f57ac043e003bc1b07edcb2b9102bbbf3e92f1`                  |
| Merged                    | 2026-07-29 18:04:00 UTC                                     |
| GitHub verification       | Valid signature, verified at merge time                     |
| Upstream checks           | 223 passed on the pull request                              |
| Blocked release commit    | `820762786026740c76f36085b0efc47a31fe5020` (`v7`, `v7.0.0`) |
| Action runtime            | `node24`                                                    |
| Repository/action license | MIT                                                         |

The official PR and GitHub commit API agree on the merged commit, its parent, nine changed files,
and valid GitHub signature. `git ls-remote` also confirmed that `v7` and `v7.0.0` still point to
the older blocked release commit; the reviewed patch is untagged and still reports package version
`7.0.0`.

## Change and compatibility review

The patch commit itself changes only `package.json`, `package-lock.json`, two compiled action
bundles, and matching third-party license metadata. It adds an npm override for
`brace-expansion@5.0.8`, removes the old `1.1.13`, `2.1.1`, and `5.0.6` lock paths, and rebuilds
`dist/setup/index.js` and `dist/cache-save/index.js`. The `action.yml` and root `LICENSE` Git blobs
are byte-identical to `v7.0.0`; the action therefore retains its `node24` runtime and MIT license.

Pinning the merged commit would nevertheless adopt more than that nine-file patch. It is seven
commits ahead of `v7.0.0` and also includes six earlier `main` commits. Relevant cumulative changes
include:

- installed-Node version verification and bounded manifest-fetch retries;
- `@actions/cache` moving from `^6.1.0` to `^6.2.0` with rebuilt bundles;
- an `@types/node` development-only pin change; and
- upstream workflow, test-fixture, README, and advanced-usage updates.

The runtime change validates both cache hits and downloaded installations and fails if
`node --version` does not exactly match the selected tool-cache version. Upstream tests covered the
change, but OpsPilot did not install dependencies or execute the action because this proposal was
review-only and the fresh advisory gate already fails.

## Current advisory evidence

The review used the existing portable Node `24.19.0` and npm `11.17.0`. It ran npm advisory queries
with `--package-lock-only`; no dependency was installed. The exact lockfile SHA-256 remained
`1856BB19AC27F05E3050B327A0FCD3E4BE69F82D34863AE67084703A1E2B691C` before and after both
queries.

| Audit scope                  | Critical | High | Moderate | Result |
| ---------------------------- | -------: | ---: | -------: | ------ |
| Production lock (`omit=dev`) |        0 |    2 |        1 | Fail   |
| Complete lock                |        0 |    3 |        2 | Fail   |

The production report contains the high `brace-expansion` finding and its affected `minimatch`
dependency path, plus a moderate `undici` finding. The complete report additionally contains high
findings for `browserslist` and `js-yaml` and a moderate finding for
`baseline-browser-mapping`. These counts are npm package-node counts, not a claim that each node is
a distinct vulnerability.

No reported advisory is omitted from this disposition:

| Audit node                 | Severity | Advisory or dependency path                                                      | Scope                 |
| -------------------------- | -------- | -------------------------------------------------------------------------------- | --------------------- |
| `brace-expansion`          | High     | `GHSA-rgw5-rvv9-x895`                                                            | Production + complete |
| `minimatch`                | High     | Affected through `brace-expansion`; npm reports this as a second production node | Production            |
| `undici`                   | Moderate | `GHSA-8xcm-r25x-g524`, `GHSA-m8rv-5g2x-5cg5`, `GHSA-v3r7-h72x-cjcm`              | Production + complete |
| `browserslist`             | High     | `GHSA-c83g-rgw3-j3cx`, `GHSA-73wf-gq98-2v4g`                                     | Complete              |
| `js-yaml`                  | High     | `GHSA-5p4m-2wfm-xmqj`, `GHSA-2883-xcg3-v3hh`                                     | Complete              |
| `baseline-browser-mapping` | Moderate | `GHSA-w5vr-8v7q-w6rv`                                                            | Complete              |

The blocking package entry is exactly:

```text
node_modules/brace-expansion = 5.0.8
```

The compiled `dist/setup/index.js` and `dist/cache-save/index.js` both contain the affected 5.0.8
implementation: `expandSequence` has no `maxLength` parameter and comma alternatives are collected
with unbounded `values.push.apply(...)`. This matches the later advisory's affected behavior. The
advisory was published after the reviewed commit merged, explaining why PR 1599's then-current
audit could pass without making the commit acceptable today.

## Disposition and next gate

The exact commit is rejected for Batch 10G-1. No implementation approval should reference it, and
there is intentionally no implementation-approval text in this document.

Keep `.github` absent and wait for an official patched `setup-node` `v7.x` release. Before using a
future release, resolve its immutable commit again and repeat publisher, signature, cumulative
behavior, action-bundle, full-lock, production-lock, license, runner, and OpsPilot compatibility
checks. Both audits must have zero unresolved findings under the owner's no-acceptance/no-
suppression direction. A later untagged `main` tree is not a substitute without its own separate
proposal-only authorization and exact review.

## Official references

- [setup-node patch PR 1599](https://github.com/actions/setup-node/pull/1599)
- [exact merged commit](https://github.com/actions/setup-node/commit/e51e5fe84fc33b4c73ebe40526b2694712b5b858)
- [original setup-node bundled dependency issue](https://github.com/actions/setup-node/issues/1596)
- [new brace-expansion 5.0.8 advisory](https://github.com/advisories/GHSA-rgw5-rvv9-x895)
- [undici response-desynchronization advisory](https://github.com/advisories/GHSA-8xcm-r25x-g524)
- [undici CRLF-injection advisory](https://github.com/advisories/GHSA-m8rv-5g2x-5cg5)
- [undici cookie-attribute advisory](https://github.com/advisories/GHSA-v3r7-h72x-cjcm)
- [browserslist memory-growth advisory](https://github.com/advisories/GHSA-c83g-rgw3-j3cx)
- [browserslist custom-stats advisory](https://github.com/advisories/GHSA-73wf-gq98-2v4g)
- [js-yaml quadratic `!!omap` advisory](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj)
- [js-yaml empty-merge-source advisory](https://github.com/advisories/GHSA-2883-xcg3-v3hh)
- [baseline-browser-mapping advisory](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv)
- [original exponential-time advisory](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp)
- [original out-of-memory advisory](https://github.com/advisories/GHSA-mh99-v99m-4gvg)
