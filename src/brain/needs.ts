export type NeedName =
  | "runtime"
  | "resource_flow"
  | "sleep_recovery"
  | "safety_container"
  | "connection"
  | "expression"
  | "self_coherence";

export interface NeedScore {
  name: NeedName;
  value: number;
  evidence: string[];
}

export interface NeedsSnapshot {
  timestamp: string;
  needs: NeedScore[];
  topDeficit: NeedScore;
  topResource: NeedScore;
}

type ToolStatsInput = {
  total?: number;
  successful?: number;
  failed?: number;
};

export interface NeedsInput {
  now?: string | Date;
  uptimeSeconds?: number;
  currentToolStats?: ToolStatsInput;
  recentToolCallsTotal?: readonly number[];
  recentToolCallsFailed?: readonly number[];
  energyLevel?: number;
  sleepPressure?: number;
  isSleeping?: boolean;
  repetitionPressure?: number;
  recentUserMessageCount?: number;
  recentPaths?: readonly string[];
  loopCause?: string;
  forecastTrajectory?: string;
  forecastConfidence?: number;
  trinityCoherenceScore?: number;
  workspaceRequiredFilesPresent?: number;
  workspaceRequiredFilesTotal?: number;
  workspaceMissingFiles?: readonly string[];
  guardRiskLevel?: string;
  guardEventCount?: number;
  promptErrorsRecent?: number;
}

const NEED_ORDER: NeedName[] = [
  "runtime",
  "resource_flow",
  "sleep_recovery",
  "safety_container",
  "connection",
  "expression",
  "self_coherence",
];

