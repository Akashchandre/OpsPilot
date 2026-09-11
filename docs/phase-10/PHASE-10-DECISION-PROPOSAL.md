# Phase 10 Production Readiness Decision Proposal

## Status

**ACCEPTED FOR CONTROLLED PHASE 10 REPOSITORY IMPLEMENTATION.** On 2026-09-07 the user first
instructed OpsPilot to begin Phase 10 if Phase 9 was complete and then explicitly answered
`approved` to the complete baseline and threat-model approval request. ADR 0013 records the
accepted scope. This acceptance does not authorize a dependency installation, cloud account or
resource change, provider purchase, use of real customer/regulated data, production AI enablement,
live payment activation, or deployment; each retains its separate gate.

The user also clarified that OpsPilot is a personal project and that a deployed build may continue
to use Razorpay Test Mode. This proposal therefore treats the initial target as a personal
production-configured demo, not a commercial production payment system. `NODE_ENV=production` may
be used for hardened runtime behavior while all payment screens and operational evidence remain
explicitly `TEST MODE — NO REAL MONEY`. Razorpay Live Mode remains prohibited.

The user has selected public access, AWS, the generated CloudFront domain, Free Tier/credits only,
demo-only traffic, email alerts, and a public repository on GitHub Free. On 2026-09-09 the owner
selected `us-east-1` and reported Free Plan status, USD 160 of credit with 67 days remaining, root
MFA enabled, and billing alerts enabled. These are owner-supplied facts and were not independently
verified through AWS. The later proposal-only CI/CD and infrastructure review is recorded in
`docs/phase-10/PHASE-10-CI-CD-AWS-INFRASTRUCTURE-PROPOSAL.md`; it authorizes no implementation or
provisioning.

## Accepted outcome

Phase 10 should deliver a reproducible, security-reviewed release path in five controlled gates:

1. Approve the production architecture, accounts, data policy, recovery targets, test gates, and
   launch scope.
2. Add container packaging and pull-request CI using only local or ephemeral synthetic services.
3. Provision an isolated production-like staging environment and prove deploy/migrate/smoke/
   rollback behavior there.
4. Close production data, payment, AI, security, performance, observability, backup, and incident
   blockers and run the recorded exercises.
5. Require a separate explicit production-release approval for an exact immutable artifact digest.

Passing an earlier gate never implicitly authorizes a later one.

## Verified starting point

### Phase 9 completion

- Phase 9 is explicitly accepted for repository/development and committed on `main` and
  `origin/main` as `ccfbd88`.
- Its final evidence records 209 API, 53 web, and 165 routine Python tests passing with all existing
  coverage, lint, format, schema, build, migration, audit, dependency, offline-evaluation, signed
  smoke, whitespace, and credential gates passing.
- The only current worktree item is the pre-existing untracked `phase8-ui-test-policy.txt`; Phase 10
  must not adopt, edit, delete, or commit it without separate instruction.

### Current production-readiness gaps

