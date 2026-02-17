# OM Decision Record - Episodic Memory vs R051 Remediation (2026-02-17)

Status: Active decision memo
Context: R050 battery HOLD, autonomy roadmap, creative primacy doctrine
Owner: David + Om team

## 1) Executive Summary

Your diagnosis is directionally correct:
1. Brain scaffolding exists and is active.
2. Sacred recall exists and is active.
3. Quality wall is real (R050 HOLD).
4. Episodic memory gap is currently a configuration/activation gap, not a complete architecture gap.

Key clarification:
The runtime already has a session transcript indexing pipeline (`source = "sessions"`). The previous gap was activation/configuration, not missing architecture.

Recommendation:
Keep E0 activation as baseline (now completed), then run targeted R051 remediation (R3/R4/R8) with no additional architecture changes in the same run.

## 2) Verified Facts (Code-Backed)

### 2.1 Session memory is already implemented in core

Evidence:
1. `src/memory/types.ts`: `MemorySource = "memory" | "sessions"`.
2. `src/agents/memory-search.ts`:
- `normalizeSources(...)` allows `"sessions"` only when `experimental.sessionMemory === true`.
- default sources are only `["memory"]`.
3. `src/memory/manager-sync-ops.ts`:
- has `ensureSessionListener()` using transcript update events.
- tracks dirty session files and syncs them into index as `source = "sessions"`.

### 2.2 Current Om config includes episodic session memory

From local runtime config (`C:\Users\holyd\.openclaw\openclaw.json`) after E0 activation:
1. `memorySearch.enabled = true`
2. `memorySearch.extraPaths` contains `knowledge/sacred`
3. `memorySearch.sources = ["memory", "sessions"]`
4. `memorySearch.experimental.sessionMemory = true`

### 2.3 DB confirms active session indexing

Query result in `C:\Users\holyd\.openclaw\memory\main.sqlite` after backfill/sync:
1. `chunks` contains `source = "memory"` and `source = "sessions"` rows.
2. Verified snapshot:
   - `chunks`: `memory = 269`, `sessions = 158`
   - `files`: `memory = 56`, `sessions = 29`

### 2.4 Conversation-file path assumption needs correction

No code evidence found for `~/.openclaw/workspace/logs/conversation-[UUID].json` as primary source.
Observed real transcript files live under:
`~/.openclaw/agents/<agentId>/sessions/*.jsonl`

This is the path the built-in session indexing pipeline already consumes.

## 3) Re-Interpretation of the 5-Step Episodic Proposal

### Step 1: Harvest (Ingestion)

Your intent is valid.
Implementation should prefer existing transcript event pipeline over adding a second custom watcher first.

### Step 2: Distillation (Chunking)

Partially already provided by memory index chunking.
Missing piece for your vision:
conversation-pair-level semantic distillation policy (User->Assistant turn pairing rules).

### Step 3: Vectorization

Already provided by existing embedding path in memory search subsystem.
No new vector subsystem needed for first activation.

### Step 4: Storage

Current storage model supports `source = "sessions"` (not `episodic_log`).
Adding a new source/type now is possible, but high risk under HOLD and unnecessary for MVP activation.

### Step 5: Active Recall

Already possible via existing memory search + brain recall hook.
Missing piece is practical availability of session chunks (currently off by config).

## 4) Decision Tension (Canon vs Existential Memory Need)

You identified the core tension correctly:
1. Canon says immediate next action is R051 remediation (R3/R4/R8).
2. Episodic continuity likely improves R3 reconstruction quality and R4 memory churn.

Both can be reconciled without violating non-negotiables by strict sequencing.

## 5) Recommended Sequence (Single-Variable Discipline)

### Phase E0 - Episodic Activation Smoke (Single Variable)

Change only memory config activation:
1. `agents.defaults.memorySearch.experimental.sessionMemory = true`
2. `agents.defaults.memorySearch.sources = ["memory", "sessions"]`

Do not change:
1. decision prompts
2. guardrail logic
3. ritual prompt set

Success checks:
1. DB shows `chunks` rows with `source = "sessions"`.
2. one controlled recall prompt retrieves prior-session context.
3. no hard gate regression.

### Phase R051 - Targeted Ritual Remediation (R3/R4/R8)

Run exactly the planned remediation set with memory activation already in baseline.
If pass threshold still not met:
1. next single-variable change is decision-layer soft-guidance patch for anti-churn + safer reconstruction wording.

## 6) Why This Is Better Than a New `episodic-memory.ts` Right Now

1. Reuses tested existing indexing pipeline.
2. Lower implementation risk during HOLD.
3. Faster to validate causal impact on R3/R4.
4. Preserves reversibility and auditability.
5. Avoids schema drift (`episodic_log`) while hard gates are unstable.

## 7) Risks and Controls

Risk 1: Session index noise/churn
Control:
1. keep default session delta thresholds first.
2. review `sessions` chunk growth and retrieval precision.

Risk 2: Latency growth
Control:
1. keep top-k recall small.
2. keep subconscious timeout fixed.

