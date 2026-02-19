import fs from "node:fs/promises";
import path from "node:path";
import { omLog } from "../agents/om-scaffolding.js";

const MOOD_RELATIVE_PATH = path.join("knowledge", "sacred", "MOOD.md");
const ENERGY_RELATIVE_PATH = path.join("knowledge", "sacred", "ENERGY.md");
const MAX_TOOL_LOAD_FOR_DRAIN = 6;
const MIN_ENERGY = 0;
const MAX_ENERGY = 100;

const POSITIVE_MOOD_PATTERNS = [
  /\bcalm\b/i,
  /\bfocused?\b/i,
  /\bsteady\b/i,
  /\bhopeful\b/i,
  /\bcurious\b/i,
  /\bcreative\b/i,
  /\benerg(?:ized|y)\b/i,
  /\bclear\b/i,
  /\bjoy(?:ful)?\b/i,
  /\bstable\b/i,
  /\bruhig\b/i,
  /\bfokussiert\b/i,
  /\bneugierig\b/i,
  /\bklar\b/i,
  /\bkreativ\b/i,
  /\bstabil\b/i,
];

const NEGATIVE_MOOD_PATTERNS = [
  /\btired\b/i,
  /\bdrained\b/i,
  /\boverwhelmed\b/i,
  /\banxious\b/i,
  /\bstuck\b/i,
  /\bconfused\b/i,
  /\bheavy\b/i,
  /\bafraid\b/i,
  /\bexhausted\b/i,
  /\bscattered\b/i,
  /\bm[üu]de\b/i,
  /\bersch[öo]pft\b/i,
  /\b[üu]berfordert\b/i,
  /\bangst\b/i,
  /\bunsicher\b/i,
  /\bblockiert\b/i,
];

type EnergyMode = "dream" | "balanced" | "initiative";

export type EnergySnapshot = {
  level: number;
  mode: EnergyMode;
  dreamMode: boolean;
  suggestOwnTasks: boolean;
  components: {
    mood: number;
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
  moodText: string;
  toolStats?: {
    total?: number;
    successful?: number;
    failed?: number;
  };
  previousLevel?: number;
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
  now?: Date;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toPercent(value: number): number {
  return Math.round(clamp(value, 0, 1) * 100);
}

function scoreMood(moodText: string): number {
  const source = moodText.trim();
  if (!source) {
    return 50;
  }
  const positive = POSITIVE_MOOD_PATTERNS.reduce(
    (count, pattern) => count + (pattern.test(source) ? 1 : 0),
    0,
  );
  const negative = NEGATIVE_MOOD_PATTERNS.reduce(
    (count, pattern) => count + (pattern.test(source) ? 1 : 0),
    0,
  );
  if (positive === 0 && negative === 0) {
    return 50;
  }
  const valence = (positive - negative) / Math.max(1, positive + negative);
  const normalized = (valence + 1) / 2;
  return toPercent(normalized);
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
  const mood = scoreMood(input.moodText);
  const toolStats = normalizeToolStats(input.toolStats);
  const successRate =
    toolStats.total > 0 ? toPercent(toolStats.successful / toolStats.total) : 70;
  const loadRatio = clamp(toolStats.total / MAX_TOOL_LOAD_FOR_DRAIN, 0, 1);
  const toolLoad = toPercent(1 - loadRatio);

  const blendedRaw = mood * 0.45 + successRate * 0.35 + toolLoad * 0.2;
  const blended = Math.round(blendedRaw);

  const previousLevel =
    typeof input.previousLevel === "number"
      ? clamp(Math.round(input.previousLevel), MIN_ENERGY, MAX_ENERGY)
      : undefined;
  const smoothed =
    previousLevel === undefined ? blended : Math.round(previousLevel * 0.3 + blended * 0.7);
  const level = clamp(smoothed, MIN_ENERGY, MAX_ENERGY);
  const mode = resolveMode(level);

  return {
    level,
    mode,
    dreamMode: level < 20,
    suggestOwnTasks: level > 80,
    components: {
      mood,
      successRate,
      toolLoad,
      blended,
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
  const guidance =
    snapshot.mode === "dream"
      ? "Dream Mode: keep one tiny, low-risk creative action and preserve energy."
      : snapshot.mode === "initiative"
        ? "High Energy: propose one self-directed task that is reversible and measurable."
        : "Balanced: continue normal execution with one bounded next step.";

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
    "",
    "## Components",
    `- mood_score: ${snapshot.components.mood}`,
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

export async function updateEnergy(params: UpdateEnergyParams): Promise<{
  snapshot: EnergySnapshot;
  path: string;
  moodPath: string;
}> {
  const now = params.now ?? new Date();
  const moodPath = path.join(params.workspaceDir, MOOD_RELATIVE_PATH);
  const energyPath = path.join(params.workspaceDir, ENERGY_RELATIVE_PATH);

  let moodText = "";
  try {
    moodText = await fs.readFile(moodPath, "utf-8");
  } catch {
    moodText = "";
  }

  let previousLevel: number | undefined;
  try {
    const existingEnergy = await fs.readFile(energyPath, "utf-8");
    previousLevel = parsePreviousLevel(existingEnergy);
  } catch {
    previousLevel = undefined;
  }

  const snapshot = calculateEnergy({
    moodText,
    toolStats: params.toolStats,
    previousLevel,
  });

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

  omLog(
    "BRAIN-ENERGY",
    "STATE",
    `runId=${params.runId} sessionKey=${params.sessionKey ?? "n/a"} level=${snapshot.level} mode=${snapshot.mode} dream=${snapshot.dreamMode ? "yes" : "no"} initiative=${snapshot.suggestOwnTasks ? "yes" : "no"} tools=${snapshot.toolStats.total}/${snapshot.toolStats.successful}/${snapshot.toolStats.failed}`,
  );

  return {
    snapshot,
    path: energyPath,
    moodPath,
  };
}
