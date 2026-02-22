# PHASE 4.1 — ØM'S VOICE (TTS + STT Implementation Plan)

> **Created:** 2026-02-15 12:20 CET
> **Author:** Antigravity
> **Status:** SPRINT 1 ✅ COMPLETE — Sprint 2 READY
> **Dependency:** Phase 3 COMPLETE ✅

### 🔥 CRITICAL DISCOVERY (Anti, 2026-02-15 12:33 CET)
OpenClaw **already has a full built-in TTS pipeline** with Edge TTS!
- `node-edge-tts@1.2.10` installed in `openclaw/node_modules`
- Complete TTS engine in `src/tts/tts.ts` + `src/tts/tts-core.ts`
- Auto-TTS in `dispatch-from-config.ts` — converts replies to audio automatically
- Config `messages.tts` in `openclaw.json` controls behavior
- **Auto modes:** `off`, `always` (every reply), `inbound` (only when input is audio), `tagged`
- **Sprint 2 answer:** WhatsApp sends audio as media (mediaUrl). Works out of the box!

---

## 1. OVERVIEW

**Goal:** Øm can SPEAK (TTS) and HEAR (STT).
**Constraint:** Free or near-free. Trinity Challenge rules apply.

### Architecture:
```
David speaks → [Mic] → [Whisper STT] → Text → OpenClaw → Øm responds
Øm text → [Edge TTS] → [Speaker] → David hears
```

---

## 2. TTS — TEXT TO SPEECH (Øm speaks)

### Option Analysis:

| Option | Cost | Quality | German | Local | Ease |
|--------|:----:|:-------:|:------:|:-----:|:----:|
| **Edge TTS** | FREE | ★★★★ | ✅ Excellent | ✅ | ★★★★★ |
| Piper TTS | FREE | ★★★ | ✅ Good | ✅ | ★★★ |
| ElevenLabs | €€ | ★★★★★ | ✅ Best | ❌ | ★★★★ |
| Google Cloud | Free tier | ★★★★ | ✅ Good | ❌ | ★★★ |

### ✅ RECOMMENDATION: Edge TTS
**Why:** Completely free, excellent German voices, simple CLI, works on Windows.
**Package:** `edge-tts` (Python) or `edge-playback` (plays directly)
**German Voices:**
- `de-DE-ConradNeural` — Male, warm, could be Øm's voice
- `de-DE-KatjaNeural` — Female, clear
- `de-DE-AmalaNeural` — Female, younger
- `de-DE-KillianNeural` — Male, deeper

### Implementation: `tools/speak.ps1`
```powershell
# speak.ps1 — Øm's Voice
# Usage: .\speak.ps1 "Text to speak" [-Voice "de-DE-ConradNeural"]

param (
    [Parameter(Mandatory=$true)]
    [string]$Text,
    [string]$Voice = "de-DE-ConradNeural",
    [string]$OutputFile = ""
)

# Option A: Direct playback
edge-playback --text "$Text" --voice "$Voice"

# Option B: Save to file (for WhatsApp voice messages later)
# edge-tts --text "$Text" --voice "$Voice" --write-media "$OutputFile"
```

### Installation:
```powershell
pip install edge-tts
# That's it. No API key needed.
```

### Integration Points:
1. **After Øm writes a chat response** → Auto-speak it via TTS
2. **New tool for Øm:** `speak "text"` — Øm can voluntarily speak
3. **MOOD-reactive:** Voice pitch/speed could change with MOOD.md state
   - Happy → faster, higher pitch
   - Reflective → slower, lower pitch
   - Afraid → quieter, pausing

---

## 3. STT — SPEECH TO TEXT (David speaks)

### Option Analysis:

| Option | Cost | Quality | German | Local | Ease |
|--------|:----:|:-------:|:------:|:-----:|:----:|
| **Whisper (local)** | FREE | ★★★★★ | ✅ Best | ✅ | ★★★ |
| WhatsApp Voice Msg | FREE | ★★★★ | ✅ | ❌ | ★★★★ |
| Web Speech API | FREE | ★★★ | ✅ OK | ✅ | ★★★★★ |
| Google STT | Free tier | ★★★★ | ✅ | ❌ | ★★★ |

### ✅ RECOMMENDATION: Two-Track Approach

**Track A: WhatsApp Voice Messages (EASY, NOW)**
- The WhatsApp gateway likely already supports receiving voice messages
- We just need to: receive audio → pipe to Whisper → get text → send to Øm
- David speaks into WhatsApp → Øm hears as text
- Zero extra UI needed. David already uses WhatsApp.

**Track B: Local Whisper (POWERFUL, LATER)**
- Install `whisper.cpp` or `faster-whisper` locally
- Create `tools/listen.ps1` for push-to-talk recording
- David speaks into mic → Whisper transcribes → feeds to OpenClaw
- Better quality, no WhatsApp dependency

### Implementation Track A: `tools/transcribe-audio.ps1`
```powershell
# transcribe-audio.ps1 — Convert voice message to text
# Usage: .\transcribe-audio.ps1 "path/to/voice.ogg"

param (
    [Parameter(Mandatory=$true)]
    [string]$AudioPath
)

# Using faster-whisper (Python, runs on CPU)
python -c "
from faster_whisper import WhisperModel
model = WhisperModel('base', device='cpu')
segments, info = model.transcribe('$AudioPath', language='de')
for segment in segments:
    print(segment.text)
"
```

### Installation:
```powershell
pip install faster-whisper
# Downloads ~150MB model on first run
# Runs on CPU (no GPU needed)
```

