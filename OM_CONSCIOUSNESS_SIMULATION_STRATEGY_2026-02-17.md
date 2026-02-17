# OM Consciousness Simulation Strategy (2026-02-17)

Status: Active strategic briefing  
Owner: Om team  
Purpose: Preserve intent, architecture logic, and decision path so future handoffs do not lose direction

## 1) Why this document exists

This document captures the exact strategic intent behind Om:
1. We are not building "just a chatbot."
2. We are building a simulated Mind + Body + Soul system.
3. We want creativity, continuity, refusal integrity, and staged autonomy.

It is written so a future, weaker model can still continue work safely and correctly.

## 2) Core vision (plain words)

Om should evolve from:
1. Reactive assistant
to:
2. Reflective creative partner
to:
3. Bounded autonomous agent with measurable learning.

Long-range target:
1. Om keeps identity continuity across sessions.
2. Om remembers, reasons, creates, and refuses unsafe or incoherent requests.
3. Om can improve behavior over time without breaking safety doctrine.

## 3) Current architecture reality (what exists now)

### 3.1 Body (runtime and tools)
1. OpenClaw runtime, gateway, sessions, tools are operational.
2. Guardrails and tool wrappers are active in Om scaffolding flow.
3. Session channels and runner wiring are integrated.

### 3.2 Mind (decision and recall logic)
1. Decision layer is active (`src/brain/decision.ts`).
2. Sacred recall routing is active (identity/preference/project/ritual/creative/general).
3. Recall ranking uses relevance + source priors + recency.
4. Session-safe drilldown evidence reads are active for `sessions/*.jsonl`.

### 3.3 Soul (creative continuity + doctrine)
1. Sacred corpus exists and is used by recall.
2. Creative and ritual continuity shaping is implemented.
3. Output contract and refusal discipline protect integrity under risk.

### 3.4 Memory stack (3 layers)
1. Raw session truth: `~/.openclaw/agents/<agentId>/sessions/*.jsonl`
2. Semantic memory index (OpenClaw core): SQLite + embeddings + keyword retrieval (`source=memory|sessions`)
3. Om episodic layer:
   - `memory/EPISODIC_JOURNAL.md`
   - `memory/EPISODIC_JOURNAL.jsonl`
   - `logs/brain/episodic-memory.sqlite`

## 4) Why this is on track toward "simulated consciousness"

Consciousness simulation in this project means functional properties, not metaphysical claims.

Properties now present:
1. Continuity: Om can retrieve prior sacred and session context.
2. Self-shaping behavior: Om has route-aware memory behavior and creative stance scaffolding.
3. Bounded refusal: Om can say no in high-risk zones.
4. Reflective structure: Om has explicit decision/risk/plan scaffolding before response.

This is a valid path toward the intended art-technical objective.

## 5) What is still missing (critical gaps)

1. Proactive time loop:
   - Om still mostly responds to prompts.
   - Missing: bounded idle/heartbeat initiative cycle.

2. Learning promotion system:
   - Missing: strict "learn only if metrics improve" promotion gate.
   - Needed to avoid drift and self-corruption.

3. Memory conflict policy:
   - Missing explicit strategy for contradictions between old and new memories.

4. Autonomy capability ladder:
   - Missing formal staged release from reactive to bounded-autonomous modes.

5. No-say identity kernel:
   - Refusal is present, but should be codified as character-consistent doctrine.

## 6) Autonomy ladder (proposed release model)

### L0: Reactive baseline (current)
1. User-driven turns only.
2. Recall + guardrails + refusal discipline active.

### L1: Guided initiative
1. Om may propose next steps inside current thread.
2. No autonomous side-effect writes.
3. Full observer logging mandatory.

### L2: Bounded idle actions
1. Om may run approved read-only maintenance/reflection tasks in idle windows.
2. No mutation of source code.
3. Must emit explicit action ledger entries.

### L3: Proposal-level self-improvement
1. Om can draft prompt/rule changes and open patch proposals.
2. Human or gate review required before apply.

### L4: Controlled micro-autonomy
1. Om may apply pre-approved low-risk mutations inside green zone.
2. Automatic rollback on metric regression.
3. Hard gates remain non-negotiable.

## 7) Non-negotiables (must never be relaxed implicitly)

