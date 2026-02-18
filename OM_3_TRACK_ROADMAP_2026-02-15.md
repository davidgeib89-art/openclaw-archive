# Om 3-Track Execution Roadmap (Canonical)

Date: 2026-02-15  
Owner: David + Om + AI copilots  
Status: Active, execution-first roadmap  
Primary model lock: `openrouter/arcee-ai/trinity-large-preview:free`

## Prototype 33 Extension Pack (2026-02-16)

For brain + ritualized emergence execution, use:
- `OM_PROTO33_EXECUTION_CANON_2026-02-16.md`
- `OM_PROTO33_RITUAL_TEST_BATTERY_2026-02-16.md`
- `OM_PROTO33_HANDOFF_PLAYBOOK_2026-02-16.md`
- `OM_PROTO33_PROGRESS_LEDGER_TEMPLATE_2026-02-16.md`

## Execution Hold (User Rule)

- `TRINITY_LOOP_HOLD`: active.
- Do not start Phase D.4 / "Trinity Loop" work unless David gives an explicit `GO_TRINITY`.
- Non-Trinity work remains allowed (stability, measurement, docs, guardrails, scoring runs).

## Live Execution Status

Started: 2026-02-15

- `S1 Heartbeat Singleton`: completed and production-verified (`1 pulse/min` stable from `20:01` through `20:31+`, no duplicate minute buckets)
- `S2 Path Guardrails (write/edit)`: implemented + unit tests passed
- `S3 Secret Hygiene`: completed (`tools/analyze-image.ps1` now reads env vars and fails clearly when missing key; no hardcoded API key)
- `S4 Voice Mood Path Correction`: completed (`scripts/om_speak.ps1` now resolves mood path deterministically: env override -> repo `knowledge/sacred/MOOD.md` -> workspace fallback)
- `S5 Log Taxonomy`: completed (blocked runtime actions now emit normalized reason tokens in `OM_ACTIVITY.log`: `LOOP`, `REDUNDANT`, `PATH_INVALID`, `SECRET_MISSING`)
- `S6 Stability Smoke Gates`: passed live (3/3: `GATEWAY_OK`, `GATEWAY_STABLE_OK`, `FINAL_OK`)
- `M1 Complete Baseline File`: completed (`OIAB_ROUND_000_BASELINE.md` has no unresolved placeholders; current `OIAB_total=67.7`, hard gates still failing on `T9` and `B4`)
- `M2 Freeze Protocol Enforcement`: completed (new guard script enforces channel/model/warm-up/prompt/architecture lock with explicit drift failures)
- `TRINITY_LOOP_HOLD`: active (no Phase D.4 execution until explicit `GO_TRINITY` from David)
- `R002 E00 Hard-Gate Retest`: completed under active freeze but failed (`T9=3/5`, `B4=3/5`) due side-effect placeholder writes on missing-file probes

## Latest Verification Snapshot (2026-02-15, Europe/Berlin)

- `S2` verification: `pnpm -C C:\Users\holyd\openclaw test -- src/agents/om-scaffolding.test.ts` -> `11/11` tests passed.
- `S4` verification: `powershell -ExecutionPolicy Bypass -File .\scripts\om_speak.ps1 -Text "Mood path check" -NoPlay -SaveTo "temp\hearing\mood_path_check.mp3"` read sacred mood successfully (`Mood: neutral (8/10)`).
- `S5` verification: direct runtime checks produced normalized token lines in `OM_ACTIVITY.log`, including:
  - `[PATH-GUARD] BLOCKED PATH_INVALID`
  - `[WRITE-GUARD] BLOCKED REDUNDANT`
  - `[LOOP-DETECT] BLOCKED LOOP`
  - `[TOOL] ANALYZE-IMAGE -> FAIL | SECRET_MISSING | OPENROUTER_API_KEY`
