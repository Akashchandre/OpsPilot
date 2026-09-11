# Phase 10 — Testing, Docker, CI/CD, and Production

## Status

**BASELINE ACCEPTED — IMPLEMENTATION IN PROGRESS.** Phase 9 was explicitly accepted and committed
as `ccfbd88`. On 2026-09-07 the user authorized Phase 10, selected a personal project whose
deployed demo may use Razorpay Test Mode only, and approved the complete production-readiness
baseline and threat model under ADR 0013. Dependency-free repository work may proceed, and Batch
10A Docker Desktop `4.89.0` and Batch 10B Microsoft WSL `2.7.13.0` were separately approved,
installed, and verified on 2026-09-08. The exact Batch 10C pull/build and six-change Batch 10D
remediation were then separately approved and implemented. On 2026-09-09 the user separately
approved only Batch 10E changes 10E-1 through 10E-4, the two non-secret timing settings, the exact
MySQL rebuild, and disposable tests. Batch 10E now clears MySQL's lower-layer gosu/Go attribution,
passes its `0C/0H` gate, and verifies deterministic API/worker recovery and supervised exit across
database outages. Node, migration, AI, and Prisma findings remain, so Batch 10C/10D/10E remain
unaccepted; no finding was accepted. The separately authorized proposal-only Batch 10F upstream
review found no current zero-residual Node/Python image or stable Prisma remediation candidate, so
it recommends no implementation and preserves every blocker. No other new dependency/tool, cloud
resource, real customer/regulated data use, production AI enablement, Razorpay Live Mode, or
deployment is approved yet.

The prohibited Trixie, Prisma/MariaDB dependency, waiver/VEX, and residual-acceptance paths were not
used. Complete implementation evidence and the local operator path are in
`docs/phase-10/PHASE-10-BATCH-10E-REMEDIATION-EVIDENCE.md` and
`docs/phase-10/PHASE-10-CONTAINER-OPERATIONS-RUNBOOK.md`.

The selected profile is public on an AWS account, uses the generated CloudFront domain, permits no
paid spend beyond eligible Free Tier credits, expects demo-only traffic, sends alerts by email, and
uses a public GitHub repository on the Free plan. On 2026-09-09 the owner selected `us-east-1` and
reported an AWS Free Plan account with USD 160 of credit and 67 days remaining, MFA enabled,
and billing alerts enabled. These account facts were not verified through AWS. A separately
authorized proposal-only CI/CD and infrastructure review recommends repository-only quality CI as
the next implementation batch but blocks release and provisioning on the current critical/high
findings, the finite credit window, and unresolved strict CloudFront-to-ALB TLS without a custom
domain. No workflow, GitHub setting, template, AWS resource, or deployment was created.

On 2026-09-10 the owner approved Batch 10G-1 repository-only pull-request quality CI using the
four exact Action commits in the proposal. The mandatory immediate recheck found two high-severity
`brace-expansion` advisories in the approved `actions/setup-node@v7.0.0` bundle. The upstream patch
is merged but no patched `v7.x` tag exists, so 10G-1 stopped before creating `.github` or a
workflow. This preserves the owner's no-residual/no-suppression requirement. No alternative action,
runtime bootstrap, installation, GitHub setting, cloud access, artifact, or deployment was used.

The owner then authorized a proposal-only review of exact merged patch commit
`e51e5fe84fc33b4c73ebe40526b2694712b5b858`. It is GitHub-verified, retains `node24`/MIT, and
rebuilt both bundles with `brace-expansion@5.0.8`, but a newer high-severity advisory affects that
version. Fresh no-install audits fail at `0C/2H/1M` for production dependencies and `0C/3H/2M` for
the complete lock. The exact commit is rejected, 10G-1 remains unimplemented, and no finding was
accepted or suppressed.

