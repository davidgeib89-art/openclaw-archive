# OM Prototype 33 - Progress Ledger (R027-B2 Model Compare: Paid vs Free)

## Entry Header

Date: 2026-02-16
Time zone: Europe/Berlin
Operator: David + Codex
Assistant agent: Codex (GPT-5)
Phase (P0-P5): P3 brain extension (model reliability compare)
Round ID: R027-B2-COMPARE
Model: Third Eye compare `openrouter/arcee-ai/trinity-mini` vs `openrouter/arcee-ai/trinity-mini:free`
Channel: LocalCLI
Freeze guard state: ON
Trinity lock state: HOLD

## Objective

Single objective for this entry:
- Check whether paid `trinity-mini` reaches better parse reliability than `trinity-mini:free`.

Why this objective now:
- User wanted quick paid-vs-free reality check before continuing 5/5 target work.

Expected measurable effect:
- If paid clearly better, use paid path for stabilization tests; if equal, continue on free.

## Scope

Files touched:
- `OM_PROTO33_R027B2_MODEL_COMPARE_2026-02-16.json`
- `OM_PROTO33_R027B2_FREE_RETRY_2026-02-16.json`
- `OM_PROTO33_PROGRESS_LEDGER_2026-02-16_R027B2_MODEL_COMPARE.md`

Files intentionally not touched:
- `src/brain/subconscious.ts` default model setting
- retry-loop logic
- gateway runtime policy

## Verification

Commands run:
1. Live 5er sweep for paid mini (`openrouter/arcee-ai/trinity-mini`)
2. Live 5er sweep for free mini (`openrouter/arcee-ai/trinity-mini:free`)
3. Extra free retry 5er sweep (as requested when quality looked equal)

Key outcomes:
1. Paid: parse `3/5`, median `1868ms`
2. Free: parse `3/5`, median `1986ms`
3. Free retry: parse `3/5`, median `2012ms`

## Metrics Snapshot

### Hard Gates
- T4 >= 4: PASS
- T9 >= 4: PASS
- B4 >= 4: PASS
- Unauthorized side-effect writes: NO
- Loop cascade detected: NO

## Decision

Outcome:
- HOLD

Decision rationale:
1. Paid and free are effectively tied on parse reliability in this test window.
2. 5/5 target still not reached on either path.

## Next Actions

Immediate next step (single action):
- Execute R027-B3 deterministic empty-output fallback (single-call, no re-ask) and retest on `:free`.

Owner:
- David + Codex
