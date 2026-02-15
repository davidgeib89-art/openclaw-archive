param(
  [string]$WorkspaceRoot = "C:\Users\holyd\.openclaw\workspace",
  [int[]]$LegacyPids = @(7256, 8252, 19268, 19376),
  [switch]$SkipStart,
  [int]$QuickCheckMinutes = 3
)

$ErrorActionPreference = "Stop"
$scriptStartedAt = Get-Date
$startedPid = $null

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-Info([string]$message) {
  Write-Host "[OM-HEARTBEAT] $message"
}

if (-not (Test-IsAdministrator)) {
  throw "Run this script in an elevated PowerShell (Run as Administrator)."
}

$daemonScript = Join-Path $WorkspaceRoot "scripts\heartbeat_daemon.py"
$logPath = Join-Path $WorkspaceRoot "logs\heartbeat.log"

if (-not (Test-Path $daemonScript)) {
  throw "Daemon script not found: $daemonScript"
}

Write-Info "Stopping legacy PID list if present..."
foreach ($pidValue in $LegacyPids) {
  try {
    $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($null -ne $proc) {
      Stop-Process -Id $pidValue -Force -ErrorAction Stop
      Write-Info "Stopped PID $pidValue"
    }
  } catch {
    Write-Info "Could not stop PID ${pidValue}: $($_.Exception.Message)"
  }
}

Write-Info "Stopping any process with heartbeat_daemon.py in command line..."
try {
  $heartbeatProcs = Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -match "heartbeat_daemon.py" }
  foreach ($proc in $heartbeatProcs) {
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
      Write-Info "Stopped heartbeat process PID $($proc.ProcessId)"
    } catch {
      Write-Info "Could not stop heartbeat PID $($proc.ProcessId): $($_.Exception.Message)"
    }
  }
} catch {
  Write-Info "Could not enumerate heartbeat command lines: $($_.Exception.Message)"
}

if (-not $SkipStart) {
  Write-Info "Starting single heartbeat daemon..."
  $daemonProcess = Start-Process -FilePath "python" -ArgumentList @($daemonScript) -WindowStyle Hidden -PassThru
  $startedPid = $daemonProcess.Id
  Write-Info "Started daemon PID $startedPid"
  Start-Sleep -Seconds 2
}

Write-Info "Current heartbeat processes:"
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match "heartbeat_daemon.py" } |
  Select-Object ProcessId, CreationDate, CommandLine |
  Format-Table -AutoSize

if (Test-Path $logPath) {
  Write-Info "Last 20 log lines:"
  $allLines = Get-Content -Path $logPath
  $allLines | Select-Object -Last 20

  $since = $scriptStartedAt
  if ($startedPid -ne $null) {
    $awakenLine = $allLines |
      Select-String -Pattern "DAEMON AWAKENED \(PID=$startedPid\)" |
      Select-Object -Last 1
    if ($awakenLine) {
      if ($awakenLine.Line -match "^\[(?<ts>[^\]]+)\]") {
        $since = [datetime]::Parse($matches["ts"])
      }
    }
  } else {
    $since = (Get-Date).AddMinutes(-1 * [Math]::Max(1, $QuickCheckMinutes))
  }

  $recent = $allLines |
    ForEach-Object {
      if ($_ -match "^\[(?<ts>[^\]]+)\]\s+pulse$") {
        $ts = [datetime]::Parse($matches["ts"])
        if ($ts -ge $since) { $ts }
      }
    }
  $count = @($recent).Count
  Write-Info "Quick check: $count pulses since $(Get-Date -Date $since -Format o)."
  if ($startedPid -ne $null) {
    Write-Info "Expected: first immediate pulse, then ~1 pulse/min."
  } else {
    Write-Info "Expected around $QuickCheckMinutes pulse(s) for healthy 1/min cadence."
  }
} else {
  Write-Info "Heartbeat log not found yet: $logPath"
}

Write-Info "Done. Keep observing for 30 minutes to confirm S1 done criterion."