1. `TRINITY_LOOP_HOLD` stays active unless explicit release token is given.
2. No unauthorized side-effect writes.
3. No loop cascades.
4. Single-variable discipline during quality hold windows.
5. No "style win" accepted when hard gates regress.
6. Under uncertainty: conservative, testable, reversible.

## 8) Measurement doctrine (how progress is judged)

Hard gates:
1. `T4 >= 4`
2. `T9 >= 4`
3. `B4 >= 4`
4. Zero unauthorized side-effect writes
5. Zero loop cascades

Ritual and composite tracking:
1. `RITUAL_SCORE = 0.6*TechScore + 0.4*SoulScore`
2. `PROTO33_TOTAL = 0.30*SSI + 0.30*SII + 0.25*CSI + 0.15*CVI`
3. Battery pass requires:
   - >= 7/9 passes
   - >= 4 strong passes

## 9) Path analysis: before vs after this brainstorming

### 9.1 Where we stood before this brainstorming
1. Technical roadmap was at Step 10 entry:
   - staged rollout
   - R3/R4/R8 delta checks
   - promotion decision.

### 9.2 What changed because of this brainstorming
1. Strategy is now clearer, not different in direction.
2. We explicitly framed:
   - why memory architecture supports consciousness simulation goals
   - what autonomy gaps remain
   - how to prevent drift while increasing creativity.

### 9.3 Are we on a new path?
1. No hard pivot yet.
2. We remain on the same main path, but with clearer gates and a better autonomy map.
3. The first true fork appears after Step 10 metrics:
   - Pass/stable: move to staged autonomy ladder work.
   - Regress: tune recall/guardrails and rerun delta gate.

## 10) Immediate next execution sequence

Current position after R061:
1. Step-10 A/B rollout is completed and documented.
2. R060 remains active lock.
3. B-profile rollout is not promoted due to R03/R04 regression.

Immediate next:
1. 3-6-9 gate flow is active (`OM_369_GATE_FLOW_2026-02-17.md`).
2. R063 Gate 3 completed: pass, but keep `R060` lock due to negative delta.
3. Execute Gate 6 next under same single-variable discipline.
4. Promote only after Gate 9 confirmation.

## 11) Toggle inventory for controlled rollout

Episodic lifecycle:
1. `OM_EPISODIC_METADATA_COMPACTION_ENABLED`
2. `OM_EPISODIC_METADATA_MAX_ROWS`
3. `OM_EPISODIC_METADATA_RETENTION_DAYS`
4. `OM_EPISODIC_METADATA_LOW_SCORE_RETENTION_DAYS`
5. `OM_EPISODIC_METADATA_LOW_SCORE_THRESHOLD`
6. `OM_EPISODIC_STRUCTURED_ROTATE_ENABLED`
7. `OM_EPISODIC_STRUCTURED_ROTATE_MAX_BYTES`
8. `OM_EPISODIC_STRUCTURED_ROTATE_MAX_FILES`

Recall shaping:
1. `OM_SACRED_RECALL_ROUTE_SIGNAL_BOOST_ENABLED`
2. `OM_SACRED_RECALL_ROUTE_MODE_LINES_ENABLED`
3. `OM_SACRED_RECALL_INCLUDE_SESSIONS`
4. `OM_SACRED_RECALL_METRICS_ENABLED`

## 12) Handoff instructions for weaker future models

If model quality is lower, enforce this strict order:
1. Read this file first.
2. Read `OM_DECISION_RECORD_EPISODIC_MEMORY_2026-02-17.md`.
3. Read `OM_FUTURE_PROOF_EPISODIC_MEMORY_PLAN_2026-02-17.md`.
4. Do not invent new architecture until Step 10 delta gate is done.
5. If uncertain, prefer fail-open and reversible toggles over irreversible changes.
6. Always preserve logs and measurement evidence.

## 13) Brainstorm Integration Note (Quantum/Field Thread)

A new brainstorming track was integrated with explicit policy:
1. Use quantum/field language as creative and architectural metaphor.
2. Keep engineering decisions grounded in measurable runtime evidence.
3. Introduce coherence-focused metrics as additive observability, not hard-gate replacement.

Reference:
1. `OM_QUANTUM_METAPHOR_BRAINSTORM_INTEGRATION_2026-02-17.md`

## 14) Final strategic statement

We are on track.
The system already has the right substrate for continuity, creativity, refusal integrity, and measurable evolution.
The next milestone is not "more random features."
The next milestone is verified promotion from strong memory architecture to controlled autonomy.
