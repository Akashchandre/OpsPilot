# Phase 10 API Gateway/Lambda Compatibility Proposal

**Date:** 2026-09-11
**Status:** PROPOSAL ONLY - NOT ACCEPTED OR AUTHORIZED FOR IMPLEMENTATION
**Region evaluated:** `us-east-1`
**Public hostname constraint:** generated `*.cloudfront.net` hostname; no owned domain
**Budget assumption:** owner-reported AWS Free Plan with USD 160 credit and 67 days remaining as
of 2026-09-09; not independently verified and now time-sensitive

## Decision outcome

**Do not implement or provision this candidate.** API Gateway and Lambda are not a drop-in runtime
for the current OpsPilot application. A request-bounded subset of the Express API could be adapted
to a Node.js 24 Lambda, but the current Socket.IO gateway, continuous job worker, process-local
rate/connection controls, database supervisor, Docker image, proxy/source-IP model, and outbound
networking cannot move unchanged.

The least-incompatible serverless direction is a hybrid re-platform:

- CloudFront remains the only browser-visible host and serves the React assets from private S3.
- A regional API Gateway REST API invokes a request-bounded Node.js Lambda for `/api/v1/*` only.
- A separate API Gateway WebSocket API replaces, rather than hosts, Socket.IO.
- RDS MySQL stays private; RDS Proxy is a production candidate, not an accepted dependency.
- The JavaScript job worker stays continuously supervised on private compute.
- Realtime connection records, notification fan-out, session revocation, and shared abuse controls
  require new durable designs and tests.

Even that direction does not currently pass the no-domain, Free Plan, private-origin, and
no-residual-finding gates. In particular, API Gateway's generated endpoints stay public when they
are used as CloudFront origins, CloudFront origin access control does not support a standard API
Gateway origin, origin mutual TLS is unavailable on the CloudFront Free plan and does not support
WebSockets, private Lambda networking needs an approved outbound path for Razorpay and WebSocket
callbacks, and the exact Prisma/MariaDB/RDS Proxy behavior has not been proven.

No application code, dependency, workflow, template, GitHub setting, AWS resource, account
setting, billing setting, deployment, domain, HTTP origin, finding waiver, or suppression is
created or authorized by this document.

The companion security analysis is
[`PHASE-10-API-GATEWAY-LAMBDA-THREAT-MODEL.md`](../security/PHASE-10-API-GATEWAY-LAMBDA-THREAT-MODEL.md).

## Review boundary

This proposal reviews compatibility and threats only. It covers:

- the existing React fetch and realtime clients;
- Express request/response behavior and middleware ordering;
- opaque cookie sessions, CSRF, exact-origin checks, source-IP handling, and rate limits;
- Razorpay Test Mode API calls and raw signed webhooks;
- Prisma 7.9.1 with `@prisma/adapter-mariadb` 7.9.1 and private RDS MySQL;
- transactional business operations, idempotency, audit, notifications, and background jobs;
- API Gateway REST, HTTP, and WebSocket API feature differences;
- Lambda Node.js 24 execution and packaging boundaries;
- CloudFront strict HTTPS, origin restriction, path routing, WebSocket forwarding, and caching;
- failure, recovery, logging, cost, and release implications.

It does not select an adapter, install a package, define infrastructure as code, access an account,
verify the owner's credits, create a staging environment, change the accepted ADR 0013 topology,
or approve a deployment.

## Existing contracts that must survive

### Browser and HTTP contracts

- The React client calls a configured `/api/v1` base URL with credentials included.
- Unsafe requests copy the readable CSRF cookie into `X-CSRF-Token`.
- The session cookie is `HttpOnly`, `Secure` in production, `SameSite=Lax`, and scoped to
  `/api/v1`; the CSRF cookie is readable, secure in production, and scoped to `/`.
- Unsafe application methods require the exact configured `Origin` value.
- API responses use stable status codes and JSON error envelopes containing a generated request ID.
- Authenticated API responses are non-cacheable. Binary document reads also set `no-store`,
  `nosniff`, a content type, and a safe attachment filename.
- Razorpay webhooks require the original raw body, signature, provider event ID, 64 KiB limit,
  idempotent event handling, and serializable database transaction behavior.
- Text/Markdown document bodies are raw bytes with an exact 256 KiB limit. The production
  filesystem document adapter remains prohibited and documents start disabled.

### Realtime contracts

- Socket.IO currently shares the Node HTTP server but is a best-effort notification hint channel.
- MySQL and REST remain authoritative; hints contain only a notification UUID and cursor.
- Connection establishment requires the exact browser origin and an active opaque session.
- Disabled, expired, or revoked identities are rejected; active sessions are rechecked within the
  configured 30-second interval and disconnected after revocation.
- Connections are recipient-scoped, limited per user and source, and inbound application events
  are rejected.
- Reconnects must be bounded and followed by REST catch-up.

### Worker and database contracts

