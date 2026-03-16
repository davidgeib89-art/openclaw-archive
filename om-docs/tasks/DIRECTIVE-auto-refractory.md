# Directive: Auto-Refractory Temperature Damping (Safety Gate)

**Issued by:** Lead Architect (CEO)
**Issued:** 2026-03-16
**For:** Codex (Om Builder)
**Priority:** HIGH — safety prerequisite before Phase H.4 and 50-beat live evaluation
**Source issue:** DAVA-3

---

## Background

The Gibbs-Helmholtz engine uses `heartbeatTemperature` (T) in its ΔG formula.
When arousal is high, `mapArousalToDynamicTemperature` drives T toward `NEURO_COHERENCE_MIN_TEMPERATURE = 0.1`.
At low T, the ΔG denominator amplifies distortion → the Gibbs engine accelerates eruptions →
bad responses increase stress → arousal rises further.

This is a **positive feedback loop** (documented in PROJECT_AUDIT.md §2.3).
Without autonomous damping, Om can spiral into a locked state with no recovery.

The **neurological analogy** is the refractory period after a seizure: the nervous system
enforces a mandatory recovery window during which re-excitation cannot occur.

---

## What to Build

### 1. New module: `src/brain/refractory.ts`

Manages a persistent refractory counter: how many consecutive heartbeats has
`heartbeatTemperature` been at or below `NEURO_COHERENCE_MIN_TEMPERATURE`.

```
FILE: src/brain/refractory.ts
```

**Types:**
```typescript
export type RefractoryState = {
  consecutiveMinTempBeats: number;
  lastUpdatedAt: string; // ISO string
};
```

**Constants (export all for testability):**
```typescript
export const REFRACTORY_COUNTER_RELATIVE_PATH = "logs/brain/refractory-state.json";
export const AUTO_REFRACTORY_THRESHOLD = 3; // consecutive min-temp beats before auto-defibrillator
export const AUTO_REFRACTORY_BEATS = 1;     // defibrillator beats injected per auto-trigger
export const NEURO_COHERENCE_MIN_TEMPERATURE_EPSILON = 0.005; // float tolerance
```

**Functions (all fail-open — never throw):**

```typescript
/**
 * Reads the current refractory counter from disk.
 * Returns { consecutiveMinTempBeats: 0, lastUpdatedAt: epoch } if file absent or corrupt.
 */
export async function readRefractoryState(params: {
  workspaceDir: string;
}): Promise<RefractoryState>

/**
 * Writes (overwrites) the refractory counter to disk.
 * Creates parent directories if needed. Fail-open.
 */
export async function writeRefractoryState(params: {
  workspaceDir: string;
  state: RefractoryState;
}): Promise<void>

/**
 * Evaluates whether to increment or reset the refractory counter.
 * - If temperature <= NEURO_COHERENCE_MIN_TEMPERATURE + epsilon: increment counter.
 * - Otherwise: reset counter to 0.
 * - If counter reaches AUTO_REFRACTORY_THRESHOLD: returns shouldFire=true.
 * - After firing, counter is reset to 0 (written to disk).
 *
 * Always writes new state to disk. Fail-open: any I/O error returns
 * { shouldFire: false, newState: currentState } without throwing.
 */
export async function tickRefractoryCounter(params: {
  workspaceDir: string;
  currentTemperature: number;
}): Promise<{ shouldFire: boolean; newState: RefractoryState }>
```

### 2. New export in `src/brain/defibrillator.ts`

Add a public function to activate the defibrillator programmatically
(currently only the file-write path is private):

```typescript
/**
 * Writes the defibrillator marker file to activate it for `beats` heartbeats.
 * Idempotent: if already active with more remaining beats, does nothing.
 * Fail-open.
 */
export async function activateDefibrillator(params: {
  workspaceDir: string;
  beats: number;
}): Promise<void>
```

Implementation: call `writeDefibrillatorPayload` (already exists, just private — make
the new public function call it). Do NOT activate if already active with `remainingBeats >= beats`.

### 3. Integration in `src/agents/pi-embedded-runner/run/attempt.ts`

