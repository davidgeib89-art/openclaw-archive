import fs from "node:fs/promises";
import path from "node:path";

const DEFIBRILLATOR_MARKER_RELATIVE_PATH = "logs/brain/defibrillator.json";
const DEFAULT_DEFIBRILLATOR_BEATS = 3;

export const DEFIBRILLATOR_BASE_TEMPERATURE = 0.9;

export type DefibrillatorState = {
  active: boolean;
  remainingBeats: number;
  totalBeats: number | null;
  deactivated?: boolean;
};

type DefibrillatorFilePayload = {
  remainingBeats: number;
  totalBeats: number | null;
};

function resolveDefibrillatorPath(workspaceDir: string): string {
  return path.resolve(workspaceDir, DEFIBRILLATOR_MARKER_RELATIVE_PATH);
}

function coerceBeatCount(value: unknown): number | null {
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

function parseDefibrillatorPayload(raw: string): DefibrillatorFilePayload | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === "number") {
      const remaining = coerceBeatCount(parsed);
      if (remaining === null) {
        return null;
      }
      return { remainingBeats: remaining, totalBeats: remaining };
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const remaining =
        coerceBeatCount(record.remainingBeats) ??
        coerceBeatCount(record.remaining) ??
        coerceBeatCount(record.beatsRemaining) ??
        coerceBeatCount(record.heartbeatsRemaining) ??
        coerceBeatCount(record.beats);
      if (remaining === null) {
        return null;
      }
      const total =
        coerceBeatCount(record.totalBeats) ??
        coerceBeatCount(record.total) ??
        coerceBeatCount(record.beatsTotal);
      return {
        remainingBeats: remaining,
        totalBeats: total ?? remaining,
      };
    }
  } catch {
    // fall through to parse as plain integer
  }

  const fallback = coerceBeatCount(trimmed);
  if (fallback === null) {
    return null;
  }
  return { remainingBeats: fallback, totalBeats: fallback };
}

async function writeDefibrillatorPayload(
  markerPath: string,
  payload: DefibrillatorFilePayload,
): Promise<void> {
  await fs.mkdir(path.dirname(markerPath), { recursive: true });
  await fs.writeFile(markerPath, JSON.stringify(payload, null, 2), "utf-8");
}

export async function readDefibrillatorState(params: {
  workspaceDir: string;
}): Promise<DefibrillatorState> {
  const markerPath = resolveDefibrillatorPath(params.workspaceDir);
  try {
    const raw = await fs.readFile(markerPath, "utf-8");
    const parsed = parseDefibrillatorPayload(raw);
    if (!parsed) {
      return { active: false, remainingBeats: 0, totalBeats: null };
    }
    const remainingBeats = parsed.remainingBeats;
    return {
      active: remainingBeats > 0,
      remainingBeats,
      totalBeats: parsed.totalBeats ?? remainingBeats,
    };
  } catch {
    return { active: false, remainingBeats: 0, totalBeats: null };
  }
}

export async function activateDefibrillator(params: {
  workspaceDir: string;
  beats: number;
}): Promise<void> {
  try {
    const beats = Number.isFinite(params.beats)
      ? Math.max(0, Math.floor(params.beats))
      : 0;
    if (beats <= 0) {
      return;
    }

    const state = await readDefibrillatorState({
      workspaceDir: params.workspaceDir,
    });
    if (state.active && state.remainingBeats >= beats) {
      return;
    }

    const markerPath = resolveDefibrillatorPath(params.workspaceDir);
    await writeDefibrillatorPayload(markerPath, {
      remainingBeats: beats,
      totalBeats: beats,
    });
  } catch {
    // fail-open
  }
}

export async function consumeDefibrillatorBeat(params: {
  workspaceDir: string;
  defaultBeats?: number;
}): Promise<DefibrillatorState> {
  const markerPath = resolveDefibrillatorPath(params.workspaceDir);
  const state = await readDefibrillatorState({ workspaceDir: params.workspaceDir });
  if (!state.active) {
    return state;
  }

  const nextRemaining = Math.max(0, state.remainingBeats - 1);
  const totalBeats =
    state.totalBeats ??
    Math.max(state.remainingBeats, params.defaultBeats ?? DEFAULT_DEFIBRILLATOR_BEATS);
  const deactivated = nextRemaining === 0;

  try {
    if (deactivated) {
      await fs.rm(markerPath, { force: true });
    } else {
      await writeDefibrillatorPayload(markerPath, {
        remainingBeats: nextRemaining,
        totalBeats,
      });
    }
  } catch {
    // fail-open: keep current run state without throwing
  }

  return {
    active: true,
    remainingBeats: nextRemaining,
    totalBeats,
    deactivated,
  };
}

export async function isDefibrillatorActive(params: {
  workspaceDir: string;
}): Promise<boolean> {
  const state = await readDefibrillatorState({ workspaceDir: params.workspaceDir });
  return state.active;
}
