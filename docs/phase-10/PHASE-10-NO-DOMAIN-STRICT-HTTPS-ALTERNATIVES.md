# Phase 10 No-Domain Strict-HTTPS Alternatives Review

**Date:** 2026-09-11
**Status:** PROPOSAL ONLY — NO ALTERNATIVE ACCEPTED OR AUTHORIZED FOR IMPLEMENTATION
**Region evaluated:** `us-east-1`
**Account assumption:** owner-reported AWS Free Plan with USD 160 credit and 67 days remaining as
of 2026-09-09; not independently verified and now time-sensitive

## Outcome

There is no drop-in, no-domain replacement that currently passes all accepted OpsPilot gates.
The existing CloudFront-to-ALB topology still cannot use strict certificate-validated HTTPS
without a hostname controlled by the owner. App Runner and Lightsail offer AWS-generated HTTPS
hostnames, but they conflict with the reported Free Plan boundary and do not provide an approved,
evidence-complete replacement for the current Socket.IO, private-origin, worker, and transport
requirements.

The only no-domain direction worth a separate architecture proposal is a **CloudFront + API
Gateway + Lambda re-platform**, while retaining private RDS and a separately supervised private
worker initially. It is not a change of origin alone: API Gateway WebSocket APIs do not preserve a
persistent connection from API Gateway to the current Socket.IO server, Lambda cannot run the
continuous worker, and Lambda/RDS connection management changes. It therefore remains an
unaccepted candidate, not the deployment plan.

The separately authorized detailed review is now complete. It confirms that the candidate is a
material re-platform and remains **no-go**: fifteen compatibility/security findings are open, and
no residual finding was accepted. See
[`PHASE-10-API-GATEWAY-LAMBDA-COMPATIBILITY-PROPOSAL.md`](PHASE-10-API-GATEWAY-LAMBDA-COMPATIBILITY-PROPOSAL.md)
and
[`PHASE-10-API-GATEWAY-LAMBDA-THREAT-MODEL.md`](../security/PHASE-10-API-GATEWAY-LAMBDA-THREAT-MODEL.md).

No template, workflow, dependency, GitHub setting, AWS resource, account access, provisioning,
deployment, domain purchase, HTTP-origin exception, finding waiver, or finding suppression is
authorized by this review.

## Non-negotiable review gates

An alternative passes only if all of the following are demonstrated without accepting a residual
finding:

1. The public browser endpoint uses an AWS-generated hostname and HTTPS only; no domain is bought
   or supplied by the owner.
2. Every CloudFront custom-origin connection uses `HTTPS Only`, a trusted certificate whose name
   matches the configured origin, and TLS 1.2 or later. HTTP to a CloudFront origin is prohibited.
3. The browser retains one effective origin for REST, secure cookies, readable CSRF cookie, and
   notification connectivity. Cross-site or third-party-cookie dependence is prohibited.
4. Existing exact-origin checks, `Secure`/`SameSite=Lax` cookies, cookie path behavior, CSRF,
   session revocation, request authorization, and trusted proxy behavior remain effective.
5. REST/MySQL remain the authoritative notification and business-data paths. Any realtime change
   must retain authenticated connection establishment, session revalidation/revocation, bounded
   reconnect/rate behavior, and UUID/cursor-only hints.
6. The database remains private and uses certificate-validated TLS. Serverless database
   concurrency must not exhaust the MySQL connection budget or weaken transaction behavior.
7. The JavaScript worker remains separately supervised, or a replacement must prove equivalent
   polling, leasing, renewal, retry, idempotency, shutdown, outage, and recovery behavior.
8. Direct access to a generated origin endpoint must be denied or shown harmless. A public origin
   cannot silently bypass CloudFront controls, rate policy, logging, or the intended browser origin.
9. The exact service set must be available to the owner's actual Free Plan and fit within verified
   unexpired credits. “Supported” does not mean zero-cost.
10. Existing container, npm, Prisma/OpenSSL, setup-node, privacy, retention, backup/restore,
    observability, alert, and release findings remain blockers; this TLS review does not waive any
    of them.

## OpsPilot compatibility facts

- The React client sends cookies on API calls, reads the CSRF token from a browser cookie, and
  derives its Socket.IO endpoint from the configured API origin.
- Production configuration rejects non-secure authentication cookies. Session cookies are
  `HttpOnly`, `Secure`, `SameSite=Lax`, and scoped to `/api/v1`; the CSRF cookie is readable,
  `Secure`, `SameSite=Lax`, and scoped to `/`.
- Express and Socket.IO share one long-running Node HTTP server. Socket.IO accepts only the exact
  configured origin and authenticates the handshake from the opaque session cookie.
- Socket.IO is a best-effort hint channel, but it is implemented behavior. REST and MySQL are the
  durable authority, which permits a carefully reviewed realtime replacement but not an
  undocumented feature deletion.
- The JavaScript job worker is a second continuous process and cannot be placed unchanged inside a
  request-bounded function runtime.
- The accepted initial AWS target keeps application and data planes private behind CloudFront and
  an internal ALB. Replacing that boundary requires a new accepted architecture decision.

