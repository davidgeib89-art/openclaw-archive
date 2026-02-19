import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { OpenClawConfig } from "../config/config.js";
import { resolveMemorySearchConfig } from "../agents/memory-search.js";

const DEFAULT_EPISODIC_JOURNAL_RELATIVE_PATH = "memory/EPISODIC_JOURNAL.md";
const DEFAULT_EPISODIC_STRUCTURED_RELATIVE_PATH = "memory/EPISODIC_JOURNAL.jsonl";
const DEFAULT_EPISODIC_METADATA_DB_RELATIVE_PATH = "logs/brain/episodic-memory.sqlite";
const DEFAULT_MEMORY_INDEX_RELATIVE_PATH = "memory/MEMORY_INDEX.md";
const EPISODIC_STRUCTURED_ROTATE_ENABLED_ENV = "OM_EPISODIC_STRUCTURED_ROTATE_ENABLED";
const EPISODIC_STRUCTURED_ROTATE_MAX_BYTES_ENV = "OM_EPISODIC_STRUCTURED_ROTATE_MAX_BYTES";
const EPISODIC_STRUCTURED_ROTATE_MAX_FILES_ENV = "OM_EPISODIC_STRUCTURED_ROTATE_MAX_FILES";
const EPISODIC_METADATA_COMPACTION_ENABLED_ENV = "OM_EPISODIC_METADATA_COMPACTION_ENABLED";
const EPISODIC_METADATA_MAX_ROWS_ENV = "OM_EPISODIC_METADATA_MAX_ROWS";
const EPISODIC_METADATA_RETENTION_DAYS_ENV = "OM_EPISODIC_METADATA_RETENTION_DAYS";
const EPISODIC_METADATA_LOW_SCORE_RETENTION_DAYS_ENV =
  "OM_EPISODIC_METADATA_LOW_SCORE_RETENTION_DAYS";
const EPISODIC_METADATA_LOW_SCORE_THRESHOLD_ENV = "OM_EPISODIC_METADATA_LOW_SCORE_THRESHOLD";
const EPISODIC_GRAPH_ENABLED_ENV = "OM_EPISODIC_GRAPH_ENABLED";
const EPISODIC_GRAPH_MAX_RELATIONSHIPS_PER_ENTRY = 16;
const EPISODIC_GRAPH_CONFLICT_POLICY_ENABLED_ENV = "OM_EPISODIC_GRAPH_CONFLICT_POLICY_ENABLED";
const GRAPH_SINGLE_TARGET_PREDICATES = new Set([
  "IDENTITY",
  "PREFERS",
  "DECIDES",
  "GOAL",
  "MANAGES",
]);
const DEFAULT_EPISODIC_METADATA_MAX_ROWS = 6000;
const DEFAULT_EPISODIC_METADATA_RETENTION_DAYS = 365;
const DEFAULT_EPISODIC_METADATA_LOW_SCORE_RETENTION_DAYS = 45;
const DEFAULT_EPISODIC_METADATA_LOW_SCORE_THRESHOLD = 2;
const DEFAULT_EPISODIC_STRUCTURED_ROTATE_MAX_BYTES = 2_000_000;
const DEFAULT_EPISODIC_STRUCTURED_ROTATE_MAX_FILES = 5;
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_USER_CHARS = 560;
const MAX_ASSISTANT_CHARS = 900;
const SIGNIFICANCE_THRESHOLD = 2;
const MEMORY_INDEX_SIGNIFICANCE_THRESHOLD = 3;
const HEARTBEAT_ACK = "HEARTBEAT_OK";
const EPISODIC_METADATA_SCHEMA_VERSION = 2;
const EPISODIC_HEADER = [
  "# EPISODIC JOURNAL",
  "",
  "Append-only autobiographical memory stream for salient user-assistant turns.",
  "Each entry is scored by deterministic significance heuristics.",
  "",
].join("\n");

const MEMORY_INDEX_HEADER = [
  "# MEMORY INDEX",
  "",
  "Associative recall index for high-signal episodic events.",
  "Format: timestamp + compact tags + user/assistant cue snippets.",
  "",
].join("\n");

type EpisodicSignal = "preference" | "decision" | "identity" | "goal" | "long_turn";
type EpisodicKind = "identity" | "preference" | "decision" | "goal" | "creative" | "general";

type EpisodicScore = {
  score: number;
  signals: EpisodicSignal[];
};

type EpisodicCompactionPolicy = {
  enabled: boolean;
  maxRows: number;
  retentionDays: number;
  lowScoreRetentionDays: number;
  lowScoreThreshold: number;
};

type EpisodicStructuredRotationPolicy = {
  enabled: boolean;
  maxBytes: number;
  maxFiles: number;
};

type SqlValue = string | number | bigint | Uint8Array | null;

export type BrainEpisodicWriteInput = {
  cfg?: OpenClawConfig;
  agentId?: string;
  workspaceDir: string;
  runId: string;
  sessionKey?: string;
  userMessage: string;
  assistantMessage: string;
  now?: () => Date;
};