| Area                 | Current state                                                                                                                                                | Phase 10 requirement                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Containers           | No Dockerfiles, Compose topology, or container checks                                                                                                        | Build minimal non-root API/worker/AI images with pinned bases and health/shutdown tests                                                     |
| CI/CD                | No `.github/workflows` or release automation                                                                                                                 | Add least-privilege PR, release, staging, and production workflows                                                                          |
| Infrastructure       | No infrastructure-as-code or approved cloud topology                                                                                                         | Select provider/region/accounts and add reviewed reproducible infrastructure                                                                |
| E2E/accessibility    | Unit/integration coverage is strong; no browser E2E suite                                                                                                    | Add critical journey, browser, accessibility, and failure-path coverage                                                                     |
| Production MySQL     | Local MySQL only; remote TLS is intentionally not assumed                                                                                                    | Add private TLS-enforced managed MySQL, migrations, backups, PITR, restore proof, and monitoring                                            |
| Multi-instance state | Several rate, connection, replay, and concurrency controls are process-local                                                                                 | Select a shared/edge policy or explicitly accept a single-instance availability limit                                                       |
| Documents/RAG        | Encrypted local filesystem and local Qdrant are rejected in production                                                                                       | Add approved object/vector adapters, IAM/keys, deletion, backup, restore, and reconciliation                                                |
| Workflows            | SQLite checkpoints and loopback-only topology are rejected in production                                                                                     | Add an approved durable checkpointer and prove version/resume/delete/recovery behavior                                                      |
| Payments             | Repository Test Mode path passes; external delivery matrix and Phase 4 acceptance remain incomplete; the user selected Test Mode for the personal deployment | Add an unmistakable demo/Test Mode label and complete a bounded hosted Test Mode smoke; never represent the deployment as taking real money |
| AI governance        | Development Groq/ZDR gates pass; production legal/privacy/network/operations review is absent                                                                | Approve production data classes, subprocessors, retention, budgets, SLOs, alerts, and kill switches before enablement                       |
| Secrets/keys         | Safe environment validation exists; several encryption/HMAC paths support only one active key                                                                | Add secret-manager ownership and tested rotation/old-key recovery procedures or compatible key-ring support                                 |
| Observability        | Structured redacted logs and request IDs exist; no hosted metrics, dashboards, alerts, or on-call                                                            | Define service indicators, dashboards, alerts, owners, escalation, retention, and cost controls                                             |
| Security findings    | Seven known transitive npm advisories were retained at Phase 9 review                                                                                        | Re-audit, remediate where safe, or record owner/expiry/compensating-control acceptance                                                      |
| Data governance      | Jurisdiction, retention, erasure, legal hold, and production backup policy are unresolved                                                                    | Obtain business/legal decisions and encode/test the resulting lifecycle policy                                                              |

## Recommended launch strategy

Use a staged full-platform program, but do not enable every feature on the first deployed demo.

### Stage A — core staging

Package and deploy the web, API, worker, MySQL, job, notification, support, reporting, and audit
boundaries to an isolated staging environment with synthetic data. Payment stays in Razorpay Test
Mode. Groq, documents, RAG, and LangGraph workflows stay disabled except in explicit synthetic
evaluation jobs.

### Stage B — core personal demo readiness

Prove production-like behavior, migrations, backup/restore, monitoring, load, security, rollback,
and incident response in proportion to the selected demo profile. Razorpay remains in Test Mode,
and the web UI, checkout, runbook, and release metadata must say that no real payment is accepted. A
later commercial launch would reopen the Live Mode merchant, provider, privacy, availability, and
operations decisions.

### Stage C — production AI/document enablement

After the production privacy/subprocessor/data-retention review, add the approved S3/Qdrant/
checkpoint topology and enable AI capabilities progressively: stateless assistant, document Q&A,
business brief, then support reply workflow. Each enablement uses a separate flag, canary, budget,
alert, rollback, and explicit approval. Non-synthetic support data is last because it has the
highest data sensitivity.

This sequence preserves a path to the complete product without making unresolved payment or AI
production decisions prerequisites for container and CI work.

## Selected AWS design target

AWS is the selected design target and an account exists. The selected region is `us-east-1`; Free
Plan status, USD 160 of credit, and 67 days remaining are owner-reported rather than independently
verified. This diagram is not permission to create resources. The 2026-09-09 proposal-only review
also found that the generated-domain topology cannot yet satisfy strict CloudFront-to-ALB TLS
without an owned domain/certificate or a separately accepted re-architecture.

