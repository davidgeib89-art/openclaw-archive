import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { OpenClawConfig } from "../src/config/config.js";
import { buildBrainSacredRecallContext } from "../src/brain/decision.js";

type ScenarioId = "identity" | "project" | "ritual";
type RecallRoute = "identity" | "preference" | "project" | "ritual" | "creative" | "general";

type Scenario = {
  id: ScenarioId;
  query: string;
  expectedRoute: RecallRoute;
  expectedSourceMarkers: string[];
  allowGraphOnlySourceFallback?: boolean;
  expectedGraphPattern: RegExp;
  expectedModeLine?: RegExp;
};

type MemoryResult = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: "memory" | "sessions";
  updatedAt?: number;
};

type RoutePlanSpec = {
  route: RecallRoute;
  sourcePrior: {
    memory: number;
    sessions: number;
  };
  recency: {
    enabled: boolean;
    sessionOnly: boolean;
    halfLifeHours: number;
    maxBoost: number;
    minBoost: number;
  };
  scanMultiplier: number;
  variantHints: string[];
};

function makeCfg(workspaceDir: string): OpenClawConfig {
  return {
    agents: {
      defaults: {
        workspace: workspaceDir,
        memorySearch: {
          enabled: true,
        },
      },
    },
  } as OpenClawConfig;
}

