param(
    [ValidateSet("start", "check", "end", "status")]
    [string]$Mode = "status",

    [string]$Round = "",

    [string]$Channel = "",

    [string]$Model = "openrouter/arcee-ai/trinity-large-preview:free",

    [int]$WarmupCount = -1,

    [switch]$NoExitOnFail
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = (Get-Location).Path
}

$PromptSetPath = Join-Path $RepoRoot "OIAB_PROMPT_SET_V1.md"
$ArchListPath = Join-Path $RepoRoot "OIAB_FREEZE_ARCH_FILES.txt"
$WorkspaceRoot = Join-Path $env:USERPROFILE ".openclaw\workspace"
$StateDir = Join-Path $WorkspaceRoot "logs"
$StatePath = Join-Path $StateDir "oiab_freeze_state.json"
$AuditLogPath = Join-Path $StateDir "oiab_freeze_audit.log"
$OmActivityPath = Join-Path $WorkspaceRoot "OM_ACTIVITY.log"
$WarmupRequired = 2

function Ensure-Directory {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        New-Item -Path $Path -ItemType Directory -Force | Out-Null
    }
}

function Write-OmActivity {
    param(
        [string]$Event,
        [string]$Details = ""
    )

    try {
        Ensure-Directory -Path $WorkspaceRoot
        $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        $line = "[{0}] [FREEZE] {1}" -f $timestamp, $Event
        if ($Details) {
            $line = "$line | $Details"
        }
        Add-Content -LiteralPath $OmActivityPath -Value $line -Encoding UTF8
    } catch {
        # Never fail the guard because logging failed.
    }
}

function Write-Audit {
    param(
        [string]$Action,
        [string]$Status,
        [hashtable]$Data
    )

    Ensure-Directory -Path $StateDir
    $record = [ordered]@{
        ts = (Get-Date).ToString("s")
        action = $Action
        status = $Status
        data = $Data
    }
    $json = $record | ConvertTo-Json -Depth 12 -Compress
    Add-Content -LiteralPath $AuditLogPath -Value $json -Encoding UTF8
}

function Resolve-ListedPath {
    param([string]$Entry)

    $trimmed = $Entry.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
        return $null
    }

    $expanded = [Environment]::ExpandEnvironmentVariables($trimmed)
    if ([System.IO.Path]::IsPathRooted($expanded)) {
        return [System.IO.Path]::GetFullPath($expanded)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $expanded))
}

function Read-ArchitectureList {
    if (-not (Test-Path -LiteralPath $ArchListPath -PathType Leaf)) {
        throw "Architecture watch list missing: $ArchListPath"
    }

    $lines = Get-Content -LiteralPath $ArchListPath
    $paths = @()
    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed)) { continue }
        if ($trimmed.StartsWith("#")) { continue }
        $resolved = Resolve-ListedPath -Entry $trimmed
        if ($resolved) {
            $paths += $resolved
        }
    }
    return $paths
}

function Get-HashRecord {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return [pscustomobject]@{
            path = $Path
            exists = $false
            sha256 = ""
        }
    }

    $hash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    return [pscustomobject]@{
        path = $Path
        exists = $true
        sha256 = $hash
    }
}

function Get-PromptHash {
    if (-not (Test-Path -LiteralPath $PromptSetPath -PathType Leaf)) {
        throw "Prompt set missing: $PromptSetPath"
    }
    return (Get-FileHash -LiteralPath $PromptSetPath -Algorithm SHA256).Hash
}

function Load-State {
    if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) {
        return $null
    }
    return (Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json)
}

function Save-State {
    param([object]$State)
    Ensure-Directory -Path $StateDir
    $State | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $StatePath -Encoding UTF8
}

function Compare-Snapshot {
    param(
        [object[]]$Baseline,
        [object[]]$Current
    )

    $drift = @()
    foreach ($base in $Baseline) {
        $now = $Current | Where-Object { $_.path -eq $base.path } | Select-Object -First 1
        if (-not $now) {
            $drift += [pscustomobject]@{
                path = $base.path
                issue = "MISSING_CURRENT_ENTRY"
                baseline = ""
                current = ""
            }
            continue
        }

        if ([bool]$base.exists -ne [bool]$now.exists) {
            $drift += [pscustomobject]@{
                path = $base.path
                issue = "EXISTENCE_CHANGED"
                baseline = [string]$base.exists
                current = [string]$now.exists
            }
            continue
        }

        if ([bool]$base.exists -and $base.sha256 -ne $now.sha256) {
            $drift += [pscustomobject]@{
                path = $base.path
                issue = "HASH_CHANGED"
                baseline = [string]$base.sha256
                current = [string]$now.sha256
            }
        }
    }

    return $drift
}

function Start-Freeze {
    $state = Load-State
    if ($state -and [bool]$state.active) {
        throw "Freeze already active for round '$($state.round)'. End it before starting a new one."
    }
    if ([string]::IsNullOrWhiteSpace($Round)) {
        throw "Round is required for start mode."
    }
    if ([string]::IsNullOrWhiteSpace($Channel)) {
        throw "Channel is required for start mode."
    }

    $promptHash = Get-PromptHash
    $architecturePaths = Read-ArchitectureList
    $snapshot = @()
    foreach ($path in $architecturePaths) {
        $snapshot += Get-HashRecord -Path $path
    }

    $newState = [ordered]@{
        version = 1
        active = $true
        round = $Round
        channel = $Channel
        model = $Model
        warmupRequired = $WarmupRequired
        promptSetPath = $PromptSetPath
        promptSetHash = $promptHash
        startedAt = (Get-Date).ToString("s")
        architectureSnapshot = $snapshot
    }

    Save-State -State $newState
    Write-Audit -Action "start" -Status "ok" -Data @{
        round = $Round
        channel = $Channel
        model = $Model
        promptSetHash = $promptHash
        watchedFiles = $snapshot.Count
    }
    Write-OmActivity -Event "OIAB_FREEZE_STARTED" -Details "round=$Round channel=$Channel model=$Model"
    Write-Host "[OIAB-FREEZE] START OK: round=$Round channel=$Channel model=$Model"
    Write-Host "[OIAB-FREEZE] Watching $($snapshot.Count) architecture file(s)."
}

