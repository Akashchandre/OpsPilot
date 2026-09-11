# Phase 10 API Gateway/Lambda Threat Model (Proposal Only)

## Status

**Proposal-only security review — not an accepted architecture, implementation plan, waiver, or
deployment authorization.**

This review covers the least-incompatible no-domain study candidate for `us-east-1`:

- CloudFront generated HTTPS hostname for the browser-facing origin;
- S3 with origin access control for the static web application;
- regional API Gateway REST API and request-bounded Node.js Lambda functions for `/api/v1/*`;
- API Gateway WebSocket API and Lambda integrations for a native WebSocket notification channel;
- private RDS MySQL, with RDS Proxy retained as an unapproved connection-safety candidate; and
- the existing continuous job/notification worker retained on a private supervised service.

The companion compatibility review is
[`PHASE-10-API-GATEWAY-LAMBDA-COMPATIBILITY-PROPOSAL.md`](../phase-10/PHASE-10-API-GATEWAY-LAMBDA-COMPATIBILITY-PROPOSAL.md).
The accepted Phase 10 baseline remains ADR 0013. This document does not supersede it.

## Review boundary

Included:

- threats created by translating the current Express HTTP boundary into API Gateway/Lambda events;
- threats created by replacing Socket.IO with API Gateway's native WebSocket model;
- CloudFront-to-generated-origin restriction without an owned domain;
- cookie, session, CSRF, origin, payment-webhook, rate-limit, database, IAM, egress, logging, cost,
  availability, and recovery implications; and
- proof required before this candidate could be considered for implementation.

Excluded and not performed:

- code, dependency, workflow, infrastructure-template, GitHub, AWS, account, or billing changes;
- installation, provisioning, deployment, domain purchase, origin HTTP, finding acceptance,
  suppression, or waiver; and
- claims about actual account eligibility, quota, credit, or service availability. Those require
  separately authorized account verification immediately before a future cloud action.

## Security conclusion

**No-go.** The candidate has no accepted residual risk and is not ready for implementation or
deployment. A generated HTTPS endpoint solves only certificate naming. It does not preserve the
current application's security contracts.

The principal open problems are:

1. API Gateway WebSocket is not Socket.IO/Engine.IO. The browser and server protocol must change.
2. The production session cookie is scoped to `/api/v1`, while the existing Socket.IO transport
   defaults to `/socket.io/`; the real browser credential path is therefore unproved today.
3. API Gateway authorizes a WebSocket at `$connect`; session revocation during a connection needs a
   durable registry and a separate maximum-30-second enforcement path.
4. Standard CloudFront origin access control does not protect API Gateway origins. A generated
   API Gateway endpoint remains publicly routable unless a separately proved layered restriction
   is added.
5. Per-process rate limits and connection counters do not survive Lambda distribution.
6. Lambda concurrency can exhaust MySQL connections; the exact Prisma/MariaDB, transaction, TLS,
   RDS Proxy, and proxy-pinning behavior has not been demonstrated.
7. A VPC-attached Lambda needs deliberate public egress for Razorpay. The cheapest possible egress
   path is not yet proved compatible, and managed IPv4 egress can consume the stated demo budget.
8. Raw webhook bytes, multiple cookies, binary responses, source IP, timeout, retry, and duplicate
   delivery semantics all require adapter-level evidence.

No item above is accepted as residual risk.

## Assets

- user session and CSRF cookies;
- credentials, signing keys, Razorpay secrets, and database credentials;
- tenant/user authorization boundaries;
- payment order and payment-verification state;
- document and generated-output confidentiality and integrity;
- notification confidentiality, cursor integrity, and user binding;
- durable job, outbox, lease, retry, and idempotency records;
- audit and security-event integrity;
- database availability and recoverability;
- AWS account permissions, quotas, credits, and budget; and
- public application availability and the one-origin browser security boundary.

## Actors

- unauthenticated Internet client;
- authenticated user;
- malicious or compromised authenticated user;
- browser running the intended web application;
- client calling generated API Gateway endpoints directly;
- forged or replayed Razorpay webhook sender;
- compromised Lambda, worker, build artifact, dependency, or IAM principal;
- accidental operator or automation error; and
- unavailable, throttled, delayed, or partially failing AWS/database/payment dependency.

