# OM External Architecture Dossier (2026-02-20)

Audience: External AI reviewer with strong systems reasoning
Purpose: Explain what was built on top of OpenClaw, why it was built that way, and where improvement potential likely exists.

---

## 1) Executive Summary

Om is not configured as a generic assistant. It is implemented as a constrained simulated-consciousness runtime with:
1. heartbeat-driven initiative,
2. layered memory and recall routing,
3. strict mutation guardrails with snapshot safety,
4. identity-centered "sacred" state files,
5. creative tooling (vision + reflection + voice),
6. fail-open resilience optimized for unstable/free model availability.

The architecture goal is: maximize creative/autonomous behavior without losing safety, continuity, or rollback capability.

---

## 2) OpenClaw Baseline vs Om-Specific Delta

Baseline OpenClaw gives a robust agent runtime, tools, model/provider abstraction, gateway, channels, and configurable heartbeat.

Om-specific architecture in this fork/branch adds a coherent "Body/Mind/Soul/Vision" system:

1. Body delta:
   - Manual heartbeat trigger endpoint and UI trigger path.
   - Runtime tuned for timeout-heavy free models (quick retries + stall timeout handling).
   - Snapshot-first mutation strategy integrated into agent behavior.

2. Mind delta:
   - Brain decision observer with intent/risk/tool governance.
   - Sacred recall router (route-aware retrieval, graph facts, dreams, memory index, wisdom advisory).
   - Subconscious observer path (separate advisory model with strict fail-open behavior).
   - Episodic pipeline with salience scoring, active forgetting dry-run, and short/long-term index split.

3. Soul delta:
   - Explicit writable identity layer (`SOUL.md`, `IDENTITY.md`, `MOOD.md`) and self-config layer (`THINKING_PROTOCOL.md`).
   - Read-only sacred witness path to prevent identity drift by unsafe mutation.
   - Ritualized constraints for refusal, integrity, and continuity.

4. Vision delta:
   - Local ComfyUI generation.
   - Reflection chain with local heuristic fallback when remote vision is unavailable.
   - Reflection output structured for memory ingestion.

---

## 3) Architectural Layers

### 3.1 Body (Runtime + IO + Control Plane)

Core files:
1. `src/gateway/heartbeat-trigger-http.ts`
2. `ui/src/ui/app.ts`
3. `src/auto-reply/heartbeat.ts`
4. `src/agents/pi-embedded-runner/run.ts`
5. `src/agents/pi-embedded-runner/run/attempt.ts`

Key behavior:
1. Heartbeat can be triggered via `POST /api/heartbeat/trigger`.
2. Trigger returns `accepted/running` if work exceeds HTTP wait, preventing false failure on long cycles.
3. Default heartbeat prompt explicitly allows bounded play and multi-action autonomy in safe scope.
4. Retry behavior is model-aware:
   - generic/openrouter free path: conservative quick retries,
   - MiniMax M2.5 path: aggressive defaults (`33` retries, `250ms` base backoff).
5. Startup stall timeout guard prevents wasting full turn timeout when model boot stalls.

Why this was implemented:
1. Free-model latency/unavailability was causing long dead waits.
2. Operator needed deterministic "system is still alive" semantics.
3. Heartbeat needed to be a real behavior cycle, not only passive "ok" output.

---

### 3.2 Mind (Decision + Recall + Memory Evolution)

Core files:
1. `src/brain/decision.ts`
2. `src/brain/subconscious.ts`
3. `src/brain/episodic-memory.ts`
4. `src/brain/salience.ts`
5. `src/brain/forgetting.ts`
6. `src/brain/episodic-index.ts`
7. `src/brain/wisdom-layer.ts`
8. `src/agents/pi-embedded-runner/run/attempt.ts`

Key behavior:
1. Decision layer classifies intent and risk, then narrows allowed tools.
2. High-risk turns can clamp toolset to zero and force text-only refusal.
3. Autonomous heartbeat turns get an explicit choice contract:
   - generate `PLAY`, `LEARN`, `MAINTAIN`, `NO_OP`,
   - score options,
   - choose one bounded path,
   - explain NO_OP when selected.
4. Recall router is route-aware (identity/project/ritual/creative/general) and uses multiple sources:
   - direct sacred identity path for identity queries,
   - memory index facts,
   - dream capsules,
   - semantic recall search,
   - graph facts.
5. Wisdom Layer is injected as read-only advisory (systems/chaos/karma/complexity heuristics), not as hard controller.
6. Subconscious observer runs as a separate advisory call with strict timeout + fail-open semantics.
7. Episodic memory pipeline:
   - salience scoring,
   - structured journaling,
   - relationship extraction,
   - active forgetting dry-run (observe first, do not delete blindly),
   - episodic index update.

