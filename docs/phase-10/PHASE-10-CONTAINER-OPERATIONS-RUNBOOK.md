# Phase 10 Local Container Operations Runbook

## Scope and safety boundary

This runbook covers only the approved local/CI Compose topology with fictional data. It is not an
AWS deployment runbook and does not authorize cloud resources, real customer data, Razorpay Live
Mode, production AI, or acceptance of the remaining release findings. The current Compose policy is
deliberately `restart: "no"`, so a prolonged dependency failure exits API/worker rather than hiding
an uncontrolled restart loop.

## Prepare and start

1. Copy `compose.env.example` to the ignored `compose.env` file.
2. Fill its blank local credentials. URL-encode the application password in both database URLs.
3. Keep `DATABASE_PROBE_INTERVAL_MS` at 1000-60000 ms and
   `DATABASE_FAILURE_EXIT_MS` at 5000-300000 ms and at least the probe interval.
4. Start the application profile:

```powershell
docker compose --env-file compose.env --profile app up --detach --build
docker compose --env-file compose.env --profile app ps
```

To include the default-disabled local AI sidecar, supply both profiles:

```powershell
docker compose --env-file compose.env --profile app --profile ai up --detach --build
```

Only the API is exposed, on host loopback. MySQL is internal. A healthy API response requires a
successful database probe; TCP reachability alone is not readiness.

## Planned MySQL restart

Use Compose, not `docker restart`, so the declared restart dependencies are propagated:

```powershell
docker compose --env-file compose.env --profile app restart mysql
docker compose --env-file compose.env --profile app ps
```

If the AI profile is enabled, include it in the command context:

```powershell
docker compose --env-file compose.env --profile app --profile ai restart mysql
```

Wait until MySQL, API, and any enabled AI service are healthy before resuming use. The worker shares
the API network namespace and is recreated after the API dependency is healthy.

## Unexpected or raw MySQL interruption

During a short outage, API readiness returns `503` and the worker stops accepting new work. Neither
component replays an original mutation or job action. A successful later probe restores service
without process replacement.

If the outage lasts for `DATABASE_FAILURE_EXIT_MS`, API and worker terminate non-zero exactly once
and remain stopped. After MySQL is available, recover in dependency order:

```powershell
docker compose --env-file compose.env --profile app start mysql
docker compose --env-file compose.env --profile app up --detach --force-recreate api worker
docker compose --env-file compose.env --profile app ps
```

When the AI profile was enabled:

```powershell
docker compose --env-file compose.env --profile app --profile ai start mysql
docker compose --env-file compose.env --profile app --profile ai up --detach --force-recreate api worker ai
```

Do not mount the Docker socket into an application container and do not add an automatic replay of
the failed business operation. Investigate leases/audit evidence through the accepted Phase 5/6
paths if interruption occurred during work.

## Evidence drill

The mandatory drill creates unique credentials, project names, ports, and volumes, then removes all
of them even on failure:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docker/verify-compose-recovery.ps1
```

It is destructive only to its own synthetic disposable project. It must never be pointed at a real
Compose project or production data.

The image gate is expected to remain non-zero until every image finding is cleared:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docker/verify-images.ps1
```

A non-zero result must not be suppressed, waived, or treated as release acceptance.

## Stop and cleanup

Normal stop preserves the named local MySQL volume:

```powershell
docker compose --env-file compose.env --profile app stop
```

Remove local containers and networks while retaining data:

```powershell
docker compose --env-file compose.env --profile app down --remove-orphans
```

Deleting the MySQL volume is intentionally absent from this runbook because it destroys local data.