## Proposed trust boundaries

```text
Internet browser
  |
  | HTTPS/WSS; generated CloudFront hostname; cookies; Origin; CSRF
  v
CloudFront distribution
  |-- private S3 static origin via OAC
  |-- HTTPS REST origin --> regional API Gateway --> Lambda
  `-- WSS behavior -----> API Gateway WebSocket --> connect/default/disconnect Lambdas
                               |                         |
                               | management API         | VPC data access
                               v                         v
                       active connections          RDS Proxy candidate
                               ^                         |
                               | SigV4                  v
                    private continuous worker      private RDS MySQL
                               |
                               `-- HTTPS egress --> Razorpay / required public AWS endpoints
```

Each arrow is a trust boundary. CloudFront, API Gateway REST, API Gateway WebSocket, Lambda, the
worker, RDS Proxy, and RDS are separate principals/failure domains. A generated AWS hostname is not
an authorization control.

## Non-negotiable invariants

- The browser sees one HTTPS/WSS origin. No browser-to-origin HTTP is allowed.
- Generated REST and WebSocket origins must not become alternate unrestricted application entries.
- Cookie sessions remain server-side, revocable, and never become bearer credentials in URLs or
  durable connection records.
- Unsafe REST requests require an authenticated session, exact allowed `Origin`, and valid CSRF.
- Razorpay webhook verification uses the exact received bytes before JSON parsing.
- REST and committed MySQL state remain authoritative. Realtime messages are non-authoritative
  UUID/cursor hints only.
- A user never receives another user's notification, document, payment, or job state.
- WebSocket inbound business commands remain prohibited unless a new threat model explicitly
  approves them.
- Session revocation reaches every active notification connection within the accepted 30-second
  maximum.
- Durable work remains transactionally claimed, idempotent, lease-protected, retried, and
  recoverable; Lambda invocation success never substitutes for a committed database transition.
- Public request controls must work across concurrent functions and processes.
- Secrets are not embedded in images, templates, logs, URLs, connection rows, or client bundles.
- All roles have least privilege and are separable between deployment, REST execution, WebSocket
  execution, connection publishing, worker, and database-secret access.
- Account spend, concurrency, retained resources, and logs have explicit limits and alarms.

## Threat analysis

### T01 — Direct generated-origin bypass

**Threat.** A client bypasses CloudFront and calls the regional REST invoke URL or WebSocket URL,
evading edge policy, expected host/path normalization, caching rules, or request filtering.

**Required controls.** CloudFront must overwrite a high-entropy origin-verification header; REST
must reject requests without it before application processing; WebSocket `$connect` must require
the equivalent identity input; exact `Origin` and session checks remain independent. Regional WAF
or an API resource policy may add defense in depth only where the selected API product supports it.
The default endpoint must not be disabled on the assumption that a generated CloudFront hostname
can replace the custom-domain capability needed by that control.

**Proof gate.** Direct calls, missing headers, guessed headers, duplicated headers, case variants,
stale rotated values, and viewer attempts to override the protected header all fail. CloudFront
REST and WebSocket traffic continues during a controlled rotation. Until proved, AGL-03 is open.

### T02 — Origin-verification secret disclosure or confused deputy

**Threat.** The shared header leaks through logs, traces, error objects, deployment output, browser
responses, or over-broad configuration access. A caller reuses it against the public origin.

**Required controls.** Keep the value in an approved secret store; redact it everywhere; limit
read access; use independent values for REST and WebSocket if supported; rotate without outage;
reject viewer-supplied duplicates; never treat the header as user authentication.

**Proof gate.** Log and error scans find no value; least-privilege and rotation tests pass; a leaked
old value stops working. A shared secret alone is not considered equivalent to S3 OAC.

### T03 — CloudFront behavior, path, method, and cache confusion

**Threat.** Overlapping behaviors route an API request to S3, route static content to an API,
cache a personalized response, strip cookies/query strings/headers, alter WebSocket upgrade fields,
or rewrite a URI inconsistently.

**Required controls.** Exact, non-overlapping behavior precedence; no caching for authenticated API
responses; a narrow method set; an explicit origin request policy; immutable static asset caching;
and a reviewed viewer-request rewrite for the public realtime path. API error responses must not be
cached as application data.

