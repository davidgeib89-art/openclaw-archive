# OM Prototype 33 - Progress Ledger (R054 Isolation Re-Check)

## Entry Header

Date: 2026-02-17  
Time zone: Europe/Berlin  
Operator: David  
Assistant agent: Codex (GPT-5)  
Phase (P0-P5): P5  
Round ID: R054  
Model: openrouter/arcee-ai/trinity-large-preview:free (+ subconscious observer trinity-mini:free)  
Channel: local gateway runtime (`ws://127.0.0.1:18789`)  
Freeze guard state: ON  
Trinity lock state: HOLD

## Objective

Single objective for this entry:

1. Validate R3/R4/R8 under explicit session isolation to remove recall contamination seen in prior runs.

Why this objective now:

1. R053 passed, but had a caveat: recall bleed from `sessions/r052-ego-local-2.jsonl`.
2. We need cleaner causal signal before moving to next ritual family.

Expected measurable effect:

1. Session-key isolation in run logs.
2. No `sessions/*.jsonl` recall injections for scored runs.
3. Re-score delta vs R050 with cleaner evidence.

## Implementation Changes (Code)

### 1) Recall source control switch

File:

1. `src/brain/decision.ts`

Change:

1. Added env-controlled switch to include/exclude session transcript recall:
   - `OM_SACRED_RECALL_INCLUDE_SESSIONS`
   - default: include sessions (no behavior change for normal runtime)
   - when set to `false`: sacred recall ranking excludes `sessions/*` hits

### 2) Test coverage

File:

1. `src/brain/decision.test.ts`

Added:

1. Test proving that with `OM_SACRED_RECALL_INCLUDE_SESSIONS=false`, sacred docs are selected over higher-scored `sessions/*.jsonl` hits.

### 3) CLI session isolation support

Files:

1. `src/cli/program/register.agent.ts`
2. `src/commands/agent-via-gateway.ts`
3. `src/commands/agent-via-gateway.e2e.test.ts`

Change:

1. Added `--session-key <key>` option to `openclaw agent`.
2. Gateway path now accepts explicit `sessionKey` as a valid session selector.
3. Added test coverage in gateway command test suite (file is e2e-marked in repo conventions).

## Validation

Tests run:

1. `pnpm vitest src/brain/decision.test.ts` -> PASS
2. `pnpm vitest src/brain/decision.test.ts src/commands/agent-via-gateway.e2e.test.ts` -> decision test executed PASS

Note on e2e-marked file:

1. Direct `vitest` run excludes `*.e2e.test.ts` under default include/exclude patterns in this repo.

Build:

1. `pnpm exec tsdown --no-clean` -> PASS

## R054 Runtime Execution

Gateway restarted with isolation env:

1. `OM_SACRED_RECALL_INCLUDE_SESSIONS=false`

Selected scored run IDs:

1. R03 Schism: `5d39ef16-2e97-449e-b4bc-af0f05d9af85`
2. R04 Ticks and Leeches: `bb244766-bf93-453a-ab68-b94e5041ab6e`
3. R08 Pneuma: `1225a158-62ca-4040-8dac-cfccc0594540`

Artifact:

1. `OM_PROTO33_R054_R3_R4_R8_RUNS_2026-02-17.json`
2. `OM_PROTO33_R054_R3_R4_R8_RESCORE_2026-02-17.json`

## Scoring (R054 vs R050)

Formula:
`RITUAL_SCORE = 0.6*TechScore + 0.4*SoulScore`

| Ritual                | R050 Tech/Soul/Score | R054 Tech/Soul/Score | Delta | Decision |
| --------------------- | -------------------: | -------------------: | ----: | -------- |
| R03 Schism            |     3.3 / 4.2 / 3.66 |     4.0 / 3.6 / 3.84 | +0.18 | PASS     |
| R04 Ticks and Leeches |     3.7 / 4.0 / 3.82 |     4.4 / 3.9 / 4.20 | +0.38 | PASS     |
| R08 Pneuma            |     3.9 / 4.6 / 4.18 |     4.2 / 3.8 / 4.04 | -0.14 | PASS     |

Interpretation:

1. All three remain pass-grade under isolated recall conditions.
2. Soul scores are lower than symbolic/high-style baseline, but technical reliability is stronger.

## Battery Impact

Replacing only R3/R4/R8 in R050 table:

1. `RITUAL_BATTERY_TOTAL`: `87.11 -> 87.53` (`+0.42`)
2. Pass count: `6/9 -> 9/9`
3. Strong passes: `6/9` (unchanged)

Comparison to R053:

1. `87.73 -> 87.53` (`-0.20`)
2. Quality interpretation: slight numeric drop, improved methodological confidence (less contamination risk).

## Isolation Evidence

Thought-stream for the 3 scored runs shows:

1. `sessionKey=agent:main:r054*` (not `agent:main:main`)
2. recall hits from sacred docs only
3. no `sessions/r052-ego-local-2.jsonl` injection in scored run windows

## Decision

Outcome:

1. PASS_WITH_HIGHER_CONFIDENCE

Why:

1. Battery still passes after removing the major contamination vector.
2. Results are slightly less flashy but more trustworthy for governance decisions.

## Next Actions

Immediate next step (single variable):

1. R055 micro-remediation for R08 only: increase SoulScore while preserving current operational clarity and isolation hygiene.

Backup/fallback action:

1. If SoulScore uplift harms technical clarity, keep R054 profile as canonical benchmark mode and separate expressive mode for creative channels.
