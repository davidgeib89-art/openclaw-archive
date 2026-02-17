import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import { resolveMemorySearchConfig } from "../agents/memory-search.js";

const DEFAULT_EPISODIC_JOURNAL_RELATIVE_PATH = "memory/EPISODIC_JOURNAL.md";
const MAX_USER_CHARS = 560;
const MAX_ASSISTANT_CHARS = 900;
const SIGNIFICANCE_THRESHOLD = 2;
const HEARTBEAT_ACK = "HEARTBEAT_OK";
const EPISODIC_HEADER = [
  "# EPISODIC JOURNAL",
  "",
  "Append-only autobiographical memory stream for salient user-assistant turns.",
  "Each entry is scored by deterministic significance heuristics.",
  "",
].join("\n");

type EpisodicSignal = "preference" | "decision" | "identity" | "goal" | "long_turn";

type EpisodicScore = {
  score: number;
  signals: EpisodicSignal[];
};

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
  reason: string;
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
  /\b(ich hei[sß]e|ich bin)\b/i,
];
const GOAL_PATTERNS = [
  /\b(goal|roadmap|milestone|next step|plan)\b/i,
  /\b(ziel|fahrplan|meilenstein|naechster schritt|nächster schritt|plan)\b/i,
];
const HEARTBEAT_PROMPT_PATTERNS = [
  /read heartbeat\.md if it exists/i,
  /if nothing needs attention, reply heartbeat_ok/i,
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

export async function appendBrainEpisodicJournal(
  input: BrainEpisodicWriteInput,
): Promise<BrainEpisodicWriteResult> {
  const journalPath = resolveJournalPath(input.workspaceDir);
  const now = (input.now ?? (() => new Date()))();

  if (!isEpisodicWriteEnabled(input.cfg, input.agentId)) {
    return {
      persisted: false,
      path: journalPath,
      score: 0,
      signals: [],
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
      reason: "empty-turn",
    };
  }
  if (isHeartbeatTurn(userMessage, assistantMessage)) {
    return {
      persisted: false,
      path: journalPath,
      score: 0,
      signals: [],
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
      reason: "below-threshold",
    };
  }

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

  return {
    persisted: true,
    path: journalPath,
    score: scored.score,
    signals: scored.signals,
    reason: "persisted",
  };
}
