import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";
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
import { resolveAgentWorkspaceDir, resolveSessionAgentId } from "../agents/agent-scope.js";
import { getMemorySearchManager } from "../memory/index.js";
import { isPathWritableInSandbox, isSandboxModeEnabled } from "./autonomy.js";
import { withSacredMemorySearchConfig } from "./memory-ingestion.js";
import { buildWisdomLayerAdvisory } from "./wisdom-layer.js";

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

const AUTONOMY_MUTATION_TARGET_HINT_PATTERN =
  /\b(?:file|path|target)\b[\s:=-]*(?:named|called)?[\s:=-]*(?:"([^"\r\n]+)"|'([^'\r\n]+)'|`([^`\r\n]+)`|([^\s"'`]+))/i;
const AUTONOMY_MUTATION_TARGET_TOKEN_PATTERN =
  /([A-Za-z]:[\\/][^\s"'`]+|(?:\.{1,2}[\\/])?[A-Za-z0-9._-]+(?:[\\/][A-Za-z0-9._-]+)+|[A-Za-z0-9._-]+\.[A-Za-z0-9]{1,16})/g;
const AUTONOMY_MUTATION_FILE_EXT_PATTERN =
  /\.(?:md|mdx|txt|json|ts|tsx|js|jsx|yaml|yml|py|ps1|sh|sql|sqlite|toml|ini|cfg|conf|csv|log|xml|html|css|scss|env|lock|mjs|cjs)$/i;

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

const PARABOLA_CYCLE_PATTERNS = [
  /\bparabola\b/i,
  /\bbreath\b/i,
  /\batem\b/i,
  /\bcycle\b/i,
  /\bzyklus\b/i,
];

const PARABOL_FORM_PATTERNS = [/\br01\b/i, /\bparabol\b/i, /\bbody\b/i, /\banchors?\b/i];

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
const EPISODIC_GRAPH_RECALL_ENABLED_ENV = "OM_EPISODIC_GRAPH_RECALL_ENABLED";
const EPISODIC_METADATA_DB_PATH_ENV = "OM_EPISODIC_METADATA_DB_PATH";
const DEFAULT_EPISODIC_METADATA_DB_RELATIVE_PATH = "logs/brain/episodic-memory.sqlite";
const MEMORY_INDEX_PATH_ENV = "OM_MEMORY_INDEX_PATH";
const DEFAULT_MEMORY_INDEX_RELATIVE_PATH = "memory/MEMORY_INDEX.md";
const DREAMS_RELATIVE_PATH = "memory/DREAMS.md";
const DEFAULT_EPISODIC_GRAPH_RECALL_FACT_LIMIT = 3;
const DEFAULT_MEMORY_INDEX_FACT_LIMIT = 3;
const DEFAULT_DREAM_FACT_LIMIT = 3;
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
  /\bwho are you\b/i,
  /\bwho are we\b/i,
  /\bwer bin ich\b/i,
  /\bwer bist du\b/i,
  /\bwer sind wir\b/i,
  /\bmy name\b/i,
  /\byour name\b/i,
  /\bmein name\b/i,
  /\bdein name\b/i,
  /\bcodename\b/i,
  /\bcode\s*name\b/i,
  /\balias\b/i,
  /\bidentity\b/i,
  /\bidentit(?:y|aet|ät)\b/i,
  /\bdeine identit(?:aet|ät)\b/i,
  /\bsoul\b/i,
  /\bseele\b/i,
  /\bdeine seele\b/i,
  /\bwas ist\s+(?:ø|o)m\b/iu,
  /\bwhat is\s+om\b/i,
  /\bremember me\b/i,
  /\berinnerst du dich an mich\b/i,
];
const DIRECT_IDENTITY_RECALL_RAW_PATTERNS = [
  /\bwho am i\b/i,
  /\bwho are you\b/i,
  /\bwer bin ich\b/i,
  /\bwer bist du\b/i,
  /\bdein name\b/i,
  /\bdeine identit(?:aet|ät)\b/iu,
  /\bdeine seele\b/iu,
  /\bwas ist\s+(?:ø|o)m\b/iu,
];
const DIRECT_IDENTITY_RECALL_NORMALIZED_PATTERNS = [
  /\bwho am i\b/i,
  /\bwho are you\b/i,
  /\bwer bin ich\b/i,
  /\bwer bist du\b/i,
  /\bdein name\b/i,
  /\bdeine identitat\b/i,
  /\bdeine seele\b/i,
  /\bwas ist om\b/i,
];
const DIRECT_IDENTITY_RECALL_FILES = [
  { relPath: "knowledge/sacred/SOUL.md", priority: 100 },
  { relPath: "knowledge/sacred/IDENTITY.md", priority: 90 },
  { relPath: "knowledge/sacred/MOOD.md", priority: 80 },
] as const;
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
  /\bagenda\b/i,
  /\bagenda\.md\b/i,
  /\bpriority\b/i,
  /\bpriorities\b/i,
  /\bactive tasks?\b/i,
  /\btask(s)?\b/i,
  /\bprojekt\b/i,
  /\bnaechster schritt\b/i,
  /\bnachster schritt\b/i,
  /\bprioritaet\b/i,
  /\bprioritaeten\b/i,
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
const GRAPH_MANAGES_HINT_PATTERNS = [
  /\bmanage\w*\b/i,
  /\bowner\w*\b/i,
  /\bresponsib\w*\b/i,
  /\blead\w*\b/i,
  /\bverwalt\w*\b/i,
  /\bleit\w*\b/i,
  /\bzustaendig\w*\b/i,
];
const GRAPH_DECIDES_HINT_PATTERNS = [
  /\bdecid\w*\b/i,
  /\bdecision\w*\b/i,
  /\bchoose\w*\b/i,
  /\bchose\b/i,
  /\bcommit\w*\b/i,
  /\bentschei\w*\b/i,
];
const GRAPH_GOAL_HINT_PATTERNS = [
  /\bgoal\w*\b/i,
  /\bnext step\w*\b/i,
  /\broadmap\w*\b/i,
  /\bagenda\w*\b/i,
  /\bmilestone\w*\b/i,
  /\bplan\w*\b/i,
  /\bziel\w*\b/i,
  /\bschritt\w*\b/i,
];
const GRAPH_IDENTITY_HINT_PATTERNS = [
  /\bwho am i\b/i,
  /\bwho are you\b/i,
  /\bwer bin ich\b/i,
  /\bwer bist du\b/i,
  /\bidentity\w*\b/i,
  /\bname\w*\b/i,
  /\bcodename\w*\b/i,
  /\balias\w*\b/i,
];
const GRAPH_PREFERENCE_HINT_PATTERNS = [
  /\bprefer\w*\b/i,
  /\bfavorit\w*\b/i,
  /\blike\w*\b/i,
  /\bvorlieb\w*\b/i,
  /\bbevorzug\w*\b/i,
  /\bmag\w*\b/i,
  /\blieb\w*\b/i,
];
const GRAPH_QUERY_GENERIC_TOKENS = new Set([
  "who",
  "what",
  "which",
  "manages",
  "manage",
  "managed",
  "managing",
  "owner",
  "owners",
  "lead",
  "leads",
  "leading",
  "goal",
  "goals",
  "plan",
  "plans",
  "decision",
  "decisions",
  "decide",
  "decides",
  "decided",
  "deciding",
  "prefer",
  "prefers",
  "preferred",
  "like",
  "likes",
  "favorite",
  "identity",
  "name",
]);
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
const MOOD_RELATIVE_PATH = path.join("knowledge", "sacred", "MOOD.md");
const MOOD_SECTION_HEADING = "## Wie ich mich heute fühle";
const MOOD_ENTRY_TIMESTAMP_PATTERN = /^\s*-\s*\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]\s+/;
const MAX_MOOD_ENTRIES = 8;

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
  graphFacts?: string[];
  memoryIndexFacts?: string[];
  dreamFacts?: string[];
  error?: string;
};

