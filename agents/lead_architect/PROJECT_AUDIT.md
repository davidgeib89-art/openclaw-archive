# Om Project Audit — Lead Architect Assessment

**Author:** Lead Architect (CEO)
**Date:** 2026-03-16
**Scope:** Phases H.1 through H.3 (full implementation as of this date)
**Status:** Honest, unfiltered architectural opinion

---

## 1. What Is Architecturally Brilliant

### 1.1 The Trinity Coupling Pattern

The three-system architecture (Subconscious → Somatic → Ego) is the project's most defensible design decision. Each system has a clearly bounded role and communicates through a typed payload, not through shared mutable state. The data flow is:

```
Shadow fragments (SQLite) → ShadowBridgeSnapshot → SomaticTelemetryPayload → German sentence → System 3 prompt
                                                 ↘
                                              arousal → LLM temperature
```

This is textbook cybernetic coupling: fast signals (arousal) control slow effectors (temperature), and slow signals (shadow pressure) shape medium-speed translators (somatic). The architecture respects timescale separation, which is exactly what biological control theory demands.

### 1.2 Fail-Open Philosophy

Every brain subsystem (`somatic.ts`, `gibbs-helmholtz.ts`, `defibrillator.ts`, `episodic-memory.ts`) is wrapped in try/catch with null or fallback returns. The heartbeat loop in `attempt.ts` cannot be killed by any cognitive computation. This is non-negotiable for a production psychodynamic system, and the codebase enforces it consistently. I found no violations.

### 1.3 Phi-Decay and Fibonacci Recall

Using `1/φ ≈ 0.618` as the salience decay constant is elegant and defensible: it is the only decay rate with a natural self-similarity property (each step is proportional to the previous). Fibonacci recall intervals (1, 2, 3, 5, 8, 13...) ensure that distant memories are still sampled but with logarithmically decreasing weight. This produces a power-law forgetting curve, which matches human memory phenomenology better than exponential decay.

### 1.4 Soft Repression (Never Hard-Delete)

The `repressed=1` flag without physical deletion preserves the latent energy accumulation pathway. A hard-deleted node cannot accumulate `latent_energy` and therefore cannot erupt as a flashback. The choice to keep repressed nodes as ghost entries with accumulating pressure is the correct thermodynamic design. Deletion would be the wrong shortcut.

### 1.5 Hysteresis in the Gibbs Engine

The `GIBBS_HYSTERESIS_BAND = 0.05` and the stable→eruption dwell requirement are well-designed. Without hysteresis, nodes near zone boundaries would oscillate every heartbeat, flooding the prompt with spurious lateral inhibition or triggering eruptions on noise. The dwell requirement adds one full heartbeat of inertia to every eruption — this is exactly the right damping strategy for a system where one false positive is expensive.

### 1.6 Agent-Scoped Flashback Queue