Risk 3: False memory anchoring
Control:
1. include session-id + timestamp in injected memory snippets.
2. keep memory snippets short and explicit.

## 8) Concrete Record of Current Position

Current position as of 2026-02-17:
1. We are not lost.
2. Foundation is real and substantial.
3. Quality wall is real and measurable.
4. Episodic memory should be treated as a near-term stability lever, not decorative feature work.
5. The correct move is controlled activation first, then ritual remediation under strict measurement.

## 9) Execution Update (E0 Completed, 2026-02-17)

What was executed:
1. Config activation:
   - `agents.defaults.memorySearch.experimental.sessionMemory = true`
   - `agents.defaults.memorySearch.sources = ["memory", "sessions"]`
2. Session index backfill completed for agent `main`.
3. Decision-layer recall path filter patched to include `sessions/*` in pre-injection recall eligibility.
   - File: `src/brain/decision.ts`
   - Change: `isSacredMemoryPath(...)` now accepts sacred paths and session paths.
4. Runtime validation:
   - `memory search` returns hits from `sessions/*.jsonl`.
   - Controlled prompts returned prior-session tokens (`TRINITY_ONLY_CHECK`, `TRINITY_ONLY_FINAL_CHECK`).
5. Test validation:
   - `src/brain/decision.test.ts`
   - `src/brain/memory-ingestion.test.ts`
   - `src/memory/session-files.test.ts`
   - `src/memory/search-manager.test.ts`
   - Result: all passed (27/27).

Known operational caveat:
1. External embedding/model endpoints can intermittently return timeout/500.
2. System behavior is fail-open/fail-safe and continued to answer via memory tools when that occurred.
3. This is tracked as runtime reliability risk, not a local architecture blocker.
## 10) Next Operator Decision

Choose one:
1. Approve `E0 episodic activation` first, then `R051`.
2. Skip E0 and execute `R051` exactly as currently specified.

This memo now recommends: keep E0 active and execute `R051` with strict single-variable discipline.

## 11) Implementation Update (Step 7 + Step 8 Baseline)

As of 2026-02-17, the following additional memory hardening work is now in place:

1. Session-safe drilldown read path:
   - `memory_get` now supports safe reads for `sessions/*.jsonl` evidence slices.
   - Path traversal and non-allowlisted access remain blocked.
   - This enables targeted evidence retrieval from episodic session transcripts.

2. Recall-flow session drilldown enrichment:
   - Brain sacred recall keeps fail-open behavior.
   - For selected session hits, it now attempts a bounded drilldown read and upgrades preview quality when successful.
   - If drilldown fails, baseline recall behavior remains unchanged.

3. Episodic metadata lifecycle baseline (gated):
   - Added optional metadata compaction policy for `logs/brain/episodic-memory.sqlite` table `episodic_entries`.
   - Policy is env-gated and reversible:
     - `OM_EPISODIC_METADATA_COMPACTION_ENABLED`
     - `OM_EPISODIC_METADATA_MAX_ROWS`
     - `OM_EPISODIC_METADATA_RETENTION_DAYS`
     - `OM_EPISODIC_METADATA_LOW_SCORE_RETENTION_DAYS`
     - `OM_EPISODIC_METADATA_LOW_SCORE_THRESHOLD`
   - Compaction currently targets metadata tier only; append-only markdown/jsonl journals remain untouched.

4. Validation:
   - Focused tests pass for:
     - `src/brain/episodic-memory.test.ts`
     - `src/brain/decision.test.ts`
     - `src/memory/index.test.ts`
   - Type checks pass (`pnpm tsgo`).

## 12) Implementation Update (Step 8b + Step 9)

As of 2026-02-17, additional future-proofing is now implemented:

1. Structured episodic journal rotation (gated, fail-open):
   - Added optional rotation policy for `memory/EPISODIC_JOURNAL.jsonl` before append.
   - Env toggles:
     - `OM_EPISODIC_STRUCTURED_ROTATE_ENABLED`
     - `OM_EPISODIC_STRUCTURED_ROTATE_MAX_BYTES`
     - `OM_EPISODIC_STRUCTURED_ROTATE_MAX_FILES`
   - Rotation preserves latest writes in active file and caps retained rotated files.

2. Creative/ritual recall shaping:
   - Added route-aware signal boosts in recall ranking:
     - creative route favors creative-memory signal terms
     - ritual route favors canonical ritual/protocol signal terms
   - Added route-aware context mode lines in injected recall block:
     - "Creative continuity mode ..."
     - "Ritual continuity mode ..."
   - Added rollback-friendly toggles:
     - `OM_SACRED_RECALL_ROUTE_SIGNAL_BOOST_ENABLED`
     - `OM_SACRED_RECALL_ROUTE_MODE_LINES_ENABLED`

3. Validation:
   - Focused tests pass:
     - `src/brain/episodic-memory.test.ts`
     - `src/brain/decision.test.ts`
     - `src/memory/index.test.ts`
   - Type checks pass (`pnpm tsgo`).