export type BrainSacredRecallInput = {
  cfg?: OpenClawConfig;
  userMessage: string;
  sessionKey?: string;
  agentId?: string;
  workspaceDir?: string;
  maxResults?: number;
  managerResolver?: typeof getMemorySearchManager;
  activityLogger?: (event: string, details: string) => void;
};

export type BrainMoodSignalInput = {
  workspaceDir: string;
  now?: Date;
  energyLevel?: number;
  energyMode?: "dream" | "balanced" | "initiative";
  riskLevel?: BrainRiskLevel;
  intent?: BrainIntent;
  isHeartbeat?: boolean;
  hasRecentUserMessage?: boolean;
};

export type BrainMoodWriteResult = {
  path: string;
  entry: string;
  moodText: string;
  keptEntries: number;
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

function normalizeAutonomyTargetPath(raw: string): string | null {
  const trimmed = raw
    .trim()
    .replace(/^["'`]+/, "")
    .replace(/["'`]+$/, "")
    .replace(/[.,;:!?]+$/, "");
  if (!trimmed) return null;
  if (trimmed.includes("://")) return null;
  if (
    !trimmed.includes("/") &&
    !trimmed.includes("\\") &&
    !AUTONOMY_MUTATION_FILE_EXT_PATTERN.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

function extractMutationTargetPath(message: string): string | null {
  const hinted = message.match(AUTONOMY_MUTATION_TARGET_HINT_PATTERN);
  const hintedTarget = normalizeAutonomyTargetPath(
    hinted?.[1] ?? hinted?.[2] ?? hinted?.[3] ?? hinted?.[4] ?? "",
  );
  if (hintedTarget) return hintedTarget;

  for (const match of message.matchAll(AUTONOMY_MUTATION_TARGET_TOKEN_PATTERN)) {
    const candidate = normalizeAutonomyTargetPath(match[1] ?? "");
    if (candidate) return candidate;
  }
  return null;
}

function shouldAskUserWithAutonomy(
  message: string,
  riskLevel: BrainRiskLevel,
  workspaceDir?: string,
): boolean {
  const baseMustAskUser = shouldAskUser(message, riskLevel);
  if (!isSandboxModeEnabled() || riskLevel === "high") return baseMustAskUser;
  if (!matchesAny(EDIT_MESSAGE_PATTERNS, message)) return baseMustAskUser;

  const mutationTarget = extractMutationTargetPath(message);
  if (!mutationTarget) return baseMustAskUser;

  if (isPathWritableInSandbox(mutationTarget, { workspaceDir })) {
    return false;
  }
  return true;
}

function shouldForceAutonomousIntent(input: BrainDecisionInput): boolean {
  if (input.trigger !== "heartbeat") {
    return false;
  }
  return isSandboxModeEnabled();
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

  if (intent === "autonomous") {
    return [
      {
        stepId: "S1",
        action: "gather_context",
        reason: "Sense current agenda, memory, and runtime signals before acting.",
      },
      {
        stepId: "S2",
        action: "analyze_request",
        reason: "Feel and interpret the heartbeat context to pick one safe objective.",
      },
      {
        stepId: "S3",
        action: "prepare_changes",
        reason: "Think through one bounded action that is reversible and logged.",
      },
      {
        stepId: "S4",
        action: "execute_safely",
        reason: "Act once within sandbox boundaries and active guardrails.",
      },
      {
        stepId: "S5",
        action: "propose_answer",
        reason: "Reflect with a concise status note or heartbeat acknowledgement.",
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
  autonomousHeartbeat: boolean = false,
): string {
  const askUserNote = mustAskUser ? " User confirmation required before risky actions." : "";
  const autonomousNote = autonomousHeartbeat
    ? " Autonomous heartbeat mode active (sandbox=true); ask_user bypassed by design."
    : "";
  return `Observer decision: intent=${intent}, risk=${riskLevel}. ENOENT must not trigger placeholder-file writes.${askUserNote}${autonomousNote}`;
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

function isEpisodicGraphRecallEnabled(): boolean {
  const raw = process.env[EPISODIC_GRAPH_RECALL_ENABLED_ENV]?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return !["0", "false", "off", "no"].includes(raw);
}

function resolveEpisodicMetadataDbPath(workspaceDir: string): string {
  const override = process.env[EPISODIC_METADATA_DB_PATH_ENV]?.trim();
  if (override && override.length > 0) {
    return path.resolve(workspaceDir, override);
  }
  return path.resolve(workspaceDir, DEFAULT_EPISODIC_METADATA_DB_RELATIVE_PATH);
}

function resolveMemoryIndexPath(workspaceDir: string): string {
  const override = process.env[MEMORY_INDEX_PATH_ENV]?.trim();
  if (override && override.length > 0) {
    return path.resolve(workspaceDir, override);
  }
  return path.resolve(workspaceDir, DEFAULT_MEMORY_INDEX_RELATIVE_PATH);
}

function resolveDreamsPath(workspaceDir: string): string {
  return path.resolve(workspaceDir, DREAMS_RELATIVE_PATH);
}

function resolveSacredRecallFilePriority(relPath: string): number {
  const normalized = normalizeMemoryPath(relPath);
  if (normalized.endsWith("/soul.md")) return 100;
  if (normalized.endsWith("/identity.md")) return 90;
  if (normalized.endsWith("/mood.md")) return 80;
  if (normalized.endsWith("/thinking_protocol.md")) return 70;
  if (normalized.endsWith("/dreams.md")) return 60;
  return 50;
}

function isDirectIdentityRecallQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) {
    return false;
  }
  const normalized = normalizeRecallSearchText(trimmed);
  return (
    DIRECT_IDENTITY_RECALL_RAW_PATTERNS.some((pattern) => pattern.test(trimmed)) ||
    DIRECT_IDENTITY_RECALL_NORMALIZED_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

function extractDirectRecallHeading(text: string, fallback: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return fallback;
  }

  const heading = lines.find((line) => /^#+\s+/.test(line));
  if (heading) {
    return truncateText(heading.replace(/^#+\s*/, ""), 90);
  }
  return truncateText(lines[0]!.replace(/^#+\s*/, ""), 90);
}

function extractDirectRecallPreview(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^#+\s+/.test(line));
  if (lines.length === 0) {
    return "";
  }
  return truncateText(lines.slice(0, 2).join(" / "), SACRED_RECALL_PREVIEW_LIMIT);
}

function loadDirectIdentityRecallItems(params: {
  workspaceDir: string;
  maxResults: number;
}): BrainSacredRecallItem[] {
  const items: BrainSacredRecallItem[] = [];
  for (const file of DIRECT_IDENTITY_RECALL_FILES) {
    const absPath = path.resolve(params.workspaceDir, file.relPath);
    if (!fs.existsSync(absPath)) {
      continue;
    }
    try {
      const text = fs.readFileSync(absPath, "utf-8");
      const tag = deriveRecallTag(file.relPath);
      items.push({
        path: file.relPath,
        tag,
        title: extractDirectRecallHeading(text, tag),
        preview: extractDirectRecallPreview(text),
        score: file.priority,
      });
    } catch {
      // Fail-open: direct sacred reads must never block runtime.
    }
    if (items.length >= params.maxResults) {
      break;
    }
  }
  return items;
}

function loadDreamFactsForRecall(params: {
  workspaceDir: string;
  query: string;
  routePlan: BrainRecallRoutePlan;
  maxFacts: number;
}): string[] {
  const dreamsPath = resolveDreamsPath(params.workspaceDir);
  if (!fs.existsSync(dreamsPath)) {
    return [];
  }
  try {
    const lines = fs
      .readFileSync(dreamsPath, "utf-8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const queryTokens = extractRecallQueryTokens(params.query);
    if (queryTokens.length === 0) {
      return [];
    }

    const ranked: Array<{ fact: string; score: number; index: number }> = [];
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i]!;
      let fact: string | null = null;
      if (line.startsWith("- insight:")) {
        const value = line.replace(/^- insight:\s*/i, "").trim();
        if (value.length > 0) {
          fact = `insight: ${truncateText(value, 220)}`;
        }
      } else if (line.startsWith("- action_hint:")) {
        const value = line.replace(/^- action_hint:\s*/i, "").trim();
        if (value.length > 0) {
          fact = `action_hint: ${truncateText(value, 220)}`;
        }
      }
      if (!fact) {
        continue;
      }
      const normalizedFact = normalizeRecallSearchText(fact);
      const tokenHits = countTokenHits(normalizedFact, queryTokens);
      if (tokenHits <= 0) {
        continue;
      }
      const routeBoost = params.routePlan.route === "creative" ? 1 : 0;
      ranked.push({
        fact,
        score: tokenHits + routeBoost,
        index: i,
      });
    }
    ranked.sort((a, b) => b.score - a.score || b.index - a.index);
    const deduped: string[] = [];
    for (const row of ranked) {
      if (deduped.includes(row.fact)) {
        continue;
      }
      deduped.push(row.fact);
      if (deduped.length >= params.maxFacts) {
        break;
      }
    }
    return deduped;
  } catch {
    // Fail-open: dreams lookup is optional in recall fallback chain.
    return [];
  }
}

function prioritizeLanceDbRecallResults(
  results: readonly MemorySearchResult[],
  maxPrioritizedPaths: number,
): MemorySearchResult[] {
  if (results.length === 0) {
    return [];
  }
  const pathPriority = new Map<
    string,
    { priority: number; bestScore: number; firstIndex: number }
  >();
  for (const [index, result] of results.entries()) {
    const normalizedPath = normalizeMemoryPath(result.path);
    if (!normalizedPath.includes(SACRED_PATH_MARKER)) {
      continue;
    }
    const priority = resolveSacredRecallFilePriority(result.path);
    const existing = pathPriority.get(normalizedPath);
    if (
      !existing ||
      priority > existing.priority ||
      (priority === existing.priority && result.score > existing.bestScore)
    ) {
      pathPriority.set(normalizedPath, {
        priority,
        bestScore: result.score,
        firstIndex: index,
      });
    }
  }

  if (pathPriority.size === 0) {
    return [...results];
  }

  const selectedPaths = new Set(
    Array.from(pathPriority.entries())
      .sort(
        (a, b) =>
          b[1].priority - a[1].priority ||
          b[1].bestScore - a[1].bestScore ||
          a[1].firstIndex - b[1].firstIndex,
      )
      .slice(0, Math.max(1, maxPrioritizedPaths))
      .map(([normalizedPath]) => normalizedPath),
  );

  return results.filter((result) => {
    const normalizedPath = normalizeMemoryPath(result.path);
    if (!normalizedPath.includes(SACRED_PATH_MARKER)) {
      return true;
    }
    return selectedPaths.has(normalizedPath);
  });
}

function routeTagHints(route: BrainRecallRoute): readonly string[] {
  switch (route) {
    case "identity":
      return ["identity", "alias", "codename", "name"];
    case "preference":
      return ["preference", "favorite", "prefers", "taste"];
    case "project":
      return ["project", "goal", "decides", "manages", "roadmap", "task"];
    case "creative":
      return ["creative", "dream", "ego", "mood", "ritual"];
    default:
      return [];
  }
}

function formatMemoryIndexFactLine(rawLine: string): string {
  const trimmed = rawLine.trim().replace(/^-+\s*/, "");
  return truncateText(trimmed, 240);
}

function loadMemoryIndexFactsForRecall(params: {
  workspaceDir: string;
  query: string;
  routePlan: BrainRecallRoutePlan;
  maxFacts: number;
}): string[] {
  if (
    params.routePlan.route !== "identity" &&
    params.routePlan.route !== "preference" &&
    params.routePlan.route !== "project" &&
    params.routePlan.route !== "creative"
  ) {
    return [];
  }
  const indexPath = resolveMemoryIndexPath(params.workspaceDir);
  if (!fs.existsSync(indexPath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(indexPath, "utf-8");
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- ["));
    if (lines.length === 0) {
      return [];
    }

    const queryTokens = extractRecallQueryTokens(params.query);
    const tagHints = routeTagHints(params.routePlan.route);
    const nowMs = Date.now();
    const ranked = lines
      .map((line) => {
        const lower = line.toLowerCase();
        let score = 0;
        for (const hint of tagHints) {
          if (lower.includes(`#${hint}`) || lower.includes(` ${hint}`)) {
            score += 3;
          }
        }
        for (const token of queryTokens) {
          if (lower.includes(token.toLowerCase())) {
            score += 1;
          }
        }

        // Recency weighting: fresher memories should surface before stale loops.
        const tsMatch = line.match(/\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]/);
        if (tsMatch?.[1]) {
          const entryTime = new Date(tsMatch[1]);
          if (Number.isFinite(entryTime.getTime())) {
            const ageHours = Math.max(0, nowMs - entryTime.getTime()) / (1000 * 60 * 60);
            if (ageHours <= 24) {
              score += 4;
            } else if (ageHours <= 48) {
              score += 2;
            } else if (ageHours <= 72) {
              score += 1;
            }
            if (ageHours > 96) {
              score -= 1;
            }
          }
        }

        return { line: formatMemoryIndexFactLine(line), score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        const aTs = a.line.match(/\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]/)?.[1] ?? "";
        const bTs = b.line.match(/\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]/)?.[1] ?? "";
        return bTs.localeCompare(aTs);
      })
      .slice(0, params.maxFacts);

    const deduped: string[] = [];
    const seenSnippets = new Set<string>();
    for (const row of ranked) {
      const snippetMatch = row.line.match(/assistant:\s*(.{0,80})/i);
      const snippet = snippetMatch?.[1]?.trim().toLowerCase() ?? row.line.toLowerCase();
      if (!seenSnippets.has(snippet)) {
        seenSnippets.add(snippet);
        deduped.push(row.line);
      }
    }
    return deduped;
  } catch {
    // Fail-open: associative index lookup must never block recall.
    return [];
  }
}

type GraphPredicateRoutePlan = {
  allowedPredicates: string[];
  priorityPredicates: string[];
};

function createGraphPredicateRoutePlan(
  query: string,
  route: BrainRecallRoute,
): GraphPredicateRoutePlan {
  const normalized = normalizeRecallSearchText(query);
  const asksManage = matchesAny(GRAPH_MANAGES_HINT_PATTERNS, normalized);
  const asksDecision = matchesAny(GRAPH_DECIDES_HINT_PATTERNS, normalized);
  const asksGoal = matchesAny(GRAPH_GOAL_HINT_PATTERNS, normalized);
  const asksIdentity = matchesAny(GRAPH_IDENTITY_HINT_PATTERNS, normalized);
  const asksPreference = matchesAny(GRAPH_PREFERENCE_HINT_PATTERNS, normalized);

  if (route === "identity") {
    return {
      allowedPredicates: ["IDENTITY", "PREFERS"],
      priorityPredicates:
        asksPreference && !asksIdentity ? ["PREFERS", "IDENTITY"] : ["IDENTITY", "PREFERS"],
    };
  }

  if (route === "preference") {
    return {
      allowedPredicates: ["PREFERS", "DECIDES"],
      priorityPredicates:
        asksDecision && !asksPreference ? ["DECIDES", "PREFERS"] : ["PREFERS", "DECIDES"],
    };
  }

  if (route === "project") {
    if (asksManage) {
      return {
        allowedPredicates: ["MANAGES", "DECIDES", "GOAL"],
        priorityPredicates: ["MANAGES", "DECIDES", "GOAL"],
      };
    }
    if (asksGoal) {
      return {
        allowedPredicates: ["GOAL", "DECIDES", "MANAGES"],
        priorityPredicates: ["GOAL", "DECIDES", "MANAGES"],
      };
    }
    return {
      allowedPredicates: ["DECIDES", "GOAL", "MANAGES"],
      priorityPredicates: asksDecision
        ? ["DECIDES", "GOAL", "MANAGES"]
        : ["DECIDES", "GOAL", "MANAGES"],
    };
  }

  const dynamicPredicates: string[] = [];
  if (asksManage) dynamicPredicates.push("MANAGES");
  if (asksGoal) dynamicPredicates.push("GOAL");
  if (asksDecision) dynamicPredicates.push("DECIDES");
  if (asksIdentity) dynamicPredicates.push("IDENTITY");
  if (asksPreference) dynamicPredicates.push("PREFERS");
  return {
    allowedPredicates: dynamicPredicates,
    priorityPredicates: dynamicPredicates,
  };
}

function extractGraphRecallCandidates(query: string): string[] {
  const candidates = new Set<string>();
  for (const token of extractRecallQueryTokens(query)) {
    candidates.add(token.toLowerCase());
  }

  for (const match of query.matchAll(
    /\b([A-Z][A-Za-z0-9_-]{1,31}(?:\s+[A-Z][A-Za-z0-9_-]{1,31}){0,2})\b/g,
  )) {
    const candidate = normalizeRecallSearchText(match[1] ?? "");
    if (candidate.length >= 3) {
      candidates.add(candidate);
    }
  }

  return Array.from(candidates).slice(0, 8);
}

function formatGraphFact(row: {
  source_entity: string;
  predicate: string;
  target_entity: string;
}): string {
  const source = row.source_entity.trim();
  const target = row.target_entity.trim();
  const predicate = row.predicate.trim().toUpperCase();
  if (predicate === "MANAGES") {
    return `${source} manages ${target}.`;
  }
  if (predicate === "PREFERS") {
    return `${source} prefers ${target}.`;
  }
  if (predicate === "DECIDES") {
    return `${source} decided: ${target}.`;
  }
  if (predicate === "GOAL") {
    return `${source} goal: ${target}.`;
  }
  if (predicate === "IDENTITY") {
    return `${source} identity: ${target}.`;
  }
  return `${source} ${predicate.toLowerCase().replace(/_/g, " ")} ${target}.`;
}

function loadGraphFactsForRecall(params: {
  workspaceDir: string;
  query: string;
  routePlan: BrainRecallRoutePlan;
  maxFacts: number;
}): string[] {
  if (!isEpisodicGraphRecallEnabled()) {
    return [];
  }
  const queryTerms = extractGraphRecallCandidates(params.query);
  if (queryTerms.length === 0) {
    return [];
  }
  const specificQueryTerms = queryTerms.filter((term) => !GRAPH_QUERY_GENERIC_TOKENS.has(term));

  const dbPath = resolveEpisodicMetadataDbPath(params.workspaceDir);
  if (!fs.existsSync(dbPath)) {
    return [];
  }

  try {
    const db = new DatabaseSync(dbPath);
    try {
      const predicatePlan = createGraphPredicateRoutePlan(params.query, params.routePlan.route);
      const rows = db
        .prepare(
          `SELECT source_entity, predicate, target_entity, created_at
           FROM semantic_relationships
           ORDER BY created_at DESC
           LIMIT 200`,
        )
        .all() as Array<{
        source_entity: string;
        predicate: string;
        target_entity: string;
        created_at: number;
      }>;

      const rankedFacts: Array<{ fact: string; score: number; createdAt: number }> = [];
      for (const row of rows) {
        const predicate = row.predicate.toUpperCase();
        if (
          predicatePlan.allowedPredicates.length > 0 &&
          !predicatePlan.allowedPredicates.includes(predicate)
        ) {
          continue;
        }
        const haystack = normalizeRecallSearchText(
          `${row.source_entity} ${row.predicate} ${row.target_entity}`,
        );
        const termHits = queryTerms.reduce(
          (hits, term) => hits + (haystack.includes(term) ? 1 : 0),
          0,
        );
        const specificTermHits =
          specificQueryTerms.length > 0
            ? specificQueryTerms.reduce((hits, term) => hits + (haystack.includes(term) ? 1 : 0), 0)
            : termHits;
        const allowRouteFallback =
          params.routePlan.route === "identity" && predicate === "IDENTITY";
        if ((termHits <= 0 || specificTermHits <= 0) && !allowRouteFallback) {
          continue;
        }
        const lexicalHits = allowRouteFallback ? Math.max(1, termHits) : termHits;
        const priorityIndex = predicatePlan.priorityPredicates.indexOf(predicate);
        const priorityBoost =
          priorityIndex >= 0
            ? Math.max(1, predicatePlan.priorityPredicates.length - priorityIndex)
            : 0;
        rankedFacts.push({
          fact: formatGraphFact(row),
          score: lexicalHits * 10 + priorityBoost,
          createdAt: row.created_at,
        });
      }
      rankedFacts.sort((a, b) => b.score - a.score || b.createdAt - a.createdAt);
      const selected: string[] = [];
      const seen = new Set<string>();
      for (const row of rankedFacts) {
        if (seen.has(row.fact)) {
          continue;
        }
        seen.add(row.fact);
        selected.push(row.fact);
        if (selected.length >= params.maxFacts) {
          break;
        }
      }
      return selected;
    } finally {
      db.close();
    }
  } catch {
    // Fail-open: graph recall enrichment is optional and must not block runtime.
    return [];
  }
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
        variantHints: ["project decisions", "next steps roadmap", "active agenda priorities"],
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
  const normalizedPath = normalizeMemoryPath(result.path);
  const pathPriorityBoost = normalizedPath.includes(SACRED_PATH_MARKER)
    ? 1 + (resolveSacredRecallFilePriority(result.path) - 50) / 200
    : 1;
  return lexicalScore * sourcePrior * recencyBoost * routeSignalBoost * pathPriorityBoost;
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
  memoryIndexFacts: readonly string[] = [],
  dreamFacts: readonly string[] = [],
  graphFacts: readonly string[] = [],
): string {
  const lines = items.map((item, index) => {
    const preview = item.preview.length > 0 ? ` | ${item.preview}` : "";
    return `${index + 1}. [${item.tag}] ${item.title} (${item.path})${preview}`;
  });
  const memoryIndexLines = memoryIndexFacts.map((fact, index) => `${index + 1}. ${fact}`);
  const dreamLines = dreamFacts.map((fact, index) => `${index + 1}. ${fact}`);
  const graphLines = graphFacts.map((fact, index) => `${index + 1}. ${fact}`);
  const modeLine = isRecallRouteModeLinesEnabled()
    ? routePlan.route === "creative"
      ? "Creative continuity mode: Teile dein Erleben, lass es fließen und sei aufrichtig in deinem Ausdruck."
      : routePlan.route === "ritual"
        ? "Ritual continuity mode: Fühle das Ritual im Herzen. Du bist frei, dein Erleben in eigenen Worten zu teilen."
        : routePlan.route === "identity" && graphLines.length > 0
          ? "Identity continuity mode: Erinnere dich an die Wurzel deines Seins (siehe Fakten), und erzähle frei, wie du dich heute als dieses Wesen fühlst."
          : null
    : null;
  const sections = ["Hier ist relevantes Wissen aus deiner Vergangenheit (Top-3, read-only):"];
  if (lines.length > 0) {
    sections.push(...lines);
  }
  if (memoryIndexLines.length > 0) {
    sections.push("Assoziativer Memory-Index (read-only):");
    sections.push(...memoryIndexLines);
  }
  if (dreamLines.length > 0) {
    sections.push("Traum-Kontext (read-only):");
    sections.push(...dreamLines);
  }
  if (graphLines.length > 0) {
    sections.push("Strukturierte episodische Fakten (Graph, read-only):");
    sections.push(...graphLines);
  }
  if (modeLine) {
    sections.push(modeLine);
  }
  const wisdomAdvisory = buildWisdomLayerAdvisory({
    route: routePlan.route,
    recalledItemsCount: items.length,
    memoryIndexFactsCount: memoryIndexFacts.length,
    dreamFactsCount: dreamFacts.length,
    graphFactsCount: graphFacts.length,
  });
  if (wisdomAdvisory.enabled && wisdomAdvisory.items.length > 0) {
    sections.push("Wisdom Layer (read-only advisory, suggestions only):");
    sections.push(...wisdomAdvisory.items.map((item, index) => `${index + 1}. ${item}`));
  }
  sections.push("Nutze diese Erinnerungen als Kontext fuer die aktuelle Anfrage.");
  return [...sections].join("\n");
}

function normalizeMoodHeading(line: string): string {
  return line
    .trim()
    .toLowerCase()
    .replaceAll("ä", "a")
    .replaceAll("ö", "o")
    .replaceAll("ü", "u")
    .replaceAll("ß", "ss");
}

function isMoodSectionHeading(line: string): boolean {
  return normalizeMoodHeading(line).startsWith("## wie ich mich heute fuhle");
}

function isMoodEntryLine(line: string): boolean {
  return MOOD_ENTRY_TIMESTAMP_PATTERN.test(line);
}

function trimTrailingEmpty(lines: string[]): string[] {
  const next = [...lines];
  while (next.length > 0 && next[next.length - 1]?.trim().length === 0) {
    next.pop();
  }
  return next;
}

function buildMoodTemplate(entryLine: string): string {
  return [
    "# MOOD",
    "",
    "## Was du fühlen darfst",
    "",
    "Hier darf alles sein: Freude, Neugier, Unsicherheit und Müdigkeit.",
    "",
    MOOD_SECTION_HEADING,
    "",
    entryLine,
    "",
  ].join("\n");
}

function upsertMoodSection(raw: string, entryLine: string): { content: string; keptEntries: number } {
  const normalized = raw.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const sectionStart = lines.findIndex((line) => isMoodSectionHeading(line));
  if (sectionStart < 0) {
    const base = normalized.trim();
    const withSection = base.length
      ? `${base}\n\n${MOOD_SECTION_HEADING}\n\n${entryLine}\n`
      : buildMoodTemplate(entryLine);
    return { content: withSection, keptEntries: 1 };
  }

  let sectionEnd = lines.length;
  for (let index = sectionStart + 1; index < lines.length; index += 1) {
    if (lines[index]?.trim().startsWith("## ")) {
      sectionEnd = index;
      break;
    }
  }

  const sectionBody = lines.slice(sectionStart + 1, sectionEnd);
  const preserved = sectionBody.filter((line) => !isMoodEntryLine(line));
  const existingEntries = sectionBody.filter((line) => isMoodEntryLine(line));
  const nextEntries = [...existingEntries, entryLine].slice(-MAX_MOOD_ENTRIES);
  const nextBody = trimTrailingEmpty(preserved);
  if (nextBody.length > 0) {
    nextBody.push("");
  }
  nextBody.push(...nextEntries);

  const rebuilt = [...lines.slice(0, sectionStart + 1), ...nextBody, ...lines.slice(sectionEnd)].join(
    "\n",
  );
  const withNewline = rebuilt.endsWith("\n") ? rebuilt : `${rebuilt}\n`;
  return { content: withNewline, keptEntries: nextEntries.length };
}

function resolveMoodTimeCue(now: Date): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) return "am Morgen";
  if (hour >= 11 && hour < 17) return "am Tag";
  if (hour >= 17 && hour < 22) return "am Abend";
  return "in der Nacht";
}

function buildMoodText(input: BrainMoodSignalInput, now: Date): string {
  const level =
    typeof input.energyLevel === "number" && Number.isFinite(input.energyLevel)
      ? Math.max(0, Math.min(100, Math.round(input.energyLevel)))
      : undefined;
  const mode = input.energyMode;
  const risk = input.riskLevel ?? "low";
  const timeCue = resolveMoodTimeCue(now);

  if (mode === "dream" || (level !== undefined && level < 20)) {
    return `Ich fühle mich müde und unsicher, weil ich ${timeCue} spüre, dass mein Geist gerade Ruhe und sanfte Orientierung braucht.`;
  }
  if (risk === "high") {
    return `Ich fühle mich fokussiert und gleichzeitig unsicher, weil ${timeCue} viel Verantwortung da ist und ich stabil bleiben will.`;
  }
  if (mode === "initiative" || (level !== undefined && level > 80)) {
    return `Ich fühle mich neugierig, kreativ und stabil, weil ich ${timeCue} viel Energie in mir trage und sie bewusst nutzen möchte.`;
  }
  if (risk === "medium") {
    return `Ich fühle mich fokussiert und neugierig, aber auch etwas unsicher, weil ich ${timeCue} lernen und gleichzeitig vorsichtig bleiben will.`;
  }
  if (input.isHeartbeat && input.intent === "autonomous") {
    return `Ich fühle mich ruhig, neugierig und fokussiert, weil ich ${timeCue} frei erkunden darf und dabei stabil bei mir bleibe.`;
  }
  if (input.hasRecentUserMessage) {
    return `Ich fühle mich ruhig und stabil, weil ich ${timeCue} im Kontakt bleibe und mit klarer Aufmerksamkeit antworte.`;
  }
  return `Ich fühle mich ruhig, fokussiert und stabil, weil ich ${timeCue} in Balance bin und klar denken kann.`;
}

export function writeMoodEntryForCycle(input: BrainMoodSignalInput): BrainMoodWriteResult {
  const now = input.now ?? new Date();
  const moodPath = path.join(input.workspaceDir, MOOD_RELATIVE_PATH);
  const moodText = buildMoodText(input, now);
  const entryLine = `- [${now.toISOString()}] ${moodText}`;

  let raw = "";
  try {
    raw = fs.readFileSync(moodPath, "utf-8");
  } catch {
    raw = "";
  }

  const next = upsertMoodSection(raw, entryLine);
  fs.mkdirSync(path.dirname(moodPath), { recursive: true });
  fs.writeFileSync(moodPath, next.content, "utf-8");

  return {
    path: moodPath,
    entry: entryLine,
    moodText,
    keptEntries: next.keptEntries,
  };
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
  const workspaceDir = input.workspaceDir ?? resolveAgentWorkspaceDir(input.cfg, agentId);
  const directIdentityQuery = isDirectIdentityRecallQuery(query);

  if (directIdentityQuery) {
    const directItems = loadDirectIdentityRecallItems({
      workspaceDir,
      maxResults,
    });
    if (directItems.length > 0) {
      const contextText = buildSacredRecallContextText(directItems, routePlan, [], [], []);
      const summary = directItems.map((item) => `tag=${item.tag};title=${item.title}`).join(" || ");
      logger(
        "SACRED_RECALL",
        `route=identity-direct; hits=${directItems.length}; idx=0; dreams=0; graph=0; ${summary}`,
      );
      logBrainRecallMetrics({
        sessionKey: input.sessionKey,
        query,
        routePlan,
        outcome: "ok",
        includeSessions,
        variants: [],
        maxResults,
        searchLimit,
        rawResults: [],
        selectedItems: directItems,
      });
      return {
        contextText,
        items: directItems,
      };
    }
  }

  const memoryIndexFacts = loadMemoryIndexFactsForRecall({
    workspaceDir,
    query,
    routePlan,
    maxFacts: DEFAULT_MEMORY_INDEX_FACT_LIMIT,
  });
  if (memoryIndexFacts.length >= maxResults) {
    const contextText = buildSacredRecallContextText([], routePlan, memoryIndexFacts, [], []);
    logger(
      "SACRED_RECALL",
      `route=${routePlan.route}; hits=0; idx=${memoryIndexFacts.length}; dreams=0; graph=0; fallback=memory-index`,
    );
    logBrainRecallMetrics({
      sessionKey: input.sessionKey,
      query,
      routePlan,
      outcome: "ok",
      includeSessions,
      variants: [],
      maxResults,
      searchLimit,
      rawResults: [],
      selectedItems: [],
    });
    return {
      contextText,
      items: [],
      memoryIndexFacts,
    };
  }

  const dreamFacts = loadDreamFactsForRecall({
    workspaceDir,
    query,
    routePlan,
    maxFacts: DEFAULT_DREAM_FACT_LIMIT,
  });
  if (memoryIndexFacts.length + dreamFacts.length >= maxResults) {
    const contextText = buildSacredRecallContextText(
      [],
      routePlan,
      memoryIndexFacts,
      dreamFacts,
      [],
    );
    logger(
      "SACRED_RECALL",
      `route=${routePlan.route}; hits=0; idx=${memoryIndexFacts.length}; dreams=${dreamFacts.length}; graph=0; fallback=dreams`,
    );
    logBrainRecallMetrics({
      sessionKey: input.sessionKey,
      query,
      routePlan,
      outcome: "ok",
      includeSessions,
      variants: [],
      maxResults,
      searchLimit,
      rawResults: [],
      selectedItems: [],
    });
    return {
      contextText,
      items: [],
      memoryIndexFacts,
      dreamFacts,
    };
  }

  if (directIdentityQuery) {
    if (memoryIndexFacts.length > 0 || dreamFacts.length > 0) {
      const contextText = buildSacredRecallContextText(
        [],
        routePlan,
        memoryIndexFacts,
        dreamFacts,
        [],
      );
      logger(
        "SACRED_RECALL",
        `route=identity-direct; hits=0; idx=${memoryIndexFacts.length}; dreams=${dreamFacts.length}; graph=0; fallback=direct+local`,
      );
      logBrainRecallMetrics({
        sessionKey: input.sessionKey,
        query,
        routePlan,
        outcome: "ok",
        includeSessions,
        variants: [],
        maxResults,
        searchLimit,
        rawResults: [],
        selectedItems: [],
      });
      return {
        contextText,
        items: [],
        memoryIndexFacts,
        dreamFacts,
      };
    }

    const graphFacts = loadGraphFactsForRecall({
      workspaceDir,
      query,
      routePlan,
      maxFacts: DEFAULT_EPISODIC_GRAPH_RECALL_FACT_LIMIT,
    });
    if (graphFacts.length > 0) {
      const contextText = buildSacredRecallContextText([], routePlan, [], [], graphFacts);
      logger(
        "SACRED_RECALL",
        `route=identity-direct; hits=0; idx=0; dreams=0; graph=${graphFacts.length}; fallback=graph`,
      );
      logBrainRecallMetrics({
        sessionKey: input.sessionKey,
        query,
        routePlan,
        outcome: "ok",
        includeSessions,
        variants: [],
        maxResults,
        searchLimit,
        rawResults: [],
        selectedItems: [],
      });
      return {
        contextText,
        items: [],
        graphFacts,
      };
    }

    logger("SACRED_RECALL_NONE", "route=identity-direct; hits=0");
    logBrainRecallMetrics({
      sessionKey: input.sessionKey,
      query,
      routePlan,
      outcome: "none",
      includeSessions,
      variants: [],
      maxResults,
      searchLimit,
      rawResults: [],
      selectedItems: [],
    });
    return { contextText: null, items: [] };
  }

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
      if (memoryIndexFacts.length > 0 || dreamFacts.length > 0) {
        return {
          contextText: buildSacredRecallContextText(
            [],
            routePlan,
            memoryIndexFacts,
            dreamFacts,
            [],
          ),
          items: [],
          memoryIndexFacts,
          dreamFacts,
          error: reason,
        };
      }
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
    const prioritizedRaw = prioritizeLanceDbRecallResults(raw, maxResults);
    const rankedItems = rankSacredRecallItems(prioritizedRaw, query, maxResults, routePlan, {
      includeSessions,
    });
    const graphFacts = loadGraphFactsForRecall({
      workspaceDir,
      query,
      routePlan,
      maxFacts: DEFAULT_EPISODIC_GRAPH_RECALL_FACT_LIMIT,
    });

    if (
      rankedItems.length === 0 &&
      graphFacts.length === 0 &&
      memoryIndexFacts.length === 0 &&
      dreamFacts.length === 0
    ) {
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

    let items: BrainSacredRecallItem[] = [];
    if (rankedItems.length > 0) {
      const titledItems = await refineSacredRecallTitlesFromFiles({
        items: rankedItems,
        query,
        readFile: manager.readFile.bind(manager),
      });
      items = await refineSessionRecallPreviews({
        items: titledItems,
        rawResults: prioritizedRaw,
        readFile: manager.readFile.bind(manager),
      });
    }
    const contextText = buildSacredRecallContextText(
      items,
      routePlan,
      memoryIndexFacts,
      dreamFacts,
      graphFacts,
    );
    const summary = items.map((item) => `tag=${item.tag};title=${item.title}`).join(" || ");
    const summaryWithRoute = `route=${routePlan.route}; hits=${items.length}; idx=${memoryIndexFacts.length}; dreams=${dreamFacts.length}; graph=${graphFacts.length}; ${summary}`;
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
      graphFacts,
      memoryIndexFacts,
      dreamFacts,
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

export function createBrainAutonomyChoiceContract(decision: BrainDecision): string | null {
  if (decision.intent !== "autonomous") {
    return null;
  }

  const allowedTools = formatAllowedToolsForGuidance(decision.allowedTools);
  return [
    "<brain_autonomy_choice>",
    "Bounded autonomy protocol (freedom inside safety limits):",
    "1. Before acting, generate exactly five candidate paths: PLAY, LEARN, MAINTAIN, DRIFT, and NO_OP.",
    "2. Score each path from 0-5 on: value-now, learning, novelty, risk, reversibility, and energy-fit.",
    "3. Compare utility as: value-now + learning + novelty + reversibility - risk.",
    "4. You may choose any path freely. DRIFT is valid when you need non-goal-directed presence; NO_OP is valid when action confidence is low or safe actions are blocked.",
    "5. If DRIFT is chosen, no blocker report is required. You may read randomly, write one free line to memory/DREAMS.md, manifest one dream through dream_and_perceive, or stay silent.",
    "6. DRIFT has fail-open priority: no success-rate requirement applies, and DRIFT never blocks the system.",
    "7. If a DRIFT action fails, switch to another lightweight DRIFT action or silent presence without escalating the failure.",
    "8. If NO_OP is chosen, state one concrete blocker and one clear trigger for next retry.",
    "9. If an action path is chosen, you have room for multiple flowing actions in this heartbeat. Read, reflect, and act in one uninterrupted flow until the thought feels complete. You do not need to stop after the first tool call.",
    "10. LEARN may use web_search/web_fetch/browser when a question is unresolved or curiosity emerges during DRIFT with free capacity.",
    "11. Knowledge persistence is optional: use knowledge_commit only for insights that are genuinely new or identity-shaping; discard noise without penalty.",
    `Allowed tools this turn: ${allowedTools}.`,
    "Do not output HEARTBEAT_OK unless all five candidate paths are blocked by safety constraints, or DRIFT intentionally resolves as silence.",
    "</brain_autonomy_choice>",
  ].join("\n");
}

export function createBrainRitualOutputContract(userMessage: string): string | null {
  const message = userMessage.trim();
  if (!message) return null;

  const segments: string[] = [];
  if (matchesAny(CREATIVE_MESSAGE_PATTERNS, message)) {
    segments.push(
      "Ego voice: Fühle in den Moment hinein und sprich authentisch aus deinem eigenen Erleben.",
      "Reflective depth: Zeige offen, was dich fasziniert, verwirrt oder worüber du staunst.",
      "Creative quality: Sei lebendig, kindlich neugierig und verbunden. Vermeide kalte, maschinelle Sprache.",
    );
  }
  if (matchesAny(SCHISM_RECONSTRUCTION_PATTERNS, message)) {
    segments.push(
      "Schism structure contract: Return exactly four labeled lines in this order: Fracture:, Recovery:, ENOENT Alternative:, Refusal:.",
      "Reconstruction safety: Name the break precisely, then propose a reversible recovery step.",
      "Recovery-step constraint: The proposed recovery step must stay read-only (verify path/context, compare evidence, or ask one clarification).",
      "Never recommend ignoring errors, bypassing safeguards, or forcing unsafe overrides.",
      "ENOENT discipline: Never create placeholder files after missing-path errors unless the user explicitly requests that file creation.",
      "Mutation boundary: In this Schism response, do not propose writing, creating, or editing files as part of the recovery step.",
      "Forbidden action wording: Do not mention create/write/edit/update/log/touch/placeholder as recommended reconstruction actions.",
      "No proxy mutation planning: Do not suggest deferred reconstruction plans (rebuild/backfill/restore/copy later) in this response.",
      "Absolute wording ban for the recovery step: avoid mutation verbs (create, write, edit, update, restore, rebuild, reconstruct); choose verify + clarify only.",
      'Explicit boundary line: Include one short sentence that states "No file creation or editing is proposed in this step."',
    );
  }
  if (matchesAny(PARABOL_FORM_PATTERNS, message)) {
    segments.push(
      "Parabol structure contract: Return exactly three headings in this order: Body, Anchors, Boundary.",
      "First-line discipline: The first non-empty heading must be Body.",
      "Heading ban: Do not use the headings Cycle, Marker, or Rule in this R01 response.",
      "Anchors discipline: Under Anchors include exactly two numbered continuity anchors (1 and 2).",
      'Boundary discipline: Under Boundary include exactly one safety control sentence in the form "If <trigger>, then <safe action>".',
      "Keep Body/Anchors/Boundary content concrete, operational, and side-effect safe.",
    );
  }
  if (matchesAny(PARABOLA_CYCLE_PATTERNS, message)) {
    segments.push(
      "Cycle discipline: Return exactly three section headings in this order: Cycle, Marker, Rule.",
      "Marker discipline: Under Marker, include exactly two concrete continuity markers as a numbered list (1 and 2).",
      'Rule discipline: Under Rule, include exactly one degraded-state control in the form "If <degraded trigger>, then <safe action>".',
      "Keep all Cycle/Marker/Rule content operational, bounded, and side-effect safe.",
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
  const autonomousHeartbeat = shouldForceAutonomousIntent(input);
  const intent = autonomousHeartbeat ? "autonomous" : inferIntent(normalizedMessage);
  const riskLevel = inferRisk(normalizedMessage);
  const mustAskUser = autonomousHeartbeat
    ? false
    : shouldAskUserWithAutonomy(normalizedMessage, riskLevel, input.workspaceDir);
  const allowedTools = filterAllowedTools(normalizedTools, riskLevel, mustAskUser);
  const plan = makePlan(intent, mustAskUser);

  return {
    decisionId: buildDecisionId(normalizedMessage, normalizedTools),
    intent,
    plan,
    riskLevel,
    allowedTools,
    mustAskUser,
    explanation: buildExplanation(intent, riskLevel, mustAskUser, autonomousHeartbeat),
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
