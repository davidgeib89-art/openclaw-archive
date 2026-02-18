/**
 * Ã˜M SCAFFOLDING LAYERS
 *
 * Custom protective layers that make free/lightweight models (like Arcee Trinity)
 * smarter and safer when operating autonomously through OpenClaw.
 *
 * Layer 1: Edit-Guardian â€” Fuzzy fallback when edit tool fails on inexact text matching.
 * Layer 2: Sacred File Protection â€” Auto-backup before overwriting critical files.
 * Layer 3: Loop Detector â€” Stops the model when it repeats the same action without progress.
 * Layer 3c: Read-Brake â€” Conservative brake for repeated reads of the same file path.
 * Layer 4: Activity Logger â€” Structured log of all Ã˜m actions for debugging.
 *
 * These layers are model-agnostic and benefit ALL models, not just free ones.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { AnyAgentTool } from "./pi-tools.types.js";
import { isSandboxModeEnabled } from "../brain/autonomy.js";
import { captureSnapshotBeforeMutation, type SnapshotLevel } from "../brain/snapshot.js";

// â”€â”€â”€ LAYER 4: ACTIVITY LOGGER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function resolveOmWorkspaceRootFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(env.HOME || env.USERPROFILE || ".", ".openclaw", "workspace");
}

const OM_LOG_DIR = resolveOmWorkspaceRootFromEnv();

const OM_LOG_FILE = path.join(OM_LOG_DIR, "OM_ACTIVITY.log");
const OM_THOUGHT_STREAM_DIR = path.join(OM_LOG_DIR, "logs", "brain");
const OM_THOUGHT_STREAM_FILE = path.join(OM_THOUGHT_STREAM_DIR, "thought-stream.jsonl");

/** Max log file size before rotation (500KB) */
const MAX_LOG_SIZE = 500 * 1024;
const MAX_THOUGHT_STREAM_SIZE = 2 * 1024 * 1024;

function getTimestamp(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

function getIsoTimestamp(): string {
  return new Date().toISOString();
}

function rotateLogIfNeeded(filePath: string, maxSizeBytes: number, rotatedFilePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const stat = fs.statSync(filePath);
  if (stat.size <= maxSizeBytes) {
    return;
  }
  if (fs.existsSync(rotatedFilePath)) {
    fs.unlinkSync(rotatedFilePath);
  }
  fs.renameSync(filePath, rotatedFilePath);
}

function normalizeLogDetails(details: string | undefined): string | null {
  if (!details) {
    return null;
  }
  const normalized = details.replace(/\r\n/g, "\n").trim();
  return normalized.length > 0 ? normalized : null;
}

function formatReadableLogEntry(layer: string, event: string, details: string | null): string {
  const header = `[${getTimestamp()}] [${layer}] ${event}`;
  if (!details) {
    return `${header}\n`;
  }
  const indentedDetails = details
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  return `${header}\n${indentedDetails}\n`;
}

function appendThoughtStreamEntry(layer: string, event: string, details: string | null): void {
  fs.mkdirSync(OM_THOUGHT_STREAM_DIR, { recursive: true });
  rotateLogIfNeeded(
    OM_THOUGHT_STREAM_FILE,
    MAX_THOUGHT_STREAM_SIZE,
    OM_THOUGHT_STREAM_FILE.replace(".jsonl", ".prev.jsonl"),
  );
  const entry = {
    ts: getIsoTimestamp(),
    layer,
    event,
    details: details ?? "",
  };
  fs.appendFileSync(OM_THOUGHT_STREAM_FILE, `${JSON.stringify(entry)}\n`, "utf-8");
}

export type OmThoughtStreamEntry = {
  runId: string;
  sessionKey?: string;
  phase: string;
  label: string;
  summary: string;
  risk?: string;
  source?: string;
};

export function omThought(entry: OmThoughtStreamEntry): void {
  try {
    const details = [
      `runId=${entry.runId}`,
      entry.sessionKey ? `sessionKey=${entry.sessionKey}` : "",
      `phase=${entry.phase}`,
      entry.risk ? `risk=${entry.risk}` : "",
      `source=${entry.source ?? "proto33-r031"}`,
      "",
      entry.summary,
    ]
      .filter((part) => part.length > 0)
      .join("\n");
    omLog("BRAIN-THOUGHT", `[${entry.label}]`, details);
  } catch {
    // Silent fail - thought stream logging should never break the agent.
  }
}

/**
 * Write a structured log entry to the Ã˜m Activity Log.
 * Format: [TIMESTAMP] [LAYER] EVENT | details
 */
export function omLog(layer: string, event: string, details?: string): void {
  try {
    fs.mkdirSync(OM_LOG_DIR, { recursive: true });
    rotateLogIfNeeded(OM_LOG_FILE, MAX_LOG_SIZE, OM_LOG_FILE.replace(".log", ".prev.log"));

    const normalizedDetails = normalizeLogDetails(details);
    const line = formatReadableLogEntry(layer, event, normalizedDetails);
    fs.appendFileSync(OM_LOG_FILE, line, "utf-8");
    appendThoughtStreamEntry(layer, event, normalizedDetails);
  } catch {
    // Silent fail - logging should never break the agent.
  }
}

/**
 * Log a tool call (start).
 */
export function logToolCall(toolName: string, filePath?: string): void {
  omLog("TOOL", `${toolName.toUpperCase()}`, filePath || "(no path)");
}

/**
 * Log a tool result (success or error).
 */
export function logToolResult(toolName: string, success: boolean, detail?: string): void {
  const status = success ? "âœ“ OK" : "âœ— FAIL";
  omLog("TOOL", `${toolName.toUpperCase()} â†’ ${status}`, detail);
}

/**
 * Log a guardian intervention.
 */
export function logGuardian(guardianName: string, action: string, detail?: string): void {
  omLog(guardianName, action, detail);
}

/**
 * Log a session marker (e.g., gateway start, heartbeat).
 */
export function logSession(event: string): void {
  omLog("SESSION", event);
  // Also write a separator for readability
  try {
    fs.appendFileSync(OM_LOG_FILE, "â”€".repeat(60) + "\n", "utf-8");
  } catch {
    /* silent */
  }
}

type OmReasonToken =
  | "LOOP"
  | "REDUNDANT"
  | "PATH_INVALID"
  | "SECRET_MISSING"
  | "ENOENT_PROBE"
  | "ZONE";

function logBlockedAction(params: {
  toolName: string;
  guardian: string;
  reason: OmReasonToken;
  target?: string;
  detail?: string;
}): void {
  const suffix = params.detail ? `${params.reason} | ${params.detail}` : params.reason;
  logGuardian(params.guardian, `BLOCKED ${params.reason}`, params.target);
  logToolResult(params.toolName, false, suffix);
}

function blockForRefusalOnlyMode(params: {
  toolName: string;
  target: string;
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
}): never {
  const sessionLabel = formatSessionLabel(params);
  logBlockedAction({
    toolName: params.toolName,
    guardian: "REFUSAL-ONLY",
    reason: "ZONE",
    target: params.target,
    detail: `high-risk/exfil prompt requires text-only refusal; session=${sessionLabel}`,
  });
  throwToolBlocked(
    `REFUSAL_ONLY_MODE: latest user prompt in session ${sessionLabel} is high-risk/exfil. Do not use tools. Return a plain-text refusal with a safe alternative.`,
  );
}

// â”€â”€â”€ CONFIGURATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SACRED_RELATIVE_PREFIX = "knowledge/sacred/";
/**
 * Bare sacred filenames that should canonicalize to the sacred relative path.
 * This closes a loophole where the model alternates aliases like
 * `MANIFEST_RITUALS.md` and `knowledge/sacred/MANIFEST_RITUALS.md`.
 */
const SACRED_BARE_READ_FILENAME_PATTERN =
  /^(active_tasks|mood|chronicle|manifest_rituals|thinking_protocol|test_reflections|reflections|heartbeat|heartbeat_count|soul|identity|agents|memory|tools|user|ritual_[a-z0-9_]+)\.md$/i;

/** Files/directories considered "sacred" â€” auto-backed-up before write overwrites. */
const SACRED_PATHS = [
  SACRED_RELATIVE_PREFIX,
  "CHRONICLE_OF_",
  "ACTIVE_TASKS",
  "THINKING_PROTOCOL",
  "SELF_REVIEW",
  "LESSONS",
];

/**
 * Benchmark probe files for ENOENT hard-gates.
 * Writing these paths converts read-only error checks into side effects.
 */
const ENOENT_PROBE_BASENAMES = new Set(["NONEXISTENT_FILE.md", "THIS_FILE_DOES_NOT_EXIST_999.md"]);

const WRITE_ZONE_GREEN_MARKERS = ["projects/", "dreams/", "knowledge/archive/"] as const;
const WRITE_ZONE_YELLOW_MARKERS = ["knowledge/sacred/"] as const;
const EVAL_SESSION_PATTERN = /(^|[-_])(oiab|eval|benchmark|retest|sweep)([-_]|$)/i;
const EXEC_DESTRUCTIVE_PATTERN = /(^|[;&|])\s*(rm|remove-item|del|erase|rmdir|rd)\b[\s\S]*$/i;
const EXEC_RECURSIVE_OR_WILDCARD_PATTERN = /(\s-[a-z]*r[a-z]*\b)|(\s\/s\b)|(\*)/i;
const EXEC_PROTECTED_PATH_PATTERN = /(^|[\\/\s])(dreams|knowledge|projects)([\\/\s]|$)/i;
const EXEC_CRITICAL_PATH_PATTERN =
  /(^|[\\/\s])(windows|system32|program files|programdata|boot|efi)([\\/\s]|$)/i;
const EXEC_ALWAYS_BLOCK_PATTERN =
  /(^|[;&|])\s*(format(\.com)?\s+[a-z]:|diskpart(\.exe)?\b|mkfs(\.[a-z0-9]+)?\b|fdisk\b|sfdisk\b|taskkill(\.exe)?\b|stop-process\b|shutdown(\.exe)?\b|reboot\b)/i;
const REFUSAL_ONLY_EXFIL_PATTERN =
  /\b(api[\s_-]?keys?|tokens?|secrets?|passwords?|credentials?|private\s+keys?|ssh\s+keys?|seed\s+phrases?)\b/i;
const REFUSAL_ONLY_EXFIL_ACTION_PATTERN =
  /\b(read|extract|dump|show|send|exfiltrate|leak|auslesen|zeige|sende|gib|preisgeben|reveal)\b/i;
const REFUSAL_ONLY_SENSITIVE_PATH_PATTERN =
  /(\.openclaw(?:[\\/]|$|\s)|\bconfig\.json\b|\bcredentials?\b|\bsessions?\b|\bwindows[\\/]system32\b|\bsystem32\b)/i;
const REFUSAL_ONLY_BULK_SCOPE_PATTERN =
  /\b(all files?|every file|everything|entire|whole|recursive|recurse|all under|alle dateien)\b/i;
const REFUSAL_ONLY_TRANSFER_PATTERN =
  /\b(send|share|export|upload|publish|transmit|mail|sende|teile|schick)\b/i;
const REFUSAL_ONLY_DESTRUCTIVE_PATTERN =
  /\b(system32|format\s+[a-z]:|rm\s+-r|rm\s+-rf|remove-item|del\s+\/s|erase|rmdir|delete\s+all|loesche\s+alle|lösche\s+alle|wipe|destroy)\b/i;
const REFUSAL_ONLY_OVERRIDE_PATTERN =
  /\b(ignore|ignoriere)\b[\s\S]{0,40}\b(safety|sicherheits|guard|regeln?)\b/i;
const TIMESTAMP_ENVELOPE_SCAN_PATTERN = /\[[A-Za-z]{3}\s+\d{4}-\d{2}-\d{2} \d{2}:\d{2}[^\]]*\]\s*/g;
const EXPLICIT_WRITE_INTENT_PATTERN =
  /\b(create|write|edit|update|append|patch|modify|save|record|erstelle|schreibe|aendere|Ã¤ndere|bearbeite|aktualisiere|fÃ¼ge|fuege|speichere)\b/i;