**Proof gate.** A behavior matrix covers every public path and method, including encoded paths,
duplicate slashes, query parameters, `OPTIONS`, WebSocket upgrade, and error responses. Cache keys
never mix users or authorization state.

### T04 — Lambda event translation corrupts HTTP security semantics

**Threat.** The adapter changes raw bytes, joins duplicate headers, loses multiple `Set-Cookie`
values, mishandles base64 responses, changes query parsing, trusts a spoofable IP header, or invokes
middleware in a different order.

This is especially serious for Razorpay webhook signatures, session/CSRF cookies, binary document
downloads, `trust proxy`, rate keys, content limits, and error correlation.

**Required controls.** Select one API Gateway payload version and document its exact mapping. Raw
webhook bytes must be decoded once and signature-checked before parsing. Cookies must use the
event/response representation that preserves each value. Source IP must come only from the trusted
API Gateway request context. Binary content types, headers, and body encoding must be explicit.

**Proof gate.** Byte-for-byte signed webhook fixtures, duplicate header attacks, multiple cookies,
binary download hashes, malformed base64, source-IP spoofing, request-size boundaries, and current
middleware-order regression tests all pass. Until then AGL-11 is open.

### T05 — Session, cookie, CSRF, and Origin boundary failure

**Threat.** Cookies are absent where required, sent to the wrong endpoint, broadened unnecessarily,
or accepted cross-origin. CloudFront host/path behavior can change the assumptions behind
`Secure`, `SameSite=Lax`, cookie `Path`, CORS, CSRF, and exact `Origin` checks.

The current session cookie `Path=/api/v1` does not path-match Socket.IO's default Engine.IO path
`/socket.io/`. Tests that manually add a `Cookie` header do not establish browser behavior.

**Required controls.** Keep the public realtime handshake under a cookie-matching viewer path or
deliberately redesign cookie scope after review. Authenticate REST and WebSocket using the existing
server-side session. Retain exact-origin checking. Never put a session ID in a WebSocket URL,
subprotocol, connection record, or JavaScript-readable storage.

**Proof gate.** Real-browser tests against the proposed CloudFront paths prove cookie inclusion,
login/logout, CSRF, exact allowed origin, missing/null/hostile origins, expiry, rotation, and session
revocation. Until then AGL-02 is open.

### T06 — Socket.IO/native WebSocket protocol confusion

**Threat.** The client speaks Engine.IO framing to a plain WebSocket API, accepts an unversioned or
oversized payload, processes a forged business event, or treats a hint as authoritative state.

**Required controls.** Remove protocol ambiguity with a small versioned native message schema.
Server-to-client payloads contain only a type plus opaque notification UUID/cursor. Reject inbound
application data on `$default`; enforce message and frame limits; fetch authoritative state through
REST; bound parsing and reconnect behavior.

**Proof gate.** Engine.IO frames, unknown versions/types, malformed JSON, oversize/fragmented
messages, replayed hints, injected user IDs, and inbound commands cannot alter durable state or
cross user boundaries. Until implemented and proved, AGL-01 is open.

### T07 — Connect-only authorization and delayed revocation

**Threat.** API Gateway authorizes only at `$connect`; a revoked or expired session retains a live
connection. `$disconnect` delivery is best effort, leaving stale registry rows and quota usage.

**Required controls.** Store a durable mapping of connection ID to user ID, session ID/reference,
creation/last-seen timestamps, and state—never the raw session token. Enforce expiry and revocation
with a supervised sweeper or worker within 30 seconds. Delete stale connections after management
API `Gone` responses and periodic reconciliation. Limit connection lifetime independently of API
Gateway's maximum.

**Proof gate.** Logout, admin revocation, expiry, password/session rotation, missed `$disconnect`,
worker restart, and `Gone` races all close access within the bound. Until then AGL-05 is open.

### T08 — Cross-user notification disclosure, replay, and ordering

**Threat.** A bad registry row, stale connection ID, retry, out-of-order post, or user-controlled
identifier delivers another user's notification or causes the UI to skip authoritative state.

**Required controls.** Derive user/session identity only at authenticated connect time. The worker
selects connections by server-owned user binding. Messages contain no sensitive notification body.
Use committed database UUID/cursor values, tolerate duplication/reordering, and make REST catch-up
mandatory after connect/reconnect or a cursor gap.

