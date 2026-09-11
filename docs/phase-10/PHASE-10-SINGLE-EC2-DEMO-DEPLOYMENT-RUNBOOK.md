# Phase 10 Single-EC2 CloudFront Demo Deployment Runbook

## Scope

This is the exact manual runbook for the approved **personal demo** profile in `us-east-1`:

```text
Browser -- HTTPS/WSS --> generated CloudFront hostname
                              |
                              | HTTP port 80 (accepted demo exception)
                              v
                  one EC2 Ubuntu x86_64 host
                              |
                   unprivileged Nginx :8080
                    |       |          |
                  React   Express   Socket.IO
                              |
                       worker + MySQL volume
```

It does not authorize AWS access or provisioning. Do not perform the AWS steps until the owner
separately approves provisioning. It is not the ADR 0013 production topology and has no HA claim.

## Local verification evidence

On 2026-09-11, before any AWS access:

- the exact Nginx web image built and ran as `101:101` with only port 8080 exposed;
- Docker Compose configuration and fresh migrations passed in a disposable production-mode stack;
- MySQL, API, and Nginx health passed and the worker completed scheduled jobs;
- the SPA, `/api/v1/health`, and authenticated `/api/v1/socket.io` WebSocket path passed through
  Nginx;
- Linux script syntax, placeholder rejection, Nginx syntax, lint, formatting/Prisma validation,
  the production web build, 225 API tests, and 53 web tests passed; and
- the disposable synthetic database volume was removed after verification.

This evidence proves the repository pack locally. It does not prove CloudFront behavior, AWS
network policy, Razorpay webhook delivery, account credits, backup/restore, or public browser use;
those checks occur only after separately authorized provisioning.

## What the owner must have

- AWS console access with MFA and the ability to launch EC2, allocate one Elastic IP, edit security
  groups, and create one CloudFront distribution.
- The public GitHub repository URL and the exact commit to deploy.
- Razorpay **Test Mode** key ID/secret and a new separate Test Mode webhook secret.
- An owner display name and email. The owner password is entered interactively later.
- A local record of the reported AWS credit balance and expiry immediately before launch.

Never send passwords, Razorpay secrets, `demo.env`, cookies, or AWS credentials in chat or commit
them to Git.

## Expected demo cost

Before launching, confirm prices in the AWS calculator/console. The planning estimate is:

- `t3.medium` Linux in `us-east-1`: about USD 0.0418/hour, approximately USD 30.51 for 730 hours;
- one public IPv4/Elastic IP: USD 0.005/hour, approximately USD 3.65 for 730 hours;
- 30 GiB `gp3`, CloudFront requests/transfer, snapshots, and tax: additional usage-priced items.

Use a budget threshold below the remaining credit and terminate/release resources when the demo is
finished. Credits and Free Plan eligibility are not guaranteed by this repository.

## 1. Launch the EC2 host — future approved AWS step

In the AWS console, region `us-east-1`:

1. Open **EC2 → Instances → Launch instances**.
2. Name it `opspilot-personal-demo`.
3. Select **Ubuntu Server 24.04 LTS**, x86_64.
4. Select `t3.medium`.
5. Select or create a key pair, or plan to use EC2 Instance Connect.
6. Use the default VPC and a public subnet with automatic public IPv4 enabled.
7. Create a security group named `opspilot-demo-ec2`:
   - SSH TCP 22: **My IP** only.
   - HTTP TCP 80: the AWS-managed prefix list
     `com.amazonaws.global.cloudfront.origin-facing`.
   - No public MySQL, API 4000, or Nginx 8080 rule.
8. Configure 30 GiB encrypted `gp3`. Keep **Delete on termination** off if the demo database must
   survive instance replacement; remember that retained EBS continues to cost money.
9. Launch the instance.
10. Allocate one Elastic IP and associate it with the instance. Record the resulting EC2 **Public
    IPv4 DNS** name; CloudFront needs the DNS name, not a raw IP.

If the managed prefix list cannot be selected because of security-group rule quota, stop and fix
the quota/rules. Do not expose ports 4000 or 3306.

## 2. Create CloudFront — future approved AWS step

The origin can be configured while the application is still offline.

1. Open **CloudFront → Distributions → Create distribution**.
2. Use the EC2 Public IPv4 DNS name as a **custom origin**.
3. Set origin protocol to **HTTP only**, port `80`.
4. Default behavior:
   - Viewer protocol: **Redirect HTTP to HTTPS**.
   - Allowed methods: `GET, HEAD, OPTIONS`.
   - Cache policy: `CachingOptimized`.
5. Add an ordered behavior for `/api/*`:
   - Same EC2 origin.
   - Viewer protocol: **Redirect HTTP to HTTPS**.
   - Allowed methods: `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE`.
   - Cache policy: `CachingDisabled`.
   - Origin request policy: `AllViewer` so cookies, query strings, `Origin`, CSRF, and WebSocket
     headers reach Nginx/API.
6. Set default root object to `index.html`.
7. Do not add a custom domain or certificate.
8. Create the distribution and wait for **Deployed**.
9. Record its hostname, for example `d111111abcdef8.cloudfront.net`.

CloudFront supports WebSockets when the required viewer headers are forwarded. The application uses
`/api/v1/socket.io`, which is covered by `/api/*`.

## 3. Install Docker on EC2 — future approved AWS step

Connect through EC2 Instance Connect or SSH and run the official Docker apt-repository setup:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Disconnect and reconnect so Docker group membership applies, then verify:

```bash
docker version
docker compose version
```

## 4. Clone the exact repository commit

```bash
git clone YOUR_PUBLIC_GITHUB_REPOSITORY_URL OpsPilot
cd OpsPilot
git fetch --tags --prune
git checkout YOUR_APPROVED_COMMIT
git status --short
```

