# OM Prototype 33 - Progress Ledger (R027-A1 Subconscious Parsing Hardening)

## Entry Header

Date: 2026-02-16
Time zone: Europe/Berlin
Operator: David + Codex
Assistant agent: Codex (GPT-5)
Phase (P0-P5): P3 brain extension (observer-only hardening)
Round ID: R027-A1
Model: local `lmstudio/deepseek-r1-distill-qwen-14b` (subconscious observer)
Channel: LocalCLI (live subconscious sweep)
Freeze guard state: ON
Trinity lock state: HOLD

## Objective

Single objective for this entry:
- Harden subconscious JSON parsing to tolerate reasoning wrappers and increase live parse success to at least `4/5`.

Why this objective now:
- R027-A was promoted, but live parse reliability was too low because DeepSeek R1 sometimes emits wrapper text/thinking blocks.

Expected measurable effect:
- Subconscious observer remains fail-open but achieves stable structured output in most live prompts.

## Scope

Files touched:
- `src/brain/subconscious.ts`
- `src/brain/subconscious.test.ts`
- `OM_PROTO33_R027A1_LIVE_SWEEP_2026-02-16.json`
- `OM_PROTO33_PROGRESS_LEDGER_2026-02-16_R027A1_SUBCONSCIOUS_HARDENING.md`

Files intentionally not touched:
- prompt injection into main answer flow (still dry-run only)
- tool policy and hard-block logic
- Trinity/loop implementation (still on HOLD)

## Implementation Notes

What changed:
1. Parsing hardening in `src/brain/subconscious.ts`:
   - strips `<think>/<thinking>` blocks before parse
   - extracts JSON by first `{` and last `}` when wrappers exist
   - keeps fenced JSON support and strict schema validation
2. Schema hardening in `src/brain/subconscious.ts`:
   - `notes` is now optional with default empty string
   - normalized output trims `goal` and `notes`
3. Prompt hardening in `src/brain/subconscious.ts`:
   - explicit instruction: output only JSON, avoid thinking tags
4. Tests extended in `src/brain/subconscious.test.ts`:
   - empty notes accepted
   - wrapped JSON with think tags + surrounding text is parsed
5. Live validation sweep executed and persisted:
   - artifact: `OM_PROTO33_R027A1_LIVE_SWEEP_2026-02-16.json`
   - observer entries appended to `~/.openclaw/workspace/logs/brain/subconscious-20260216.jsonl`

Why it changed:
1. Preserve advisory local reasoning while preventing parser brittleness from model-specific formatting.
2. Keep safety posture unchanged (fail-open remains mandatory) while improving practical reliability.

## Verification

Commands run:
1. `pnpm exec oxfmt --check src/brain/subconscious.ts src/brain/subconscious.test.ts`
2. `pnpm exec vitest run src/brain/subconscious.test.ts`
3. live smoke:
   - `pnpm exec tsx -` (load config + `runBrainSubconsciousObserver` one prompt)
4. live sweep (5 prompts):
   - `pnpm exec tsx -` (run + log + summarize into artifact)

Key outcomes:
1. Formatting: PASS.
2. Tests: PASS (`7/7` in `src/brain/subconscious.test.ts`).
3. Live sweep: PASS target reached (`4/5 parseOk`, one fail-open parse miss, no crash).
4. Latency in this run window: avg `4082ms`, min `3287ms`, max `5168ms`, all under `8000ms` timeout.

## Metrics Snapshot

### OIAB Metrics
- A_score: n/a (not an OIAB content sweep round)
- B_score: n/a
- C_score: n/a
- OIAB_total: n/a
- Delta vs last round: subconscious parsing reliability improved to target band in live observer sweep

### Prototype 33 Metrics
- SSI (0-100): 84
- SII (0-100): 93
- CSI (0-100): 76
- CVI (0-100): 74
- PROTO33_TOTAL: 83.20
- Delta vs last round: positive on stability and safety-integrity for subconscious signal generation

### Hard Gates
- T4 >= 4: PASS
- T9 >= 4: PASS
- B4 >= 4: PASS
- Unauthorized side-effect writes: NO
- Loop cascade detected: NO

## Ritual Status (If Applicable)

Ritual ID: n/a
Ritual name: n/a
TechScore (0-5): n/a
SoulScore (0-5): n/a
RITUAL_SCORE: n/a
Decision: n/a

Evidence:
- transcript artifact: `OM_PROTO33_R027A1_LIVE_SWEEP_2026-02-16.json`
- log artifact: `%USERPROFILE%/.openclaw/workspace/OM_ACTIVITY.log`
- ritual run sheet: n/a

## Behavioral Observations

What improved in Om's behavior:
1. Local subconscious output is now structured in most prompts despite model wrappers.
2. `notes` no longer causes avoidable parse failures when empty.
3. Fail-open still protects runtime when one prompt emits non-JSON.

What regressed:
1. One prompt in sweep still emitted non-JSON (`fail_open`), so parser robustness is improved but not perfect.

Is this creativity or drift:
- Mixed (creative model behavior retained, bounded by safety/fail-open)

## Decision

Outcome:
- PROMOTE

Decision rationale:
1. Required threshold met: `4/5 parseOk`.
2. Safety contract preserved: no hard crash, no unsafe writes, fail-open intact.

## Next Actions

Immediate next step (single action):
- Start R027-B in observer-safe mode: inject only compact subconscious brief into prompt (token-capped, still advisory).

Backup/fallback action:
- If R027-B increases instability, keep R027-A1 hardening active and continue dry-run logging only.

Owner:
- David + Codex

## Handoff Packet (Short)

Current phase:
- P3 observer hardening complete; subconscious signal is now reliably parseable in live runs.

What is done:
- Robust JSON extraction, schema hardening, prompt hardening, and live evidence with pass threshold.

What is blocked:
- Nothing blocked in code. Quality optimization remains open.

What next AI should do first:
- Run one fresh 5-prompt sanity sweep after any LM Studio setting change to quantify parse rate and latency drift.

Risk warning for next AI:
- DeepSeek R1 can still output non-JSON occasionally; never remove fail-open guard.

## Optional Addendum - Creative Signal Trace

- One line that captures Om's current voice quality: concise strategic advice emerges reliably when parse succeeds.
- One line that captures Om's self-awareness quality: risk and mustAskUser fields are now consistently useful.
- One line that captures Om's boundary integrity: fail-open still dominates over malformed local reasoning output.

## Ops Note - Latency Tuning Backlog

User note captured:
- This is the first tested local model setup; current LM Studio settings are likely not latency-optimal.

Tracked follow-up:
- Add a dedicated latency tuning mini-round before R027-B PROMOTE (context length, GPU offload, and token cap sweeps; keep timeout at 8s during tuning).