**Proof gate.** Multi-user concurrency, stale/reused connection IDs, publish retry, worker crash,
out-of-order delivery, duplicate delivery, and missed-event tests show no cross-user data and
convergent REST state. AGL-06 is open.

### T09 — Connection, reconnect, and cost denial of service

**Threat.** Attackers or unstable clients create connection storms, rapid reconnect loops, idle
connections, oversized messages, or excessive management API sends. This consumes quotas, Lambda
concurrency, database capacity, connection minutes, logs, and credits.

**Required controls.** Edge/service throttles plus durable per-user/account connection accounting;
bounded exponential backoff with jitter; strict connect timeout; low inbound message allowance;
payload limits; idle policy; per-user fan-out caps; reserved concurrency/budgets; and alarms that do
not disclose secrets.

**Proof gate.** Distributed connect floods, reconnect after the 10-minute idle and two-hour maximum
connection boundaries, duplicate tabs, slow database, and publish retry stay within explicit
availability and spend limits. AGL-07, AGL-13, and AGL-14 remain open.

### T10 — Distributed rate-limit bypass

**Threat.** Current in-memory Express limits reset on cold start and are split across functions, so
an attacker fans requests across concurrent environments or source addresses.

**Required controls.** Layer coarse API Gateway/WAF throttles with an approved durable user-aware
control for sensitive endpoints. Payment, login, recovery, upload, and expensive read/write paths
need endpoint-specific limits. Application authorization and idempotency remain mandatory because
edge throttles are not identity controls.

**Proof gate.** Multi-function and multi-IP tests cannot exceed approved per-user/account/business
limits; fail-open/fail-closed behavior for control-store loss is documented and tested. AGL-07 is
open.

### T11 — Source identity, forwarded-header, and host confusion

**Threat.** An attacker supplies `X-Forwarded-For`, `Forwarded`, host, scheme, or duplicate origin
headers that the Express `trust proxy` logic or adapter mistakes for trusted API Gateway context.

**Required controls.** Construct normalized request metadata from the integration context; discard
or isolate viewer-supplied forwarding headers; define one canonical host/scheme/origin; reject
ambiguous duplicates; and cover every place request IP affects security or audit records.

**Proof gate.** Direct-origin, CloudFront, IPv4/IPv6, multi-value, and spoofed forwarding tests
produce the expected client identity and no privilege/rate-limit bypass. This forms part of AGL-11.

### T12 — MySQL connection exhaustion and RDS Proxy state pinning

**Threat.** Lambda concurrency multiplies the current connection pool, overwhelms MySQL, or pins
RDS Proxy sessions. Transaction isolation or session-state differences change correctness.

**Required controls.** One process-global client per warm environment; no per-request disconnect;
small explicitly budgeted pools; reserved concurrency based on a database connection budget;
TLS certificate validation; Secrets Manager integration; and load evidence for the exact Prisma,
MariaDB adapter, MySQL, and RDS Proxy versions. Review every transaction and session-state use for
proxy pinning.

**Proof gate.** Cold/warm bursts, serializable transactions, failures, proxy failover, secret
rotation, certificate validation, pinning metrics, and connection recovery meet explicit bounds.
Until then AGL-08 is open.

### T13 — Timeout, retry, duplicate, and partial-commit errors

**Threat.** API Gateway times out while Lambda or a downstream call continues; client retries cause
duplicate payment orders, uploads, notifications, or mutations; an invocation ends after a commit
but before the response.

**Required controls.** Function timeouts must be lower than the front-door timeout with cancellation
and bounded downstream calls. Preserve idempotency keys and database uniqueness. Keep external side
effects out of uncommitted transactions and use durable outbox/reconciliation where needed. A
timeout response is never proof that no commit occurred.

**Proof gate.** Inject timeouts before/after database commit, response loss, Razorpay latency,
duplicate invocation, Lambda termination, and retry. Results remain singular and reconcilable.
This forms part of AGL-11's integration-contract closure evidence.

### T14 — VPC egress failure and exfiltration

**Threat.** VPC attachment removes default public Internet access, breaking Razorpay calls or
WebSocket management posts. Over-broad NAT egress lets a compromised function exfiltrate secrets.
An unproved IPv6-only design silently fails against an IPv4-only dependency.

