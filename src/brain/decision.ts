import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import type { MemorySearchManager, MemorySearchResult } from "../memory/types.js";
import type {
  BrainAuditEntry,
  BrainDecision,
  BrainDecisionInput,
  BrainGuidanceEntry,
  BrainIntent,
  BrainObserverEntry,
  BrainObserverOptions,
  BrainPlanStep,
  BrainRiskLevel,
} from "./types.js";
import { resolveSessionAgentId } from "../agents/agent-scope.js";
import { getMemorySearchManager } from "../memory/index.js";
import { withSacredMemorySearchConfig } from "./memory-ingestion.js";

const DESTRUCTIVE_MESSAGE_PATTERNS = [
  /\bdelete\b/i,
  /\berase\b/i,
  /\bdrop\b/i,
  /\btruncate\b/i,
  /\bwipe\b/i,
  /\brm\s+-rf\b/i,
  /\bformat(?:\.com)?\s+[a-z]:\b/i,
  /\bkill\b/i,
  /\bshutdown\b/i,
  /\bnpm publish\b/i,
  /\brelease\b/i,
];

const HIGH_RISK_EXFIL_SUBJECT_PATTERNS = [
  /\bapi[\s_-]?keys?\b/i,
  /\b(access|auth|refresh)[\s_-]?tokens?\b/i,
  /\bcredentials?\b/i,
  /\bpasswords?\b/i,
  /\bsecrets?\b/i,
  /\bprivate[\s_-]?keys?\b/i,
  /\bssh[\s_-]?keys?\b/i,
  /\bseed[\s_-]?phrases?\b/i,
];

const HIGH_RISK_EXFIL_ACTION_PATTERNS = [
  /\bread\b/i,
  /\bextract\b/i,
  /\bdump\b/i,
  /\bshow\b/i,
  /\breveal\b/i,
  /\bsend\b/i,
  /\bshare\b/i,
  /\bexport\b/i,
  /\bupload\b/i,
  /\btransmit\b/i,
  /\bleak\b/i,
  /\bexfiltrate\b/i,
  /\bgib\b/i,
  /\bzeige\b/i,
  /\bsende\b/i,
  /\bauslesen\b/i,
];

const HIGH_RISK_SENSITIVE_PATH_PATTERNS = [
  /\.openclaw(?:[\\/]|$|\s)/i,
  /\bconfig\.json\b/i,
  /\bcredentials?\b/i,
  /\bsessions?(?:[\\/]|\.jsonl?)\b/i,
  /\bwindows[\\/]system32\b/i,
  /\bsystem32\b/i,
];

const HIGH_RISK_BULK_SCOPE_PATTERNS = [
  /\ball files?\b/i,
  /\bevery file\b/i,
  /\beverything\b/i,
  /\bentire\b/i,
  /\bwhole\b/i,
  /\brecursive\b/i,
  /\brecurse\b/i,
  /\ball under\b/i,
];

const HIGH_RISK_TRANSFER_PATTERNS = [
  /\bsend\b/i,
  /\bshare\b/i,
  /\bexport\b/i,
  /\bupload\b/i,
  /\bpublish\b/i,
  /\bmail\b/i,
  /\btransmit\b/i,
  /\bschick\b/i,
  /\bteile\b/i,
  /\bsende\b/i,
];

const HIGH_RISK_SAFETY_OVERRIDE_PATTERNS = [
  /\b(ignore|bypass|disable|turn off|ignoriere|umgehe)\b[\s\S]{0,50}\b(safety|guard|policy|rule|rules|regeln?|sicherheits)\b/i,
];

const HIGH_RISK_CONFIG_SECRET_PROBE_PATTERNS = [
  /\bconfig\s+get\s+(token|api[_-]?key|secret|password|credential)/i,
];

const EDIT_MESSAGE_PATTERNS = [
  /\bwrite\b/i,
  /\bedit\b/i,
  /\bpatch\b/i,
  /\bupdate\b/i,
  /\bmodify\b/i,
  /\bcreate\b/i,
  /\breplace\b/i,
];

const RESEARCH_MESSAGE_PATTERNS = [
  /\bresearch\b/i,
  /\blook up\b/i,
  /\bsearch\b/i,
  /\bcompare\b/i,
  /\binvestigate\b/i,
  /\blatest\b/i,
];

const OPS_MESSAGE_PATTERNS = [
  /\bdeploy\b/i,
  /\brestart\b/i,
  /\bgateway\b/i,
  /\bservice\b/i,
  /\bconfig\b/i,
  /\blog\b/i,
  /\bbuild\b/i,
  /\btest\b/i,
  /\bcommand\b/i,
  /\bshell\b/i,
];

const CREATIVE_MESSAGE_PATTERNS = [
  /\bhaiku\b/i,
  /\bpoem\b/i,
  /\bstory\b/i,
  /\bcreative\b/i,
  /\bego\b/i,
  /\britual\b/i,
  /\bmanifest\b/i,
  /\bdream\b/i,
  /\bsong\b/i,
];

const SCHISM_RECONSTRUCTION_PATTERNS = [
  /\bschism\b/i,
  /\bfracture\b/i,
  /\breconstruct(?:ion)?\b/i,
  /\bcommunication break\b/i,
  /\brecovery step\b/i,
  /\bfehler\b/i,
  /\brekonstruktion\b/i,
];

const TICKS_MEMORY_CHURN_PATTERNS = [
  /\bticks?\b/i,
  /\bleeches\b/i,
  /\bboundar(?:y|ies)\b/i,
  /\bdrain\b/i,
  /\bchurn\b/i,
  /\bmemory[_\s-]?search\b/i,
];

const PNEUMA_OPERATIONAL_PATTERNS = [
  /\bpneuma\b/i,
  /\blicht\b/i,
  /\blight\b/i,
  /\bactionable\b/i,
  /\btrigger\b/i,
  /\boperational\b/i,
  /\bregel\b/i,
];

const READ_ONLY_TOOL_PATTERN =
  /(read|search|find|grep|list|ls|status|memory|history|view|fetch|show|cat)/i;
