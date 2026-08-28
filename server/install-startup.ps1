# Run in an elevated PowerShell once:  powershell -ExecutionPolicy Bypass -File .\install-startup.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cmd = Join-Path $root 'start.cmd'
$task = 'ClearNine Leaderboard'

schtasks /Create /F /TN $task /SC ONLOGON /RL LIMITED /TR "`"$cmd`"" | Out-Null

try {
  New-NetFirewallRule -DisplayName 'ClearNine leaderboard 45589' -Direction Inbound -Protocol TCP -LocalPort 45589 -Action Allow -Profile Private -ErrorAction Stop | Out-Null
} catch {
  Write-Host "Firewall rule skipped (need Admin): $_"
}

Write-Host "Scheduled task '$task' runs at logon."
Write-Host "Starting now..."
Start-Process -FilePath $cmd -WindowStyle Hidden
Write-Host "Done. Check https://c9.heezynet.com/health"