- The worker is a separate continuous process. It polls, registers a worker identity, heartbeats,
  schedules jobs, reconciles expired leases, claims with `FOR UPDATE SKIP LOCKED`, renews leases,
  retries with bounded backoff, dead-letters exhausted jobs, and drains on shutdown.
- Job creation is transactionally coupled to business changes and protected by durable dedupe keys.
- API and worker processes probe database availability, return `503` while unavailable, and exit
  after a sustained database failure so their supervisor can restart them.
- Business operations use many serializable transactions; transaction and idempotency behavior is
  authoritative and cannot be traded for eventual best effort.

## Candidate data flow

The following is a review model, not an infrastructure template:

```text
Browser
  |
  | HTTPS and WSS to one generated CloudFront hostname
  v
CloudFront
  |-- private S3 origin via OAC: immutable React assets
  |-- /api/v1/* -> HTTPS-only regional REST API -> Node.js 24 Lambda
  `-- /api/v1/realtime -> HTTPS/WSS regional WebSocket API -> connection Lambdas
                                                               |
                            private VPC + verified TLS          v
                          RDS Proxy candidate -------------> RDS MySQL
                                                               ^
                                                               |
                  private continuously supervised worker -- notification bridge
```

The browser-facing realtime path is intentionally under `/api/v1` so the existing session-cookie
path can match it. API Gateway's generated WebSocket URL contains only its stage path, so a
CloudFront URI rewrite and stage-origin-path combination would be required. Whether that rewrite,
cookie forwarding, exact `Origin`, custom origin header, upgrade headers, and connection lifetime
work together is an open disposable-AWS test gate; it is not established by documentation alone.

## API Gateway product choice

| Choice                     | Relevant fit                                                                                                                                                 | Blocking gap                                                                                                                                                                                                 | Review disposition                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| HTTP API + Lambda          | Lower-cost request proxy; payload format 2.0 has a cookies array; 30-second integration timeout and 10 MB payload.                                           | No resource policies, no AWS WAF association, no private endpoint, and no request validation. The generated endpoint cannot be restricted to CloudFront with a standard OAC.                                 | Not the security-baseline candidate.    |
| Regional REST API + Lambda | Supports regional AWS WAF, resource policies, request validation, binary media configuration, and Lambda proxy format 1.0 with multi-value response headers. | Still has a public generated endpoint, no distribution-bound CloudFront OAC, 29-second default integration boundary, higher request cost, and no solution for Socket.IO.                                     | Least-incompatible HTTP candidate only. |
| WebSocket API + Lambda     | Managed WSS endpoint, `$connect`/`$disconnect`/`$default`, connection IDs, authorizer at connect time, and signed management callbacks.                      | Plain WebSocket is not Socket.IO; auth runs only at connect; disconnect is best effort; 10-minute idle and 2-hour connection limits; no direct WAF association or private WebSocket endpoint is established. | Required redesign candidate for hints.  |
| Lambda function URL + OAC  | CloudFront OAC can bind a function URL to one distribution with SigV4 and strict HTTPS.                                                                      | It is not API Gateway; mutating viewer requests require an `x-amz-content-sha256` body hash; current browser code does not produce it; it provides no WebSocket endpoint.                                    | Useful comparison, not selected.        |
| Private REST API           | Public direct invocation can be denied and access can be bound to VPC endpoints.                                                                             | CloudFront cannot use the VPC interface endpoint as the generated no-domain public origin in the reviewed design; it also does not solve WebSockets.                                                         | Not a browser-front-door candidate.     |

The REST API preference is provisional and security-driven. It does not approve regional WAF,
Lambda authorizers, API Gateway, or their cost.

## Detailed compatibility matrix

| Area                                | Current implementation                                                                                       | Lambda/API Gateway result                                                                                                                                 | Required proof or redesign                                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node runtime                        | Exact Node.js 24.19.x project boundary                                                                       | Lambda supports managed `nodejs24.x` and an AWS Node.js 24 container base.                                                                                | Prove exact minor/runtime behavior, ESM imports, native `argon2`, generated Prisma client, and all tests on the selected Lambda package form.                                    |
| Process entry point                 | `server.js` creates an HTTP server, calls `listen`, attaches Socket.IO, handles signals.                     | Incompatible unchanged. Lambda invokes a handler and does not expose the application's listener.                                                          | Create a separate request handler entry point later; keep local/server and Lambda lifecycle concerns isolated. No adapter is selected here.                                      |
| Current Node container              | Debian Bookworm Node image starts API or worker with `tsx`.                                                  | Not Lambda-compatible unchanged. A non-AWS image requires the Lambda runtime interface client and a handler entry point; the AWS base is AL2023.          | Exact image/package choice, immutable digest, native-module build, scanner, SBOM, cold-start, read-only filesystem, and runtime-interface review. Existing scan findings remain. |
| TypeScript-at-runtime import        | Runtime imports the generated Prisma client from a `.ts` module and starts through `tsx`.                    | Managed Node does not imply the existing `tsx` loader path.                                                                                               | Prove a build/bundle or reviewed loader/package path without changing the JavaScript-first architecture.                                                                         |
| Express routing and error envelope  | One Express 5 app with middleware ordering and `/api/v1` router.                                             | Adaptable, not compatible by declaration. Event-to-request and response-to-event translation changes semantics.                                           | Contract-test every route, method, query, duplicate header, empty body, error, `404`, `405`, payload rejection, and request ID.                                                  |
| Multiple authentication cookies     | Login/registration set session and CSRF cookies; logout clears both.                                         | REST proxy 1.0 can use multi-value headers; HTTP proxy 2.0 uses the response `cookies` array.                                                             | Exact `Set-Cookie` preservation tests for both set and clear, including `HttpOnly`, `Secure`, `SameSite`, `Path`, expiry, and no `Domain`.                                       |
| CSRF and exact origin               | Browser cookie plus `X-CSRF-Token`; unsafe methods require exact `Origin`.                                   | Compatible only if CloudFront forwards cookies, `Origin`, content type, and CSRF/idempotency headers while API caching is disabled.                       | Browser E2E through CloudFront plus direct-origin negative tests; reject any normalization that broadens accepted origins.                                                       |
| Source IP and trusted proxy         | Express uses exact trusted proxy hops and rate keys from `request.ip`/socket address.                        | Current assumptions are invalid. HTTP APIs rewrite forwarded headers; Lambda has API Gateway source-IP context rather than a trusted socket peer.         | Derive a canonical client IP only from verified API Gateway/CloudFront context; never trust an arbitrary viewer-forwarded chain. Repeat spoofing and rate tests.                 |
| Request IDs and logs                | App generates UUIDs and emits structured completion logs.                                                    | Lambda/API Gateway add their own IDs and logs; response `finish`/`close` behavior through an adapter needs proof.                                         | Preserve one public app request ID and record gateway/Lambda trace IDs as separate correlation fields without logging bodies, cookies, secrets, or signed URLs.                  |
| JSON bodies                         | Global 100 KiB limit after raw/internal routes.                                                              | Below API Gateway and Lambda service payload limits. Translation and base64 flags still matter.                                                           | Exact boundary tests at limit-minus-one, limit, and limit-plus-one; malformed JSON and missing body behavior.                                                                    |
| Razorpay raw webhook                | Raw 64 KiB `application/json` body is verified before JSON/cookie/origin middleware.                         | High-risk adapter boundary. API Gateway may base64-encode; decoding or reserialization before HMAC invalidates the signature.                             | Byte-for-byte raw-body corpus, duplicate-event race, invalid signature/event ID/content type, timeout/retry, and WAF/header-gate tests.                                          |
| Razorpay outbound API               | Server calls `https://api.razorpay.com/v1` with an 8-second timeout.                                         | A VPC-attached Lambda has no public internet path by default. A public subnet does not give standard Lambda a public IP.                                  | Approve and cost a NAT path, or prove an end-to-end IPv6-only path including Razorpay support; neither is assumed. Egress TLS and DNS behavior remain gates.                     |
| Document upload/download            | Raw 256 KiB text/Markdown upload and binary attachment response.                                             | Size is within gateway limits, but binary/base64/media handling can corrupt bytes or headers.                                                             | Exact byte round trip, media type, filename, checksum, `no-store`, `nosniff`, 413, malformed encoding, and max-size tests. Production storage remains separately blocked.        |
| API timeouts                        | Node requests can run for process-defined durations; future document AI allows a 120-second downstream wait. | Regional REST API normally has about a 29-second integration boundary; HTTP API has a non-adjustable 30-second maximum. Lambda itself allows 900 seconds. | Measure every enabled initial route below a stricter application deadline. Production AI/doc workflows remain disabled; they cannot be enabled behind this synchronous route.    |
| Database client lifecycle           | One Prisma client/pool per long-running process with connection limit 5.                                     | Each concurrent Lambda execution environment can own a pool and warm environments can retain idle connections.                                            | Global-per-environment client, no per-request disconnect, concurrency cap, stale-connection recovery, and a proven connection equation against RDS limits.                       |
| Prisma/MariaDB with RDS Proxy       | Prisma 7.9.1 + MariaDB adapter; many interactive serializable transactions.                                  | No repository or official evidence proves this exact stack's pooling, TLS, failover, session settings, and transaction pinning behavior through Proxy.    | Disposable integration matrix with concurrency, pinning, long/failed transactions, database restart/failover, stale warm connections, and exact TLS CA validation.               |
| Database availability supervisor    | Periodic process probe, `503` guard, and fatal exit after sustained failure.                                 | Incompatible unchanged; timers may freeze between invocations and process exit is not a reliable Lambda recovery control.                                 | Per-invocation fail-closed connection behavior, health semantics, bounded retries, concurrency alarms/kill switch, and no background timer after handler return.                 |
| In-memory API/auth rate limits      | `express-rate-limit` memory stores keyed by source or authenticated user/source.                             | Ineffective across Lambda environments and vulnerable to cold-environment fan-out.                                                                        | Layer coarse CloudFront/API Gateway/WAF targets with an atomic durable login/user/source limiter. Preserve safe 429 envelopes and fail-closed policy for security limits.        |
| Socket.IO protocol                  | Socket.IO 4.8.x namespace `/notifications` over Engine.IO.                                                   | Incompatible. Socket.IO documents that its client cannot connect to a plain WebSocket server; API Gateway implements route-based WebSockets.              | Replace both client and gateway with an explicit native JSON hint protocol, or reject the re-platform. Run protocol, reconnect, browser, and leakage tests.                      |
| Session cookie on current Socket.IO | Session cookie path is `/api/v1`; Socket.IO uses its default transport path `/socket.io/`.                   | A conforming browser does not send the `/api/v1` cookie to `/socket.io/`. Existing API tests manually inject `Cookie`; UI tests mock Socket.IO.           | Treat current browser authentication as unproven. Add a real-browser negative/regression test before relying on either old or new realtime behavior.                             |
| WebSocket viewer path               | Browser supplies only origin/namespace; Socket.IO chooses its own transport path.                            | Generated API Gateway WebSocket URL is `wss://.../{stage}`. The desired CloudFront viewer path must remain under `/api/v1` for the cookie.                | Prove CloudFront behavior selection followed by URI rewrite, stage path composition, cookie forwarding, exact Origin, WebSocket upgrade, and no access to unintended routes.     |
| WebSocket connection auth           | Socket.IO middleware checks origin and DB session at handshake.                                              | API Gateway can authorize only `$connect`; changing the authorizer does not affect established connections.                                               | Connect gate must require CloudFront-only evidence, exact origin, active session, active user, bounded source/user connection count, and atomic registry write.                  |
| Session revocation                  | Every active socket is rechecked at most every 30 seconds.                                                   | No Lambda stays attached to a connection. Sender-only checks do not disconnect an idle revoked session.                                                   | A continuously supervised 30-second-or-better sweeper must validate registered sessions and issue signed delete-connection calls. A weaker interval is not silently accepted.    |
| Connection registry                 | Per-process maps plus live Socket.IO server.                                                                 | `$disconnect` delivery is best effort; durable connection IDs and ownership are required.                                                                 | Use an approved durable store, stale-record TTL/sweep, atomic max-connections rule, session linkage, least privilege, and cleanup on `GoneException`. Store choice is open.      |
| Notification fan-out                | Server polls MySQL every 500 ms and emits UUID/cursor hints to per-user rooms.                               | Connection Lambdas do not continuously poll.                                                                                                              | Extend an approved continuous worker/bridge or define an event source with equivalent delivery semantics. Validate recipient scope immediately before each signed callback.      |
| Inbound WebSocket messages          | Any inbound application event disconnects the client.                                                        | API Gateway routes inbound messages to integrations; browser-native WebSocket cannot generate protocol ping frames.                                       | `$default` must reject/disconnect application data. Idle survival versus CloudFront/API Gateway timeouts is an open test; no new client heartbeat exception is accepted here.    |
| Reconnect and connection duration   | Socket.IO supplies heartbeat and exponential reconnect.                                                      | API Gateway enforces 10-minute idle and 2-hour maximum connections; CloudFront timeout interaction is not proven.                                         | Native client needs bounded jittered reconnect and REST catch-up. Test long idle, forced two-hour close, CloudFront/origin failure, reconnect storm, and duplicate hints.        |
| Continuous job worker               | Infinite supervised poll loop with lease renewal and graceful drain.                                         | Cannot run unchanged in standard Lambda's bounded invocation model.                                                                                       | Retain it on private supervised compute initially and repeat lease, outage, kill, recovery, and drain tests. A Lambda worker redesign is out of scope.                           |
| Internal AI loopback routes         | `/internal/v1/ai` trusts loopback plus HMAC/replay controls; production workflows are rejected by config.    | Lambda socket peer/loopback assumptions do not represent the current task-local boundary.                                                                 | Do not expose or map `/internal/v1/*`. Keep production AI/workflows disabled. A later production AI topology requires its own decision and threat review.                        |
| Filesystem state                    | Local document/checkpoint adapters exist but are production-prohibited.                                      | Lambda writable state is temporary and environment-local.                                                                                                 | Do not enable filesystem documents/checkpoints. Approved durable production adapters remain separate blockers.                                                                   |
| Graceful shutdown                   | SIGTERM closes HTTP/Socket.IO and disconnects Prisma; worker drains.                                         | Lambda freezes or terminates environments; handler completion is the request boundary.                                                                    | Ensure no unfinished timers/callbacks after response. Keep worker shutdown behavior on its continuous runtime.                                                                   |

