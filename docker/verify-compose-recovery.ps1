[CmdletBinding()]
param(
  [string]$DockerPath = "docker"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-DockerRaw {
  param(
    [Parameter(Mandatory)]
    [string[]]$Arguments
  )

  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = @(& $DockerPath @Arguments 2>&1 | ForEach-Object { "$_" })
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorAction
  }

  return [pscustomobject]@{
    ExitCode = $exitCode
    Output   = $output -join "`n"
  }
}

function Invoke-DockerChecked {
  param(
    [Parameter(Mandatory)]
    [string[]]$Arguments
  )

  $result = Invoke-DockerRaw -Arguments $Arguments
  if ($result.ExitCode -ne 0) {
    throw "docker $($Arguments -join ' ') failed with exit code $($result.ExitCode).`n$($result.Output)"
  }
  return $result.Output
}

function Wait-ForCondition {
  param(
    [Parameter(Mandatory)]
    [scriptblock]$Condition,
    [Parameter(Mandatory)]
    [int]$TimeoutSeconds,
    [Parameter(Mandatory)]
    [string]$FailureMessage
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    try {
      if (& $Condition) { return }
    } catch {
      # Dependency transitions are expected during these disposable failure drills.
    }
    Start-Sleep -Milliseconds 500
  } while ([DateTime]::UtcNow -lt $deadline)

  throw $FailureMessage
}

