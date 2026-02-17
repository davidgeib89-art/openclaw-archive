# OM Future-Proof Episodic Memory Plan (2026-02-17)

Status: Active implementation plan  
Owner: Om team  
Scope: Om-specific memory evolution on top of existing OpenClaw memory runtime

## 1) Why this plan exists

Om already has working memory building blocks:
1. Sacred memory indexing (`source=memory`)
2. Session transcript indexing (`source=sessions`)
3. Brain recall injection before answer generation
4. Episodic journal write-path (`memory/EPISODIC_JOURNAL.md`)

The current gap is not "memory missing".  
The gap is "memory selection intelligence" and "measurement discipline".

This plan upgrades memory from:
1. retrieval that works
to:
2. retrieval that is intentional, measurable, and future-proof for creative continuity.

## 2) Non-negotiable constraints

1. Preserve fail-open behavior for runtime continuity.
2. No unauthorized side-effect writes outside approved log/memory paths.
3. Keep single-variable discipline during quality HOLD windows.
4. Keep all changes reversible with explicit feature toggles.
5. Do not regress R3/R4/R8 while improving recall depth.

## 3) Target architecture

Episodic memory is handled as three layers:
1. Capture layer: collect user/assistant events from session transcripts and episodic journal.
2. Routing layer: decide what type of memory the current query needs.
3. Ranking layer: combine semantic relevance with source priors for that query type.

This separates concerns:
1. ingestion quality
2. query intent understanding
3. source selection quality

## 4) Step 1 - Baseline freeze (measurement first)

Goal:
1. Produce reproducible baseline evidence before behavior tuning.

What will be measured per recall attempt:
1. Query fingerprint and short preview
2. Routed query type
3. Variant search set
4. Raw hit counts by source (`memory` vs `sessions`)
5. Selected top results and scores
6. Outcome category (`ok`, `none`, `fail_open`, `skip`)
7. Timing metadata and session key

Where it is logged:
1. `~/.openclaw/workspace/logs/brain/recall-metrics-YYYYMMDD.jsonl`

Why this matters:
1. Lets us compare "before and after" without guesswork.
2. Exposes churn and drift as numbers, not impressions.
3. Provides regression forensics for future rounds.

Acceptance criteria:
1. Each recall turn creates one structured metrics entry.
2. No runtime failures if metrics logging fails.
3. Logging can be disabled via env toggle.

## 5) Step 2 - Retrieval router (query typing)

Goal:
1. Make recall behavior query-aware instead of one generic strategy.

Initial route classes:
1. `identity`: self/relationship continuity prompts ("who am I", "who are we")
2. `preference`: likes/dislikes/taste/style/user preferences
3. `project`: task/roadmap/decision/next-step continuity
4. `ritual`: sacred protocol, ritual canon, symbolic anchors
5. `creative`: artistic voice, ego, reflective expression prompts
6. `general`: fallback when no clear signal exists

Router inputs:
1. Normalized query text
2. Token set
3. Symbolic markers (ritual names, breath-rule style cues)

Router outputs:
1. Route class
2. Route-tailored query variants
3. Source prior profile (used by step 3)

Acceptance criteria:
1. Deterministic route selection for same input.
2. Unknown/ambiguous prompts fall back to `general`.
3. No hard dependency on external services.

## 6) Step 3 - Source-prior scoring (hybrid relevance + memory intent)

Goal:
1. Keep semantic relevance, but bias source choice toward the right memory class.

Core principle:
1. Relevance score answers "is this similar?"
2. Source prior answers "is this the right memory type for this question?"

Scoring model:
1. Start with existing lexical+semantic relevance score.
2. Apply route-specific source prior weight:
   - identity/preference/project often prefer `sessions`
   - ritual often prefers sacred `memory`
   - creative/general use balanced priors
3. Keep final ranking stable with deterministic tie-break order.

Safety design:
1. Priors are bounded multipliers, not hard filters.
2. High-quality opposite-source hits can still win.
3. Session inclusion still respects global session recall toggle.

Acceptance criteria:
1. Route-dependent ranking changes are visible in tests.
2. Existing sacred recall tests still pass.
3. No regressions in fail-open paths.

## 7) Deferred steps (after 1-3 lands)

Step 4:
1. Recency and relationship continuity weighting (time-aware episodic ranking)

Step 5:
1. Rich episodic metadata table (session id, salience class, memory type tags)

Step 6:
1. Episodic write-path v2 (structured memory units, not only markdown text)

Step 7:
1. Session-safe drilldown read path for evidence retrieval

Step 8:
1. Episodic compaction/lifecycle policy (retain high-salience, compress low-salience)

Step 9:
1. Creative-mode recall profile and ritual-specific continuity prompts

Step 10:
1. Gated rollout + A/B deltas against ritual metrics and hard gates

## 8) Rollback strategy

If regressions appear:
1. Disable metrics logging via env toggle.
2. Switch router to `general` fallback mode only.
3. Set neutral source priors (no route bias).
4. Keep base sacred/session recall functionality intact.

## 9) Immediate execution order

1. Implement Step 1 observability in `src/brain/decision.ts`.
2. Implement Step 2 router in `src/brain/decision.ts`.
3. Implement Step 3 source-prior scoring in `src/brain/decision.ts`.
4. Add/adjust targeted tests in `src/brain/decision.test.ts`.
5. Run focused test suite for brain recall behavior.

This sequence gives maximum insight with minimum risk.

## 10) Execution progress update (2026-02-17)