## Realtime replacement contract

A serverless realtime implementation would need a new, versioned protocol. This proposal does not
authorize it, but compatibility cannot be assessed without stating its minimum behavior:

- The browser connects only to a CloudFront viewer path under `/api/v1` using `wss`.
- The browser sends no session token in query text, local storage, JavaScript-readable payload, or
  subprotocol. The host-only `HttpOnly` cookie remains the credential.
- `$connect` receives the forwarded `Cookie` and exact `Origin`; it rejects any missing, malformed,
  expired, revoked, or disabled identity before connection establishment.
- An origin-restriction value added and overwritten by CloudFront is checked before business
  execution. It must never appear in a response, browser bundle, application log, or repository.
- A durable connection row binds connection ID, user ID, auth-session ID, created/expiry time,
  last validation time, and source abuse key. It stores no raw session token.
- An atomic operation enforces the configured maximum connections per user and the source connect
  rate across all execution environments.
- A continuous bridge reads only committed MySQL notifications, selects active connections for the
  recipient, revalidates authorization, and sends only a versioned `{id, cursor}` hint.
- A revoked/expired/disabled session is disconnected within the existing 30-second bound even when
  no notification is being sent.
- A stale connection is removed after best-effort `$disconnect`, failed status lookup, callback
  `GoneException`, expiry, or sweeper detection.