On 2026-09-11 the owner authorized only a no-domain strict-HTTPS alternatives review for
`us-east-1`. The review found no drop-in alternative that preserves the accepted application,
worker, private-origin, Free Plan, and no-residual gates. A CloudFront/API Gateway/Lambda
re-platform was the only candidate retained for a separate detailed proposal, but it changes
Socket.IO, request execution, rate controls, notification fan-out, and database connection
behavior and was not accepted. App Runner requires the new AWS Paid Plan, while Lightsail is
unavailable in that Free Plan unless advanced features are activated. No template, workflow,
dependency, GitHub/AWS change, account access, provisioning, deployment, domain purchase,
HTTP-origin exception, or finding acceptance resulted. See
`docs/phase-10/PHASE-10-NO-DOMAIN-STRICT-HTTPS-ALTERNATIVES.md`.

The owner then authorized only the detailed proposal review of that serverless candidate. The
review found it no-go with all fifteen findings open: API Gateway does not host Socket.IO, the real
browser cookie/realtime path is unproved, connect-only WebSocket authorization needs durable
revocation enforcement, generated origins need a separately proved restriction, Lambda invalidates
process-local controls and lifecycle assumptions, Prisma/RDS Proxy behavior is unproved, and
private-network egress has unresolved compatibility and cost. Nothing was implemented or accepted.
See `docs/phase-10/PHASE-10-API-GATEWAY-LAMBDA-COMPATIBILITY-PROPOSAL.md` and
`docs/security/PHASE-10-API-GATEWAY-LAMBDA-THREAT-MODEL.md`.

The owner subsequently approved repository implementation of the separate ADR 0014 single-EC2
CloudFront personal-demo pack and explicitly accepted HTTP only between CloudFront and EC2. The
pack adds an exact-digest unprivileged Nginx/React image, a production-configured Compose overlay,
an `/api/v1/socket.io` transport aligned with the session-cookie path, Linux operator scripts, and
an exact manual `us-east-1` runbook. Lint, formatting/schema validation, the 225-test API and
53-test web suites, production web build, disposable production-mode stack, Nginx/script checks,
database health, worker execution, SPA/API smoke, and authenticated WebSocket-through-Nginx smoke
pass. This did not access AWS, create infrastructure, deploy, enable AI/documents/workflows, use
Live Mode, or accept/suppress any existing finding. ADR 0013's production blockers remain open.

## Objective

Validate the complete accepted platform, package it reproducibly, automate quality/deployment gates, and prepare a secure observable production release.

## Requirements and goals

- Comprehensive unit, integration/API, E2E, contract, security, migration, performance, recovery, and AI evaluation coverage.
- Minimal hardened Docker images and an approved local/production service topology.
- GitHub Actions quality gates and controlled deployment flow.
- Approved AWS architecture or another explicitly selected platform, with isolated environments and least privilege.
- Production secrets, networking, TLS, data protection, backups/restore, observability, scaling, runbooks, rollback, and incident readiness.

## Decisions required

Production provider/AWS services/region/network; domains/TLS; environment strategy; container registry/orchestration; CI branch/release/deploy approvals; secrets/KMS; database HA/backups/RPO/RTO; object/vector/Redis/queue production services; observability/SLOs/alerts; scaling/capacity/cost; vulnerability tooling; retention/compliance; rollout/rollback/DR.

## Tasks

- [x] Verify Phase 9 repository/development acceptance, commit state, and authorization to begin
      Phase 10 decision-definition.
- [x] Inspect the current package/runtime/configuration/test/deployment boundaries and record the
      production-readiness gaps.
- [x] Review current official Docker, GitHub Actions, AWS, LangGraph persistence, and Qdrant
      production guidance relevant to the proposed topology.
- [x] Draft the Phase 10 decision proposal, staged personal-demo profile, dependency/account/
      configuration inventory, test/release gates, and production threat model.
- [x] Obtain explicit approval of the complete Phase 10 baseline and threat model; record ADR 0013.
- [x] Record public access, AWS account, generated-domain, Free Tier/credit-only, demo-traffic,
      email-alert, and public GitHub Free selections.
- [x] Record the owner's exact `us-east-1` selection and owner-reported Free Plan, USD 160 credit,
      67-day expiry window, MFA, and billing-alert status without accessing AWS.
