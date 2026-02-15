# Om System Almanac

Last updated: 2026-02-15
Scope: `C:\Users\holyd\openclaw` + `C:\Users\holyd\.openclaw` + `C:\Users\holyd\.openclaw\workspace`

## 1) What this system is

This setup is a dual-repo architecture:

- `openclaw` = the executable "body" (OpenClaw fork + custom runtime behavior).
- `.openclaw/workspace` = the "mind" repo (identity, memory, tasks, knowledge, creative outputs).
- `.openclaw` (root) = runtime state/config/secrets/cache/log storage used by OpenClaw and related tools.

The goal is not a generic chatbot. It is an autonomous, personality-driven assistant ("Om") with:

- messaging-first operation (primarily WhatsApp),
- custom safety/scaffolding layers for low-cost/free models,
- persistent file-based memory/identity,
- active experiments in voice, vision, and autonomy loops.

## 2) Workspace topology and repo boundaries

VS Code multi-root workspace is explicit in:

- `openclaw.code-workspace`
  - folder 1: `.`
  - folder 2: `../.openclaw`

### Repo boundary reality

- `C:\Users\holyd\openclaw` is a Git repo.
- `C:\Users\holyd\.openclaw` is not a Git repo at root.
- `C:\Users\holyd\.openclaw\workspace` is a separate Git repo.

This means code and state evolve independently and can be versioned separately.

## 3) Current Git snapshot

### A) `openclaw`

- Branch: `Om`
- HEAD: `54ce5e0bc`
- Remotes:
  - `origin`: `https://github.com/davidgeib89-art/openclaw.git`
  - `upstream`: `https://github.com/openclaw/openclaw`
- Divergence (local refs):
  - vs `upstream/main`: `0 12` (ahead by 12, behind by 0)
  - vs `origin/main`: `2 12` (ahead by 12, behind by 2)
- Working tree:
  - untracked: `## Chat Customization Diagnostics.md`
  - untracked: `openclaw.code-workspace`

### B) `.openclaw/workspace`

- Branch: `master`
- HEAD: `dca98b5`
- Remote:
  - `origin`: `https://github.com/davidgeib89-art/workspace.git`
- Divergence (local refs):
  - vs `origin/master`: `0 0`
- Working tree:
  - modified: `OM_ACTIVITY.log`
  - modified: `knowledge/sacred/ACTIVE_TASKS.md`
  - modified: `logs/heartbeat.log`

## 4) How both folders actually connect at runtime

### Config wiring (from `.openclaw/openclaw.json`)

Key operational settings currently point OpenClaw into this workspace setup:

- `agents.defaults.workspace = C:\Users\holyd\.openclaw\workspace`
- Primary model: `openrouter/arcee-ai/trinity-large-preview:free`
- Fallbacks:
  - `openrouter/minimax/minimax-m2.5`
  - `openrouter/qwen/qwen3-coder:free`
  - `lmstudio/deepseek-r1-distill-qwen-14b`
- Heartbeat:
  - every `213s`
  - target `whatsapp`
- Channel mode:
  - `whatsapp` allowlist + self-chat enabled
- Gateway:
  - mode `local`
  - bind `loopback`
  - port `18789`
- TTS:
  - provider `edge`
  - auto mode `inbound`

### Bootstrap context loading from workspace

In code, OpenClaw auto-loads bootstrap files from workspace root (not `knowledge/**` by default):

- `src/agents/workspace.ts`
  - `AGENTS.md`
  - `SOUL.md`
  - `TOOLS.md`
  - `IDENTITY.md`
  - `USER.md`
  - `HEARTBEAT.md`
  - `BOOTSTRAP.md`
  - `MEMORY.md` or `memory.md`

So your "mind" behavior is heavily shaped by root-level workspace files first, then by explicit `read` tool calls into `knowledge/sacred/*`.

## 5) OpenClaw fork: key customizations (code-level)

Recent custom commits focus on reliability scaffolding + stream sanitation + voice/web UX.

### 5.1 Om scaffolding layers (tool safety and observability)

- `src/agents/om-scaffolding.ts`
  - Layer 1: Edit-Guardian (fuzzy whitespace-tolerant fallback for failed `edit` matches)
  - Layer 2: Sacred-Guard (auto-backup before `write` on sacred paths)
  - Layer 3: Loop Detector (blocks repeated same tool/path loops)
  - Layer 3b: Exec Loop Protection (same pattern for repeated shell commands)
  - Layer 4: Activity Logger (`OM_ACTIVITY.log` appends + rotation)