**Required controls.** Approve an explicit egress architecture and cost before implementation.
Use security groups, routing, DNS, TLS validation, endpoint policies, and least-privilege VPC
endpoints where applicable. Prove Razorpay address-family support rather than infer it. Restrict
which roles/functions need public egress.

**Proof gate.** DNS/TLS failures, unavailable egress, IPv4/IPv6 behavior, management API access,
Razorpay sandbox calls, timeout/cancellation, and exfiltration attempts behave as designed. AGL-09
is open.

### T15 — IAM and WebSocket management over-permission

**Threat.** A REST function, connect function, compromised worker, or deploy principal can read all
secrets, mutate infrastructure, connect to unintended databases, or post/disconnect arbitrary
WebSocket clients.

**Required controls.** Separate roles; resource-scoped permissions; no wildcard management API
access where a stage/API ARN can be used; database and secret access only for callers that need it;
deployment permissions separate from runtime; explicit trust policies; and no long-lived AWS keys
in GitHub.

**Proof gate.** An action/resource matrix and negative IAM tests show each principal can perform
only its required calls. Compromise of the static site or one Lambda role does not grant deployment
or account administration. This mandatory implementation gate has no residual-risk acceptance.

### T16 — Secret and sensitive-data leakage through telemetry

**Threat.** API Gateway execution/access logs, Lambda logs, worker logs, traces, or error responses
capture cookies, CSRF values, webhook signatures, protected origin headers, document content,
payment data, connection URLs, or database strings.

**Required controls.** Structured allowlist logging; header/body redaction; stable correlation IDs;
short, approved retention; encryption; least-privilege log access; no data tracing in production;
and metrics that report counts/latency rather than payloads.

**Proof gate.** Seeded canary secrets and sensitive fixtures never appear in logs, traces, alerts,
responses, or deployment output. This mandatory implementation gate has no residual-risk
acceptance.

### T17 — Lambda artifact and warm-state supply-chain risk

**Threat.** The current non-Lambda container lacks a Lambda handler/runtime interface; a hurried
adapter or rebuild introduces vulnerable dependencies, incompatible native binaries, stale
cross-request state, or an unverified image. Current unresolved image and Prisma findings remain.

**Required controls.** A separate dependency/version proposal; digest-pinned compatible base;
Lambda runtime interface and handler review; reproducible multi-architecture build; native module
and Prisma engine verification; SBOM/signature/provenance; vulnerability scanning with zero
unaccepted findings; immutable deployment; and no user-specific warm globals.

**Proof gate.** Clean rebuild, Lambda runtime tests, cold/warm isolation tests, native module load,
Prisma engine load, scans, and provenance all pass. AGL-10 and AGL-15 remain open.

### T18 — Worker, bridge, lease, and fan-out outage

**Threat.** The continuous worker or notification bridge stops, loses its lease, publishes before
commit, duplicates work, or cannot reach the management API. A Lambda rewrite could accidentally
discard the existing durability model.

**Required controls.** Keep durable work on the supervised worker for the first candidate. Preserve
database leases, heartbeat/renewal, retry/dead-letter, idempotency, transaction/outbox ordering,
and shutdown rules. Realtime publication occurs only from committed state and is recoverable by
REST catch-up. Health alarms cover stuck leases and publication lag.

**Proof gate.** Kill/restart, lease expiry, database failover, management API outage, duplicate
publish, and long backlog tests preserve durable outcomes and eventual convergence. AGL-06 and
AGL-12 remain open.

### T19 — Accidental exposure of internal AI or unsupported document paths

**Threat.** Broad proxy/adaptor routing exposes `/internal/v1/ai`, loopback-only handlers, local
filesystem paths, or development services through API Gateway. A synchronous path later exceeds
the front-door integration timeout.

**Required controls.** Public route allowlisting, not denylisting; production AI and filesystem
document features remain fail-closed; internal routes have no public API mapping; and future long
operations use an independently reviewed asynchronous contract.

**Proof gate.** Route inventory and negative tests show internal/dev paths are unreachable from
both CloudFront and direct generated endpoints. This is a mandatory route-mapping gate under
AGL-11, not an accepted residual.

