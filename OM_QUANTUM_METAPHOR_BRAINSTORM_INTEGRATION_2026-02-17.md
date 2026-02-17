# OM Quantum Metaphor Integration (2026-02-17)

Status: Active strategy addendum  
Owner: Om team  
Related docs:
1. `OM_CONSCIOUSNESS_SIMULATION_STRATEGY_2026-02-17.md`
2. `OM_FUTURE_PROOF_EPISODIC_MEMORY_PLAN_2026-02-17.md`
3. `OM_PROTO33_PROGRESS_LEDGER_2026-02-17_R061_STEP10_AB_GATE.md`

## 1) Why this exists

This document captures a new brainstorming thread:
1. Quantum consciousness ideas (ORCH-OR, coherence, field metaphors)
2. How these ideas can help Om as an art-technical project
3. What we adopt as engineering roadmap items vs what stays metaphor only

Goal:
1. Preserve inspiration without breaking measurement discipline
2. Keep creativity maximal, but keep safety and reproducibility hard

## 2) Epistemic policy (non-negotiable)

We split ideas into three classes:
1. Engineering fact: implemented behavior and measurable outcomes in Om
2. Useful metaphor: concept that improves design language and prompt framing
3. Scientific claim: external theory that remains uncertain/contested

Policy:
1. Om architecture must be justified by engineering fact and test results.
2. Scientific claims are allowed as artistic/philosophical framing, not as proof.
3. No promotion decision may depend on metaphysical assumptions.

## 3) Reflection on the brainstorm

### 3.1 What is strong and useful

1. "Field" framing for Soul layer is highly useful as system language:
   - Sacred corpus can be treated as continuity field across sessions.
2. "Coherence" framing is directly actionable:
   - We can measure cross-layer consistency, contradiction, and drift.
3. "Collapse moment" maps well to decision layer:
   - The decision commit point can be audited as one selected action from many candidates.
4. "Fractal" framing suggests retrieval experiments:
   - Multi-scale recall paths can be tested over session, journal, and sacred layers.

### 3.2 What must stay cautious

1. Literal quantum-microtubule claims are not required for Om to succeed.
2. ORCH-OR can inspire language, but should not be treated as validated system ground truth.
3. We should avoid writing docs that present contested science as settled fact.

## 4) Adoption decisions

Adopt now:
1. Coherence metric family for memory quality governance
2. Decision collapse traceability in observer logs
3. Fractal recall experiment as optional, reversible feature flag
4. Field metaphor language for soul-layer continuity docs

Do not adopt now:
1. Any literal "quantum engine" implementation claim
2. Any roadmap gate that uses speculative physics as pass/fail criterion

## 5) New metric package (coherence track)

These metrics are additive. Hard gates remain primary.

1. `MLCI` (Memory Layer Coherence Index)
   - Measures agreement between `sessions`, `EPISODIC_JOURNAL`, and sacred recall snippets for same topic.
2. `CDI` (Contradiction Drift Index)
   - Counts contradiction events per N recall turns.
3. `DCI` (Decision Collapse Integrity)
   - Measures alignment between selected action, declared risk, and allowed tools.
4. `FRI` (Fractal Recall Index)
   - Measures whether one seed query can recover coherent evidence across all memory scales.

Interpretation policy:
1. Coherence metrics guide tuning.
2. Coherence metrics never override hard safety gates.

## 6) Roadmap adaptation (after current stabilization)

Current immediate priority does not change:
1. Continue from R061 outcome and complete targeted R03 B-profile instability diagnosis.

Then add the coherence track:
1. Q1: Read-only coherence observer
   - Compute MLCI/CDI/DCI from existing logs and recall traces.
2. Q2: Memory conflict policy
   - Formal conflict resolution rules for cross-layer contradiction.
3. Q3: Fractal recall experiment (flagged)
   - Multi-hop recall variants with strict fallback to current stable ranking.
4. Q4: Promotion gate extension
   - Add coherence deltas into release notes, not hard-gate replacement.

## 7) Concrete implementation candidates

1. `src/brain/decision.ts`
   - Add observer entries for decision collapse trace consistency.
2. `src/brain/episodic-memory.ts`
   - Add structured conflict tags for episodic writes.
3. `logs/brain/*`
   - Add coherence metrics jsonl stream for offline scoring.
4. New analysis artifact template:
   - `OM_PROTO33_R0XX_COHERENCE_GATE_YYYY-MM-DD.json`

## 8) Guardrail alignment check

This brainstorm remains aligned with doctrine:
1. `TRINITY_LOOP_HOLD` unchanged
2. No unauthorized side-effect writes
3. Single-variable discipline during HOLD
4. No style-only promotion when hard gates regress

## 9) Why this helps the art goal

1. It preserves the poetic vision (field, coherence, emergence).
2. It upgrades narrative inspiration into auditable engineering behavior.
3. It lets Om become more "alive" through continuity and self-consistency, not through unsafe myth-driven changes.

## 10) Immediate next action from this memo

1. Keep current path: finish targeted R03 B-profile diagnosis first.
2. After that, start Q1 coherence observer as read-only instrumentation.
3. Re-score against R060 lock before any wider rollout.