```text
Browser
  |
  v
AWS-generated CloudFront HTTPS domain + WAF (one public origin)
  |-- default/static --> private S3 web bucket through Origin Access Control
  |-- /api/v1/* -----> Application Load Balancer --> ECS Fargate application tasks
  `-- /socket.io/* --> cache-disabled WebSocket behavior --^

ECS application task (private subnet, no public IP)
  |-- Node API container :4000 (only ALB-reachable container)
  |-- Node worker container
  `-- FastAPI AI sidecar :8000 (task-local only; never public)
          |
          | outbound only when approved
          +--> Groq HTTPS
          `--> Qdrant Cloud HTTPS

Private data plane
  |-- RDS MySQL Single-AZ demo, TLS, KMS, automated backups/PITR
  |-- private S3 document bucket, versioning, SSE-KMS, lifecycle
  |-- shared ephemeral coordination store if multi-instance policy requires it
  `-- durable LangGraph checkpoint backend only when workflows are enabled

Operations
  |-- ECR images by digest
  |-- Secrets Manager + KMS + task roles
  |-- CloudWatch logs/metrics/alarms + EventBridge/SNS notifications
  `-- GitHub Actions OIDC deploy role, staging/production environments
```

### Topology rationale

- One CloudFront public origin avoids a cross-subdomain CSRF-cookie redesign. Static content is
  private in S3; `/api/v1/*` and `/socket.io/*` use non-caching behaviors to the ALB.
- Fargate tasks run in private subnets without public IPs. The ALB is the only inbound application
  path, and the database, AI port, worker, vector service credentials, and object bucket are never
  browser-accessible.
- API, worker, and AI are initially co-located in one ECS task because the accepted signed service
  contracts deliberately require task-local loopback communication. ECS containers in the same
  Fargate task share the task network namespace. Splitting these services later requires a new
  private TLS/mTLS and service-discovery decision.
- Staging starts with one task to validate behavior. A cost-aware personal demo may also run one
  task only after the UI/runbook records that it has no high-availability claim. A commercial or
  real-customer production profile requires at least two tasks across Availability Zones and
  closure of the process-local coordination items; it is not achieved merely by changing desired
  count.
- Images are promoted by digest. A deployment does not rebuild code, float a base tag, or fetch a
  model artifact at startup.

## Proposed infrastructure decisions

### Accounts and environments

- For this personal project, use one AWS account with isolated `staging` and `demo` stacks,
  separate roles/secrets/keys/data, mandatory cost tags, and AWS Budget alerts. Under the selected
  no-paid-spend constraint, provision staging ephemerally and tear it down before keeping a demo
  stack rather than paying for both continuously. This is weaker than account-level isolation and
  must never host unrelated sensitive workloads. Upgrade to separate accounts before a commercial
  or real-customer launch.
- ECS/Fargate, ALB, and RDS are usage-priced and may consume Free Tier credits. Do not create them
  until the account's Free Plan/service eligibility, unexpired credit balance, and expiry are
  recorded. If the credits cannot cover the accepted topology, stop instead of upgrading to paid
  usage or silently substituting a weaker architecture.
- Use separate VPCs, databases, buckets, keys, secrets, roles, vector clusters/collections, alert
  channels, and DNS names. Never copy production data into staging.
- Use CloudFormation as the initial AWS infrastructure-as-code boundary because it is AWS-native,
  retains stack state in AWS, and adds no application dependency. Qdrant resources may remain a
  documented provider-console step until a separately reviewed cross-provider IaC tool is approved.
- No long-lived AWS access key is stored in GitHub. GitHub Actions uses OIDC, a branch/environment-
  bound trust policy, and narrowly separated build, staging-deploy, and production-deploy roles.

### Web and public edge

- Private versioned S3 bucket for built web assets; CloudFront Origin Access Control always signs
  origin requests. No S3 website endpoint or public bucket policy.
- Use the generated CloudFront HTTPS domain; no Route 53 hosted zone, custom-domain registration,
  or custom DNS cutover is needed for the initial demo.
- ACM certificates, HTTPS-only viewer policy, HSTS after successful staging validation, DNS change
  rollback, WAF managed baseline rules, bounded request sizes, and rate rules that complement—not
  replace—application authorization and idempotency.
- Exact same-origin absolute `VITE_API_BASE_URL=https://<demo-domain>/api/v1`, secure host-only
  cookies, and a reviewed proxy-hop count. WebSocket cache/origin/timeout behavior receives an
  explicit smoke and reconnect-storm test.

### Application compute and registry

- Separate reproducible runtime images for the JavaScript application and Python AI service, with
  named build stages, digest-pinned official bases, deterministic dependency installs, explicit
  unprivileged users/UIDs, read-only root filesystems where compatible, dropped Linux capabilities,
  bounded temporary storage, and no shell/package manager in the final image where practical.
- Replace production use of `tsx` with the Node runtime for JavaScript entry points; keep build/test
  tools out of runtime layers.
- ECR immutable tags, scan-on-push/enhanced scanning as approved, lifecycle rules, SBOM and build
  provenance, and deployment only by digest.
- ECS rolling deployments use container and ALB health checks, minimum healthy capacity, deployment
  circuit breaker/rollback, graceful drain, and one-at-a-time database migration jobs.

### Relational data

- RDS MySQL in private subnets with an engine version proven compatible with the current Prisma
  driver, TLS certificate validation, KMS encryption, deletion protection, Multi-AZ for commercial
  production and an explicitly non-HA single-AZ option for the synthetic-data personal demo,
  automated backups/PITR, snapshot controls, Performance Insights/Enhanced Monitoring as selected,
  and no public endpoint.
- Run `prisma migrate deploy` as a one-off, audited pre-deployment task. Application tasks do not
  mutate schema at startup.
- Every migration receives fresh-install, prior-version upgrade, representative-data timing,
  mixed-version compatibility, backup-before-change, and forward-fix/rollback evidence. Destructive
  schema changes require an expand/migrate/contract sequence across releases.

### Documents and vector retrieval

- Add an S3 document-storage adapter behind the existing store boundary. Keep application-level
  authenticated encryption while also using S3 SSE-KMS, private bucket policies, versioning,
  checksum metadata, least-privilege task roles, lifecycle policy, deletion receipts, and restore/
  reindex exercises.
- Qdrant Managed Cloud in the selected AWS region is the proposed production vector service because
  it preserves the accepted Qdrant contract and provides TLS, isolated managed clusters, scoped
  keys, backups, and restoration. Provider DPA, region availability, pricing, IP restrictions,
  backup/replica plan, and deletion behavior require user approval. Self-hosted single-node Qdrant
  is not proposed for production.
- Bake the exact approved embedding model revision into the signed AI image after license and
  checksum verification. Production tasks must not download model artifacts at startup.
- MySQL metadata and encrypted S3 objects remain authoritative; the vector index is rebuildable.
  Reconciliation, complete reindex, point deletion, backup restore, and collection-version cutover
  must be rehearsed.

### Workflow checkpoints and shared coordination

- Keep production workflows disabled until a durable backend is approved and tested.
- The provisional AWS-native recommendation is DynamoDB via a separately reviewed exact pin of
  `langgraph-checkpoint-aws`, with metadata-only state, strict msgpack, encryption, point-in-time
  recovery, least-privilege table access, expiry, deletion, conformance tests, and interrupt/resume/
  version compatibility evidence. RDS PostgreSQL with the official Postgres checkpointer is the
  fallback if compatibility testing rejects DynamoDB. Production SQLite is prohibited.
- Multi-instance API rate limits, Socket.IO connection caps, and other process-local coordination
  need one accepted policy. The HA recommendation is a TLS/authenticated managed Valkey/Redis store
  with exact reviewed clients and failure-safe behavior. A single-instance launch is possible only
  with explicit availability and rate-bypass risk acceptance; it is not the recommended production
  profile.

### Secrets and key lifecycle

- Secrets Manager owns database/provider credentials and application HMAC/encryption material;
  task roles read only their exact secrets. KMS keys are separated by environment and data purpose.
- Secret values never enter CloudFormation parameters, image layers, logs, build arguments,
  GitHub variables, test fixtures, or chat. Runtime injection occurs only after task placement.
- Before production, implement or document tested dual-key/key-ring behavior for audit integrity,
  documents, workflow artifacts, Node-to-AI signing, and reverse tool signing so rotation does not
  make retained evidence or in-flight work unreadable. Revocation, drain, rollback, and old-key
  deletion need explicit timelines.

## Proposed CI/CD and release policy

### Pull-request quality workflow

Runs with read-only repository permissions, no cloud/provider secrets, no real provider calls, and
ephemeral MySQL/synthetic data:

1. Verify generated files, lock consistency, formatting, ESLint, Ruff, Prisma format/validation,
   migration history, and Git whitespace.
2. Run full API, web, and Python tests with current coverage floors; run the deterministic offline
   RAG/workflow evaluations and signed local boundary smoke.
3. Apply all migrations to an empty database and upgrade a sanitized previous-release fixture;
   verify expected schema and audit chains.
4. Build the web and all container targets, start the production-like Compose topology, and run
   health, shutdown, non-root, read-only filesystem, and critical E2E journeys.
5. Run secret scanning, dependency review, `npm audit`, a reviewed Python advisory scan, CodeQL for
   JavaScript/Python, container/SBOM scan, and infrastructure-template validation.
6. Fail for any introduced critical vulnerability, secret, migration drift, policy regression, or
   unreviewed dependency/license. Existing findings require a dated waiver with owner,
   compensating control, and expiry.

Third-party GitHub Actions are pinned to immutable commit SHAs and receive job-level minimum
permissions. Workflows never execute privileged deployment logic for untrusted fork code.

### E2E and non-functional proposal

The likely repository additions, all requiring separate dependency/tool approval, are:

| Capability              | Proposed tool boundary                                                                 | Account/secret | Version policy                      |
| ----------------------- | -------------------------------------------------------------------------------------- | -------------- | ----------------------------------- |
| Browser E2E             | Playwright with Chromium, Firefox, and WebKit                                          | None           | Exact npm pin plus browser revision |
| Accessibility           | axe integration in critical Playwright pages plus manual keyboard/screen-reader review | None           | Exact npm pin                       |
| Container scan/SBOM     | Trivy or another approved pinned scanner in CI                                         | None           | Pinned action/image digest          |
| Python dependency audit | `pip-audit` in CI only                                                                 | None           | Exact development-tool pin          |
| DAST                    | OWASP ZAP baseline against ephemeral/staging targets                                   | None           | Pinned container digest             |
| Load/soak               | k6 against synthetic staging data                                                      | None           | Pinned container/binary version     |

No tool should be installed until this catalog and its exact version/license/transitive dependency
review are approved.

### Release and deployment workflows

- `main` is protected by required quality/security checks and review. Release tags follow an
  approved semantic version format and must point to a protected commit.
- The release workflow builds each image exactly once, emits an SBOM and provenance attestation,
  pushes immutable ECR artifacts, records digests, and produces a release manifest. Staging and
  production promote the same digests.
- Staging deployment may follow an approved release candidate automatically after all gates pass.
  Production uses a GitHub `production` environment, selected tags only, required reviewer,
  prevented self-approval where the plan supports it, deployment concurrency of one, and OIDC.
- Deployment order is backup/preflight, migration task, worker/AI compatibility check, ECS rollout,
  smoke, monitored observation window, and release record. Failed health or alarms trigger the ECS
  circuit breaker/rollback. Database rollback is never assumed; use tested forward-fix or restore
  procedures based on the exact failure.

## Proposed test and acceptance gates

### Functional and security

- Retain at least 80% statement/function/line and 65% branch coverage for API/web and 80% total
  Python coverage, with changed critical modules expected to have targeted success/failure/authn/
  authz/concurrency tests rather than relying on aggregate percentages.
- E2E: register/login/logout; protected navigation; catalog/inventory; cart/checkout Test Mode
  recovery; customer/operator orders; support; reports; jobs/notifications; consent; document
  lifecycle; AI refusal/no-evidence; workflow approval/reject/cancel; kill switches.
- Prove anonymous, cross-user, role, disabled-user, CSRF/origin, ID guessing, upload, webhook,
  prompt-injection, approval-bypass, and duplicate-effect controls.
- Target WCAG 2.2 AA for released journeys and current stable Chromium/Firefox/WebKit compatibility.
- No unresolved critical vulnerability or secret. High findings must be fixed or explicitly
  accepted by the release owner with expiry and compensating control.

### Performance and reliability

- The user expects only demo traffic and no capacity commitment. Retain 25 concurrent interactive
  users, 5 API requests/second sustained for 15 minutes, a 1-hour soak, and burst/reconnect/job-
  backlog tests as a bounded verification gate, not a demand forecast or SLA. Prefer local or
  ephemeral staging execution so the test does not create unnecessary paid AWS usage.
- Preliminary core SLO proposal: 99.5% monthly public availability excluding approved maintenance,
  less than 1% server-error rate, and p95 below 750 ms for non-AI API reads at the agreed launch
  load. Payment, AI, document ingest, and workflows receive separate provider-aware indicators and
  are not hidden inside the core latency measure.
- Prove graceful task replacement, one-AZ loss, provider timeout, database failover, vector outage,
  queue backlog, WebSocket reconnect storm, secret rotation, alert delivery, and cost-kill switches.

### Recovery

- Preliminary production targets for owner approval: MySQL RPO at most 15 minutes and in-region RTO
  at most 4 hours; document/object RPO at most 24 hours and RTO at most 8 hours; vector data may be
  restored or rebuilt from authoritative data within 24 hours; workflow checkpoint RPO at most 5
  minutes and RTO at most 4 hours while affected actions remain safely paused.
- Run timed restore into an isolated environment, verify checksums/counts/audit continuity, reindex
  vectors, resume or safely cancel workflow interrupts, and demonstrate application rollback.
- Region-wide disaster recovery is initially documented and tabletop-tested, not claimed as active-
  active. A stricter regional RTO requires a separate multi-region cost/topology decision.

## Observability and incident proposal

- JSON application logs remain content-redacted and flow to environment-specific CloudWatch log
  groups with approved retention. No document text, prompt, answer, ticket message, cookie, token,
  key, payment identifier, or sensitive address enters telemetry.
- Dashboards and alarms cover ALB availability/latency/5xx, ECS desired/running/restarts/CPU/memory,
  RDS connections/latency/storage/failover, job depth/age/dead letters, WebSocket connections,
  payment webhook/reconciliation/refund failures, document/vector consistency, AI error/rate/cost/
  unknown outcomes, workflow pauses/expiry/actions, WAF/security events, backup failures, certificate
  expiry, and monthly spend.
- Every page-level alert has an owner, severity, threshold, runbook, notification target,
  deduplication, and test cadence. Warning alerts can be ticketed; paging alerts require immediate
  customer/security/data risk. The user must name the initial operator and escalation channel.
- Schedule launch-day observation, 24-hour review, 7-day review, 30-day review, and monthly restore/
  patch/cost/security checks.

## User decision status

| ID     | Decision            | Recorded status                                                                                                          | Remaining gate                                                                                 |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| P10-01 | Delivery profile    | **Selected:** public personal demo, synthetic/non-sensitive data, Razorpay Test Mode, no HA/commercial claim             | Publish and test the fictional-data/privacy/abuse notice and public rate controls              |
| P10-02 | Hosting             | **Selected:** existing personal AWS account; isolated ephemeral `staging` and retained `demo` stacks                     | Independently verify current account/credit state and exact costs before any resource creation |
| P10-03 | Region/jurisdiction | **Selected:** `us-east-1`                                                                                                | Confirm service/engine availability in that region immediately before implementation           |
| P10-04 | Domain/DNS          | **Selected but blocked:** no owned domain; generated CloudFront HTTPS viewer domain                                      | Resolve strict CloudFront-to-ALB origin TLS before infrastructure implementation               |
| P10-05 | Availability/budget | **Selected:** Free Plan/credits only; owner reports USD 160 and 67 days; single-task/single-AZ/no-HA profile             | Recheck time-sensitive balance/expiry and exact estimate; stop if ineligible or over envelope  |
| P10-06 | Traffic             | **Selected:** demo/occasional use with no capacity commitment                                                            | Retain the bounded 25-user/5-request-per-second verification gate                              |
| P10-07 | Payments            | **Selected:** Razorpay Test Mode only; no real charges                                                                   | Live Mode requires a new decision                                                              |
| P10-08 | AI launch scope     | **Selected by accepted default:** AI/RAG/workflows off initially                                                         | Each later capability needs its separate production gate                                       |
| P10-09 | Vector provider     | **Deferred:** no hosted vector service while document AI is off                                                          | Review Qdrant account/DPA/pricing only before document AI enablement                           |
| P10-10 | Checkpoints         | **Evaluation accepted:** DynamoDB candidate with PostgreSQL fallback                                                     | Exact dependency/service review before installation or resource creation                       |
| P10-11 | Data policy         | **Selected by accepted default:** synthetic/non-sensitive, wipeable demo data only                                       | Public notice, abuse response, reset schedule, and no-sensitive-data checks                    |
| P10-12 | Recovery/SLO        | **Selected by accepted default:** preliminary targets in this proposal                                                   | Verify exercises before release; no HA claim                                                   |
| P10-13 | Operations          | **Selected:** project owner is release/incident owner; owner reports MFA and billing alerts enabled; email alert channel | Inspect thresholds and prove subscription/delivery before release                              |
| P10-14 | GitHub controls     | **Selected:** public repository on GitHub Free                                                                           | Inspect/configure rulesets and protected environments after exact workflow review              |

No AWS resource creation is authorized by these selections. AWS account-state verification,
origin TLS, exact costs, later immutable image/action pins, and the exact release digest remain
separate blockers or approval gates.

## Still explicitly unapproved

- No Docker, E2E, audit, SDK, infrastructure, or checkpoint dependency installation.
- No GitHub workflow, environment, branch rule, secret, OIDC provider, or deploy key change.
- No AWS, Qdrant, Groq, Razorpay, domain, certificate, DNS, monitoring, or billing resource change.
- No production/customer data, non-synthetic support data, metered workflow evaluation, or live
  provider request.
- No deployment, migration, AI enablement, public DNS cutover, or
  claim of production readiness.
- No Phase 9 scope expansion or new product feature disguised as production work.

## Official references reviewed

- [Docker build best practices](https://docs.docker.com/build/building/best-practices/)
- [Amazon ECS Fargate task networking](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html)
- [Amazon ECS deployment circuit breaker](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html)
- [CloudFront Origin Access Control for S3](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- [Amazon RDS encryption](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html)
- [AWS Free Tier](https://aws.amazon.com/free/)
- [AWS Fargate pricing](https://aws.amazon.com/fargate/pricing/)
- [Elastic Load Balancing pricing](https://aws.amazon.com/elasticloadbalancing/pricing/)
- [Amazon RDS Free Tier behavior](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Welcome.html#Welcome.Concepts.FreeTier)
- [CloudWatch Container Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/ContainerInsights.html)
- [GitHub Actions OIDC for AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)
- [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [GitHub repository rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
- [LangGraph checkpointer integrations](https://docs.langchain.com/oss/python/integrations/checkpointers/index)
- [Qdrant Cloud security](https://qdrant.tech/documentation/cloud-security/)
- [Qdrant Cloud backups](https://qdrant.tech/documentation/cloud/backups/)