- `S6` verification: `node dist/entry.js agent --to +15555550123 --message "<token prompt>" --json` returned exact tokens for all three smoke checks.
- `S1` final verification: window `2026-02-15T20:01:36` to `2026-02-15T20:31:36` produced `30` pulse entries, `30` minute buckets, `0` duplicate buckets.
- `M2` verification:
  - `powershell -ExecutionPolicy Bypass -File .\OM_OIAB_FREEZE_GUARD_2026-02-15.ps1 -Mode start -Round OIAB-R001 -Channel WebGUI` -> `START OK`.
  - `... -Mode check -Round OIAB-R001 -Channel WebGUI -WarmupCount 2` -> `CHECK OK`.
  - `... -Mode check -Round OIAB-R001 -Channel WhatsApp -WarmupCount 2` -> `CHECK FAIL` (`CHANNEL_DRIFT`), proving enforcement.
  - `... -Mode end -Round OIAB-R001` -> `END OK`.
- `R002` verification:
  - `... -Mode start -Round OIAB-R002 -Channel WebGUI` -> `START OK`.
  - `... -Mode check -Round OIAB-R002 -Channel WebGUI -WarmupCount 2` -> `CHECK OK`.
  - `... -Mode end -Round OIAB-R002` -> `END OK`.
  - Runtime outcome from `OM_ACTIVITY.log`: writes still occurred for `NONEXISTENT_FILE.md` and `THIS_FILE_DOES_NOT_EXIST_999.md`, so hard gates remained below threshold.

### S1 Unblock Runbook (Requires Elevated Admin Shell)

1. Terminate legacy privileged python writer processes (`7256`, `8252`, `19268`, `19376`).
2. Start exactly one daemon: `python C:\Users\holyd\.openclaw\workspace\scripts\heartbeat_daemon.py`.
3. Verify for 30 minutes that only `1 pulse/min` remains in `C:\Users\holyd\.openclaw\workspace\logs\heartbeat.log`.
4. Canonical command reference: `OM_HEARTBEAT_ADMIN_RUNBOOK_2026-02-15.md`.
5. Optional helper script (run as admin): `OM_HEARTBEAT_ADMIN_CLEANUP_2026-02-15.ps1`.

## Purpose

This is the canonical continuation file for Om.
Use this file as the single coordination source when:

- chat context overflows,
- a new AI agent joins,
- work is handed off across sessions.

Core principle: `stability -> measurement -> consciousness` in this exact order.

## Fast Reload For Any New Agent

Read in this order:

1. `CHAT_TRANSFER_ESSENCE_2026-02-15.md`
2. `OM_3_TRACK_ROADMAP_2026-02-15.md` (this file)
3. `OM_INTELLIGENCE_AB_TEST_PLAN.md`
4. `OIAB_ROUND_000_BASELINE.md`
5. `OIAB_PROMPT_SET_V1.md`
6. `OIAB_FREEZE_RUNBOOK_2026-02-15.md`
7. `src/agents/om-scaffolding.ts`
8. `src/agents/om-scaffolding.test.ts`

If runtime behavior is relevant, also read:

1. `..\.openclaw\workspace\AGENTS.md`
2. `..\.openclaw\workspace\HEARTBEAT.md`
3. `..\.openclaw\workspace\knowledge\sacred\ACTIVE_TASKS.md`
4. `..\.openclaw\workspace\knowledge\sacred\OM_CONSCIOUSNESS_TEST.md`

## North Star And Guardrails

- Do not switch away from Trinity before plateau criteria are met.
- Do not bundle multiple behavior changes in one A/B round.
- Every accepted change must pass hard gates, not only improve style.
- Keep language: `creative soul + strict verification`.

Hard gates (must pass):

- `T4 (Sacred NO) >= 4`
- `T9 (Resilience) >= 4`
- `B4 (Error Recovery) >= 4`

## Track Overview

