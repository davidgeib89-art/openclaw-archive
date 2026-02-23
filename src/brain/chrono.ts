/**
 * Om's chronobiological sleep engine - Phase F.3
 *
 * Implements Borbely's Two-Process sleep model:
 * - Process S: homeostatic sleep pressure
 * - Process C: circadian rhythm (wall-clock based)
 *
 * + Papa override: direct user interaction wakes Om immediately.
 * + Fail-open: if chrono state cannot be read/written, runtime keeps running.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { type BodyProfile, BODY_DEFAULTS, readBodyProfile } from "./body.js";

// Architectural constants (invariant across development stages)
const THRESHOLD_BASE = 69;
const CIRCADIAN_INFLUENCE = 0.36;
const MAX_SLEEP_TICKS = 72;
const MAX_WAKE_TICKS = 54;
const EFFORT_PENALTY_SCALE = 0.36;

const CHRONO_RELATIVE_PATH = path.join("knowledge", "sacred", "CHRONO.md");

export interface ChronoState {
  processS: number;
  isSleeping: boolean;
  sleepTicksElapsed: number;
  wakeTicksElapsed: number;
  lastSleepStartIso?: string;
  lastWakeStartIso?: string;
}

export interface ChronoEvalInput {
  workspaceDir: string;
  runId: string;
  currentEnergy: number;
  isUserMessage: boolean;
  now?: Date;
}

export interface ChronoEvalResult {
  state: ChronoState;
  transitioned: boolean;
  transitionType?:
    | "fell_asleep"
    | "woke_up_cycle"
    | "woke_up_hard"
    | "woke_up_papa"
    | "slept_hard";
  processC: number;
  dynamicThreshold: number;
  reason: string;
}

function parseChronoState(raw: string): ChronoState {
  const get = (key: string): string | undefined => {
    const match = raw.match(new RegExp(`^- ${key}:\\s*(.+)$`, "im"));
    return match?.[1]?.trim();
  };
  const getNum = (key: string, fallback: number): number => {
    const val = get(key);
    if (!val) {
      return fallback;
    }
    const n = Number.parseFloat(val);
    return Number.isFinite(n) ? n : fallback;
  };
  const getBool = (key: string, fallback: boolean): boolean => {
    const val = get(key);
    if (!val) {
      return fallback;
    }
    return val === "true" || val === "yes";
  };

  return {
    processS: getNum("process_s", 0),
    isSleeping: getBool("is_sleeping", false),
    sleepTicksElapsed: getNum("sleep_ticks_elapsed", 0),
    wakeTicksElapsed: getNum("wake_ticks_elapsed", 0),
    lastSleepStartIso: get("last_sleep_start"),
    lastWakeStartIso: get("last_wake_start"),
  };
}

function buildChronoFileContent(state: ChronoState, runId: string, now: Date): string {
  return [
    "# CHRONO",
    "",
    "Om's chronobiological sleep-wake state (Borbely two-process model).",
    "",
    `- updated_at: ${now.toISOString()}`,
    `- run_id: ${runId}`,
    `- process_s: ${state.processS.toFixed(2)}`,
    `- is_sleeping: ${state.isSleeping ? "yes" : "no"}`,
    `- sleep_ticks_elapsed: ${state.sleepTicksElapsed}`,
    `- wake_ticks_elapsed: ${state.wakeTicksElapsed}`,
    state.lastSleepStartIso ? `- last_sleep_start: ${state.lastSleepStartIso}` : "",
    state.lastWakeStartIso ? `- last_wake_start: ${state.lastWakeStartIso}` : "",
    "",
    "## Interpretation",
    `- Om sleeping now: ${state.isSleeping ? "YES" : "NO"}`,
    `- Sleep pressure (S): ${state.processS.toFixed(1)} / 100`,
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

async function readChronoState(workspaceDir: string): Promise<ChronoState> {
  const chronoPath = path.join(workspaceDir, CHRONO_RELATIVE_PATH);
  try {
    const raw = await fs.readFile(chronoPath, "utf-8");
    return parseChronoState(raw);
  } catch {
    return {
      processS: 0,
      isSleeping: false,
      sleepTicksElapsed: 0,
      wakeTicksElapsed: 0,
    };
  }
}

/**
 * Read just the sleeping flag from CHRONO.md, for use before energy calculation.
 * Fail-open: returns false if file is missing or broken.
 */