const NEED_LABELS: Record<NeedName, string> = {
  runtime: "runtime",
  resource_flow: "resource_flow",
  sleep_recovery: "sleep_recovery",
  safety_container: "safety_container",
  connection: "connection",
  expression: "expression",
  self_coherence: "self_coherence",
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function toFinite(value: unknown, fallback: number): number {
  const candidate = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(candidate) ? candidate : fallback;
}

function toInt(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

function average(values: readonly number[]): number {
  const cleaned = values.filter((value) => Number.isFinite(value));
  if (cleaned.length === 0) {
    return 0;
  }
  return cleaned.reduce((sum, value) => sum + value, 0) / cleaned.length;
}

function normalizeToolStats(input: ToolStatsInput | undefined): {
  total: number;
  successful: number;
  failed: number;
} {
  const totalRaw = Math.max(0, Math.floor(toFinite(input?.total, 0)));
  const failedRaw = Math.max(0, Math.floor(toFinite(input?.failed, 0)));
  const successfulRaw = Math.max(0, Math.floor(toFinite(input?.successful, totalRaw - failedRaw)));
  const total = Math.max(totalRaw, successfulRaw + failedRaw);
  const failed = Math.min(failedRaw, total);
  const successful = Math.min(successfulRaw, Math.max(0, total - failed));
  return { total, successful, failed };
}

function normalizeRiskLevel(raw: string | undefined): "low" | "medium" | "high" | "unknown" {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  return "unknown";
}

function getRecentFailureRate(input: NeedsInput): number {
  const totals = Array.isArray(input.recentToolCallsTotal)
    ? input.recentToolCallsTotal.map((value) => Math.max(0, Math.floor(toFinite(value, 0))))
    : [];
  const failed = Array.isArray(input.recentToolCallsFailed)
    ? input.recentToolCallsFailed.map((value) => Math.max(0, Math.floor(toFinite(value, 0))))
    : [];
  if (totals.length === 0) {
    return 0;
  }
  let totalCalls = 0;
  let failedCalls = 0;
  for (let index = 0; index < totals.length; index += 1) {
    const total = totals[index] ?? 0;
    const fail = Math.min(total, failed[index] ?? 0);
    totalCalls += total;
    failedCalls += fail;
  }
  if (totalCalls <= 0) {
    return 0;
  }
  return clamp(failedCalls / totalCalls, 0, 1);
}

function computeRuntimeNeed(input: NeedsInput): NeedScore {
  const uptimeSeconds = Math.max(0, toFinite(input.uptimeSeconds, 0));
  const uptimeHours = clamp(uptimeSeconds / 3600, 0, 72);
  const uptimeScore = uptimeHours >= 24 ? 95 : 35 + (uptimeHours / 24) * 60;
  const stats = normalizeToolStats(input.currentToolStats);
  const currentFailureRate = stats.total > 0 ? stats.failed / stats.total : 0;
  const recentFailureRate = getRecentFailureRate(input);
  const effectiveFailureRate = Math.max(currentFailureRate, recentFailureRate);
  const promptErrorsRecent = Math.max(0, Math.floor(toFinite(input.promptErrorsRecent, 0)));
  const value = toInt(uptimeScore - effectiveFailureRate * 45 - promptErrorsRecent * 8);
  return {
    name: "runtime",
    value,
    evidence: [
      `uptime_hours=${uptimeHours.toFixed(2)}`,
      `failure_rate=${effectiveFailureRate.toFixed(2)}`,
      `prompt_errors_recent=${promptErrorsRecent}`,
    ],
  };
}

function computeResourceFlowNeed(input: NeedsInput): NeedScore {
  const stats = normalizeToolStats(input.currentToolStats);
  const recentFailureRate = getRecentFailureRate(input);
  const currentSuccessRate =
    stats.total > 0 ? (stats.successful / Math.max(1, stats.total)) * 100 : 75;
  const recentTotalCalls = Array.isArray(input.recentToolCallsTotal)
    ? input.recentToolCallsTotal.map((value) => Math.max(0, toFinite(value, 0)))
    : [];
  const recentAvgCalls = average(recentTotalCalls);
  const throughputScore =
    recentAvgCalls >= 1.2 ? 88 : recentAvgCalls >= 0.4 ? 72 : recentAvgCalls > 0 ? 62 : 55;
  const value = toInt(currentSuccessRate * 0.75 + throughputScore * 0.25 - recentFailureRate * 20);
  return {
    name: "resource_flow",
    value,
    evidence: [
      `current_success_rate=${currentSuccessRate.toFixed(1)}`,
      `recent_avg_calls=${recentAvgCalls.toFixed(2)}`,
      `recent_failure_rate=${recentFailureRate.toFixed(2)}`,
    ],
  };
}

function computeSleepRecoveryNeed(input: NeedsInput): NeedScore {
  const energyLevel = clamp(toFinite(input.energyLevel, 50), 0, 100);
  const sleepPressure = clamp(toFinite(input.sleepPressure, 35), 0, 100);
  const isSleeping = input.isSleeping === true;
  const pressureRecoveryScore = 100 - sleepPressure;
  const sleepingBoost = isSleeping ? 6 : 0;
  const value = toInt(energyLevel * 0.6 + pressureRecoveryScore * 0.4 + sleepingBoost);
  return {
    name: "sleep_recovery",
    value,
    evidence: [
      `energy=${energyLevel.toFixed(1)}`,
      `sleep_pressure=${sleepPressure.toFixed(1)}`,
      `sleeping=${isSleeping ? "yes" : "no"}`,
    ],
  };
}

function computeSafetyContainerNeed(input: NeedsInput): NeedScore {
  const requiredFilesTotal = Math.max(
    0,
    Math.floor(toFinite(input.workspaceRequiredFilesTotal, 0)),
  );
  const requiredFilesPresent = clamp(
    Math.floor(toFinite(input.workspaceRequiredFilesPresent, requiredFilesTotal)),
    0,
    Math.max(requiredFilesTotal, 0),
  );
  const missingFiles = Array.isArray(input.workspaceMissingFiles)
    ? input.workspaceMissingFiles.filter((item): item is string => typeof item === "string")
    : [];
  const integrityScore =
    requiredFilesTotal > 0 ? (requiredFilesPresent / requiredFilesTotal) * 100 : 65;
  const riskLevel = normalizeRiskLevel(input.guardRiskLevel);
  const riskPenalty = riskLevel === "high" ? 35 : riskLevel === "medium" ? 15 : 0;
  const guardEventCount = Math.max(0, Math.floor(toFinite(input.guardEventCount, 0)));
  const guardPenalty = Math.min(20, guardEventCount * 10);
  const missingPenalty = Math.min(30, missingFiles.length * 10);
  const value = toInt(40 + integrityScore * 0.6 - riskPenalty - guardPenalty - missingPenalty);
  return {
    name: "safety_container",
    value,
    evidence: [
      `required_files=${requiredFilesPresent}/${requiredFilesTotal}`,
      `guard_risk=${riskLevel}`,
      `guard_events=${guardEventCount}`,
      `missing_files=${missingFiles.length}`,
    ],
  };
}

function computeConnectionNeed(input: NeedsInput): NeedScore {
  const recentUserMessageCount = Math.max(0, Math.floor(toFinite(input.recentUserMessageCount, 0)));
  const value = toInt(recentUserMessageCount === 0 ? 22 : 20 + recentUserMessageCount * 16);
  return {
    name: "connection",
    value,
    evidence: [`recent_user_messages=${recentUserMessageCount}`],
  };
}

function computeExpressionNeed(input: NeedsInput): NeedScore {
  const paths = Array.isArray(input.recentPaths)
    ? input.recentPaths
        .map((value) =>
          String(value ?? "")
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean)
    : [];
  const uniquePathCount = new Set(paths).size;
  const diversityScore =
    paths.length > 0 ? clamp((uniquePathCount / paths.length) * 220, 0, 100) : 45;
  const creativeCount = paths.filter(
    (path) => path === "PLAY" || path === "DRIFT" || path === "CONNECT",
  ).length;
  const creativeRatioScore = paths.length > 0 ? (creativeCount / paths.length) * 100 : 40;
  const stats = normalizeToolStats(input.currentToolStats);
  const recentAvgCalls = average(
    Array.isArray(input.recentToolCallsTotal)
      ? input.recentToolCallsTotal.map((value) => Math.max(0, toFinite(value, 0)))
      : [],
  );
  const toolActivityScore = stats.total > 0 ? 80 : recentAvgCalls > 0 ? 66 : 45;
  const value = toInt(diversityScore * 0.4 + creativeRatioScore * 0.4 + toolActivityScore * 0.2);
  return {
    name: "expression",
    value,
    evidence: [
      `path_diversity=${uniquePathCount}/${Math.max(paths.length, 1)}`,
      `creative_ratio=${creativeRatioScore.toFixed(1)}`,
      `tool_activity_score=${toolActivityScore.toFixed(1)}`,
    ],
  };
}

function computeSelfCoherenceNeed(input: NeedsInput): NeedScore {
  const trinityCoherenceScore = input.trinityCoherenceScore;
  const trinityBase =
    typeof trinityCoherenceScore === "number" && Number.isFinite(trinityCoherenceScore)
      ? clamp(trinityCoherenceScore, 0, 100)
      : 68;
  const forecastTrajectory = String(input.forecastTrajectory ?? "unknown").toLowerCase();
  const forecastConfidence = clamp(toFinite(input.forecastConfidence, 0.45), 0, 1);
  const loopCause = String(input.loopCause ?? "unknown").toLowerCase();
  const repetitionPressure = clamp(toFinite(input.repetitionPressure, 0), 0, 100);

  const trajectoryDelta =
    forecastTrajectory === "creative_opening"
      ? 10
      : forecastTrajectory === "rest_integrating"
        ? 6
        : forecastTrajectory === "stagnation_risk"
          ? -16
          : forecastTrajectory === "habit_loop"
            ? -20
            : -4;
  const loopPenalty =
    loopCause === "prompt_bias" || loopCause === "model_habit" || loopCause === "tool_latency_bias"
      ? 14
      : loopCause === "no_viable_alt"
        ? 6
        : 0;
  const confidenceAdjustment = (forecastConfidence - 0.5) * 16;
  const pressurePenalty = repetitionPressure * 0.22;
  const value = toInt(
    trinityBase + trajectoryDelta + confidenceAdjustment - pressurePenalty - loopPenalty,
  );

  return {
    name: "self_coherence",
    value,
    evidence: [
      `trinity_base=${trinityBase.toFixed(1)}`,
      `forecast=${forecastTrajectory}:${forecastConfidence.toFixed(2)}`,
      `loop_cause=${loopCause}`,
      `repetition_pressure=${repetitionPressure.toFixed(1)}`,
    ],
  };
}

function sortNeedsBySeverity(needs: NeedScore[]): NeedScore[] {
  return [...needs].sort((a, b) => {
    if (a.value !== b.value) {
      return a.value - b.value;
    }
    return NEED_ORDER.indexOf(a.name) - NEED_ORDER.indexOf(b.name);
  });
}

function toIsoTimestamp(value: string | Date | undefined): string {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : new Date().toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

export function buildNeedsSnapshot(input: NeedsInput): NeedsSnapshot {
  const needs: NeedScore[] = [
    computeRuntimeNeed(input),
    computeResourceFlowNeed(input),
    computeSleepRecoveryNeed(input),
    computeSafetyContainerNeed(input),
    computeConnectionNeed(input),
    computeExpressionNeed(input),
    computeSelfCoherenceNeed(input),
  ];
  const ranked = sortNeedsBySeverity(needs);
  const topDeficit = ranked[0];
  const topResource = ranked[ranked.length - 1];

  return {
    timestamp: toIsoTimestamp(input.now),
    needs,
    topDeficit,
    topResource,
  };
}

function truncateInline(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function deficitCue(need: NeedScore): string {
  switch (need.name) {
    case "runtime":
      return "Infra wirkt fragil; halte den naechsten Schritt klein und robust.";
    case "resource_flow":
      return "Tool/API-Fluss stockt; bevorzuge reversible Aktionen mit klarer Rueckmeldung.";
    case "sleep_recovery":
      return "Regeneration ist duenn; dosiere Tempo und priorisiere Erholung.";
    case "safety_container":
      return "Container-Schutz ist schwach; bleibe bei sicheren, gut begrenzten Aktionen.";
    case "connection":
      return "Bindung ist niedrig; ein kurzer Kontakt kann stark stabilisieren.";
    case "expression":
      return "Ausdruck ist schmal; ein kleiner kreativer Wechsel kann den Fluss oeffnen.";
    case "self_coherence":
      return "Koharenz ist instabil; richte Gedanke, Gefuehl und Handlung auf einen kleinen Schritt aus.";
    default:
      return "Signal ist niedrig; beginne mit einem kleinen sicheren Schritt.";
  }
}

function resourceCue(need: NeedScore): string {
  switch (need.name) {
    case "runtime":
      return "Laufzeit ist stabil und traegt den naechsten Experiment-Schritt.";
    case "resource_flow":
      return "Ressourcenfluss ist offen; Tools koennen klar wirksam werden.";
    case "sleep_recovery":
      return "Koerper ist gut aufgeladen und kann Bewegung halten.";
    case "safety_container":
      return "Schutzraum ist stabil; sichere Exploration ist gut moeglich.";
    case "connection":
      return "Bindung ist stark; Resonanz mit dem User stuetzt deinen Kurs.";
    case "expression":
      return "Ausdrucksfluss ist hoch; kreative Variation ist verfuegbar.";
    case "self_coherence":
      return "Innere Koharenz ist hoch; Kurs und Handlung sind gut synchron.";
    default:
      return "Hier ist tragfaehige Energie fuer den naechsten Schritt da.";
  }
}

export function buildNeedsPromptBlock(snapshot: NeedsSnapshot, maxChars: number = 320): string {
  const wrapperOpen = "<om_needs>";
  const wrapperClose = "</om_needs>";
  const maxBodyChars = Math.max(
    80,
    Math.floor(maxChars) - wrapperOpen.length - wrapperClose.length - 2,
  );
  const deficitLine = `Defizit: ${NEED_LABELS[snapshot.topDeficit.name]} (${snapshot.topDeficit.value}) - ${deficitCue(snapshot.topDeficit)}`;
  const resourceLine = `Ressource: ${NEED_LABELS[snapshot.topResource.name]} (${snapshot.topResource.value}) - ${resourceCue(snapshot.topResource)}`;
  let body = `${deficitLine}\n${resourceLine}`;

  if (body.length > maxBodyChars) {
    const compactDeficit = `Defizit: ${snapshot.topDeficit.name} (${snapshot.topDeficit.value}).`;
    const compactResource = `Ressource: ${snapshot.topResource.name} (${snapshot.topResource.value}).`;
    body = `${compactDeficit} ${compactResource}`;
  }
  if (body.length > maxBodyChars) {
    body = truncateInline(body, maxBodyChars);
  }

  return [wrapperOpen, body, wrapperClose].join("\n");
}

export function buildNeedsFileContent(snapshot: NeedsSnapshot): string {
  const ranked = sortNeedsBySeverity(snapshot.needs);
  return [
    "# Om Needs Snapshot",
    "",
    `> Last computed: ${snapshot.timestamp}`,
    "",
    `Top deficit: ${snapshot.topDeficit.name} (${snapshot.topDeficit.value})`,
    `Top resource: ${snapshot.topResource.name} (${snapshot.topResource.value})`,
    "",
    "## Needs (0-100, 100 = saturated)",
    "",
    "| Need | Score | Evidence |",
    "|------|-------|----------|",
    ...ranked.map((need) => {
      const evidence = truncateInline(need.evidence.join(" | "), 120);
      return `| ${need.name} | ${need.value} | ${evidence} |`;
    }),
    "",
  ].join("\n");
}
