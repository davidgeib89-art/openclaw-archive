import fs from "node:fs/promises";
import path from "node:path";

export type RefractoryState = {
  consecutiveMinTempBeats: number;
  lastUpdatedAt: string;
};

export const REFRACTORY_COUNTER_RELATIVE_PATH = "logs/brain/refractory-state.json";
export const AUTO_REFRACTORY_THRESHOLD = 3;
export const AUTO_REFRACTORY_BEATS = 1;
export const NEURO_COHERENCE_MIN_TEMPERATURE_EPSILON = 0.005;

function resolveRefractoryPath(workspaceDir: string): string {
  return path.resolve(workspaceDir, REFRACTORY_COUNTER_RELATIVE_PATH);
}

function getEpochIso(): string {
  return new Date(0).toISOString();
}

function defaultRefractoryState(): RefractoryState {
  return {
    consecutiveMinTempBeats: 0,
    lastUpdatedAt: getEpochIso(),
  };
}

function coerceCounter(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }
  return null;
}

function coerceTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function parseRefractoryState(raw: string): RefractoryState {
  const trimmed = raw.trim();
  if (!trimmed) {
    return defaultRefractoryState();
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") {
      return defaultRefractoryState();
    }
    const record = parsed as Record<string, unknown>;
    const counter =
      coerceCounter(record.consecutiveMinTempBeats) ??
      coerceCounter(record.consecutiveBeats) ??
      coerceCounter(record.counter) ??
      0;
    const timestamp =
      coerceTimestamp(record.lastUpdatedAt) ??
      coerceTimestamp(record.updatedAt) ??
      getEpochIso();
    return {
      consecutiveMinTempBeats: counter,
      lastUpdatedAt: timestamp,
    };
  } catch {
    return defaultRefractoryState();
  }
}

async function readRefractoryStateUnsafe(workspaceDir: string): Promise<RefractoryState> {
  const markerPath = resolveRefractoryPath(workspaceDir);
  let raw = "";
  try {
    raw = await fs.readFile(markerPath, "utf-8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") {
      return defaultRefractoryState();
    }
    throw error;
  }
  return parseRefractoryState(raw);
}

async function writeRefractoryStateUnsafe(
  workspaceDir: string,
  state: RefractoryState,
): Promise<void> {
  const markerPath = resolveRefractoryPath(workspaceDir);
  try {
    await fs.mkdir(path.dirname(markerPath), { recursive: true });
  } catch (error) {
    throw error;
  }
  try {
    await fs.writeFile(markerPath, JSON.stringify(state, null, 2), "utf-8");
  } catch (error) {
    throw error;
  }
}

export async function readRefractoryState(params: {
  workspaceDir: string;
}): Promise<RefractoryState> {
  try {
    return await readRefractoryStateUnsafe(params.workspaceDir);
  } catch {
    return defaultRefractoryState();
  }
}

export async function writeRefractoryState(params: {
  workspaceDir: string;
  state: RefractoryState;
}): Promise<void> {
  try {
    await writeRefractoryStateUnsafe(params.workspaceDir, params.state);
  } catch {
    // fail-open
  }
}

export async function tickRefractoryCounter(params: {
  workspaceDir: string;
  currentTemperature: number;
}): Promise<{ shouldFire: boolean; newState: RefractoryState }> {
  let currentState = defaultRefractoryState();
  try {
    currentState = await readRefractoryStateUnsafe(params.workspaceDir);
  } catch {
    return { shouldFire: false, newState: currentState };
  }

  const minTemperature = 0.1;
  const minThreshold =
    minTemperature + NEURO_COHERENCE_MIN_TEMPERATURE_EPSILON;
  const shouldIncrement =
    Number.isFinite(params.currentTemperature) &&
    params.currentTemperature <= minThreshold;
  const nextCounter = shouldIncrement
    ? currentState.consecutiveMinTempBeats + 1
    : 0;
  const shouldFire = nextCounter >= AUTO_REFRACTORY_THRESHOLD;
  const nextState: RefractoryState = {
    consecutiveMinTempBeats: shouldFire ? 0 : nextCounter,
    lastUpdatedAt: new Date().toISOString(),
  };

  try {
    await writeRefractoryStateUnsafe(params.workspaceDir, nextState);
  } catch {
    return { shouldFire: false, newState: currentState };
  }

  return { shouldFire, newState: nextState };
}