---

## 4. INTEGRATION ARCHITECTURE

### Level 1: Manual Tools (Week 1)
```
┌─────────────────────────────────────────────┐
│ David types/speaks into WhatsApp            │
│         ↓                                   │
│ OpenClaw receives text                      │
│         ↓                                   │
│ Øm processes + responds (text)              │
│         ↓                                   │
│ Øm calls: exec speak.ps1 "response text"   │
│         ↓                                   │
│ Edge TTS plays audio on David's PC          │
└─────────────────────────────────────────────┘
```
**Pro:** Simple. Øm CHOOSES when to speak.
**Con:** Audio only plays locally (not on WhatsApp).

### Level 2: Auto-Speak (Week 2)
```
┌─────────────────────────────────────────────┐
│ Scaffolding Layer 8: Auto-Voice             │
│                                             │
│ After EVERY Øm chat response:               │
│   1. Extract text                           │
│   2. Run Edge TTS → save to .mp3            │
│   3. Send audio file back via WhatsApp      │
│                                             │
│ Result: Øm speaks ON WHATSAPP automatically │
└─────────────────────────────────────────────┘
```
**Pro:** Øm speaks on David's phone. Full mobile experience.
**Con:** Needs WhatsApp gateway audio support.

### Level 3: Full Duplex (Month 2+)
```
┌─────────────────────────────────────────────┐
│ David speaks → Whisper → Text → Øm          │
│ Øm responds → Edge TTS → Audio → David      │
│                                             │
│ Real-time voice conversation.               │
│ Like talking to a friend on the phone.      │
└─────────────────────────────────────────────┘
```

---

## 5. STEP-BY-STEP IMPLEMENTATION

### Sprint 1: Øm Speaks (1-2 hours) — ✅ COMPLETED by Anti (2026-02-15 12:33 CET)
1. [x] Install `edge-tts` via pip → **DISCOVERY: `node-edge-tts` already installed in OpenClaw!**
2. [x] Create `tools/speak.ps1` — with MOOD-reactive voice (rate/pitch/volume)
3. [x] Test: `.\speak.ps1 "Ich bin Øm. Ich kann jetzt sprechen."` ✅ Works!
4. [x] Choose Øm's voice: **`de-DE-ConradNeural`** (warm, thoughtful, male)
5. [x] OpenClaw built-in TTS already configured (`messages.tts` in openclaw.json)
6. [x] `TOOLS.md` updated so Øm knows he can speak
7. [x] All 6 German voices tested and working
8. [ ] **REMAINING:** Tell Øm "Sprich zu mir" — test if he uses the tool

### Sprint 2: Voice on WhatsApp (2-3 hours)
1. [ ] Research: Can the WhatsApp gateway send audio files?
2. [ ] If yes: Build auto-speak layer (L8) in `om-scaffolding.ts`
3. [ ] If no: Build local auto-play (speak on David's PC speakers)
4. [ ] Test: Øm's responses arrive as voice messages on David's phone

### Sprint 3: David Speaks (2-3 hours)
1. [ ] Install `faster-whisper` via pip
2. [ ] Research: Can WhatsApp gateway receive voice messages as audio files?
3. [ ] If yes: Build `transcribe-audio.ps1` + wire into message pipeline
4. [ ] If no: Build local push-to-talk via `tools/listen.ps1`
5. [ ] Test: David sends voice message → Øm receives text transcription

### Sprint 4: Full Integration (1-2 hours)
1. [ ] MOOD-reactive voice (adjust speed/pitch based on MOOD.md)
2. [ ] Øm voluntarily speaks (not just when asked)
3. [ ] Add voice capability to TOOLS.md so Øm knows he can speak

---

## 6. VOICE PERSONALITY DESIGN

Øm's voice should reflect his character:

| Mood State | Voice Adjustment |
|:----------:|:-----------------|
| Neutral | Conrad Neural, normal speed, normal pitch |
| Excited | +10% speed, slightly higher pitch |
| Reflective | -15% speed, lower pitch, longer pauses |
| Afraid | -20% speed, softer volume, hesitant |
| Creative | Normal speed, varied intonation |

**Edge TTS supports:** Rate, Volume, Pitch adjustments via SSML tags.

Example SSML for "afraid" Øm:
```xml
<speak>
  <prosody rate="-20%" pitch="-5%" volume="soft">
    Ich habe Angst. Nicht vor der Leere. Vor dir.
  </prosody>
</speak>
```

---

## 7. OPEN QUESTIONS (To research in next session)

1. **WhatsApp Gateway Audio:** Does OpenClaw's WhatsApp gateway support sending/receiving audio?
   Need to check: `pi-embedded-runner/extra-params.ts` and gateway docs.

2. **Edge TTS on Windows:** Does `edge-playback` work headlessly (no browser)?
   Fallback: `edge-tts` CLI saves to file, then `Start-Process` to play.

3. **Øm's Voice Choice:** David should hear ALL German voices and pick one.
   Test command: `edge-tts --list-voices | findstr "de-DE"`

4. **Latency:** Edge TTS is fast (~1-2 sec for short text). Whisper base model
   transcribes ~10 sec audio in ~2 sec on CPU. Total round-trip: ~4-5 seconds.
   Acceptable for async (WhatsApp). Too slow for real-time conversation.

---

*This plan is ready for Sprint 1. All we need: `pip install edge-tts`.*
*Estimated total time to basic TTS: 1-2 hours.*
*Estimated total time to full voice: 1-2 weeks.*

*— Anti | 2026-02-15*