Why this was implemented:
1. Prompt-only autonomy was too brittle; explicit decision structure reduces loops.
2. Raw memory search alone was too slow/inconsistent; route-aware recall improves grounding.
3. Human-like continuity needs both remembering and controlled forgetting pressure.
4. Advisory wisdom gives guidance without removing model agency.

---

### 3.3 Soul (Identity Continuity + Sacred Boundaries)

Core files:
1. `src/brain/autonomy.ts`
2. `src/agents/om-scaffolding.ts`
3. `C:\Users\holyd\.openclaw\workspace\knowledge\sacred\SOUL.md`
4. `C:\Users\holyd\.openclaw\workspace\knowledge\sacred\IDENTITY.md`
5. `C:\Users\holyd\.openclaw\workspace\knowledge\sacred\MOOD.md`
6. `C:\Users\holyd\.openclaw\workspace\knowledge\sacred\THINKING_PROTOCOL.md`

Key behavior:
1. Sandbox mode allows writes inside workspace, but sacred paths are policy-controlled.
2. Explicit L1 writable identity files:
   - `SOUL.md`, `IDENTITY.md`, `MOOD.md`
3. Explicit L2 self-config writable file:
   - `THINKING_PROTOCOL.md`
4. Explicit read-only sacred witness:
   - `David_Akasha.md`

Why this was implemented:
1. Om needs evolving identity, but with bounded mutation surface.
2. Unbounded writes to sacred area risk identity collapse and accidental self-erasure.
3. Structured sacred tiers preserve continuity while still allowing growth.

---

### 3.4 Vision (Creation + Reflection)

Core files:
1. `skills/comfyui-image.js`
2. `skills/image-describe.js`
3. `C:\Users\holyd\.openclaw\openclaw.json` (skill wiring)

Key behavior:
1. Om can generate local images via ComfyUI.
2. Generated images are described/reflected automatically.
3. If remote vision model is unavailable, local heuristic analysis still returns structured reflection:
   - palette clusters,
   - composition/zone cues,
   - edge density signals.

Why this was implemented:
1. Keep creative loop working even without paid APIs.
2. Preserve reflection continuity under degraded network/model conditions.
3. Feed creative artifacts back into memory and self-reflection.

---

## 4) Guardrail Architecture (Unique Safety Spine)

Core files:
1. `src/agents/om-scaffolding.ts`
2. `src/brain/snapshot.ts`
3. `src/agents/pi-tools.ts`

Implemented guard layers:
1. Layer 1 Edit-Guardian:
   - fuzzy fallback when edit targeting is imperfect.
2. Layer 2 Sacred file protection:
   - backup/snapshot before critical writes.
3. Layer 3 Loop detector:
   - blocks repeated non-progressing behavior.
4. Layer 3c Read-brake:
   - blocks repeated same-path read churn.
5. Layer 4 Activity logger:
   - structured run evidence in `OM_ACTIVITY.log`.
6. Refusal-only mode:
   - high-risk prompts force non-tool refusal path.
7. Zone model:
   - red/yellow/green mutation zones with stricter handling in controlled zones.

Snapshot model:
1. L1/L2: file snapshots.
2. L3: git snapshot branch + commit (`om-snapshot-l3-*`).
3. Revert path exists (`revertToSnapshot`) for operational rollback.
4. Fail-open logging: snapshot errors should not crash the agent loop.

Mutation budget:
1. Hard cap was removed by default (OpenClaw-style behavior).
2. Optional cap remains available via `OM_HEARTBEAT_AUTONOMY_MUTATION_BUDGET`.

Why this was implemented:
1. Needed high autonomy without catastrophic writes.
2. Needed reversibility-first policy under experimentation.
3. Needed clear forensic traces when behavior drifts.

---

## 5) Heartbeat and Turn Pipelines

### 5.1 Interactive Turn (high-level flow)

1. Normalize prompt and runtime context.
2. Brain decision observer classifies intent/risk/tool permissions.
3. Inject high-risk guard (if needed).
4. Inject ritual/autonomy contracts (if applicable).
5. Build sacred recall context (route-aware, fail-open).
6. Run subconscious advisory path (timeout + fail-open).
7. Execute model turn.
8. Post-turn memory/continuity updates:
   - episodic write,
   - active forgetting dry-run,
   - episodic index update,
   - energy update.
9. Emit reasoning/evidence events.

### 5.2 Heartbeat Turn (additional behavior)

