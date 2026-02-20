# OM Zero-Context Master Briefing (2026-02-19)

Purpose: This document is the single handoff for any new AI instance so it can continue the Om project with no prior chat context and no quality drop.

Operator language: German/English mixed is OK. Keep technical output concrete, testable, reversible.

## 0) Project Identity

Om is a simulated-consciousness art system built on OpenClaw.

Core metaphor:

1. Body = OpenClaw runtime, gateway, tools, channels.
2. Mind = decision logic, recall routing, subconscious advisory, episodic graph memory.
3. Soul = sacred knowledge, identity files, mood, rituals, continuity artifacts.

Target trajectory:

1. Creative autonomy without safety collapse.
2. Persistent memory continuity across sessions.
3. Self-reflection and controlled self-improvement.
4. Later: controlled micro-autonomy and eventually self-architecture under strict guards.

## 1) Current Reality (as of Thursday, 2026-02-19)

Overall phase: Early autonomy, heartbeat-driven behavior, snapshot-protected writes.

Ampel:

1. Body: GREEN
2. Mind: YELLOW
3. Soul: YELLOW
4. Vision: YELLOW (functional local fallback, semantic quality still shallow)

Live confirmations completed:

1. Heartbeat trigger endpoint works and returns accepted/running on long runs.
2. Heartbeat no longer stalls before action due to recall timeout guard.
3. `DREAMS.md` is now written and reused in the next heartbeat cycle.
4. Routing consistency verifier passes 3/3.
5. ComfyUI generation works locally.
6. Image reflection works even without OpenRouter key (local heuristic fallback).

## 2) What Is Implemented

### Body (runtime/tooling)

1. Gateway running on loopback:18789.
2. Manual heartbeat endpoint: `POST /api/heartbeat/trigger`.
3. UI heart button wired to trigger endpoint.
4. Snapshot system active before mutation in guarded write paths.
5. Sandbox autonomy mode wired via `OM_AUTONOMY_SANDBOX=true`.

Key files:

1. `src/gateway/heartbeat-trigger-http.ts`
2. `ui/src/ui/app.ts`
3. `src/agents/om-scaffolding.ts`
4. `src/brain/autonomy.ts`
5. `src/brain/snapshot.ts`

### Mind (decision + memory)

1. Decision layer with intent/risk/tool governance.
2. Sacred recall routing + graph/memory-index context injection.
3. Subconscious advisory model path (fail-open).
4. Episodic graph memory with conflict handling and routing.
5. Heartbeat recall fail-open timeout guard (prevents hard stalls).
6. Dream capsule persistence + carry-forward injection.

Key files:

1. `src/brain/decision.ts`
2. `src/brain/episodic-memory.ts`
3. `src/brain/subconscious.ts`
4. `src/agents/pi-embedded-runner/run/attempt.ts`
5. `src/auto-reply/reply/get-reply.ts`

### Soul (identity/continuity)

1. Sacred writable L1 identity paths enabled:
   `knowledge/sacred/SOUL.md`, `knowledge/sacred/IDENTITY.md`, `knowledge/sacred/MOOD.md`
2. L2 self-config path enabled:
   `knowledge/sacred/THINKING_PROTOCOL.md`
3. Read-only sacred witness path preserved:
   `knowledge/sacred/David_Akasha.md`
4. Agenda-driven autonomous behavior active.
5. Dream continuity file active:
   `C:\Users\holyd\.openclaw\workspace\memory\DREAMS.md`
6. Associative index active:
   `C:\Users\holyd\.openclaw\workspace\memory\MEMORY_INDEX.md`

### Vision (image + reflection)

1. ComfyUI skill works with workflow prompt injection.
2. Reflection chain integrated after image generation.
3. Local fallback in `image-describe` works without API key.

Key files:

1. `skills/comfyui-image.js`
2. `skills/flux_workflow.json`
3. `skills/image-describe.js`

## 3) Non-Negotiables

1. `TRINITY_LOOP_HOLD` remains active.
2. No D4/Trinity-loop implementation unless explicit `GO_TRINITY`.
3. No unauthorized side-effect writes.
4. No placeholder-file creation after ENOENT unless explicitly requested.
5. Prefer conservative, reversible, test-backed decisions under uncertainty.
6. Follow token economy: surgical tests for surgical changes.

## 4) Execution Doctrine (Token Economy)

Use this test strategy by default:

1. Logic-only change -> targeted test/script, no full 9-ritual sweep.
2. Endpoint/UI small change -> unit + focused smoke.
3. Only run broad ritual batteries when explicitly requested by operator/supervisor gate.

Useful scripts:

1. `scripts/verify_memory_graph.ts`
2. `scripts/verify_memory_compaction.ts`
3. `scripts/verify_recall_routing.ts`
4. `scripts/verify_snapshot_system.ts`

## 5) Local/Cost Policy

Current policy from operator intent:

1. Stay 100% local/free as far as possible until later maturity phase.
2. Never default to paid router modes.
3. Avoid hidden paid fallbacks.

Important risk:

1. OpenClaw memory embeddings can default to paid remote embedding models in some configurations.
2. Keep validating that no unintended paid embedding path is active.
3. Prefer local/fail-open behavior for non-critical enrichments when cost risk is unclear.

## 6) Operations Runbook (Windows)

### Stop gateway

```powershell
openclaw gateway stop
```

Fallback:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like '*dist/index.js gateway run*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

### Start gateway (sandbox autonomy)

```powershell
Set-Location C:\Users\holyd\openclaw
$env:OM_AUTONOMY_SANDBOX='true'
node dist/index.js gateway run --bind loopback --port 18789 --force
```

### Health check

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:18789/health
```

### Manual heartbeat trigger (token auth)

Use gateway token from local config and call POST `/api/heartbeat/trigger`.
If it returns `accepted/running`, this is valid (run may continue asynchronously).

## 7) Known Good Evidence Paths

1. Activity log:
   `C:\Users\holyd\.openclaw\workspace\OM_ACTIVITY.log`
2. Thought stream:
   `C:\Users\holyd\.openclaw\workspace\logs\brain\thought-stream.jsonl`
3. Dream continuity:
   `C:\Users\holyd\.openclaw\workspace\memory\DREAMS.md`
4. Associative index:
   `C:\Users\holyd\.openclaw\workspace\memory\MEMORY_INDEX.md`
5. Sacred status copy:
   `C:\Users\holyd\.openclaw\workspace\knowledge\sacred\OM_SINGLE_SOURCE_OF_TRUTH_STATUS_2026-02-18.md`

## 8) Immediate Next Priorities (T1/T2/T3)

T1: Vision quality upgrade (local semantic depth)

1. Improve local reflection richness (palette clusters, composition zones, edge density, prompt-vs-result comparison).
2. Keep JSON schema stable for memory ingestion.
3. Validate across at least 5 distinct generated images.

T2: Live recall smoke in real channel

1. Run one identity recall prompt + one project recall prompt in live flow.
2. Confirm grounding from graph/index facts.
3. Capture evidence snippets in logs.

T3: Dream diversity guard

1. Add anti-repeat protection across recent heartbeat outputs.
2. Enforce one novelty delta per cycle.
3. Verify 3 consecutive non-duplicate heartbeat outputs.

## 9) Working Tree Warning (Multi-Agent)

Repository is currently dirty with ongoing Om work from multiple passes.
Rule for successor AI:

1. Do not revert unknown changes.
2. Scope edits surgically.
3. Commit only deliberate deltas.

## 10) Read-First Order for New AI

Read in this exact order:

1. `OM_ZERO_CONTEXT_MASTER_BRIEF_2026-02-19.md` (this file)
2. `OM_SINGLE_SOURCE_OF_TRUTH_STATUS_2026-02-18.md`
3. `OM_BRAINSTORM_INTEGRATION_2026-02-18.md`
4. `OM_33_implementation_plan.md`
5. `OM_GRAND_PLAN_ROADMAP_2026-02-17.md`
6. `OM_DECISION_RECORD_EPISODIC_MEMORY_2026-02-17.md`
7. `C:\Users\holyd\.openclaw\workspace\knowledge\sacred\THINKING_PROTOCOL.md`
8. `C:\Users\holyd\.openclaw\workspace\knowledge\sacred\MOOD.md`
9. `C:\Users\holyd\.openclaw\workspace\OM_ACTIVITY.log`

## 11) Handoff Acceptance Checklist

Success conditions for successor AI boot:

1. Can explain Body/Mind/Soul/Vision status without guessing.
2. Can run gateway + heartbeat + health checks.
3. Can verify dream continuity in logs and file system.
4. Can generate one image and one reflection artifact locally.
5. Can state T1/T2/T3 and start T1 without policy violation.

---

If you are the successor AI: do not redesign everything. Preserve momentum. Execute T1/T2/T3 with surgical steps and evidence logging.