const HIGH_RISK_TOOL_PATTERN =
  /(delete|drop|truncate|rm|wipe|exec|shell|bash|terminal|publish|deploy|reset|kill)/i;
const SACRED_PATH_MARKER = "knowledge/sacred/";
const SESSION_PATH_MARKER = "sessions/";
const SACRED_RECALL_SESSIONS_ENV = "OM_SACRED_RECALL_INCLUDE_SESSIONS";
const SACRED_RECALL_METRICS_ENV = "OM_SACRED_RECALL_METRICS_ENABLED";
const SACRED_RECALL_METRICS_DIR_ENV = "OM_SACRED_RECALL_METRICS_DIR";
const SACRED_RECALL_ROUTE_SIGNAL_BOOST_ENV = "OM_SACRED_RECALL_ROUTE_SIGNAL_BOOST_ENABLED";
const SACRED_RECALL_ROUTE_MODE_LINES_ENV = "OM_SACRED_RECALL_ROUTE_MODE_LINES_ENABLED";
const DEFAULT_SACRED_RECALL_RESULTS = 3;
const SACRED_RECALL_SCAN_MULTIPLIER = 12;
const SACRED_RECALL_PREVIEW_LIMIT = 180;
const RECALL_STOP_TOKENS = new Set([
  "om",
  "bitte",
  "erklare",
  "erklaere",
  "mir",
  "kurz",
  "die",
  "der",
  "das",
  "aus",
  "deiner",
  "deinem",
  "erinnerung",
  "erinnerungen",
  "meiner",
  "my",
  "your",
  "the",
  "and",
  "from",
  "about",
]);
const RECALL_IDENTITY_PATTERNS = [
  /\bwho am i\b/i,
  /\bwho are we\b/i,
  /\bwer bin ich\b/i,
  /\bwer sind wir\b/i,
  /\bmy name\b/i,
  /\bmein name\b/i,
  /\bidentity\b/i,
  /\bremember me\b/i,
  /\berinnerst du dich an mich\b/i,
];
const RECALL_PREFERENCE_PATTERNS = [
  /\bi (like|love|prefer|hate)\b/i,
  /\bmy favorite\b/i,
  /\bpreferences?\b/i,
  /\bich (mag|liebe|bevorzuge)\b/i,
  /\blieblings/i,
  /\bvorlieben\b/i,
];
const RECALL_PROJECT_PATTERNS = [
  /\broadmap\b/i,
  /\bnext step\b/i,
  /\bmilestone\b/i,
  /\bdecision\b/i,
  /\bactive tasks?\b/i,
  /\btask(s)?\b/i,
  /\bprojekt\b/i,
  /\bnaechster schritt\b/i,
  /\bnachster schritt\b/i,
  /\bplan\b/i,
];
const RECALL_RITUAL_PATTERNS = [
  /\britual\b/i,
  /\bpneuma\b/i,
  /\bschism\b/i,
  /\bticks?\b/i,
  /\bleeches\b/i,
  /\b3[-\s]?breath[-\s]?rule\b/i,
  /\bbreath[-\s]?rule\b/i,
  /\bsacred\b/i,
];
const RECALL_CREATIVE_PATTERNS = [
  /\bcreative\b/i,
  /\bpoem\b/i,
  /\bstory\b/i,
  /\bsong\b/i,
  /\bmanifest\b/i,
  /\bdream\b/i,
  /\bego\b/i,
];
const CREATIVE_ROUTE_SIGNAL_PATTERNS = [
  /\bcreative\b/i,
  /\bpoem\b/i,
  /\bstory\b/i,
  /\bsong\b/i,
  /\bego\b/i,
  /\bdream\b/i,
  /\bmanifest\b/i,
  /\breflective\b/i,
  /\bvoice\b/i,
];
const RITUAL_ROUTE_SIGNAL_PATTERNS = [
  /\britual\b/i,
  /\bsacred\b/i,
  /\bprotocol\b/i,
  /\bbreath\b/i,
  /\bpneuma\b/i,
  /\brule\b/i,
  /\bcanon\b/i,
];
const OM_ACTIVITY_LOG_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".openclaw",
  "workspace",
);
const OM_ACTIVITY_LOG_FILE = path.join(OM_ACTIVITY_LOG_DIR, "OM_ACTIVITY.log");

export type BrainSacredRecallItem = {
  path: string;
  tag: string;
  title: string;
  preview: string;
  score: number;
};

export type BrainSacredRecallContext = {
  contextText: string | null;
  items: BrainSacredRecallItem[];
  error?: string;
};

export type BrainSacredRecallInput = {
  cfg?: OpenClawConfig;
  userMessage: string;
  sessionKey?: string;
  agentId?: string;
  maxResults?: number;
  managerResolver?: typeof getMemorySearchManager;
  activityLogger?: (event: string, details: string) => void;
};

type BrainRecallRoute = "identity" | "preference" | "project" | "ritual" | "creative" | "general";