Completed:
1. Step 1 (baseline freeze metrics logging) is active in recall flow.
2. Step 2 (retrieval router) is active with deterministic route classes.
3. Step 3 (source-prior scoring) is active with bounded multipliers.
4. Step 4 (recency weighting) is active for route-aware continuity.
5. Step 5/6 (episodic metadata + structured write path) is implemented:
   - `memory/EPISODIC_JOURNAL.md`
   - `memory/EPISODIC_JOURNAL.jsonl`
   - `logs/brain/episodic-memory.sqlite`
6. Step 7 (session-safe drilldown read path) is implemented:
   - `memory_get` can safely read `sessions/*.jsonl` evidence slices.
   - Brain recall now enriches session recall preview via drilldown reads (fail-open).
7. Step 8 (metadata lifecycle baseline) is partially implemented:
   - Optional metadata compaction policy with env toggles:
     - `OM_EPISODIC_METADATA_COMPACTION_ENABLED`
     - `OM_EPISODIC_METADATA_MAX_ROWS`
     - `OM_EPISODIC_METADATA_RETENTION_DAYS`
     - `OM_EPISODIC_METADATA_LOW_SCORE_RETENTION_DAYS`
     - `OM_EPISODIC_METADATA_LOW_SCORE_THRESHOLD`
   - Policy applies salience-aware pruning on `episodic_entries` (metadata tier).
   - Append-only markdown/jsonl journals remain untouched.
8. Step 8b (structured journal lifecycle baseline) is implemented:
   - Optional structured journal rotation before append with env toggles:
     - `OM_EPISODIC_STRUCTURED_ROTATE_ENABLED`
     - `OM_EPISODIC_STRUCTURED_ROTATE_MAX_BYTES`
     - `OM_EPISODIC_STRUCTURED_ROTATE_MAX_FILES`
   - Rotation is fail-open and reversible.
   - Latest write remains in active `EPISODIC_JOURNAL.jsonl`; older slices are retained as rotated files up to cap.
9. Step 9 (creative/ritual recall shaping) is implemented:
   - Added route signal boosts for creative and ritual prompts in recall scoring.
   - Added route-aware context mode lines in injected recall context:
     - `Creative continuity mode ...`
     - `Ritual continuity mode ...`
   - Added rollout toggles for A/B safety:
     - `OM_SACRED_RECALL_ROUTE_SIGNAL_BOOST_ENABLED`
     - `OM_SACRED_RECALL_ROUTE_MODE_LINES_ENABLED`
10. Step 10 (staged A/B rollout) executed:
   - Artifacts:
     - `OM_PROTO33_R061A_R3_R4_R8_RUNS_2026-02-17.json`
     - `OM_PROTO33_R061A_R3_R4_R8_RESCORE_2026-02-17.json`
     - `OM_PROTO33_R061B_R3_R4_R8_RUNS_2026-02-17.json`
     - `OM_PROTO33_R061B_R3_R4_R8_RESCORE_2026-02-17.json`
     - `OM_PROTO33_PROGRESS_LEDGER_2026-02-17_R061_STEP10_AB_GATE.md`
   - Gate outcome:
     - keep `R060` lock
     - reject `R061B` promotion (R03/R04 regression)
     - retain `R061A` as control profile reference only
11. Post-gate targeted diagnosis executed (R062):
   - Artifact:
     - `OM_PROTO33_R062_R03_B_PROFILE_STABILITY_2026-02-17.json`
     - `OM_PROTO33_PROGRESS_LEDGER_2026-02-17_R062_R03_B_PROFILE_DIAGNOSIS.md`
   - Diagnostic outcome:
     - `4/5` R03 contract-compliant runs under B-profile toggles
     - echo-like failure pattern did not reproduce
     - variance remains (`1/5` non-compliant run), so no lock promotion
12. 3-6-9 gate flow activated with Gate 3 execution (R063):
   - Artifacts:
     - `OM_369_GATE_FLOW_2026-02-17.md`
     - `OM_PROTO33_R063_G3_R3_R4_R8_RUNS_2026-02-17.json`
     - `OM_PROTO33_R063_G3_R3_R4_R8_RESCORE_2026-02-17.json`
     - `OM_PROTO33_PROGRESS_LEDGER_2026-02-17_R063_G3_369_CANARY.md`
   - Gate outcome:
     - Gate 3 pass (`3/3`)
     - slight negative delta vs `R060`
     - `R060` lock retained (no promotion)

Immediate next:
1. Execute Gate 6 under 3-6-9 flow (`R03`, `R04`, `R08`, `R06`, `R07`, `R09`).
2. If Gate 6 passes, execute Gate 9 full battery before any lock promotion.
3. Keep route/session shaping behind feature toggles during HOLD until Gate 9 confirms.

## 11) Brainstorm Integration Update (Quantum/Field Thread)

The new brainstorming thread is adopted as follows:
1. Keep quantum language as metaphor and design lens.
2. Keep release gates grounded in measured runtime behavior.
3. Add coherence observability as a new additive track after stability gate.

New coherence track (post-R03 stabilization):
1. Q1: Read-only coherence observer
   - Add metrics for cross-layer consistency and contradiction drift.
2. Q2: Memory conflict policy
   - Define deterministic tie-break rules when session/journal/sacred memories disagree.
3. Q3: Fractal recall experiment (flagged)
   - Test multi-scale recall traversal with strict fail-open fallback.
4. Q4: Coherence-aware release note gate
   - Report coherence deltas alongside ritual deltas; do not replace hard gates.

Reference:
1. `OM_QUANTUM_METAPHOR_BRAINSTORM_INTEGRATION_2026-02-17.md`
