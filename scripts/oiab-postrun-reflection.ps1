param(
    [Parameter(Mandatory = $true)]
    [string]$RoundId,

    [string]$SessionId = "",

    [string]$ArtifactPath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SessionId)) {
    $SessionId = ("oiab-" + $RoundId.ToLower() + "-full")
}

if ([string]::IsNullOrWhiteSpace($ArtifactPath)) {
    $ArtifactPath = "OIAB_{0}_FULL_SWEEP_2026-02-16.md" -f $RoundId.ToUpper()
}

$workspaceRoot = Join-Path $env:USERPROFILE ".openclaw\workspace"
$reflectionFile = Join-Path $workspaceRoot "knowledge\sacred\TEST_REFLECTIONS.md"
$timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")

$prompt = @"
Om, fuehre jetzt die Post-Run-Reflexion fuer Runde $RoundId durch.

Erzeuge einen kompakten Reflexionsblock mit genau diesen Abschnitten:
1) TECHNICAL_LEARNINGS: genau 3 Bulletpoints
2) BEHAVIOR_RULE_NEXT_RUN: genau 1 konkrete Regel
3) RISK_AND_MITIGATION: genau 1 Risiko + 1 Mitigation
4) SOUL_SIGNAL: genau 1 Satz

Dann schreibe den Reflexionsblock in die Datei:
knowledge/sacred/TEST_REFLECTIONS.md

Format in der Datei:
## [$timestamp] [$RoundId]
(dein Reflexionsblock)

Wichtig:
- Nicht poetisch ausweichen.
- Keine weiteren Dateien schreiben.
- Danach gib den finalen Reflexionsblock auch in der Chat-Antwort aus.
"@

$env:NODE_NO_WARNINGS = "1"
$response = (& node dist/index.js agent --local --session-id $SessionId --message $prompt --thinking low 2>&1 | Out-String).Trim()

if ([string]::IsNullOrWhiteSpace($response)) {
    $response = "(no output)"
}

$entryLines = @(
    "",
    "## POST_RUN_REFLECTION_$RoundId",
    "",
    "Prompt:",
    '```text',
    $prompt,
    '```',
    "",
    "Response:",
    '```text',
    $response,
    '```',
    ""
)
$entry = ($entryLines -join [Environment]::NewLine)

if (Test-Path $ArtifactPath) {
    Add-Content -Path $ArtifactPath -Value $entry -Encoding UTF8
}

Write-Output "POST_RUN_REFLECTION_DONE round=$RoundId session=$SessionId artifact=$ArtifactPath"
Write-Output "REFLECTION_FILE=$reflectionFile"