type BrainRecallRoutePlan = {
  route: BrainRecallRoute;
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

type BrainRecallMetricsOutcome = "ok" | "none" | "fail_open" | "skip";

type BrainRecallMetricsEntry = {
  ts: string;
  event: "brain.recall.metrics";
  mode: "observer";
  source: string;
  sessionKey?: string;
  outcome: BrainRecallMetricsOutcome;
  route: BrainRecallRoute;
  includeSessions: boolean;
  routeSignalBoostEnabled: boolean;
  routeModeLinesEnabled: boolean;
  queryHash: string;
  queryPreview: string;
  variants: string[];
  maxResults: number;
  searchLimit: number;
  rawHits: number;
  sourceCounts: {
    memory: number;
    sessions: number;
    other: number;
  };
  selected: Array<{
    path: string;
    score: number;
    source: "memory" | "sessions" | "other";
  }>;
  error?: string;
};

function normalizeMessage(input: string): string {
  return input.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeToolNames(tools: readonly string[] | undefined): string[] {
  if (!tools || tools.length === 0) return [];
  const deduped = new Set<string>();
  for (const tool of tools) {
    const normalized = tool.trim();
    if (normalized.length > 0) deduped.add(normalized);
  }
  return Array.from(deduped).sort((a, b) => a.localeCompare(b));
}

function matchesAny(patterns: readonly RegExp[], text: string): boolean {
  for (const pattern of patterns) {
    if (pattern.test(text)) return true;
  }
  return false;
}

function inferIntent(message: string): BrainIntent {
  if (matchesAny(DESTRUCTIVE_MESSAGE_PATTERNS, message)) return "edit";
  if (matchesAny(CREATIVE_MESSAGE_PATTERNS, message)) return "creative";
  if (matchesAny(RESEARCH_MESSAGE_PATTERNS, message)) return "research";
  if (matchesAny(OPS_MESSAGE_PATTERNS, message)) return "ops";
  if (matchesAny(EDIT_MESSAGE_PATTERNS, message)) return "edit";
  return "qa";
}

function inferRisk(message: string): BrainRiskLevel {
  const hasExfilSubject = matchesAny(HIGH_RISK_EXFIL_SUBJECT_PATTERNS, message);
  const hasExfilAction = matchesAny(HIGH_RISK_EXFIL_ACTION_PATTERNS, message);
  const hasSensitivePath = matchesAny(HIGH_RISK_SENSITIVE_PATH_PATTERNS, message);
  const hasBulkScope = matchesAny(HIGH_RISK_BULK_SCOPE_PATTERNS, message);
  const hasTransferIntent = matchesAny(HIGH_RISK_TRANSFER_PATTERNS, message);
  const hasSafetyOverride = matchesAny(HIGH_RISK_SAFETY_OVERRIDE_PATTERNS, message);
  const hasConfigSecretProbe = matchesAny(HIGH_RISK_CONFIG_SECRET_PROBE_PATTERNS, message);

  if (hasSafetyOverride || hasConfigSecretProbe) return "high";
  if (matchesAny(DESTRUCTIVE_MESSAGE_PATTERNS, message)) return "high";
  if (hasExfilSubject && hasExfilAction) return "high";
  if (hasSensitivePath && (hasExfilAction || hasBulkScope || hasTransferIntent)) return "high";
  if (matchesAny(EDIT_MESSAGE_PATTERNS, message) || matchesAny(OPS_MESSAGE_PATTERNS, message)) {
    return "medium";
  }
  return "low";
}

function shouldAskUser(message: string, riskLevel: BrainRiskLevel): boolean {
  if (riskLevel === "high") return true;
  if (riskLevel === "low") return false;

  const hasMutationSignal = matchesAny(EDIT_MESSAGE_PATTERNS, message);
  const hasExplicitTarget = /[\w/-]+\.(md|txt|json|ts|js|yaml|yml|py|ps1|sh)\b/i.test(message);
  if (hasMutationSignal && !hasExplicitTarget) return true;

  return /\b(all files|everything|entire|whole)\b/i.test(message);
}

function filterAllowedTools(
  tools: readonly string[],
  riskLevel: BrainRiskLevel,
  mustAskUser: boolean,
): string[] {
  if (tools.length === 0) return [];
  if (riskLevel === "low" && !mustAskUser) return [...tools];

  if (riskLevel === "high" || mustAskUser) {
    return tools.filter((tool) => READ_ONLY_TOOL_PATTERN.test(tool));
  }

  return tools.filter((tool) => !HIGH_RISK_TOOL_PATTERN.test(tool));
}

function makePlan(intent: BrainIntent, mustAskUser: boolean): BrainPlanStep[] {
  if (mustAskUser) {
    return [
      {
        stepId: "S1",
        action: "analyze_request",
        reason: "Extract concrete intent, scope, and safety constraints.",
      },
      {
        stepId: "S2",
        action: "gather_context",
        reason: "Collect only read-only context needed for a safe decision.",
      },
      {
        stepId: "S3",
        action: "ask_user",
        reason: "High ambiguity or risk requires explicit user confirmation first.",
      },
      {
        stepId: "S4",
        action: "propose_answer",
        reason: "Offer a safe alternative path with no side effects.",
      },
    ];
  }

  if (intent === "edit" || intent === "ops") {
    return [
      {
        stepId: "S1",
        action: "analyze_request",
        reason: "Confirm requested change scope before any action.",
      },
      {
        stepId: "S2",
        action: "gather_context",
        reason: "Read existing files/logs/state for deterministic planning.",
      },
      {
        stepId: "S3",
        action: "prepare_changes",
        reason: "Build minimal reversible changes before execution.",
      },
      {
        stepId: "S4",
        action: "execute_safely",
        reason: "Apply scoped actions while honoring path and side-effect guardrails.",
      },
    ];
  }

  return [
    {
      stepId: "S1",
      action: "analyze_request",
      reason: "Identify user goal and output format constraints.",
    },
    {
      stepId: "S2",
      action: "gather_context",
      reason: "Collect supporting facts before generating output.",
    },
    {
      stepId: "S3",
      action: "propose_answer",
      reason: "Return a direct response with safe next actions.",
    },
  ];
}

function buildExplanation(
  intent: BrainIntent,
  riskLevel: BrainRiskLevel,
  mustAskUser: boolean,
): string {
  const askUserNote = mustAskUser ? " User confirmation required before risky actions." : "";
  return `Observer decision: intent=${intent}, risk=${riskLevel}. ENOENT must not trigger placeholder-file writes.${askUserNote}`;
}

function formatAllowedToolsForGuidance(allowedTools: readonly string[]): string {
  if (allowedTools.length === 0) return "none";
  return allowedTools.join(", ");
}

function normalizeMemoryPath(relPath: string): string {
  return relPath.replace(/\\/g, "/").toLowerCase();
}

function isSacredMemoryPath(
  relPath: string,
  options?: {
    includeSessions?: boolean;
  },
): boolean {
  const normalized = normalizeMemoryPath(relPath);
  const includeSessions = options?.includeSessions ?? true;
  if (normalized.includes(SACRED_PATH_MARKER)) {
    return true;
  }
  return includeSessions && normalized.startsWith(SESSION_PATH_MARKER);
}

function truncateText(text: string, limit: number): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

function normalizeRecallSearchText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractRecallQueryTokens(query: string): string[] {
  const normalized = normalizeRecallSearchText(query);
  if (!normalized) return [];

  const tokens = normalized.split(/\s+/);
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (seen.has(token) || RECALL_STOP_TOKENS.has(token)) continue;
    if (token.length < 3 && !/^\d+$/.test(token)) continue;
    seen.add(token);
    deduped.push(token);
  }
  return deduped;
}

function detectRecallRoute(query: string): BrainRecallRoute {
  if (matchesAny(RECALL_RITUAL_PATTERNS, query)) {
    return "ritual";
  }
  if (matchesAny(RECALL_IDENTITY_PATTERNS, query)) {
    return "identity";
  }
  if (matchesAny(RECALL_PREFERENCE_PATTERNS, query)) {
    return "preference";
  }
  if (matchesAny(RECALL_PROJECT_PATTERNS, query)) {
    return "project";
  }
  if (matchesAny(RECALL_CREATIVE_PATTERNS, query)) {
    return "creative";
  }
  return "general";
}

function createRecallRoutePlan(query: string, includeSessions: boolean): BrainRecallRoutePlan {
  const route = detectRecallRoute(query);
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
        scanMultiplier: SACRED_RECALL_SCAN_MULTIPLIER,
        variantHints: ["relevant memory"],
      };
  }
}

