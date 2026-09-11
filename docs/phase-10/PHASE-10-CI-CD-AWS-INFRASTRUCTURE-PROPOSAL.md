# Phase 10 CI/CD and AWS Infrastructure Proposal

## Status and authorization boundary

**PROPOSAL ONLY EXCEPT FOR THE NARROW 10G-1 AUTHORIZATION RECORDED BELOW. NO AWS OR LATER GATE IS
AUTHORIZED.**

**10G-1 UPDATE — APPROVED BUT SAFELY PAUSED BEFORE IMPLEMENTATION.** On 2026-09-10 the owner
approved 10G-1. The required immediate upstream recheck then found that the approved
`actions/setup-node@v7.0.0` commit bundles versions affected by two high-severity
`brace-expansion` advisories. No patched `v7.x` tag exists. Because the owner prohibited accepting
or suppressing findings, no `.github` directory or workflow was created. Every later GitHub/AWS
gate remains proposal-only and unapproved.

The owner then authorized a proposal-only review of the exact merged upstream patch. Commit
`e51e5fe84fc33b4c73ebe40526b2694712b5b858` is GitHub-verified and rebuilt the bundles with
`brace-expansion@5.0.8`, but a newer high-severity advisory affects that version and is fixed only
in `5.0.9`. Fresh full and production lockfile audits both fail, so the exact commit is rejected and
10G-1 remains paused. No finding was accepted or suppressed.

On 2026-09-09, the owner authorized preparation of this proposal for `us-east-1` and explicitly
prohibited provisioning. The owner also reported that MFA and billing alerts are enabled and that
the account is on the AWS Free Plan with USD 160 of credit and 67 days remaining.
Those are owner-supplied facts; no AWS console, API, billing, IAM, or region access was performed to
verify them.

This review did not create or change a GitHub workflow, repository setting, environment, secret,
OIDC provider, IAM principal, AWS resource, DNS record, certificate, image, artifact, or deployment.
It did not install a dependency or tool, access an AWS account, accept a security finding, or
authorize paid usage.

## Outcome

The repository-only CI plan is viable as a separately approved next batch. Release, deployment,
and AWS provisioning are not ready for implementation for three independent reasons:

1. Node, migration, and AI container scans and the Prisma dependency path still have unresolved
   critical/high findings. A release workflow must not publish or deploy those artifacts.
2. The selected generated CloudFront domain can provide browser-to-CloudFront HTTPS, but strict
   certificate-validated HTTPS from CloudFront to an ALB needs an origin certificate whose name
   matches the origin. AWS does not issue a public certificate for an AWS-owned ALB hostname, and
   the owner selected no custom domain. Private HTTP through a CloudFront VPC origin does not meet
   OpsPilot's accepted all-production-data-in-transit encryption gate.
3. The accepted ECS/Fargate, ALB, RDS, VPC endpoint, WAF, log, secret, and key topology is
   usage-priced. With 67 days remaining, USD 160 represents an average credit envelope of about
   USD 2.39 per remaining day, or USD 71.64 per 30 days. An always-on dynamic stack could exceed
   that envelope. Exact pricing and Free Plan eligibility must be verified immediately before any
   later provisioning.

The recommended sequence is therefore: implement non-deploying repository quality CI only after a
separate approval; resolve the existing release-security findings; decide the origin TLS approach;
then prepare and review repository-only CloudFormation before requesting any AWS account change.

## Confirmed deployment profile

| Input             | Current value                              | Evidence boundary                                                 |
| ----------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| AWS Region        | `us-east-1`                                | Owner supplied on 2026-09-09; no account/API verification         |
| AWS account       | Existing personal account                  | Owner supplied                                                    |
| AWS plan          | Free Plan                                  | Owner supplied                                                    |
| Credit            | USD 160, 67 days remaining                 | Owner supplied; balance and expiry are time-sensitive             |
| Account security  | MFA enabled                                | Owner supplied; protected principal/device/recovery not inspected |
| Cost notification | Billing alerts enabled, email channel      | Owner supplied; thresholds, recipient, and delivery not inspected |
| Public access     | Public personal demo                       | Accepted under ADR 0013                                           |
| Data              | Synthetic/non-sensitive and wipeable only  | Accepted under ADR 0013                                           |
| Domain            | None; generated CloudFront domain selected | Accepted under ADR 0013; creates the origin TLS blocker below     |
| Traffic           | Demo-only; no capacity commitment          | Accepted under ADR 0013                                           |
| Payments          | Razorpay Test Mode only                    | No real money; Live Mode prohibited                               |
| AI/RAG/workflows  | Off initially                              | Separate capability gates remain required                         |
| GitHub            | Public repository on GitHub Free           | Owner supplied; settings not inspected through GitHub APIs        |