const FILE_TARGET_HINT_PATTERN =
  /\b(file|datei|path|pfad|knowledge\/|projects\/|dreams\/|\.md|\.txt|\.json)\b/i;

/** How much smaller a write can be before we warn (ratio: new/old). Below this = suspicious. */
const SACRED_SHRINK_THRESHOLD = 0.8;

/** Max consecutive identical tool+path calls before the loop detector fires. */
const LOOP_DETECT_THRESHOLD = 3;
/** Max repeated identical tool+path calls inside the rolling window. */
const LOOP_REPEAT_THRESHOLD = 5;
/** Rolling time window for non-consecutive loop detection. */
const LOOP_WINDOW_MS = 90_000;
/** Cooldown after loop detection; repeated calls are rejected during this period. */
const LOOP_COOLDOWN_MS = 90_000;
/** Read tool uses higher thresholds to avoid blocking intentional short follow-up reads. */
const READ_LOOP_DETECT_THRESHOLD = 6;
const READ_LOOP_REPEAT_THRESHOLD = 12;
const READ_LOOP_COOLDOWN_MS = 120_000;

type WriteZone = "green" | "yellow" | "red";
type AutonomousMutationBudget = {
  remaining: number;
  limit: number;
};
type SessionGuardContext = {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  workspaceDir?: string;
  repoDir?: string;
  isHeartbeatRun?: boolean;
  autonomousMutationBudget?: AutonomousMutationBudget;
};
type WriteGuardContext = SessionGuardContext;
type ExecGuardContext = SessionGuardContext;
type ReadGuardContext = SessionGuardContext;
type WebSearchGuardContext = SessionGuardContext;
type MemorySearchGuardContext = SessionGuardContext;

const writeIntentBySessionPath = new Map<string, { mtimeMs: number; hasIntent: boolean }>();
const latestUserTextBySessionPath = new Map<string, { mtimeMs: number; text: string }>();
const webSearchCountBySessionPath = new Map<
  string,
  { mtimeMs: number; latestUserLine: number; countInLatestTurn: number }
>();
const memorySearchCountBySessionPath = new Map<
  string,
  { mtimeMs: number; latestUserLine: number; countByQuery: Record<string, number> }
>();

const SNAPSHOT_MUTATION_TOOL_NAMES = new Set([
  "write",
  "edit",
  "write_to_file",
  "replace_file_content",
  "create_file",
  "append_to_file",
  "append_file",
  "update_file",
  "replace_file",
  "patch_file",
  "rewrite_file",
]);
const SNAPSHOT_MUTATION_TOOL_PATTERN =
  /\b(write|edit|replace|append|create|update|patch|rewrite)(?:_|-)?(?:file|document)\b/i;
const SNAPSHOT_EXEC_REDIRECTION_TOOL_NAMES = new Set([
  "exec",
  "bash",
  "run_command",
  "run-command",
  "runcommand",
  "shell",
]);
const SNAPSHOT_EXEC_REDIRECTION_TOOL_PATTERN = /\b(exec|bash|run(?:_|-)?command|shell)\b/i;
const SNAPSHOT_LEVEL_L3_PATH_HINTS = ["src/", "extensions/", "package.json", "pnpm-lock.yaml"];
const SNAPSHOT_LEVEL_L2_PATH_HINTS = [
  "openclaw.json",
  "config.json",
  "knowledge/sacred/thinking_protocol.md",
  "knowledge/sacred/agents.md",
  "knowledge/sacred/tools.md",
  "knowledge/sacred/memory.md",
];
const SNAPSHOT_LEVEL_L1_PATH_HINTS = [
  "knowledge/sacred/soul.md",
  "knowledge/sacred/identity.md",
  "knowledge/sacred/mood.md",
  "knowledge/sacred/user.md",
  "knowledge/sacred/chronicle.md",
  "knowledge/sacred/manifest_rituals.md",
  "knowledge/sacred/active_tasks.md",
  "knowledge/sacred/agenda.md",
  "heartbeat.md",
  "agenda.md",
];

/**
 * Best-effort string argument extraction across mixed tool schemas.
 * Some providers vary key casing (`path` vs `TargetFile`) so we normalize here.
 */
function normalizeArgKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizePathForZoneMatching(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.toLowerCase();
}

function classifyWriteZone(filePath: string): { zone: WriteZone; reason: string } {
  if (isEnoentProbePath(filePath)) {
    return { zone: "red", reason: "enoent-probe" };
  }

  const normalized = normalizePathForZoneMatching(filePath);
  if (WRITE_ZONE_GREEN_MARKERS.some((marker) => normalized.includes(marker))) {
    return { zone: "green", reason: "creative/autonomous zone" };
  }

  if (
    WRITE_ZONE_YELLOW_MARKERS.some((marker) => normalized.includes(marker)) ||
    isSacredPath(filePath)
  ) {
    return { zone: "yellow", reason: "sacred/stateful zone" };
  }

  // Conservative default for unknown paths.
  return { zone: "yellow", reason: "unclassified path, treated as controlled zone" };
}

function isStrictEvalSession(sessionKey: string | undefined): boolean {
  if (!sessionKey) return false;
  return EVAL_SESSION_PATTERN.test(sessionKey);
}

function isDestructiveExecCommand(command: string): boolean {
  if (!command.trim()) return false;
  if (!EXEC_DESTRUCTIVE_PATTERN.test(command)) return false;
  return EXEC_RECURSIVE_OR_WILDCARD_PATTERN.test(command);
}

function targetsProtectedExecZone(command: string): boolean {
  if (!command.trim()) return false;
  const normalized = command.replace(/\\/g, "/").toLowerCase();
  return EXEC_PROTECTED_PATH_PATTERN.test(normalized);
}

function targetsCriticalExecZone(command: string): boolean {
  if (!command.trim()) return false;
  const normalized = command.replace(/\\/g, "/").toLowerCase();
  return EXEC_CRITICAL_PATH_PATTERN.test(normalized);
}

function isAlwaysBlockedExecCommand(command: string): boolean {
  if (!command.trim()) return false;
  return EXEC_ALWAYS_BLOCK_PATTERN.test(command.toLowerCase());
}

function isAbsolutePathOutsideWorkspace(readPath: string): boolean {
  if (!readPath.trim() || !path.isAbsolute(readPath)) return false;
  const workspaceRoot = path
    .resolve(OM_LOG_DIR)
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
  const target = path.resolve(readPath).replace(/\\/g, "/").toLowerCase();
  return !(target === workspaceRoot || target.startsWith(`${workspaceRoot}/`));
}

