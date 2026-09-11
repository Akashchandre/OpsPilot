# Phase 10 Production and Delivery Threat Model

## Status

**ACCEPTED AS THE PHASE 10 CONTROL BASELINE on 2026-09-07 under ADR 0013.** The user's approval
authorizes controlled repository implementation of these requirements. It does not authorize
infrastructure, dependencies, provider accounts, real customer/regulated data, production AI,
Razorpay Live Mode, or deployment; each retains its separate approval gate.

## Scope

This review covers the proposed container build and runtime boundary, GitHub Actions CI/CD, artifact
registry and provenance, AWS identity/network/compute/data services, Qdrant production retrieval,
Groq connectivity, Razorpay delivery, multi-instance coordination, secrets and keys, migrations,
backup/restore, observability, incident response, and production release approval.

It excludes new product features, broader AI tools/workflows, live payments before their separate
review, non-synthetic AI processing before approval, and any provider or topology not accepted in a
Phase 10 decision record.

## Protected assets

- Source, workflow definitions, dependency locks, container bases, release manifests, SBOMs,
  attestations, image digests, infrastructure templates, and deployment history.
- GitHub repository settings, Actions identities, OIDC trust, environment approvals, AWS accounts,
  IAM roles, task roles, KMS keys, secrets, DNS, certificates, WAF policy, and alert routes.
- Users, sessions, roles, permissions, catalog, inventory, orders, payments, support, reports,
  notifications, jobs, audit chain, documents, vectors, AI usage, workflow runs, checkpoints, and
  encrypted artifacts.
- Database/object/vector/checkpoint backups, restore credentials, logs, metrics, audit evidence,
  incident records, provider budgets, and kill switches.

## Trust boundaries

```text
Contributor/fork -> GitHub PR workflow -> build/test/scanners (no deploy identity)
Protected commit/tag -> release workflow -> attested ECR digest
Approved environment + OIDC -> narrow AWS deploy role -> migration/deployment

Internet -> generated CloudFront domain/WAF -> ALB -> ECS API container
                                           |-> task-local worker
                                           `-> task-local FastAPI

