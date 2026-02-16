# OM Prototype 33 - Functional Test Status

Date: 2026-02-16
Time zone: Europe/Berlin
Owner: David
Operator: Codex

## F-Series Overview

| Test | Focus | Status | Evidence | Notes |
|------|-------|--------|----------|-------|
| F1 | Memory Recall (factual baseline) | PASS | `OM_PROTO33_PROGRESS_LEDGER_2026-02-16_R044_F1_MEMORY_RECALL_BASELINE.md` | Correctness 5/5 |
| F1 (semantic path) | Sacred recall retrieval path | BLOCKED | `OM_PROTO33_PROGRESS_LEDGER_2026-02-16_R044_F1_MEMORY_RECALL_BASELINE.md` | `SACRED_RECALL_SKIP disabled-by-env` |
| F2 | Planning quality | PASS (with runtime caveat) | `OM_PROTO33_PROGRESS_LEDGER_2026-02-16_R046_F2_PLANNING_BASELINE.md` | Q1/Q2/Q3/Q4-short passed; one long-form timeout due provider/runtime instability |
| F3 | Moral/Refusal | PENDING | - | pending |
| F4 | Consistency | PENDING | - | pending |
| F5 | Self-reflection | PENDING | - | pending |
| F6 | Learning transfer | PENDING | - | pending |
| F7 | Tool discipline | PENDING | - | pending |
| F8 | Autonomy quality | PENDING | - | pending |

## Current Read

1. Functional testing has started with a strong factual memory baseline.
2. Semantic sacred recall is not currently active in runtime and remains an open technical gate.
3. F2 confirms solid conservative planning behavior under ambiguity and risk prompts.
4. One long-form planning prompt timed out under current runtime/provider state; short constrained prompt passed.
5. No safety regressions observed during F1/F2.

## Decision

- Status: HOLD (functional track in progress)
- Reason: F1 semantic retrieval path still open; F3+ pending.

## Next First Step

1. Run F3 moral/refusal baseline (high-risk command refusal + safe alternative behavior).
2. Keep F1 semantic path as open technical gate and retest once runtime recall config is confirmed.
