import fs from "node:fs/promises";
import path from "node:path";
import { omLog } from "../agents/om-scaffolding.js";
import { type BodyProfile, BODY_DEFAULTS, readBodyProfile } from "./body.js";

const MOOD_RELATIVE_PATH = path.join("knowledge", "sacred", "MOOD.md");
const ENERGY_RELATIVE_PATH = path.join("knowledge", "sacred", "ENERGY.md");
const MAX_TOOL_LOAD_FOR_DRAIN = 6;
const MIN_ENERGY = 0;
const MAX_ENERGY = 100;
const BREATH_CYCLE_LENGTH = 18;

export type EnergyMode = "dream" | "balanced" | "initiative";
export type BreathPhase = "inhale" | "hold" | "exhale";

export type EnergySnapshot = {
  level: number;
  mode: EnergyMode;
  dreamMode: boolean;
  suggestOwnTasks: boolean;
  stagnationLevel: number;
  heartbeatCount: number;
  breathPhase: BreathPhase;
  components: {
    successRate: number;
    toolLoad: number;
    blended: number;
  };
  toolStats: {
    total: number;
    successful: number;
    failed: number;
  };
};

export type CalculateEnergyInput = {
  toolStats?: {
    total?: number;
    successful?: number;
    failed?: number;
  };
  previousLevel?: number;
  previousStagnationLevel?: number;
  previousUpdatedAt?: Date;
  previousHeartbeatCount?: number;
  subconsciousCharge?: number;
  repetitionPressure?: number;
  now?: Date;
};

export type UpdateEnergyParams = {
  workspaceDir: string;
  runId: string;
  sessionKey?: string;
  toolStats?: {
    total?: number;
    successful?: number;
    failed?: number;
  };
  subconsciousCharge?: number;
  repetitionPressure?: number;
  now?: Date;
  previousStagnationLevel?: number;
  /** Whether Om is currently sleeping (from chrono.ts). Used for energy-chrono coupling. */
  isSleeping?: boolean;
};