## Alternatives and disposition

| Alternative                                                     | No-domain strict HTTPS result                                                                                                                                                                                             | Compatibility and account result                                                                                                                                                                                                                         | Disposition                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| CloudFront generated hostname → internal ALB/ECS                | Fails. CloudFront requires the ALB origin certificate to match the origin/forwarded host and trust a public CA; the AWS-owned ALB hostname cannot supply the owner-controlled certificate assumed by the accepted design. | Preserves the application but not the TLS gate. Private HTTP remains prohibited.                                                                                                                                                                         | **Rejected under current constraints.**                                 |
| CloudFront → API Gateway generated endpoint → Lambda            | CloudFront can use an API Gateway HTTPS endpoint as an HTTPS-only origin; service invocation from API Gateway to Lambda removes the ALB HTTP(S) hop.                                                                      | API Gateway and Lambda are listed for the new Free Plan, but the Express entry point, Socket.IO protocol, distributed rate controls, notification fan-out, Lambda/RDS connections, and worker topology all require redesign and new evidence.            | **Detailed review completed; no-go with all findings open.**            |
| CloudFront → Lambda function URL                                | Function URLs are generated HTTPS endpoints and CloudFront OAC supports Lambda origins.                                                                                                                                   | No transparent Socket.IO server, Lambda is request-bounded, and the worker cannot run continuously. A new adapter/runtime path would also require dependency and security review.                                                                        | **Rejected as an OpsPilot application origin.**                         |
| Direct or CloudFront-fronted App Runner default domain          | App Runner supplies an AWS-owned HTTPS domain and terminates TLS, but AWS documents that it passes HTTP requests to the application container.                                                                            | App Runner is listed under the new AWS **Paid Plan**, not the Free Plan. Its 120-second request boundary, public-endpoint model, stateless autoscaling, continuous-worker fit, and Socket.IO behavior lack the required evidence.                        | **Rejected for the reported plan and strict transport interpretation.** |
| Direct or CloudFront-fronted Lightsail container default domain | Lightsail supplies an HTTPS-only generated endpoint and allows an HTTPS public-container port. AWS also documents that selecting an HTTP port makes its load balancer connect to the container over HTTP.                 | Lightsail is listed as unsupported for the new Free Plan unless advanced features are activated. It is fixed-price while present, its public endpoint is internet-accessible, and exact Socket.IO/origin restriction/private-RDS behavior is not proven. | **Rejected for the reported plan; no HTTP-port variant permitted.**     |
| Amplify/AppSync/IoT managed endpoints                           | These products provide AWS-managed HTTPS/WSS endpoints.                                                                                                                                                                   | They replace the React hosting and/or realtime protocol but do not host the current Express API and continuous worker. They add more application and authorization redesign than the API Gateway candidate.                                              | **Not shortlisted.**                                                    |
| Third-party free subdomain, dynamic-DNS name, or tunnel         | May provide somebody else's hostname and TLS.                                                                                                                                                                             | Violates the AWS-only/no-domain boundary, introduces a new provider/account/trust dependency, and does not resolve the existing release findings.                                                                                                        | **Excluded.**                                                           |

## Candidate requiring a separate proposal

The least-incompatible no-domain study target is:

```text
Browser
  |
  | HTTPS / WSS — generated *.cloudfront.net hostname
  v
CloudFront
  |-- private S3 origin for immutable React assets
  |-- HTTPS-only REST behavior -> regional API Gateway -> request-bounded Node Lambda
  `-- HTTPS/WSS behavior -> API Gateway WebSocket API -> connection/notification Lambdas
                                                        |
                           private VPC + TLS             v
                         RDS Proxy candidate --------> RDS MySQL
                                                        ^
                                                        |
                                  separately supervised private ECS worker