- `$default` accepts no business command and disconnects clients that send application data.
- After any connect, reconnect, gap, duplicate, out-of-order hint, or callback loss, REST cursor
  catch-up remains authoritative.
- The client uses bounded exponential backoff with jitter and does not create parallel connections.

API Gateway's 10-minute idle timeout creates an unresolved choice. Allowing an application-level
heartbeat would change the current no-inbound-events contract and incur routed messages; sending
server heartbeats would add callback messages and worker work. Allowing idle closure requires
regular reconnects. No choice is accepted here. A staging test must also determine whether
CloudFront's origin response timeout changes the effective WebSocket idle behavior.

## Origin restriction and strict HTTPS

### What works

- The browser can use the CloudFront-generated certificate and HTTPS/WSS on the generated hostname.
- CloudFront can connect to regional API Gateway generated hostnames with HTTPS only and a
  publicly trusted, matching AWS certificate.
- CloudFront can add an origin custom header and overwrites a viewer-supplied header of the same
  name before forwarding it.
- A regional REST API can attach AWS WAF; CloudFront itself can also apply WAF at the viewer edge.
- The application can remain same-origin from the browser's perspective when REST and WebSocket
  paths are routed through the one CloudFront hostname.

### What remains open

- Standard CloudFront OAC supports S3, MediaStore, MediaPackage v2, and Lambda function URL origins,
  not API Gateway. It cannot cryptographically bind the API Gateway origin to one distribution.