The final command should be empty on a fresh checkout.

## 5. Create the private demo environment

```bash
cp demo.env.example demo.env
chmod 600 demo.env
openssl rand -hex 24
openssl rand -hex 24
openssl rand -base64 32
nano demo.env
```

Use the first hexadecimal value as both occurrences of the application MySQL password, including
inside both MySQL URLs. Use the second as the MySQL root password. Use the Base64 value as the audit
integrity key.

Set:

```text
OPSPILOT_DEMO_PUBLIC_ORIGIN=https://YOUR-DISTRIBUTION.cloudfront.net
OPSPILOT_DEMO_HTTP_PORT=80
OPSPILOT_DEMO_RAZORPAY_KEY_ID=rzp_test_...
OPSPILOT_DEMO_RAZORPAY_KEY_SECRET=...
OPSPILOT_DEMO_RAZORPAY_WEBHOOK_SECRET=...
```

Do not use quotes or a trailing slash on the public origin. Do not enable AI, documents, or
workflows.

## 6. Build and start

```bash
sh docker/demo-deploy.sh demo.env
```

Wait until `mysql`, `api`, and `web` are healthy and the worker is running:

```bash
docker compose --env-file demo.env -f compose.yaml -f compose.demo.yaml --profile app ps
docker compose --env-file demo.env -f compose.yaml -f compose.demo.yaml --profile app logs --tail 100 api worker web
```

The migration container should exit successfully with code `0`. It is not a long-running service.

## 7. Bootstrap the owner

Run once in an interactive terminal:

```bash
sh docker/demo-bootstrap-owner.sh demo.env --display-name "Business Owner" --email owner@example.com
```

Enter and confirm the password when prompted. The password is not accepted as a command argument or
environment value.

## 8. Run public smoke checks

```bash
sh docker/demo-smoke.sh https://YOUR-DISTRIBUTION.cloudfront.net
```

Then use a real browser:

1. Open the CloudFront HTTPS URL.
2. Confirm the fictional-data and `TEST MODE — NO REAL MONEY` labels.
3. Log in as the owner.
4. Confirm **Notifications** changes from Connecting to Live.
5. Create a product and inventory, register a separate customer, place an order, and confirm the
   worker processes its jobs.
6. Test refresh on `/login`, `/products`, and one protected route; the SPA must still load.

## 9. Configure Razorpay Test Mode webhook

In the Razorpay **Test Mode** dashboard only:

- URL:
  `https://YOUR-DISTRIBUTION.cloudfront.net/api/v1/payments/webhooks/razorpay`
- Secret: exactly the value in `OPSPILOT_DEMO_RAZORPAY_WEBHOOK_SECRET`.
- Enable only:
  - `payment.authorized`
  - `payment.captured`
  - `payment.failed`
  - `order.paid`
  - `refund.created`
  - `refund.processed`
  - `refund.failed`
- Confirm automatic capture.

Complete one fictional Test Mode checkout. No real card/payment data is permitted.

## Operations

Status and logs:

```bash
docker compose --env-file demo.env -f compose.yaml -f compose.demo.yaml --profile app ps
docker compose --env-file demo.env -f compose.yaml -f compose.demo.yaml --profile app logs --tail 200
```

Deploy a later approved commit:

```bash
git fetch --tags --prune
git checkout YOUR_NEW_APPROVED_COMMIT
sh docker/demo-deploy.sh demo.env
```

Restart without rebuilding:

```bash
docker compose --env-file demo.env -f compose.yaml -f compose.demo.yaml --profile app restart
```

Stop while keeping MySQL data:

```bash
docker compose --env-file demo.env -f compose.yaml -f compose.demo.yaml --profile app stop
```

Remove containers/networks while keeping MySQL data:

```bash
docker compose --env-file demo.env -f compose.yaml -f compose.demo.yaml --profile app down --remove-orphans
```

This runbook deliberately omits volume deletion. Deleting the named MySQL volume destroys the demo
database.

## Rollback

1. Record the current commit before updating: `git rev-parse HEAD`.
2. If the update fails, check out the prior commit.
3. Run `sh docker/demo-deploy.sh demo.env` again.
4. If a migration was applied, do not assume application rollback reverses it. Restore the prior
   EBS snapshot/database backup or use a separately reviewed forward repair.

## Shut down billing

When the demo is finished:

1. Stop sharing the URL.
2. Take an EBS snapshot only if the fictional demo data is worth retaining.
3. Terminate the EC2 instance.
4. Delete or retain the EBS volume intentionally.
5. Release the Elastic IP.
6. Disable/delete the CloudFront distribution after it is disabled.
7. Remove any snapshots that are no longer required.
8. Confirm in Cost Explorer/Public IP Insights that no demo resource remains billable.

## Local source references

- `compose.demo.yaml`
- `demo.env.example`
- `docker/web.Dockerfile`
- `docker/nginx.demo.conf`
- `docker/demo-deploy.sh`
- `docker/demo-bootstrap-owner.sh`
- `docker/demo-smoke.sh`
- `docs/decisions/0014-single-ec2-cloudfront-personal-demo.md`

## Official references

- [Use WebSockets with CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-working-with.websockets.html)
- [CloudFront custom-origin request behavior](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RequestAndResponseBehaviorCustomOrigin.html)
- [CloudFront cache behaviors](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html)
- [CloudFront origin-facing managed prefix list](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/LocationsOfEdgeServers.html#managed-prefix-list)
- [Docker Engine installation on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [EC2 T3 instance sizes and `us-east-1` Linux prices](https://aws.amazon.com/ec2/instance-types/t3/)
- [Public IPv4 pricing](https://aws.amazon.com/vpc/pricing/)
