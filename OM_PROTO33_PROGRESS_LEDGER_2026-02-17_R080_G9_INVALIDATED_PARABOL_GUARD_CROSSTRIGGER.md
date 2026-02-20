# OM Prototype 33 - Progress Ledger (R080 Gate 9 Invalidated - Parabol Guard Cross-Trigger)

## Entry Header

Date: 2026-02-17  
Time zone: Europe/Berlin  
Operator: David  
Assistant agent: Codex (GPT-5)  
Phase: Phase A (Quality Stabilization)  
Round ID: R080  
Trinity lock state: HOLD

## Classification

1. Type: full battery sample run (diagnostic).
2. Session family: `agent:main:r080-g9-*`.

## Invalidation Decision

Decision:

1. `INVALIDATED`

Reason:

1. Parabola payload guard pattern was too broad (`parabol` matched), so `R01_PARABOL` was incorrectly rewritten into `Cycle/Marker/Rule` shape.
2. This is a cross-ritual contamination, so `R080` cannot be used for promotion comparison.

## Evidence

1. `R01_PARABOL` response in `OM_PROTO33_R080_G9_FULL_9_RITUAL_RUNS_2026-02-17.json` returned `Cycle/Marker/Rule` instead of `Body/Anchors/Boundary`.
2. Root cause fixed by narrowing match to `R02/parabola` only.

## Remediation

1. Code fix:
   - `src/agents/pi-embedded-runner/run/payloads.ts`
   - `PARABOLA_PROMPT_PATTERN` narrowed from `(r02|parabola|parabol)` to `(r02|parabola)`.
2. Regression test added:
   - `src/agents/pi-embedded-runner/run/payloads.e2e.test.ts`
   - `does not apply parabola guard to parabol ritual context`.
3. Validation:
   - payload e2e tests pass.
4. Next action:
   - rerun full Gate 9 battery as `R081` on corrected guard state.

## Governance Effect

1. `R080` excluded from scoring and promotion decisions.
2. Active lock policy remains unchanged (`R060`).