export type BrainEpisodicWriteResult = {
  persisted: boolean;
  path: string;
  score: number;
  signals: EpisodicSignal[];
  kinds: EpisodicKind[];
  primaryKind: EpisodicKind;
  entryId?: string;
  structuredPath?: string;
  metadataDbPath?: string;
  structuredPersisted?: boolean;
  metadataPersisted?: boolean;
  structuredRotated?: boolean;
  structuredRotationPrunedFiles?: number;
  compactionApplied?: boolean;
  compactionDeletedRows?: number;
  graphPersisted?: boolean;
  graphRelationshipsExtracted?: number;
  graphRelationshipsInserted?: number;
  graphOrphanRelationshipsDeleted?: number;
  graphConflictsResolved?: number;
  memoryIndexPath?: string;
  memoryIndexUpdated?: boolean;
  reason: string;
};

type BrainEpisodicStructuredEntry = {
  schemaVersion: number;
  entryId: string;
  ts: string;
  createdAt: number;
  runId: string;
  sessionKey: string;
  score: number;
  signals: EpisodicSignal[];
  kinds: EpisodicKind[];
  primaryKind: EpisodicKind;
  user: string;
  assistant: string;
  markdownPath: string;
  structuredPath: string;
};

type SemanticRelationshipEntry = {
  id: string;
  entryId: string;
  sourceEntity: string;
  predicate: string;
  targetEntity: string;
  confidence: number;
  sourceFile: string;
  createdAt: number;
};

const PREFERENCE_PATTERNS = [
  /\b(i like|i love|i prefer|my favorite|prefer)\b/i,
  /\b(ich mag|ich liebe|ich bevorzuge|mein lieblings)\b/i,
];
const DECISION_PATTERNS = [
  /\b(i choose|i decide|i will|i commit)\b/i,
  /\b(ich entscheide|ich werde|ich verpflichte)\b/i,
];
const IDENTITY_PATTERNS = [
  /\b(my name is|i am)\b/i,
  /\b(my (?:secret )?(?:codename|code\s*name|alias) is|i go by)\b/i,
  /\b(ich hei[sß]e|ich bin)\b/i,
  /\b(mein(?:en)? (?:codename|alias) ist)\b/i,
];
const GOAL_PATTERNS = [
  /\b(goal|roadmap|milestone|next step|plan)\b/i,
  /\b(ziel|fahrplan|meilenstein|naechster schritt|nächster schritt|plan)\b/i,
];
const HEARTBEAT_PROMPT_PATTERNS = [
  /read (?:agenda|heartbeat)\.md if it exists/i,
  /if nothing needs attention, reply heartbeat_ok/i,
];
const CREATIVE_PATTERNS = [
  /\b(creative|poem|story|song|ego|ritual|manifest|dream)\b/i,
  /\b(kreativ|gedicht|geschichte|lied|ego|ritual|manifest|traum)\b/i,
];

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

function normalizeTurnText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function matchesAny(patterns: readonly RegExp[], value: string): boolean {
  for (const pattern of patterns) {
    if (pattern.test(value)) {
      return true;
    }
  }
  return false;
}

function scoreTurnSignificance(userMessage: string, assistantMessage: string): EpisodicScore {
  const signals = new Set<EpisodicSignal>();
  let score = 0;
  const user = normalizeTurnText(userMessage);
  const assistant = normalizeTurnText(assistantMessage);
  const combined = `${user}\n${assistant}`;

  if (matchesAny(PREFERENCE_PATTERNS, combined)) {
    score += 2;
    signals.add("preference");
  }
  if (matchesAny(DECISION_PATTERNS, combined)) {
    score += 2;
    signals.add("decision");
  }
  if (matchesAny(IDENTITY_PATTERNS, user)) {
    score += 2;
    signals.add("identity");
  }
  if (matchesAny(GOAL_PATTERNS, combined)) {
    score += 1;
    signals.add("goal");
  }
  if (user.length >= 120 || assistant.length >= 200) {
    score += 1;
    signals.add("long_turn");
  }

  return {
    score,
    signals: Array.from(signals),
  };
}

function isHeartbeatTurn(userMessage: string, assistantMessage: string): boolean {
  const user = normalizeTurnText(userMessage);
  const assistant = normalizeTurnText(assistantMessage);
  if (!assistant) {
    return true;
  }
  if (assistant.toUpperCase() === HEARTBEAT_ACK) {
    return true;
  }
  return HEARTBEAT_PROMPT_PATTERNS.every((pattern) => pattern.test(user));
}

function resolveJournalPath(workspaceDir: string): string {
  const fromEnv = process.env.OM_EPISODIC_JOURNAL_PATH?.trim();
  const rel = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_EPISODIC_JOURNAL_RELATIVE_PATH;
  return path.resolve(workspaceDir, rel);
}

function resolveStructuredPath(workspaceDir: string): string {
  const fromEnv = process.env.OM_EPISODIC_STRUCTURED_PATH?.trim();
  const rel = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_EPISODIC_STRUCTURED_RELATIVE_PATH;
  return path.resolve(workspaceDir, rel);
}

function resolveMetadataDbPath(workspaceDir: string): string {
  const fromEnv = process.env.OM_EPISODIC_METADATA_DB_PATH?.trim();
  const rel = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_EPISODIC_METADATA_DB_RELATIVE_PATH;
  return path.resolve(workspaceDir, rel);
}

function resolveMemoryIndexPath(workspaceDir: string): string {
  const fromEnv = process.env.OM_MEMORY_INDEX_PATH?.trim();
  const rel = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_MEMORY_INDEX_RELATIVE_PATH;
  return path.resolve(workspaceDir, rel);
}

function readEnvBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (["0", "false", "off", "no"].includes(raw)) {
    return false;
  }
  if (["1", "true", "on", "yes"].includes(raw)) {
    return true;
  }
  return fallback;
}

function readEnvInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function resolveEpisodicMetadataCompactionPolicy(): EpisodicCompactionPolicy {
  return {
    enabled: readEnvBoolean(EPISODIC_METADATA_COMPACTION_ENABLED_ENV, false),
    maxRows: readEnvInteger(
      EPISODIC_METADATA_MAX_ROWS_ENV,
      DEFAULT_EPISODIC_METADATA_MAX_ROWS,
      1,
      200000,
    ),
    retentionDays: readEnvInteger(
      EPISODIC_METADATA_RETENTION_DAYS_ENV,
      DEFAULT_EPISODIC_METADATA_RETENTION_DAYS,
      1,
      3650,
    ),
    lowScoreRetentionDays: readEnvInteger(
      EPISODIC_METADATA_LOW_SCORE_RETENTION_DAYS_ENV,
      DEFAULT_EPISODIC_METADATA_LOW_SCORE_RETENTION_DAYS,
      1,
      3650,
    ),
    lowScoreThreshold: readEnvInteger(
      EPISODIC_METADATA_LOW_SCORE_THRESHOLD_ENV,
      DEFAULT_EPISODIC_METADATA_LOW_SCORE_THRESHOLD,
      0,
      100,
    ),
  };
}

function resolveEpisodicStructuredRotationPolicy(): EpisodicStructuredRotationPolicy {
  return {
    enabled: readEnvBoolean(EPISODIC_STRUCTURED_ROTATE_ENABLED_ENV, false),
    maxBytes: readEnvInteger(
      EPISODIC_STRUCTURED_ROTATE_MAX_BYTES_ENV,
      DEFAULT_EPISODIC_STRUCTURED_ROTATE_MAX_BYTES,
      64,
      200_000_000,
    ),
    maxFiles: readEnvInteger(
      EPISODIC_STRUCTURED_ROTATE_MAX_FILES_ENV,
      DEFAULT_EPISODIC_STRUCTURED_ROTATE_MAX_FILES,
      1,
      500,
    ),
  };
}

function formatTimestampForFileName(now: Date): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

function isEpisodicWriteEnabled(
  cfg: OpenClawConfig | undefined,
  agentId: string | undefined,
): boolean {
  const envRaw = process.env.OM_EPISODIC_WRITE_ENABLED?.trim().toLowerCase();
  if (envRaw) {
    if (["0", "false", "off", "no"].includes(envRaw)) {
      return false;
    }
    if (["1", "true", "on", "yes"].includes(envRaw)) {
      return true;
    }
  }

  if (!cfg) {
    return false;
  }
  const effectiveAgentId = agentId?.trim() || "main";
  return resolveMemorySearchConfig(cfg, effectiveAgentId) !== null;
}

async function ensureJournalHeader(journalPath: string): Promise<void> {
  try {
    await fs.access(journalPath);
  } catch {
    await fs.mkdir(path.dirname(journalPath), { recursive: true });
    await fs.writeFile(journalPath, EPISODIC_HEADER, "utf-8");
  }
}

function buildJournalEntry(params: {
  now: Date;
  runId: string;
  sessionKey?: string;
  userMessage: string;
  assistantMessage: string;
  score: number;
  signals: readonly EpisodicSignal[];
}): string {
  const user = truncateText(normalizeTurnText(params.userMessage), MAX_USER_CHARS);
  const assistant = truncateText(normalizeTurnText(params.assistantMessage), MAX_ASSISTANT_CHARS);
  const sessionKey = params.sessionKey?.trim() || "n/a";
  const signals = params.signals.length > 0 ? params.signals.join(", ") : "none";
  return [
    `## [${params.now.toISOString()}] run=${params.runId} session=${sessionKey}`,
    `- score: ${params.score}`,
    `- signals: ${signals}`,
    `- user: ${user}`,
    `- assistant: ${assistant}`,
    "",
  ].join("\n");
}

function deriveEpisodicKinds(params: {
  signals: readonly EpisodicSignal[];
  userMessage: string;
  assistantMessage: string;
}): EpisodicKind[] {
  const kinds = new Set<EpisodicKind>();
  for (const signal of params.signals) {
    if (signal === "identity") kinds.add("identity");
    if (signal === "preference") kinds.add("preference");
    if (signal === "decision") kinds.add("decision");
    if (signal === "goal") kinds.add("goal");
  }
  const combined = `${params.userMessage}\n${params.assistantMessage}`;
  if (matchesAny(CREATIVE_PATTERNS, combined)) {
    kinds.add("creative");
  }
  if (kinds.size === 0) {
    kinds.add("general");
  }
  return Array.from(kinds);
}

