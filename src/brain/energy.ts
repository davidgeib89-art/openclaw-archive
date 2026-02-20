import fs from "node:fs/promises";
import path from "node:path";
import { omLog } from "../agents/om-scaffolding.js";

const MOOD_RELATIVE_PATH = path.join("knowledge", "sacred", "MOOD.md");
const ENERGY_RELATIVE_PATH = path.join("knowledge", "sacred", "ENERGY.md");
const MAX_TOOL_LOAD_FOR_DRAIN = 6;
const MIN_ENERGY = 0;
const MAX_ENERGY = 100;

type EnergyMode = "dream" | "balanced" | "initiative";

export type EnergySnapshot = {
  level: number;
  mode: EnergyMode;
  dreamMode: boolean;
  suggestOwnTasks: boolean;
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
  const toolStats = normalizeToolStats(input.toolStats);
  const successRate = toolStats.total > 0 ? toPercent(toolStats.successful / toolStats.total) : 90;
  const loadRatio = clamp(toolStats.total / MAX_TOOL_LOAD_FOR_DRAIN, 0, 1);
  const toolLoad = toPercent(1 - loadRatio);

  const blendedRaw = successRate * 0.7 + toolLoad * 0.3;
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

  let previousLevel: number | undefined;
  try {
    const existingEnergy = await fs.readFile(energyPath, "utf-8");
    previousLevel = parsePreviousLevel(existingEnergy);
  } catch {
    previousLevel = undefined;
  }

  const snapshot = calculateEnergy({
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