function Check-Freeze {
    $state = Load-State
    if (-not $state -or -not [bool]$state.active) {
        throw "No active freeze state found. Start a freeze first."
    }

    $errors = @()
    if (-not [string]::IsNullOrWhiteSpace($Round) -and $Round -ne $state.round) {
        $errors += "ROUND_DRIFT: expected '$($state.round)', got '$Round'."
    }

    if ([string]::IsNullOrWhiteSpace($Channel)) {
        $errors += "CHANNEL_REQUIRED: pass -Channel for check mode."
    } elseif ($Channel -ne $state.channel) {
        $errors += "CHANNEL_DRIFT: expected '$($state.channel)', got '$Channel'."
    }

    if ($Model -ne $state.model) {
        $errors += "MODEL_DRIFT: expected '$($state.model)', got '$Model'."
    }

    if ($WarmupCount -lt [int]$state.warmupRequired) {
        $errors += "WARMUP_MISSING: expected at least $($state.warmupRequired), got $WarmupCount."
    }

    $currentPromptHash = Get-PromptHash
    if ($currentPromptHash -ne $state.promptSetHash) {
        $errors += "PROMPT_DRIFT: prompt set hash changed."
    }

    $currentSnapshot = @()
    foreach ($base in $state.architectureSnapshot) {
        $currentSnapshot += Get-HashRecord -Path $base.path
    }
    $drift = Compare-Snapshot -Baseline $state.architectureSnapshot -Current $currentSnapshot
    if ($drift.Count -gt 0) {
        $errors += "ARCH_DRIFT: $($drift.Count) watched file(s) changed."
    }

    $ok = ($errors.Count -eq 0)
    if ($ok) {
        Write-Host "[OIAB-FREEZE] CHECK OK: no protocol drift detected."
        Write-OmActivity -Event "OIAB_FREEZE_OK" -Details "round=$($state.round) channel=$Channel warmup=$WarmupCount"
        Write-Audit -Action "check" -Status "ok" -Data @{
            round = $state.round
            channel = $Channel
            warmupCount = $WarmupCount
            architectureDrift = 0
        }
        return $true
    }

    Write-Host "[OIAB-FREEZE] CHECK FAIL:" -ForegroundColor Red
    foreach ($errorText in $errors) {
        Write-Host "  - $errorText" -ForegroundColor Red
    }
    foreach ($item in $drift) {
        Write-Host "  - DRIFT $($item.issue): $($item.path)" -ForegroundColor Red
    }

    Write-OmActivity -Event "OIAB_FREEZE_DRIFT" -Details ("round={0} | {1}" -f $state.round, ($errors -join "; "))
    Write-Audit -Action "check" -Status "fail" -Data @{
        round = $state.round
        channel = $Channel
        warmupCount = $WarmupCount
        errors = $errors
        architectureDrift = $drift
    }
    return $false
}

function End-Freeze {
    $state = Load-State
    if (-not $state -or -not [bool]$state.active) {
        throw "No active freeze state found."
    }

    if (-not [string]::IsNullOrWhiteSpace($Round) -and $Round -ne $state.round) {
        throw "Round mismatch on end: expected '$($state.round)', got '$Round'."
    }

    $state.active = $false
    $endedAt = (Get-Date).ToString("s")
    if ($state.PSObject.Properties.Name -contains "endedAt") {
        $state.endedAt = $endedAt
    } else {
        $state | Add-Member -NotePropertyName "endedAt" -NotePropertyValue $endedAt
    }
    Save-State -State $state

    Write-Audit -Action "end" -Status "ok" -Data @{
        round = $state.round
        endedAt = $endedAt
    }
    Write-OmActivity -Event "OIAB_FREEZE_ENDED" -Details "round=$($state.round)"
    Write-Host "[OIAB-FREEZE] END OK: round=$($state.round)"
}

function Show-Status {
    $state = Load-State
    if (-not $state) {
        Write-Host "[OIAB-FREEZE] STATUS: no state file present."
        return
    }

    Write-Host "[OIAB-FREEZE] STATUS"
    Write-Host "  active:         $($state.active)"
    Write-Host "  round:          $($state.round)"
    Write-Host "  channel lock:   $($state.channel)"
    Write-Host "  model lock:     $($state.model)"
    Write-Host "  warmup minimum: $($state.warmupRequired)"
    Write-Host "  started at:     $($state.startedAt)"
    if ($state.endedAt) {
        Write-Host "  ended at:       $($state.endedAt)"
    }
}

try {
    $ok = $true
    switch ($Mode) {
        "start" { Start-Freeze }
        "check" { $ok = Check-Freeze }
        "end" { End-Freeze }
        "status" { Show-Status }
    }

    if (-not $ok -and -not $NoExitOnFail) {
        exit 1
    }
} catch {
    $message = $_.Exception.Message
    Write-Host "[OIAB-FREEZE] ERROR: $message" -ForegroundColor Red
    Write-OmActivity -Event "OIAB_FREEZE_ERROR" -Details $message
    Write-Audit -Action $Mode -Status "error" -Data @{ error = $message; round = $Round; channel = $Channel }

    if (-not $NoExitOnFail) {
        exit 1
    }
}