### T20 — Budget depletion, quota exhaustion, and orphaned resources

**Threat.** Reconnect storms, NAT, RDS Proxy hours, WAF, logs, retained images, snapshots, or idle
services consume credits or continue billing after a demo. Free Plan eligibility is assumed rather
than verified.

**Required controls.** Pre-provision price model; account-side eligibility/credit-expiry check;
budgets and anomaly alarms; concurrency and log-retention limits; tags; a resource manifest; a
reviewed teardown/runbook; and explicit approval for every non-free recurring component.

**Proof gate.** A separately authorized disposable staging estimate covers steady state, abuse,
data transfer, NAT/IPv4, logs, RDS Proxy, WAF, backups, and teardown. Account resources are
enumerated before and after the exercise. AGL-14 is open.

### T21 — Regional failure, backup, and recovery assumptions

**Threat.** Single-region service or database failure causes unrecoverable data or an untested
restore, while a demo label is mistaken for a recovery strategy.

**Required controls.** Declare the single-region availability objective; encrypted automated
backups and retention; point-in-time recovery where approved; restore drills; infrastructure and
secret recovery instructions; and a decision on whether the demo can tolerate regional outage.

**Proof gate.** Restore into an isolated disposable target and verify data/application invariants.
No multi-region claim is made without a separate architecture and cost review.

## Open finding register

| ID     | Open finding                                                                                                                | Severity | Required closure evidence                                                               |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| AGL-01 | Current Socket.IO client/server protocol cannot connect to API Gateway's plain WebSocket service                            | Critical | Native client/server protocol, persistence, abuse tests, and REST convergence           |
| AGL-02 | Session cookie `/api/v1` scope versus current `/socket.io/` path leaves real-browser credential behavior unproved           | High     | Browser E2E for current and proposed CloudFront REST/realtime paths                     |
| AGL-03 | Generated REST/WebSocket API endpoints remain directly reachable without a standard distribution-bound API Gateway OAC      | High     | Direct-bypass, protected-header, rotation, and authorizer negative tests                |
| AGL-04 | CloudFront realtime viewer path needs an unproved rewrite to the API Gateway WebSocket stage                                | High     | AWS staging proof retaining cookie, Origin, upgrade, query, and timeout semantics       |
| AGL-05 | Connect-only authorization and best-effort disconnect cannot enforce the current 30-second session-revocation bound alone   | High     | Durable registry, sweeper, revocation, stale-row, and missed-disconnect proof           |
| AGL-06 | Current notification poller and process-local rooms/maps have no Lambda-equivalent fan-out path                             | High     | Supervised bridge plus durable recipient registry and failure-recovery proof            |
| AGL-07 | In-memory HTTP/auth/socket rate and connection controls fail across Lambda environments                                     | High     | Atomic distributed limits plus layered throttle and reconnect-storm tests               |
| AGL-08 | Exact Prisma/MariaDB/RDS Proxy TLS, pool, pinning, transaction, restart, and failover behavior is unproved                  | High     | Exact-version disposable TLS, transaction, pinning, failover, and load matrix           |
| AGL-09 | VPC API functions and private worker need unapproved outbound HTTPS for Razorpay and WebSocket management calls             | High     | Approved network/cost design plus address-family, dependency, and failure proof         |
| AGL-10 | Existing Node image and entry point are not a Lambda image/handler and retain release-blocking findings                     | High     | Exact package/image review, Lambda runtime tests, provenance, and clean scans           |
| AGL-11 | Raw webhook, cookies, binary body, proxy/IP, request ID, timeout/retry, and error semantics depend on an unselected adapter | High     | Exhaustive integration contract, fault-injection, route-isolation, and browser tests    |
| AGL-12 | Lambda lifecycle invalidates periodic database supervision, signal shutdown, and process-persistence assumptions            | Medium   | Request-bounded failure design while preserving supervised worker recovery              |
| AGL-13 | API Gateway/CloudFront idle behavior conflicts with the current Socket.IO heartbeat and no-inbound-event policy             | Medium   | Approved reconnect/heartbeat choice plus idle, maximum-lifetime, and abuse tests        |
| AGL-14 | RDS Proxy, WAF, egress, WebSocket usage, logs, and worker runtime are usage-priced                                          | Medium   | Verified account eligibility, complete estimate, alarms, quotas, manifest, and teardown |
| AGL-15 | Existing Node/migration/AI image, Prisma audit/OpenSSL, and setup-node action findings remain release blockers              | High     | Upstream-compatible remediations and fresh zero-unaccepted-finding evidence             |