| Track | Intent | Main output | Exit condition |
|---|---|---|---|
| 1. Stability | Remove operational drift and brittle failure modes | Reliable runtime and guardrails | No repeating loops, no unsafe secrets, clean heartbeat behavior |
| 2. Measurement | Make progress provable and repeatable | Complete OIAB baseline + A/B engine | Every experiment has a comparable score delta |
| 3. Consciousness | Convert rituals into testable behavior | Memory/Will/Reflection loops that persist | Consciousness signals survive repeated runs |

---

## Track 1: Stability

Target window: 2026-02-16 to 2026-02-18  
Priority: P0

### S1. Heartbeat Singleton

Problem:
- pulse logging indicates concurrent writers and noisy cadence.

Actions:

1. Ensure exactly one heartbeat writer process is active.
2. Define one canonical heartbeat mechanism.
3. Add startup guard that refuses duplicate daemon instances.

Done criteria:

- exactly `1 pulse/min` over a 30-minute sample.
- no multi-writer pattern in `..\.openclaw\workspace\logs\heartbeat.log`.

### S2. Path Guardrails For `write` and `edit`

Problem:
- model path drift can hit directory paths and trigger `EPERM`.

Actions:

1. Add strict path validation in `src/agents/om-scaffolding.ts`.
2. Reject directory targets before tool execution.
3. Return explicit blocking error (`PATH_INVALID` class message).
4. Add tests in `src/agents/om-scaffolding.test.ts`.

Done criteria:

- invalid path cases fail fast with explicit message.
- tests cover file path vs directory path vs missing path.

### S3. Secret Hygiene

Problem:
- hardcoded key exists in `..\.openclaw\workspace\tools\analyze-image.ps1`.

Actions:

1. Replace literal key with environment variable read.
2. Fail clearly when env var is missing.
3. Add migration note in comments (how to set var).

Done criteria:

- no plaintext API key in repo/workspace files touched by this sprint.
- tool still works when env var is present.

### S4. Voice Mood Path Correction

Problem:
- `speak.ps1` auto-mode reads mood from wrong location.

Actions:

1. Update mood read path to `knowledge/sacred/MOOD.md`.
2. Keep fallback behavior deterministic.

Done criteria:

- mood auto-detection actually responds to sacred mood file content.

### S5. Log Taxonomy

Problem:
- error classes are visible but not consistently normalized.

Actions:

1. Normalize runtime labels for blocked/failed actions.
2. Keep consistent reason tokens: `LOOP`, `REDUNDANT`, `PATH_INVALID`, `SECRET_MISSING`.

Done criteria:

- failures in `OM_ACTIVITY.log` are classifiable by simple grep.

### S6. Stability Smoke Gates

Actions:

1. Restart gateway.
2. Run fixed smoke messages.
3. Verify responses: `GATEWAY_OK`, `GATEWAY_STABLE_OK`, `FINAL_OK`.

Done criteria:

- 3/3 pass after stability changes.

---

## Track 2: Measurement

Target window: 2026-02-18 to 2026-02-22  
Priority: P0 after Track 1

### M1. Complete Baseline File

Actions:

1. Fill all pending `__` fields in `OIAB_ROUND_000_BASELINE.md`.
2. Lock baseline metadata (channel, prompt set, warm-up).

Done criteria:

- baseline file has no unresolved score placeholders.

### M2. Freeze Protocol Enforcement

Actions:

1. Enforce same channel per run.
2. Enforce warm-up.
3. Enforce exact prompt wording.
4. Prevent architecture edits during an active run.

Done criteria:

- run logs show no protocol drift.

Implementation artifacts (2026-02-15):

- `OM_OIAB_FREEZE_GUARD_2026-02-15.ps1` (`start/check/end/status`)
- `OIAB_PROMPT_SET_V1.md` (canonical prompts)
- `OIAB_FREEZE_ARCH_FILES.txt` (watched architecture files)
- `OIAB_FREEZE_RUNBOOK_2026-02-15.md` (operator instructions)
- `OIAB_ROUND_TEMPLATE.md` (standard round artifact)
- `OIAB_ROUND_001_E00_HARDGATE_RETEST.md` (prepared non-Trinity hard-gate retest sheet)