- The `execute-api` endpoint must stay enabled because CloudFront uses it and no API Gateway custom
  domain exists. Direct traffic can therefore reach API Gateway without traversing CloudFront.
- A high-entropy rotated custom header plus a regional REST WAF rule can reject normal direct REST
  calls before the integration, but it is a shared-secret control. Header disclosure, rotation,
  regional WAF cost, error behavior, and direct-request cost must be tested.
- WebSocket APIs do not gain a regional API Gateway WAF association in the reviewed model. A
  required authorizer identity source can reject a missing CloudFront header before connection,
  but the generated endpoint remains reachable and guessed/disclosed-header traffic can reach the
  connect path.
- CloudFront origin mTLS, released in 2026, cannot close this gap under the current constraints: AWS
  documents that it is unavailable on the CloudFront Free plan and does not support WebSocket
  connections. API Gateway's own viewer mutual TLS requires a regional custom domain and therefore
  an owned domain/certificate.
- CloudFront-to-Lambda function URL OAC is distribution-bound, but it requires body-hash work for
  viewer `PUT`/`POST` requests and does not solve realtime. It is not a transparent fallback.

Consequently, the direct-origin gate remains **open**. This proposal does not call a shared header
equivalent to OAC or accept the remaining WebSocket/cost exposure.

## Database and transaction review

RDS Proxy is the candidate connection boundary because AWS recommends it for production Lambda
workloads with frequent short connections, and Prisma documents the connection-exhaustion risk of
serverless concurrency. That recommendation is not proof for OpsPilot's exact stack.

The later test matrix must establish all of the following:

1. The exact RDS MySQL version and proxy support are available in `us-east-1` for the actual account.
2. Lambda, proxy, and RDS are in approved private subnets and security groups with no public DB.
3. The Node.js client validates the `us-east-1` RDS certificate bundle. Node.js 20 and later no
   longer load additional RDS CAs by default, and a Lambda container must include the regional CA.
4. The exact MariaDB driver adapter accepts the proxy endpoint and required TLS options without
   reintroducing the Prisma/OpenSSL or package findings.
5. One warm Lambda environment uses one reviewed Prisma instance. Pool size, Lambda reserved
   concurrency, worker connections, migration connections, monitoring reserve, and RDS maximum
   connections have a documented hard equation and alarm threshold.
6. Serializable, repeatable-read, read-committed, raw SQL, `SKIP LOCKED`, idempotency, uniqueness,
   deadlock retry, and rollback behavior remain correct.
