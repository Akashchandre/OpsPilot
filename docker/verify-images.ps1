[CmdletBinding()]
param(
  [string]$DockerPath = "docker"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$images = [ordered]@{
  node      = "opspilot-node:phase10"
  migration = "opspilot-migration:phase10"
  ai        = "opspilot-ai:phase10"
  mysql     = "opspilot-mysql:phase10"
}

function Invoke-DockerChecked {
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

  if ($exitCode -ne 0) {
    throw "docker $($Arguments -join ' ') failed with exit code $exitCode.`n$($output -join "`n")"
  }

  return $output -join "`n"
}

function Invoke-ImageShellCheck {
  param(
    [Parameter(Mandatory)]
    [string]$Image,
    [Parameter(Mandatory)]
    [string]$Script,
    [string[]]$Environment = @()
  )

  $arguments = @("run", "--rm")
  foreach ($entry in $Environment) {
    $arguments += @("--env", $entry)
  }
  $normalizedScript = (($Script -split "\r?\n") | Where-Object { $_.Trim() }) -join "; "
  $arguments += @("--entrypoint", "sh", $Image, "-c", $normalizedScript)
  Invoke-DockerChecked -Arguments $arguments | Out-Null
}

$nodeCheck = @"
set -eu
test `$(id -u) = 1000
test `$(id -g) = 1000
dpkg-query -W libpcre2-8-0 | grep -q 10.42-1+deb12u1
test ! -u /usr/bin/mount
test ! -e /usr/bin/nsenter
test ! -e /usr/local/bin/npm
test ! -e /usr/local/bin/npx
"@
Invoke-ImageShellCheck -Image $images.node -Script $nodeCheck

$migrationCheck = @"
set -eu
test `$(id -u) = 1000
test `$(id -g) = 1000
dpkg-query -W libpcre2-8-0 | grep -q 10.42-1+deb12u1
test ! -u /usr/bin/mount
test ! -e /usr/bin/nsenter
test ! -e /usr/local/bin/npm
test ! -e /usr/local/bin/npx
test ! -e /app/apps/api/src
test ! -d /app/node_modules/tsx
test ! -d /app/node_modules/vitest
test ! -d /app/node_modules/eslint
test ! -d /app/node_modules/prettier
test ! -d /app/node_modules/mariadb
test ! -d /app/node_modules/@prisma/adapter-mariadb
"@
Invoke-ImageShellCheck -Image $images.migration -Script $migrationCheck

$migrationEnvironment = @(
  "DATABASE_URL=mysql://verification:verification@127.0.0.1:3306/verification",
  "SHADOW_DATABASE_URL=mysql://verification:verification@127.0.0.1:3306/verification_shadow"
)
$migrationVersionArguments = @("run", "--rm")
foreach ($entry in $migrationEnvironment) {
  $migrationVersionArguments += @("--env", $entry)
}
$migrationVersionArguments += @(
  "--entrypoint",
  "/app/node_modules/.bin/prisma",
  $images.migration,
  "-v"
)
$migrationVersion = Invoke-DockerChecked -Arguments $migrationVersionArguments
$expectedEngineHash = "e922089b7d7502aff4249d5da3420f6fa55fc6ad"
if ($migrationVersion -notmatch "Default Engines Hash\s*:\s*$expectedEngineHash") {
  throw "Migration image did not contain the approved Prisma engine hash $expectedEngineHash."
}

$schemaEngine = "/app/node_modules/@prisma/engines/schema-engine-debian-openssl-1.1.x"
$linkage = Invoke-DockerChecked -Arguments @(
  "run",
  "--rm",
  "--entrypoint",
  "ldd",
  $images.migration,
  $schemaEngine
)
if ($linkage -match "not found|libssl|libcrypto") {
  throw "Migration schema-engine linkage changed or contains an unresolved/OpenSSL dependency.`n$linkage"
}

$aiCheck = @"
set -eu
test `$(id -u) = 10002
test `$(id -g) = 10002
dpkg-query -W libpcre2-8-0 | grep -q 10.42-1+deb12u1
test ! -u /usr/bin/mount
test ! -e /usr/bin/nsenter
test ! -e /usr/local/bin/pip
test ! -e /usr/local/bin/pip3
test ! -e /usr/local/bin/pip3.13
test ! -d /usr/local/lib/python3.13/site-packages/pip
test ! -d /opt/venv/lib/python3.13/site-packages/pip
test ! -e /usr/local/lib/python3.13/site-packages/pip/_vendor/bom.cdx.json
test ! -e /opt/venv/lib/python3.13/site-packages/pip/_vendor/bom.cdx.json
"@
Invoke-ImageShellCheck -Image $images.ai -Script $aiCheck
$aiMetadataCheck = @"
import importlib.metadata as metadata
installed = {distribution.metadata['Name'].lower() for distribution in metadata.distributions()}
assert not installed.intersection({'pip', 'setuptools', 'msgpack'})
import fastapi
import httpx
import uvicorn
"@
$aiMetadataCheck = (($aiMetadataCheck -split "\r?\n") | Where-Object { $_.Trim() }) -join "; "
Invoke-DockerChecked -Arguments @(
  "run",
  "--rm",
  "--entrypoint",
  "python",
  $images.ai,
  "-c",
  $aiMetadataCheck
) | Out-Null

$mysqlCheck = @"
set -eu
test `$(id -u) = 999
test `$(id -g) = 999
test "`$MYSQL_MAJOR" = 8.4
test "`$MYSQL_VERSION" = 8.4.11-1.el9
sha256sum /usr/local/bin/docker-entrypoint.sh | grep -q '^30f0e863cd9de49752045c01b2e4a4e3e065da48889d464a65ceeb4d69be4e5a  /usr/local/bin/docker-entrypoint.sh`$'
rpm -q mysql-community-server-minimal | grep -qx mysql-community-server-minimal-8.4.11-1.el9.x86_64
rpm -q openssl-libs | grep -qx openssl-libs-3.5.5-5.0.1.el9_8.x86_64
rpm -q glibc | grep -qx glibc-2.34-274.0.1.el9_8.x86_64
rpm -q curl | grep -q 7.76.1-40.el9_8.5
rpm -q libcurl | grep -q 7.76.1-40.el9_8.5
rpm -q sqlite-libs | grep -q 3.34.1-11.el9_8
! rpm -q mysql-shell
test ! -e /usr/local/bin/gosu
"@
Invoke-ImageShellCheck -Image $images.mysql -Script $mysqlCheck

$mysqlConfig = Invoke-DockerChecked -Arguments @(
  "image",
  "inspect",
  "--format",
  "{{json .Config}}",
  $images.mysql
) | ConvertFrom-Json
if ($mysqlConfig.User -ne "999:999") {
  throw "MySQL image user changed from the approved 999:999 identity."
}
if (($mysqlConfig.Entrypoint -join " ") -ne "docker-entrypoint.sh") {
  throw "MySQL image entrypoint changed from docker-entrypoint.sh."
}
if (($mysqlConfig.Cmd -join " ") -ne "mysqld") {
  throw "MySQL image command changed from mysqld."
}
if (-not $mysqlConfig.ExposedPorts."3306/tcp" -or -not $mysqlConfig.ExposedPorts."33060/tcp") {
  throw "MySQL image no longer exposes both approved MySQL ports."
}
if (-not $mysqlConfig.Volumes."/var/lib/mysql") {
  throw "MySQL image no longer declares the approved data volume."
}
$mysqlEnvironment = @($mysqlConfig.Env)
if (($mysqlEnvironment | Where-Object { $_ -like "GOSU_VERSION=*" }) -or
    ($mysqlEnvironment | Where-Object { $_ -like "MYSQL_SHELL_VERSION=*" })) {
  throw "MySQL image retained obsolete gosu or mysql-shell environment metadata."
}

$mysqlHistory = Invoke-DockerChecked -Arguments @(
  "history",
  "--no-trunc",
  "--format",
  "{{.CreatedBy}}",
  $images.mysql
)
if ($mysqlHistory -match "(?i)gosu|mysql-shell") {
  throw "MySQL final image history still contains gosu or mysql-shell lower-layer instructions."
}

Write-Output "Image content and Prisma dynamic-link checks passed."

$scanBlocked = $false
foreach ($image in $images.GetEnumerator()) {
  $temporarySbomName = "opspilot-$($image.Key)-$([guid]::NewGuid().ToString('N')).spdx.json"
  $temporarySbom = Join-Path ([System.IO.Path]::GetTempPath()) $temporarySbomName
  try {
    Invoke-DockerChecked -Arguments @(
      "scout",
      "sbom",
      "--format",
      "spdx",
      "--output",
      $temporarySbom,
      "local://$($image.Value)"
    ) | Out-Null
    if ((Get-Item -LiteralPath $temporarySbom).Length -eq 0) {
      throw "Docker Scout generated an empty SPDX SBOM for $($image.Value)."
    }
    if ($image.Key -eq "mysql") {
      $mysqlSbom = Get-Content -LiteralPath $temporarySbom -Raw
      if ($mysqlSbom -match "(?i)gosu") {
        throw "MySQL final SBOM still contains a gosu path or package reference."
      }
      if ($mysqlSbom -match "(?i)pkg:golang/") {
        throw "MySQL final SBOM still contains one or more Go packages."
      }
    }

    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      $scanArguments = @(
        "scout",
        "cves",
        "--only-severity",
        "critical,high",
        "--exit-code",
        "--format",
        "packages",
        "local://$($image.Value)"
      )
      $scanOutput = @(
        & $DockerPath @scanArguments 2>&1 |
          ForEach-Object { "$_" }
      )
      $scanExitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousErrorAction
    }

    $scanOutput | Write-Output
    if ($scanExitCode -eq 2) {
      $scanBlocked = $true
      Write-Warning "$($image.Value) retains critical/high findings."
    } elseif ($scanExitCode -ne 0) {
      throw "Docker Scout failed for $($image.Value) with exit code $scanExitCode."
    }
  } finally {
    if (Test-Path -LiteralPath $temporarySbom) {
      Remove-Item -LiteralPath $temporarySbom -Force
    }
  }
}

if ($scanBlocked) {
  throw "The Batch 10E image gate is blocked by residual critical/high findings. No finding is accepted."
}

Write-Output "All Batch 10E image gates passed."