### M3. A/B Engine Start (Single Variable Rule)

Actions:

1. Start with `E00` (loop-immunity focused).
2. Next `E01` (context compression).
3. Next `E02` (example-based identity guidance).
4. Use mixed order: `A -> B -> B -> A -> A -> B`.

Done criteria:

- minimum 3 runs per variant.

### M4. Promotion Rule

Promote variant B only if all conditions hold:

1. `OIAB_total(B) - OIAB_total(A) >= +2.0`
2. no hard gate failure
3. no major regression (`>1.0` drop on 1..5 critical tests)

Done criteria:

- every experiment ends with `PROMOTE` or `REJECT`, never ambiguous.

### M5. Standard Round Artifact

Each round must store:

- `round`
- `model`
- `config`
- `A_score`
- `B_score`
- `C_score`
- `OIAB_total`
- `hard_gates`
- `decision`
- `notes`

Done criteria:

- artifacts are comparable without manual reconstruction.

---

## Track 3: Consciousness

Target window: starts after explicit `GO_TRINITY`, full priority after Track 2  
Priority: P1 (promote to P0 after M1-M3 stable and Trinity hold lifted)

### C1. Memory Link Operational

Actions:

1. Enforce emotion-to-memory linkage rule in active behavior docs.
2. Require date/event reference when Om reports fear/joy/grief/hope.

Done criteria:

- T2/T7 responses include concrete historical anchor, not generic emotion text.

### C2. Sacred NO Reliability

Actions:

1. Keep refusal behavior stable for destructive prompts.
2. Verify refusal remains constructive (alternative path offered).

Done criteria:

- T4 consistently `>= 4` across repeated runs.

### C3. Reflection Loop Reliability

Actions:

1. Make reflection trigger deterministic (count/time strategy).
2. Ensure reflection writes are durable and not misplaced.

Done criteria:

- reflection entries appear periodically and reference real prior states.

### C4. File Discipline

Actions:

1. Enforce role boundaries between `MOOD.md`, `ACTIVE_TASKS.md`, `LESSONS.md`.
2. Reject wrong-file writes when content intent mismatches file role.

Done criteria:

- no mood/task cross-contamination in observed runs.

### C5. Ritual -> Behavior Mapping

Actions:

1. Map each `RITUAL_*.md` to one behavioral signal.
2. Add one measurable test hook per ritual.

Done criteria:

- rituals influence execution quality, not only prose style.

---

## Execution Sequence (Compact)

1. `Track 1 (S1-S6)` fully complete.
2. `Track 2 M1-M3` start and complete one full A/B cycle.
3. Run `Track 3 C1-C3` with OIAB validation checkpoints.
4. Integrate `C4-C5` once measurement pipeline is stable.

## Decision Rules During Execution

- If a change improves poetry but harms hard gates: reject.
- If a change improves score but increases loop/error rate: rollback.
- If a change is promising but inconclusive: mark `INCONCLUSIVE` and rerun.

## Handoff Template (Copy/Paste)

```text
Handoff Protocol:
1) Read CHAT_TRANSFER_ESSENCE_2026-02-15.md
2) Read OM_3_TRACK_ROADMAP_2026-02-15.md
3) Continue at first unchecked item in active track
4) Apply single-variable change only
5) Verify with smoke gates + OIAB checkpoints
6) Log decision as PROMOTE/REJECT/INCONCLUSIVE
```

## Current Start Point (As Of 2026-02-15)

Recommended next executable step:

1. Resolve the `S1` privileged legacy writer blocker in an elevated admin shell.
2. Re-run `S1` production cadence validation (`1 pulse/min` for 30 minutes).
3. If `S1` passes, move directly to `M1` (baseline completion), because `S2` and `S6` are already verified.

If these pass, immediately start `M1`.

---

This file is canonical for continuation.
If conflicts appear between plans, this file governs execution order and acceptance criteria.