function resolvePrimaryEpisodicKind(kinds: readonly EpisodicKind[]): EpisodicKind {
  const ordered: EpisodicKind[] = [
    "identity",
    "preference",
    "decision",
    "goal",
    "creative",
    "general",
  ];
  for (const kind of ordered) {
    if (kinds.includes(kind)) {
      return kind;
    }
  }
  return "general";
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeEntity(value: string, maxChars: number = 96): string {
  const normalized = value
    .replace(/[`"'()[\]{}]+/g, "")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }
  return truncateText(normalized, maxChars);
}

function normalizePredicate(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function buildRelationshipId(params: {
  entryId: string;
  sourceEntity: string;
  predicate: string;
  targetEntity: string;
}): string {
  return hashText(
    `${params.entryId}|${params.sourceEntity}|${params.predicate}|${params.targetEntity}`,
  ).slice(0, 24);
}

function extractSemanticRelationships(params: {
  entry: BrainEpisodicStructuredEntry;
}): SemanticRelationshipEntry[] {
  const relationships: SemanticRelationshipEntry[] = [];
  const seen = new Set<string>();
  const graphEnabled = readEnvBoolean(EPISODIC_GRAPH_ENABLED_ENV, true);
  if (!graphEnabled) {
    return relationships;
  }

  const addRelationship = (sourceEntity: string, predicate: string, targetEntity: string) => {
    const normalizedSource = normalizeEntity(sourceEntity);
    const normalizedPredicate = normalizePredicate(predicate);
    const normalizedTarget = normalizeEntity(targetEntity);
    if (!normalizedSource || !normalizedPredicate || !normalizedTarget) {
      return;
    }
    const dedupeKey = `${normalizedSource}|${normalizedPredicate}|${normalizedTarget}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    relationships.push({
      id: buildRelationshipId({
        entryId: params.entry.entryId,
        sourceEntity: normalizedSource,
        predicate: normalizedPredicate,
        targetEntity: normalizedTarget,
      }),
      entryId: params.entry.entryId,
      sourceEntity: normalizedSource,
      predicate: normalizedPredicate,
      targetEntity: normalizedTarget,
      confidence: 1,
      sourceFile: params.entry.markdownPath,
      createdAt: params.entry.createdAt,
    });
  };

  const userText = params.entry.user;
  const assistantText = params.entry.assistant;
  const combinedText = `${userText}\n${assistantText}`;

  for (const match of combinedText.matchAll(
    /\b([A-Z][A-Za-z0-9_-]{1,31}(?:\s+[A-Z][A-Za-z0-9_-]{1,31}){0,2})\s+(?:manages?|leads?|owns?|verwaltet|leitet)\s+([A-Z][A-Za-z0-9_-]{1,31}(?:\s+[A-Z][A-Za-z0-9_-]{1,31}){0,3})/g,
  )) {
    addRelationship(match[1] ?? "", "MANAGES", match[2] ?? "");
    if (relationships.length >= EPISODIC_GRAPH_MAX_RELATIONSHIPS_PER_ENTRY) {
      return relationships;
    }
  }

  for (const match of userText.matchAll(
    /\b(?:i\s+(?:really\s+)?(?:prefer|like|love)|ich\s+(?:mag|liebe|bevorzuge))\s+([^.!?\n]{2,96})/gi,
  )) {
    addRelationship("Operator", "PREFERS", match[1] ?? "");
    if (relationships.length >= EPISODIC_GRAPH_MAX_RELATIONSHIPS_PER_ENTRY) {
      return relationships;
    }
  }

  for (const match of userText.matchAll(
    /\b(?:i\s+(?:choose|decide)(?:\s+to)?|ich\s+entscheide(?:\s+mich)?(?:\s+dafuer)?)\s+([^.!?\n]{2,96})/gi,
  )) {
    addRelationship("Operator", "DECIDES", match[1] ?? "");
    if (relationships.length >= EPISODIC_GRAPH_MAX_RELATIONSHIPS_PER_ENTRY) {
      return relationships;
    }
  }

  for (const match of assistantText.matchAll(
    /\b(?:i\s+(?:choose|decide)(?:\s+to)?|ich\s+entscheide(?:\s+mich)?(?:\s+dafuer)?)\s+([^.!?\n]{2,96})/gi,
  )) {
    addRelationship("Om", "DECIDES", match[1] ?? "");
    if (relationships.length >= EPISODIC_GRAPH_MAX_RELATIONSHIPS_PER_ENTRY) {
      return relationships;
    }
  }

  for (const match of userText.matchAll(
    /\b(?:my\s+name\s+is|i\s+am|my\s+(?:secret\s+)?(?:codename|code\s*name|alias)\s+is|i\s+go\s+by|ich\s+heisse|ich\s+bin|mein(?:en)?\s+(?:codename|alias)\s+ist)\s+([A-Z][A-Za-z0-9_-]{1,31}(?:\s+[A-Z][A-Za-z0-9_-]{1,31}){0,2})/gi,
  )) {
    addRelationship("Operator", "IDENTITY", match[1] ?? "");
    if (relationships.length >= EPISODIC_GRAPH_MAX_RELATIONSHIPS_PER_ENTRY) {
      return relationships;
    }
  }

  for (const match of userText.matchAll(
    /\b(?:goal|next step|plan|ziel|naechster schritt|nächster schritt)\b\s*(?:is|:)?\s*([^.!?\n]{2,96})/gi,
  )) {
    addRelationship("Operator", "GOAL", match[1] ?? "");
    if (relationships.length >= EPISODIC_GRAPH_MAX_RELATIONSHIPS_PER_ENTRY) {
      return relationships;
    }
  }

  return relationships;
}

function normalizeIndexTag(raw: string): string {
  const normalized = raw
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return normalized;
}

function deriveMemoryIndexTags(params: {
  signals: readonly EpisodicSignal[];
  kinds: readonly EpisodicKind[];
  primaryKind: EpisodicKind;
  relationships: readonly SemanticRelationshipEntry[];
}): string[] {
  const tags = new Set<string>();
  tags.add(params.primaryKind);
  for (const signal of params.signals) {
    tags.add(signal);
  }
  for (const kind of params.kinds) {
    tags.add(kind);
  }
  for (const relation of params.relationships) {
    tags.add(relation.predicate.toLowerCase());
    tags.add(relation.sourceEntity);
    tags.add(relation.targetEntity);
  }

  const normalized: string[] = [];
  for (const raw of tags) {
    const tag = normalizeIndexTag(raw);
    if (tag.length < 2) {
      continue;
    }
    if (!normalized.includes(tag)) {
      normalized.push(tag);
    }
    if (normalized.length >= 12) {
      break;
    }
  }
  return normalized;
}

async function ensureMemoryIndexHeader(memoryIndexPath: string): Promise<void> {
  try {
    await fs.access(memoryIndexPath);
  } catch {
    await fs.mkdir(path.dirname(memoryIndexPath), { recursive: true });
    await fs.writeFile(memoryIndexPath, MEMORY_INDEX_HEADER, "utf-8");
  }
}

function buildMemoryIndexLine(params: {
  now: Date;
  entry: BrainEpisodicStructuredEntry;
  tags: readonly string[];
}): string {
  const renderedTags = params.tags.map((tag) => `#${tag}`).join(" ");
  const userCue = truncateText(params.entry.user, 140);
  const assistantCue = truncateText(params.entry.assistant, 180);
  return `- [${params.now.toISOString()}] ${renderedTags} score=${params.entry.score} kind=${params.entry.primaryKind} entry=${params.entry.entryId} | user: ${userCue} | assistant: ${assistantCue}`;
}

async function persistMemoryIndexEntry(params: {
  memoryIndexPath: string;
  now: Date;
  entry: BrainEpisodicStructuredEntry;
  tags: readonly string[];
}): Promise<boolean> {
  if (params.entry.score < MEMORY_INDEX_SIGNIFICANCE_THRESHOLD || params.tags.length === 0) {
    return false;
  }
  try {
    await ensureMemoryIndexHeader(params.memoryIndexPath);
    const line = `${buildMemoryIndexLine(params)}\n`;
    await fs.appendFile(params.memoryIndexPath, line, "utf-8");
    return true;
  } catch {
    return false;
  }
}

function buildStructuredEntry(params: {
  now: Date;
  runId: string;
  sessionKey?: string;
  score: number;
  signals: readonly EpisodicSignal[];
  kinds: readonly EpisodicKind[];
  primaryKind: EpisodicKind;
  userMessage: string;
  assistantMessage: string;
  markdownPath: string;
  structuredPath: string;
}): BrainEpisodicStructuredEntry {
  const createdAt = params.now.getTime();
  const sessionKey = params.sessionKey?.trim() || "n/a";
  const user = truncateText(normalizeTurnText(params.userMessage), MAX_USER_CHARS);
  const assistant = truncateText(normalizeTurnText(params.assistantMessage), MAX_ASSISTANT_CHARS);
  const entryId = hashText(
    [
      params.runId,
      sessionKey,
      params.now.toISOString(),
      params.score.toString(),
      params.signals.join(","),
      user,
      assistant,
    ].join("|"),
  ).slice(0, 24);
  return {
    schemaVersion: EPISODIC_METADATA_SCHEMA_VERSION,
    entryId,
    ts: params.now.toISOString(),
    createdAt,
    runId: params.runId,
    sessionKey,
    score: params.score,
    signals: [...params.signals],
    kinds: [...params.kinds],
    primaryKind: params.primaryKind,
    user,
    assistant,
    markdownPath: params.markdownPath,
    structuredPath: params.structuredPath,
  };
}

function ensureEpisodicMetadataSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS episodic_entries (
      entry_id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL,
      ts TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      run_id TEXT NOT NULL,
      session_key TEXT NOT NULL,
      score INTEGER NOT NULL,
      signals TEXT NOT NULL,
      kinds TEXT NOT NULL,
      primary_kind TEXT NOT NULL,
      user_text TEXT NOT NULL,
      assistant_text TEXT NOT NULL,
      user_hash TEXT NOT NULL,
      assistant_hash TEXT NOT NULL,
      markdown_path TEXT NOT NULL,
      structured_path TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_episodic_entries_created_at
      ON episodic_entries(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_episodic_entries_primary_kind
      ON episodic_entries(primary_kind);
    CREATE INDEX IF NOT EXISTS idx_episodic_entries_session_key
      ON episodic_entries(session_key);
    CREATE TABLE IF NOT EXISTS semantic_relationships (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      source_entity TEXT NOT NULL,
      predicate TEXT NOT NULL,
      target_entity TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      source_file TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(entry_id) REFERENCES episodic_entries(entry_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_semantic_relationships_entry_id
      ON semantic_relationships(entry_id);
    CREATE INDEX IF NOT EXISTS idx_semantic_relationships_source
      ON semantic_relationships(source_entity);
    CREATE INDEX IF NOT EXISTS idx_semantic_relationships_target
      ON semantic_relationships(target_entity);
    CREATE INDEX IF NOT EXISTS idx_semantic_relationships_predicate
      ON semantic_relationships(predicate);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_semantic_relationships_unique_fact
      ON semantic_relationships(entry_id, source_entity, predicate, target_entity);
  `);
}

function runDelete(db: DatabaseSync, sql: string, ...params: SqlValue[]): number {
  const result = db.prepare(sql).run(...params) as { changes?: number | bigint };
  if (typeof result?.changes === "number") {
    return result.changes;
  }
  if (typeof result?.changes === "bigint") {
    return Number(result.changes);
  }
  return 0;
}

function applyEpisodicMetadataCompaction(params: {
  db: DatabaseSync;
  now: Date;
  policy: EpisodicCompactionPolicy;
}): number {
  if (!params.policy.enabled) {
    return 0;
  }
  let deletedRows = 0;
  const nowMs = params.now.getTime();
  const lowScoreCutoffMs = nowMs - params.policy.lowScoreRetentionDays * MILLIS_PER_DAY;
  const retentionCutoffMs = nowMs - params.policy.retentionDays * MILLIS_PER_DAY;

  deletedRows += runDelete(
    params.db,
    `DELETE FROM episodic_entries
      WHERE created_at < ?
        AND score <= ?`,
    lowScoreCutoffMs,
    params.policy.lowScoreThreshold,
  );

  deletedRows += runDelete(
    params.db,
    `DELETE FROM episodic_entries
      WHERE created_at < ?`,
    retentionCutoffMs,
  );

  deletedRows += runDelete(
    params.db,
    `DELETE FROM episodic_entries
      WHERE entry_id IN (
        SELECT entry_id FROM episodic_entries
        ORDER BY created_at DESC
        LIMIT -1 OFFSET ?
      )`,
    params.policy.maxRows,
  );

  return deletedRows;
}

function cleanupOrphanedSemanticRelationships(db: DatabaseSync): number {
  return runDelete(
    db,
    `DELETE FROM semantic_relationships
      WHERE entry_id NOT IN (
        SELECT entry_id FROM episodic_entries
      )`,
  );
}

function isGraphConflictPolicyEnabled(): boolean {
  return readEnvBoolean(EPISODIC_GRAPH_CONFLICT_POLICY_ENABLED_ENV, true);
}

function resolveGraphConflictsForRelationship(params: {
  db: DatabaseSync;
  relation: SemanticRelationshipEntry;
}): number {
  if (!isGraphConflictPolicyEnabled()) {
    return 0;
  }
  if (!GRAPH_SINGLE_TARGET_PREDICATES.has(params.relation.predicate)) {
    return 0;
  }
  if (params.relation.predicate === "MANAGES") {
    return runDelete(
      params.db,
      `DELETE FROM semantic_relationships
        WHERE predicate = ?
          AND target_entity = ?
          AND source_entity <> ?
          AND entry_id <> ?`,
      params.relation.predicate,
      params.relation.targetEntity,
      params.relation.sourceEntity,
      params.relation.entryId,
    );
  }
  return runDelete(
    params.db,
    `DELETE FROM semantic_relationships
      WHERE source_entity = ?
        AND predicate = ?
        AND target_entity <> ?
        AND entry_id <> ?`,
    params.relation.sourceEntity,
    params.relation.predicate,
    params.relation.targetEntity,
    params.relation.entryId,
  );
}

async function rotateStructuredJournalIfNeeded(params: {
  structuredPath: string;
  rotationToken: string;
  now: Date;
  policy: EpisodicStructuredRotationPolicy;
}): Promise<{ rotated: boolean; prunedFiles: number }> {
  if (!params.policy.enabled) {
    return { rotated: false, prunedFiles: 0 };
  }

  try {
    const stat = await fs.stat(params.structuredPath);
    if (!stat.isFile() || stat.size <= params.policy.maxBytes) {
      return { rotated: false, prunedFiles: 0 };
    }
  } catch {
    return { rotated: false, prunedFiles: 0 };
  }

  const rotatedPath = `${params.structuredPath}.${formatTimestampForFileName(params.now)}-${params.rotationToken}.jsonl`;
  try {
    await fs.rename(params.structuredPath, rotatedPath);
  } catch {
    return { rotated: false, prunedFiles: 0 };
  }

  let prunedFiles = 0;
  try {
    const dir = path.dirname(params.structuredPath);
    const baseName = path.basename(params.structuredPath);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const rotatedCandidates = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.startsWith(`${baseName}.`) &&
          entry.name.toLowerCase().endsWith(".jsonl"),
      )
      .map((entry) => path.join(dir, entry.name));
    if (rotatedCandidates.length > params.policy.maxFiles) {
      const withStats = await Promise.all(
        rotatedCandidates.map(async (filePath) => {
          try {
            const stat = await fs.stat(filePath);
            return { filePath, mtimeMs: stat.mtimeMs };
          } catch {
            return null;
          }
        }),
      );
      const sorted = withStats
        .filter((entry): entry is { filePath: string; mtimeMs: number } => entry !== null)
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
      const stale = sorted.slice(params.policy.maxFiles);
      for (const entry of stale) {
        await fs.rm(entry.filePath, { force: true });
        prunedFiles += 1;
      }
    }
  } catch {
    // Fail-open: rotation cleanup must not block persistence.
  }

  return { rotated: true, prunedFiles };
}

async function persistStructuredEpisodicEntry(params: {
  structuredPath: string;
  metadataDbPath: string;
  entry: BrainEpisodicStructuredEntry;
}): Promise<{
  structuredPersisted: boolean;
  structuredRotated: boolean;
  structuredRotationPrunedFiles: number;
  metadataPersisted: boolean;
  compactionApplied: boolean;
  compactionDeletedRows: number;
  graphPersisted: boolean;
  graphRelationshipsExtracted: number;
  graphRelationshipsInserted: number;
  graphOrphanRelationshipsDeleted: number;
  graphConflictsResolved: number;
}> {
  let structuredPersisted = false;
  let structuredRotated = false;
  let structuredRotationPrunedFiles = 0;
  let metadataPersisted = false;
  let compactionApplied = false;
  let compactionDeletedRows = 0;
  let graphPersisted = false;
  let graphRelationshipsExtracted = 0;
  let graphRelationshipsInserted = 0;
  let graphOrphanRelationshipsDeleted = 0;
  let graphConflictsResolved = 0;

  try {
    await fs.mkdir(path.dirname(params.structuredPath), { recursive: true });
    const rotationPolicy = resolveEpisodicStructuredRotationPolicy();
    const rotation = await rotateStructuredJournalIfNeeded({
      structuredPath: params.structuredPath,
      rotationToken: params.entry.entryId.slice(0, 8),
      now: new Date(params.entry.createdAt),
      policy: rotationPolicy,
    });
    structuredRotated = rotation.rotated;
    structuredRotationPrunedFiles = rotation.prunedFiles;
    await fs.appendFile(params.structuredPath, `${JSON.stringify(params.entry)}\n`, "utf-8");
    structuredPersisted = true;
  } catch {
    structuredPersisted = false;
    structuredRotated = false;
    structuredRotationPrunedFiles = 0;
  }

  try {
    await fs.mkdir(path.dirname(params.metadataDbPath), { recursive: true });
    const db = new DatabaseSync(params.metadataDbPath);
    try {
      ensureEpisodicMetadataSchema(db);
      db.prepare(
        `INSERT INTO episodic_entries (
           entry_id,
           schema_version,
           ts,
           created_at,
           run_id,
           session_key,
           score,
           signals,
           kinds,
           primary_kind,
           user_text,
           assistant_text,
           user_hash,
           assistant_hash,
           markdown_path,
           structured_path
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(entry_id) DO NOTHING`,
      ).run(
        params.entry.entryId,
        params.entry.schemaVersion,
        params.entry.ts,
        params.entry.createdAt,
        params.entry.runId,
        params.entry.sessionKey,
        params.entry.score,
        params.entry.signals.join(","),
        params.entry.kinds.join(","),
        params.entry.primaryKind,
        params.entry.user,
        params.entry.assistant,
        hashText(params.entry.user),
        hashText(params.entry.assistant),
        params.entry.markdownPath,
        params.entry.structuredPath,
      );
      const relationships = extractSemanticRelationships({ entry: params.entry });
      graphRelationshipsExtracted = relationships.length;
      if (relationships.length > 0) {
        const insertRelation = db.prepare(
          `INSERT INTO semantic_relationships (
             id,
             entry_id,
             source_entity,
             predicate,
             target_entity,
             confidence,
             source_file,
             created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
        );
        for (const relation of relationships) {
          graphConflictsResolved += resolveGraphConflictsForRelationship({
            db,
            relation,
          });
          insertRelation.run(
            relation.id,
            relation.entryId,
            relation.sourceEntity,
            relation.predicate,
            relation.targetEntity,
            relation.confidence,
            relation.sourceFile,
            relation.createdAt,
          );
          graphRelationshipsInserted += 1;
        }
      }
      const compactionPolicy = resolveEpisodicMetadataCompactionPolicy();
      if (compactionPolicy.enabled) {
        compactionDeletedRows = applyEpisodicMetadataCompaction({
          db,
          now: new Date(params.entry.createdAt),
          policy: compactionPolicy,
        });
        compactionApplied = true;
      }
      if (compactionApplied) {
        graphOrphanRelationshipsDeleted = cleanupOrphanedSemanticRelationships(db);
      }
      metadataPersisted = true;
      graphPersisted = true;
    } finally {
      db.close();
    }
  } catch {
    metadataPersisted = false;
    compactionApplied = false;
    compactionDeletedRows = 0;
    graphPersisted = false;
    graphRelationshipsExtracted = 0;
    graphRelationshipsInserted = 0;
    graphOrphanRelationshipsDeleted = 0;
    graphConflictsResolved = 0;
  }

  return {
    structuredPersisted,
    structuredRotated,
    structuredRotationPrunedFiles,
    metadataPersisted,
    compactionApplied,
    compactionDeletedRows,
    graphPersisted,
    graphRelationshipsExtracted,
    graphRelationshipsInserted,
    graphOrphanRelationshipsDeleted,
    graphConflictsResolved,
  };
}

export async function appendBrainEpisodicJournal(
  input: BrainEpisodicWriteInput,
): Promise<BrainEpisodicWriteResult> {
  const journalPath = resolveJournalPath(input.workspaceDir);
  const structuredPath = resolveStructuredPath(input.workspaceDir);
  const metadataDbPath = resolveMetadataDbPath(input.workspaceDir);
  const memoryIndexPath = resolveMemoryIndexPath(input.workspaceDir);
  const now = (input.now ?? (() => new Date()))();

  if (!isEpisodicWriteEnabled(input.cfg, input.agentId)) {
    return {
      persisted: false,
      path: journalPath,
      score: 0,
      signals: [],
      kinds: [],
      primaryKind: "general",
      structuredPath,
      metadataDbPath,
      structuredPersisted: false,
      metadataPersisted: false,
      structuredRotated: false,
      structuredRotationPrunedFiles: 0,
      compactionApplied: false,
      compactionDeletedRows: 0,
      memoryIndexPath,
      memoryIndexUpdated: false,
      reason: "disabled",
    };
  }

  const userMessage = normalizeTurnText(input.userMessage);
  const assistantMessage = normalizeTurnText(input.assistantMessage);
  if (!userMessage || !assistantMessage) {
    return {
      persisted: false,
      path: journalPath,
      score: 0,
      signals: [],
      kinds: [],
      primaryKind: "general",
      structuredPath,
      metadataDbPath,
      structuredPersisted: false,
      metadataPersisted: false,
      structuredRotated: false,
      structuredRotationPrunedFiles: 0,
      compactionApplied: false,
      compactionDeletedRows: 0,
      memoryIndexPath,
      memoryIndexUpdated: false,
      reason: "empty-turn",
    };
  }
  if (isHeartbeatTurn(userMessage, assistantMessage)) {
    return {
      persisted: false,
      path: journalPath,
      score: 0,
      signals: [],
      kinds: [],
      primaryKind: "general",
      structuredPath,
      metadataDbPath,
      structuredPersisted: false,
      metadataPersisted: false,
      structuredRotated: false,
      structuredRotationPrunedFiles: 0,
      compactionApplied: false,
      compactionDeletedRows: 0,
      memoryIndexPath,
      memoryIndexUpdated: false,
      reason: "heartbeat-turn",
    };
  }

  const scored = scoreTurnSignificance(userMessage, assistantMessage);
  if (scored.score < SIGNIFICANCE_THRESHOLD) {
    return {
      persisted: false,
      path: journalPath,
      score: scored.score,
      signals: scored.signals,
      kinds: [],
      primaryKind: "general",
      structuredPath,
      metadataDbPath,
      structuredPersisted: false,
      metadataPersisted: false,
      structuredRotated: false,
      structuredRotationPrunedFiles: 0,
      compactionApplied: false,
      compactionDeletedRows: 0,
      memoryIndexPath,
      memoryIndexUpdated: false,
      reason: "below-threshold",
    };
  }

  const kinds = deriveEpisodicKinds({
    signals: scored.signals,
    userMessage,
    assistantMessage,
  });
  const primaryKind = resolvePrimaryEpisodicKind(kinds);

  const entry = buildJournalEntry({
    now,
    runId: input.runId,
    sessionKey: input.sessionKey,
    userMessage,
    assistantMessage,
    score: scored.score,
    signals: scored.signals,
  });

  await ensureJournalHeader(journalPath);
  await fs.appendFile(journalPath, entry, "utf-8");

  const structuredEntry = buildStructuredEntry({
    now,
    runId: input.runId,
    sessionKey: input.sessionKey,
    score: scored.score,
    signals: scored.signals,
    kinds,
    primaryKind,
    userMessage,
    assistantMessage,
    markdownPath: journalPath,
    structuredPath,
  });
  const relationshipsForIndex = extractSemanticRelationships({ entry: structuredEntry });
  const persistedStructured = await persistStructuredEpisodicEntry({
    structuredPath,
    metadataDbPath,
    entry: structuredEntry,
  });
  const memoryIndexUpdated = await persistMemoryIndexEntry({
    memoryIndexPath,
    now,
    entry: structuredEntry,
    tags: deriveMemoryIndexTags({
      signals: scored.signals,
      kinds,
      primaryKind,
      relationships: relationshipsForIndex,
    }),
  });

  return {
    persisted: true,
    path: journalPath,
    score: scored.score,
    signals: scored.signals,
    kinds,
    primaryKind,
    entryId: structuredEntry.entryId,
    structuredPath,
    metadataDbPath,
    structuredPersisted: persistedStructured.structuredPersisted,
    structuredRotated: persistedStructured.structuredRotated,
    structuredRotationPrunedFiles: persistedStructured.structuredRotationPrunedFiles,
    metadataPersisted: persistedStructured.metadataPersisted,
    compactionApplied: persistedStructured.compactionApplied,
    compactionDeletedRows: persistedStructured.compactionDeletedRows,
    graphPersisted: persistedStructured.graphPersisted,
    graphRelationshipsExtracted: persistedStructured.graphRelationshipsExtracted,
    graphRelationshipsInserted: persistedStructured.graphRelationshipsInserted,
    graphOrphanRelationshipsDeleted: persistedStructured.graphOrphanRelationshipsDeleted,
    graphConflictsResolved: persistedStructured.graphConflictsResolved,
    memoryIndexPath,
    memoryIndexUpdated,
    reason: "persisted",
  };
}