- [ ] Independently verify current Free Plan/service eligibility, actual credit balance/expiry,
      billing-alert delivery, and exact pricing immediately before any infrastructure request.
- [ ] Review and separately approve each exact new dependency/tool/image batch before use.
- [x] Review and install checksum/signature-verified Batch 10A Docker Desktop `4.89.0` / Compose
      `5.5.0`; no sign-in, Kubernetes, image pull, or cloud change occurred.
- [x] Enable the separately approved Windows WSL and Virtual Machine Platform prerequisites; DISM
      returned restart-required exit code `3010`.
- [x] Restart Windows and verify both optional features remain enabled with virtualization services
      running.
- [x] Install separately approved stable WSL `2.7.13.0`; prove WSL status and the Docker Linux/
      x86_64 engine healthy after a Docker Desktop restart.
- [x] Resolve and review immutable multi-platform index and Linux/amd64 manifest digests for the
      Batch 10C Node, Python, and local/CI MySQL official images without pulling image layers.
- [x] Obtain separate Batch 10C approval, then pull/build the exact digest-pinned images and run
      scan, SBOM, configuration, health, shutdown, and non-root checks.
- [x] Add persistent public-demo, fictional-data, and `TEST MODE — NO REAL MONEY` labelling.
- [x] Build optimized non-root images and the approved safe local/CI Compose topology; retain the
      scan and migration-content blockers until separately remediated or formally accepted.
- [x] Prepare the finding-level Batch 10D remediation proposal for exact npm/RPM changes,
      migration/MySQL/AI minimization, Debian residual dispositions, and the Prisma/OpenSSL
      warning without installing, pulling, building, or accepting risk.
- [x] Obtain separate approval, implement the exact Batch 10D changes, rerun every container and
      regression gate, and return the residual digest-scoped findings without accepting them.
- [x] Prepare the proposal-only Batch 10E fixed-base, MySQL final-filesystem, Prisma, and database-
      recovery review without implementing or accepting any finding.
- [x] Obtain separate approval and implement only Batch 10E's final-filesystem MySQL image,
      dependency-free database supervision, explicit Compose restart propagation, two non-secret
      timing settings, and disposable evidence without accepting residual findings.
- [x] Prepare the proposal-only Batch 10F upstream Node/Python image and Prisma review; record that
      no current candidate meets the zero-critical/high and compatibility gates, with no pull,
      build, dependency change, AWS access, or finding acceptance.
- [x] Prepare the proposal-only CI/CD and `us-east-1` infrastructure plan, exact candidate GitHub
      Action inventory, OIDC/IAM boundary, ephemeral cost model, stack decomposition, and owner
      handoff without creating a workflow, setting, template, cloud resource, or deployment.
- [x] Obtain 10G-1 approval and perform the required immediate four-action tag/advisory recheck;
      stop before implementation because approved `actions/setup-node@v7.0.0` bundles two
      high-severity findings and no patched `v7.x` release exists.
- [x] Perform the separately authorized proposal-only review of exact merged setup-node patch
      commit `e51e5fe84fc33b4c73ebe40526b2694712b5b858`; reject it because current full and
      production audits still contain high findings.
- [x] Review no-domain strict-HTTPS alternatives for `us-east-1`; record that no drop-in candidate
      passes every accepted gate and leave the CloudFront/API Gateway/Lambda re-platform as an
      unaccepted proposal-only study candidate.
- [x] Complete the separately authorized detailed API Gateway/Lambda compatibility and threat-model
      review; keep all fifteen findings open and reject implementation/provisioning under the
      current no-domain, Free Plan, and no-residual constraints.
- [x] Record the separately approved ADR 0014 single-EC2 personal-demo exception, including the
      owner's explicit acceptance of HTTP only for the CloudFront-to-EC2 hop.
- [x] Implement and locally verify the single-EC2 Nginx/React/API/worker/MySQL Compose pack,
      operator scripts, Socket.IO cookie-path alignment, and manual `us-east-1` runbook without
      AWS access or provisioning.
- [ ] Obtain separate explicit authorization before accessing AWS or manually provisioning the
      ADR 0014 demo resources.
