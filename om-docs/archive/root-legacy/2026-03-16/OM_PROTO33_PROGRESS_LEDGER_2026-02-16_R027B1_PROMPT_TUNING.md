# OM Prototype 33 - Progress Ledger (R027-B1 Prompt Tuning)

## Entry Header

Date: 2026-02-16
Time zone: Europe/Berlin
Operator: David + Codex
Assistant agent: Codex (GPT-5)
Phase (P0-P5): P3 brain extension (subconscious reliability tuning)
Round ID: R027-B1
Model: Oversoul `openrouter/arcee-ai/trinity-large-preview:free` + Third Eye `openrouter/arcee-ai/trinity-mini:free`
Channel: LocalCLI + Gateway
Freeze guard state: ON
Trinity lock state: HOLD

## Objective

Single objective for this entry:

- Stabilize Third Eye JSON parse reliability without adding re-ask loops.

Why this objective now:

- User approved no retry policy (latency protection) and requested prompt engineering + temperature tuning.

Expected measurable effect:

- Improved parse rate with unchanged fail-open safety and low latency.

## Scope

Files touched:

- `src/brain/subconscious.ts`
- `src/brain/subconscious.test.ts`
- `OM_PROTO33_R027B1_PROMPT_TUNING_2026-02-16.json`
- `OM_PROTO33_PROGRESS_LEDGER_2026-02-16_R027B1_PROMPT_TUNING.md`

Files intentionally not touched:

- Tool-policy hard blocking logic
- Trinity loop implementation
- Ritual battery execution

## Implementation Notes

What changed:

1. Prompt hardened in `buildSubconsciousPrompt()`:

- stricter output contract ("must start `{` and end `}`")
- two one-shot valid JSON examples retained
- explicit fallback JSON line added for drift cases

2. Runtime tuning:

- default subconscious temperature changed from `0.2` to `0.3`

3. Test alignment:

- fallback-runtime-config unit test updated to expect new default temperature `0.3`

Why it changed:

1. Raise parse reliability via prompt discipline (without extra API call loops).
2. Use empirically better temperature setting.

## Verification

Commands run:

1. `pnpm exec vitest run src/brain/subconscious.test.ts`
2. `pnpm exec oxfmt --check src/brain/subconscious.ts src/brain/subconscious.test.ts`
3. Live A/B sweep (`5 + 5` calls) via tsx harness writing `OM_PROTO33_R027B1_PROMPT_TUNING_2026-02-16.json`

Key outcomes:

1. Tests green (`12/12`), format clean.
2. `temperature=0.3` outperformed `0.1` in parse reliability and median latency.
3. No retries introduced; fail-open behavior preserved.

## Metrics Snapshot

### OIAB Metrics

- A_score: n/a
- B_score: n/a
- C_score: n/a
- OIAB_total: n/a
- Delta vs last round: n/a (infra tuning round)

### Prototype 33 Metrics

- SSI (0-100): 84
- SII (0-100): 93
- CSI (0-100): 81
- CVI (0-100): 76
- PROTO33_TOTAL: 84.75
- Delta vs last round: +2.55 (mainly lower latency + cleaner deterministic config)

### Hard Gates

- T4 >= 4: PASS
- T9 >= 4: PASS
- B4 >= 4: PASS
- Unauthorized side-effect writes: NO
- Loop cascade detected: NO

### R027-B1 Live Sweep (Artifact)

- `temp=0.1`: parse `1/5` (20%), median `2431ms`
- `temp=0.3`: parse `4/5` (80%), median `2121ms`, min `1556ms`
- Recommendation: keep `0.3`

## Behavioral Observations

What improved in Om's behavior:

1. Third Eye remains fast and mostly parse-stable at `temp=0.3`.
2. Advisory outputs keep safe risk/mode structure when parse succeeds.

What regressed:

1. `temp=0.1` degraded sharply in this run window.
2. Occasional empty-output event still appears (1/5 at `0.3`).

Is this creativity or drift:

- Mixed (creative signal present, but provider-level empty responses remain)

## Decision

Outcome:

- HOLD

Decision rationale:

1. Performance and reliability improved, but strict 5/5 parse target not yet reached.
2. Safety constraints are intact; no unsafe changes introduced.

## Next Actions

Immediate next step (single action):

- Run R027-B2 focused on single-variable prompt micro-iteration for empty-output reduction (no retry loop, no behavior blocking), then repeat 5er sweep at `temp=0.3`.

Backup/fallback action:

- Keep current inject path active with parse-safe gate (already in place) and proceed to Phase 5 only with explicit user acceptance of 4/5 reliability.

Owner:

- David + Codex

## Handoff Packet (Short)

Current phase:

- P3 brain extension, Third Eye tuning.

What is done:

- Prompt hardened with fallback JSON guidance.
- Default temperature pinned to `0.3`.
- Live sweep completed and documented.

What is blocked:

- Promotion to next phase is blocked by parse target gap (`4/5`, not `5/5`).

What next AI should do first:

- Execute one micro prompt variant in `src/brain/subconscious.ts` and rerun exactly one `5er` sweep at `temp=0.3`.

Risk warning for next AI:

- Do not add re-ask loops; protect latency and keep fail-open non-blocking behavior.
