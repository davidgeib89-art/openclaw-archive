import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

type JsonRecord = Record<string, unknown>;

type CliOptions = {
  jsonlPath: string;
  window: number;
  pivotRunId?: string;
  pivotIsoTs?: string;
  jsonOnly: boolean;
  outPath?: string;
};

type HeartbeatRun = {
  runId: string;
  firstTs?: string;
  promptTs?: string;
  isHeartbeat: boolean;
  hasForecastPromptBlock: boolean;
  hasForecastPreEvent: boolean;
  hasForecastState: boolean;
  forecastTrajectory?: string;
  forecastConfidence?: number;
  path?: string;
  pathSource?: string;
  tagFound?: boolean;
  loopCause?: string;
  repeatedPathStreak?: number;
  repetitionPressure?: number;
  energyLevel?: number;
  energyMode?: string;
  sleeping?: boolean;
  toolCallsTotal?: number;
  toolCallsFailed?: number;
  lastToolError?: string | null;
};

type CohortSummary = {
  count: number;
  unknownPathRate: number;
  latchedPathRate: number;
  forecastPromptRate: number;
  forecastPreRate: number;
  forecastStateRate: number;
  avgToolCalls: number;
  toolFailureRate: number;
  errorRate: number;
  avgRepeatedPathStreak: number;
  avgRepetitionPressure: number;
  restingPathRate: number;
  dominantPath: string;
  dominantPathShare: number;
  pathDistribution: Record<string, number>;
};

type GateCheck = {
  key: string;
  pass: boolean | null;
  detail: string;
};

type A3Report = {
  generatedAt: string;
  source: string;
  pivot: {
    runId?: string;
    ts?: string;
    index: number;
    reason: string;
  };
  window: number;
  pre: CohortSummary;
  post: CohortSummary;
  gates: {
    verdict: "PASS" | "HOLD" | "INSUFFICIENT_DATA";
    checks: GateCheck[];
  };
  notes: string[];
  runs: {
    totalHeartbeatRuns: number;
    preRunIds: string[];
    postRunIds: string[];
  };
};

function printHelp(): void {
  const lines = [
    "Usage: node --import tsx scripts/heartbeat-a3-gate-report.ts [options]",
    "",
    "Options:",
    "  --jsonl <path>       Path to OM_ACTIVITY.jsonl",
    "  --window <n>         Number of heartbeats per cohort (default: 20)",
    "  --pivot-run <runId>  Explicit pivot run ID (first post-A2 heartbeat)",
    "  --pivot-ts <iso>     Explicit pivot timestamp (ISO)",
    "  --out <path>         Write markdown report to file (e.g. report.md)",
    "  --json               Print JSON only",
    "  --help               Show this help",
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join("\n"));
}

function parseArgs(argv: string[]): CliOptions {
  const defaultJsonl = path.join(os.homedir(), ".openclaw", "workspace", "OM_ACTIVITY.jsonl");
  const opts: CliOptions = {
    jsonlPath: defaultJsonl,
    window: 20,
    jsonOnly: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--json") {
      opts.jsonOnly = true;
      continue;
    }
    if (arg === "--jsonl" && argv[i + 1]) {
      opts.jsonlPath = argv[i + 1]!;
      i += 1;
      continue;
    }
    if (arg === "--window" && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1]!, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        opts.window = parsed;
      }
      i += 1;
      continue;
    }
    if (arg === "--pivot-run" && argv[i + 1]) {
      opts.pivotRunId = argv[i + 1]!;
      i += 1;
      continue;
    }
    if (arg === "--pivot-ts" && argv[i + 1]) {
      opts.pivotIsoTs = argv[i + 1]!;
      i += 1;
      continue;
    }
    if (arg === "--out" && argv[i + 1]) {
      opts.outPath = argv[i + 1]!;
      i += 1;
      continue;
    }
  }

  return opts;
}

function toUpperString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  return undefined;
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value;
}