## Proposed delivery gates

Each gate needs its own explicit approval. Approval of one does not imply any later gate.

| Gate  | Proposed scope                                                           | Cloud/account mutation                    | Ready to request?                                                                       |
| ----- | ------------------------------------------------------------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| 10G-1 | Repository-only pull-request quality workflow using current dependencies | None                                      | Approved, but blocked by release and exact-patch setup-node findings                    |
| 10G-2 | Repository-only security workflow and exact scanner/tool review          | None                                      | Partly; CodeQL can be proposed, but container/Python/DAST tools still need exact review |
| 10G-3 | GitHub ruleset and `staging`/`demo` environment settings                 | GitHub settings only                      | Only after workflows pass on a branch                                                   |
| 10H-1 | Repository-only CloudFormation templates and validation                  | None                                      | No; first resolve origin TLS and re-price the topology                                  |
| 10H-2 | AWS OIDC/IAM/budget/artifact bootstrap                                   | AWS account changes                       | No                                                                                      |
| 10H-3 | Ephemeral `staging` provision, test, and teardown                        | Creates usage-priced AWS resources        | No                                                                                      |
| 10H-4 | Exact immutable demo release                                             | Creates/updates AWS resources and deploys | No; final release gates remain open                                                     |

## CI proposal

### Workflow boundary

The first implementation should add only a non-deploying `.github/workflows/ci.yml`. It should run
for pull requests and pushes to `main`, cancel superseded branch runs, use `ubuntu-24.04`, and grant
only `contents: read`. It must not use `pull_request_target`, request an AWS OIDC token, receive
provider/cloud secrets, call live providers, publish an image, or deploy anything.

The job matrix should match the repository's exact runtime boundaries:

- JavaScript uses Node `24.19.0`, the committed npm lockfile, and the current workspace scripts.
- Python uses `3.13.15` and the committed Linux lock file. Online AI/provider tests remain off.
- MySQL uses the already approved exact Batch 10C/10E image digest and disposable synthetic
  credentials/data. CI credentials are generated for the run and never refer to a real database.
- Caches are lock-keyed. Fork pull requests may restore safe public caches but may not write a
  privileged cache or consume a trusted artifact.
- Uploaded diagnostic artifacts contain no secrets or database contents and expire after three
  days. Routine success runs should upload no artifact.

### Proposed job graph

```text
metadata / lock verification
  |-- JavaScript lint + format + Prisma validation
  |-- API tests + coverage against disposable MySQL
  |-- web tests + coverage + production build
  |-- Python Ruff + tests + coverage + offline evaluations
  `-- migration fresh-install + upgrade/drift verification
              |
              v
        quality result (no publish/deploy)

security report (separate, zero critical/high threshold)
  |-- npm audit / Prisma path
  |-- CodeQL JavaScript + Python
  |-- container scan/SBOM after exact scanner approval
  `-- secret and dependency checks after exact tool approval
              |
              v
      release stays disabled while any gate is red
```

The quality result may become a required merge check after it is stable. The security report must
continue to show the existing findings and use a zero-critical/high release threshold. Until those
findings are fixed, it may remain visibly red without being used to represent the repository as
release-ready. No waiver, VEX, suppression, severity downgrade, or residual acceptance is proposed.

### Existing commands to compose

The workflow should orchestrate existing repository commands rather than add a new application
dependency:

- `npm ci --workspaces --include-workspace-root`
- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run test:coverage`
- `npm run build`
- `npm run db:validate`
- the existing migration deploy/status checks against disposable MySQL
- Python locked-environment install, Ruff, pytest/coverage, and the existing offline evaluations
- the existing container verification script only after a compatible GitHub-hosted-runner path is
  proven and the current security findings are resolved

The implementation review must inspect exact script names and environment values again rather than
copying this list blindly. Provider credentials, Razorpay Live keys, customer data, and AWS values
are forbidden in CI.

### Exact candidate GitHub Actions reviewed

These immutable commits were resolved from the official repositories on 2026-09-09. They are
candidates, not authorized dependencies. Tags must be rechecked for security advisories and
publisher authenticity immediately before a future implementation approval.

| Action tag                                     | Immutable commit                           | Proposed use                               | License    |
| ---------------------------------------------- | ------------------------------------------ | ------------------------------------------ | ---------- |
| `actions/checkout@v7.0.1`                      | `3d3c42e5aac5ba805825da76410c181273ba90b1` | Checkout                                   | MIT        |
| `actions/setup-node@v7.0.0`                    | `820762786026740c76f36085b0efc47a31fe5020` | **Blocked:** vulnerable bundled dependency | MIT        |
| `actions/setup-python@v7.0.0`                  | `5fda3b95a4ea91299a34e894583c3862153e4b97` | Exact Python runtime                       | MIT        |
| `actions/upload-artifact@v7.0.1`               | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` | Failure evidence only                      | MIT        |
| `github/codeql-action@v4.37.9`                 | `a35ac6e6798d72df5475948b28efb89edc2e19ca` | JavaScript/Python SAST                     | MIT        |
| `docker/setup-buildx-action@v4.3.0`            | `37fe631027851001ddb9b187196cc803df7f5f0e` | Deferred release build                     | Apache-2.0 |
| `docker/build-push-action@v7.3.0`              | `53b7df96c91f9c12dcc8a07bcb9ccacbed38856a` | Deferred build/push by digest              | Apache-2.0 |
| `actions/attest@v4.2.2`                        | `1e69f48acb82d1966a394da916b4c1698aa569d6` | Deferred provenance attestation            | MIT        |
| `aws-actions/configure-aws-credentials@v6.2.4` | `cbe3b392738ccf3f987d68400dafcf4b0624a56c` | Deferred AWS OIDC session                  | MIT        |
| `aws-actions/amazon-ecr-login@v2.1.7`          | `aded0d722166a37980e030aa969dda0bfe6b6947` | Deferred ECR authentication                | MIT        |

Only checkout, setup-node, setup-python, and failure-only upload-artifact are candidates for 10G-1.
CodeQL needs a separate workflow permission review. Docker, attestation, and AWS actions belong to
later gates and must not be included in the first implementation batch.

### 10G-1 pre-implementation advisory recheck

The 2026-09-10 read-only recheck resolved all four official tags to the same proposed commits.
GitHub's official `actions/setup-node` issue 1596, however, records that `v7.0.0` bundles
`brace-expansion` `1.1.13`, `2.1.1`, and `5.0.6`. Those versions fall below the patched floors in
both high-severity GitHub-reviewed advisories:

- `GHSA-3jxr-9vmj-r5cp` / `CVE-2026-13149`: exponential-time denial of service;
- `GHSA-mh99-v99m-4gvg` / `CVE-2026-14257`: unbounded expansion causing an out-of-memory crash.

Upstream pull request 1599 rebuilt the action bundles with patched `brace-expansion@5.0.8` and was
merged to `main` on 2026-07-29. As of this recheck, `git ls-remote` exposes only `v7` and `v7.0.0`,
and both still resolve to blocked commit `820762786026740c76f36085b0efc47a31fe5020`. Pinning an
untagged branch or merge commit was not part of the approval and would require a new exact
publisher, bundle, license, behavior, and advisory review.

10G-1 therefore stops before implementation. No exploitability waiver is inferred from the
workflow's expected inputs, and no replacement runtime/bootstrap method is substituted silently.
At that pre-implementation gate, the preferred trigger was an official patched `setup-node`
release; a proposal-only review of the exact merged upstream commit required separate
authorization. The owner later supplied that authorization, and its result follows.

### 10G-1 exact upstream patch review

The separately authorized proposal-only review resolved PR 1599's merged commit as
`e51e5fe84fc33b4c73ebe40526b2694712b5b858`. GitHub reports a valid signature and 223 passing PR
checks. Its `action.yml` and MIT `LICENSE` blobs match `v7.0.0`; the nine-file patch changes the npm
manifest/lock, third-party license metadata, and both compiled action bundles. The resulting tree
is also seven commits ahead of `v7.0.0`, so it includes an earlier Node-install verification and
manifest-retry behavior change plus an `@actions/cache` update.

