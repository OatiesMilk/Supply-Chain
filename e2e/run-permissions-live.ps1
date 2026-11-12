param([int]$FrontendPort = 3000, [int]$ApiPort = 4000)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$artifacts = Join-Path $PSScriptRoot 'test-results/permissions-live-services'
$apiProcess = $null
$previewProcess = $null
$previousTarget = $env:PERMISSION_LIVE_DATABASE_URL
$previousConfirmation = $env:PERMISSION_LIVE_CONFIRM_DATABASE
$previousNodeOptions = $env:NODE_OPTIONS
$previousFrontendPort = $env:PERMISSION_LIVE_FRONTEND_PORT
$previousApiPort = $env:PERMISSION_LIVE_API_PORT
$previousBase = $env:PERMISSION_LIVE_BASE_URL
if (-not (($FrontendPort -eq 3000 -and $ApiPort -eq 4000) -or ($FrontendPort -eq 3001 -and $ApiPort -eq 4001))) { throw 'Unsupported isolated test port pair' }
if (-not $previousTarget) { throw 'Set PERMISSION_LIVE_DATABASE_URL to the dedicated migrated and seeded gh250_live_test database' }
if (Get-NetTCPConnection -State Listen -LocalPort $FrontendPort,$ApiPort -ErrorAction SilentlyContinue) {
  throw 'Required ports are occupied. Refusing to start duplicate application services.'
}
New-Item -ItemType Directory -Force -Path $artifacts | Out-Null
try {
  $env:NODE_OPTIONS = '--dns-result-order=ipv4first'
  $env:PERMISSION_LIVE_CONFIRM_DATABASE = 'gh250_live_test'
  $env:PERMISSION_LIVE_FRONTEND_PORT = [string]$FrontendPort
  $env:PERMISSION_LIVE_API_PORT = [string]$ApiPort
  $env:PERMISSION_LIVE_BASE_URL = "http://127.0.0.1:$FrontendPort"
  $apiProcess = Start-Process -FilePath $node -ArgumentList @('--import','tsx','e2e/fixtures/permissions-live-server.cjs') `
    -WorkingDirectory $workspace -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $artifacts 'api.log') -RedirectStandardError (Join-Path $artifacts 'api-errors.log')
  $previewProcess = Start-Process -FilePath $node -ArgumentList @('../node_modules/vite/bin/vite.js','preview','--config','../e2e/fixtures/permissions-live-vite.config.ts') `
    -WorkingDirectory (Join-Path $workspace 'client') -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $artifacts 'preview.log') -RedirectStandardError (Join-Path $artifacts 'preview-errors.log')
  @{ apiPid = $apiProcess.Id; previewPid = $previewProcess.Id } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $artifacts 'owned-processes.json')
  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($apiProcess.HasExited -or $previewProcess.HasExited) { throw 'An owned test service exited; inspect local service logs.' }
    try {
      $health = Invoke-RestMethod -Uri "$env:PERMISSION_LIVE_BASE_URL/api/health" -TimeoutSec 2
      if ($health.ok) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 250 }
  }
  if (-not $ready) { throw 'The isolated application did not become ready.' }
  Push-Location $PSScriptRoot
  try {
    & $node 'node_modules/@playwright/test/cli.js' test --config permissions-live.config.ts
    $testExit = $LASTEXITCODE
  } finally { Pop-Location }
} finally {
  foreach ($owned in @($previewProcess, $apiProcess)) {
    if ($owned -and -not $owned.HasExited) { Stop-Process -Id $owned.Id -ErrorAction SilentlyContinue }
  }
  $env:PERMISSION_LIVE_DATABASE_URL = $previousTarget
  $env:PERMISSION_LIVE_CONFIRM_DATABASE = $previousConfirmation
  $env:NODE_OPTIONS = $previousNodeOptions
  $env:PERMISSION_LIVE_FRONTEND_PORT = $previousFrontendPort
  $env:PERMISSION_LIVE_API_PORT = $previousApiPort
  $env:PERMISSION_LIVE_BASE_URL = $previousBase
}
exit $testExit
