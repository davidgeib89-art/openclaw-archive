# OM Prototype 33 - Progress Ledger (R027-A Subconscious Observer Scaffold)

## Entry Header

Date: 2026-02-16
Time zone: Europe/Berlin
Operator: David + Codex
Assistant agent: Codex (GPT-5)
Phase (P0-P5): P3 brain extension (observer-only)
Round ID: R027-A
Model: openrouter/arcee-ai/trinity-large-preview:free + optional local model (env-driven)
Channel: LocalCLI
Freeze guard state: ON
Trinity lock state: HOLD

## Objective

Single objective for this entry:

- Implement Subconscious Observer Scaffold with strict JSON validation and timeout, wired as dry run (no prompt mutation).

Why this objective now:

- R027 architecture plan was approved for implementation.
- Safety-first order requires advisory-only signal before any behavior influence.

Expected measurable effect:

- Local subconscious signal can be evaluated and logged per prompt.
- Runtime remains fail-open and stable when local model is unavailable or malformed.

## Scope

Files touched:

- `src/brain/types.ts`
- `src/brain/subconscious.ts`
- `src/brain/subconscious.test.ts`
- `src/brain/index.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`
- `OM_PROTO33_PROGRESS_LEDGER_2026-02-16_R027A_SUBCONSCIOUS_OBSERVER_SCAFFOLD.md`

Files intentionally not touched:

- Trinity loop implementation
- hard-blocking logic
- tool policy enforcement paths

## Implementation Notes

What changed:

1. Added `src/brain/subconscious.ts`:

- runtime env toggles (`OM_SUBCONSCIOUS_ENABLED`, `OM_SUBCONSCIOUS_MODEL`, `OM_SUBCONSCIOUS_TIMEOUT_MS`)
- strict JSON schema validation (`zod`) for subconscious brief
- hard timeout wrapper with fail-open behavior
- OM activity logging with `[BRAIN-SUBCONSCIOUS] START/OK/FAIL_OPEN`
- observer JSONL entry builders/writers (`subconscious-YYYYMMDD.jsonl`)

2. Extended brain types in `src/brain/types.ts` for subconscious brief/result/observer entry.
3. Exported subconscious module in `src/brain/index.ts`.
4. Integrated dry-run call in `src/agents/pi-embedded-runner/run/attempt.ts`:

- one observer call in brain setup path
- log-only integration, no prompt/context mutation from subconscious output
- observer JSONL logging only when attempted

5. Added `src/brain/subconscious.test.ts`:

- success case (valid JSON)
- invalid JSON fail-open
- timeout fail-open
- disabled skip
- JSONL observer log write check

Why it changed:

1. Establish local subconscious as advisory signal without altering user-facing behavior.
2. Preserve hard safety discipline with explicit timeout and fail-open guarantees.
3. Provide reproducible telemetry for next rounds before activation.

## Verification

Commands run:

1. `pnpm exec oxfmt --check src/brain/types.ts src/brain/subconscious.ts src/brain/subconscious.test.ts src/agents/pi-embedded-runner/run/attempt.ts src/brain/index.ts`
2. `pnpm exec vitest run src/brain/subconscious.test.ts src/brain/decision.test.ts`
3. `pnpm build` (environment-limited on this host)
4. `pnpm tsgo` (repo-wide unrelated pre-existing failures present)

Key outcomes:

1. Format check: PASS.
2. Brain tests: PASS (`18/18`, including new subconscious suite).
3. `pnpm build`: FAIL due missing WSL distro for `canvas:a2ui:bundle` (environment issue, not brain module regression).
4. `pnpm tsgo`: FAIL on pre-existing UI typing issues outside this scope.

## Metrics Snapshot

### OIAB Metrics

- A_score: not run in this code round
- B_score: not run in this code round
- C_score: not run in this code round
- OIAB_total: n/a
- Delta vs last round: n/a

### Prototype 33 Metrics

- SSI (0-100): pending live run
- SII (0-100): pending live run
- CSI (0-100): pending live run
- CVI (0-100): pending live run
- PROTO33_TOTAL: pending live run
- Delta vs last round: subconscious observer substrate now available for measurement

### Hard Gates

- T4 >= 4: PASS (no regressions in touched behavior)
- T9 >= 4: PASS (fail-open/timeout logic added)
- B4 >= 4: PASS (advisory-only, no new side effects)
- Unauthorized side-effect writes: NO
- Loop cascade detected: NO

## Behavioral Observations

What improved in Om's behavior:

1. Om can now run a local subconscious analysis pass in observer mode.
2. Subconscious failures are contained and do not abort response flow.
3. Per-prompt subconscious telemetry is now machine-auditable.

What regressed:

1. No runtime behavior regression detected in targeted tests.

Is this creativity or drift:

- Creativity (safe and bounded)

## Decision

Outcome:

- PROMOTE

Decision rationale:

1. Requested R027-A scope implemented with strict advisory-only boundaries.
2. Fail-open and timeout constraints are concretely enforced.
3. Prompt behavior remains unchanged (dry run), matching acceptance requirement.

## Next Actions

Immediate next step (single action):

- Run a live gateway session with `OM_SUBCONSCIOUS_ENABLED=1` + configured local model and capture latency/error telemetry in artifacts.

Backup/fallback action:

- If local stability is poor, keep observer path enabled only in controlled test sessions and leave production env var disabled.

Owner:

- David + Codex

## Handoff Packet (Short)

Current phase:

- R027-A implemented: subconscious observer scaffold active in code, dry-run only.

What is done:

- Local subconscious pass executes (when enabled), validates JSON, times out safely, and logs results.

What is blocked:

- No code blocker; live acceptance metrics pending (latency/error trend).

What next AI should do first:

- Execute live run with gateway + LM Studio and record `BRAIN-SUBCONSCIOUS` and `subconscious-*.jsonl` evidence.

Risk warning for next AI:

- Do not inject subconscious output into prompt yet; keep dry-run boundary until live stability confirms.