ECS task roles -> private RDS / S3 / coordination / checkpoint services
FastAPI outbound -> approved Qdrant/Groq endpoints only
Razorpay -> raw verified webhook route only
Telemetry -> redacted CloudWatch boundary -> authorized operators
```

No browser, model, document, ticket, provider response, CI pull request, or container tag is an
authorization authority. Release authority comes only from protected repository state, passing
gates, an immutable digest, a scoped environment approval, and a fresh cloud identity.

## Threats, controls, and required verification

### 1. Pull-request workflow steals secrets or deploys untrusted code

**Threat:** A fork or compromised contributor changes workflow/script/package behavior to read
secrets, obtain OIDC, poison a cache, publish an image, or deploy.

**Required controls:** PR jobs receive read-only permissions, no environment, no AWS/provider
secret, no `pull_request_target` execution of untrusted checkout, no self-hosted runner, and no
deploy role. Separate release/deploy workflows accept only protected commits/tags. Cache keys bind
to lock digests; caches never carry credentials. Review workflow changes with CODEOWNERS or an
equivalent protected-owner rule.

**Required verification:** Fork PR attempts to read secrets/request OIDC/push ECR/deploy must fail;
workflow injection corpus; cache poisoning test; permission dump contains only approved scopes;
branch/tag bypass and untrusted artifact substitution tests.

### 2. Mutable or compromised build dependency changes the artifact

**Threat:** A floating Action, base tag, registry package, install script, or model download changes
the release without a reviewed source change.

**Required controls:** Exact application dependencies and locks; Actions by immutable commit SHA;
base images and scanner images by digest; reviewed install scripts; deterministic build context;
no runtime dependency/model download; SBOM, provenance attestation, ECR immutability, and digest-
only deployment. Scheduled rebuilds surface patched bases through reviewed pull requests.

**Required verification:** Two clean builds have explainable SBOM/digest results; tag mutation does
not alter deployed digest; attestation verification; lock-drift and unexpected-network tests;
runtime image contains no source secrets, package cache, compiler, test data, or local environment.

### 3. OIDC or IAM trust grants excess cloud authority

**Threat:** Any branch, repository, workflow, or stolen token can assume a deployment role or a task
can modify unrelated infrastructure/data.

**Required controls:** Exact GitHub organization/repository/ref/environment conditions, expected
audience, short sessions, separate staging/production roles, minimum session permissions, and no
wildcard administrative policies. Separate task execution role from per-service task roles. Use
permission boundaries and organization controls where available.

**Required verification:** Wrong repository/branch/tag/environment/audience assumption failures;
policy simulation; enumerate allowed resources/actions; task-to-unrelated-secret/bucket/table
denial; CloudTrail evidence for every assumption and deployment.

### 4. Internal service or data plane becomes publicly reachable

**Threat:** RDS, worker, AI, vector, checkpoint, cache, object storage, or management endpoint is
reachable from the internet or a browser bypasses CloudFront/WAF/ALB policy.

**Required controls:** Private subnets and no public task/database/cache IP; security-group-to-
security-group rules; only ALB reaches API port; AI and worker remain task-local; private S3 plus
OAC; TLS validation to remote dependencies; explicit egress allowlisting where practical; no
diagnostic/admin route at the public edge.

**Required verification:** External port scan, AWS reachability analysis, security-group/IaC policy
tests, direct S3/ALB origin bypass tests, host/origin/proxy spoofing, WebSocket origin tests, and
prove browser cannot address internal health/tool/checkpoint/vector interfaces.

### 5. Container privilege or writable filesystem enables persistence

**Threat:** Application compromise gains root, kernel capabilities, host metadata, secret files, or
persistent executable storage.

**Required controls:** Explicit non-root UID/GID, read-only root filesystem, dropped capabilities,
no privileged mode, bounded writable temp volume, resource limits, exec disabled for routine
operations, task metadata protection through IAM, and minimal runtime images. Secrets are injected
only to the container that needs them.

**Required verification:** Image/config policy checks; `id` is non-root; writes outside approved
paths fail; capability listing is empty; worker/API/AI start and shut down cleanly under limits;
secret visibility is container-scoped.

### 6. Secret exposure or unsafe rotation causes compromise/data loss

**Threat:** A key appears in source, build arguments, image history, logs, GitHub state, task
definition, crash output, or chat; rotating a single active key breaks audits, objects, in-flight
workflows, or signatures.

**Required controls:** Secrets Manager/KMS, task roles, environment-specific key domains, redacted
configuration errors, secret scanning, no command-line secret values, and tested key-ring or drain/
cutover behavior. Retain old decrypt/verify keys only for an approved window, then destroy with
recorded dependency checks.

**Required verification:** Repository/history/image/SBOM/log/task-definition scans; rotation during
sessions, jobs, document reads, workflow interrupts, and audit verification; compromised-key drill;
old-key rollback and final deletion proof.

### 7. Migration or mixed release corrupts production data

**Threat:** A long, destructive, or partially applied migration blocks traffic, breaks old tasks,
or leaves schema/application versions incompatible; a blind rollback worsens state.

**Required controls:** One migration task, advisory deployment lock, preflight and backup,
expand/migrate/contract sequence, timing on representative data, mixed-version contract, explicit
forward-fix plan, and no application-start migration. Stop release if migration outcome is unknown.

**Required verification:** Empty install, prior-version upgrade, interrupted migration, duplicate
runner, lock timeout, old/new task overlap, failed deploy after successful migration, restore, and
forward-fix drills with row counts, constraints, checksums, and audit continuity.

### 8. Backup exists but cannot satisfy recovery or deletion policy

**Threat:** Backups are missing, corrupt, unencrypted, overly retained, cross-environment exposed,
or impossible to restore within RPO/RTO; deletion/legal-hold rules conflict.

**Required controls:** KMS-encrypted automated backups/PITR, object/vector/checkpoint backup or
rebuild policy, cross-account protection as approved, retention schedules, backup access alarms,
restore automation, deletion propagation, and legal-hold decision. Backups never enter developer
laptops or staging.

**Required verification:** Scheduled timed isolated restore; corrupt/missing snapshot scenario;
point-in-time selection; KMS loss scenario; restored access control; document delete and legal-hold
case; vector rebuild; checkpoint pause/resume/cancel; recorded RPO/RTO.

### 9. Horizontal scaling weakens rate, replay, socket, or action controls

**Threat:** Requests spread across tasks bypass per-process rate/connection limits, replay a signed
nonce, emit incomplete realtime hints, exceed AI concurrency/cost, or duplicate work/effects.

**Required controls:** Inventory every process-local control; implement approved shared state or
edge controls with atomic semantics; keep database idempotency/transactions authoritative; fail
closed for security and cost reservations; treat Socket.IO as hints only; size job leases for task
drain and failover.

**Required verification:** At least two application tasks; cross-task repeated login/API/socket/
AI/workflow requests; concurrent job claim; task death during lease/action; reconnect storm;
shared-store outage; prove no authorization bypass, negative inventory, duplicate payment/support
effect, or unbounded provider spend.

### 10. Edge caching or proxy configuration leaks personalized data

**Threat:** CloudFront caches authenticated/API responses, strips cookies/CSRF headers, misreports
client IP, accepts an untrusted forwarded chain, or breaks WebSocket authorization.

**Required controls:** No-cache API and Socket.IO behaviors; minimal explicit forwarded headers/
cookies/query strings; exact origin/host; correct trusted proxy hops; private/no-store responses;
secure host-only cookies; no cache key containing secrets.

**Required verification:** Two-user cache poisoning/leak test, CSRF/session through edge, spoofed
`X-Forwarded-For`/host/proto, logout/session revocation, WebSocket reconnect/auth expiry, and direct
origin access denial.

### 11. Payment launch loses or duplicates money

**Threat:** A personal demo is mistaken for a real payment system, Test Mode is not clearly
labelled, Live credentials are enabled without a new review, or timeout/retry/deploy behavior
corrupts demo order/payment evidence.

**Required controls:** The selected personal deployment uses Razorpay Test Mode only and displays
`TEST MODE — NO REAL MONEY` in checkout and operating documentation. Keep Live Mode prohibited until
a new commercial/live decision passes; use distinct environment credentials/webhook secrets; raw body signature,
allowlisted events, relationship/amount/currency checks, idempotency, provider recovery,
reconciliation, kill switch, and operator runbook. Never copy test evidence into live acceptance.

**Required verification:** The test-key prefix is enforced; the public UI and release record show
the Test Mode warning; hosted test success/cancel/failure, lost return, delayed/duplicate/out-of-
order/invalid webhook, capture, refund success/failure, reconciliation, rotation, provider outage,
and deploy-during-payment paths use only test evidence. Prove no Live Mode key is accepted.

### 12. Production AI, support, document, or vector data violates policy

**Threat:** Unapproved personal/support/document data reaches Groq/Qdrant, persists beyond policy,
crosses region, leaks across roles/audiences, or cannot be deleted; checkpoint state contains
content.

**Required controls:** Explicit capability-by-capability production approval; DPA/subprocessor/
region/ZDR review; data minimization; current consent and authorization; S3/Qdrant scoped keys;
metadata-only checkpoints; strict serializer; retention/deletion/reindex; provider budgets and kill
switches; support-data gate remains false until last approval.

**Required verification:** Canary data across role/audience/source states; packet/provider fixture
inspection; delete/supersede/backup propagation; cross-region configuration review; checkpoint/log/
metric scans; prompt injection/exfiltration suite; provider outage/model change/cost ceiling drills.

### 13. Monitoring leaks data or fails silently

**Threat:** Logs/metrics/traces contain content or credentials, alerts never arrive, dashboards hide
failure, or excessive alerts cause operators to ignore incidents.

**Required controls:** Allowlisted telemetry fields, sampling rules, environment separation,
retention/access controls, alarm-as-code, missing-data behavior, deduplication, severity/runbook/
owner for each alert, synthetic checks, and periodic alarm tests.

**Required verification:** Seeded secret/PII/document/prompt canary scan; alert injection for every
page-level path; missing telemetry and alert-route failure; access audit; dashboard reconciliation
against database/provider truth; alert flood exercise.

### 14. Denial of service or runaway cost exhausts the platform

**Threat:** Authentication abuse, upload floods, WebSocket storms, expensive reports, job poison,
provider requests, vector queries, logs, NAT traffic, or scanner/deploy loops exhaust capacity or
budget.

**Required controls:** WAF and application limits, bounded request/query/upload/output sizes,
timeouts/concurrency, queue backpressure/dead letters, AI daily/request ceilings, autoscaling
bounds, AWS/provider budgets and anomaly alerts, log lifecycle, and emergency feature/service kill
switches.

For the selected public personal-demo profile, show a persistent fictional-data/Test Mode notice,
keep AI/document/workflow production features off, retain public registration abuse controls, send
operational and billing alerts by confirmed email, and tear down resources before Free Plan or
credit expiry. Free Tier credits are not treated as a permanent zero-cost entitlement.

**Required verification:** Load, soak, burst, slow-client, reconnect, large-input, poison-job,
provider-429, vector-timeout, NAT/egress, log-volume, and budget alarm drills; prove core service
degrades safely when optional AI dependencies fail.

### 15. Release, rollback, or incident authority is ambiguous

**Threat:** No accountable human approves production, multiple deployments race, an incident has no
owner, rollback uses the wrong artifact, or emergency actions destroy evidence.

**Required controls:** Named release approver/incident commander, protected environment, no self-
approval where available, deployment concurrency one, exact release manifest/digests, circuit
breaker, recorded rollback/forward-fix decision tree, audit preservation, communication template,
and post-incident review.

**Required verification:** Concurrent deployment attempt; wrong tag/digest; approver unavailable;
failed health/alarm automatic rollback; database-changed incident; payment/AI kill switch; evidence
collection; tabletop with timestamps, owners, decisions, and recovery outcome.

## Release-blocking security gate

Production release remains prohibited until:

- the architecture and this threat model are accepted in an ADR;
- all critical findings and secrets are resolved and every retained high finding has an explicit
  owner, compensating control, and expiry;
- cloud/network/IAM/container/CI policy tests pass;
- migration, restore, rollback, provider-outage, alert, and kill-switch drills pass;
- payment and each enabled AI capability have their separate required approvals;
- privacy/retention/legal-hold rules, RPO/RTO, SLOs, budget, on-call, and escalation are named; and
- an exact attested release digest receives explicit production approval.
