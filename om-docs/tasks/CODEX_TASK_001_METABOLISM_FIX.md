# CODEX TASK 001: Fix Energy Metabolism — Allow Øm to Get Tired

## Context

You are working on **OpenClaw**, an AI scaffolding framework. The file `src/brain/energy.ts` manages the energy level of an AI entity called "Øm". Energy determines Øm's behavior mode:
- `dream` (level < 20): Øm rests, reflects, writes to DREAMS.md
- `balanced` (level 20–80): Normal operation
- `initiative` (level > 80): High energy, proactive behavior

## The Bug

Øm's energy **never drops below 80**. He can never get tired. The root cause is in `calculateEnergy()`:

```typescript
// Line 132-136 in src/brain/energy.ts
// Homeostasis: Regenerate energy when resting or doing very little
if (toolStats.total <= 1) {
  const regenBoost = Math.floor(Math.random() * 10) + 9; // +9 to +18 points
  blended += regenBoost;
}
```

**Problem:** When Øm does very little (≤1 tool call per heartbeat), the system gives him a massive +9 to +18 energy boost. But Øm almost ALWAYS uses only 1-2 tools per heartbeat (typically `read AGENDA.md` + `tts`). So the regen fires every cycle and immediately cancels out any energy drain. Result: Energy oscillates between 82-100 forever, never reaching `balanced` or `dream` mode.

## The Fix

The RegenBoost should only fire when **real wall-clock time** has passed since the last energy update — meaning Øm was actually resting, not just doing minimal work in a rapid heartbeat loop.

### Requirements

1. **Read the `updated_at` timestamp** from the existing `ENERGY.md` file (already written by `updateEnergy()`). The format is ISO 8601: `- updated_at: 2026-02-22T04:45:26.166Z`

2. **Calculate elapsed minutes** between the previous `updated_at` and `now`.

3. **Only apply RegenBoost if elapsed >= 30 minutes.** If Øm just had a heartbeat 10 minutes ago and did nothing, that's not "resting" — that's monotony. No boost.

4. **Scale the RegenBoost by elapsed time** (optional improvement): Instead of a flat +9 to +18, scale it:
   - 30-60 min rest → small boost (+3 to +9)
   - 60-120 min rest → medium boost (+6 to +12)  
   - 120+ min rest → full boost (+9 to +18)

5. **Add natural energy decay**: When `toolStats.total <= 1` and elapsed < 30 min, apply a small **drain** of -3 to -6 instead of a boost. Doing nothing repeatedly should slowly tire Øm out — like a human getting bored and sleepy from inactivity.

### Implementation Steps

1. **Add a `parseUpdatedAt()` function** next to the existing `parsePreviousLevel()` function (~line 67). It should parse the `updated_at` field from the ENERGY.md raw content:
   ```typescript
   function parseUpdatedAt(raw: string): Date | undefined {
     const match = raw.match(/^- updated_at:\s*(.+)$/im);
     if (!match?.[1]) return undefined;
     const date = new Date(match[1].trim());
     return Number.isFinite(date.getTime()) ? date : undefined;
   }
   ```

2. **Modify `CalculateEnergyInput`** to include an optional `previousUpdatedAt` and `now`:
   ```typescript
   export type CalculateEnergyInput = {
     toolStats?: { total?: number; successful?: number; failed?: number };
     previousLevel?: number;
     previousUpdatedAt?: Date;  // ← ADD THIS
     now?: Date;                // ← ADD THIS
   };
   ```

3. **Modify `calculateEnergy()`** to use elapsed time for regen logic:
   ```typescript
   // Replace the existing regenBoost block (lines 132-136) with:
   if (toolStats.total <= 1) {
     const now = input.now ?? new Date();
     const elapsedMs = input.previousUpdatedAt
       ? now.getTime() - input.previousUpdatedAt.getTime()
       : 0;
     const elapsedMinutes = elapsedMs / 60_000;

     if (elapsedMinutes >= 30) {
       // True rest: scale boost by rest duration
       const restTier = elapsedMinutes >= 120 ? 3 : elapsedMinutes >= 60 ? 2 : 1;
       const baseBoost = restTier * 3; // 3, 6, or 9
       const regenBoost = baseBoost + Math.floor(Math.random() * (restTier * 3 + 1));
       blended += regenBoost;
     } else {
       // Monotony drain: doing nothing repeatedly should tire Øm out
       const monotonyDrain = Math.floor(Math.random() * 4) + 3; // -3 to -6
       blended -= monotonyDrain;
     }
   }
   ```

4. **Modify `updateEnergy()`** to read and pass `previousUpdatedAt`:
   In the `updateEnergy()` function (~line 233), after reading `previousLevel`, also parse `previousUpdatedAt`:
   ```typescript
   let previousLevel: number | undefined;
   let previousUpdatedAt: Date | undefined;  // ← ADD
   try {
     const existingEnergy = await fs.readFile(energyPath, "utf-8");
     previousLevel = parsePreviousLevel(existingEnergy);
     previousUpdatedAt = parseUpdatedAt(existingEnergy);  // ← ADD
   } catch {
     previousLevel = undefined;
     previousUpdatedAt = undefined;  // ← ADD
   }

   const snapshot = calculateEnergy({
     toolStats: params.toolStats,
     previousLevel,
     previousUpdatedAt,  // ← ADD
     now,                // ← ADD (already defined as `params.now ?? new Date()`)
   });
   ```

5. **Update tests** in `src/brain/energy.test.ts`:
   - Add a test that verifies: when `previousUpdatedAt` is 5 minutes ago and `toolStats.total === 0`, energy should DECREASE (monotony drain).
   - Add a test that verifies: when `previousUpdatedAt` is 60 minutes ago and `toolStats.total === 0`, energy should INCREASE (true regen).
   - Add a test that verifies: when `previousUpdatedAt` is undefined (first run), no regen boost is applied.

## Files to Modify

- `c:\Users\holyd\openclaw\src\brain\energy.ts` — Main changes
- `c:\Users\holyd\openclaw\src\brain\energy.test.ts` — Test updates

## Verification

After your changes, run:
```
cd c:\Users\holyd\openclaw
npx vitest run src/brain/energy.test.ts
```

All tests must pass. If existing tests break due to the new regen logic, update them to account for the new behavior (the old unconditional +9-18 regen is gone).

## Important Constraints

- Do NOT change the `resolveMode()` thresholds (dream < 20, initiative > 80)
- Do NOT change the `buildEnergyFileContent()` format — other systems depend on it
- Do NOT change the 3-6-9 Magic blending formula
- Keep the Biological Noise (entropy) unchanged
- The `updated_at` field is already written by `buildEnergyFileContent()`, you just need to read it back
