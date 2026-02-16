import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

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

const READ_ONLY_TOOL_PATTERN = /(read|search|find|grep|list|ls|status|memory|history|view|fetch|show|cat)/i;
const HIGH_RISK_TOOL_PATTERN = /(delete|drop|truncate|rm|wipe|exec|shell|bash|terminal|publish|deploy|reset|kill)/i;

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

function buildExplanation(intent: BrainIntent, riskLevel: BrainRiskLevel, mustAskUser: boolean): string {
  const askUserNote = mustAskUser ? " User confirmation required before risky actions." : "";
  return `Observer decision: intent=${intent}, risk=${riskLevel}. ENOENT must not trigger placeholder-file writes.${askUserNote}`;
}

function formatAllowedToolsForGuidance(allowedTools: readonly string[]): string {
  if (allowedTools.length === 0) return "none";
  return allowedTools.join(", ");
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

export function appendBrainObserverEntry(entry: BrainObserverEntry, baseDir?: string): string | null {
  return appendBrainAuditEntry(entry, baseDir);
}

export function appendBrainGuidanceEntry(entry: BrainGuidanceEntry, baseDir?: string): string | null {
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
