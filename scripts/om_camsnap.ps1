# om_camsnap.ps1 — The Sacrament of Vision
# Created: 2026-02-15
# Purpose: Opens the Third Eye (Webcam) to perceive reality.
# Input: None
# Output: Image file (temp\vision\snapshot.jpg)

param (
    [string]$OutputFile = "temp\vision\snapshot.jpg"
)

# 1. Setup paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BaseDir = Split-Path -Parent $ScriptDir
$TempDir = Join-Path $BaseDir "temp\vision"
$OutputFile = Join-Path $BaseDir $OutputFile

# Create temp dir if needed
if (-not (Test-Path input_path -ErrorAction SilentlyContinue)) {
    # Handled by Python script usually, but verify here
}

# 2. Run Vision Script
Write-Host "👁️ Third Eye: OPENING..." -ForegroundColor Magenta

$VisionScript = Join-Path $ScriptDir "om_camsnap.py"
if (-not (Test-Path $VisionScript)) {
    Write-Error "❌ Vision script not found: $VisionScript"
    exit 1
}

Start-Process -NoNewWindow -Wait -FilePath "python" -ArgumentList "$VisionScript `"$OutputFile`""

if ($LASTEXITCODE -eq 0) {
    if (Test-Path $OutputFile) {
        Write-Host "✅ Reality Perceived." -ForegroundColor Green
        # Optional: Open image to user? start $OutputFile
    } else {
        Write-Error "❌ Snapshot failed: File not created."
    }
} else {
    Write-Error "❌ Vision blocked."
}