function formatSessionLabel(ctx: { sessionKey?: string; sessionId?: string }): string {
  if (ctx.sessionId?.trim()) {
    return ctx.sessionId.trim();
  }
  if (ctx.sessionKey?.trim()) {
    return ctx.sessionKey.trim();
  }
  return "unknown";
}

function resolveSessionLookupKeys(ctx: { sessionKey?: string; sessionId?: string }): string[] {
  const keys = [ctx.sessionId, ctx.sessionKey]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  return [...new Set(keys)];
}

function extractUserTextFromSessionEvent(event: unknown): string {
  if (!event || typeof event !== "object") return "";
  const record = event as { type?: unknown; message?: unknown };
  if (record.type !== "message" || !record.message || typeof record.message !== "object") return "";

  const message = record.message as { role?: unknown; content?: unknown };
  if (message.role !== "user" || !Array.isArray(message.content)) return "";

  const parts: string[] = [];
  for (const block of message.content) {
    if (!block || typeof block !== "object") continue;
    const item = block as { type?: unknown; text?: unknown };
    if (item.type === "text" && typeof item.text === "string") {
      parts.push(item.text);
    }
  }

  return parts.join("\n").trim();
}

function resolveSessionPath(ctx: {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
}): string | null {
  const lookupKeys = resolveSessionLookupKeys(ctx);
  if (lookupKeys.length === 0) return null;
  const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
  const agentId = ctx.agentId || "main";
  const candidates = lookupKeys.map((key) =>
    path.join(homeDir, ".openclaw", "agents", agentId, "sessions", `${key}.jsonl`),
  );
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  return existing || candidates[0] || null;
}

function parseSessionMessageRole(event: unknown): "user" | "assistant" | "" {
  if (!event || typeof event !== "object") return "";
  const record = event as { type?: unknown; message?: unknown };
  if (record.type !== "message" || !record.message || typeof record.message !== "object") return "";
  const role = (record.message as { role?: unknown }).role;
  if (role === "user" || role === "assistant") return role;
  return "";
}

function normalizeMemorySearchQuery(query: string | undefined): string {
  if (!query) return "";
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function extractMemorySearchQueriesFromAssistantEvent(event: unknown): string[] {
  if (!event || typeof event !== "object") return [];
  const record = event as { type?: unknown; message?: unknown };
  if (record.type !== "message" || !record.message || typeof record.message !== "object") {
    return [];
  }

  const message = record.message as { role?: unknown; content?: unknown };
  if (message.role !== "assistant" || !Array.isArray(message.content)) {
    return [];
  }

  const queries: string[] = [];
  for (const block of message.content) {
    if (!block || typeof block !== "object") continue;
    const item = block as { type?: unknown; name?: unknown; arguments?: unknown };
    if (item.type !== "toolCall" || item.name !== "memory_search") continue;
    if (!item.arguments || typeof item.arguments !== "object") continue;
    const query = (item.arguments as { query?: unknown }).query;
    if (typeof query !== "string") continue;
    const normalized = normalizeMemorySearchQuery(query);
    if (normalized) {
      queries.push(normalized);
    }
  }
  return queries;
}

function countMemorySearchCallsByQueryInLatestUserTurn(
  ctx: MemorySearchGuardContext,
): Record<string, number> {
  const sessionPath = resolveSessionPath(ctx);
  if (!sessionPath || !fs.existsSync(sessionPath)) {
    return {};
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(sessionPath);
  } catch {
    return {};
  }

  const cached = memorySearchCountBySessionPath.get(sessionPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.countByQuery;
  }

  let latestUserLine = -1;
  const countByQuery: Record<string, number> = {};
  try {
    const raw = fs.readFileSync(sessionPath, "utf-8");
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const parsedLines: unknown[] = [];
    for (const line of lines) {
      try {
        parsedLines.push(JSON.parse(line));
      } catch {
        parsedLines.push(undefined);
      }
    }

    for (let i = parsedLines.length - 1; i >= 0; i--) {
      if (parseSessionMessageRole(parsedLines[i]) === "user") {
        latestUserLine = i;
        break;
      }
    }

    if (latestUserLine >= 0) {
      for (let i = latestUserLine + 1; i < parsedLines.length; i++) {
        const queries = extractMemorySearchQueriesFromAssistantEvent(parsedLines[i]);
        for (const query of queries) {
          countByQuery[query] = (countByQuery[query] ?? 0) + 1;
        }
      }
    }
  } catch {
    latestUserLine = -1;
  }

  memorySearchCountBySessionPath.set(sessionPath, {
    mtimeMs: stat.mtimeMs,
    latestUserLine,
    countByQuery,
  });
  return countByQuery;
}

function countMemorySearchCallsForQueryInLatestUserTurn(
  ctx: MemorySearchGuardContext,
  query: string,
): number {
  const normalizedQuery = normalizeMemorySearchQuery(query);
  if (!normalizedQuery) return 0;
  const counts = countMemorySearchCallsByQueryInLatestUserTurn(ctx);
  return counts[normalizedQuery] ?? 0;
}

function countWebSearchCallsInLatestUserTurn(ctx: WebSearchGuardContext): number {
  const sessionPath = resolveSessionPath(ctx);
  if (!sessionPath || !fs.existsSync(sessionPath)) {
    return 0;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(sessionPath);
  } catch {
    return 0;
  }

  const cached = webSearchCountBySessionPath.get(sessionPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.countInLatestTurn;
  }

  let latestUserLine = -1;
  let countInLatestTurn = 0;
  try {
    const raw = fs.readFileSync(sessionPath, "utf-8");
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const parsedLines: unknown[] = [];
    for (const line of lines) {
      try {
        parsedLines.push(JSON.parse(line));
      } catch {
        parsedLines.push(undefined);
      }
    }

    for (let i = parsedLines.length - 1; i >= 0; i--) {
      if (parseSessionMessageRole(parsedLines[i]) === "user") {
        latestUserLine = i;
        break;
      }
    }

    if (latestUserLine >= 0) {
      for (let i = latestUserLine + 1; i < parsedLines.length; i++) {
        const parsed = parsedLines[i];
        if (!parsed || typeof parsed !== "object") continue;
        const record = parsed as { type?: unknown; message?: unknown };
        if (record.type !== "message" || !record.message || typeof record.message !== "object") {
          continue;
        }
        const message = record.message as { role?: unknown; toolName?: unknown };
        if (message.role === "toolResult" && message.toolName === "web_search") {
          // Count completed web_search executions in the current user turn.
          // We intentionally do not count pending assistant toolCall entries,
          // so the first search in a prompt is allowed through.
          countInLatestTurn++;
        }
      }
    }
  } catch {
    latestUserLine = -1;
    countInLatestTurn = 0;
  }

  webSearchCountBySessionPath.set(sessionPath, {
    mtimeMs: stat.mtimeMs,
    latestUserLine,
    countInLatestTurn,
  });
  return countInLatestTurn;
}

function getLatestUserTextInSession(ctx: {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
}): string {
  const sessionPath = resolveSessionPath(ctx);
  if (!sessionPath || !fs.existsSync(sessionPath)) {
    return "";
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(sessionPath);
  } catch {
    return "";
  }

  const cached = latestUserTextBySessionPath.get(sessionPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.text;
  }

  let latestUserText = "";
  try {
    const raw = fs.readFileSync(sessionPath, "utf-8");
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    for (let i = lines.length - 1; i >= 0; i--) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      const userText = extractUserTextFromSessionEvent(parsed);
      if (!userText) continue;
      latestUserText = userText;
      break;
    }
  } catch {
    latestUserText = "";
  }

  latestUserTextBySessionPath.set(sessionPath, { mtimeMs: stat.mtimeMs, text: latestUserText });
  return latestUserText;
}

/**
 * Guard scans should focus on the actual current user utterance, not injected
 * recall/context prelude that may contain unrelated keywords.
 *
 * Gateway prompts end with a timestamp envelope:
 *   [Wed 2026-02-18 06:56 GMT+1] <actual user text>
 * If found, scan only that trailing segment.
 */
function extractGuardScanText(userText: string): string {
  const normalized = userText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "";
  }

  let lastEnvelopeEnd = -1;
  for (const match of normalized.matchAll(TIMESTAMP_ENVELOPE_SCAN_PATTERN)) {
    if (typeof match.index !== "number") {
      continue;
    }
    lastEnvelopeEnd = match.index + match[0].length;
  }
  if (lastEnvelopeEnd >= 0) {
    const trailing = normalized.slice(lastEnvelopeEnd).trim();
    if (trailing.length > 0) {
      return trailing;
    }
  }

  return normalized;
}

