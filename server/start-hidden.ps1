# Starts the leaderboard with no console window. Safe to run repeatedly.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = Join-Path $env:ProgramFiles 'nodejs\node.exe'
if (-not (Test-Path $node)) {
  $found = Get-Command node -ErrorAction SilentlyContinue
  if (-not $found) { exit 1 }
  $node = $found.Source
}

function Test-Listening {
  try {
    return [bool](Get-NetTCPConnection -LocalPort 45589 -State Listen -ErrorAction Stop)
  } catch {
    return [bool](netstat -ano | Select-String ':45589\s' | Select-String 'LISTENING')
  }
}

if (Test-Listening) { exit 0 }

$logDir = Join-Path $root 'logs'
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}
$out = Join-Path $logDir 'server.log'
Start-Process -FilePath $node -ArgumentList 'index.mjs' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError (Join-Path $logDir 'server.err.log')
exit 0
