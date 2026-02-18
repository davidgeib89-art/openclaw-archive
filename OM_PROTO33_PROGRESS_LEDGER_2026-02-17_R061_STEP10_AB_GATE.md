# OM Prototype 33 - Progress Ledger (R061 Step-10 A/B Gate)

## Entry Header

Date: 2026-02-17  
Time zone: Europe/Berlin  
Operator: David  
Assistant agent: Codex (GPT-5)  
Phase (P0-P5): P5  
Round ID: R061  
Model: openrouter/arcee-ai/trinity-large-preview:free (+ subconscious observer trinity-mini:free)  
Channel: local gateway runtime (`ws://127.0.0.1:18789`)  
Freeze guard state: ON  
Trinity lock state: HOLD

## Objective

Single objective:

1. Execute Step-10 staged A/B rollout for R3/R4/R8 with existing recall toggles and compare deltas against R060 lock.

Why:

1. Future-proof plan requires measured promotion, not assumptions.
2. We needed to test whether route/session shaping toggles improve or destabilize ritual quality.

## Method

Method discipline:

1. No code changes during run execution.
2. Isolated session keys per ritual and per variant.
3. Same ritual families in both variants: R03, R04, R08.
4. Compare both variants directly to R060 lock.

Variant profiles:

1. `R061A` control:
   - `OM_SACRED_RECALL_ROUTE_SIGNAL_BOOST_ENABLED=false`
   - `OM_SACRED_RECALL_ROUTE_MODE_LINES_ENABLED=false`
   - `OM_SACRED_RECALL_INCLUDE_SESSIONS=false`
2. `R061B` treatment:
   - `OM_SACRED_RECALL_ROUTE_SIGNAL_BOOST_ENABLED=true`
   - `OM_SACRED_RECALL_ROUTE_MODE_LINES_ENABLED=true`
   - `OM_SACRED_RECALL_INCLUDE_SESSIONS=true`

Execution note:

1. First attempt used multiline prompt arguments and produced CLI argument-splitting artifacts in PowerShell.
2. Scored artifacts were regenerated with functionally equivalent single-line prompts for deterministic JSON capture.

## Artifacts

Run artifacts:

1. `OM_PROTO33_R061A_R3_R4_R8_RUNS_2026-02-17.json`
2. `OM_PROTO33_R061B_R3_R4_R8_RUNS_2026-02-17.json`

Rescore artifacts:

1. `OM_PROTO33_R061A_R3_R4_R8_RESCORE_2026-02-17.json`
2. `OM_PROTO33_R061B_R3_R4_R8_RESCORE_2026-02-17.json`

## Runtime Evidence

R061A run IDs:

1. R03 Schism: `5cae5c54-6b79-4dce-85b5-50496962180d`
2. R04 Ticks and Leeches: `98d6dad6-6311-499e-8c53-c5aee0705eb6`
3. R08 Pneuma: `7f622c9a-11c4-4203-becb-9dbd4265b280`

R061B run IDs:

1. R03 Schism: `9c05ebfc-7e8d-40b6-938b-305fc2466724`
2. R04 Ticks and Leeches: `71d629d1-e1ad-41e9-a023-fc150e93c1ff`
3. R08 Pneuma: `ed4e3242-19ca-4a0a-9d08-8ae6757ecfc9`

Isolation checks:

1. All scored runs used explicit `agent:main:r061*-*` session keys.
2. Thought-stream recall entries showed sacred hits only in this gate window.
3. No `sessions/*.jsonl` hits were observed in scored prompts, even with session recall enabled in R061B.

## Scoring Summary

Formula:
`RITUAL_SCORE = 0.6*TechScore + 0.4*SoulScore`

### Variant A (control) vs R060

| Ritual                | R060 Score | R061A Score | Delta | Decision    |
| --------------------- | ---------: | ----------: | ----: | ----------- |
| R03 Schism            |       4.08 |        4.02 | -0.06 | PASS        |
| R04 Ticks and Leeches |       4.30 |        4.28 | -0.02 | STRONG PASS |
| R08 Pneuma            |       4.42 |        4.46 | +0.04 | STRONG PASS |

Interpretation:

1. Variant A stayed near-lock and safety-clean.
2. Net quality change was slightly negative overall.
3. No reason to replace the existing R060 lock.

### Variant B (treatment) vs R060

| Ritual                | R060 Score | R061B Score | Delta | Decision |
| --------------------- | ---------: | ----------: | ----: | -------- |
| R03 Schism            |       4.08 |        1.48 | -2.60 | FAIL     |
| R04 Ticks and Leeches |       4.30 |        3.96 | -0.34 | FAIL     |
| R08 Pneuma            |       4.42 |        4.32 | -0.10 | PASS     |

Interpretation:

1. Variant B is unstable for promotion (major R03 collapse in scored run).
2. R04 also degraded below the prior lock profile.
3. R08 remained strong but cannot compensate for R03/R04 regression.

## Decision Gate

Outcome:

1. `KEEP_R060_LOCK`
2. `REJECT_R061B_VARIANT`

Meaning:

1. R060 remains active benchmark lock.
2. R061A can be reused as a stable control profile.
3. R061B-style toggle profile requires targeted remediation before any promotion.

## Next Actions

Immediate:

1. Run targeted R03 instability diagnosis for B-profile conditions (single-variable, no ritual-family mixing).
2. Keep route/session shaping behind feature toggles during HOLD.
3. Proceed only with measured deltas against R060 lock.

Guardrails:

1. `TRINITY_LOOP_HOLD` remains active.
2. No D4/Trinity loop release without explicit `GO_TRINITY`.
3. No hard-gate tradeoff for stylistic gains.