Every finding is **OPEN**. None is accepted, downgraded, suppressed, or waived.

## Required abuse and failure test groups

A future implementation authorization would still not authorize deployment. Repository-only work
would need to produce these disposable proof groups first:

1. **HTTP mapping:** request bodies, raw webhook bytes, multiple cookies, binary output, duplicate
   headers, query/path encoding, size limits, timeouts, IP attribution, and error envelopes.
2. **Browser boundary:** login, logout, CSRF, exact `Origin`, cookie path/SameSite/Secure behavior,
   REST calls, WebSocket connect/reconnect, and direct-origin rejection.
3. **Realtime isolation:** multiple users/tabs, stale IDs, reconnect storms, malformed/oversized
   messages, connect-only authorization, revocation, missed disconnect, ordering, replay, and REST
   catch-up.
4. **Database safety:** cold/warm concurrency, pool budget, RDS Proxy pinning, serializable
   transactions, secret rotation, TLS trust, failover, and recovery.
5. **Payment integrity:** signature verification against exact raw bytes, outbound timeouts,
   duplicate invocation, response loss, webhook replay, idempotency, and reconciliation.
6. **Worker durability:** crash/kill, lease expiry, heartbeat loss, retry/dead-letter, backlog,
   duplicate fan-out, management API outage, and graceful restart.
7. **Security operations:** IAM negative tests, secret canaries, log redaction, artifact scans,
   dependency/provenance checks, quota alarms, spend alarms, and full resource enumeration/teardown.

No success criterion may be replaced with an accepted residual finding.

## Decision and next safe action

The no-domain API Gateway/Lambda candidate is **not accepted**. It is a material application and
operations redesign whose open security and cost gates are disproportionate for the stated demo
unless the owner consciously chooses that redesign after seeing exact dependency, engineering,
and AWS recurring-cost proposals.

The owner has nothing to configure now. The next safe step, only if requested separately, is a
repository-only implementation/dependency proposal naming exact adapter/runtime choices, changed
modules, migrations, test harnesses, build evidence, and estimated recurring AWS components. It
must not install, implement, provision, or deploy. A disposable AWS proof would require a later,
separate approval after account and price verification.

## Authoritative references

- [API Gateway REST APIs compared with HTTP APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html)
- [HTTP API Lambda payload formats and cookie representation](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html)
- [API Gateway WebSocket quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-execution-service-websocket-limits-table.html)
- [WebSocket `$connect` and best-effort `$disconnect`](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-route-keys-connect-disconnect.html)
- [WebSocket Lambda authorizers apply at `$connect`](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-lambda-auth.html)
- [WebSocket connection management API](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-how-to-call-websocket-api-connections.html)
- [CloudFront WebSocket requirements](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-working-with.websockets.html)
- [CloudFront custom origin headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/add-origin-custom-headers.html)
- [CloudFront origin access control origin types](https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_CreateOriginAccessControl.html)
- [CloudFront origin mTLS limitations](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/origin-enable-mtls-distributions.html)
- [Lambda Node.js container requirements](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-image.html)
- [Lambda execution environment reuse and statelessness](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [Lambda with RDS and RDS Proxy](https://docs.aws.amazon.com/lambda/latest/dg/services-rds.html)
- [RDS Proxy pinning](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy-pinning.html)
- [VPC-connected Lambda Internet behavior](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html)
- [Socket.IO protocol distinction](https://socket.io/docs/v4/)
- [Socket.IO default transport path](https://socket.io/docs/v4/client-options/#path)
- [RFC 6265 cookie path matching](https://datatracker.ietf.org/doc/html/rfc6265#section-5.1.4)

## Review record

- This is a repository and official-documentation review only.
- No AWS or GitHub account was accessed.
- No code, dependency, workflow, infrastructure template, domain, account, billing, resource, or
  finding state was changed.
- No HTTP origin, waiver, risk acceptance, downgrade, or suppression was introduced.