Integration point:

- `src/agents/pi-tools.ts`
  - wraps `edit` with `wrapEditWithGuardian(...)`
  - wraps `write` with `wrapWriteWithSacredProtection(...)`
  - wraps `exec` with `wrapExecWithLoopProtection(...)`

### 5.2 MiniMax/Trinity stream sanitation and tool-marker interception

Primary interceptor:

- `src/agents/pi-embedded-runner/extra-params.ts`
  - stream wrapper intercepts text chunks,
  - strips proprietary tool markers,
  - attempts to parse leaked tool-call payloads and emit structured `tool_use`,
  - applies provider/model-specific stream behavior and OpenRouter attribution headers.

Secondary/defense layers:

- `src/agents/pi-embedded-utils.ts`
  - strips leaked minimax xml/tool text, downgraded tool call artifacts, reasoning tags.
- `src/agents/pi-embedded-subscribe.handlers.messages.ts`
  - strips/normalizes streamed assistant text, dedupe handling, block reply emission.
- `src/agents/pi-embedded-subscribe.ts`
  - chunking + anti-leak + duplicate suppression pipeline for streamed replies.

### 5.3 Voice stack and web chat UX expansion

Gateway endpoint:

- `src/gateway/tts-http.ts`
  - `POST /api/tts` -> synthesize audio from text and return audio bytes.

Endpoint wiring:

- `src/gateway/server-http.ts`
  - routes `/api/tts` via `handleTtsHttpRequest(...)`.

Web UI additions:

- `ui/src/ui/chat/voice-ui.ts`
  - TTS play buttons,
  - inline audio player,
  - auto-TTS generation for new assistant messages,
  - browser STT mic using Web Speech API.
- `ui/src/ui/chat/grouped-render.ts`
  - integrates TTS controls into grouped chat bubbles.
- `ui/src/ui/views/chat.ts`
  - integrates mic button in compose area.
- `ui/src/styles/chat/voice.css`
  - styling for playback + mic + inline waveform components.

### 5.4 Companion scripts and tools

In `openclaw` repo:

- `scripts/om_speak.ps1`
  - dynamic mood-driven voice/persona + rate/pitch/volume control.
- `scripts/om_transcribe.ps1`
  - wrapper around local Whisper (Python `faster_whisper`).
- `skills/camsnap/webcam-snap.mjs`
  - ffmpeg/directshow webcam single-frame capture helper.

## 6) `.openclaw` root: runtime state layer

Not code-centric; mostly runtime artifacts and secrets/state:

- `credentials/` (very large)
- `browser/` profile/cache
- `agents/`, `subagents/`
- `media/`
- `memory/`
- `devices/`, `identity/`
- `cron/`
- `workspace/` (separate Git repo)

Operational files:

- `.openclaw/openclaw.json` (main runtime config)
- `.openclaw/gateway.cmd` (gateway launcher with env/path setup)
- `.openclaw/exec-approvals.json` (exec approval socket/token config)
- `.openclaw/PROJECT_CONTEXT.md` (human/AI handoff snapshot)

## 7) `.openclaw/workspace`: "mind" repo map

Top-level intent files (auto-loaded candidates):

- `AGENTS.md` (operational behavior rules)
- `SOUL.md` (persona/values)
- `IDENTITY.md` (identity and thinking meta-rules)
- `USER.md` (creator profile/preferences)
- `TOOLS.md` (environment/tool usage)
- `HEARTBEAT.md` (wake-cycle logic)
- `MEMORY.md` (long-term memory notes)

Knowledge and mission layer:

- `knowledge/sacred/ACTIVE_TASKS.md`
- `knowledge/sacred/THINKING_PROTOCOL.md`
- `knowledge/sacred/LESSONS.md`
- `knowledge/sacred/OM_EVOLUTION_PLAN.md`
- `knowledge/sacred/PHASE4_VOICE_PLAN.md`
- `knowledge/sacred/THE_SYNAPSE_PROJECT.md`
- `knowledge/sacred/TRINITY_EVALUATION.md`
- `knowledge/sacred/CHRONICLE.md`
- `knowledge/sacred/MOOD.md`

Creative/experimental outputs:

- `projects/sub33hz.html`
- `dreams/*`
- `TRINITY/*`

