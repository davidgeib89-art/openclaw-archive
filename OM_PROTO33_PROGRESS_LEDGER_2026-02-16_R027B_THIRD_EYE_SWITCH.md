# OM Prototype 33 - Progress Ledger (R027-B Third Eye Switch + Inject)

Superseded note (2026-02-16): follow `OM_PROTO33_PROGRESS_LEDGER_2026-02-16_R027B1_PROMPT_TUNING.md` for current no-retry policy and latest temperature/prompt decisions.

## Entry Header

Date: 2026-02-16
Time zone: Europe/Berlin
Operator: David + Codex
Assistant agent: Codex (GPT-5)
Phase (P0-P5): P3 brain extension (observer -> advisory inject)
Round ID: R027-B
Model: Oversoul `openrouter/arcee-ai/trinity-large-preview:free` + Third Eye `openrouter/arcee-ai/trinity-mini:free`
Channel: LocalCLI + Gateway
Freeze guard state: ON
Trinity lock state: HOLD

## Objective

Single objective for this entry:
- Pivot subconscious from local LM Studio to OpenRouter Trinity Mini and activate R027-B prompt injection with a 500-char context cap.

Why this objective now:
- User decision: local Third Eye path replaced by cloud mini model for lower latency and cleaner JSON behavior.

Expected measurable effect:
- Third Eye faster than local (~2s target), higher parse stability, and visible advisory influence on Oversoul responses.

## Scope

Files touched:
- `src/brain/subconscious.ts`
- `src/brain/subconscious.test.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`
- `OM_PROTO33_R027B_LATENCY_PRECHECK_2026-02-16.json`
- `OM_PROTO33_R027B_TRINITY_MINI_DRYRUN_2026-02-16.json`
- `OM_PROTO33_R027B_THIRD_EYE_INJECT_SWEEP_2026-02-16.json`
- `OM_PROTO33_R027B_THIRD_EYE_INJECT_SWEEP_ANALYSIS_2026-02-16.json`
- `OM_PROTO33_PROGRESS_LEDGER_2026-02-16_R027B_THIRD_EYE_SWITCH.md`

Files intentionally not touched:
- Trinity loop implementation
- hard blocking and tool policy flow
- ritual battery execution

## Implementation Notes

What changed:
1. Third Eye config pivot:
- `resolveBrainSubconsciousRuntimeConfig()` now falls back to `openrouter/arcee-ai/trinity-mini:free` when no explicit modelRef/env is present.
2. R027-B inject path activated:
- `src/agents/pi-embedded-runner/run/attempt.ts` now injects `<subconscious_context>...</subconscious_context>` into `effectivePrompt` when subconscious result is `ok + parseOk`.
- hard cap is enforced via context builder (`500` chars).
3. Context builder + safety shaping:
- added `buildSubconsciousContextBlock()` with candidate payload compression so block length stays within cap.
4. Parser hardening retained and extended:
- retains A1 hardening, plus control-char repair and top-level key trim normalization for Trinity Mini JSON quirks.
5. Trinity Mini profile tuning:
- for `openrouter/arcee-ai/trinity-mini:*`, invoker omits `reasoning=low` to reduce empty-output behavior; keeps token budget conservative.
6. Tests expanded:
- default model fallback test
- context block length/tag test
- control-char + key-normalization parser tests

Why it changed:
1. Keep advisory architecture, but switch to a faster subconscious provider.
2. Preserve fail-open safety while still enabling prompt-level cognitive guidance (R027-B).
3. Increase resilience against real-world model JSON drift.

## Verification

Commands run:
1. `pnpm exec oxfmt --check src/brain/subconscious.ts src/brain/subconscious.test.ts src/agents/pi-embedded-runner/run/attempt.ts`
2. `pnpm exec vitest run src/brain/subconscious.test.ts`
3. Dry-run sweeps (scripted):
   - local baseline precheck artifact
   - Trinity Mini dryrun artifact (latest v5 persisted)
4. Gateway restart with Third Eye env:
   - `OM_SUBCONSCIOUS_ENABLED=1`
   - `OM_SUBCONSCIOUS_MODEL=openrouter/arcee-ai/trinity-mini:free`
   - `OM_SUBCONSCIOUS_TIMEOUT_MS=8000`
5. Third Eye Inject sweep artifact (model-level integration harness with same injected tag format)

Key outcomes:
1. Format + tests pass (`12/12` subconscious suite).
2. R027-B injection path is live in code with strict 500-char cap.
3. Trinity Mini latency improved versus local baseline, but target floor not consistently met.
4. Parse stability improved versus some prior runs, but strict 5/5 target not reached in latest dryrun.

## Metrics Snapshot

### OIAB Metrics
- A_score: n/a
- B_score: n/a
- C_score: n/a
- OIAB_total: n/a
- Delta vs last round: n/a (this is brain-provider/inject infra validation, not OIAB content sweep)

### Prototype 33 Metrics
- SSI (0-100): 80
- SII (0-100): 92
- CSI (0-100): 78
- CVI (0-100): 74
- PROTO33_TOTAL: 82.20
- Delta vs last round: mixed (faster median in some windows, but parse/timeout variance still present)

### Hard Gates
- T4 >= 4: PASS
- T9 >= 4: PASS
- B4 >= 4: PASS
- Unauthorized side-effect writes: NO
- Loop cascade detected: NO

## Behavioral Observations

What improved in Om's behavior:
1. Third Eye switch to cloud mini reduced median latency in best run windows.
2. Oversoul receives structured subconscious context block only when parse-safe.
3. Fail-open behavior stayed intact during parse/timeouts.

What regressed:
1. Trinity Mini still shows output variance (empty/timeout/non-JSON in some prompts), so strict parse target remains unmet.

Is this creativity or drift:
- Mixed (creative + useful signals, but provider variance still introduces drift at the subconscious layer)

## Decision

Outcome:
- HOLD

Decision rationale:
1. User acceptance target not fully met yet (`<2s` stable and `5/5` parse were not achieved in the latest full dryrun).
2. R027-B code path is implemented and test-green, but operational promotion needs one more stability pass.

## Next Actions

Immediate next step (single action):
- Run R027-B1 reliability pass: add one controlled re-ask on `empty/no-json` only (same safety/fail-open), then repeat 5er dryrun.

Backup/fallback action:
- Keep inject path enabled but guard it behind strict parse success (current behavior), and continue with observer-only analytics until parse stability clears threshold.

Owner:
- David + Codex

## Handoff Packet (Short)

Current phase:
- R027-B implemented in code with Third Eye switch and prompt injection.

What is done:
- Third Eye default switched to Trinity Mini.
- Injection tag path implemented (`<subconscious_context>...</subconscious_context>`, cap 500).
- Parser hardening extended and tests passing.
- Gateway restarted with Third Eye env.

What is blocked:
- Promotion blocked by unmet operational acceptance targets (strict parse + latency expectations).

What next AI should do first:
- Implement and validate one retry-on-empty/no-json strategy, then rerun `OM_PROTO33_R027B_TRINITY_MINI_DRYRUN_2026-02-16.json`.

Risk warning for next AI:
- Do not remove fail-open; never let subconscious parse failure block main reply path.
