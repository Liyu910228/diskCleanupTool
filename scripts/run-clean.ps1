param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Continue"

$LogDir = Join-Path $ProjectRoot "logs"
if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $LogDir "scheduled-clean-$Timestamp.log"
$Node = (Get-Command node -ErrorAction Stop).Source
$Cli = Join-Path $ProjectRoot "src\cli.js"

"[$(Get-Date -Format s)] Starting scheduled disk cleanup" | Tee-Object -FilePath $LogFile
"Project: $ProjectRoot" | Tee-Object -FilePath $LogFile -Append
"Node: $Node" | Tee-Object -FilePath $LogFile -Append
& $Node $Cli clean --execute *>&1 | Tee-Object -FilePath $LogFile -Append
$ExitCode = $LASTEXITCODE
"[$(Get-Date -Format s)] Finished with exit code $ExitCode" | Tee-Object -FilePath $LogFile -Append

exit $ExitCode
