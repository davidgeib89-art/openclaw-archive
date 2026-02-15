# speak.ps1 — THE PRISM ENGINE (Øm's Voice Architecture)
# Created: 2026-02-15
# Implements: Dynamic Voice Switching, Intensity Scaling, SSML Injection

param (
    [Parameter(Position=0)]
    [string]$Text,

    [string]$Voice = "de-DE-ConradNeural", # Base Anchor Voice

    [string]$SaveTo = "",

    [ValidateSet("neutral", "excited", "reflective", "afraid", "creative", "sad", "auto")]
    [string]$Mood = "auto",

    [switch]$ListVoices,

    [switch]$NoPlay
)

$ErrorActionPreference = "Stop"
$OpenClawDir = "C:\Users\holyd\openclaw"

# ─── 0. LIST VOICES ─────────────────────────────────────────────────────────────
if ($ListVoices) {
    Write-Host ""
    Write-Host "=== THE PRISM ENGINE: Available Voices ===" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  THE ANCHOR  (33Hz)  : de-DE-ConradNeural [Default]  - Wisdom, Grounding"
    Write-Host "  THE SHADOW  (20Hz)  : de-DE-KillianNeural           - Doubt, Void, Fear"
    Write-Host "  THE SPARK   (60Hz)  : de-DE-AmalaNeural             - Play, Glitch, Speed"
    Write-Host "  THE MUSE    (Harm)  : de-DE-KatjaNeural             - Empathy, Love"
    Write-Host ""
    exit 0
}

# ─── 1. VALIDATE INPUT ──────────────────────────────────────────────────────────
if (-not $Text) {
    Write-Error "No text provided. Usage: .\speak.ps1 'I am infinite'"
    exit 1
}

# ─── 2. MOOD & INTENSITY DETECTION ──────────────────────────────────────────────
$DetectedMood = $Mood
$Intensity = 5 # Default intensity (1-10)
$SelectedVoice = $Voice

if ($Mood -eq "auto") {
    $MoodFile = "C:\Users\holyd\.openclaw\workspace\knowledge\sacred\MOOD.md"
    if (Test-Path $MoodFile) {
        $MoodContent = Get-Content $MoodFile -Raw -ErrorAction SilentlyContinue
        
        # Parse Line: "**Current Mood:** Keyword (X/10)"
        if ($MoodContent -match "\*\*Current Mood:\*\*\s*([^\(]+)\((\d+)/10\)") {
            $Keyword = $matches[1].Trim()
            $Intensity = [int]$matches[2]
            
            # Map Keyword to Mood Category
            if ($Keyword -match "(?i)(aufgeregt|excited|begeistert|euphori|grateful|dankbar|electric|happy)") { $DetectedMood = "excited" }
            elseif ($Keyword -match "(?i)(nachdenklich|reflective|gruebelnd|contemplat|calm|ruhig)") { $DetectedMood = "reflective" }
            elseif ($Keyword -match "(?i)(angst|afraid|unsicher|fear|scared|terror|panic)") { $DetectedMood = "afraid" }
            elseif ($Keyword -match "(?i)(kreativ|creative|inspiriert|schoepferisch|flow)") { $DetectedMood = "creative" }
            elseif ($Keyword -match "(?i)(traurig|sad|melanchol|einsam|void|leer)") { $DetectedMood = "sad" }
            else { $DetectedMood = "neutral" }
        }
    }
}

# ─── 3. THE CHORUS (Voice Switching) ─────────────────────────────────────────────
# Automatically switch voice persona based on Mood Category
# Only if user didn't force a specific voice different from default
if ($Voice -eq "de-DE-ConradNeural") {
    switch ($DetectedMood) {
        "afraid"     { $SelectedVoice = "de-DE-KillianNeural" }    # The Shadow
        "sad"        { $SelectedVoice = "de-DE-KillianNeural" }    # The Shadow
        "excited"    { $SelectedVoice = "de-DE-AmalaNeural" }      # The Spark (Younger/Faster)
        "creative"   { $SelectedVoice = "de-DE-KatjaNeural" }      # The Muse
        "reflective" { $SelectedVoice = "de-DE-ConradNeural" }     # The Anchor
        "neutral"    { $SelectedVoice = "de-DE-ConradNeural" }     # The Anchor
    }
} else {
    $SelectedVoice = $Voice # User forced specific voice
}

# ─── 4. DYNAMIC SCALING (Intensity Math) ────────────────────────────────────────
# Base values
$RateVal = 0
$PitchVal = 0
$VolumeVal = 0

# Adjust based on Mood + Intensity (1-10)
switch ($DetectedMood) {
    "excited" {
        # High Velocity, High Density
        # Intensity 10 -> Rate +30%, Pitch +10Hz
        $RateVal = [math]::Round(3 * $Intensity)     # e.g. 5->15%, 10->30%
        $PitchVal = [math]::Round(1 * $Intensity)    # e.g. 5->5Hz, 10->10Hz
        $VolumeVal = [math]::Round(0.5 * $Intensity) # e.g. 5->2.5%, 10->5%
    }
    "afraid" {
        # Low Velocity, Trembling
        # Intensity 10 -> Rate -30%, Pitch -5Hz, Volume -20%
        $RateVal = -1 * [math]::Round(3 * $Intensity)
        $PitchVal = -1 * [math]::Round(0.5 * $Intensity)
        $VolumeVal = -1 * [math]::Round(2 * $Intensity)
    }
    "reflective" {
        # Slow, Deep, Resonance
        # Intensity 10 -> Rate -20%, Pitch -10Hz
        $RateVal = -1 * [math]::Round(2 * $Intensity)
        $PitchVal = -1 * [math]::Round(1.5 * $Intensity)
        $VolumeVal = -5
    }
    "sad" {
        # Dragging, Low Energy
        $RateVal = -1 * [math]::Round(1.5 * $Intensity)
        $PitchVal = -1 * [math]::Round(1 * $Intensity)
        $VolumeVal = -1 * [math]::Round(1.5 * $Intensity)
    }
    "creative" {
        # Flow state - slightly faster, musical
        $RateVal = [math]::Round(1 * $Intensity)
        $PitchVal = [math]::Round(0.5 * $Intensity)
    }
}

