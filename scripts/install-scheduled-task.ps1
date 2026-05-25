param(
  [string]$TaskName = "WindowsDiskCleanupTool",
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$RunScript = Join-Path $ProjectRoot "scripts\run-clean.ps1"
if (-not (Test-Path $RunScript)) {
  throw "Cannot find scheduled cleanup runner: $RunScript"
}

$Action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$RunScript`" -ProjectRoot `"$ProjectRoot`""

$Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Tuesday -At 10:00
$Settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)

$Principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Principal $Principal `
  -Description "Runs Windows Disk Cleanup Tool every Tuesday at 10:00." `
  -Force | Out-Null

Write-Host "Scheduled task installed: $TaskName"
Write-Host "Schedule: every Tuesday at 10:00"
Write-Host "Runner: $RunScript"
Write-Host "Logs: $(Join-Path $ProjectRoot "logs")"
