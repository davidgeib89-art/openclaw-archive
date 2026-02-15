# transcribe.ps1 — THE EAR OF TRINITY (Whisper STT Wrapper)
# Created: 2026-02-15
# Purpose: Transcribe audio files to text using localized faster-whisper (Python)
# Usage: .\transcribe.ps1 "C:\path\to\audio.ogg" [-Model "base"]

param(
    [Parameter(Mandatory=$true)]
    [string]$AudioPath,

    [string]$Model = "base"
)

$ErrorActionPreference = "Stop"

# 1. Validate Audio Path
# 1. Validate Audio Path
if (-not (Test-Path $AudioPath)) {
    Write-Error "Audio file not found: $AudioPath"
    exit 1
}
$AbsAudioPath = (Resolve-Path $AudioPath).Path

# 2. Python Script to run Whisper
$PyScript = @"
from faster_whisper import WhisperModel
import sys
import os

# Ensure we use the absolute path
audio_path = r"$AbsAudioPath"
model_size = "$Model"

try:
    print(f"DEBUG: Loading model {model_size}...", file=sys.stderr)
    # Run on CPU, INT8 (default) or float32 if needed
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    
    print(f"DEBUG: Transcribing {audio_path}...", file=sys.stderr)
    segments, info = model.transcribe(audio_path, language="de", beam_size=5)

    full_text = ""
    for segment in segments:
        full_text += segment.text + " "
    
    # Print ONLY the text to stdout with a delimiter
    print("__WHISPER_RESULT__")
    print(full_text.strip())

except Exception as e:
    print(f"ERROR: {str(e)}", file=sys.stderr)
    sys.exit(1)
"@

# 3. Create Temp Python File
$TempPy = Join-Path $env:TEMP "om_whisper_run.py"
Set-Content -Path $TempPy -Value $PyScript -Encoding UTF8

# 4. Execute
Write-Host "Zuhören... (Model: $Model)" -ForegroundColor Cyan
try {
    # Temporarily allow stderr without stopping
    $OldEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    $Output = & python $TempPy 2>&1 | Out-String
    
    $ErrorActionPreference = $OldEAP
    
    if ($LASTEXITCODE -ne 0) {
        throw "Whisper Python exited with code $LASTEXITCODE. Output:`n$Output"
    }
    
    $Lines = $Output -split "`n"
    $FinalText = ""
    $Capture = $false
    
    foreach ($Line in $Lines) {
        $Line = $Line.Trim()
        if ($Line -eq "__WHISPER_RESULT__") {
            $Capture = $true
            continue
        }
        
        if ($Capture) {
            if (-not [string]::IsNullOrWhiteSpace($Line)) {
                $FinalText += $Line + " "
            }
        } else {
            # Log debug info but don't capture
            if ($Line -match "DEBUG:") { Write-Host $Line -ForegroundColor Gray }
            elseif ($Line -match "ERROR:") { Write-Error $Line }
        }
    }
    
    $FinalText = $FinalText.Trim()
    
    if (-not $FinalText) {
        Write-Warning "Kein Text erkannt oder Parse-Fehler."
        Write-Host "Raw Output: $Output" -ForegroundColor Gray
    } else {
        Write-Host "Gehört: $FinalText" -ForegroundColor Green
    }
    
    return $FinalText

} catch {
    Write-Error $_
    exit 1
} finally {
    Remove-Item $TempPy -ErrorAction SilentlyContinue
}