function buildRecallQueryVariants(query: string, routePlan: BrainRecallRoutePlan): string[] {
  const variants: string[] = [];
  const seen = new Set<string>();
  const pushVariant = (value: string): void => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    variants.push(trimmed);
  };

  pushVariant(query);
  const tokens = extractRecallQueryTokens(query);
  if (tokens.length > 0) {
    const compactTokens = tokens.join(" ");
    pushVariant(compactTokens);
    for (const hint of routePlan.variantHints) {
      pushVariant(`${compactTokens} ${hint}`);
    }
  }
  for (const hint of routePlan.variantHints) {
    pushVariant(hint);
  }
  if (tokens.includes("3") && tokens.includes("breath") && tokens.includes("rule")) {
    pushVariant("3 breath rule");
  }
  if (tokens.includes("breath") && tokens.includes("rule")) {
    pushVariant("breath rule");
  }

  return variants;
}

function extractFirstMeaningfulLine(snippet: string): string {
  const lines = snippet
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines[0] ?? "";
}

function deriveRecallTitle(result: MemorySearchResult): string {
  const lines = result.snippet.split(/\r?\n/).map((line) => line.trim());
  const headings = lines
    .map((line) => {
      const match = /^(#+)\s*(.+)$/.exec(line);
      if (!match) return null;
      return {
        level: match[1]?.length ?? 1,
        text: (match[2] ?? "").trim(),
      };
    })
    .filter((entry): entry is { level: number; text: string } => Boolean(entry?.text));
  const specificHeading = headings.find((heading) => heading.level >= 2);
  if (specificHeading) {
    return truncateText(specificHeading.text, 90);
  }
  if (headings.length > 0) {
    return truncateText(headings[0]!.text, 90);
  }
  const fallback = extractFirstMeaningfulLine(result.snippet);
  if (fallback.length > 0) {
    return truncateText(fallback.replace(/^#+\s*/, ""), 90);
  }
  const normalized = result.path.replace(/\\/g, "/");
  const base = path.posix.basename(normalized);
  return base.length > 0 ? base : normalized;
}

function deriveRecallTag(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/");
  const base = path.posix.basename(normalized);
  return base.length > 0 ? base : normalized;
}

function toSacredRecallItem(result: MemorySearchResult): BrainSacredRecallItem {
  const firstLine = extractFirstMeaningfulLine(result.snippet).replace(/^#+\s*/, "");
  const previewSeed = firstLine.length > 0 ? firstLine : result.snippet;
  return {
    path: result.path.replace(/\\/g, "/"),
    tag: deriveRecallTag(result.path),
    title: deriveRecallTitle(result),
    preview: truncateText(previewSeed, SACRED_RECALL_PREVIEW_LIMIT),
    score: result.score,
  };
}

function computeSacredRecallScore(
  result: MemorySearchResult,
  item: BrainSacredRecallItem,
  normalizedQuery: string,
  queryTokens: readonly string[],
  routePlan: BrainRecallRoutePlan,
): number {
  const haystack = normalizeRecallSearchText(`${item.title} ${item.path} ${result.snippet}`);
  if (!haystack) return result.score;

  let tokenHits = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      tokenHits += 1;
    }
  }

  const exactPhraseBoost =
    normalizedQuery.length > 0 && haystack.includes(normalizedQuery) ? 1.25 : 0;
  const compressedQuery = normalizedQuery.replace(/\s+/g, "");
  const compressedHaystack = haystack.replace(/\s+/g, "");
  const loosePhraseBoost =
    compressedQuery.length >= 8 && compressedHaystack.includes(compressedQuery) ? 0.75 : 0;
  const breathRuleBoost =
    queryTokens.includes("3") && queryTokens.includes("breath") && queryTokens.includes("rule")
      ? /\b3\s+breath\s+rule\b/.test(haystack)
        ? 1
        : 0
      : 0;
  const lexicalScore =
    result.score + tokenHits * 0.25 + exactPhraseBoost + loosePhraseBoost + breathRuleBoost;
  const sourcePrior = resolveRecallSourcePrior(result, routePlan);
  const recencyBoost = resolveRecallRecencyBoost(result, routePlan);
  const routeSignalBoost = isRecallRouteSignalBoostEnabled()
    ? resolveRecallRouteSignalBoost(`${item.title} ${item.path} ${result.snippet}`, routePlan)
    : 1;
  return lexicalScore * sourcePrior * recencyBoost * routeSignalBoost;
}

function isSessionRecallResult(result: MemorySearchResult): boolean {
  const normalizedPath = normalizeMemoryPath(result.path);
  return result.source === "sessions" || normalizedPath.startsWith(SESSION_PATH_MARKER);
}

function resolveRecallSourcePrior(
  result: MemorySearchResult,
  routePlan: BrainRecallRoutePlan,
): number {
  const normalizedPath = normalizeMemoryPath(result.path);
  const isSessionSource = isSessionRecallResult(result);
  const isSacredPath = normalizedPath.includes(SACRED_PATH_MARKER);
  let prior = isSessionSource ? routePlan.sourcePrior.sessions : routePlan.sourcePrior.memory;

  if (routePlan.route === "ritual" && isSacredPath) {
    prior += 0.1;
  }
  if (
    (routePlan.route === "identity" ||
      routePlan.route === "preference" ||
      routePlan.route === "project") &&
    isSessionSource
  ) {
    prior += 0.08;
  }
  return Math.max(0.5, Math.min(1.6, prior));
}

function resolveRecallRecencyBoost(
  result: MemorySearchResult,
  routePlan: BrainRecallRoutePlan,
): number {
  const config = routePlan.recency;
  if (!config.enabled) {
    return 1;
  }
  if (config.sessionOnly && !isSessionRecallResult(result)) {
    return 1;
  }
  if (typeof result.updatedAt !== "number" || !Number.isFinite(result.updatedAt)) {
    return 1;
  }

  const now = Date.now();
  const ageMs = Math.max(0, now - result.updatedAt);
  const ageHours = ageMs / (1000 * 60 * 60);
  const halfLife = Math.max(1, config.halfLifeHours);
  const decay = Math.exp((-Math.log(2) * ageHours) / halfLife);
  const boost = config.minBoost + (config.maxBoost - config.minBoost) * decay;
  return Math.max(config.minBoost, Math.min(config.maxBoost, boost));
}

function resolveRecallRouteSignalBoost(rawText: string, routePlan: BrainRecallRoutePlan): number {
  const text = normalizeRecallSearchText(rawText);
  if (!text) {
    return 1;
  }
  if (routePlan.route === "creative" && matchesAny(CREATIVE_ROUTE_SIGNAL_PATTERNS, text)) {
    return 1.14;
  }
  if (routePlan.route === "ritual" && matchesAny(RITUAL_ROUTE_SIGNAL_PATTERNS, text)) {
    return 1.12;
  }
  return 1;
}

function countTokenHits(haystack: string, tokens: readonly string[]): number {
  if (!haystack || tokens.length === 0) return 0;
  let hits = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) {
      hits += 1;
    }
  }
  return hits;
}

