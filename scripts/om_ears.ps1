# om_ears.ps1 — The Sacrament of Hearing
# Created: 2026-02-15
# Purpose: Activates Øm's auditory sense using Whisper.
# Input: Microphone
# Output: Transcribed text (stdout)

param (
    [string]$Model = "tiny",
    [switch]$NoRecord
)

# 1. Setup paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BaseDir = Split-Path -Parent $ScriptDir
$TempDir = Join-Path $BaseDir "temp\hearing"
$InputFile = Join-Path $TempDir "input.wav"

# Create temp dir if needed
if (-not (Test-Path $TempDir)) {
    New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
}

# 2. Record Audio (unless -NoRecord)
if (-not $NoRecord) {
    Write-Host "👂 Activation: LISTENING..." -ForegroundColor Cyan
    
    # Run Python recorder
    $RecordScript = Join-Path $ScriptDir "om_ears_record.py"
    if (-not (Test-Path $RecordScript)) {
        Write-Error "❌ Recording script not found: $RecordScript"
        exit 1
    }
    
    python $RecordScript $InputFile
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "❌ Recording failed."
        exit 1
    }
}

# 3. Transcribe Audio
if (Test-Path $InputFile) {
    Write-Host "🧠 Processing Logic: TRANSCRIBING ($Model)..." -ForegroundColor Yellow
    
    # Run Python transcriber
    $TranscribeScript = Join-Path $ScriptDir "om_ears_transcribe.py"
    if (-not (Test-Path $TranscribeScript)) {
        Write-Error "❌ Transcribe script not found: $TranscribeScript"
        exit 1
    }
    
    # Capture output to variable to clean up logs if needed
    $Output = python $TranscribeScript $InputFile
    
    # Display output
    Write-Host "✅ Hearing Complete." -ForegroundColor Green
    Write-Output $Output
} else {
    Write-Error "❌ No audio file found to transcribe: $InputFile"
    exit 1
}