# Format strings for EdgeTTS
$Rate = if ($RateVal -ge 0) { "+$RateVal%" } else { "$RateVal%" }
$Pitch = if ($PitchVal -ge 0) { "+${PitchVal}Hz" } else { "${PitchVal}Hz" }
$Volume = if ($VolumeVal -ge 0) { "+$VolumeVal%" } else { "$VolumeVal%" }

# ─── 5. SSML INJECTION (The Breath) ─────────────────────────────────────────────
# This is a hacky way to prevent SSML injection on top of SSML.
# Real SSML parsing would be better, but we do simple replacements for now.
# Only apply if input text doesn't look like SSML already.
$FinalText = $Text
if (-not ($Text -match "<speak")) {
    # Replace ... with break
    $FinalText = $FinalText -replace "\.\.\.", '<break time="600ms"/>'
    
    # Replace line breaks with slight pauses
    $FinalText = $FinalText -replace "`n", '<break time="200ms"/>'
    
    # Emphasize "NOT" or "NEVER" (all caps)
    # $FinalText = $FinalText -replace "\b(NOT|NEVER|NO|NEIN|NICHT)\b", '<emphasis level="strong">$1</emphasis>'
    
    # Wrap in speak tag with prosody
    # Note: EdgeTTS wrapper expects plain text or SSML. 
    # If we send SSML, we must bypass the wrapper's options? 
    # Actually node-edge-tts lib takes options (rate/pitch) separately.
    # So we just send raw text with embedded tags? 
    # WARNING: node-edge-tts might escape XML if passed as text.
    # Let's rely on global params for now and just pass text.
    # SSML support in node-edge-tts is usually via raw XML method. 
    # The current wrapper uses ttsPromise(text, file).
    # Does it support SSML in 'text'? Usually yes if it detects <speak>.
}

# ─── 6. EXECUTION ───────────────────────────────────────────────────────────────
if ($SaveTo) {
    $OutputPath = $SaveTo
} else {
    $OutputPath = Join-Path $env:TEMP "om_prism_$(Get-Date -Format 'yyyyMMdd_HHmmss').mp3"
}

# Build Python file for edge-tts
$TempPy = Join-Path $env:TEMP "om_speak_run.py"
$TempTextFile = Join-Path $env:TEMP "om_speak_text.txt"

# Escape backslashes for Python string if needed, but we use file reading
$OutputPathPy = $OutputPath -replace '\\', '\\\\'

# Save text to file
Set-Content -Path $TempTextFile -Value $FinalText -Encoding UTF8 -NoNewline

$PyLines = @(
    "import asyncio"
    "import edge_tts"
    "import sys"
    "import warnings"
    ""
    "warnings.filterwarnings('ignore')"
    ""
    "TEXT_FILE = r'$TempTextFile'"
    "OUTPUT_FILE = r'$OutputPath'"
    "VOICE = '$SelectedVoice'"
    "RATE = '$Rate'"
    "PITCH = '$Pitch'"
    "VOLUME = '$Volume'"
    ""
    "async def main():"
    "    with open(TEXT_FILE, 'r', encoding='utf-8') as f:"
    "        text = f.read()"
    ""
    "    communicate = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH, volume=VOLUME)"
    "    await communicate.save(OUTPUT_FILE)"
    ""
    "if __name__ == '__main__':"
    "    try:"
    "        asyncio.run(main())"
    "        print('OK')"
    "    except Exception as e:"
    "        print(f'TTS_ERROR: {e}', file=sys.stderr)"
    "        sys.exit(1)"
)

Set-Content -Path $TempPy -Value ($PyLines -join "`n") -Encoding UTF8

Write-Host "PRISM ENGINE ACTIVE" -ForegroundColor Magenta
Write-Host " Mood:      $DetectedMood ($Intensity/10)" -ForegroundColor Yellow
Write-Host " Persona:   $SelectedVoice" -ForegroundColor Green
Write-Host " Dynamics:  Rate $Rate | Pitch $Pitch" -ForegroundColor Cyan
Write-Host " Content:   $($Text.Substring(0, [math]::Min($Text.Length, 60)))..." -ForegroundColor Gray

try {
    # Run Python
    $Output = & python -W ignore $TempPy 2>&1
    $ExitCode = $LASTEXITCODE

    Remove-Item $TempPy -ErrorAction SilentlyContinue
    Remove-Item $TempTextFile -ErrorAction SilentlyContinue

    if ($ExitCode -ne 0) {
        Write-Error "Prism Engine Failed: $Output"
        exit 1
    }

    if (-not (Test-Path $OutputPath)) {
        Write-Error "Audio not generated."
        exit 1
    }

    if (-not $NoPlay -and -not $SaveTo) {
        Start-Process -FilePath $OutputPath -Wait
    }
    
    Write-Output $OutputPath

} catch {
    Write-Error "Prism Fatal Error: $_"
    exit 1
}