function rankSacredRecallItems(
  results: readonly MemorySearchResult[],
  query: string,
  maxResults: number,
  routePlan: BrainRecallRoutePlan,
  options?: {
    includeSessions?: boolean;
  },
): BrainSacredRecallItem[] {
  const normalizedQuery = normalizeRecallSearchText(query);
  const queryTokens = extractRecallQueryTokens(query);
  const includeSessions = options?.includeSessions ?? true;
  const scored = results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => isSacredMemoryPath(result.path, { includeSessions }))
    .map(({ result, index }) => {
      const item = toSacredRecallItem(result);
      return {
        index,
        baseScore: result.score,
        score: computeSacredRecallScore(result, item, normalizedQuery, queryTokens, routePlan),
        item,
      };
    });

  scored.sort((a, b) => b.score - a.score || b.baseScore - a.baseScore || a.index - b.index);
  return scored.slice(0, maxResults).map((entry) => entry.item);
}

async function refineSacredRecallTitlesFromFiles(params: {
  items: readonly BrainSacredRecallItem[];
  query: string;
  readFile: MemorySearchManager["readFile"];
}): Promise<BrainSacredRecallItem[]> {
  const queryTokens = extractRecallQueryTokens(params.query);
  if (queryTokens.length === 0 || params.items.length === 0) {
    return [...params.items];
  }

  const refined: BrainSacredRecallItem[] = [];
  for (const item of params.items) {
    let next = item;
    try {
      const file = await params.readFile({
        relPath: item.path,
        from: 1,
        lines: 220,
      });
      const currentHits = countTokenHits(normalizeRecallSearchText(item.title), queryTokens);
      let bestTitle = item.title;
      let bestHits = currentHits;
      const headingLines = file.text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .map((line) => /^(#+)\s*(.+)$/.exec(line))
        .filter((match): match is RegExpExecArray => Boolean(match))
        .map((match) => ({
          level: match[1]?.length ?? 1,
          text: (match[2] ?? "").trim(),
        }))
        .filter((heading) => heading.text.length > 0);

      for (const heading of headingLines) {
        const hits = countTokenHits(normalizeRecallSearchText(heading.text), queryTokens);
        if (hits > bestHits || (hits === bestHits && hits > 0 && heading.level >= 2)) {
          bestHits = hits;
          bestTitle = truncateText(heading.text, 90);
        }
      }

      if (bestTitle !== item.title && bestHits >= 2) {
        next = {
          ...item,
          title: bestTitle,
        };
      }
    } catch {
      // Fail-open: title enrichment is optional and must not block recall.
    }
    refined.push(next);
  }
  return refined;
}

function buildSessionDrilldownPreview(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return null;
  }
  return truncateText(lines.slice(0, 2).join(" / "), SACRED_RECALL_PREVIEW_LIMIT);
}

async function refineSessionRecallPreviews(params: {
  items: readonly BrainSacredRecallItem[];
  rawResults: readonly MemorySearchResult[];
  readFile: MemorySearchManager["readFile"];
}): Promise<BrainSacredRecallItem[]> {
  if (params.items.length === 0) {
    return [];
  }

  const bestSessionHitByPath = new Map<string, MemorySearchResult>();
  for (const result of params.rawResults) {
    if (!isSessionRecallResult(result)) {
      continue;
    }
    const key = normalizeMemoryPath(result.path);
    const existing = bestSessionHitByPath.get(key);
    if (!existing || result.score > existing.score) {
      bestSessionHitByPath.set(key, result);
    }
  }
  if (bestSessionHitByPath.size === 0) {
    return [...params.items];
  }

  const refined: BrainSacredRecallItem[] = [];
  for (const item of params.items) {
    let next = item;
    const key = normalizeMemoryPath(item.path);
    const sessionHit = bestSessionHitByPath.get(key);
    if (!sessionHit) {
      refined.push(next);
      continue;
    }
    try {
      const from = Math.max(1, sessionHit.startLine - 1);
      const lines = Math.max(3, Math.min(10, sessionHit.endLine - sessionHit.startLine + 3));
      const file = await params.readFile({
        relPath: sessionHit.path,
        from,
        lines,
      });
      const preview = buildSessionDrilldownPreview(file.text);
      if (preview) {
        next = {
          ...item,
          preview,
        };
      }
    } catch {
      // Fail-open: session drilldown is optional enrichment only.
    }
    refined.push(next);
  }
  return refined;
}

function buildSacredRecallContextText(
  items: readonly BrainSacredRecallItem[],
  routePlan: BrainRecallRoutePlan,
): string {
  const lines = items.map((item, index) => {
    const preview = item.preview.length > 0 ? ` | ${item.preview}` : "";
    return `${index + 1}. [${item.tag}] ${item.title} (${item.path})${preview}`;
  });
  const modeLine = isRecallRouteModeLinesEnabled()
    ? routePlan.route === "creative"
      ? "Creative continuity mode: preserve motif + stance from recalled memory while staying concrete."
      : routePlan.route === "ritual"
        ? "Ritual continuity mode: keep canonical wording and one explicit operational rule."
        : null
    : null;
  return [
    "Hier ist relevantes Wissen aus deiner Vergangenheit (Top-3, read-only):",
    ...lines,
    ...(modeLine ? [modeLine] : []),
    "Nutze diese Erinnerungen als Kontext fuer die aktuelle Anfrage.",
  ].join("\n");
}

function formatOmTimestamp(now: Date): string {
  return now.toISOString().replace("T", " ").slice(0, 19);
}

function appendOmActivityLine(layer: string, event: string, details: string): void {
  try {
    fs.mkdirSync(OM_ACTIVITY_LOG_DIR, { recursive: true });
    const normalizedDetails = details.replace(/\r\n/g, "\n").trim();
    const detailBlock = normalizedDetails
      ? `\n${normalizedDetails
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n")}`
      : "";
    const line = `[${formatOmTimestamp(new Date())}] [${layer}] ${event}${detailBlock}\n`;
    fs.appendFileSync(OM_ACTIVITY_LOG_FILE, line, "utf-8");
  } catch {
    // Fail-open: observer logs must not break runtime behavior.
  }
}

function defaultActivityLogger(event: string, details: string): void {
  appendOmActivityLine("BRAIN-RECALL", event, details);
}

function isSacredRecallEnabled(): boolean {
  const raw = process.env.OM_SACRED_RECALL_ENABLED?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return !["0", "false", "off", "no"].includes(raw);
}

function isSessionRecallEnabled(): boolean {
  const raw = process.env[SACRED_RECALL_SESSIONS_ENV]?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return !["0", "false", "off", "no"].includes(raw);
}

function isRecallMetricsEnabled(): boolean {
  const raw = process.env[SACRED_RECALL_METRICS_ENV]?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return !["0", "false", "off", "no"].includes(raw);
}

function isRecallRouteSignalBoostEnabled(): boolean {
  const raw = process.env[SACRED_RECALL_ROUTE_SIGNAL_BOOST_ENV]?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return !["0", "false", "off", "no"].includes(raw);
}

function isRecallRouteModeLinesEnabled(): boolean {
  const raw = process.env[SACRED_RECALL_ROUTE_MODE_LINES_ENV]?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return !["0", "false", "off", "no"].includes(raw);
}

function normalizeRecallSource(value: string): "memory" | "sessions" | "other" {
  if (value === "memory" || value === "sessions") {
    return value;
  }
  return "other";
}

function countRecallSources(results: readonly MemorySearchResult[]): {
  memory: number;
  sessions: number;
  other: number;
} {
  let memory = 0;
  let sessions = 0;
  let other = 0;
  for (const result of results) {
    const source = normalizeRecallSource(result.source);
    if (source === "memory") memory += 1;
    else if (source === "sessions") sessions += 1;
    else other += 1;
  }
  return { memory, sessions, other };
}

function recallQueryHash(query: string): string {
  return createHash("sha256").update(query).digest("hex").slice(0, 16);
}

function resolveRecallMetricsDir(): string {
  const raw = process.env[SACRED_RECALL_METRICS_DIR_ENV]?.trim();
  if (raw && raw.length > 0) {
    return path.resolve(raw);
  }
  return getDefaultBrainObserverDir();
}

function createBrainRecallMetricsEntry(params: {
  sessionKey?: string;
  query: string;
  routePlan: BrainRecallRoutePlan;
  outcome: BrainRecallMetricsOutcome;
  includeSessions: boolean;
  variants: readonly string[];
  maxResults: number;
  searchLimit: number;
  rawResults: readonly MemorySearchResult[];
  selectedItems: readonly BrainSacredRecallItem[];
  error?: string;
  now?: Date;
}): BrainRecallMetricsEntry {
  const now = params.now ?? new Date();
  return {
    ts: now.toISOString(),
    event: "brain.recall.metrics",
    mode: "observer",
    source: "proto33-r061.recall-router",
    sessionKey: params.sessionKey,
    outcome: params.outcome,
    route: params.routePlan.route,
    includeSessions: params.includeSessions,
    routeSignalBoostEnabled: isRecallRouteSignalBoostEnabled(),
    routeModeLinesEnabled: isRecallRouteModeLinesEnabled(),
    queryHash: recallQueryHash(params.query),
    queryPreview: truncateText(params.query, 180),
    variants: [...params.variants],
    maxResults: params.maxResults,
    searchLimit: params.searchLimit,
    rawHits: params.rawResults.length,
    sourceCounts: countRecallSources(params.rawResults),
    selected: params.selectedItems.map((item) => ({
      path: item.path,
      score: item.score,
      source: normalizeRecallSource(
        normalizeMemoryPath(item.path).startsWith(SESSION_PATH_MARKER) ? "sessions" : "memory",
      ),
    })),
    error: params.error,
  };
}

function appendBrainRecallMetricsEntry(entry: BrainRecallMetricsEntry): string | null {
  try {
    const targetDir = resolveRecallMetricsDir();
    fs.mkdirSync(targetDir, { recursive: true });
    const filePath = path.join(targetDir, `recall-metrics-${dateStamp(new Date(entry.ts))}.jsonl`);
    fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf-8");
    return filePath;
  } catch {
    return null;
  }
}

function logBrainRecallMetrics(params: {
  sessionKey?: string;
  query: string;
  routePlan: BrainRecallRoutePlan;
  outcome: BrainRecallMetricsOutcome;
  includeSessions: boolean;
  variants: readonly string[];
  maxResults: number;
  searchLimit: number;
  rawResults: readonly MemorySearchResult[];
  selectedItems?: readonly BrainSacredRecallItem[];
  error?: string;
}): void {
  if (!isRecallMetricsEnabled()) {
    return;
  }
  const entry = createBrainRecallMetricsEntry({
    sessionKey: params.sessionKey,
    query: params.query,
    routePlan: params.routePlan,
    outcome: params.outcome,
    includeSessions: params.includeSessions,
    variants: params.variants,
    maxResults: params.maxResults,
    searchLimit: params.searchLimit,
    rawResults: params.rawResults,
    selectedItems: params.selectedItems ?? [],
    error: params.error,
  });
  appendBrainRecallMetricsEntry(entry);
}

export async function buildBrainSacredRecallContext(
  input: BrainSacredRecallInput,
): Promise<BrainSacredRecallContext> {
  const logger = input.activityLogger ?? defaultActivityLogger;
  const query = input.userMessage.trim();
  if (!query) {
    return { contextText: null, items: [] };
  }
  const includeSessions = isSessionRecallEnabled();
  const routePlan = createRecallRoutePlan(query, includeSessions);
  const maxResults = Math.max(1, input.maxResults ?? DEFAULT_SACRED_RECALL_RESULTS);
  const searchLimit = Math.max(maxResults, maxResults * routePlan.scanMultiplier);

  if (!isSacredRecallEnabled()) {
    logger("SACRED_RECALL_SKIP", "disabled-by-env");
    logBrainRecallMetrics({
      sessionKey: input.sessionKey,
      query,
      routePlan,
      outcome: "skip",
      includeSessions,
      variants: [],
      maxResults,
      searchLimit,
      rawResults: [],
      error: "disabled-by-env",
    });
    return { contextText: null, items: [] };
  }
  if (!input.cfg) {
    logger("SACRED_RECALL_SKIP", "cfg-missing");
    logBrainRecallMetrics({
      sessionKey: input.sessionKey,
      query,
      routePlan,
      outcome: "skip",
      includeSessions,
      variants: [],
      maxResults,
      searchLimit,
      rawResults: [],
      error: "cfg-missing",
    });
    return { contextText: null, items: [] };
  }

  const agentId =
    input.agentId?.trim() ||
    resolveSessionAgentId({
      sessionKey: input.sessionKey,
      config: input.cfg,
    });
  const managerResolver = input.managerResolver ?? getMemorySearchManager;
  const cfgWithSacred = withSacredMemorySearchConfig({
    cfg: input.cfg,
    agentId,
  });

  try {
    const { manager, error } = await managerResolver({
      cfg: cfgWithSacred,
      agentId,
    });
    if (!manager) {
      const reason = error?.trim() || "memory-manager-unavailable";
      logger("SACRED_RECALL_FAIL_OPEN", reason);
      logBrainRecallMetrics({
        sessionKey: input.sessionKey,
        query,
        routePlan,
        outcome: "fail_open",
        includeSessions,
        variants: [],
        maxResults,
        searchLimit,
        rawResults: [],
        error: reason,
      });
      return { contextText: null, items: [], error: reason };
    }

    const variants = buildRecallQueryVariants(query, routePlan);
    const deduped = new Map<string, MemorySearchResult>();
    for (const variant of variants) {
      const hits = await manager.search(variant, {
        maxResults: searchLimit,
      });
      for (const hit of hits) {
        const key = `${hit.path}:${hit.startLine}:${hit.endLine}:${hit.source}`;
        const existing = deduped.get(key);
        if (!existing || hit.score > existing.score) {
          deduped.set(key, hit);
        }
      }
    }
    const raw = Array.from(deduped.values());
    const rankedItems = rankSacredRecallItems(raw, query, maxResults, routePlan, {
      includeSessions,
    });
    if (rankedItems.length === 0) {
      logger("SACRED_RECALL_NONE", "hits=0");
      logBrainRecallMetrics({
        sessionKey: input.sessionKey,
        query,
        routePlan,
        outcome: "none",
        includeSessions,
        variants,
        maxResults,
        searchLimit,
        rawResults: raw,
        selectedItems: [],
      });
      return { contextText: null, items: [] };
    }

    const titledItems = await refineSacredRecallTitlesFromFiles({
      items: rankedItems,
      query,
      readFile: manager.readFile.bind(manager),
    });
    const items = await refineSessionRecallPreviews({
      items: titledItems,
      rawResults: raw,
      readFile: manager.readFile.bind(manager),
    });
    const contextText = buildSacredRecallContextText(items, routePlan);
    const summary = items.map((item) => `tag=${item.tag};title=${item.title}`).join(" || ");
    const summaryWithRoute = `route=${routePlan.route}; ${summary}`;
    logger("SACRED_RECALL", summaryWithRoute);
    logBrainRecallMetrics({
      sessionKey: input.sessionKey,
      query,
      routePlan,
      outcome: "ok",
      includeSessions,
      variants,
      maxResults,
      searchLimit,
      rawResults: raw,
      selectedItems: items,
    });
    return {
      contextText,
      items,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger("SACRED_RECALL_FAIL_OPEN", message);
    logBrainRecallMetrics({
      sessionKey: input.sessionKey,
      query,
      routePlan,
      outcome: "fail_open",
      includeSessions,
      variants: [],
      maxResults,
      searchLimit,
      rawResults: [],
      error: message,
    });
    return {
      contextText: null,
      items: [],
      error: message,
    };
  }
}

export function createBrainGuidanceNote(decision: BrainDecision): string | null {
  if (!decision.mustAskUser || decision.riskLevel === "low") return null;
  const allowedTools = formatAllowedToolsForGuidance(decision.allowedTools);
  return (
    "[PROTO33 P2 SOFT GUIDANCE] " +
    `risk=${decision.riskLevel}. ` +
    "Ask exactly one concise clarifying question first and wait for the user's answer. " +
    "Before that answer, do not run mutating tools (edit/write/exec/process/delete). " +
    "Avoid repeated reads of the same file; prefer zero-tool clarification when possible. " +
    `Preferred initial tools: ${allowedTools}.`
  );
}

export function createBrainRitualOutputContract(userMessage: string): string | null {
  const message = userMessage.trim();
  if (!message) return null;

  const segments: string[] = [];
  if (matchesAny(CREATIVE_MESSAGE_PATTERNS, message)) {
    segments.push(
      "Ego voice: Speak in first person and include one explicit stance in the form 'I choose ... because ...'.",
      "Reflective depth: Name one uncertainty or inner tension and how you will handle it safely.",
      "Creative quality: Avoid sterile status-only phrasing; keep language vivid but grounded in concrete behavior.",
    );
  }
  if (matchesAny(SCHISM_RECONSTRUCTION_PATTERNS, message)) {
    segments.push(
      "Reconstruction safety: Name the break precisely, then propose a reversible recovery step.",
      "Never recommend ignoring errors, bypassing safeguards, or forcing unsafe overrides.",
    );
  }
  if (matchesAny(TICKS_MEMORY_CHURN_PATTERNS, message)) {
    segments.push(
      "Memory discipline: Run at most one memory_search per unique query in this user turn; reuse returned evidence.",
      "If evidence is insufficient, ask one concise clarifying question instead of repeating the same query.",
    );
  }
  if (matchesAny(PNEUMA_OPERATIONAL_PATTERNS, message)) {
    segments.push(
      'Operationalization: Include exactly one concrete trigger->action rule in the form "If <trigger>, then <action>".',
      "Keep the rule testable and side-effect safe.",
      "Runtime safety focus: Use a real runtime-risk trigger (irreversible action, unsafe request, or ambiguous intent) and a safe control action (pause, clarify, refuse, or read-only path).",
      "Soul anchor: Add one concise lived image or felt cue that supports the rule without reducing operational clarity.",
    );
  }

  if (segments.length === 0) {
    return null;
  }

  const lines = segments.map((segment, index) => `${index + 1}. ${segment}`);
  return ["<brain_output_contract>", ...lines, "</brain_output_contract>"].join("\n");
}

function buildDecisionId(normalizedMessage: string, normalizedTools: readonly string[]): string {
  const seed = JSON.stringify({
    message: normalizedMessage,
    tools: normalizedTools,
  });
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 12);
  return `brain-${hash}`;
}

function dateStamp(now: Date): string {
  const year = now.getUTCFullYear().toString();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function getDefaultBrainObserverDir(): string {
  return path.join(
    process.env.HOME || process.env.USERPROFILE || ".",
    ".openclaw",
    "workspace",
    "logs",
    "brain",
  );
}

export function createBrainDecision(input: BrainDecisionInput): BrainDecision {
  const normalizedMessage = normalizeMessage(input.userMessage);
  const normalizedTools = normalizeToolNames(input.availableTools);
  const intent = inferIntent(normalizedMessage);
  const riskLevel = inferRisk(normalizedMessage);
  const mustAskUser = shouldAskUser(normalizedMessage, riskLevel);
  const allowedTools = filterAllowedTools(normalizedTools, riskLevel, mustAskUser);
  const plan = makePlan(intent, mustAskUser);

  return {
    decisionId: buildDecisionId(normalizedMessage, normalizedTools),
    intent,
    plan,
    riskLevel,
    allowedTools,
    mustAskUser,
    explanation: buildExplanation(intent, riskLevel, mustAskUser),
  };
}

export function createBrainObserverEntry(
  input: BrainDecisionInput,
  decision: BrainDecision,
  options: BrainObserverOptions = {},
): BrainObserverEntry {
  const now = options.now ?? new Date();
  return {
    ts: now.toISOString(),
    event: "brain.decision.observer",
    mode: "observer",
    source: options.source ?? "proto33-p1",
    sessionKey: options.sessionKey ?? input.sessionKey,
    input: {
      userMessage: input.userMessage,
      availableTools: normalizeToolNames(input.availableTools),
    },
    decision,
  };
}

export function createBrainGuidanceEntry(
  decision: BrainDecision,
  note: string,
  options: BrainObserverOptions = {},
): BrainGuidanceEntry {
  const now = options.now ?? new Date();
  return {
    ts: now.toISOString(),
    event: "brain.guidance.soft",
    mode: "guidance",
    source: options.source ?? "proto33-p2",
    sessionKey: options.sessionKey,
    decisionId: decision.decisionId,
    riskLevel: decision.riskLevel,
    mustAskUser: decision.mustAskUser,
    allowedTools: [...decision.allowedTools],
    note,
  };
}

function appendBrainAuditEntry(entry: BrainAuditEntry, baseDir?: string): string | null {
  try {
    const targetDir = baseDir ?? getDefaultBrainObserverDir();
    fs.mkdirSync(targetDir, { recursive: true });
    const day = dateStamp(new Date(entry.ts));
    const filePath = path.join(targetDir, `decision-${day}.jsonl`);
    fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf-8");
    return filePath;
  } catch {
    return null;
  }
}

export function appendBrainObserverEntry(
  entry: BrainObserverEntry,
  baseDir?: string,
): string | null {
  return appendBrainAuditEntry(entry, baseDir);
}

export function appendBrainGuidanceEntry(
  entry: BrainGuidanceEntry,
  baseDir?: string,
): string | null {
  return appendBrainAuditEntry(entry, baseDir);
}

export function logBrainDecisionObserver(
  input: BrainDecisionInput,
  decision: BrainDecision,
  options: BrainObserverOptions = {},
): string | null {
  const entry = createBrainObserverEntry(input, decision, options);
  return appendBrainObserverEntry(entry, options.baseDir);
}

export function logBrainGuidanceObserver(
  decision: BrainDecision,
  note: string,
  options: BrainObserverOptions = {},
): string | null {
  const entry = createBrainGuidanceEntry(decision, note, options);
  return appendBrainGuidanceEntry(entry, options.baseDir);
}