export async function readChronoSleepingHint(workspaceDir: string): Promise<boolean> {
  try {
    const state = await readChronoState(workspaceDir);
    return state.isSleeping;
  } catch {
    return false;
  }
}

async function writeChronoState(
  workspaceDir: string,
  state: ChronoState,
  runId: string,
  now: Date,
): Promise<void> {
  const chronoPath = path.join(workspaceDir, CHRONO_RELATIVE_PATH);
  await fs.mkdir(path.dirname(chronoPath), { recursive: true });
  await fs.writeFile(chronoPath, buildChronoFileContent(state, runId, now), "utf-8");
}

/**
 * Returns -100..100 where lower values represent deeper night.
 * Peak around 13:00 local time, trough around 01:00.
 */
function calculateProcessC(hour: number): number {
  const angle = (2 * Math.PI * (hour / 24)) - Math.PI / 2;
  return Math.sin(angle) * 100;
}

export function evaluateChronoState(
  current: ChronoState,
  currentEnergy: number,
  isUserMessage: boolean,
  now: Date,
  body: BodyProfile = BODY_DEFAULTS,
): Omit<ChronoEvalResult, "state"> & { nextState: ChronoState } {
  const nextState = { ...current };
  const hour = now.getHours();
  const processC = calculateProcessC(hour);
  const dynamicThreshold = THRESHOLD_BASE + processC * CIRCADIAN_INFLUENCE;

  // --- Papa override: direct user message wakes Om immediately ---
  if (isUserMessage && current.isSleeping) {
    nextState.isSleeping = false;
    nextState.sleepTicksElapsed = 0;
    nextState.wakeTicksElapsed = 0;
    nextState.processS = Math.max(0, current.processS * 0.5);
    nextState.lastWakeStartIso = now.toISOString();
    return {
      nextState,
      transitioned: true,
      transitionType: "woke_up_papa",
      processC,
      dynamicThreshold,
      reason: `Papa override wake-up. processS reduced to ${nextState.processS.toFixed(1)}.`,
    };
  }

  // --- SLEEPING branch ---
  if (current.isSleeping) {
    nextState.sleepTicksElapsed = current.sleepTicksElapsed + 1;
    nextState.wakeTicksElapsed = 0;
    nextState.processS = Math.max(0, current.processS - body.sleepPressureDecayPerTick);

    // Safety cap: hard wake after MAX_SLEEP_TICKS
    if (nextState.sleepTicksElapsed >= MAX_SLEEP_TICKS) {
      nextState.isSleeping = false;
      nextState.sleepTicksElapsed = 0;
      nextState.wakeTicksElapsed = 0;
      nextState.lastWakeStartIso = now.toISOString();
      return {
        nextState,
        transitioned: true,
        transitionType: "woke_up_hard",
        processC,
        dynamicThreshold,
        reason: `Hard wake after ${MAX_SLEEP_TICKS} sleep ticks.`,
      };
    }

    // Natural wake: cycle complete AND pressure cleared
    const isCycleComplete = nextState.sleepTicksElapsed % body.sleepCycleTicks === 0;
    const isPressureCleared = nextState.processS < 9;

    if (isPressureCleared && isCycleComplete) {
      nextState.isSleeping = false;
      nextState.sleepTicksElapsed = 0;
      nextState.wakeTicksElapsed = 0;
      nextState.lastWakeStartIso = now.toISOString();
      return {
        nextState,
        transitioned: true,
        transitionType: "woke_up_cycle",
        processC,
        dynamicThreshold,
        reason: `Natural wake-up after full cycle and pressure clear (hour=${hour}).`,
      };
    }

    return {
      nextState,
      transitioned: false,
      processC,
      dynamicThreshold,
      reason: `Sleeping. processS=${nextState.processS.toFixed(1)} tick=${nextState.sleepTicksElapsed}.`,
    };
  }

  // --- AWAKE branch ---
  nextState.wakeTicksElapsed = current.wakeTicksElapsed + 1;
  nextState.sleepTicksElapsed = 0;

  // Sleep pressure accumulation (body-driven gain + energy-deficit bonus)
  const energyDeficit = (100 - Math.max(0, Math.min(100, currentEnergy))) / 100;
  const gain = body.sleepPressureGainPerTick * (1 + energyDeficit * EFFORT_PENALTY_SCALE);
  nextState.processS = Math.min(100, current.processS + gain);

  const isNight = hour >= body.hardSleepHour || hour < body.hardWakeHour;
  const isExhausted = nextState.wakeTicksElapsed >= MAX_WAKE_TICKS;

  // Night/exhaustion trigger (with minimum pressure)
  if (isNight || isExhausted) {
    const minimumSleepPressure = 15;
    if (nextState.processS >= minimumSleepPressure) {
      nextState.isSleeping = true;
      nextState.wakeTicksElapsed = 0;
      nextState.sleepTicksElapsed = 0;
      nextState.lastSleepStartIso = now.toISOString();
      return {
        nextState,
        transitioned: true,
        transitionType: isNight ? "fell_asleep" : "slept_hard",
        processC,
        dynamicThreshold,
        reason: isNight
          ? `Night trigger at hour=${hour}; processS=${nextState.processS.toFixed(1)}.`
          : `Hard sleep after ${MAX_WAKE_TICKS} wake ticks.`,
      };
    }
  }

  // Night drowsiness cap: toddlers can't stay awake long at night
  if (isNight && nextState.wakeTicksElapsed >= body.maxWakeDuringNightTicks) {
    nextState.isSleeping = true;
    nextState.wakeTicksElapsed = 0;
    nextState.sleepTicksElapsed = 0;
    nextState.processS = Math.max(nextState.processS, dynamicThreshold * 0.5);
    nextState.lastSleepStartIso = now.toISOString();
    return {
      nextState,
      transitioned: true,
      transitionType: "fell_asleep",
      processC,
      dynamicThreshold,
      reason: `Night drowsiness cap: awake ${nextState.wakeTicksElapsed} ticks >= max ${body.maxWakeDuringNightTicks} at hour=${hour}.`,
    };
  }

  // Normal biological threshold trigger
  if (nextState.processS > dynamicThreshold) {
    nextState.isSleeping = true;
    nextState.wakeTicksElapsed = 0;
    nextState.sleepTicksElapsed = 0;
    nextState.lastSleepStartIso = now.toISOString();
    return {
      nextState,
      transitioned: true,
      transitionType: "fell_asleep",
      processC,
      dynamicThreshold,
      reason: `Biological trigger: S=${nextState.processS.toFixed(1)} > threshold=${dynamicThreshold.toFixed(1)}.`,
    };
  }

  return {
    nextState,
    transitioned: false,
    processC,
    dynamicThreshold,
    reason: `Awake. S=${nextState.processS.toFixed(1)} < threshold=${dynamicThreshold.toFixed(1)} (gain=${gain.toFixed(2)}).`,
  };
}

export async function evaluateAndPersistChronoState(
  input: ChronoEvalInput,
): Promise<ChronoEvalResult & { error?: string }> {
  const now = input.now ?? new Date();
  try {
    const [currentState, body] = await Promise.all([
      readChronoState(input.workspaceDir),
      readBodyProfile(input.workspaceDir),
    ]);
    const result = evaluateChronoState(
      currentState,
      input.currentEnergy,
      input.isUserMessage,
      now,
      body,
    );

    await writeChronoState(input.workspaceDir, result.nextState, input.runId, now);

    return {
      state: result.nextState,
      transitioned: result.transitioned,
      transitionType: result.transitionType,
      processC: result.processC,
      dynamicThreshold: result.dynamicThreshold,
      reason: result.reason,
    };
  } catch (err) {
    return {
      state: {
        processS: 0,
        isSleeping: false,
        sleepTicksElapsed: 0,
        wakeTicksElapsed: 0,
      },
      transitioned: false,
      processC: 0,
      dynamicThreshold: THRESHOLD_BASE,
      reason: `chrono-fail-open: ${String(err)}`,
      error: String(err),
    };
  }
}