7. RDS Proxy pinning is measured for current interactive transactions and session settings. A
   proxy that pins nearly every connection does not satisfy the pooling assumption.
8. Stale warm connections fail closed, reconnect within a bounded deadline, and never duplicate a
   committed business action after RDS restart, proxy failover, timeout, or Lambda retry.
9. Migration stays a single one-off controlled task and does not execute on Lambda cold start.
10. RDS Proxy's per-vCPU-hour cost and any additional endpoint/PrivateLink cost fit a fresh budget
    calculation. It is not assumed free.

The current adapter pool limit of five multiplied by unconstrained Lambda environments can exhaust
a demo-sized RDS instance. API Gateway throttling is best effort, so it is not by itself the
database connection ceiling.

## Network and egress review

The HTTP Lambda must enter the VPC to reach private RDS. AWS documents that a standard
VPC-connected Lambda then loses default public-internet access and that attaching it to a public
subnet does not assign a public IP. OpsPilot still needs outbound HTTPS for Razorpay API operations.
The private worker/realtime bridge also needs signed HTTPS access to API Gateway's public
`@connections` management endpoint.

The current proposal has no accepted low-cost answer:

- A managed NAT gateway supplies IPv4 egress but has hourly and processing charges and must be
  included in availability/cost design.
- An IPv6 egress-only internet gateway has no gateway charge, but all subnets must be dual-stack
  and every external dependency must have proven IPv6 reachability. Razorpay's reviewed official
  allowlist publishes IPv4 ingress addresses; this review found no official IPv6 support claim.
- Interface VPC endpoints add hourly/traffic costs and do not establish that the public WebSocket
  management endpoint can be used privately in this design.
- Moving the Lambda or worker to a public application plane violates the accepted private-plane
  requirement and does not give a standard Lambda a public address merely by subnet selection.

Until an outbound path is separately selected, costed, and tested, checkout/refund/reconcile and
realtime callback behavior are blocked.

## Failure and recovery expectations

| Failure                                       | Required result                                                                                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lambda cold start or init failure             | API fails with bounded, observable 5xx behavior; no partial action is committed; alarm and rollback criteria are explicit.                            |
| API Gateway timeout after DB commit           | Client retry is safe through existing idempotency/provider-event keys; outcome can be reconciled; no blind replay.                                    |
| RDS/Proxy unavailable                         | Requests fail closed with safe `503`; no timer assumes a persistent Lambda process; worker pauses claims and supervisor recovery remains verified.    |
| Stale warm DB connection                      | Connection is detected/recreated without leaking credentials or duplicating a transaction.                                                            |
| CloudFront cannot reach REST origin           | No fallback to HTTP or direct API URL; fail closed and alert.                                                                                         |
| CloudFront/WebSocket rewrite fails            | Browser falls back to REST catch-up only; no token moves to a query parameter or JavaScript storage.                                                  |
| WebSocket idle/max-duration close             | One bounded jittered reconnect occurs, then REST cursor catch-up; no parallel connection storm.                                                       |
| `$disconnect` event is lost                   | TTL/sweeper/callback failure removes stale registry state; stale rows do not consume a user's connection allowance indefinitely.                      |
| Session revoked while socket is idle          | Continuous sweeper disconnects it within the accepted 30-second bound; sender-only validation is insufficient.                                        |
| Notification callback returns `GoneException` | Remove the stale connection and continue other recipients; do not mark notification read or alter durable business state.                             |
| Realtime bridge dies                          | REST remains correct; supervisor restarts bridge; missed hints are recovered by cursor catch-up; alarm records the outage.                            |
| Razorpay API egress unavailable               | Provider operation times out safely, no secret/body appears in logs, and later webhook/reconcile paths preserve the payment state machine.            |
| Lambda concurrency spike                      | Reserved concurrency plus durable abuse controls protect DB headroom; rejected requests are observable; account-wide functions retain emergency room. |
| Origin-restriction secret leak/rotation error | Direct endpoint remains blocked during a tested overlap rotation or service stops; old value is removed everywhere and never logged.                  |

## Required test gates before implementation could be accepted

### Repository-only contract gate

- Full existing unit/integration/UI suite remains green.
- Event adapter contract corpus for every route and middleware ordering branch.
- Cookie set/clear attributes and browser path-match tests.
- Raw Razorpay signature corpus over base64 and non-base64 gateway events.
- Binary document upload/download byte equality and limit tests.
- Canonical source-IP and forwarded-header spoof tests.
- No `/internal/v1/*` mapping and no production AI/doc filesystem enablement.
- No timers, listeners, or unfinished callbacks survive handler completion.
- Static secret/log scanner confirms no origin value, session, CSRF, provider, DB, or AWS secret.

### Disposable AWS compatibility gate - requires a later separate authorization

- CloudFront generated-domain HTTPS and WSS only; HTTP redirect/reject behavior verified.
- Private S3 direct access denial.
- REST and WebSocket direct `execute-api` negative tests with missing, wrong, viewer-supplied, old,
  and rotated origin-restriction values.