```

This drawing is descriptive only. It is not an infrastructure template or an accepted topology.

### Required redesign and proof

1. **REST adapter:** decide between a reviewed Express-to-Lambda adapter and route-level handlers.
   Verify body limits, binary behavior, error normalization, cookies, CSRF, exact origin, source IP,
   proxy hops, request IDs, timeouts, and every API/integration test. No dependency is selected.
2. **Realtime replacement:** replace Socket.IO/Engine.IO with API Gateway's route-based WebSocket
   model. API Gateway holds the persistent browser connection; it does not keep a persistent
   backend Lambda connection. The design needs connection records, `$connect` authentication,
   periodic session revalidation and forced disconnect, reconnect bounds, and UUID/cursor-only
   notification delivery while REST stays authoritative.
3. **Single browser origin:** route both REST and WebSocket behaviors through the generated
   CloudFront hostname so the existing host-scoped cookies are not made dependent on cross-site
   cookie behavior. Exact cookie and `Origin` forwarding must be proven in a disposable staging
   test before any release.
4. **Origin bypass:** regular CloudFront OAC types do not include API Gateway. A future proposal
   must design and test an explicit API Gateway-origin restriction, such as a rotated CloudFront
   origin header checked before application execution, plus appropriate WAF/resource controls.
   The direct `execute-api` endpoint, header confidentiality, browser-cookie scoping, public routes,
   logs, rotation, and failure behavior require threat review; no bypass risk is accepted here.
5. **MySQL connection safety:** Lambda can connect to RDS directly, but AWS recommends RDS Proxy for
   production/high-concurrency short connections. The exact Prisma/MySQL/RDS Proxy compatibility,
   TLS validation, pinning/transactions, concurrency cap, failure recovery, and additional proxy
   cost must pass disposable tests.
6. **Worker:** initially retain one private ECS worker and a one-off migration task, with no public
   load balancer. A scheduled/event-driven Lambda worker is not assumed because standard Lambda
   invocations have a 15-minute maximum and the current worker is continuous. Either direction
   needs the existing lease/outage/shutdown evidence repeated in the real runtime.
7. **Distributed controls:** Lambda and API Gateway invalidate the present single-process rate and
   connection-accounting assumptions. WAF/API Gateway throttles and any durable per-user controls
   must be defined without weakening the accepted authorization and abuse boundaries.
8. **Cost and availability:** verify the owner's exact account experience, Free Plan service access,
   remaining credit/expiry, API Gateway request/WebSocket connection-minute pricing, Lambda,
   RDS/RDS Proxy, ECS worker, VPC endpoints, logs, WAF, and data transfer immediately before any
   implementation or provisioning request.
9. **Disposable compatibility gate:** later, and only with separate approval, a minimal synthetic
   staging experiment must prove CloudFront HTTPS-origin validation, cookies/CSRF, WebSocket
   connect/revoke/reconnect, direct-origin denial, RDS TLS/pooling, worker behavior, logs/alerts,
   teardown, and billed usage. Failure preserves the blocker; it is not accepted or suppressed.

## Why this is not ready for implementation

- It changes the accepted application topology and realtime protocol.
- It needs code, dependency, security, test, cost, and operational decisions that are outside this
  proposal-only authorization.
- The exact account/service eligibility and remaining credit were not verified.
- The repository's existing high findings and setup-node release blocker remain unchanged.
- No AWS test was authorized, so CloudFront-to-API-Gateway WebSocket behavior and the complete
  cookie/origin path do not yet have environment evidence.

## Owner action and next approval gate

The owner should do **nothing in AWS or GitHub now**. Do not activate a paid plan or advanced AWS
features, create an API, create a function, change billing, buy a domain, expose an origin, or share
credentials/screenshots/secrets.

The detailed proposal-only compatibility and threat-model review is complete and found the redesign
disproportionate and unready under the current constraints. If the owner wants to continue studying
the no-domain route, the next safe step is a separately authorized **repository-only
implementation/dependency proposal** naming exact adapter/runtime choices, affected modules,
migrations, proof harnesses, unresolved costs, and closure evidence. It must not install, implement,
provision, or deploy. If the owner does not want a major serverless redesign, Phase 10 should remain
blocked until the domain constraint changes; the existing ALB design must not fall back to HTTP.

## Official AWS references reviewed

- [CloudFront HTTPS to custom origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-https-cloudfront-to-custom-origin.html)
- [CloudFront WebSocket behavior](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-working-with.websockets.html)
- [CloudFront custom origin headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/add-origin-custom-headers.html)
- [CloudFront origin access control types](https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_CreateOriginAccessControl.html)
- [API Gateway generated REST invoke URL](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-call-api.html)
- [API Gateway generated WebSocket endpoint](https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api-disable-default-endpoint.html)
- [API Gateway WebSocket routes](https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api-develop-routes.html)
- [API Gateway WebSocket connection model](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-basic-concept.html)
- [Lambda timeout](https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html)
- [Lambda with RDS and RDS Proxy](https://docs.aws.amazon.com/lambda/latest/dg/services-rds.html)
- [App Runner default domain and cookie guidance](https://docs.aws.amazon.com/apprunner/latest/dg/getting-started.html)
- [App Runner request/TLS/container behavior](https://docs.aws.amazon.com/apprunner/latest/dg/develop.html)
- [App Runner incoming networking](https://docs.aws.amazon.com/apprunner/latest/dg/network-incoming.html)
- [App Runner VPC egress to private RDS](https://docs.aws.amazon.com/apprunner/latest/dg/network-vpc.html)
- [Lightsail container endpoints and protocols](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-container-services-deployments.html)
- [Lightsail container pricing behavior](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-creating-container-services.html)
- [AWS new-sign-up Free Plan supported services](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html)
- [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/)
- [App Runner pricing](https://aws.amazon.com/apprunner/pricing/)
- [Lightsail pricing](https://aws.amazon.com/lightsail/pricing/)

## Review record

- Repository documentation and relevant API/web runtime configuration were read before this
  proposal was written.
- Only official AWS documentation and pricing pages were used for current AWS technical/account
  claims.
- No AWS or GitHub account was accessed.
- No command installed, downloaded, pulled, built, provisioned, or deployed anything.
- No template, workflow, code, dependency, configuration, secret, or account setting was created or
  changed.
- No current finding was accepted, suppressed, waived, or downgraded.