The candidate pins `brace-expansion@5.0.8`. GitHub-reviewed
`GHSA-rgw5-rvv9-x895` / `CVE-2026-69152` affects `5.0.8` and is patched in `5.0.9`. A fresh
no-install audit reports `0C/2H/1M` for production dependencies and `0C/3H/2M` for the complete
lock. Both compiled bundles contain the affected implementation. The exact commit is therefore
rejected, not approved as a substitution. Full evidence and the future recheck gate are in
`PHASE-10-BATCH-10G-1-SETUP-NODE-PATCH-REVIEW.md`.

### GitHub repository controls

After CI passes, a separate settings-only change should propose a ruleset for `main`: pull requests,
required passing quality checks, linear history, blocked force-push/deletion, and no bypass. The
single-owner repository should initially require zero approving peer reviews because GitHub does
not provide independent self-review of a pull request. This is an explicit separation-of-duties
limitation, not a claim of peer review.

Create `staging` and `demo` GitHub environments only with a separate approval. Deployment must be
manual, use an exact image digest input, and have environment-scoped non-secret variables and
secrets. If the owner is the only reviewer, do not enable GitHub's “prevent self-review” setting;
doing so can make the environment undeployable. Add an independent reviewer and enable that
setting before a multi-maintainer or commercial release.

Standard GitHub-hosted runners are currently available without Actions-minute charges for public
repositories, but artifact storage and third-party services can still have limits or costs. Do not
use larger runners, self-hosted runners, or long artifact retention under this proposal.

## Deferred release and deployment design

After every release-security gate is green, the release workflow would build once from a protected
commit, attest the artifacts, push immutable ECR images, and record image digests. It would never
deploy a mutable tag or rebuild during deployment. The deployment workflow would accept only those
digests, run a one-off migration task, update the ECS service, wait for health, smoke test the
generated public URL, and roll back application tasks on failure. Schema changes must remain
forward/backward compatible because an application rollback cannot undo a destructive migration.

OIDC replaces long-lived AWS access keys. Before creating a trust policy, run a separately approved
diagnostic workflow that requests an ID token, locally decodes only whitelisted non-secret claims,
and records `iss`, `aud`, `sub`, repository ID, and repository-owner ID without logging the token.
GitHub/AWS introduced immutable repository-identity claim suffixes for applicable newer
repositories; OpsPilot's actual claim must be observed rather than inferred from repository age.
The future trust policy must require audience `sts.amazonaws.com`, the exact protected environment
subject, and immutable repository identifiers when present.

Use distinct least-privilege roles for artifact publication, staging deployment, and demo
deployment. A deployment role must not edit its own IAM trust or policy, budgets, organization,
billing, DNS, or unrelated stacks. CloudFormation receives a scoped execution role rather than
administrator access.

## Proposed AWS topology for `us-east-1`

The accepted service direction remains AWS-native and single-region, but the dynamic portion is
now proposed as ephemeral because of the finite credit window.

```text
Viewer HTTPS
  |
  v
CloudFront generated domain + WAF
  |-- static --> private S3 web bucket through Origin Access Control
  `-- API/WebSocket --> CloudFront VPC origin --> internal ALB
                                                |
                                                v
                                     one private ECS/Fargate task
                                      |-- Node API :4000
                                      `-- Node worker
                                                |
                                                v
                                      private RDS MySQL 8.4

Private task egress without NAT for the core demo
  |-- ECR API/DKR interface endpoints
  |-- CloudWatch Logs interface endpoint
  |-- Secrets Manager interface endpoint
  `-- S3 gateway endpoint