function parseJsonLine(line: string): JsonRecord | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as JsonRecord;
    }
  } catch {
    // fail-open for malformed lines
  }
  return null;
}

function isoMs(iso: string | undefined): number {
  if (!iso) {
    return Number.MAX_SAFE_INTEGER;
  }
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function sortByTimestamp(runs: HeartbeatRun[]): HeartbeatRun[] {
  return runs
    .slice()
    .sort((a, b) => isoMs(a.promptTs ?? a.firstTs) - isoMs(b.promptTs ?? b.firstTs));
}

function getOrCreateRun(map: Map<string, HeartbeatRun>, runId: string): HeartbeatRun {
  let current = map.get(runId);
  if (!current) {
    current = {
      runId,
      isHeartbeat: false,
      hasForecastPromptBlock: false,
      hasForecastPreEvent: false,
      hasForecastState: false,
    };
    map.set(runId, current);
  }
  return current;
}

function parseHeartbeatRuns(lines: string[]): HeartbeatRun[] {
  const runMap = new Map<string, HeartbeatRun>();
  for (const line of lines) {
    const entry = parseJsonLine(line);
    if (!entry) {
      continue;
    }

    const runId = toStringValue(entry.runId);
    if (!runId) {
      continue;
    }

    const run = getOrCreateRun(runMap, runId);
    const ts = toStringValue(entry.ts) ?? toStringValue(entry.timestamp);
    if (ts && (!run.firstTs || isoMs(ts) < isoMs(run.firstTs))) {
      run.firstTs = ts;
    }

    const layer = toUpperString(entry.layer);
    const event = toUpperString(entry.event);

    if (layer === "USER-MSG" && event === "PROMPT_PREVIEW" && toBoolean(entry.isHeartbeat) === true) {
      run.isHeartbeat = true;
      run.promptTs = ts ?? run.promptTs;
      const promptPreview = toStringValue(entry.promptPreview) ?? "";
      run.hasForecastPromptBlock ||= /<energy_forecast>/i.test(promptPreview);
    }

    if (layer === "BRAIN-THOUGHT" && (event?.includes("FORECAST_PRE") ?? false)) {
      run.hasForecastPreEvent = true;
    }

    if (layer === "BRAIN-FORECAST" && event === "STATE") {
      run.hasForecastState = true;
      run.forecastTrajectory = toStringValue(entry.trajectory) ?? run.forecastTrajectory;
      run.forecastConfidence = toFiniteNumber(entry.confidence) ?? run.forecastConfidence;
      run.sleeping = toBoolean(entry.sleeping) ?? run.sleeping;
      run.repeatedPathStreak = toFiniteNumber(entry.repeatedPathStreak) ?? run.repeatedPathStreak;
      run.repetitionPressure = toFiniteNumber(entry.repetitionPressure) ?? run.repetitionPressure;
    }

    if (layer === "BRAIN-CHOICE" && event === "SELECTED_PATH") {
      run.path = toStringValue(entry.path) ?? run.path;
      run.pathSource = toStringValue(entry.pathSource) ?? run.pathSource;
      run.tagFound = toBoolean(entry.tagFound) ?? run.tagFound;
    }

    if (layer === "BRAIN-LOOP-CAUSE" && event === "ANALYSIS") {
      run.loopCause = toStringValue(entry.cause) ?? run.loopCause;
      run.repeatedPathStreak = toFiniteNumber(entry.repeatedPathStreak) ?? run.repeatedPathStreak;
    }

    if (layer === "BRAIN-ENERGY" && event === "STATE") {
      run.energyLevel = toFiniteNumber(entry.level) ?? run.energyLevel;
      run.energyMode = toStringValue(entry.mode) ?? run.energyMode;
      run.repetitionPressure = toFiniteNumber(entry.repetitionPressure) ?? run.repetitionPressure;
    }

    if (layer === "BRAIN-METRICS" && event === "HEARTBEAT_TELEMETRY") {
      run.toolCallsTotal = toFiniteNumber(entry.toolCallsTotal) ?? run.toolCallsTotal;
      run.toolCallsFailed = toFiniteNumber(entry.toolCallsFailed) ?? run.toolCallsFailed;
      run.lastToolError = toStringValue(entry.lastToolError) ?? run.lastToolError ?? null;
    }
  }

  return sortByTimestamp([...runMap.values()].filter((run) => run.isHeartbeat));
}

function summarizeCohort(runs: HeartbeatRun[]): CohortSummary {
  const count = runs.length;
  if (count === 0) {
    return {
      count: 0,
      unknownPathRate: 0,
      latchedPathRate: 0,
      forecastPromptRate: 0,
      forecastPreRate: 0,
      forecastStateRate: 0,
      avgToolCalls: 0,
      toolFailureRate: 0,
      errorRate: 0,
      avgRepeatedPathStreak: 0,
      avgRepetitionPressure: 0,
      restingPathRate: 0,
      dominantPath: "n/a",
      dominantPathShare: 0,
      pathDistribution: {},
    };
  }

  let unknownPathCount = 0;
  let latchedPathCount = 0;
  let forecastPromptCount = 0;
  let forecastPreCount = 0;
  let forecastStateCount = 0;
  let toolFailureCount = 0;
  let errorCount = 0;
  let restingPathCount = 0;

  let toolCallsSum = 0;
  let repeatedPathStreakSum = 0;
  let repeatedPathStreakSamples = 0;
  let repetitionPressureSum = 0;
  let repetitionPressureSamples = 0;

  const pathCounts = new Map<string, number>();

  for (const run of runs) {
    const pathUpper = toUpperString(run.path);
    if (!pathUpper || pathUpper === "UNKNOWN") {
      unknownPathCount += 1;
    }

    if (run.pathSource === "latched_run_messages") {
      latchedPathCount += 1;
    }

    if (run.hasForecastPromptBlock) {
      forecastPromptCount += 1;
    }
    if (run.hasForecastPreEvent) {
      forecastPreCount += 1;
    }
    if (run.hasForecastState) {
      forecastStateCount += 1;
    }

    const toolCalls = run.toolCallsTotal ?? 0;
    toolCallsSum += toolCalls;
    if ((run.toolCallsFailed ?? 0) > 0) {
      toolFailureCount += 1;
    }
    if (run.lastToolError && run.lastToolError.trim().length > 0) {
      errorCount += 1;
    }

    if (pathUpper === "DRIFT" || pathUpper === "NO_OP") {
      restingPathCount += 1;
    }

    if (pathUpper) {
      pathCounts.set(pathUpper, (pathCounts.get(pathUpper) ?? 0) + 1);
    }

    if (typeof run.repeatedPathStreak === "number" && Number.isFinite(run.repeatedPathStreak)) {
      repeatedPathStreakSum += run.repeatedPathStreak;
      repeatedPathStreakSamples += 1;
    }
    if (typeof run.repetitionPressure === "number" && Number.isFinite(run.repetitionPressure)) {
      repetitionPressureSum += run.repetitionPressure;
      repetitionPressureSamples += 1;
    }
  }

  const dominant = [...pathCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const dominantPath = dominant?.[0] ?? "n/a";
  const dominantPathShare = dominant ? dominant[1] / count : 0;
  const pathDistribution = Object.fromEntries(
    [...pathCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v / count]),
  );

  return {
    count,
    unknownPathRate: unknownPathCount / count,
    latchedPathRate: latchedPathCount / count,
    forecastPromptRate: forecastPromptCount / count,
    forecastPreRate: forecastPreCount / count,
    forecastStateRate: forecastStateCount / count,
    avgToolCalls: toolCallsSum / count,
    toolFailureRate: toolFailureCount / count,
    errorRate: errorCount / count,
    avgRepeatedPathStreak:
      repeatedPathStreakSamples > 0 ? repeatedPathStreakSum / repeatedPathStreakSamples : 0,
    avgRepetitionPressure:
      repetitionPressureSamples > 0 ? repetitionPressureSum / repetitionPressureSamples : 0,
    restingPathRate: restingPathCount / count,
    dominantPath,
    dominantPathShare,
    pathDistribution,
  };
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNum(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "n/a";
}

function evaluateA3Gates(pre: CohortSummary, post: CohortSummary): {
  verdict: "PASS" | "HOLD" | "INSUFFICIENT_DATA";
  checks: GateCheck[];
} {
  const checks: GateCheck[] = [
    {
      key: "unknown_path_lt_5pct",
      pass: post.count > 0 ? post.unknownPathRate < 0.05 : null,
      detail: `post unknown_path_rate=${formatPct(post.unknownPathRate)} (target < 5%)`,
    },
    {
      key: "forecast_prompt_presence_gt_95pct",
      pass: post.count > 0 ? post.forecastPromptRate >= 0.95 : null,
      detail: `post forecast_prompt_rate=${formatPct(post.forecastPromptRate)} (target >= 95%)`,
    },
    {
      key: "loop_length_not_worse",
      pass:
        pre.count > 0 && post.count > 0
          ? post.avgRepeatedPathStreak <= pre.avgRepeatedPathStreak + 0.15
          : null,
      detail:
        `pre avg_repeated_path_streak=${formatNum(pre.avgRepeatedPathStreak)}; ` +
        `post=${formatNum(post.avgRepeatedPathStreak)}`,
    },
    {
      key: "no_error_rate_spike",
      pass: pre.count > 0 && post.count > 0 ? post.errorRate <= pre.errorRate + 0.05 : null,
      detail: `pre error_rate=${formatPct(pre.errorRate)}; post=${formatPct(post.errorRate)}`,
    },
    {
      key: "no_resting_spike",
      pass:
        pre.count > 0 && post.count > 0
          ? post.restingPathRate <= Math.min(1, pre.restingPathRate + 0.15)
          : null,
      detail:
        `pre resting_path_rate=${formatPct(pre.restingPathRate)}; ` +
        `post=${formatPct(post.restingPathRate)}`,
    },
  ];

  const evaluable = checks.filter((check) => check.pass !== null);
  if (evaluable.length === 0) {
    return { verdict: "INSUFFICIENT_DATA", checks };
  }

  const failed = evaluable.filter((check) => check.pass === false);
  return {
    verdict: failed.length === 0 ? "PASS" : "HOLD",
    checks,
  };
}

function findPivotIndex(runs: HeartbeatRun[], opts: CliOptions): { index: number; reason: string } {
  if (opts.pivotRunId) {
    const idx = runs.findIndex((run) => run.runId === opts.pivotRunId);
    return idx >= 0
      ? { index: idx, reason: `explicit runId ${opts.pivotRunId}` }
      : { index: -1, reason: `explicit runId ${opts.pivotRunId} not found` };
  }

  if (opts.pivotIsoTs) {
    const pivotMs = Date.parse(opts.pivotIsoTs);
    if (Number.isFinite(pivotMs)) {
      const idx = runs.findIndex((run) => isoMs(run.promptTs ?? run.firstTs) >= pivotMs);
      return idx >= 0
        ? { index: idx, reason: `explicit timestamp ${opts.pivotIsoTs}` }
        : { index: -1, reason: `explicit timestamp ${opts.pivotIsoTs} not reached` };
    }
  }

  const autoIdx = runs.findIndex((run) => run.hasForecastPreEvent || run.hasForecastPromptBlock);
  if (autoIdx >= 0) {
    return { index: autoIdx, reason: "auto-detected first A2 forecast heartbeat" };
  }

  return { index: -1, reason: "no A2 marker (FORECAST_PRE or <energy_forecast>) found" };
}

function buildReport(heartbeatRuns: HeartbeatRun[], opts: CliOptions): A3Report {
  const pivot = findPivotIndex(heartbeatRuns, opts);
  const window = Math.max(1, opts.window);

  const preRuns =
    pivot.index >= 0
      ? heartbeatRuns.slice(Math.max(0, pivot.index - window), pivot.index)
      : heartbeatRuns.slice(Math.max(0, heartbeatRuns.length - window), heartbeatRuns.length);
  const postRuns =
    pivot.index >= 0 ? heartbeatRuns.slice(pivot.index, pivot.index + window) : ([] as HeartbeatRun[]);

  const pre = summarizeCohort(preRuns);
  const post = summarizeCohort(postRuns);
  const gates = evaluateA3Gates(pre, post);

  const notes: string[] = [];
  if (pivot.index < 0) {
    notes.push("Pivot could not be auto-detected. Provide --pivot-run or --pivot-ts for strict A3.");
  }
  if (pre.count < window) {
    notes.push(`Pre cohort has ${pre.count}/${window} runs. Baseline may be weak.`);
  }
  if (post.count < window) {
    notes.push(`Post cohort has ${post.count}/${window} runs. Keep collecting heartbeats.`);
  }
  if (post.forecastPromptRate < 0.95 && post.count > 0) {
    notes.push("Forecast prompt injection rate is below target; inspect prompt assembly ordering.");
  }

  return {
    generatedAt: new Date().toISOString(),
    source: opts.jsonlPath,
    pivot: {
      runId: pivot.index >= 0 ? heartbeatRuns[pivot.index]?.runId : undefined,
      ts: pivot.index >= 0 ? heartbeatRuns[pivot.index]?.promptTs ?? heartbeatRuns[pivot.index]?.firstTs : undefined,
      index: pivot.index,
      reason: pivot.reason,
    },
    window,
    pre,
    post,
    gates,
    notes,
    runs: {
      totalHeartbeatRuns: heartbeatRuns.length,
      preRunIds: preRuns.map((run) => run.runId),
      postRunIds: postRuns.map((run) => run.runId),
    },
  };
}

function printHumanReport(report: A3Report): void {
  const lines = [
    "# A3 Gate Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Source: ${report.source}`,
    `Pivot: ${report.pivot.reason} (${report.pivot.runId ?? "n/a"})`,
    `Heartbeat runs seen: ${report.runs.totalHeartbeatRuns}`,
    "",
    "## Cohorts",
    `Pre:  ${report.pre.count} runs`,
    `Post: ${report.post.count} runs`,
    "",
    "## Metrics (Pre -> Post)",
    `unknown_path_rate:        ${formatPct(report.pre.unknownPathRate)} -> ${formatPct(report.post.unknownPathRate)}`,
    `latched_path_rate:        ${formatPct(report.pre.latchedPathRate)} -> ${formatPct(report.post.latchedPathRate)}`,
    `forecast_prompt_rate:     ${formatPct(report.pre.forecastPromptRate)} -> ${formatPct(report.post.forecastPromptRate)}`,
    `forecast_state_rate:      ${formatPct(report.pre.forecastStateRate)} -> ${formatPct(report.post.forecastStateRate)}`,
    `avg_tool_calls:           ${formatNum(report.pre.avgToolCalls)} -> ${formatNum(report.post.avgToolCalls)}`,
    `error_rate:               ${formatPct(report.pre.errorRate)} -> ${formatPct(report.post.errorRate)}`,
    `avg_repeated_path_streak: ${formatNum(report.pre.avgRepeatedPathStreak)} -> ${formatNum(report.post.avgRepeatedPathStreak)}`,
    `avg_repetition_pressure:  ${formatNum(report.pre.avgRepetitionPressure)} -> ${formatNum(report.post.avgRepetitionPressure)}`,
    `resting_path_rate:        ${formatPct(report.pre.restingPathRate)} -> ${formatPct(report.post.restingPathRate)}`,
    "",
    "## Gate Checks",
  ];

  for (const check of report.gates.checks) {
    const badge = check.pass === null ? "n/a" : check.pass ? "PASS" : "HOLD";
    lines.push(`- [${badge}] ${check.key}: ${check.detail}`);
  }

  lines.push("", `Verdict: ${report.gates.verdict}`);
  if (report.notes.length > 0) {
    lines.push("", "## Notes");
    for (const note of report.notes) {
      lines.push(`- ${note}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(lines.join("\n"));
}

function buildMarkdownReport(report: A3Report): string {
  const lines: string[] = [
    "# A3 Gate Report",
    "",
    `> Generated: ${report.generatedAt}`,
    `> Source: \`${report.source}\``,
    `> Pivot: ${report.pivot.reason} (${report.pivot.runId ?? "n/a"})`,
    `> Heartbeat runs seen: ${report.runs.totalHeartbeatRuns}`,
    "",
    "## Cohorts",
    "",
    `- Pre: ${report.pre.count} runs`,
    `- Post: ${report.post.count} runs`,
    "",
    "## Metrics (Pre -> Post)",
    "",
    "| Metric | Pre | Post |",
    "|---|---:|---:|",
    `| unknown_path_rate | ${formatPct(report.pre.unknownPathRate)} | ${formatPct(report.post.unknownPathRate)} |`,
    `| latched_path_rate | ${formatPct(report.pre.latchedPathRate)} | ${formatPct(report.post.latchedPathRate)} |`,
    `| forecast_prompt_rate | ${formatPct(report.pre.forecastPromptRate)} | ${formatPct(report.post.forecastPromptRate)} |`,
    `| forecast_state_rate | ${formatPct(report.pre.forecastStateRate)} | ${formatPct(report.post.forecastStateRate)} |`,
    `| avg_tool_calls | ${formatNum(report.pre.avgToolCalls)} | ${formatNum(report.post.avgToolCalls)} |`,
    `| error_rate | ${formatPct(report.pre.errorRate)} | ${formatPct(report.post.errorRate)} |`,
    `| avg_repeated_path_streak | ${formatNum(report.pre.avgRepeatedPathStreak)} | ${formatNum(report.post.avgRepeatedPathStreak)} |`,
    `| avg_repetition_pressure | ${formatNum(report.pre.avgRepetitionPressure)} | ${formatNum(report.post.avgRepetitionPressure)} |`,
    `| resting_path_rate | ${formatPct(report.pre.restingPathRate)} | ${formatPct(report.post.restingPathRate)} |`,
    "",
    "## Gate Checks",
    "",
  ];

  for (const check of report.gates.checks) {
    const badge = check.pass === null ? "n/a" : check.pass ? "PASS" : "HOLD";
    lines.push(`- [${badge}] \`${check.key}\`: ${check.detail}`);
  }

  lines.push("", `## Verdict: ${report.gates.verdict}`);

  if (report.notes.length > 0) {
    lines.push("", "## Notes");
    for (const note of report.notes) {
      lines.push(`- ${note}`);
    }
  }

  lines.push("", "## Run IDs", "", `- Pre: ${report.runs.preRunIds.join(", ") || "n/a"}`);
  lines.push(`- Post: ${report.runs.postRunIds.join(", ") || "n/a"}`);
  return lines.join("\n");
}

async function run(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const raw = await fs.readFile(opts.jsonlPath, "utf-8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const heartbeatRuns = parseHeartbeatRuns(lines);
  const report = buildReport(heartbeatRuns, opts);

  if (opts.outPath) {
    const targetPath = path.isAbsolute(opts.outPath)
      ? opts.outPath
      : path.resolve(process.cwd(), opts.outPath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, buildMarkdownReport(report), "utf-8");
    if (!opts.jsonOnly) {
      // eslint-disable-next-line no-console
      console.log(`Wrote markdown report: ${targetPath}`);
    }
  }

  if (opts.jsonOnly) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printHumanReport(report);
  // eslint-disable-next-line no-console
  console.log("\n--- JSON ---");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
}

await run();