function New-FreeLoopbackPort {
  $listener = [System.Net.Sockets.TcpListener]::new(
    [System.Net.IPAddress]::Loopback,
    0
  )
  $listener.Start()
  try {
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

$runId = [guid]::NewGuid().ToString("N")
$projectName = "opspilot10e$($runId.Substring(0, 12))"
$environmentPath = Join-Path ([System.IO.Path]::GetTempPath()) "$projectName.env"
$hostPort = New-FreeLoopbackPort
$rootPassword = "root$runId"
$applicationPassword = "app$runId"
$startupCanary = "startup-canary-$runId"
$auditBytes = New-Object byte[] 32
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$random.GetBytes($auditBytes)
$random.Dispose()
$auditKey = [Convert]::ToBase64String($auditBytes)

$environmentLines = @(
  "OPSPILOT_COMPOSE_MYSQL_ROOT_PASSWORD=$rootPassword",
  "OPSPILOT_COMPOSE_MYSQL_PASSWORD=$applicationPassword",
  "OPSPILOT_COMPOSE_DATABASE_URL=mysql://opspilot:$applicationPassword@mysql:3306/opspilot_compose",
  "OPSPILOT_COMPOSE_SHADOW_DATABASE_URL=mysql://opspilot:$applicationPassword@mysql:3306/opspilot_shadow",
  "OPSPILOT_COMPOSE_DATABASE_PROBE_INTERVAL_MS=1000",
  "OPSPILOT_COMPOSE_DATABASE_FAILURE_EXIT_MS=30000",
  "OPSPILOT_COMPOSE_AUDIT_INTEGRITY_KEY=$auditKey",
  "OPSPILOT_COMPOSE_AUDIT_INTEGRITY_KEY_ID=batch-10e-disposable",
  "OPSPILOT_COMPOSE_CORS_ORIGIN=http://127.0.0.1:$hostPort",
  "OPSPILOT_COMPOSE_API_HOST_PORT=$hostPort",
  "OPSPILOT_COMPOSE_AI_ENABLED=false",
  "OPSPILOT_COMPOSE_AI_SIGNING_KEY=$auditKey",
  "OPSPILOT_COMPOSE_AI_SIGNING_KEY_ID=batch-10e-ai"
)
[System.IO.File]::WriteAllLines($environmentPath, $environmentLines)

$composePrefix = @(
  "compose",
  "--project-name",
  $projectName,
  "--env-file",
  $environmentPath,
  "--profile",
  "app",
  "--profile",
  "ai"
)

function Invoke-ComposeChecked {
  param([Parameter(Mandatory)][string[]]$Arguments)
  return Invoke-DockerChecked -Arguments ($composePrefix + $Arguments)
}

function Invoke-ComposeRaw {
  param([Parameter(Mandatory)][string[]]$Arguments)
  return Invoke-DockerRaw -Arguments ($composePrefix + $Arguments)
}

function Get-ContainerId {
  param([Parameter(Mandatory)][string]$Service)
  return (Invoke-ComposeChecked -Arguments @("ps", "--all", "--quiet", $Service)).Trim()
}

function Get-ContainerState {
  param([Parameter(Mandatory)][string]$ContainerId)
  return (Invoke-DockerChecked -Arguments @("inspect", "--format", "{{.State.Status}}", $ContainerId)).Trim()
}

function Get-ContainerStartedAt {
  param([Parameter(Mandatory)][string]$ContainerId)
  return (Invoke-DockerChecked -Arguments @("inspect", "--format", "{{.State.StartedAt}}", $ContainerId)).Trim()
}

function Get-HealthStatusCode {
  try {
    $response = Invoke-WebRequest `
      -UseBasicParsing `
      -Uri "http://127.0.0.1:$hostPort/api/v1/health" `
      -TimeoutSec 3
    return [int]$response.StatusCode
  } catch {
    if ($_.Exception.Response) {
      return [int]$_.Exception.Response.StatusCode
    }
    return 0
  }
}

function Test-ApiHealthy {
  if ((Get-HealthStatusCode) -ne 200) { return $false }
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$hostPort/api/v1/health" -TimeoutSec 3
    return $health.success -and $health.data.status -eq "ok" -and $health.data.database -eq "reachable"
  } catch {
    return $false
  }
}

function Test-ContainerHealthy {
  param([Parameter(Mandatory)][string]$ContainerId)
  $health = Invoke-DockerChecked -Arguments @(
    "inspect",
    "--format",
    "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
    $ContainerId
  )
  return $health.Trim() -eq "healthy"
}

function Invoke-MySql {
  param([Parameter(Mandatory)][string]$Statement)
  return Invoke-ComposeChecked -Arguments @(
    "exec",
    "-T",
    "-e",
    "MYSQL_PWD=$rootPassword",
    "mysql",
    "mysql",
    "-uroot",
    "--batch",
    "--skip-column-names",
    "-e",
    $Statement
  )
}

function Get-LatestWorkerId {
  $logs = Invoke-ComposeChecked -Arguments @("logs", "--no-color", "worker")
  $matches = [regex]::Matches($logs, '"event":"worker.started".*?"workerId":"([^"]+)"')
  if ($matches.Count -eq 0) { throw "No safe worker registration event was found." }
  return $matches[$matches.Count - 1].Groups[1].Value
}

try {
  Invoke-ComposeChecked -Arguments @(
    "up",
    "--detach",
    "--wait",
    "--wait-timeout",
    "180",
    "mysql",
    "migrate",
    "api",
    "worker",
    "ai"
  ) | Out-Null

  Wait-ForCondition -TimeoutSeconds 30 -FailureMessage "The initial API did not become healthy." -Condition {
    Test-ApiHealthy
  }

  $mysqlId = Get-ContainerId -Service "mysql"
  $apiId = Get-ContainerId -Service "api"
  $workerId = Get-ContainerId -Service "worker"
  $aiId = Get-ContainerId -Service "ai"
  $firstWorkerRegistration = Get-LatestWorkerId

  $migrationCount = (Invoke-MySql -Statement "SELECT COUNT(*) FROM opspilot_compose._prisma_migrations WHERE finished_at IS NOT NULL;").Trim()
  if ($migrationCount -ne "15") { throw "Expected 15 completed migrations, found $migrationCount." }

  $secondMigration = Invoke-ComposeChecked -Arguments @("run", "--rm", "migrate", "migrate", "deploy")
  if ($secondMigration -notmatch "No pending migrations to apply") {
    throw "The second migration deployment was not a no-op."
  }

  Invoke-MySql -Statement (
    "CREATE TABLE IF NOT EXISTS opspilot_compose.batch_10e_probe " +
    "(id INT PRIMARY KEY, marker VARCHAR(32) NOT NULL); " +
    "INSERT INTO opspilot_compose.batch_10e_probe (id, marker) VALUES (1, 'preserved') " +
    "ON DUPLICATE KEY UPDATE marker = VALUES(marker);"
  ) | Out-Null

  $startupFailure = Invoke-ComposeRaw -Arguments @(
    "run",
    "--rm",
    "--no-deps",
    "-e",
    "DATABASE_URL=mysql://opspilot:$startupCanary@127.0.0.1:1/unavailable",
    "api"
  )
  if ($startupFailure.ExitCode -eq 0) { throw "The startup-unavailable API unexpectedly succeeded." }
  if ($startupFailure.Output -notmatch '"event":"database.startup_probe_failed"' -or
      $startupFailure.Output -notmatch '"event":"service.start_failed"') {
    throw "The startup-unavailable API did not emit both safe lifecycle events."
  }
  if ($startupFailure.Output -match [regex]::Escape($startupCanary)) {
    throw "The startup-unavailable API exposed database credential material."
  }

  $apiStartedBeforePause = Get-ContainerStartedAt -ContainerId $apiId
  $workerStartedBeforePause = Get-ContainerStartedAt -ContainerId $workerId
  Invoke-DockerChecked -Arguments @("pause", $mysqlId) | Out-Null
  Start-Sleep -Seconds 2
  Invoke-DockerChecked -Arguments @("unpause", $mysqlId) | Out-Null
  Wait-ForCondition -TimeoutSeconds 30 -FailureMessage "The API did not recover after the short outage." -Condition {
    Test-ApiHealthy
  }
  if ((Get-ContainerStartedAt -ContainerId $apiId) -ne $apiStartedBeforePause -or
      (Get-ContainerStartedAt -ContainerId $workerId) -ne $workerStartedBeforePause) {
    throw "A short database pause unexpectedly replaced the API or worker process."
  }

  $reads = @()
  try {
    $reads = @(1..8 | ForEach-Object {
      $request = [System.Net.WebRequest]::Create("http://127.0.0.1:$hostPort/api/v1/health")
      $request.Timeout = 5000
      [pscustomobject]@{
        Request = $request
        Result  = $request.BeginGetResponse($null, $null)
      }
    })
    foreach ($read in $reads) {
      if (-not $read.Result.AsyncWaitHandle.WaitOne(10000)) {
        throw "A concurrent health read did not finish within the bound."
      }
      $response = $read.Request.EndGetResponse($read.Result)
      try {
        if ([int]$response.StatusCode -ne 200) {
          throw "A concurrent health read returned a non-success status."
        }
      } finally {
        $response.Dispose()
      }
    }
  } finally {
    foreach ($read in $reads) {
      $read.Result.AsyncWaitHandle.Dispose()
    }
  }

  $apiStartedBeforeComposeRestart = Get-ContainerStartedAt -ContainerId $apiId
  $workerStartedBeforeComposeRestart = Get-ContainerStartedAt -ContainerId $workerId
  $aiStartedBeforeComposeRestart = Get-ContainerStartedAt -ContainerId $aiId
  Invoke-ComposeChecked -Arguments @("restart", "mysql") | Out-Null
  Wait-ForCondition -TimeoutSeconds 90 -FailureMessage "The stack did not recover after Compose restarted MySQL." -Condition {
    (Test-ApiHealthy) -and
    (Get-ContainerState -ContainerId $workerId) -eq "running" -and
    (Test-ContainerHealthy -ContainerId $aiId)
  }
  if ((Get-ContainerStartedAt -ContainerId $apiId) -eq $apiStartedBeforeComposeRestart -or
      (Get-ContainerStartedAt -ContainerId $workerId) -eq $workerStartedBeforeComposeRestart -or
      (Get-ContainerStartedAt -ContainerId $aiId) -eq $aiStartedBeforeComposeRestart) {
    throw "Compose did not propagate the explicit MySQL restart to API, worker, and AI."
  }

  Invoke-DockerChecked -Arguments @("stop", "--time", "10", $mysqlId) | Out-Null
  Wait-ForCondition -TimeoutSeconds 45 -FailureMessage "The API did not expose a safe unavailable state." -Condition {
    (Get-HealthStatusCode) -eq 503
  }

  try {
    Invoke-WebRequest `
      -UseBasicParsing `
      -Uri "http://127.0.0.1:$hostPort/api/v1/auth/login" `
      -Method Post `
      -Headers @{ Origin = "http://127.0.0.1:$hostPort" } `
      -ContentType "application/json" `
      -Body '{"email":"synthetic@example.com","password":"not-used"}' `
      -TimeoutSec 3 | Out-Null
    throw "An unavailable API accepted an ambiguous mutation request."
  } catch {
    if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 503) {
      throw
    }
  }

  Wait-ForCondition -TimeoutSeconds 120 -FailureMessage "API/worker did not exit after the prolonged outage." -Condition {
    (Get-ContainerState -ContainerId $apiId) -eq "exited" -and
    (Get-ContainerState -ContainerId $workerId) -eq "exited"
  }
  $apiExitCode = [int](Invoke-DockerChecked -Arguments @("inspect", "--format", "{{.State.ExitCode}}", $apiId)).Trim()
  $workerExitCode = [int](Invoke-DockerChecked -Arguments @("inspect", "--format", "{{.State.ExitCode}}", $workerId)).Trim()
  if ($apiExitCode -eq 0 -or $workerExitCode -eq 0) {
    throw "A prolonged database outage did not produce non-zero API and worker exits."
  }

  Invoke-DockerChecked -Arguments @("start", $mysqlId) | Out-Null
  Wait-ForCondition -TimeoutSeconds 60 -FailureMessage "MySQL did not recover after the raw interruption." -Condition {
    Test-ContainerHealthy -ContainerId $mysqlId
  }
  Invoke-ComposeChecked -Arguments @(
    "up",
    "--detach",
    "--force-recreate",
    "--wait",
    "--wait-timeout",
    "120",
    "api",
    "worker",
    "ai"
  ) | Out-Null
  Wait-ForCondition -TimeoutSeconds 30 -FailureMessage "The recreated stack did not become healthy." -Condition {
    Test-ApiHealthy
  }

  $secondWorkerRegistration = Get-LatestWorkerId
  if ($secondWorkerRegistration -eq $firstWorkerRegistration) {
    throw "The recreated worker reused its prior registration identity."
  }
  $marker = (Invoke-MySql -Statement "SELECT marker FROM opspilot_compose.batch_10e_probe WHERE id = 1;").Trim()
  if ($marker -ne "preserved") { throw "The persistence marker did not survive database restarts." }

  Invoke-ComposeChecked -Arguments @("stop", "worker", "ai", "api") | Out-Null
  $apiId = Get-ContainerId -Service "api"
  $workerId = Get-ContainerId -Service "worker"
  $apiExitCode = [int](Invoke-DockerChecked -Arguments @("inspect", "--format", "{{.State.ExitCode}}", $apiId)).Trim()
  $workerExitCode = [int](Invoke-DockerChecked -Arguments @("inspect", "--format", "{{.State.ExitCode}}", $workerId)).Trim()
  if ($apiExitCode -ne 0 -or $workerExitCode -ne 0) {
    throw "The final graceful API/worker shutdown did not exit cleanly."
  }

  Write-Output "Batch 10E disposable Compose recovery gate passed."
  Write-Output "Migrations=15; startup-fail-closed=pass; short-outage=pass; compose-restart=pass; prolonged-outage=pass; persistence=pass; graceful-shutdown=pass"
} catch {
  try {
    Write-Warning "Disposable Compose state at failure:"
    Invoke-ComposeChecked -Arguments @("ps", "--all") | Write-Warning
    Write-Warning "Safe API/worker/AI lifecycle logs at failure:"
    Invoke-ComposeChecked -Arguments @(
      "logs",
      "--no-color",
      "--tail",
      "120",
      "api",
      "worker",
      "ai"
    ) | Write-Warning
  } catch {
    Write-Warning "Disposable failure diagnostics could not be collected."
  }
  throw
} finally {
  $cleanup = Invoke-ComposeRaw -Arguments @("down", "--volumes", "--remove-orphans", "--timeout", "20")
  if ($cleanup.ExitCode -ne 0) {
    Write-Warning "Disposable Compose cleanup failed for project $projectName."
  }
  if (Test-Path -LiteralPath $environmentPath) {
    Remove-Item -LiteralPath $environmentPath -Force
  }
}