- [ ] Re-review and obtain approval for a future exact patched setup-node release before creating
      the 10G-1 workflow; do not substitute an unreviewed commit or floating runner runtime.
- [ ] Resolve the no-domain CloudFront-to-ALB strict TLS blocker before implementing infrastructure
      as code or requesting provisioning.
- [ ] Resolve the remaining Node/migration/AI scan blockers and Prisma audit/warning through a
      separately reviewed upstream-compatible batch; MySQL attribution and database-restart
      recovery are verified resolved.
- [ ] Add PR quality/security, immutable release, staging, and protected deployment workflows.
- [ ] Implement approved production adapters and multi-instance/key-rotation controls.
- [ ] Provision the approved isolated staging/demo infrastructure through reviewed infrastructure
      as code; do not use production/customer data.
- [ ] Run full regression, E2E, accessibility/browser, migration, security, container, load/soak,
      failure, backup/restore, rollback, alert, and AI gates.
- [ ] Resolve or formally accept every release blocker, synchronize runbooks/evidence, and obtain
      explicit approval for an exact release digest before deployment.

## Acceptance criteria

- A tagged commit produces reproducible immutable artifacts through passing CI gates.
- Images run as non-root where feasible, contain no secrets/dev-only tooling, and have health/shutdown behavior.
- Deployments use least privilege, controlled migrations, smoke checks, rollback, and environment approvals.
- Production data is encrypted in transit/at rest, isolated, backed up, and successfully restored in a timed exercise meeting approved RPO/RTO.
- Alerts and dashboards cover user-facing availability, errors, latency, saturation, jobs, realtime, payment, AI, dependencies, cost, and security signals as applicable.
- Security, performance, accessibility, compatibility, privacy, AI evaluation, and full regression gates meet approved thresholds.
- Operations can follow runbooks for deployment, rollback, incident, provider outage, data recovery, key rotation, and AI disablement.

## Testing requirements

Full automated suite; clean migration and upgrade tests with production-like data; E2E critical customer/admin/support/AI paths; authorization/tenant isolation; SAST/dependency/container/secret scans plus targeted DAST/penetration review; load/soak/failure tests; backup/restore and regional/dependency failure drills; deployment/rollback smoke tests; accessibility/browser checks; AI regression/security/cost evaluations.

## Edge cases

Failed/long migration, mixed application/schema versions, partial rollout, unhealthy instance, dependency/region/DNS/certificate outage, secret rotation, queue backlog, reconnect storm, backup corruption, storage/vector inconsistency, provider model change, runaway AI cost, rollback after state change, alert flood or missing telemetry.

## Security considerations

Least-privilege IAM and network segmentation; no public databases/internal services; protected CI/OIDC and environments; pinned/scanned dependencies/images/actions; secret management/rotation; WAF/rate/DDOS controls as justified; secure headers/CORS/cookies; centralized redaction and audit; incident response/disclosure; privacy/retention compliance; emergency payment/job/realtime/AI kill switches.

## Completion criteria

All agreed gates pass; critical/high findings are resolved or formally accepted; restore, rollback, incident, and kill-switch exercises succeed; ownership/on-call/escalation/cost controls exist; documentation reflects deployed reality; prior phases remain stable; release approval is explicit; and post-launch monitoring/review is scheduled.

## Documentation updates

Finalize architecture/topology, environment and data-flow inventories, API/schema/AI contracts, deployment/migration/rollback/backup/restore/incident/security/operations runbooks, SLOs/alerts, evaluation and readiness evidence, decision records, phase status, and `WORK-PROGRESS.md`.

## Explicit exclusions

Unreviewed features, speculative infrastructure, and production launch without completed readiness gates are out of scope. Future enhancements require a new approved phase or roadmap item.

Razorpay Test Mode may be used in the personal production-configured demo only when it is
unmistakably labelled `TEST MODE — NO REAL MONEY`; Live Mode remains prohibited. Commercial claims,
real payment acceptance, unapproved customer/production data, non-synthetic support-data model
processing, and silent AI/document/workflow production enablement remain excluded.
