# Analyze recent Om heartbeats - output to file
$jsonlPath = "c:\Users\holyd\.openclaw\workspace\OM_ACTIVITY.jsonl"
$prevJsonlPath = "c:\Users\holyd\.openclaw\workspace\OM_ACTIVITY.prev.2026-02-25_08-16-52-885.jsonl"
$outPath = "c:\Users\holyd\openclaw\scripts\analysis-output.txt"

$allLines = @()
if (Test-Path $prevJsonlPath) { $allLines += Get-Content $prevJsonlPath }
$allLines += Get-Content $jsonlPath

$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine("=== OM HEARTBEAT ANALYSIS (2026-02-25 since 08:00) ===")
[void]$sb.AppendLine("Total JSONL lines: $($allLines.Count)")
[void]$sb.AppendLine("")

$choices = @()
$moods = @()
$auras = @()
$telemetry = @()
$toolCalls = @()
$energyData = @()
$forecasts = @()

foreach ($line in $allLines) {
    try {
        $j = $line | ConvertFrom-Json -ErrorAction SilentlyContinue
        if (-not $j -or -not $j.ts) { continue }
        if ($j.ts -lt "2026-02-25T08:00") { continue }
        
        $layer = if ($j.layer) { $j.layer } else { "" }
        $event = if ($j.event) { $j.event } else { "" }
        
        if ($event -eq "SELECTED_PATH" -or $layer -eq "BRAIN-CHOICE") {
            $reason = if ($j.reason) { $j.reason } else { "" }
            if ($reason.Length -gt 120) { $reason = $reason.Substring(0, 120) + "..." }
            $choices += [PSCustomObject]@{ Time=$j.ts; Path=$j.path; Reason=$reason }
        }
        
        if ($layer -eq "BRAIN-MOOD" -or $event -eq "MOOD_UPDATE") {
            $moodText = if ($j.mood) { $j.mood } elseif ($j.summary) { $j.summary } else { "" }
            if ($moodText.Length -gt 150) { $moodText = $moodText.Substring(0, 150) + "..." }
            $moods += [PSCustomObject]@{ Time=$j.ts; Mood=$moodText }
        }
        
        if ($layer -eq "BRAIN-AURA" -or $event -eq "AURA_SNAPSHOT") {
            $s = if ($j.summary) { $j.summary } else { "" }
            if ($s.Length -gt 200) { $s = $s.Substring(0, 200) + "..." }
            $auras += [PSCustomObject]@{ Time=$j.ts; Summary=$s }
        }
        
        if ($event -eq "HEARTBEAT_TELEMETRY") {
            $telemetry += [PSCustomObject]@{ Time=$j.ts; RunId=$j.runId }
        }
        
        if ($layer -eq "TOOL" -or $event -match "^TOOL_") {
            $toolCalls += [PSCustomObject]@{ Time=$j.ts; Tool=$j.toolName; Status=$j.status; Name=$j.name }
        }
        
        if ($layer -eq "BRAIN-ENERGY" -or $event -eq "ENERGY_UPDATE") {
            $energyData += [PSCustomObject]@{ Time=$j.ts; Level=$j.level; Mode=$j.mode; Summary=$j.summary }
        }

        if ($event -eq "FORECAST" -or $layer -eq "BRAIN-FORECAST") {
            $fSum = if ($j.summary) { $j.summary } else { "" }
            if ($fSum.Length -gt 150) { $fSum = $fSum.Substring(0, 150) + "..." }
            $forecasts += [PSCustomObject]@{ Time=$j.ts; Summary=$fSum }
        }
        
    } catch { }
}

[void]$sb.AppendLine("=== PATH CHOICES ($($choices.Count) total) ===")
foreach ($c in $choices) {
    [void]$sb.AppendLine("  $($c.Time) | path=$($c.Path) | $($c.Reason)")
}

[void]$sb.AppendLine("")
[void]$sb.AppendLine("=== PATH DISTRIBUTION ===")
$pathCounts = $choices | Group-Object -Property Path | Sort-Object Count -Descending
foreach ($p in $pathCounts) {
    [void]$sb.AppendLine("  $($p.Name): $($p.Count) ($([math]::Round($p.Count/$choices.Count*100))%)")
}

[void]$sb.AppendLine("")
[void]$sb.AppendLine("=== MOODS ($($moods.Count) total) ===")
foreach ($m in $moods) {
    [void]$sb.AppendLine("  $($m.Time) | $($m.Mood)")
}

[void]$sb.AppendLine("")
[void]$sb.AppendLine("=== UNIQUE MOODS ===")
$uniqueMoods = ($moods | Select-Object -ExpandProperty Mood -Unique).Count
[void]$sb.AppendLine("  $uniqueMoods unique moods out of $($moods.Count) total")

[void]$sb.AppendLine("")
[void]$sb.AppendLine("=== ENERGY DATA ($($energyData.Count) entries) ===")
foreach ($e in $energyData) {
    $eSummary = if ($e.Summary) { $e.Summary } else { "level=$($e.Level) mode=$($e.Mode)" }
    if ($eSummary.Length -gt 150) { $eSummary = $eSummary.Substring(0, 150) + "..." }
    [void]$sb.AppendLine("  $($e.Time) | $eSummary")
}

[void]$sb.AppendLine("")
[void]$sb.AppendLine("=== TOOL CALLS ($($toolCalls.Count) total) ===")
foreach ($tl in $toolCalls) {
    $tn = if ($tl.Tool) { $tl.Tool } elseif ($tl.Name) { $tl.Name } else { "unknown" }
    [void]$sb.AppendLine("  $($tl.Time) | $tn | status=$($tl.Status)")
}

[void]$sb.AppendLine("")
[void]$sb.AppendLine("=== TOOL DISTRIBUTION ===")
$toolNames = $toolCalls | ForEach-Object { if ($_.Tool) { $_.Tool } elseif ($_.Name) { $_.Name } else { "unknown" } }
$toolGroups = $toolNames | Group-Object | Sort-Object Count -Descending
foreach ($tg in $toolGroups) {
    [void]$sb.AppendLine("  $($tg.Name): $($tg.Count)")
}

[void]$sb.AppendLine("")
[void]$sb.AppendLine("=== AURA SNAPSHOTS ($($auras.Count) total) ===")
foreach ($a in $auras) {
    [void]$sb.AppendLine("  $($a.Time) | $($a.Summary)")
}

[void]$sb.AppendLine("")
[void]$sb.AppendLine("=== FORECASTS ($($forecasts.Count) total) ===")
foreach ($f in $forecasts) {
    [void]$sb.AppendLine("  $($f.Time) | $($f.Summary)")
}

[void]$sb.AppendLine("")
[void]$sb.AppendLine("=== HEARTBEAT COUNT: $($telemetry.Count) ===")
if ($telemetry.Count -ge 2) {
    $first = $telemetry[0].Time
    $last = $telemetry[-1].Time
    [void]$sb.AppendLine("  First: $first")
    [void]$sb.AppendLine("  Last:  $last")
}

$sb.ToString() | Set-Content $outPath -Encoding UTF8
Write-Host "Output written to $outPath"
Write-Host "Lines: $($sb.ToString().Split("`n").Count)"