**Location:** After `heartbeatTemperature` is set in the `else` branch (non-defibrillator path,
around line 4620), inside the existing `try` block, before `applyExtraParamsToAgent` returns.
Specifically, after `heartbeatTemperature = dynamicTemperature;` is assigned.

**New logic (add after line ~4620):**

```typescript
// H.3 Auto-Refractory: if temperature has been locked at minimum for
// AUTO_REFRACTORY_THRESHOLD consecutive beats, fire a single-beat
// defibrillator reset to break the positive feedback loop.
try {
  const refractoryResult = await tickRefractoryCounter({
    workspaceDir: effectiveWorkspace,
    currentTemperature: dynamicTemperature,
  });
  if (refractoryResult.shouldFire) {
    await activateDefibrillator({
      workspaceDir: effectiveWorkspace,
      beats: AUTO_REFRACTORY_BEATS,
    });
    emitBrainReasoningEvent(params, {
      phase: "autonomy",
      label: "AUTO_REFRACTORY",
      summary: `auto-refractory triggered after ${AUTO_REFRACTORY_THRESHOLD} consecutive min-temperature beats — defibrillator injected for ${AUTO_REFRACTORY_BEATS} beat`,
      source: "proto33-h3r.auto-refractory",
    });
  }
} catch (refractoryErr) {
  emitBrainReasoningEvent(params, {
    phase: "autonomy",
    label: "AUTO_REFRACTORY",
    summary: `fail-open: ${String(refractoryErr)}`,
    source: "proto33-h3r.auto-refractory",
  });
}
```

**Import:** Add `tickRefractoryCounter, AUTO_REFRACTORY_BEATS, AUTO_REFRACTORY_THRESHOLD`
from `"../../../brain/refractory.js"` and `activateDefibrillator` from
`"../../../brain/defibrillator.js"` in the brain imports section.

---

## Test Requirements

Create `src/brain/refractory.test.ts`. Cover:

1. **Counter increments** when temperature is at min (`NEURO_COHERENCE_MIN_TEMPERATURE`).
2. **Counter resets** when temperature rises above min + epsilon.
3. **`shouldFire = false`** when count < `AUTO_REFRACTORY_THRESHOLD`.
4. **`shouldFire = true`** at exactly `AUTO_REFRACTORY_THRESHOLD` consecutive min-temp beats.
5. **Counter resets after fire** (next call starts from 0 again).
6. **Fail-open**: simulate `fs.readFile` failure — `tickRefractoryCounter` returns
   `{ shouldFire: false }` without throwing.
7. **`activateDefibrillator`** writes the defibrillator file with correct `remainingBeats`.
8. **`activateDefibrillator`** does NOT overwrite an already-active defibrillator with
   more remaining beats.

Run: `pnpm test src/brain/refractory.test.ts`
All tests must pass. No TypeScript errors (`pnpm tsgo`).

---

## Invariants (do not violate)

- **Fail-open is mandatory**: every new `await` call must be wrapped in try/catch.
  The heartbeat loop must not be stoppable by refractory logic.
- **Never activate the defibrillator if it is already active** (idempotent guard).
- **The refractory counter file uses the same `workspaceDir`** as all other brain files.
- **Do not hard-code any paths** — always resolve via `path.resolve(workspaceDir, REFRACTORY_COUNTER_RELATIVE_PATH)`.
- **All new constants must be exported** from `refractory.ts` for test access.
- **Commit style:** `Brain: add auto-refractory temperature damping (H.3 safety gate)`
  with `Co-Authored-By: Paperclip <noreply@paperclip.ing>` in the commit message.
  Use `scripts/committer` — do not manually `git add`/`git commit`.

---

## Definition of Done

- [ ] `src/brain/refractory.ts` exists with all 3 functions and 4 constants exported
- [ ] `activateDefibrillator` exported from `src/brain/defibrillator.ts`
- [ ] `attempt.ts` calls `tickRefractoryCounter` + `activateDefibrillator` in the correct location
- [ ] `src/brain/refractory.test.ts` has all 8 test cases passing
- [ ] `pnpm tsgo` clean
- [ ] `pnpm test src/brain/refractory.test.ts` passes
- [ ] Committed with correct message and co-author tag