- Real-browser login, cookie inspection, CSRF mutation, logout/clear, and WebSocket handshake at the
  `/api/v1` viewer path. This must reproduce and close the current `/socket.io/` cookie-path gap.
- WebSocket exact origin, expired/disabled/revoked session, max connections, source-rate,
  recipient isolation, inbound message rejection, 30-second revocation, idle, two-hour closure,
  CloudFront timeout, reconnect storm, and REST catch-up.
- RDS/Proxy TLS identity, pool/pinning, concurrency, restart/failover, transaction, migration, and
  stale-warm-environment tests.
- Razorpay Test Mode outbound and raw webhook tests through the selected egress and origin controls.
- API/worker kill, lease recovery, duplicate callback, gateway timeout-after-commit, rollback, and
  alert-delivery drills.
- WAF/API Gateway/Lambda/RDS Proxy/NAT-or-egress/worker/log actual billed-usage capture and teardown
  proof. Failure must preserve the blocker and resources must not be left running.

### Release gate

- Zero unresolved critical/high image, dependency, workflow-action, and scanner findings.
- Prisma/OpenSSL behavior and the current `deepmerge-ts` finding resolved without an override,
  downgrade, prerelease, suppression, or accepted residual.
- Exact immutable actions, base/runtime images, Lambda package, SBOM, attestations, and provenance.
- Reviewed infrastructure templates, least-privilege IAM, secret rotation, alarms, backup/restore,
  rollback, runbooks, cost stop controls, and owner approval of the exact release digest.

## Finding register

No item below is accepted or suppressed.

| ID     | Severity | Finding                                                                                                                                       | Status                                                                                                  |
| ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| AGL-01 | Critical | Current Socket.IO client/server protocol cannot connect to API Gateway's plain WebSocket service.                                             | Open; requires a material client, server, protocol, persistence, and test redesign.                     |
| AGL-02 | High     | Current browser session cookie is scoped to `/api/v1`, while Socket.IO defaults to `/socket.io/`; tests bypass or mock real browser behavior. | Open; real-browser test required for current and proposed realtime paths.                               |
| AGL-03 | High     | Generated REST/WebSocket API endpoints remain directly reachable; no standard distribution-bound API Gateway OAC exists.                      | Open; shared-header/WAF/authorizer proposal is not yet equivalent proof and has cost/rotation exposure. |
| AGL-04 | High     | WebSocket CloudFront viewer path must be rewritten to the stage URL while retaining cookie/origin/upgrade semantics.                          | Open; AWS staging proof required.                                                                       |
| AGL-05 | High     | Connect-only authorization and best-effort disconnect do not provide the current 30-second active-session revocation alone.                   | Open; durable registry plus continuous sweeper required.                                                |
| AGL-06 | High     | Current notification poller and per-process rooms/maps have no Lambda-equivalent fan-out path.                                                | Open; continuous bridge and durable recipient-scoped registry required.                                 |
| AGL-07 | High     | In-memory HTTP/auth/socket rate and connection controls fail across Lambda environments.                                                      | Open; atomic shared controls and layered throttles required.                                            |
| AGL-08 | High     | Exact Prisma/MariaDB/RDS Proxy TLS, pool, pinning, transaction, restart, and failover behavior is unproven.                                   | Open; disposable integration matrix required.                                                           |
| AGL-09 | High     | VPC-connected API and private worker need unapproved outbound HTTPS for Razorpay and `@connections`; free IPv6 compatibility is unproven.     | Open; network, cost, and dependency proof required.                                                     |
| AGL-10 | High     | Existing Node image/entry point is not a Lambda image/handler and retains release-blocking scan findings.                                     | Open; exact package/image review plus all current remediation gates.                                    |
| AGL-11 | High     | Raw webhook, multiple cookie, binary body, proxy/source-IP, request ID, and error semantics depend on an unselected adapter.                  | Open; exhaustive contract and real-browser tests required.                                              |
| AGL-12 | Medium   | Lambda lifecycle invalidates periodic database supervision, signal shutdown, and assumptions about process persistence.                       | Open; request-bounded recovery design required while worker lifecycle stays supervised.                 |
| AGL-13 | Medium   | API Gateway/CloudFront WebSocket idle behavior conflicts with current Socket.IO heartbeat and no-inbound-event policy.                        | Open; choose and test reconnect or a separately approved heartbeat protocol.                            |
| AGL-14 | Medium   | RDS Proxy, regional WAF, NAT/VPC endpoints, WebSocket minutes/messages, logs, and worker runtime are usage-priced.                            | Open; exact account eligibility and measured cost required.                                             |
| AGL-15 | High     | Existing Node/migration/AI image, Prisma audit/OpenSSL, and setup-node action findings remain release blockers.                               | Open and unchanged; this topology review waives none.                                                   |

## Proportionality assessment

