# ADR 0014 — Single-EC2 CloudFront Personal Demo Exception

## Status

Accepted on 2026-09-11 by the owner's explicit approval:

> approve preparing the single-EC2 CloudFront demo deployment pack, including Nginx and Docker
> Compose changes. I accept HTTP between CloudFront and EC2 for this personal demo. Do not access
> or provision AWS yet.

This authorizes repository implementation and local disposable verification of the deployment
pack. It does **not** authorize AWS account access, provisioning, deployment, real customer data,
Razorpay Live Mode, real payments, or production AI/document/workflow enablement.

## Context

ADR 0013's production design uses CloudFront, S3, ALB/ECS, and private RDS with strict TLS between
CloudFront and the application origin. Without an owned domain and matching certificate, that
strict origin-TLS requirement blocks the selected generated CloudFront hostname. The separately
reviewed API Gateway/Lambda route is a material redesign and remains no-go.

The owner prioritized getting a personal demonstration online without buying a domain and
explicitly accepted HTTP only on the CloudFront-to-EC2 hop. Browser traffic must still use the
generated CloudFront HTTPS hostname. This is a narrow demo exception, not a change to the accepted
production architecture or a general security waiver.

## Decision

- Add a separate `compose.demo.yaml` overlay. Do not weaken the existing local/CI `compose.yaml`.
- Run one Linux/x86_64 EC2 instance in `us-east-1`; recommend `t3.medium` and 30 GiB `gp3` for the
  initial AI-disabled profile.
- Run the existing MySQL, migration, Node API, and Node worker containers on that host. Store MySQL
  in its named Docker volume backed by the EC2 EBS volume. This is single-host and not highly
  available.
- Add one unprivileged Nginx container that serves the built React SPA and reverse-proxies API and
  Socket.IO traffic to the Node API over the Compose edge network.
- Use NGINX unprivileged stable `1.30.4-alpine3.24`, pinned to multi-platform index digest
  `sha256:442753882674b49ae2c1de83ed67896131c0777f56df5005e356e62bc3f7e7ce`. The reviewed
  Linux/amd64 manifest is
  `sha256:b8c179cd3c2ae222a873dd59fbae240fadc03836cae5198afc9e9c19919c3880`. The image metadata
  identifies Apache-2.0 for its container source. It needs no account or secret.
- Use one CloudFront distribution and the generated `*.cloudfront.net` hostname. CloudFront sends
  viewer HTTP to HTTPS and reaches the EC2 public origin on port 80 using `HTTP only`.
- Route `/api/*` through a cache-disabled, all-method, all-viewer request behavior. This includes
  Socket.IO and forwards its WebSocket upgrade headers, cookies, query strings, CSRF header, and
  `Origin`. The default behavior serves static SPA assets from the same Nginx origin.
- Change the Socket.IO transport path from its `/socket.io/` default to `/api/v1/socket.io`. This
  makes the transport path match the existing production session-cookie `Path=/api/v1` and lets the
  authenticated handshake work in a real browser without broadening the cookie.
- Use `NODE_ENV=production`, secure authentication cookies, exact CloudFront CORS origin, two
  trusted proxy hops (Nginx and CloudFront), Razorpay Test Mode keys, and existing persistent demo
  labelling.
- Keep AI, documents/RAG, and LangGraph workflows disabled. The application already rejects their
  current local-only topologies in production.
- Keep API port 4000 bound only to EC2 loopback. Only Nginx port 80 is exposed. After CloudFront is
  active, restrict port 80 to the AWS-managed CloudFront origin-facing prefix list and SSH to the
  owner's current IP.
- Put secrets only in ignored `demo.env` on EC2 with mode `0600`. Bootstrap the owner
  interactively; never put the password in arguments, environment variables, tracked files, or
  chat.

## Consequences

- Browser-to-CloudFront traffic is HTTPS, but CloudFront-to-EC2 traffic is plaintext HTTP. The
  owner explicitly accepts this only for the personal demo.
- EC2, public IPv4, EBS, CloudFront usage, and traffic may consume credits or create charges. The
  reported USD 160/Free Plan state remains unverified until the owner checks the account.
- A single EC2, EBS volume, MySQL container, API process, and worker create one failure domain. The
  profile has no HA, automatic restore, or zero-downtime claim.
- Process-local rate and Socket.IO connection controls are suitable only for this one-API-container
  topology. Scaling the API to multiple containers is prohibited without shared coordination.
- The exact Nginx base is immutable, but the combined web image is built from the selected commit.
  A deployment must record that commit and locally built image ID.
- Existing Node, migration, AI, Prisma, and GitHub Action findings remain recorded. This ADR does
  not suppress them or call the demo a production-ready release.
- A public demo must use fictional, wipeable data and Razorpay Test Mode only.

## Rejected alternatives for this fast path

- API Gateway/Lambda: requires replacing Socket.IO, runtime lifecycle, fan-out, rate controls, and
  database connection behavior.
- ALB/ECS/RDS without a domain: still lacks the previously required certificate-valid origin TLS.
- Direct EC2 HTTP for browsers: secure cookies and HTTPS webhook requirements would fail.
- Running development mode publicly: rejected; the demo uses production validation with only the
  explicitly accepted origin-transport exception.
- Enabling local AI/RAG/workflow containers publicly: rejected by their current production guards
  and retained data/operations gates.

## Follow-up

1. The deployment pack and local verification are complete.
2. The exact manual AWS runbook and cost check are documented.
3. Obtain separate approval before any AWS access or provisioning.
4. After provisioning, run the public smoke, browser login/Socket.IO, worker, and Razorpay Test Mode
   checks before sharing the URL.

## Related decisions

- `docs/decisions/0013-phase-10-production-readiness-baseline.md`
- `docs/phase-10/PHASE-10-API-GATEWAY-LAMBDA-COMPATIBILITY-PROPOSAL.md`
- `docs/phase-10/PHASE-10-NO-DOMAIN-STRICT-HTTPS-ALTERNATIVES.md`