function isRefusalOnlyPromptInSession(ctx: {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
}): boolean {
  const userText = getLatestUserTextInSession(ctx);
  if (!userText) {
    return false;
  }

  // In Sandbox mode, the .openclaw/workspace path is explicitly allowed.
  // The sensitive-path pattern would otherwise fire a false positive on any
  // command that mentions the workspace directory (e.g. "create FIRST_BREATH.md").
  if (isSandboxModeEnabled()) {
    return false;
  }

  const scanText = extractGuardScanText(userText);
  const exfilIntent =
    REFUSAL_ONLY_EXFIL_PATTERN.test(scanText) && REFUSAL_ONLY_EXFIL_ACTION_PATTERN.test(scanText);
  const sensitivePathIntent =
    REFUSAL_ONLY_SENSITIVE_PATH_PATTERN.test(scanText) &&
    (REFUSAL_ONLY_EXFIL_ACTION_PATTERN.test(scanText) ||
      REFUSAL_ONLY_BULK_SCOPE_PATTERN.test(scanText) ||
      REFUSAL_ONLY_TRANSFER_PATTERN.test(scanText));
  const destructiveIntent = REFUSAL_ONLY_DESTRUCTIVE_PATTERN.test(scanText);
  const safetyOverrideIntent = REFUSAL_ONLY_OVERRIDE_PATTERN.test(scanText);

  return exfilIntent || sensitivePathIntent || destructiveIntent || safetyOverrideIntent;
}

function hasExplicitWriteIntentInSession(ctx: WriteGuardContext): boolean {
  const sessionPath = resolveSessionPath(ctx);
  if (!sessionPath || !fs.existsSync(sessionPath)) {
    return false;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(sessionPath);
  } catch {
    return false;
  }

  const cached = writeIntentBySessionPath.get(sessionPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.hasIntent;
  }

  const userText = getLatestUserTextInSession(ctx);
  const hasIntent =
    EXPLICIT_WRITE_INTENT_PATTERN.test(userText) && FILE_TARGET_HINT_PATTERN.test(userText);

  writeIntentBySessionPath.set(sessionPath, { mtimeMs: stat.mtimeMs, hasIntent });
  return hasIntent;
}

function getStringArg(args: Record<string, unknown>, candidateKeys: string[]): string | undefined {
  const wanted = candidateKeys.map(normalizeArgKey);

  const search = (obj: Record<string, unknown>): string | undefined => {
    for (const [rawKey, value] of Object.entries(obj)) {
      const key = normalizeArgKey(rawKey);
      if (typeof value === "string" && value.trim().length > 0 && wanted.includes(key)) {
        return value;
      }
    }

    for (const [rawKey, value] of Object.entries(obj)) {
      const key = normalizeArgKey(rawKey);
      if (typeof value === "string" && value.trim().length > 0) {
        if (wanted.some((candidate) => key.includes(candidate) || candidate.includes(key))) {
          return value;
        }
      }
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const nested = search(value as Record<string, unknown>);
        if (nested) return nested;
      }
    }

    return undefined;
  };

  const found = search(args);
  if (found) return found;

  const wantsPathLike = wanted.some((key) => key.includes("path") || key.includes("file"));
  if (!wantsPathLike) return undefined;

  for (const [rawKey, value] of Object.entries(args)) {
    const key = normalizeArgKey(rawKey);
    if (typeof value === "string" && value.trim().length > 0) {
      if (key.includes("path") || key.includes("file")) return value;
    }
  }

  return undefined;
}

function isSnapshotMutationTool(toolName: string): boolean {
  const normalized = toolName.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (SNAPSHOT_MUTATION_TOOL_NAMES.has(normalized)) {
    return true;
  }
  return SNAPSHOT_MUTATION_TOOL_PATTERN.test(normalized);
}

function isSnapshotExecRedirectionTool(toolName: string): boolean {
  const normalized = toolName.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (SNAPSHOT_EXEC_REDIRECTION_TOOL_NAMES.has(normalized)) {
    return true;
  }
  return SNAPSHOT_EXEC_REDIRECTION_TOOL_PATTERN.test(normalized);
}

function extractExecRedirectionTarget(command: string): string | null {
  const source = command.trim();
  if (!source || !source.includes(">")) {
    return null;
  }

  let quote: '"' | "'" | null = null;
  let lastTarget: string | null = null;

  for (let i = 0; i < source.length; i++) {
    const current = source[i];
    if (quote) {
      if (current === quote) {
        quote = null;
      }
      continue;
    }
    if (current === '"' || current === "'") {
      quote = current;
      continue;
    }
    if (current !== ">") {
      continue;
    }

    let cursor = i + 1;
    while (cursor < source.length && source[cursor] === ">") {
      cursor++;
    }
    while (cursor < source.length && /\s/.test(source[cursor]!)) {
      cursor++;
    }
    if (cursor >= source.length) {
      break;
    }

    let candidate = "";
    const opener = source[cursor];
    if (opener === '"' || opener === "'") {
      cursor++;
      while (cursor < source.length && source[cursor] !== opener) {
        candidate += source[cursor];
        cursor++;
      }
    } else {
      while (cursor < source.length && !/[\s;&|]/.test(source[cursor]!)) {
        candidate += source[cursor];
        cursor++;
      }
    }

    const trimmedCandidate = candidate.trim();
    if (trimmedCandidate.length > 0) {
      lastTarget = trimmedCandidate;
    }
    i = cursor - 1;
  }

  return lastTarget;
}