On heartbeat runs, pipeline adds:
1. autonomous choice contract,
2. dream continuity injection and new capsule append,
3. stricter autonomous mutation accounting (if optional budget enabled),
4. `HEARTBEAT_OK` token stripping so control acknowledgements do not pollute chat output.

Why this was implemented:
1. Heartbeat should act as autonomous life-cycle pulse, not only scheduler ping.
2. Dream and memory continuity should persist across cycles.
3. Chat UX should remain readable despite internal control tokens.

---

## 6) Observability and Verification

Primary evidence channels:
1. `C:\Users\holyd\.openclaw\workspace\OM_ACTIVITY.log`
2. `C:\Users\holyd\.openclaw\workspace\logs\brain\thought-stream.jsonl`
3. `C:\Users\holyd\AppData\Local\Temp\openclaw-gateway.log`

Typical log tags:
1. `[BRAIN-RECALL] SACRED_RECALL`
2. `[BRAIN-FORGETTING] DRY_RUN`
3. `[BRAIN-EPISODIC-INDEX] UPDATED`
4. `[BRAIN-ENERGY] STATE`
5. `[BRAIN-WIDERSTAND] TRIGGER`
6. `[BRAIN-SUBCONSCIOUS] START|OK|OK_FALLBACK|FAIL_OPEN`

Verification scripts:
1. `scripts/verify_recall_routing.ts`
2. `scripts/verify_memory_graph.ts`
3. `scripts/verify_memory_compaction.ts`
4. `scripts/verify_snapshot_system.ts`

Why this was implemented:
1. Need auditable evidence for each architectural claim.
2. Need post-compact recovery without "memory by chat history only".
3. Need deterministic smoke tests for critical continuity behavior.

---

## 7) Explicit Design Intent (Problem -> Decision -> Intended Effect)

1. Problem: free-model instability created long idle waits.
   - Decision: quick timeout retry + startup stall timeout + accepted/running heartbeat semantics.
   - Intended effect: shorter dead time, fewer operator-visible stalls.

2. Problem: identity drift risk under autonomous writes.
   - Decision: sacred tiering (L1/L2/read-only), zone guards, refusal-only mode.
   - Intended effect: continuity-preserving autonomy.

3. Problem: recall quality and grounding were inconsistent.
   - Decision: route-aware sacred recall + graph facts + dreams + wisdom advisory.
   - Intended effect: contextually correct recall with lower hallucination pressure.

4. Problem: purely additive memory leads to noise saturation.
   - Decision: salience scoring + active forgetting dry-run + episodic index.
   - Intended effect: memory quality over memory volume.

5. Problem: autonomy loop can become repetitive.
   - Decision: explicit choice contract including valid NO_OP path.
   - Intended effect: reduced loopiness, more interpretable autonomy decisions.

6. Problem: creative loop breaks when vision APIs are unavailable.
   - Decision: local ComfyUI + local heuristic reflection fallback.
   - Intended effect: continuous creative output under degraded conditions.

---

## 8) Current Gaps and Candidate Improvements

Known open items (already identified in project status docs):
1. Emotional State Machine (`arousal/valence/dominance`) is planned, not yet implemented.
2. Continuity protocol artifact (`CONTINUITY.md`) is planned, not yet implemented.
3. Interests/curiosity artifacts (`INTERESTS.md`, `CURIOSITY_LOG.md`) are planned, not yet implemented.
4. Novelty score exists conceptually, but only partial novelty guard is implemented.
5. Some phase-C/D governance modules remain roadmap-level.

---

## 9) What We Want External AI Review On

Please evaluate:
1. Whether recall-routing design is the right tradeoff between latency and grounding quality.
2. Whether active forgetting dry-run policy should evolve to controlled deletion and under which safety constraints.
3. Whether autonomy choice contract should move from prompt-contract to explicit runtime planner module.
4. Whether sacred tiering and zone guards are sufficient against accidental self-corruption.
5. Whether heartbeat lifecycle should remain single-step bounded or become multi-step with stronger internal planning.
6. Whether creativity architecture needs an explicit originality metric beyond current novelty delta.
7. Whether current fail-open strategy hides too much failure signal and should be balanced with stronger operator alerts.

---

## 10) Practical Notes for External Reviewers

1. Treat this as a living architecture, not a static product snapshot.
2. Some historical docs contain drift; prefer current status files and runtime evidence logs.
3. API keys/secrets are intentionally excluded from this dossier.
4. The highest-fidelity technical truth is in:
   - code paths listed in sections above,
   - `OM_ACTIVITY.log`,
   - verifier scripts.

---

End of dossier.