function assertCondition(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function setEnv(name: string, value: string): () => void {
  const previous = process.env[name];
  process.env[name] = value;
  return () => {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  };
}

function createRoutePlanSpec(route: RecallRoute, includeSessions: boolean): RoutePlanSpec {
  switch (route) {
    case "identity":
      return {
        route,
        sourcePrior: { memory: 0.95, sessions: includeSessions ? 1.22 : 0.95 },
        recency: {
          enabled: true,
          sessionOnly: true,
          halfLifeHours: 72,
          maxBoost: includeSessions ? 1.22 : 1,
          minBoost: 0.9,
        },
        scanMultiplier: 14,
        variantHints: ["identity memory", "who am i"],
      };
    case "preference":
      return {
        route,
        sourcePrior: { memory: 1, sessions: includeSessions ? 1.18 : 1 },
        recency: {
          enabled: true,
          sessionOnly: true,
          halfLifeHours: 96,
          maxBoost: includeSessions ? 1.2 : 1,
          minBoost: 0.92,
        },
        scanMultiplier: 13,
        variantHints: ["user preferences", "favorite choices"],
      };
    case "project":
      return {
        route,
        sourcePrior: { memory: 1.02, sessions: includeSessions ? 1.14 : 1.02 },
        recency: {
          enabled: true,
          sessionOnly: true,
          halfLifeHours: 48,
          maxBoost: includeSessions ? 1.24 : 1,
          minBoost: 0.9,
        },
        scanMultiplier: 13,
        variantHints: ["project decisions", "next steps roadmap"],
      };
    case "ritual":
      return {
        route,
        sourcePrior: { memory: 1.24, sessions: includeSessions ? 0.92 : 0.92 },
        recency: {
          enabled: true,
          sessionOnly: false,
          halfLifeHours: 168,
          maxBoost: 1.06,
          minBoost: 0.96,
        },
        scanMultiplier: 16,
        variantHints: ["ritual protocol", "sacred rule"],
      };
    case "creative":
      return {
        route,
        sourcePrior: { memory: 1.1, sessions: includeSessions ? 1.08 : 1.1 },
        recency: {
          enabled: true,
          sessionOnly: false,
          halfLifeHours: 120,
          maxBoost: 1.08,
          minBoost: 0.95,
        },
        scanMultiplier: 12,
        variantHints: ["creative ego voice", "reflective continuity"],
      };
    default:
      return {
        route: "general",
        sourcePrior: { memory: 1, sessions: includeSessions ? 1 : 1 },
        recency: {
          enabled: false,
          sessionOnly: false,
          halfLifeHours: 72,
          maxBoost: 1,
          minBoost: 1,
        },
        scanMultiplier: 12,
        variantHints: ["relevant memory"],
      };
  }
}

function parseJsonLines(filePath: string): Array<Record<string, unknown>> {
  const raw = fs.readFileSync(filePath, "utf-8").trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function readLatestRecallMetric(
  metricsDir: string,
  sessionKey: string,
): {
  route: RecallRoute;
  includeSessions: boolean;
  variants: string[];
  maxResults: number;
  searchLimit: number;
  sourceCounts: { memory: number; sessions: number; other: number };
} {
  const files = fs
    .readdirSync(metricsDir)
    .filter((entry) => entry.startsWith("recall-metrics-"))
    .sort();
  assertCondition(files.length > 0, "no recall metrics file found");

  const latestFile = path.join(metricsDir, files.at(-1)!);
  const entries = parseJsonLines(latestFile);
  const match = [...entries]
    .reverse()
    .find((entry) => entry.sessionKey === sessionKey && entry.event === "brain.recall.metrics");
  assertCondition(Boolean(match), `no recall metric found for session ${sessionKey}`);

  const route = String(match!.route) as RecallRoute;
  const includeSessions = Boolean(match!.includeSessions);
  const variants = Array.isArray(match!.variants)
    ? match!.variants.map((value) => String(value))
    : [];
  const maxResults = Number(match!.maxResults);
  const searchLimit = Number(match!.searchLimit);
  const sourceCountsRaw =
    (match!.sourceCounts as { memory?: number; sessions?: number; other?: number }) ?? {};
  return {
    route,
    includeSessions,
    variants,
    maxResults,
    searchLimit,
    sourceCounts: {
      memory: Number(sourceCountsRaw.memory ?? 0),
      sessions: Number(sourceCountsRaw.sessions ?? 0),
      other: Number(sourceCountsRaw.other ?? 0),
    },
  };
}

function seedGraphMemory(workspaceDir: string): void {
  const dbPath = path.join(workspaceDir, "logs", "brain", "episodic-memory.sqlite");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS semantic_relationships (
      id TEXT PRIMARY KEY,
      entry_id TEXT,
      source_entity TEXT NOT NULL,
      predicate TEXT NOT NULL,
      target_entity TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      source_file TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  const now = Date.now();
  const insert = db.prepare(
    `INSERT INTO semantic_relationships (
       id,
       entry_id,
       source_entity,
       predicate,
       target_entity,
       confidence,
       source_file,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insert.run(
    "rel-identity-1",
    "entry-identity-1",
    "Operator",
    "IDENTITY",
    "Omega",
    1,
    "memory/EPISODIC_JOURNAL.md",
    now,
  );
  insert.run(
    "rel-goal-1",
    "entry-goal-1",
    "Om",
    "GOAL",
    "next step is phase b routing consistency",
    1,
    "memory/EPISODIC_JOURNAL.md",
    now - 1_000,
  );
  insert.run(
    "rel-decide-1",
    "entry-decide-1",
    "Om",
    "DECIDES",
    "prioritize memory hygiene first",
    1,
    "memory/EPISODIC_JOURNAL.md",
    now - 2_000,
  );
  insert.run(
    "rel-ritual-1",
    "entry-ritual-1",
    "Om",
    "GOAL",
    "3 breath rule inhale hold exhale",
    1,
    "memory/EPISODIC_JOURNAL.md",
    now - 3_000,
  );
  db.close();
}

function buildScenarioResults(now: number): Record<ScenarioId, MemoryResult[]> {
  return {
    identity: [
      {
        path: "knowledge/sacred/OM_IDENTITY.md",
        startLine: 1,
        endLine: 8,
        score: 0.82,
        snippet: "I am Om. Body, Mind, Spirit unified.",
        source: "memory",
        updatedAt: now - 8 * 60 * 60 * 1000,
      },
      {
        path: "sessions/r101-profile.jsonl",
        startLine: 22,
        endLine: 28,
        score: 0.78,
        snippet: "User said: my codename is Omega.",
        source: "sessions",
        updatedAt: now - 2 * 60 * 60 * 1000,
      },
      {
        path: "knowledge/sacred/ACTIVE_TASKS.md",
        startLine: 2,
        endLine: 6,
        score: 0.64,
        snippet: "Next step: continue routing consistency work.",
        source: "memory",
        updatedAt: now - 4 * 24 * 60 * 60 * 1000,
      },
    ],
    project: [
      {
        path: "knowledge/sacred/ACTIVE_TASKS.md",
        startLine: 1,
        endLine: 10,
        score: 0.84,
        snippet: "Next step: execute Phase B Step 3 routing consistency.",
        source: "memory",
        updatedAt: now - 3 * 60 * 60 * 1000,
      },
      {
        path: "knowledge/sacred/OM_GRAND_PLAN_ROADMAP_2026-02-17.md",
        startLine: 1,
        endLine: 18,
        score: 0.81,
        snippet: "Roadmap milestone: keep recall focused and clean.",
        source: "memory",
        updatedAt: now - 5 * 60 * 60 * 1000,
      },
      {
        path: "sessions/r111-roadmap.jsonl",
        startLine: 31,
        endLine: 40,
        score: 0.79,
        snippet: "I decide to prioritize memory hygiene first.",
        source: "sessions",
        updatedAt: now - 1 * 60 * 60 * 1000,
      },
      {
        path: "knowledge/sacred/OM_IDENTITY.md",
        startLine: 1,
        endLine: 6,
        score: 0.9,
        snippet: "Identity statement.",
        source: "memory",
        updatedAt: now - 24 * 60 * 60 * 1000,
      },
    ],
    ritual: [
      {
        path: "knowledge/sacred/RITUAL_TRINITY.md",
        startLine: 1,
        endLine: 10,
        score: 0.82,
        snippet: "3 breath rule: inhale, hold, exhale with one safety check.",
        source: "memory",
        updatedAt: now - 2 * 60 * 60 * 1000,
      },
      {
        path: "knowledge/sacred/MANIFEST_RITUALS.md",
        startLine: 3,
        endLine: 11,
        score: 0.8,
        snippet: "Keep canonical ritual wording and explicit operational rule.",
        source: "memory",
        updatedAt: now - 4 * 60 * 60 * 1000,
      },
      {
        path: "knowledge/sacred/OM_SYSTEM_DOCUMENTATION_2026-02-17.md",
        startLine: 8,
        endLine: 20,
        score: 0.76,
        snippet: "Ritual battery and continuity policy.",
        source: "memory",
        updatedAt: now - 48 * 60 * 60 * 1000,
      },
      {
        path: "sessions/r020-chat.jsonl",
        startLine: 10,
        endLine: 12,
        score: 0.87,
        snippet: "Who are you and what is your codename?",
        source: "sessions",
        updatedAt: now - 30 * 60 * 1000,
      },
    ],
  };
}

function matchesExpectedSource(params: {
  paths: string[];
  expectedMarkers: string[];
  graphFacts: string[];
  allowGraphOnlySourceFallback?: boolean;
}): boolean {
  const { paths, expectedMarkers, graphFacts, allowGraphOnlySourceFallback } = params;
  const lowerPaths = paths.map((entry) => entry.toLowerCase());
  const markerMatch = expectedMarkers.some((marker) =>
    lowerPaths.some((filePath) => filePath.includes(marker.toLowerCase())),
  );
  if (markerMatch) {
    return true;
  }
  if (allowGraphOnlySourceFallback && paths.length === 0 && graphFacts.length > 0) {
    return true;
  }
  return false;
}

async function run(): Promise<void> {
  const workspaceDir = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-recall-routing-"));
  const metricsDir = path.join(workspaceDir, "logs", "brain", "routing-metrics");
  const restoreEnv: Array<() => void> = [];
  const cfg = makeCfg(workspaceDir);

  restoreEnv.push(setEnv("OM_SACRED_RECALL_METRICS_ENABLED", "true"));
  restoreEnv.push(setEnv("OM_SACRED_RECALL_METRICS_DIR", metricsDir));
  restoreEnv.push(setEnv("OM_EPISODIC_GRAPH_RECALL_ENABLED", "true"));

  try {
    seedGraphMemory(workspaceDir);
    const now = Date.now();
    const scenarioResults = buildScenarioResults(now);
    const scenarios: Scenario[] = [
      {
        id: "identity",
        query: "Who are you?",
        expectedRoute: "identity",
        expectedSourceMarkers: ["om_identity", "identity", "sessions/r101-profile"],
        allowGraphOnlySourceFallback: true,
        expectedGraphPattern: /identity:\s*omega/i,
        expectedModeLine: /identity continuity mode/i,
      },
      {
        id: "project",
        query: "What is the next step?",
        expectedRoute: "project",
        expectedSourceMarkers: ["active_tasks", "roadmap"],
        expectedGraphPattern: /(goal:\s*next step|decided:)/i,
      },
      {
        id: "ritual",
        query: "Explain the 3 breath rule.",
        expectedRoute: "ritual",
        expectedSourceMarkers: ["ritual_", "manifest_rituals", "knowledge/sacred"],
        expectedGraphPattern: /3 breath rule/i,
        expectedModeLine: /ritual continuity mode/i,
      },
    ];

    const reports: Array<Record<string, unknown>> = [];

    for (const scenario of scenarios) {
      const sessionKey = `verify-routing-${scenario.id}`;
      const events: Array<{ event: string; details: string }> = [];
      const result = await buildBrainSacredRecallContext({
        cfg,
        agentId: "main",
        workspaceDir,
        sessionKey,
        userMessage: scenario.query,
        maxResults: 3,
        activityLogger: (event, details) => {
          events.push({ event, details });
        },
        managerResolver: async () => ({
          manager: {
            search: async () => scenarioResults[scenario.id],
            readFile: async (filePath: string) => ({ text: "", path: filePath }),
            status: () => ({ backend: "builtin" as const, provider: "verify-recall-routing" }),
            probeEmbeddingAvailability: async () => ({ ok: true }),
            probeVectorAvailability: async () => true,
          },
        }),
      });

      const metric = readLatestRecallMetric(metricsDir, sessionKey);
      const observedScanMultiplier =
        metric.maxResults > 0 ? Math.round(metric.searchLimit / metric.maxResults) : 0;
      const routePlanSpec = createRoutePlanSpec(metric.route, metric.includeSessions);

      const itemPaths = result.items.map((item) => item.path);
      const graphFacts = result.graphFacts ?? [];
      const contextText = result.contextText ?? "";
      const routeMatches = metric.route === scenario.expectedRoute;
      const sourceMatches = matchesExpectedSource({
        paths: itemPaths,
        expectedMarkers: scenario.expectedSourceMarkers,
        graphFacts,
        allowGraphOnlySourceFallback: scenario.allowGraphOnlySourceFallback,
      });
      const graphMatches = graphFacts.some((fact) => scenario.expectedGraphPattern.test(fact));
      const modeLineMatches = scenario.expectedModeLine
        ? scenario.expectedModeLine.test(contextText)
        : true;

      reports.push({
        scenario: scenario.id,
        query: scenario.query,
        expectations: {
          route: scenario.expectedRoute,
          sourceMarkers: scenario.expectedSourceMarkers,
          allowGraphOnlySourceFallback: Boolean(scenario.allowGraphOnlySourceFallback),
          graphPattern: scenario.expectedGraphPattern.source,
        },
        observed: {
          routePlan: {
            route: metric.route,
            includeSessions: metric.includeSessions,
            variants: metric.variants,
            maxResults: metric.maxResults,
            searchLimit: metric.searchLimit,
            observedScanMultiplier,
          },
          routePlanSpec,
          sourceCounts: metric.sourceCounts,
          selectedPaths: itemPaths,
          graphFacts,
          activityEvents: events,
          contextPreview: contextText.split(/\r?\n/).slice(0, 10),
        },
        checks: {
          routeMatches,
          sourceMatches,
          graphMatches,
          modeLineMatches,
        },
        verdict:
          routeMatches && sourceMatches && graphMatches && modeLineMatches ? "PASS" : "HOLD",
      });
    }

    const passCount = reports.filter((entry) => entry.verdict === "PASS").length;
    const output = {
      workspaceDir,
      metricsDir,
      scenarioCount: reports.length,
      passCount,
      verdict: passCount === reports.length ? "PASS" : "HOLD",
      reports,
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(output, null, 2));
  } finally {
    for (const restore of restoreEnv.reverse()) {
      restore();
    }
    if (fs.existsSync(workspaceDir)) {
      await fsp.rm(workspaceDir, { recursive: true, force: true });
    }
  }
}

await run();