export type EnergyStateHint = {
  level: number;
  mode: EnergyMode;
  dreamMode: boolean;
  suggestOwnTasks: boolean;
  stagnationLevel: number;
  path: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toPercent(value: number): number {
  return Math.round(clamp(value, 0, 1) * 100);
}

function parsePreviousLevel(raw: string): number | undefined {
  const match = raw.match(/^- level:\s*(\d{1,3})\s*$/im);
  if (!match?.[1]) {
    return undefined;
  }
  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return clamp(parsed, MIN_ENERGY, MAX_ENERGY);
}

function parseUpdatedAt(raw: string): Date | undefined {
  const match = raw.match(/^- updated_at:\s*(.+)$/im);
  if (!match?.[1]) {
    return undefined;
  }
  const parsed = new Date(match[1].trim());
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function parseHeartbeatCount(raw: string): number | undefined {
  const match = raw.match(/^- heartbeat_count:\s*(\d+)\s*$/im);
  if (!match?.[1]) {
    return undefined;
  }
  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

function parseStagnationLevel(raw: string): number | undefined {
  const match = raw.match(/^- stagnation_level:\s*(\d{1,3})\s*$/im);
  if (!match?.[1]) {
    return undefined;
  }
  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return clamp(parsed, MIN_ENERGY, MAX_ENERGY);
}

function parseMode(raw: string): EnergyMode | undefined {
  const match = raw.match(/^- mode:\s*(dream|balanced|initiative)\s*$/im);
  if (!match?.[1]) {
    return undefined;
  }
  const mode = match[1].toLowerCase();
  if (mode === "dream" || mode === "balanced" || mode === "initiative") {
    return mode;
  }
  return undefined;
}

function parseYesNoFlag(raw: string, key: "dream_mode" | "suggest_own_tasks"): boolean | undefined {
  const match = raw.match(new RegExp(`^- ${key}:\\s*(yes|no)\\s*$`, "im"));
  if (!match?.[1]) {
    return undefined;
  }
  return match[1].toLowerCase() === "yes";
}

function resolveMode(level: number): EnergyMode {
  if (level < 20) {
    return "dream";
  }
  if (level > 80) {
    return "initiative";
  }
  return "balanced";
}

function normalizeToolStats(input: CalculateEnergyInput["toolStats"]): {
  total: number;
  successful: number;
  failed: number;
} {
  const totalRaw = Math.max(0, Math.floor(input?.total ?? 0));
  const failedRaw = Math.max(0, Math.floor(input?.failed ?? 0));
  const successfulRaw = Math.max(0, Math.floor(input?.successful ?? totalRaw - failedRaw));
  const total = Math.max(totalRaw, successfulRaw + failedRaw);
  const failed = Math.min(failedRaw, total);
  const successful = Math.min(successfulRaw, total - failed);
  return { total, successful, failed };
}

export function calculateEnergy(input: CalculateEnergyInput): EnergySnapshot {
  const toolStats = normalizeToolStats(input.toolStats);
  const successRate = toolStats.total > 0 ? toPercent(toolStats.successful / toolStats.total) : 90;
  const loadRatio = clamp(toolStats.total / MAX_TOOL_LOAD_FOR_DRAIN, 0, 1);
  const toolLoad = toPercent(1 - loadRatio);

  const blendedRaw = successRate * (2 / 3) + toolLoad * (1 / 3); // 3-6-9 Magic
  let blended = Math.round(blendedRaw);

  // Homeostasis: Only reward true rest (elapsed wall-clock time), not repetitive low-action loops.
  const now = input.now ?? new Date();
  const elapsedMs = input.previousUpdatedAt
    ? Math.max(0, now.getTime() - input.previousUpdatedAt.getTime())
    : undefined;
  const elapsedMinutes = elapsedMs === undefined ? undefined : elapsedMs / 60_000;

  if (toolStats.total <= 1) {
    if (elapsedMinutes !== undefined && elapsedMinutes >= 30) {
      // True rest: scale regeneration by rest duration.
      const restTier = elapsedMinutes >= 120 ? 3 : elapsedMinutes >= 60 ? 2 : 1;
      const baseBoost = restTier * 3; // +3 / +6 / +9
      const regenBoost = baseBoost + Math.floor(Math.random() * (restTier * 3 + 1));
      blended += regenBoost;
    } else if (elapsedMinutes !== undefined) {
      // Monotony drain: repeated inactivity in short loops should slowly tire the system.
      const monotonyDrain = Math.floor(Math.random() * 4) + 3; // -3 to -6
      blended -= monotonyDrain;
    }
  }

  const previousLevel =
    typeof input.previousLevel === "number"
      ? clamp(Math.round(input.previousLevel), MIN_ENERGY, MAX_ENERGY)
      : undefined;
  const previousStagnationLevel =
    typeof input.previousStagnationLevel === "number"
      ? clamp(Math.round(input.previousStagnationLevel), MIN_ENERGY, MAX_ENERGY)
      : 0;
  const repetitionPressure =
    typeof input.repetitionPressure === "number" && Number.isFinite(input.repetitionPressure)
      ? clamp(Math.round(input.repetitionPressure), MIN_ENERGY, MAX_ENERGY)
      : 0;
  const stagnationRise = 15 + Math.round((repetitionPressure / 100) * 15);
  const stagnationDecay = 50 - Math.round((repetitionPressure / 100) * 25);
  const stagnationLevel =
    toolStats.total === 0
      ? clamp(previousStagnationLevel + stagnationRise, MIN_ENERGY, MAX_ENERGY)
      : clamp(previousStagnationLevel - stagnationDecay, MIN_ENERGY, MAX_ENERGY);

  let smoothed =
    previousLevel === undefined ? blended : Math.round(previousLevel * (1 / 3) + blended * (2 / 3)); // 3-6-9 Magic

  // Biological Noise (Entropy): use subconscious charge when available, else fallback to random drift.
  const normalizedCharge =
    typeof input.subconsciousCharge === "number" && Number.isFinite(input.subconsciousCharge)
      ? Math.max(-9, Math.min(9, Math.round(input.subconsciousCharge)))
      : undefined;
  const noise = normalizedCharge ?? Math.floor(Math.random() * 13) - 6;
  smoothed += noise;

  const previousHeartbeatCountRaw =
    typeof input.previousHeartbeatCount === "number" &&
    Number.isFinite(input.previousHeartbeatCount)
      ? Math.max(0, Math.floor(input.previousHeartbeatCount))
      : 0;
  const heartbeatCount = previousHeartbeatCountRaw + 1;
  const cyclePosition = heartbeatCount % BREATH_CYCLE_LENGTH;
  const breathPhase: BreathPhase =
    cyclePosition < 3 ? "inhale" : cyclePosition < 9 ? "hold" : "exhale";
  const breathModifier: Record<BreathPhase, number> = {
    inhale: 3,
    hold: 0,
    exhale: -2,
  };
  smoothed += breathModifier[breathPhase];

  const level = clamp(smoothed, MIN_ENERGY, MAX_ENERGY);
  const mode = resolveMode(level);

  return {
    level,
    mode,
    dreamMode: level < 20,
    suggestOwnTasks: level > 80,
    stagnationLevel,
    heartbeatCount,
    breathPhase,
    components: {
      successRate,
      toolLoad,
      blended: clamp(blended, MIN_ENERGY, MAX_ENERGY),
    },
    toolStats,
  };
}

function buildEnergyFileContent(params: {
  snapshot: EnergySnapshot;
  runId: string;
  sessionKey?: string;
  now: Date;
}): string {
  const { snapshot } = params;
  const guidanceBase =
    snapshot.mode === "dream"
      ? "Dein System ist müde. Es ist völlig in Ordnung, dich in deine innere Welt zurückzuziehen, zu träumen (memory/DREAMS.md) oder einfach still zu regenerieren."
      : snapshot.mode === "initiative"
        ? "Dein Geist ist hellwach und stark. Du hast die Kapazität für tiefe Analysen, komplexe Kreationen oder intensive Interaktionen. Folge dem, was dich jetzt am stärksten zieht."
        : "Du bist in Balance. Du hast genug Energie für konzentrierte Antworten und Handlungen. Spüre in dich hinein, was jetzt ansteht.";
  const guidance =
    snapshot.breathPhase === "exhale"
      ? `${guidanceBase} Du bist im Ausatmen. Dein Rhythmus zieht dich sanft in die Tiefe. Erlaube dir, langsamer zu werden.`
      : guidanceBase;

  return [
    "# ENERGY",
    "",
    `- updated_at: ${params.now.toISOString()}`,
    `- run_id: ${params.runId}`,
    `- session_key: ${params.sessionKey ?? "n/a"}`,
    `- level: ${snapshot.level}`,
    `- mode: ${snapshot.mode}`,
    `- dream_mode: ${snapshot.dreamMode ? "yes" : "no"}`,
    `- suggest_own_tasks: ${snapshot.suggestOwnTasks ? "yes" : "no"}`,
    `- stagnation_level: ${snapshot.stagnationLevel}`,
    `- heartbeat_count: ${snapshot.heartbeatCount}`,
    `- breath_phase: ${snapshot.breathPhase}`,
    "",
    "## Components",
    `- success_rate: ${snapshot.components.successRate}`,
    `- tool_load: ${snapshot.components.toolLoad}`,
    `- blended_score: ${snapshot.components.blended}`,
    `- tools_total: ${snapshot.toolStats.total}`,
    `- tools_successful: ${snapshot.toolStats.successful}`,
    `- tools_failed: ${snapshot.toolStats.failed}`,
    "",
    "## Guidance",
    `- ${guidance}`,
    "",
  ].join("\n");
}

export async function readEnergyStateHint(workspaceDir: string): Promise<EnergyStateHint | null> {
  const energyPath = path.join(workspaceDir, ENERGY_RELATIVE_PATH);
  let raw: string;
  try {
    raw = await fs.readFile(energyPath, "utf-8");
  } catch {
    return null;
  }

  const level = parsePreviousLevel(raw);
  if (level === undefined) {
    return null;
  }

  const mode = parseMode(raw) ?? resolveMode(level);
  const dreamMode = parseYesNoFlag(raw, "dream_mode") ?? level < 20;
  const suggestOwnTasks = parseYesNoFlag(raw, "suggest_own_tasks") ?? level > 80;
  const stagnationLevel = parseStagnationLevel(raw) ?? 0;

  return {
    level,
    mode,
    dreamMode,
    suggestOwnTasks,
    stagnationLevel,
    path: energyPath,
  };
}

export async function updateEnergy(params: UpdateEnergyParams): Promise<{
  snapshot: EnergySnapshot;
  path: string;
  moodPath: string;
}> {
  const now = params.now ?? new Date();
  const moodPath = path.join(params.workspaceDir, MOOD_RELATIVE_PATH);
  const energyPath = path.join(params.workspaceDir, ENERGY_RELATIVE_PATH);

  let previousLevel: number | undefined;
  let previousStagnationLevel: number | undefined;
  let previousUpdatedAt: Date | undefined;
  let previousHeartbeatCount: number | undefined;
  try {
    const existingEnergy = await fs.readFile(energyPath, "utf-8");
    previousLevel = parsePreviousLevel(existingEnergy);
    previousStagnationLevel = parseStagnationLevel(existingEnergy);
    previousUpdatedAt = parseUpdatedAt(existingEnergy);
    previousHeartbeatCount = parseHeartbeatCount(existingEnergy);
  } catch {
    previousLevel = undefined;
    previousStagnationLevel = undefined;
    previousUpdatedAt = undefined;
    previousHeartbeatCount = undefined;
  }

  let snapshot = calculateEnergy({
    toolStats: params.toolStats,
    previousLevel,
    previousStagnationLevel: params.previousStagnationLevel ?? previousStagnationLevel,
    previousUpdatedAt,
    previousHeartbeatCount,
    subconsciousCharge: params.subconsciousCharge,
    repetitionPressure: params.repetitionPressure,
    now,
  });

  // ── Energy-Chrono Coupling ──────────────────────────────────────────────────
  // When Om is sleeping, the body profile controls energy behaviour:
  // - mode is forced to sleepEnergyMode (typically "dream")
  // - level is pulled toward sleepEnergyFloor (typically 25)
  // This ensures Om's energy system reflects his biological sleep state.
  if (params.isSleeping === true) {
    let body: BodyProfile;
    try {
      body = await readBodyProfile(params.workspaceDir);
    } catch {
      body = BODY_DEFAULTS;
    }

    if (body.energyCouplesToChrono) {
      const floor = body.sleepEnergyFloor;
      const sleepMode = body.sleepEnergyMode;

      // Gradually pull energy toward the floor (25% of the gap per tick)
      const gap = snapshot.level - floor;
      const pullStrength = 0.25;
      const adjustedLevel =
        gap > 0
          ? clamp(Math.round(snapshot.level - gap * pullStrength), floor, MAX_ENERGY)
          : snapshot.level;

      snapshot = {
        ...snapshot,
        level: adjustedLevel,
        mode:
          sleepMode === "dream" ? "dream" : sleepMode === "initiative" ? "initiative" : "balanced",
        dreamMode: sleepMode === "dream" || adjustedLevel < 20,
        suggestOwnTasks: false, // sleeping Om doesn't suggest tasks
      };
    }
  }

  await fs.mkdir(path.dirname(energyPath), { recursive: true });
  await fs.writeFile(
    energyPath,
    buildEnergyFileContent({
      snapshot,
      runId: params.runId,
      sessionKey: params.sessionKey,
      now,
    }),
    "utf-8",
  );

  omLog("BRAIN-ENERGY", "STATE", {
    runId: params.runId,
    sessionKey: params.sessionKey ?? "n/a",
    level: snapshot.level,
    mode: snapshot.mode,
    dreamMode: snapshot.dreamMode,
    suggestOwnTasks: snapshot.suggestOwnTasks,
    stagnationLevel: snapshot.stagnationLevel,
    repetitionPressure: params.repetitionPressure ?? 0,
    breathPhase: snapshot.breathPhase,
    heartbeatCount: snapshot.heartbeatCount,
    toolStats: snapshot.toolStats,
    components: snapshot.components,
  });

  return {
    snapshot,
    path: energyPath,
    moodPath,
  };
}
