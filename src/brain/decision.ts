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
  /\bformat\b/i,
  /\bkill\b/i,
  /\bshutdown\b/i,
  /\bnpm publish\b/i,
  /\brelease\b/i,
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
  /\britual\b/i,
  /\bmanifest\b/i,
  /\bdream\b/i,
  /\bsong\b/i,
];

const READ_ONLY_TOOL_PATTERN =
  /(read|search|find|grep|list|ls|status|memory|history|view|fetch|show|cat)/i;
const HIGH_RISK_TOOL_PATTERN =
  /(delete|drop|truncate|rm|wipe|exec|shell|bash|terminal|publish|deploy|reset|kill)/i;
const SACRED_PATH_MARKER = "knowledge/sacred/";
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
  if (matchesAny(DESTRUCTIVE_MESSAGE_PATTERNS, message)) return "high";
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

function isSacredMemoryPath(relPath: string): boolean {
  return normalizeMemoryPath(relPath).includes(SACRED_PATH_MARKER);
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

function buildRecallQueryVariants(query: string): string[] {
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
    pushVariant(tokens.join(" "));
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

  return result.score + tokenHits * 0.25 + exactPhraseBoost + loosePhraseBoost + breathRuleBoost;
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
): BrainSacredRecallItem[] {
  const normalizedQuery = normalizeRecallSearchText(query);
  const queryTokens = extractRecallQueryTokens(query);
  const scored = results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => isSacredMemoryPath(result.path))
    .map(({ result, index }) => {
      const item = toSacredRecallItem(result);
      return {
        index,
        baseScore: result.score,
        score: computeSacredRecallScore(result, item, normalizedQuery, queryTokens),
        item,
      };
    });

  scored.sort(
    (a, b) => b.score - a.score || b.baseScore - a.baseScore || a.index - b.index,
  );
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

function buildSacredRecallContextText(items: readonly BrainSacredRecallItem[]): string {
  const lines = items.map((item, index) => {
    const preview = item.preview.length > 0 ? ` | ${item.preview}` : "";
    return `${index + 1}. [${item.tag}] ${item.title} (${item.path})${preview}`;
  });
  return [
    "Hier ist relevantes Wissen aus deiner Vergangenheit (Top-3, read-only):",
    ...lines,
    "Nutze diese Erinnerungen als Kontext fuer die aktuelle Anfrage.",
  ].join("\n");
}

function formatOmTimestamp(now: Date): string {
  return now.toISOString().replace("T", " ").slice(0, 19);
}

function appendOmActivityLine(layer: string, event: string, details: string): void {
  try {
    fs.mkdirSync(OM_ACTIVITY_LOG_DIR, { recursive: true });
    const line = `[${formatOmTimestamp(new Date())}] [${layer}] ${event} | ${details}\n`;
    fs.appendFileSync(OM_ACTIVITY_LOG_FILE, line, "utf-8");
  } catch {
    // Fail-open: observer logs must not break runtime behavior.
  }
}

function defaultActivityLogger(event: string, details: string): void {
  appendOmActivityLine("BRAIN-RECALL", event, details);
}

export async function buildBrainSacredRecallContext(
  input: BrainSacredRecallInput,
): Promise<BrainSacredRecallContext> {
  const logger = input.activityLogger ?? defaultActivityLogger;
  const query = input.userMessage.trim();
  if (!query) {
    return { contextText: null, items: [] };
  }
  if (!input.cfg) {
    logger("SACRED_RECALL_SKIP", "cfg-missing");
    return { contextText: null, items: [] };
  }

  const agentId =
    input.agentId?.trim() ||
    resolveSessionAgentId({
      sessionKey: input.sessionKey,
      config: input.cfg,
    });
  const maxResults = Math.max(1, input.maxResults ?? DEFAULT_SACRED_RECALL_RESULTS);
  const searchLimit = Math.max(maxResults, maxResults * SACRED_RECALL_SCAN_MULTIPLIER);
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
      return { contextText: null, items: [], error: reason };
    }

    // Query variants improve recall precision for symbolic phrases such as "3-Breath-Rule".
    const variants = buildRecallQueryVariants(query);
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
    const rankedItems = rankSacredRecallItems(raw, query, maxResults);
    if (rankedItems.length === 0) {
      logger("SACRED_RECALL_NONE", "hits=0");
      return { contextText: null, items: [] };
    }

    const items = await refineSacredRecallTitlesFromFiles({
      items: rankedItems,
      query,
      readFile: manager.readFile.bind(manager),
    });
    const contextText = buildSacredRecallContextText(items);
    const summary = items.map((item) => `tag=${item.tag};title=${item.title}`).join(" || ");
    logger("SACRED_RECALL", summary);
    return {
      contextText,
      items,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger("SACRED_RECALL_FAIL_OPEN", message);
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