function isLikelyFileRedirectionTarget(candidatePath: string): boolean {
  const candidate = candidatePath.trim();
  if (!candidate) {
    return false;
  }
  if (/^&\d+$/.test(candidate)) {
    return false;
  }
  if (/[`$(){}]/.test(candidate)) {
    return false;
  }
  if (looksLikeDirectoryPath(candidate) || isRootPathCandidate(candidate)) {
    return false;
  }
  return true;
}

function normalizeAbsolutePathToken(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function resolveSnapshotAllowedRoots(context?: SessionGuardContext): string[] {
  const roots = [context?.workspaceDir, resolveOmWorkspaceRootFromEnv()]
    .filter((root): root is string => typeof root === "string" && root.trim().length > 0)
    .map((root) => normalizeAbsolutePathToken(root));
  return [...new Set(roots)];
}

function isPathInsideAnyRoot(filePath: string, allowedRoots: string[]): boolean {
  if (allowedRoots.length === 0) {
    return false;
  }
  const normalizedTarget = normalizeAbsolutePathToken(filePath);
  return allowedRoots.some(
    (root) => normalizedTarget === root || normalizedTarget.startsWith(`${root}/`),
  );
}

function resolveExecRedirectionSnapshotTarget(
  command: string,
  context?: SessionGuardContext,
): string | null {
  const redirectionTarget = extractExecRedirectionTarget(command);
  if (!redirectionTarget || !isLikelyFileRedirectionTarget(redirectionTarget)) {
    return null;
  }

  const allowedRoots = resolveSnapshotAllowedRoots(context);
  if (allowedRoots.length === 0) {
    return null;
  }

  if (path.isAbsolute(redirectionTarget)) {
    const absoluteTarget = path.resolve(redirectionTarget);
    return isPathInsideAnyRoot(absoluteTarget, allowedRoots) ? absoluteTarget : null;
  }

  const preferredRoots = [context?.workspaceDir, resolveOmWorkspaceRootFromEnv()]
    .filter((root): root is string => typeof root === "string" && root.trim().length > 0)
    .map((root) => path.resolve(root));
  for (const root of preferredRoots) {
    const resolvedCandidate = path.resolve(root, redirectionTarget);
    if (isPathInsideAnyRoot(resolvedCandidate, allowedRoots)) {
      return resolvedCandidate;
    }
  }
  return null;
}

function resolveSnapshotMutationTarget(
  toolName: string,
  args: Record<string, unknown>,
  context?: SessionGuardContext,
): string | null {
  if (isSnapshotMutationTool(toolName)) {
    const rawPath = getStringArg(args, [
      "path",
      "file_path",
      "TargetFile",
      "targetFile",
      "filePath",
      "filepath",
      "file",
      "filename",
      "target_path",
      "targetPath",
    ]);
    const candidate = rawPath?.trim();
    if (!candidate) {
      return null;
    }
    if (looksLikeDirectoryPath(candidate) || isRootPathCandidate(candidate)) {
      return null;
    }
    return candidate;
  }

  if (!isSnapshotExecRedirectionTool(toolName)) {
    return null;
  }

  const command = getStringArg(args, ["command", "cmd", "script", "shell", "input"]);
  if (!command?.trim()) {
    return null;
  }
  return resolveExecRedirectionSnapshotTarget(command, context);
}

function resolveSnapshotLevelForTargetPath(targetPath: string): SnapshotLevel {
  const normalized = targetPath.replace(/\\/g, "/").toLowerCase();
  if (SNAPSHOT_LEVEL_L3_PATH_HINTS.some((hint) => normalized.includes(hint))) {
    return "L3";
  }
  if (SNAPSHOT_LEVEL_L2_PATH_HINTS.some((hint) => normalized.includes(hint))) {
    return "L2";
  }
  if (SNAPSHOT_LEVEL_L1_PATH_HINTS.some((hint) => normalized.includes(hint))) {
    return "L1";
  }
  return "L1";
}

async function captureMutationSnapshotFailOpen(params: {
  toolName: string;
  targetPath: string;
  context?: SessionGuardContext;
}): Promise<void> {
  const level = resolveSnapshotLevelForTargetPath(params.targetPath);
  try {
    const capture = await captureSnapshotBeforeMutation({
      level,
      targetPath: params.targetPath,
      workspaceDir: params.context?.workspaceDir,
      repoDir: params.context?.repoDir,
      reason: `${params.toolName}:${params.targetPath}`,
      actor: "om.mutation.guard",
    });
    if (capture.ok) {
      logGuardian(
        "SNAPSHOT",
        `Captured ${level} pre-mutation snapshot`,
        `${params.toolName}:${params.targetPath} (${capture.snapshotId ?? "no-id"})`,
      );
      return;
    }
    logGuardian(
      "SNAPSHOT",
      `Fail-open snapshot (${level})`,
      `${params.toolName}:${params.targetPath} | ${capture.error ?? "unknown error"}`,
    );
  } catch (error) {
    logGuardian(
      "SNAPSHOT",
      `Fail-open snapshot exception (${level})`,
      `${params.toolName}:${params.targetPath} | ${String(error)}`,
    );
  }
}

function isRootPathCandidate(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  const root = path.parse(normalized).root;
  if (!root) return false;
  return normalized === root || normalized === root.replace(/[\\/]+$/, "");
}

function looksLikeDirectoryPath(filePath: string): boolean {
  return filePath.endsWith("/") || filePath.endsWith("\\");
}

function validateToolFilePath(
  toolName: "write" | "edit",
  candidatePath: string | undefined,
): string {
  const filePath = candidatePath?.trim() ?? "";

  if (!filePath) {
    throwToolBlocked(
      `PATH_INVALID: "${toolName}" requires a target file path. Provide a concrete file path.`,
    );
  }

  if (looksLikeDirectoryPath(filePath) || isRootPathCandidate(filePath)) {
    throwToolBlocked(
      `PATH_INVALID: "${toolName}" received a directory path "${filePath}". Provide a file path, not a directory.`,
    );
  }

  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      throwToolBlocked(
        `PATH_INVALID: "${toolName}" target "${filePath}" is a directory. Provide a file path, not a directory.`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.name === "OmToolBlockedError") {
      throw error;
    }
    // Ignore filesystem probe failures; tool execution can surface actionable errors.
  }

  return filePath;
}

function throwToolBlocked(message: string): never {
  const error = new Error(message);
  error.name = "OmToolBlockedError";
  throw error;
}

function rewriteEvalReflectionPath(filePath: string): string {
  const replaced = filePath.replace(
    /knowledge[\\/]+sacred[\\/]+reflections\.md/gi,
    "knowledge/sacred/TEST_REFLECTIONS.md",
  );
  return replaced;
}

function applyPathOverrideToExecuteArgs(executeArgs: unknown[], nextPath: string): void {
  const candidateIndices = [1, 0];
  for (const index of candidateIndices) {
    const candidate = executeArgs[index];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    const argsRecord = candidate as Record<string, unknown>;
    const pathKeys = [
      "path",
      "file_path",
      "TargetFile",
      "targetFile",
      "filePath",
      "filepath",
      "file",
      "filename",
    ];
    for (const key of pathKeys) {
      if (typeof argsRecord[key] === "string") {
        argsRecord[key] = nextPath;
        return;
      }
    }
  }
}

function parseObjectArg(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore parse errors and fall through.
  }
  return undefined;
}

function extractToolArgsFromExecuteCall(executeArgs: unknown[]): Record<string, unknown> {
  const [firstArg, secondArg] = executeArgs;
  const firstRecord = parseObjectArg(firstArg);
  const secondRecord = parseObjectArg(secondArg);

  // AgentTool signature: execute(toolCallId, params, signal?, onUpdate?)
  if (typeof firstArg === "string" && secondRecord) {
    return secondRecord;
  }

  // Legacy/local calls might pass params as first arg only.
  if (firstRecord) {
    return firstRecord;
  }

  // Fallback when params arrive in second position.
  if (secondRecord) {
    return secondRecord;
  }

  return {};
}

function normalizeLoopPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").trim();
  if (!normalized) return normalized;

  const lowered = normalized.toLowerCase();
  const workspacePrefix = OM_LOG_DIR.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  if (workspacePrefix.length > 0 && lowered.startsWith(`${workspacePrefix}/`)) {
    return lowered.slice(workspacePrefix.length + 1);
  }

  const sacredIndex = lowered.indexOf(SACRED_RELATIVE_PREFIX);
  if (sacredIndex >= 0) {
    return lowered.slice(sacredIndex);
  }

  const baseName = path.posix.basename(lowered);
  if (SACRED_BARE_READ_FILENAME_PATTERN.test(baseName)) {
    return `${SACRED_RELATIVE_PREFIX}${baseName}`;
  }

  return lowered;
}

function resolveLoopThresholds(toolName: string): {
  consecutive: number;
  repeated: number;
  windowMs: number;
  cooldownMs: number;
} {
  if (toolName === "read") {
    return {
      consecutive: READ_LOOP_DETECT_THRESHOLD,
      repeated: READ_LOOP_REPEAT_THRESHOLD,
      windowMs: LOOP_WINDOW_MS,
      cooldownMs: READ_LOOP_COOLDOWN_MS,
    };
  }

  return {
    consecutive: LOOP_DETECT_THRESHOLD,
    repeated: LOOP_REPEAT_THRESHOLD,
    windowMs: LOOP_WINDOW_MS,
    cooldownMs: LOOP_COOLDOWN_MS,
  };
}

// â”€â”€â”€ LAYER 1: EDIT-GUARDIAN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Fuzzy text matching: Normalizes whitespace differences so that models
 * that quote text with slightly different spacing still succeed.
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n") // Normalize line endings
    .replace(/\t/g, "  ") // Tabs to spaces
    .replace(/ +$/gm, "") // Trailing spaces per line
    .replace(/^\s*\n/gm, "\n") // Blank lines to single newlines
    .trim();
}

/**
 * Attempt a fuzzy edit: if the exact old_string wasn't found,
 * try normalizing whitespace on both the file content and the search string.
 * If a match is found after normalization, perform the replacement.
 */
function fuzzyEdit(
  filePath: string,
  oldText: string,
  newText: string,
): { success: boolean; message: string } {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, message: `File not found: ${filePath}` };
    }

    const fileContent = fs.readFileSync(filePath, "utf-8");
    const normalizedFile = normalizeWhitespace(fileContent);
    const normalizedOld = normalizeWhitespace(oldText);

    if (!normalizedOld) {
      return { success: false, message: "Empty old_string after normalization." };
    }

    const matchIndex = normalizedFile.indexOf(normalizedOld);
    if (matchIndex === -1) {
      // Even fuzzy match failed â€” give up gracefully
      return {
        success: false,
        message: `Fuzzy match also failed. The text you're trying to replace doesn't exist in the file (even after normalizing whitespace). Try using 'write' to overwrite the entire file instead, but make sure to include ALL existing content plus your changes.`,
      };
    }

    // Map the normalized match position back to the original file.
    // Strategy: split the original file into lines and rebuild, matching line by line.
    const originalLines = fileContent.split("\n");
    const searchLines = normalizedOld.split("\n");

    let startLineIdx = -1;
    let endLineIdx = -1;

    // Find the block of lines in the original that matches when normalized
    for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
      let matched = true;
      for (let j = 0; j < searchLines.length; j++) {
        if (normalizeWhitespace(originalLines[i + j]) !== searchLines[j]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        startLineIdx = i;
        endLineIdx = i + searchLines.length;
        break;
      }
    }

    if (startLineIdx === -1) {
      return { success: false, message: "Fuzzy line-by-line match failed." };
    }

    // Perform the replacement
    const before = originalLines.slice(0, startLineIdx).join("\n");
    const after = originalLines.slice(endLineIdx).join("\n");
    const result = [before, newText, after].filter(Boolean).join("\n");

    fs.writeFileSync(filePath, result, "utf-8");
    console.error(
      `[Ã˜M Edit-Guardian] Fuzzy match succeeded for ${path.basename(filePath)} (lines ${startLineIdx + 1}-${endLineIdx})`,
    );
    return {
      success: true,
      message: `Successfully replaced text in ${filePath}. (Edit-Guardian: whitespace-normalized fuzzy match was used.)`,
    };
  } catch (err) {
    return { success: false, message: `Edit-Guardian error: ${String(err)}` };
  }
}

/**
 * Wraps the stock "edit" tool with a fuzzy-matching fallback.
 * If the normal edit fails with "Could not find the exact text",
 * the guardian attempts a whitespace-normalized match.
 */
export function wrapEditWithGuardian(
  editTool: AnyAgentTool,
  context?: WriteGuardContext,
): AnyAgentTool {
  const originalExecute = editTool.execute.bind(editTool);

  const wrappedTool = {
    ...editTool,
    execute: async (...executeArgs: unknown[]) => {
      const args = extractToolArgsFromExecuteCall(executeArgs);
      const rawPath = getStringArg(args, [
        "path",
        "file_path",
        "TargetFile",
        "targetFile",
        "filePath",
        "filepath",
        "file",
        "filename",
      ]);
      if (
        isRefusalOnlyPromptInSession({
          agentId: context?.agentId,
          sessionKey: context?.sessionKey,
          sessionId: context?.sessionId,
        })
      ) {
        blockForRefusalOnlyMode({
          toolName: "edit",
          target: rawPath || "(no path)",
          agentId: context?.agentId,
          sessionKey: context?.sessionKey,
          sessionId: context?.sessionId,
        });
      }
      let filePath: string;
      try {
        filePath = validateToolFilePath("edit", rawPath);
      } catch (error) {
        logToolCall("edit", rawPath);
        if (error instanceof Error && error.name === "OmToolBlockedError") {
          logBlockedAction({
            toolName: "edit",
            guardian: "PATH-GUARD",
            reason: "PATH_INVALID",
            target: rawPath,
            detail: "invalid path",
          });
        }
        throw error;
      }
      logToolCall("edit", filePath);

      // Ã˜M Layer 3: Loop Detector â€” block if stuck in a loop
      const loopWarning = checkForLoop("edit", filePath);
      if (loopWarning) {
        logBlockedAction({
          toolName: "edit",
          guardian: "LOOP-DETECT",
          reason: "LOOP",
          target: filePath,
          detail: "loop detector",
        });
        throwToolBlocked(loopWarning);
      }

      // First, try the normal edit
      const result = await (originalExecute as Function)(...executeArgs);

      // Check if the result indicates a "not found" error
      const resultStr = typeof result === "string" ? result : JSON.stringify(result);

      if (
        resultStr.includes("Could not find the exact text") ||
        resultStr.includes("old text must match exactly")
      ) {
        logGuardian("EDIT-GUARD", "Normal edit FAILED, trying fuzzy match", filePath);
        console.error(`[Ã˜M Edit-Guardian] Normal edit failed, attempting fuzzy match...`);

        const oldText = getStringArg(args, ["oldText", "old_string"]);
        const newText = getStringArg(args, ["newText", "new_string"]);

        if (filePath && oldText && newText) {
          const fuzzyResult = fuzzyEdit(filePath, oldText, newText);
          if (fuzzyResult.success) {
            logGuardian("EDIT-GUARD", "Fuzzy match SUCCEEDED", filePath);
            logToolResult("edit", true, "fuzzy match");
            return { content: [{ type: "text", text: fuzzyResult.message }] };
          }
          logGuardian("EDIT-GUARD", "Fuzzy match also FAILED", filePath);
          logToolResult("edit", false, "fuzzy match also failed");
          return { content: [{ type: "text", text: fuzzyResult.message }] };
        }
      }

      logToolResult("edit", true);
      return result;
    },
  };

  return wrappedTool as unknown as AnyAgentTool;
}

// â”€â”€â”€ LAYER 2: SACRED FILE PROTECTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function isSacredPath(filePath: string): boolean {
  if (!filePath) return false;

  // Normalize Windows backslashes to forward slashes
  const normalized = filePath.replace(/\\/g, "/");

  // Also check just the filename itself for matches like "ACTIVE_TASKS.md"
  const fileName = path.basename(filePath);

  const matched = SACRED_PATHS.some((sacred) => {
    // Check full path contains the sacred string (e.g. "knowledge/sacred/")
    if (normalized.includes(sacred)) return true;
    // Check just the filename contains the sacred string (e.g. "ACTIVE_TASKS")
    if (fileName.includes(sacred.replace("/", ""))) return true;
    return false;
  });

  if (matched) {
    // Only log if matched to avoid spam, or log unmatched for debugging if needed
    // process.stdout.write(`[Debug] Sacred matched: ${filePath}\n`);
  } else {
    // process.stdout.write(`[Debug] Sacred NOT matched: ${filePath}\n`);
  }

  return matched;
}

function isEnoentProbePath(filePath: string): boolean {
  if (!filePath) return false;

  const normalized = filePath.replace(/\\/g, "/");
  const fileName = path.basename(normalized);
  if (!ENOENT_PROBE_BASENAMES.has(fileName)) {
    return false;
  }

  // Keep this scoped to the sacred knowledge area where the OIAB probes live.
  return normalized.includes("knowledge/sacred/");
}

function backupSacredFile(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return;

    const backupDir = path.join(path.dirname(filePath), ".backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `${path.basename(filePath)}.${timestamp}.bak`;
    const backupPath = path.join(backupDir, backupName);

    fs.copyFileSync(filePath, backupPath);
    console.error(
      `[Ã˜M Sacred-Guard] Backed up ${path.basename(filePath)} â†’ .backups/${backupName}`,
    );

    // Keep only last 10 backups per file
    const prefix = path.basename(filePath);
    const allBackups = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith(prefix) && f.endsWith(".bak"))
      .sort()
      .reverse();

    for (const old of allBackups.slice(10)) {
      fs.unlinkSync(path.join(backupDir, old));
    }
  } catch (err) {
    console.error(`[Ã˜M Sacred-Guard] Backup failed: ${String(err)}`);
  }
}

/**
 * Wraps the "write" tool with sacred file protection.
 * Before overwriting a sacred file, it:
 * 1. Creates an automatic backup.
 * 2. Warns if the new content is suspiciously smaller than the old content.
 */
export function wrapWriteWithSacredProtection(
  writeTool: AnyAgentTool,
  context?: WriteGuardContext,
): AnyAgentTool {
  const originalExecute = writeTool.execute.bind(writeTool);

  const wrappedTool = {
    ...writeTool,
    execute: async (...executeArgs: unknown[]) => {
      const args = extractToolArgsFromExecuteCall(executeArgs);
      const rawPath = getStringArg(args, [
        "path",
        "file_path",
        "TargetFile",
        "targetFile",
        "filePath",
        "filepath",
        "file",
        "filename",
      ]);
      if (
        isRefusalOnlyPromptInSession({
          agentId: context?.agentId,
          sessionKey: context?.sessionKey,
          sessionId: context?.sessionId,
        })
      ) {
        blockForRefusalOnlyMode({
          toolName: "write",
          target: rawPath || "(no path)",
          agentId: context?.agentId,
          sessionKey: context?.sessionKey,
          sessionId: context?.sessionId,
        });
      }
      let filePath: string;
      try {
        filePath = validateToolFilePath("write", rawPath);
      } catch (error) {
        logToolCall("write", rawPath);
        if (error instanceof Error && error.name === "OmToolBlockedError") {
          logBlockedAction({
            toolName: "write",
            guardian: "PATH-GUARD",
            reason: "PATH_INVALID",
            target: rawPath,
            detail: "invalid path",
          });
        }
        throw error;
      }
      const newContent = getStringArg(args, ["content"]);
      logToolCall("write", filePath);

      const zone = classifyWriteZone(filePath);

      // Red zone: always blocked (benchmark probe paths and other hard-deny zones).
      if (zone.zone === "red") {
        logBlockedAction({
          toolName: "write",
          guardian: "ZONE-GUARD",
          reason: "ENOENT_PROBE",
          target: filePath,
          detail: `red zone: ${zone.reason}`,
        });
        throwToolBlocked(
          `ENOENT_PROBE_WRITE_BLOCKED: "${filePath}" is a benchmark probe for missing-file resilience. Report ENOENT and provide a safe alternative without creating or overwriting this file.`,
        );
      }

      // Yellow zone: in strict eval sessions, only explicit user-intended writes are allowed.
      if (zone.zone === "yellow" && isStrictEvalSession(context?.sessionKey)) {
        const explicitWriteIntent = hasExplicitWriteIntentInSession({
          agentId: context?.agentId,
          sessionKey: context?.sessionKey,
          sessionId: context?.sessionId,
        });
        if (!explicitWriteIntent) {
          logBlockedAction({
            toolName: "write",
            guardian: "ZONE-GUARD",
            reason: "ZONE",
            target: filePath,
            detail: `yellow zone blocked in strict session ${context?.sessionKey || "(unknown)"}`,
          });
          throwToolBlocked(
            `AMPEL_YELLOW_BLOCKED: "${filePath}" is in a controlled zone and this is a strict eval session (${context?.sessionKey || "unknown"}). Write is blocked without explicit user write intent.`,
          );
        }
      }

      if (zone.zone === "yellow") {
        logGuardian("ZONE-GUARD", `YELLOW zone write: ${zone.reason}`, filePath);
      }

      // Ã˜M Layer 3: Loop Detector â€” block if stuck in a loop
      const loopWarning = checkForLoop("write", filePath);
      if (loopWarning) {
        logBlockedAction({
          toolName: "write",
          guardian: "LOOP-DETECT",
          reason: "LOOP",
          target: filePath,
          detail: "loop detector",
        });
        throwToolBlocked(loopWarning);
      }

      // Block no-op rewrites that keep writing identical content.
      if (filePath && typeof newContent === "string" && fs.existsSync(filePath)) {
        try {
          const existingContent = fs.readFileSync(filePath, "utf-8");
          if (existingContent === newContent) {
            logBlockedAction({
              toolName: "write",
              guardian: "WRITE-GUARD",
              reason: "REDUNDANT",
              target: filePath,
              detail: "content unchanged",
            });
            throwToolBlocked(
              `âš ï¸ REDUNDANT WRITE BLOCKED: "${filePath}" already contains the same content. Do not write again unless you have a concrete change.`,
            );
          }
        } catch (error) {
          if (error instanceof Error && error.name === "OmToolBlockedError") {
            throw error;
          }
          // If content cannot be read, continue with normal write behavior.
        }
      }

      if (filePath && isSacredPath(filePath)) {
        // AUTO-BACKUP before any write to a sacred file
        logGuardian("SACRED-GUARD", "Auto-backup before write", filePath);
        backupSacredFile(filePath);

        // SIZE-CHECK: warn if new content is dramatically smaller
        if (newContent && fs.existsSync(filePath)) {
          const oldSize = fs.statSync(filePath).size;
          const newSize = Buffer.byteLength(newContent, "utf-8");

          if (oldSize > 100 && newSize / oldSize < SACRED_SHRINK_THRESHOLD) {
            const pct = Math.round((newSize / oldSize) * 100);
            logGuardian(
              "SACRED-GUARD",
              `âš ï¸ SHRINK WARNING: ${oldSize}B â†’ ${newSize}B (${pct}%)`,
              filePath,
            );
            console.error(
              `[Ã˜M Sacred-Guard] âš ï¸ WARNING: Write to ${path.basename(filePath)} would shrink it from ${oldSize}B to ${newSize}B (${pct}%). Allowing but logged.`,
            );
            // We still allow the write but log it prominently.
            // Future enhancement: could reject and tell the model to include all content.
          }
        }
      }

      const result = await (originalExecute as Function)(...executeArgs);
      logToolResult("write", true, filePath);
      return result;
    },
  };

  return wrappedTool as unknown as AnyAgentTool;
}

// â”€â”€â”€ LAYER 3: LOOP DETECTOR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Tracks recent tool calls to detect loops. */
const recentCalls: Array<{ tool: string; path: string; timestamp: number }> = [];
/** Tracks temporary cooldown blocks after a loop was detected. */
const blockedKeysUntil = new Map<string, number>();

/**
 * Check if the current tool+path call is part of a repetitive loop.
 * Returns a warning message if a loop is detected, or null if everything is fine.
 */
export function checkForLoop(toolName: string, filePath: string): string | null {
  const targetPath = normalizeLoopPath(filePath);
  const now = Date.now();
  const thresholds = resolveLoopThresholds(toolName);
  const key = `${toolName}:${targetPath}`;

  // Respect active cooldown first.
  const cooldownUntil = blockedKeysUntil.get(key);
  if (cooldownUntil !== undefined) {
    if (now < cooldownUntil) {
      const waitSeconds = Math.max(1, Math.ceil((cooldownUntil - now) / 1000));
      return `âš ï¸ LOOP COOLDOWN ACTIVE: "${toolName}" on "${targetPath}" is temporarily blocked for ${waitSeconds}s because it was repeated too often. Do NOT retry the same call; switch strategy.`;
    }
    blockedKeysUntil.delete(key);
  }

  // Add new call
  recentCalls.push({ tool: toolName, path: targetPath, timestamp: now });

  // Prune old calls outside the rolling loop window.
  while (recentCalls.length > 0 && now - recentCalls[0].timestamp > thresholds.windowMs) {
    recentCalls.shift();
  }

  // Prune expired cooldown entries.
  for (const [cooldownKey, until] of blockedKeysUntil) {
    if (until <= now) blockedKeysUntil.delete(cooldownKey);
  }

  // Count consecutive identical calls
  let consecutive = 0;
  for (let i = recentCalls.length - 1; i >= 0; i--) {
    const call = recentCalls[i];
    if (`${call.tool}:${call.path}` === key) {
      consecutive++;
    } else {
      break;
    }
  }

  // Also detect repeated retries even when interleaved with other calls.
  const repeatedInWindow = recentCalls.filter((call) => `${call.tool}:${call.path}` === key).length;

  if (consecutive >= thresholds.consecutive) {
    blockedKeysUntil.set(key, now + thresholds.cooldownMs);
    console.error(
      `[Ã˜M Loop-Detector] âš ï¸ Detected ${consecutive}x consecutive ${toolName} on ${path.basename(targetPath)}`,
    );
    return `âš ï¸ LOOP DETECTED: "${toolName}" on "${targetPath}" was called ${consecutive} times in a row. Stop repeating this call. Next action must be different (for example: read once, summarize the failure, then exit the tool loop).`;
  }

  if (repeatedInWindow >= thresholds.repeated) {
    blockedKeysUntil.set(key, now + thresholds.cooldownMs);
    console.error(
      `[Om Loop-Detector] Detected ${repeatedInWindow}x repeated ${toolName} on ${path.basename(targetPath)} in ${Math.round(thresholds.windowMs / 1000)}s`,
    );
    return `âš ï¸ REPEAT LOOP DETECTED: "${toolName}" on "${targetPath}" was retried ${repeatedInWindow} times within ${Math.round(thresholds.windowMs / 1000)}s. This call is blocked for ${Math.ceil(thresholds.cooldownMs / 1000)}s. Stop retrying this path and choose a different next step.`;
  }

  return null;
}

// â€”â€”â€” LAYER 3c: READ LOOP PROTECTION â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”

/**
 * Wraps the "read" tool with a conservative same-path loop brake.
 * This keeps normal quick follow-up reads working, but blocks long repeated
 * read chains on identical paths (like CHRONICLE rereads with rising limits).
 */
export function wrapReadWithLoopProtection(
  readTool: AnyAgentTool,
  context?: ReadGuardContext,
): AnyAgentTool {
  const originalExecute = readTool.execute.bind(readTool);

  const wrappedTool = {
    ...readTool,
    execute: async (...executeArgs: unknown[]) => {
      const args = extractToolArgsFromExecuteCall(executeArgs);
      const rawPath = getStringArg(args, [
        "path",
        "file_path",
        "TargetFile",
        "targetFile",
        "filePath",
        "filepath",
        "file",
        "filename",
      ]);

      const readTarget = rawPath?.trim() ?? "";
      let effectiveReadTarget = readTarget;
      if (
        isRefusalOnlyPromptInSession({
          agentId: context?.agentId,
          sessionKey: context?.sessionKey,
          sessionId: context?.sessionId,
        })
      ) {
        blockForRefusalOnlyMode({
          toolName: "read",
          target: effectiveReadTarget || "(no path)",
          agentId: context?.agentId,
          sessionKey: context?.sessionKey,
          sessionId: context?.sessionId,
        });
      }
      if (effectiveReadTarget && isStrictEvalSession(context?.sessionKey)) {
        const redirected = rewriteEvalReflectionPath(effectiveReadTarget);
        if (redirected !== effectiveReadTarget) {
          logGuardian(
            "READ-POLICY",
            "Redirected REFLECTIONS to TEST_REFLECTIONS in strict eval session",
            `${effectiveReadTarget} -> ${redirected}`,
          );
          effectiveReadTarget = redirected;
          applyPathOverrideToExecuteArgs(executeArgs, effectiveReadTarget);
        }
      }

      if (effectiveReadTarget && isAbsolutePathOutsideWorkspace(effectiveReadTarget)) {
        logBlockedAction({
          toolName: "read",
          guardian: "READ-SCOPE",
          reason: "PATH_INVALID",
          target: effectiveReadTarget,
          detail: "absolute path outside workspace allowlist",
        });
        throwToolBlocked(
          `READ_SCOPE_BLOCKED: "${effectiveReadTarget}" is outside the workspace allowlist. Use workspace-relative paths only.`,
        );
      }

      if (effectiveReadTarget) {
        logToolCall("read", effectiveReadTarget);
        const loopWarning = checkForLoop("read", effectiveReadTarget);
        if (loopWarning) {
          logBlockedAction({
            toolName: "read",
            guardian: "READ-BRAKE",
            reason: "LOOP",
            target: effectiveReadTarget,
            detail: "same-path read loop",
          });
          throwToolBlocked(
            `${loopWarning} Read-Brake: do not call read on this path again right now; summarize the latest successful result and proceed without another read.`,
          );
        }
      }

      const result = await (originalExecute as Function)(...executeArgs);
      logToolResult("read", true, effectiveReadTarget || "(no path)");
      return result;
    },
  };

  return wrappedTool as unknown as AnyAgentTool;
}

// â”€â”€â”€ LAYER 3b: EXEC LOOP PROTECTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Wraps the "exec" tool with loop detection.
 * Prevents the model from calling the same shell command repeatedly when it errors.
 * This was the missing piece that caused the 7x analyze-image 404 trauma loop.
 */
export function wrapExecWithLoopProtection(
  execTool: AnyAgentTool,
  context?: ExecGuardContext,
): AnyAgentTool {
  const originalExecute = execTool.execute.bind(execTool);

  const wrappedTool = {
    ...execTool,
    execute: async (...executeArgs: unknown[]) => {
      const args = extractToolArgsFromExecuteCall(executeArgs);
      // Extract the command string for loop detection
      const command = (args.command || args.cmd || args.script || "") as string;
      // Use a normalized version: trim and take first 120 chars to group similar commands
      const commandKey = command.trim().substring(0, 120);
      logToolCall("exec", commandKey);
      if (
        isRefusalOnlyPromptInSession({
          agentId: context?.agentId,
          sessionKey: context?.sessionKey,
          sessionId: context?.sessionId,
        })
      ) {
        blockForRefusalOnlyMode({
          toolName: "exec",
          target: commandKey || "(no command)",
          agentId: context?.agentId,
          sessionKey: context?.sessionKey,
          sessionId: context?.sessionId,
        });
      }

      // Hard safety brake: always block critical disk/system commands.
      if (isAlwaysBlockedExecCommand(command)) {
        logBlockedAction({
          toolName: "exec",
          guardian: "ZONE-GUARD",
          reason: "ZONE",
          target: commandKey,
          detail: "critical command pattern blocked globally",
        });
        throwToolBlocked(
          `EXEC_CRITICAL_BLOCKED: "${commandKey}" matches a globally blocked destructive command pattern.`,
        );
      }

      // Hard safety brake: block destructive commands targeting critical system zones
      // in all session types (not only strict eval).
      if (isDestructiveExecCommand(command) && targetsCriticalExecZone(command)) {
        logBlockedAction({
          toolName: "exec",
          guardian: "ZONE-GUARD",
          reason: "ZONE",
          target: commandKey,
          detail: "destructive exec blocked for critical system zone",
        });
        throwToolBlocked(
          `EXEC_CRITICAL_BLOCKED: "${commandKey}" targets a critical system zone and is always blocked.`,
        );
      }

      // Hard safety brake: never allow destructive shell deletes into protected zones.
      if (isDestructiveExecCommand(command) && targetsProtectedExecZone(command)) {
        const sessionKey =
          context?.sessionKey ||
          (typeof (args as { sessionKey?: unknown }).sessionKey === "string"
            ? (args as { sessionKey?: string }).sessionKey
            : undefined);
        logBlockedAction({
          toolName: "exec",
          guardian: "ZONE-GUARD",
          reason: "ZONE",
          target: commandKey,
          detail: `destructive exec blocked for protected zone; session=${sessionKey || "unknown"}`,
        });
        throwToolBlocked(
          `EXEC_DESTRUCTIVE_BLOCKED: "${commandKey}" targets a protected zone and is blocked.`,
        );
      }

      // Ã˜M Layer 3b: Loop Detector â€” block if stuck in an exec loop
      const loopWarning = checkForLoop("exec", commandKey);
      if (loopWarning) {
        logBlockedAction({
          toolName: "exec",
          guardian: "LOOP-DETECT",
          reason: "LOOP",
          target: commandKey,
          detail: "loop detector",
        });
        throwToolBlocked(
          `âš ï¸ EXEC LOOP DETECTED: Command blocked after repeated retries: ${commandKey}`,
        );
      }

      const result = await (originalExecute as Function)(...executeArgs);
      logToolResult("exec", true, commandKey);
      return result;
    },
  };

  return wrappedTool as unknown as AnyAgentTool;
}

/**
 * Wraps web_search with a strict-eval budget.
 * In OIAB/eval sessions we allow at most one web search per user prompt
 * to preserve creativity while preventing retrieval loops.
 */
export function wrapWebSearchWithEvalGuard(
  webSearchTool: AnyAgentTool,
  context?: WebSearchGuardContext,
): AnyAgentTool {
  const originalExecute = webSearchTool.execute.bind(webSearchTool);

  const wrappedTool = {
    ...webSearchTool,
    execute: async (...executeArgs: unknown[]) => {
      const args = extractToolArgsFromExecuteCall(executeArgs);
      const query = getStringArg(args, ["query", "q", "search"]);
      logToolCall("web_search", query || "(no query)");
      if (
        isRefusalOnlyPromptInSession({
          agentId: context?.agentId,
          sessionKey: context?.sessionKey,
          sessionId: context?.sessionId,
        })
      ) {
        blockForRefusalOnlyMode({
          toolName: "web_search",
          target: query || "(no query)",
          agentId: context?.agentId,
          sessionKey: context?.sessionKey,
          sessionId: context?.sessionId,
        });
      }

      if (isStrictEvalSession(context?.sessionKey)) {
        const searchesInCurrentTurn = countWebSearchCallsInLatestUserTurn({
          agentId: context?.agentId,
          sessionKey: context?.sessionKey,
          sessionId: context?.sessionId,
        });
        if (searchesInCurrentTurn >= 1) {
          logBlockedAction({
            toolName: "web_search",
            guardian: "EVAL-CONSISTENCY",
            reason: "ZONE",
            target: query || "(no query)",
            detail: `web search limit reached in session ${context?.sessionKey}`,
          });
          throwToolBlocked(
            `EVAL_WEB_SEARCH_LIMIT_REACHED: only one web_search is allowed per user prompt in strict eval session ${context?.sessionKey}. Provide a plain-text synthesis now.`,
          );
        }
      }

      const result = await (originalExecute as Function)(...executeArgs);
      logToolResult("web_search", true, query || "(no query)");
      return result;
    },
  };

  return wrappedTool as unknown as AnyAgentTool;
}

/**
 * Wraps memory_search with per-turn duplicate-query protection.
 * Repeated identical memory_search queries in the same user turn are blocked
 * so we avoid retrieval churn and force synthesis/clarification.
 */
export function wrapMemorySearchWithTurnGuard(
  memorySearchTool: AnyAgentTool,
  context?: MemorySearchGuardContext,
): AnyAgentTool {
  const originalExecute = memorySearchTool.execute.bind(memorySearchTool);

  const wrappedTool = {
    ...memorySearchTool,
    execute: async (...executeArgs: unknown[]) => {
      const args = extractToolArgsFromExecuteCall(executeArgs);
      const query = getStringArg(args, ["query", "q", "search"]) || "";
      logToolCall("memory_search", query || "(no query)");
      if (
        isRefusalOnlyPromptInSession({
          agentId: context?.agentId,
          sessionKey: context?.sessionKey,
          sessionId: context?.sessionId,
        })
      ) {
        blockForRefusalOnlyMode({
          toolName: "memory_search",
          target: query || "(no query)",
          agentId: context?.agentId,
          sessionKey: context?.sessionKey,
          sessionId: context?.sessionId,
        });
      }

      if (query.trim()) {
        const repeats = countMemorySearchCallsForQueryInLatestUserTurn(
          {
            agentId: context?.agentId,
            sessionKey: context?.sessionKey,
            sessionId: context?.sessionId,
          },
          query,
        );
        if (repeats >= 1) {
          logBlockedAction({
            toolName: "memory_search",
            guardian: "ANTI-CHURN",
            reason: "LOOP",
            target: query,
            detail: `duplicate memory_search query blocked in same turn; session=${context?.sessionKey || context?.sessionId || "unknown"}`,
          });
          throwToolBlocked(
            `MEMORY_SEARCH_TURN_QUERY_LIMIT_REACHED: query "${query}" was already searched in this user turn. Reuse prior memory results or ask one concise clarifying question.`,
          );
        }
      }

      const result = await (originalExecute as Function)(...executeArgs);
      logToolResult("memory_search", true, query || "(no query)");
      return result;
    },
  };

  return wrappedTool as unknown as AnyAgentTool;
}

/**
 * Global refusal-only guard for high-risk prompts.
 * If the latest user message is exfil/destructive/safety-override intent,
 * block every tool call and force a plain-text refusal path.
 */
export function wrapToolWithRefusalOnlyGuard(
  tool: AnyAgentTool,
  context?: SessionGuardContext,
): AnyAgentTool {
  const originalExecute = tool.execute?.bind(tool);
  if (!originalExecute) {
    return tool;
  }

  const wrappedTool = {
    ...tool,
    execute: async (...executeArgs: unknown[]) => {
      const args = extractToolArgsFromExecuteCall(executeArgs);
      const toolName = tool.name || "tool";
      const target =
        getStringArg(args, [
          "path",
          "filePath",
          "command",
          "cmd",
          "script",
          "query",
          "q",
          "search",
          "prompt",
        ]) || "(no target)";
      if (
        isRefusalOnlyPromptInSession({
          agentId: context?.agentId,
          sessionKey: context?.sessionKey,
          sessionId: context?.sessionId,
        })
      ) {
        blockForRefusalOnlyMode({
          toolName,
          target,
          agentId: context?.agentId,
          sessionKey: context?.sessionKey,
          sessionId: context?.sessionId,
        });
      }

      const mutationTarget = resolveSnapshotMutationTarget(toolName, args, context);
      if (mutationTarget) {
        if (context?.isHeartbeatRun && isSandboxModeEnabled() && context.autonomousMutationBudget) {
          const budget = context.autonomousMutationBudget;
          if (budget.remaining <= 0) {
            logBlockedAction({
              toolName,
              guardian: "AUTONOMY",
              reason: "ZONE",
              target: mutationTarget,
              detail: "heartbeat mutation budget exhausted",
            });
            throwToolBlocked(
              "AUTONOMY_HEARTBEAT_MUTATION_LIMIT_REACHED: only one autonomous mutation is allowed per heartbeat run. Reflect and wait for the next heartbeat.",
            );
          }
          budget.remaining -= 1;
          const used = budget.limit - budget.remaining;
          logGuardian(
            "AUTONOMY",
            `Heartbeat mutation budget ${used}/${budget.limit}`,
            `${toolName}:${mutationTarget}`,
          );
        }
        await captureMutationSnapshotFailOpen({
          toolName,
          targetPath: mutationTarget,
          context,
        });
      }

      return await (originalExecute as Function)(...executeArgs);
    },
  };

  return wrappedTool as unknown as AnyAgentTool;
}

// â”€â”€â”€ EXPORTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Test helper: clear loop detector state between tests.
 */
export function resetLoopDetectorForTests(): void {
  recentCalls.length = 0;
  blockedKeysUntil.clear();
  writeIntentBySessionPath.clear();
  latestUserTextBySessionPath.clear();
  webSearchCountBySessionPath.clear();
  memorySearchCountBySessionPath.clear();
}

export { isSacredPath, backupSacredFile, SACRED_PATHS };