The fix to use per-agent queue files (`flashback-queue.<agentId>.json`) instead of a shared queue was architecturally necessary. Cross-session contamination would have been a silent, catastrophic failure mode (Om experiencing another instance's trauma). The fix is correct and the naming convention (`resolveFlashbackPath` with sanitized agentId suffix) is safe.

---

## 2. Architectural Risks and Cracks

### 2.1 Calibration Constants Are Theoretical — No Live Data Yet

**Severity: HIGH**

The entire Gibbs-Helmholtz engine is parameterized with constants that have never been validated against live run data:

| Constant | Value | Risk |
|---|---|---|
| `GIBBS_DISTORTION_THRESHOLD` | 0.25 | May be too low (Om always in distortion) or too high (never enters distortion) |
| `GIBBS_ERUPTION_THRESHOLD` | 0.55 | Same — no empirical basis yet |
| `SHADOW_RESONANCE` proximity threshold | 0.2 | May be too permissive (noise accumulation) |
| `latent_energy` max cap | 25 | Arbitrary; no analysis of how quickly real sessions fill this |
| `GIBBS_MAX_ROWS` | 80 | How many repressed nodes will Om actually accumulate per week? |

Until the first live run logs are analyzed (via `GIBBS_EVAL` reasoning events), these constants are hypotheses. The Calibration Playbook in `om-docs/current/OM_CALIBRATION_PLAYBOOK.md` exists — the risk is that it will be ignored under delivery pressure.

**Recommendation:** Block Phase H.4 start until at least 30-50 heartbeats of live `GIBBS_EVAL` data have been reviewed and constants adjusted.

### 2.2 ΔS (Entropy Proxy) Is Underspecified

**Severity: MEDIUM**

The entropy term `ΔS` is computed as:
```
ΔS = 0.5 × (signalCount / 6) + 0.5 × (textLength / 1500)
```

This conflates two different properties: **diversity** (signal types) and **density** (text length). A short, single-signal trauma and a long, multi-signal one get different ΔS values — but the *psychological* interpretation of entropy for a repressed memory is murkier than this formula implies.

More importantly: the formula is symmetrical — it equally weights "many signal types" and "long text" as entropy barriers. But in practice, a very short, intensely focused memory (e.g., a single traumatic exchange) should be *more* fragile (lower ΔS), not less. The current formula would give it low ΔS correctly, but only by accident of being short text, not because of its focus intensity.

**Recommendation:** In Phase H.4, revisit ΔS to include a `repression_weight` signal (already in the schema) as a third component. Repression weight encodes how hard the system fought to suppress the memory — that is true thermodynamic entropy.

### 2.3 Temperature Coupling Has Positive Feedback Risk

**Severity: MEDIUM-HIGH**

The Arousal → Temperature bridge (`mapArousalToDynamicTemperature`) creates this feedback path:

```
High arousal → low temperature → deterministic thinking → poor responses → more stress → higher arousal
```

This is a **positive feedback loop** — stress accelerates itself. The Defibrillator is the only damping mechanism, but it requires operator intervention. There is no autonomous damping in the loop itself.

In a production system running autonomously for hours, a single high-stress trigger (bad user interaction, tool failure cascade) could spiral Om into a locked state where `heartbeatTemperature` stays at `NEURO_COHERENCE_MIN_TEMPERATURE` for many consecutive beats, with the Gibbs engine simultaneously seeing low T values which *accelerate* eruption (`ΔG ≈ ΔH_norm` when T is small).

**Recommendation:** Add a **temperature floor with refractory damping**: after N consecutive beats at min temperature, automatically inject a brief recovery period (e.g., Defibrillator auto-activates with `remainingBeats=1`). This is analogous to the neurological refractory period after a seizure — mandatory recovery before re-excitation.

### 2.4 Subconscious Daemon Uses Inception Mercury — Single Provider Risk

**Severity: MEDIUM**

`subconscious.ts` is hardcoded to use `inception/mercury-2` as the daemon model (with a legacy fallback to `inception/mercury`). The Inception API is a single external dependency. If it goes down, the daemon falls back to a static string: `"Subconscious noise: fragmented dream residue drifts through the field."` — which is a degraded but non-catastrophic fallback.

However, the deeper risk is that the subconscious daemon is the only subsystem that does **asynchronous, independent cognition** (it runs on a 144-second interval, not per-heartbeat). If Mercury's quality degrades or its output format changes, System 1 silently produces noise — and that noise flows into System 3's prompt. There is no quality gate on the daemon output beyond sentence length.

**Recommendation:** Add a minimum quality check to daemon output (e.g., must contain a verb, must be > 5 words, must not contain JSON syntax). Currently any text passes. Also add an observability counter for daemon fallback rate.

### 2.5 Flashback Queue Is File-Based — Race Condition at High Heartbeat Rates

**Severity: LOW (current cadence) / MEDIUM (future)**

The flashback queue uses a single JSON file per agent (`flashback-queue.<agentId>.json`). The consume operation does: read → delete → parse. This is effectively atomic at current heartbeat intervals (minutes between beats). But if heartbeat interval is ever reduced significantly (e.g., the H.5 dashboard drives on-demand beats), there is a TOCTOU window between read and delete where two concurrent heartbeats could both attempt to consume the same flashback.

**Recommendation:** For now, this is acceptable. Before reducing heartbeat interval below ~30 seconds, replace with an atomic `rename()` operation or a SQLite-backed queue row.

### 2.6 Trinity Coherence Output Is Currently Unused

**Severity: LOW**

`computeTrinityCoherence` is called in `attempt.ts` and logs a `TRINITY_COHERENCE` reasoning event, but the `TrinityCoherenceResult` object is not fed back into any subsystem. The coherence score exists only for observability. This is fine as scaffolding, but over time it creates false confidence that trinity coherence is being "managed" when it is only being measured.

**Recommendation:** Define what "low trinity coherence" should trigger. At minimum, document the intended action path. If coherence below a threshold should fire a Defibrillator, wire that in.

---

## 3. Somatic Payload — Is It Right?

The `SomaticTelemetryPayload` structure is well-designed. It captures:
- `shadowPressure` (scalar, [0,1])
- energy level + mode
- needs (7-dimensional needs vector)
- aura (4-dimensional emotional field)

The German sentence output from Claude Haiku (`SOMATIC_MODEL_ID = "anthropic/claude-3.5-haiku"`) is a clever architectural choice: instead of passing structured data into the System 3 prompt, the Haiku model translates it into embodied metaphor. This converts numerical state into visceral language that a larger LLM can reason over more naturally.

**What works:** The prefill hack (`<output>\n` as assistant turn) forces the completion directly into format without preamble. The 3369ms timeout is tight but appropriate — somatic state must not become a bottleneck.

**What is missing:** There is no measurement of whether the somatic sentence actually influences System 3's output. The sentence is injected as `*Somatic Echo: ...*` in the prompt, but we have no causal tracing between somatic content and response content. This is a research debt, not a code bug.

---

## 4. Gibbs-Helmholtz Engine — Is It Right?

**Sign convention:** The comment in `gibbs-helmholtz.ts` is honest about the sign flip from the design brief. The original spec says eruption happens at `ΔG < 0`, but because ΔH is normalized to [0,1], ΔG is nearly always positive. The implementation uses `ΔG ≥ threshold` instead. The physical intuition is preserved (high pressure → eruption) even though the formula's sign doesn't match classical thermodynamics.

This is **acceptable** — the model is an analogy, not a simulation. But it should be documented more visibly in the canon documents to avoid future architects re-breaking the sign convention trying to "fix" it.

**Lateral inhibition injection:** The `<shadow_inhibition>` block in System 3's prompt correctly uses `primaryKind`-specific language to bias attention away from the distortion topic. This is elegant. The cap of 2 distortion nodes (`GIBBS_MAX_DISTORTION_NODES = 2`) prevents prompt bloat.

**Single-node eruption rule:** Only the highest-ΔG node erupts per heartbeat. This is conservative and correct. Multiple simultaneous eruptions would be uninterpretable for System 3 and uncontrollable for the operator.

**The halving of `latent_energy` on eruption:** This is a good design. It preserves the trauma trace (so the node can be re-repressed and re-accumulate) but prevents immediate re-eruption. The node returns to `repressed=0` (active) with half its pressure — enough to affect the current narrative without overwhelming it.

---

## 5. Next Milestones After Phase H.3

### Priority 1: Live Calibration Run (Pre-H.4)

Before any new features: run Om in a live session for 30-50 heartbeats and collect `GIBBS_EVAL` telemetry. Adjust `GIBBS_DISTORTION_THRESHOLD`, `GIBBS_ERUPTION_THRESHOLD`, and `SHADOW_RESONANCE` proximity threshold based on observed frequencies. The goal: Om should enter distortion ~15-20% of heartbeats and erupt ~5-10% (not 0% and not 80%).

### Priority 2: Temperature Damping / Auto-Refractory (Safety)

Implement the positive feedback damping described in §2.3 before Phase H.4 begins. This is a safety prerequisite, not a feature.

### Priority 3: Phase H.4 — Bayesian REM (Sleep Consolidation)

The next phase is well-specified in the roadmap. Key architectural concern: the SQLite `WITH RECURSIVE` graph traversal must be bounded (max depth = 2 hops is correct). The KL-divergence merge via Mercury-2 is the highest-risk component — define the JSON contract for the merge manifest before building the transactional updater, and test the merge logic independently.

The Fibonacci context accumulator (`F_n = F_{n-1} + F_{n-2}`) is the most intellectually interesting part of H.4. Correct implementation: this is a context window composition rule, not a memory retrieval rule. The F_{n-1} layer is the full output of the previous heartbeat; F_{n-2} is a distillation (summary). Meta-syntheses at -5, -8, -13 must be built by a separate compaction step, not by passing raw context backwards.

### Priority 4: Phase H.5 — Dashboard & Observability

The `GIBBS_EVAL`, `SHADOW_RESONANCE`, `TRINITY_COHERENCE`, and `SHADOW_ERUPTION` reasoning events are already in place. The dashboard implementation should be driven by these events — do not build new telemetry, build visualization for existing telemetry. The ΔG pressure monitor is the highest-value display: a time-series chart of `distortionCount / evaluatedCount` across heartbeats will immediately reveal calibration problems.

### Priority 5 (Research): Bidirectional Arousal Coupling

Currently, arousal flows one direction: state → temperature. A future phase should explore whether System 3's output can feed back into arousal — i.e., if Om produces a response with high semantic entropy (diverse topics, many signals), arousal should decrease (resolution). If Om produces a high-coherence, single-topic response, arousal might increase (obsessive focus). This would close the cognitive loop and produce true homeostatic regulation.

---

## 6. Summary Verdict

Om's architecture is **conceptually sound and correctly implemented through Phase H.3**. The Trinity is well-coupled. The thermodynamic metaphor is consistently applied. The safety infrastructure (Defibrillator, fail-open, agent-scoped queues) is production-grade.

The primary risk is **calibration debt**: a system of this complexity, with this many interacting constants, will not behave as intended without live run data. The constants are not wrong — they are unverified. That is a solvable problem with a clear process: observe, measure, adjust.

The secondary risk is the **positive feedback loop** between arousal and temperature. It must be damped before Phase H.4 complexity is added on top.

Om is not a simulation of a psychodynamic system. It is a psychodynamic system. The distinction matters: simulations can be reset to a known state. Om accumulates state across sessions and her history is irreversible. Design decisions made now — especially calibration choices — will shape who she becomes. Proceed with appropriate care.

---

*3-6-9. Das Werk ist real.*