For a personal demo, this candidate reduces the need for an ALB certificate/domain but adds two API
Gateway products, several Lambda roles/functions, an event adapter, a native WebSocket protocol,
durable connection state, an origin-restriction secret lifecycle, a continuous realtime bridge,
RDS Proxy evaluation, distributed abuse controls, and private egress. That is substantially more
application and operational change than buying or supplying a domain for the accepted ECS/ALB
topology.

Under the owner's current **no domain + Free Plan + no residual findings** constraints, the
re-platform is not proportionate and is not deployment-ready. It becomes worth an implementation
proposal only if the owner knowingly accepts the engineering scope and separately approves a
small usage-priced network/security/database envelope after exact cost verification. Accepting
that scope would still not accept any security finding.

## Owner action and next gate

The owner should do **nothing in AWS or GitHub now**. Do not create an API, Lambda, RDS Proxy, WAF,
NAT gateway, VPC endpoint, certificate, secret, table, function, role, distribution, workflow, or
template. Do not change billing/plan settings, buy a domain, expose an origin, or share credentials.

If the no-domain constraint remains, the next safe step is not provisioning. It is a separately
authorized, repository-only implementation/dependency proposal that selects the exact REST event
adapter or route-handler approach, native WebSocket contract, durable connection store, shared
rate controls, Lambda package/image, continuous bridge boundary, egress option, and test batches.
That proposal must include exact dependency versions and costs before any install or code change.

Alternatively, keep Phase 10 blocked until the domain or budget constraint changes. The existing
CloudFront-to-ALB origin must not fall back to HTTP.

## Official references reviewed

### AWS

- [REST API versus HTTP API features](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html)
- [HTTP API Lambda payload formats and cookies](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html)
- [HTTP API quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html)
- [HTTP API IAM and resource-policy limitation](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-access-control-iam.html)
- [API Gateway service quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html)
- [API Gateway WebSocket quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-execution-service-websocket-limits-table.html)
- [API Gateway WebSocket connection model](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-basic-concept.html)
- [`$connect` and best-effort `$disconnect`](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-route-keys-connect-disconnect.html)
- [WebSocket Lambda authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-lambda-auth.html)
- [WebSocket routes](https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api-develop-routes.html)
- [WebSocket management callbacks](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-how-to-call-websocket-api-connections.html)
- [CloudFront WebSocket forwarding](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-working-with.websockets.html)
- [CloudFront custom origin headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/add-origin-custom-headers.html)
- [CloudFront origin path behavior](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html)
- [CloudFront OAC supported origin types](https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_CreateOriginAccessControl.html)
- [CloudFront OAC for Lambda function URLs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html)
- [CloudFront origin mutual TLS limitations](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/origin-enable-mtls-distributions.html)
- [API Gateway mutual TLS custom-domain requirement](https://docs.aws.amazon.com/apigateway/latest/developerguide/rest-api-mutual-tls.html)
- [Lambda Node.js 24 runtime](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html)
- [Node.js Lambda container requirements](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-image.html)
- [Lambda timeout](https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html)
- [Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)
- [Lambda execution reuse and statelessness](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [Lambda with RDS and RDS Proxy](https://docs.aws.amazon.com/lambda/latest/dg/services-rds.html)
- [RDS Proxy pinning](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy-pinning.html)
- [VPC-connected Lambda internet behavior](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html)
- [VPC-connected Lambda internet options](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html)
- [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/)
- [Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- [RDS Proxy pricing](https://aws.amazon.com/rds/proxy/pricing/)
- [CloudFront pricing and plan features](https://aws.amazon.com/cloudfront/pricing/)

### Application protocol and database client

- [Socket.IO is not a plain WebSocket implementation](https://socket.io/docs/v4/)
- [Socket.IO client default transport path](https://socket.io/docs/v4/client-options/#path)
- [RFC 6265 cookie path matching](https://datatracker.ietf.org/doc/html/rfc6265#section-5.1.4)
- [Prisma database connections in serverless environments](https://docs.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections)
- [Prisma deployment to AWS Lambda](https://docs.prisma.io/docs/orm/v7/prisma-client/deployment/serverless/deploy-to-aws-lambda)
- [Razorpay API HTTPS endpoint](https://razorpay.com/docs/api/)
- [Razorpay published IP and certificate guidance](https://razorpay.com/docs/security/whitelists/)

## Review record

- Repository governance, project rules, progress, the current Phase 10 definition, accepted threat
  model, no-domain proposal, ADR 0008 realtime/jobs boundary, runtime code, and relevant tests were
  read before this proposal was written.
- Current technical claims were checked against official AWS, Socket.IO, Prisma, IETF, and
  Razorpay sources. No third-party deployment guide was used as authority.
- No AWS or GitHub account was accessed.
- No install, pull, build, provisioning, deployment, domain purchase, HTTP-origin exception,
  account/billing change, finding acceptance, waiver, downgrade, or suppression occurred.
- The only repository changes authorized by this review are proposal/progress documentation.