```

ADR 0013 currently says that the FastAPI AI sidecar is co-located in the initial task. This cost
review proposes an explicit future amendment: omit that container entirely while every AI feature
is disabled, then add it to the same task under a later AI gate to preserve the accepted loopback
contract. That amendment is not accepted by this proposal, so the depicted reduced task must not be
implemented until the owner decides it. Groq, Qdrant, document/RAG, and LangGraph resources are
excluded. Razorpay Test Mode external delivery is also excluded from the no-NAT core stack. If a
later hosted Test Mode smoke needs public egress, use a separately approved, time-bounded egress
window and remove its NAT resources immediately afterward.

The demo uses one task and one database Availability Zone, contains only wipeable synthetic data,
and makes no high-availability claim. Staging and demo dynamic stacks must never run simultaneously
under the current credit envelope.

### Blocking origin TLS decision

CloudFront VPC origins can privately reach an internal ALB. That solves public origin exposure but
does not, by itself, establish OpsPilot's required certificate-validated application-layer TLS to
the ALB. For HTTPS custom origins, CloudFront requires a certificate from a trusted CA whose name
matches the configured origin domain. The generated `*.cloudfront.net` viewer name cannot be used
as an ALB origin certificate, and an ACM public certificate cannot be issued for an AWS-owned ALB
DNS name.

Consequently, none of these paths is silently accepted:

- CloudFront-to-ALB HTTP, even over private AWS networking: fails the accepted encryption-in-transit
  criterion.
- A public ALB restricted by a CloudFront header: still fails origin TLS without a matching domain
  certificate and increases origin exposure.
- A self-signed or private-CA origin certificate: CloudFront does not accept it as the required
  publicly trusted custom-origin certificate.
- Purchasing/registering a domain: conflicts with the current no-domain/no-paid-spend input and
  requires a new owner decision.
- Replacing the API/Socket.IO architecture with API Gateway, Lambda, or another generated HTTPS
  service: a material application and WebSocket architecture change requiring its own compatibility,
  cost, and security proposal.

**No dynamic AWS infrastructure implementation or provisioning should be approved until this
decision is resolved.** The recommended secure option is a separately owned domain plus an ACM
certificate, but it is not authorized and may require non-credit spend. If the owner keeps the
no-domain rule, a separate re-architecture study is required.

The subsequently authorized 2026-09-11 proposal-only study is recorded in
`PHASE-10-NO-DOMAIN-STRICT-HTTPS-ALTERNATIVES.md`. It found no compatible drop-in replacement. A
CloudFront/API Gateway/Lambda re-platform was retained only for a separately authorized detailed
compatibility and threat-model review. That review is now complete in
`PHASE-10-API-GATEWAY-LAMBDA-COMPATIBILITY-PROPOSAL.md` and
`../security/PHASE-10-API-GATEWAY-LAMBDA-THREAT-MODEL.md`; it found the candidate no-go with all
fifteen findings open. This does not resolve the blocker or authorize templates, implementation,
account changes, provisioning, deployment, HTTP to an origin, or any finding
acceptance/suppression.

## Proposed CloudFormation stack boundaries

After the TLS decision, repository-only infrastructure should use authored CloudFormation rather
than unreviewed console clicks or a new IaC dependency. No template is created by this proposal.

| Stack                           | Proposed resources                                                                      | Lifecycle                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `opspilot-bootstrap`            | GitHub OIDC provider, scoped roles, SNS/Budget controls, CloudFormation execution roles | One-time; account-level review                                 |
| `opspilot-artifacts`            | Immutable ECR repositories, scan/lifecycle policies                                     | Retained only while approved artifacts are needed              |
| `opspilot-edge-static`          | Private S3 web bucket, OAC, CloudFront, WAF after exact rule review                     | May persist only after cost/TLS gate                           |
| `opspilot-staging-network-data` | VPC, subnets, endpoints, security groups, internal ALB, RDS, secrets                    | Ephemeral; synthetic data; hard expiry tag                     |
| `opspilot-staging-compute`      | ECS cluster/service/task, migration task, logs, alarms, autoscaling disabled            | Ephemeral; destroyed with staging                              |
| `opspilot-demo-*`               | Same logical boundaries with isolated names, roles, secrets, keys, and data             | Created only after staging teardown and exact release approval |

Every resource should carry `Project=OpsPilot`, `Environment`, `ManagedBy=CloudFormation`, `Owner`,
`DataClass=synthetic`, and an ISO-8601 `ExpiresAt` tag where supported. Names and ARNs use parameters;
account IDs are not committed. Secret values never enter template parameters, outputs, GitHub
variables, logs, or stack events. CloudFormation uses Secrets Manager dynamic references or runtime
task retrieval.

Changes use reviewed change sets. Destructive replacements, IAM changes, public access, and cost-
increasing changes must be highlighted before execution. Termination protection is appropriate for
retained bootstrap/artifact stacks, but not for an intentionally disposable staging stack. The
staging database uses deletion protection off and no final snapshot because it contains only
synthetic wipeable data; a retained demo database would need a new lifecycle, backup, and deletion
decision.

### Network and security controls

- One VPC in `us-east-1`; at least two subnet definitions allow future growth, but the initial
  database and task remain explicitly Single-AZ to control demo cost.
- Internal ALB reachable only through the CloudFront VPC origin service-managed path; ECS ingress
  only from the ALB security group; RDS ingress only from the ECS task security group.
- No public IP on ECS or RDS and no public S3 access. S3 Block Public Access remains enabled.
- No always-on NAT gateway. Use interface endpoints for ECR API/DKR, CloudWatch Logs, and Secrets
  Manager plus the free S3 gateway endpoint. Verify DNS, policies, endpoint security groups, and
  per-AZ hourly costs before creation.
- WAF starts with a separately reviewed minimal rule set because each rule has cost and false-
  positive risk. Application authorization, CSRF, validation, rate limits, and idempotency remain
  authoritative.
- RDS MySQL uses an exact `us-east-1` engine version discovered immediately before implementation,
  not a floating “latest” value. It must be compatible with the current Prisma client, private,
  storage-encrypted, TLS certificate-validated, backed up only as long as the approved lifecycle
  requires, and exercised through a timed restore before release.
- CloudWatch log groups use short explicit retention and redaction. Email alarm destinations must
  be confirmed from the account without placing the address in Git.

## Cost and teardown policy

“Free Plan” means eligible usage can consume promotional credits; it does not make Fargate, ALB,
RDS, VPC interface endpoints, WAF, Secrets Manager, KMS, logs, public IPv4 addresses, snapshots, or
data transfer permanently free. Credits and plan eligibility are time-limited, and upgrading the
account can change the billing boundary.

Official public prices illustrate why an always-on design is rejected: an ALB has hourly and LCU
charges; one NAT gateway in `us-east-1` is listed at USD 0.045/hour before processing and public IPv4
cost; interface endpoints are commonly USD 0.01 per endpoint-AZ-hour before data; WAF starts with
web-ACL/rule/request charges; Secrets Manager charges per secret; and customer-managed KMS keys
have a monthly charge. RDS and Fargate add compute/storage charges. These are examples, not a quote.

Immediately before a later provisioning request, the owner must inspect the Billing and Cost
Management console and the team must prepare an AWS Pricing Calculator estimate for the exact
template, region, hours, storage, logs, and traffic. Proposed operating limits are:

- Never upgrade from the Free Plan, join AWS Organizations/Control Tower, purchase Savings Plans,
  reserve capacity, register a domain, or enable a paid support plan under this authorization.
- Keep only one dynamic environment at a time. Default staging duration is at most eight hours;
  any extension requires a fresh cost check.
- Require an `ExpiresAt` value and a teardown step in the runbook. Budget alerts are not real-time
  circuit breakers, so the owner must verify stack deletion and the next day's Cost Explorer usage.
- Before any future resource creation, verify the reported credit balance/expiry again and keep a
  reserve for teardown logs, snapshots, and delayed billing records.
- After teardown, verify ECS services/tasks, RDS instances/snapshots/backups, ALBs, VPC endpoints,
  NAT/public IPv4, ECR images, CloudWatch logs, Secrets Manager secrets, KMS keys, S3 versions,
  CloudFront/WAF, and orphaned network interfaces. Retained resources must be explicitly listed.

## Configuration and secret inventory

The future design needs names and ownership, not values, for the following boundaries:

| Location            | Non-secret configuration                                           | Secrets                                                                                      |
| ------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| GitHub repository   | Region, stack names, ECR repository names, workflow concurrency    | None                                                                                         |
| GitHub environment  | Approved role ARN, exact environment identifier                    | No long-lived AWS key; any provider secret remains environment-scoped                        |
| AWS Secrets Manager | Secret ARN/name only in templates/task definitions                 | Database password, app signing/encryption material, later approved provider test credentials |
| ECS task            | Port, feature flags off, timeouts, log level, generated public URL | Injected at runtime through task role; never in image/task output                            |
| RDS                 | Engine/minor, class, storage, backup window, CA identifier         | Master/app credentials stored and rotated through the approved path                          |

The initial stack must not contain Groq, Qdrant, live Razorpay, customer, or non-synthetic support
secrets. Razorpay Test Mode values are added only for a separately approved external smoke window.

## Validation and rollback evidence required before deployment

A later ephemeral staging run must produce redacted evidence for template validation/change sets,
least-privilege IAM simulation, migration fresh install and upgrade, RDS TLS validation, container
digests and attestations, health/shutdown, CloudFront static/API/WebSocket behavior, WAF behavior,
synthetic critical journeys, log/metric/alarm delivery, database backup/restore, application
rollback, failed migration behavior, and complete teardown/cost inspection.

Release remains blocked unless all container/dependency scans report zero critical/high findings.
The owner must separately approve the exact commit, image digests, change sets, price estimate,
planned runtime window, and rollback/teardown commands. A successful staging run is not permission
to retain it or create the demo stack.

## What the owner should do now

Do not create, change, or delete anything in AWS or GitHub for this proposal. Keep the AWS account
on the Free Plan, protect MFA/recovery details, and do not share credentials, access keys,
billing screenshots, or secret values in chat or the repository.

10G-1 is approved but cannot be implemented with its exact action set. Both the tagged release and
the separately reviewed PR 1599 merge commit fail the current no-residual finding gate. The
recommended owner action is to wait for an official patched `setup-node` release and then authorize
a new exact release review. Origin TLS, release-security findings, and exact pricing must still be
resolved before any CloudFormation implementation or AWS provisioning approval.

If the owner wants that next repository-only step, the intentionally narrow approval text is:

> I approve implementing Batch 10G-1 repository-only pull-request quality CI using only the exact
> checkout, setup-node, setup-python, and upload-artifact commits in this proposal and existing
> repository dependencies. Do not configure GitHub settings, request cloud OIDC, add another tool,
> publish an image/artifact for release, implement CloudFormation, access AWS, provision, deploy, or
> accept/suppress any finding.

That earlier approval text has now been supplied, but implementation is paused by the new finding.
It must not be repeated to bypass the stop condition.

The earlier proposal-only exact-commit review text was supplied and completed. It must not be reused
as implementation approval. A later release or upstream commit requires a new exact, separately
authorized review.

## Official references reviewed

- [AWS Free Plan FAQ](https://aws.amazon.com/free/free-tier-faqs/)
- [Services supported by the AWS Free Plan](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html)
- [Amazon ECS pricing](https://aws.amazon.com/ecs/pricing/)
- [AWS Fargate pricing](https://aws.amazon.com/fargate/pricing/)
- [Elastic Load Balancing pricing](https://aws.amazon.com/elasticloadbalancing/pricing/)
- [Amazon VPC pricing](https://aws.amazon.com/vpc/pricing/)
- [AWS PrivateLink pricing](https://aws.amazon.com/privatelink/pricing/)
- [AWS WAF pricing](https://aws.amazon.com/waf/pricing/)
- [AWS Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/)
- [AWS KMS pricing](https://aws.amazon.com/kms/pricing/)
- [Amazon CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)
- [Amazon RDS Free Tier behavior](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Welcome.html#Welcome.Concepts.FreeTier)
- [CloudFront VPC origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html)
- [CloudFront HTTPS to custom origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-https-cloudfront-to-custom-origin.html)
- [CloudFront certificate requirements](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html)
- [CloudFormation change sets](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets.html)
- [CloudFormation termination protection](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-protect-stacks.html)
- [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [GitHub Actions billing and usage](https://docs.github.com/en/actions/concepts/billing-and-usage)
- [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [GitHub repository rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository)
- [GitHub Actions OIDC for AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)
- [AWS credentials action OIDC guidance](https://github.com/aws-actions/configure-aws-credentials)
- [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
- [setup-node bundled dependency finding](https://github.com/actions/setup-node/issues/1596)
- [setup-node upstream patch](https://github.com/actions/setup-node/pull/1599)
- [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp)
- [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg)
- [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895)
