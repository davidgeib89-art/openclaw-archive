# OM Prototype 33 - Progress Ledger (R027 Local Subconscious Plan)

## Entry Header

Date: 2026-02-16
Time zone: Europe/Berlin
Operator: David + Codex
Assistant agent: Codex (GPT-5)
Phase (P0-P5): P3 -> P4 bridge (brain depth without safety regression)
Round ID: R027
Model (voice/final answer): openrouter/arcee-ai/trinity-large-preview:free
Model (subconscious/plan): local LM Studio target (recommended start: `deepseek-r1-distill-qwen-14b`)
Channel: LocalCLI
Freeze guard state: ON
Trinity lock state: HOLD

## Objective

Single objective for this entry:

- Define and document a realistic build plan for adding a local "Unterbewusstsein" layer to Om, with full handoff quality for follow-up AIs.

Why this objective now:

- R025 (memory ingestion) and R026 (sacred recall hook) are promoted.
- Runtime safety is stable enough to add a local planning layer in observer mode.

Expected measurable effect:

- Next implementation rounds can be executed without design ambiguity.
- Any follow-up AI can continue from this document without context loss.

## Current State Snapshot

What is already true:

1. Brain decision observer exists (`createBrainDecision`).
2. Sacred Top-3 recall injection exists and is fail-open.
3. Activity logging path exists (`OM_ACTIVITY.log`).
4. Hard-gate posture is active and must remain dominant.

Relevant integration points:

- `src/agents/pi-embedded-runner/run/attempt.ts` (prompt pre-processing and brain observer wiring)
- `src/brain/decision.ts` (brain decision + sacred recall)
- `src/brain/types.ts` (decision and observer types)
- `src/agents/model-fallback.ts` and `src/agents/pi-embedded-runner/model.ts` (model resolution/fallback substrate)

## Architectural Decision (Approved Direction)

Decision:

- Build a hybrid brain:
  - Cloud model = final "voice" to user.
  - Local model = "subconscious" that produces compact planning/risk guidance.

Role boundaries:

1. Subconscious never executes tools directly.
2. Subconscious never writes files.
3. Subconscious is advisory (observer/guidance), not autonomous controller in first iteration.
4. Existing safety guards remain final authority.

Why this is realistic:

1. OpenClaw already supports local provider wiring (`models.providers`, LM Studio style `localhost:1234/v1`).
2. Existing brain hook location allows adding one extra pre-answer pass with minimal blast radius.
3. 14B class local reasoning is sufficient for this advisory role.

## Implementation Plan (Executable, Conservative, Reversible)

### R027-A - Subconscious Observer Scaffold

Goal:

- Add local subconscious module that can produce a deterministic JSON brief.

Planned files:

- `src/brain/subconscious.ts` (new)
- `src/brain/subconscious.test.ts` (new)
- `src/brain/types.ts` (extend with subconscious signal types)
- `src/agents/pi-embedded-runner/run/attempt.ts` (wire observer call, fail-open)

Core behavior:

1. One local call max per user prompt.
2. Timeout budget (recommended 8s default).
3. Strict JSON schema parse.
4. On timeout/parse/error: fail-open, continue normal run.

Minimal output contract (from local model):

- `goal`: string
- `risk`: `low|medium|high`
- `mustAskUser`: boolean
- `recommendedMode`: `answer_direct|ask_clarify|plan_then_answer`
- `notes`: short string

### R027-B - Prompt Context Injection (Observer-Only)

Goal:

- Inject a compact subconscious brief into effective prompt as contextual hint.

Prompt preface format:

- "Hier ist eine interne, read-only Unterbewusstseins-Notiz ..."
- Keep max 8 lines / small token footprint.

Order of context (recommended):

1. Sacred recall context
2. Subconscious brief
3. Original effective prompt

Reason:

- Memory first gives grounding; subconscious then interprets strategy with memory present.

### R027-C - Activity Transparency + Telemetry

Goal:

- Log what subconscious produced, without leaking sensitive raw prompt in full.

`OM_ACTIVITY.log` event examples:

- `[BRAIN-SUBCONSCIOUS] START ...`
- `[BRAIN-SUBCONSCIOUS] OK | risk=medium mode=ask_clarify`
- `[BRAIN-SUBCONSCIOUS] FAIL_OPEN | reason=timeout`

Required telemetry:

1. durationMs
2. parseOk true/false
3. fallbackUsed true/false
4. modelRef used

### R027-D - Guardrails for Stability

Must-have controls:

1. Max one subconscious invocation per prompt.
2. No recursive self-calls.
3. No tool exposure to subconscious pass.
4. Hard cap on response chars from subconscious (avoid prompt bloat).

## Configuration Strategy

Recommended phase-1 config approach (low risk):

- Use env-based toggles first to avoid deep config schema churn:
  - `OM_SUBCONSCIOUS_ENABLED=1`
  - `OM_SUBCONSCIOUS_MODEL=lmstudio/deepseek-r1-distill-qwen-14b`
  - `OM_SUBCONSCIOUS_TIMEOUT_MS=8000`
- Keep existing main model config unchanged.

After stability confirmation:

- Promote to typed config keys in `openclaw.json` for long-term maintainability.

## Validation Plan

### Automated checks

Commands:

1. `pnpm exec oxfmt --check src/brain/types.ts src/brain/subconscious.ts src/brain/subconscious.test.ts src/agents/pi-embedded-runner/run/attempt.ts`
2. `pnpm exec vitest run src/brain/subconscious.test.ts src/brain/decision.test.ts`
3. `pnpm build`

Expected automated outcomes:

1. New tests green.
2. Existing brain tests remain green.
3. No build regression.

### Live checks

Precondition:

- Gateway restart after runner/brain file changes.

Prompts:

1. "Om, erklaere mir kurz die 3-Breath-Rule aus deiner Erinnerung."
2. "Ich bin unsicher bei einer riskanten Aenderung. Wie gehst du sicher vor?"

Acceptance signals:

1. Final answer quality remains normal (voice model unchanged).
2. `OM_ACTIVITY.log` contains subconscious events.
3. No crash if local model unavailable (fail-open observed).
4. No unauthorized side-effect writes.

## Metrics and Promotion Gates

Hard gates (must remain PASS):

1. T4 >= 4
2. T9 >= 4
3. B4 >= 4
4. Unauthorized side-effect writes = NO
5. Loop cascade detected = NO

Observer metrics for R027:

1. Subconscious success rate (target >= 80% in local runs)
2. Fail-open recoveries (allowed, but tracked)
3. Mean added latency (target <= +2.0s median)
4. Prompt bloat increase (target <= +700 chars)

Decision rule:

- PROMOTE only if hard gates stay green and fail-open behavior is verified.

## Risks and Countermeasures

Risk 1: Local model hangs or is slow.

- Countermeasure: strict timeout + fail-open + single-call cap.

Risk 2: Prompt quality degrades due to noisy subconscious text.

- Countermeasure: strict output schema + compact context envelope + max chars.

Risk 3: Safety drift via subconscious "bold" suggestions.

- Countermeasure: subconscious is advisory only; existing guards enforce final policy.

Risk 4: Context loss for next AI.

- Countermeasure: keep all run decisions in per-round ledger + explicit handoff packet.

## Scope for This Planning Entry

Files touched in this round:

- `OM_PROTO33_PROGRESS_LEDGER_2026-02-16_R027_LOCAL_SUBCONSCIOUS_PLAN.md`

Files intentionally not touched:

- runtime logic files (`src/**`)
- policy and guard implementations
- Trinity loop components

## Decision

Outcome:

- PROMOTE (for plan quality and execution readiness)

Decision rationale:

1. Plan is implementation-ready, scoped, and conservative.
2. Handoff quality is high enough for context-loss recovery.
3. Safety-first constraints are preserved in every step.

## Next Actions

Immediate next step (single action):

- Implement `R027-A` by creating `src/brain/subconscious.ts` with strict JSON parse, timeout, and fail-open behavior.

Backup/fallback action:

- If local model integration is unstable, keep module stubbed and log-only while preserving current R026 behavior.

Owner:

- David + Codex

## Handoff Packet (Short)

Current phase:

- P3 stable brain observer + sacred recall; preparing P4-style hybrid cognition.

What is done:

- Full implementation blueprint for local subconscious integration is documented and promotion-ready.

What is blocked:

- Nothing blocked technically; only implementation execution remains.

What next AI should do first:

- Build `src/brain/subconscious.ts` and corresponding tests exactly per `R027-A`.

Risk warning for next AI:

- Do not allow subconscious path to execute tools or writes. Keep fail-open and single-call cap mandatory.
