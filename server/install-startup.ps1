# Installs a hidden at-logon + 5-minute watchdog task.
# Self-elevates once so the old visible start.cmd task can be replaced.
$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]$identity
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $self = $MyInvocation.MyCommand.Path
  Start-Process powershell.exe -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$self`"" -Wait
  exit $LASTEXITCODE
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = Join-Path $root 'start-hidden.vbs'
$taskName = 'ClearNine Leaderboard'

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "//B //nologo `"$vbs`"" -WorkingDirectory $root

$logon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$watch = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(1)
$watch.Repetition = (
  New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
).Repetition

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -DontStopOnIdleEnd `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -Hidden

$taskPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

foreach ($name in @($taskName, 'ClearNine Board Hidden')) {
  schtasks /Delete /TN $name /F 2>$null | Out-Null
}
Start-Sleep -Milliseconds 400

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger @($logon, $watch) `
  -Settings $settings `
  -Principal $taskPrincipal `
  -Description 'Hidden ClearNine leaderboard. Starts at logon and again every 5 minutes if port 45589 is down.' | Out-Null

try {
  New-NetFirewallRule -DisplayName 'ClearNine leaderboard 45589' -Direction Inbound -Protocol TCP -LocalPort 45589 -Action Allow -Profile Private -ErrorAction Stop | Out-Null
} catch {
  Write-Host "Firewall rule skipped: $_"
}

Write-Host "Scheduled task '$taskName' is hidden, at logon, and every 5 minutes."
Write-Host "Starting now (no window)..."
& (Join-Path $root 'start-hidden.ps1')
Start-Sleep -Seconds 1
Write-Host "Done. Check https://c9.heezynet.com/health"
