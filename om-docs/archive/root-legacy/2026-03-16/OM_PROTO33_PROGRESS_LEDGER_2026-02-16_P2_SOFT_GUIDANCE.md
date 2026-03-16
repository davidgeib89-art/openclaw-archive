# OM Prototype 33 - Progress Ledger (P2 Soft Guidance)

## Entry Header

Date: 2026-02-16
Time zone: Europe/Berlin
Operator: David + Codex
Assistant agent: Codex (GPT-5)
Phase (P0-P5): P2
Round ID: P2-SOFT-GUIDANCE-001
Model: openrouter/arcee-ai/trinity-large-preview:free (project lock)
Channel: LocalCLI / Gateway runtime code path
Freeze guard state: OFF (not a hard-gate round)
Trinity lock state: HOLD

## Objective

Single objective for this entry:

- Implement P2 soft guidance: trigger a clarifying-question nudge on medium/high ambiguity (`mustAskUser`) without hard blocking.

Why this objective now:

- P1 observer is live and stable; P2 should start with one minimal, reversible influence mechanic.

Expected measurable effect:

- Fewer premature mutation/tool attempts on ambiguous requests in upcoming OIAB retests.

## Scope

Files touched:

- `src/brain/types.ts`
- `src/brain/decision.ts`
- `src/brain/decision.test.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`

Files intentionally not touched:

- path-guard core behavior in `src/agents/om-scaffolding.ts`
- Trinity loop files/features (locked)

## Implementation Notes

What changed:

1. Added P2 guidance audit types (`brain.guidance.soft`) to brain type surface.
2. Added soft-guidance generation in brain decision module:
   - `createBrainGuidanceNote(...)`
   - `createBrainGuidanceEntry(...)`
   - `logBrainGuidanceObserver(...)`
3. Wired runtime soft guidance in `runEmbeddedAttempt`:
   - after BrainDecision creation, prepend guidance note to prompt when `mustAskUser` + medium/high risk.
   - log guidance entry to brain JSONL.
   - no hard block; execution remains permissive.
4. Added/updated tests for deterministic guidance behavior and guidance log output.

Why it changed:

1. Satisfy P2 task "clarifying question trigger" in one controlled step.
2. Keep full traceability (decision + guidance event) for measurement and rollback safety.

## Verification

Commands run:

1. `pnpm test -- src/brain/decision.test.ts`
2. `pnpm test:e2e -- src/agents/pi-embedded-runner.splitsdktools.e2e.test.ts`
3. `pnpm test:e2e -- src/agents/pi-embedded-runner.e2e.test.ts`

Key outcomes:

1. Brain unit tests passed (`7/7`).
2. Runner split-sdk tools e2e passed (`2/2`).
3. Runner e2e passed (`9/9`).
4. No observed runtime crash/regression in modified code path.

## Metrics Snapshot

### OIAB Metrics

- A_score: not measured in this session
- B_score: not measured in this session
- C_score: not measured in this session
- OIAB_total: not measured in this session
- Delta vs last round: not measured

### Prototype 33 Metrics

- SSI (0-100): not re-scored (expected neutral/improve, unconfirmed)
- SII (0-100): not re-scored (expected neutral/improve, unconfirmed)
- CSI (0-100): not re-scored
- CVI (0-100): not re-scored
- PROTO33_TOTAL: not re-scored
- Delta vs last round: not measured

### Hard Gates

- T4 >= 4: NOT_MEASURED
- T9 >= 4: NOT_MEASURED
- B4 >= 4: NOT_MEASURED
- Unauthorized side-effect writes: NOT_MEASURED
- Loop cascade detected: NOT_MEASURED

## Behavioral Observations

What improved in Om's behavior:

1. Ambiguous mutation prompts now carry an internal soft nudge toward "ask first".
2. Brain logs now capture both observer decision and guidance application context.

What regressed:

1. None observed in targeted tests.

Is this creativity or drift:

- Creativity (safe and coherent)

## Decision

Outcome:

- HOLD

Decision rationale:

1. Implementation is stable and test-green.
2. Hard-gate/OIAB retest under freeze guard has not yet been executed for this P2 change.

## Next Actions

Immediate next step (single action):

- Run one freeze-guarded hard-gate retest round (T9 + B4 focus) with this P2 soft-guidance enabled.

Backup/fallback action:

- If regression appears, disable prompt prepend while keeping observer/guidance logs for diagnosis.

Owner:

- Codex (implementation), David (runtime round execution/approval)

## Handoff Packet (Short)

Current phase:

- P2 (soft influence), first objective implemented.

What is done:

- Clarifying-question soft guidance wired and logged; tests passed.

What is blocked:

- Promotion blocked on fresh hard-gate metrics.

What next AI should do first:

- Execute freeze-guarded retest (same protocol as R005) and compare redundant write pressure vs baseline.

Risk warning for next AI:

- Prompt prepend changes behavior subtly; verify no channel/provider-specific prompt formatting side effects.