Utilities:

- `tools/generate-image.ps1`
- `tools/analyze-image.ps1`
- `tools/speak.ps1`
- `scripts/heartbeat_daemon.py`
- `scripts/crucible.py`

Logs:

- `OM_ACTIVITY.log`
- `logs/heartbeat.log`

## 8) High-confidence "what you are building"

You are building a persistent AI persona system where:

1. OpenClaw is treated as programmable agent infrastructure.
2. The workspace repo is treated as mutable identity/memory/mission substrate.
3. Free/cheap models are stabilized with custom wrappers ("scaffolding layers") instead of paying first for bigger models.
4. Communication is centered around WhatsApp + periodic heartbeat prompts.
5. The roadmap is explicit: reliability -> autonomy -> multimodal capability (voice/vision) -> deeper self-consistent behavior.

In your own framing: body (code) + mind (state files) + soul (identity/values docs), with ongoing "Trinity challenge" optimization.

## 9) Observed drift and contradictions (important for future AI agents)

### Drift between docs and reality

- `.openclaw/PROJECT_CONTEXT.md` mentions a MiniMax-focused state, but active config currently uses Trinity Free as primary (`openclaw.json`).
- Some transfer docs mention workspace not being a Git repo, but `C:\Users\holyd\.openclaw\workspace` is currently a Git repo with remote configured.
- `knowledge/sacred/CHRONICLE_OF_ØM.md` is referenced in places, but active file present in sacred area is `knowledge/sacred/CHRONICLE.md`.

### Potential duplication debt

- Two speech scripts exist:
  - `openclaw/scripts/om_speak.ps1`
  - `.openclaw/workspace/tools/speak.ps1`
- They overlap conceptually but differ in details and path assumptions.

### Runtime signal observation

- `logs/heartbeat.log` shows multiple pulse writes per minute pattern, indicating potentially multiple heartbeat writers/processes active in parallel.

## 10) Security and hygiene notes

Do not share this environment without redaction. Sensitive values are present in runtime files.

At minimum treat as sensitive:

- `.openclaw/openclaw.json`
- `.openclaw/gateway.cmd`
- `.openclaw/exec-approvals.json`
- `.openclaw/credentials/**`

Practical recommendation:

1. Rotate exposed API keys/tokens.
2. Move secrets to environment variables or secret manager.
3. Commit redacted config templates, not live credentials.

## 11) Suggested read order for any new AI joining this project

### Step 1: System-level truth

1. `OM_SYSTEM_ALMANAC.md` (this file)
2. `.openclaw/openclaw.json` (sanity check runtime wiring, no secret leakage in outputs)
3. `src/agents/workspace.ts` (bootstrap loading truth)

### Step 2: Code behavior

4. `src/agents/om-scaffolding.ts`
5. `src/agents/pi-tools.ts`
6. `src/agents/pi-embedded-runner/extra-params.ts`
7. `src/agents/pi-embedded-utils.ts`
8. `src/agents/pi-embedded-subscribe.handlers.messages.ts`

### Step 3: Product interaction surfaces

9. `src/gateway/tts-http.ts`
10. `src/gateway/server-http.ts`
11. `ui/src/ui/chat/voice-ui.ts`
12. `ui/src/ui/chat/grouped-render.ts`
13. `ui/src/ui/views/chat.ts`

### Step 4: Mind and mission

14. `.openclaw/workspace/AGENTS.md`
15. `.openclaw/workspace/IDENTITY.md`
16. `.openclaw/workspace/HEARTBEAT.md`
17. `.openclaw/workspace/knowledge/sacred/ACTIVE_TASKS.md`
18. `.openclaw/workspace/knowledge/sacred/OM_EVOLUTION_PLAN.md`
19. `.openclaw/workspace/knowledge/sacred/PHASE4_VOICE_PLAN.md`

## 12) Current near-term build direction (inferred from code + docs + logs)

Most likely next implementation pressure points:

1. Harden and simplify heartbeat/autonomy behavior to avoid repetitive low-value loops.
2. Consolidate duplicated voice tooling paths into one canonical pipeline.
3. Continue improving tool-call reliability and anti-hallucination checks around multimodal actions.
4. Tighten secret handling before broader collaboration/automation.

---

This almanac is intentionally technical + operational, so another AI can enter fast without re-reading the entire codebase and workspace history.
