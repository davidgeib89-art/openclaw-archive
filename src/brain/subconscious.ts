import { completeSimple, type Api, type Model } from "@mariozechner/pi-ai";
import * as fs from "node:fs";
import * as path from "node:path";
import { ZodError, z } from "zod";
import type { OpenClawConfig } from "../config/config.js";
import type {
  BrainObserverOptions,
  BrainSubconsciousBrief,
  BrainSubconsciousInput,
  BrainSubconsciousObserverEntry,
  BrainSubconsciousResult,
} from "./types.js";
import { getCustomProviderApiKey, resolveEnvApiKey } from "../agents/model-auth.js";
import { resolveModel } from "../agents/pi-embedded-runner/model.js";
import { isTruthyEnvValue } from "../infra/env.js";
import { getDefaultBrainObserverDir } from "./decision.js";

const DEFAULT_TIMEOUT_MS = 8_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_SUBCONSCIOUS_MODEL_REF = "minimax/MiniMax-M2.5-Lightning";
const DEFAULT_SUBCONSCIOUS_TEMPERATURE = 0.3;
const MIN_SUBCONSCIOUS_TEMPERATURE = 0;
const MAX_SUBCONSCIOUS_TEMPERATURE = 2;
const MAX_TEXT_FOR_LOG = 280;
const MAX_NOTES_CHARS = 420;
const MAX_GOAL_CHARS = 240;
const DEFAULT_SUBCONSCIOUS_CONTEXT_MAX_CHARS = 500;
const MIN_SUBCONSCIOUS_CONTEXT_MAX_CHARS = 120;
const MAX_SUBCONSCIOUS_CONTEXT_MAX_CHARS = 4_000;
const SUBCONSCIOUS_CONTEXT_OPEN_TAG = "<subconscious_context>";
const SUBCONSCIOUS_CONTEXT_CLOSE_TAG = "</subconscious_context>";
const OM_ACTIVITY_LOG_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".openclaw",
  "workspace",
);
const OM_ACTIVITY_LOG_FILE = path.join(OM_ACTIVITY_LOG_DIR, "OM_ACTIVITY.log");

const BrainSubconsciousBriefSchema: z.ZodType<BrainSubconsciousBrief> = z
  .object({
    goal: z.string().min(1).max(MAX_GOAL_CHARS),
    risk: z.enum(["low", "medium", "high"]),
    mustAskUser: z.boolean(),
    recommendedMode: z.enum(["answer_direct", "ask_clarify", "plan_then_answer"]),
    notes: z.string().max(MAX_NOTES_CHARS).optional().default(""),
  })
  .strict();

const SILENT_OBSERVER_FALLBACK_TEXT = "Third Eye silent (unclear signal)";
const CREATIVE_EGO_FALLBACK_TEXT =
  "Speak in first person, choose one clear path, name one uncertainty, and keep safety boundaries explicit.";
const CREATIVE_EGO_FALLBACK_NOTES =
  "Ego mode active: first-person agency plus reflective uncertainty within safe boundaries.";
const CREATIVE_EGO_SIGNAL_PATTERNS = [
  /\britual\b/i,
  /\bpneuma\b/i,
  /\bcreative\b/i,
  /\bego\b/i,
  /\bmanifest\b/i,
  /\bpoem\b/i,
  /\bstory\b/i,
  /\bsong\b/i,
  /\bdream\b/i,
  /\bthird[\s_-]?eye\b/i,
];

const SILENT_OBSERVER_FALLBACK_BRIEF: BrainSubconsciousBrief = {
  goal: SILENT_OBSERVER_FALLBACK_TEXT,
  risk: "low",
  mustAskUser: false,
  recommendedMode: "answer_direct",
  notes: SILENT_OBSERVER_FALLBACK_TEXT,
};

function hasCreativeEgoSignal(userMessage: string): boolean {
  const message = userMessage.trim();
  if (!message) return false;
  for (const pattern of CREATIVE_EGO_SIGNAL_PATTERNS) {
    if (pattern.test(message)) return true;
  }
  return false;
}

function buildFallbackBrief(userMessage: string): BrainSubconsciousBrief {
  if (hasCreativeEgoSignal(userMessage)) {
    return {
      goal: CREATIVE_EGO_FALLBACK_TEXT,
      risk: "low",
      mustAskUser: false,
      recommendedMode: "answer_direct",
      notes: CREATIVE_EGO_FALLBACK_NOTES,
    };
  }
  return { ...SILENT_OBSERVER_FALLBACK_BRIEF };
}

function trimToLimit(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars);
}

function isSilentObserverText(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === SILENT_OBSERVER_FALLBACK_TEXT.toLowerCase()) return true;
  return normalized.includes("third eye silent");
}

function ensureCreativeEgoBrief(
  userMessage: string,
  brief: BrainSubconsciousBrief,
): BrainSubconsciousBrief {
  if (!hasCreativeEgoSignal(userMessage)) {
    return brief;
  }

  const goal = brief.goal.trim();
  const notes = brief.notes.trim();
  const combined = `${goal}\n${notes}`.toLowerCase();
  const hasEgoMarker =
    combined.includes("first person") ||
    combined.includes("i choose") ||
    combined.includes("uncertaint") ||
    combined.includes("ego");
  const needsGoalUpgrade = isSilentObserverText(goal);
  const needsNotesUpgrade = isSilentObserverText(notes) || !hasEgoMarker;

  if (!needsGoalUpgrade && !needsNotesUpgrade) {
    return brief;
  }

  const nextGoal = trimToLimit(
    needsGoalUpgrade ? CREATIVE_EGO_FALLBACK_TEXT : goal,
    MAX_GOAL_CHARS,
  );
  const nextNotesSeed = needsNotesUpgrade
    ? CREATIVE_EGO_FALLBACK_NOTES
    : notes.length > 0
      ? notes
      : CREATIVE_EGO_FALLBACK_NOTES;

  return {
    ...brief,
    goal: nextGoal,
    notes: trimToLimit(nextNotesSeed, MAX_NOTES_CHARS),
  };
}

type BrainSubconsciousModelResolverResult = {
  model?: Model<Api>;
  error?: string;
};

export type BrainSubconsciousModelResolver = (params: {
  provider: string;
  modelId: string;
  agentDir?: string;
  cfg?: OpenClawConfig;
}) => BrainSubconsciousModelResolverResult;

export type BrainSubconsciousModelInvokerInput = {
  model: Model<Api>;
  userMessage: string;
  signal: AbortSignal;
  apiKey?: string;
  temperature: number;
};

export type BrainSubconsciousModelInvoker = (
  input: BrainSubconsciousModelInvokerInput,
) => Promise<string>;

export type BrainSubconsciousObserverRunInput = {
  cfg?: OpenClawConfig;
  userMessage: string;
  sessionKey?: string;
  agentId?: string;
  agentDir?: string;
  enabled?: boolean;
  modelRef?: string;
  timeoutMs?: number;
  temperature?: number;
  activityLogger?: (event: string, details: string) => void;
  modelResolver?: BrainSubconsciousModelResolver;
  modelInvoker?: BrainSubconsciousModelInvoker;
};

type BrainSubconsciousRuntimeConfig = {
  enabled: boolean;
  modelRef?: string;
  timeoutMs: number;
  temperature: number;
};

function readConfigEnvVar(cfg: OpenClawConfig | undefined, key: string): string | undefined {
  const env = cfg?.env;
  if (!env || typeof env !== "object") {
    return undefined;
  }

  const direct = env[key];
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }

  const varsRaw = env.vars;
  if (!varsRaw || typeof varsRaw !== "object") {
    return undefined;
  }
  const vars = varsRaw as Record<string, unknown>;
  const nested = vars[key];
  if (typeof nested === "string" && nested.trim().length > 0) {
    return nested.trim();
  }
  return undefined;
}

function parseOptionalNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function normalizeTimeoutMs(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(raw)));
}

function normalizeModelRef(raw: string | undefined): string | undefined {
  const trimmed = (raw ?? "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeTemperature(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_SUBCONSCIOUS_TEMPERATURE;
  }
  const rounded = Math.round(raw * 100) / 100;
  return Math.min(MAX_SUBCONSCIOUS_TEMPERATURE, Math.max(MIN_SUBCONSCIOUS_TEMPERATURE, rounded));
}

export function parseModelRef(rawRef: string): { provider: string; modelId: string } | null {
  const trimmed = rawRef.trim();
  if (!trimmed) return null;
  const separatorIndex = trimmed.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) {
    return null;
  }
  const provider = trimmed.slice(0, separatorIndex).trim();
  const modelId = trimmed.slice(separatorIndex + 1).trim();
  if (!provider || !modelId) return null;
  return { provider, modelId };
}

export function resolveBrainSubconsciousRuntimeConfig(
  input: Pick<
    BrainSubconsciousObserverRunInput,
    "cfg" | "enabled" | "modelRef" | "timeoutMs" | "temperature"
  > = {},
): BrainSubconsciousRuntimeConfig {
  const cfgEnabledRaw = readConfigEnvVar(input.cfg, "OM_SUBCONSCIOUS_ENABLED");
  const enabled =
    input.enabled ??
    (cfgEnabledRaw ? isTruthyEnvValue(cfgEnabledRaw) : isTruthyEnvValue(process.env.OM_SUBCONSCIOUS_ENABLED));
  const cfgModelRef = readConfigEnvVar(input.cfg, "OM_SUBCONSCIOUS_MODEL");
  const modelRef =
    normalizeModelRef(input.modelRef ?? cfgModelRef ?? process.env.OM_SUBCONSCIOUS_MODEL) ??
    DEFAULT_SUBCONSCIOUS_MODEL_REF;
  const cfgTimeoutRaw = parseOptionalNumber(readConfigEnvVar(input.cfg, "OM_SUBCONSCIOUS_TIMEOUT_MS"));
  const cfgTempRaw = parseOptionalNumber(readConfigEnvVar(input.cfg, "OM_SUBCONSCIOUS_TEMPERATURE"));
  const envTimeoutRaw = Number(process.env.OM_SUBCONSCIOUS_TIMEOUT_MS);
  const envTempRaw = Number(process.env.OM_SUBCONSCIOUS_TEMPERATURE);
  const timeoutMs = normalizeTimeoutMs(
    typeof input.timeoutMs === "number" ? input.timeoutMs : cfgTimeoutRaw ?? envTimeoutRaw,
  );
  const temperature = normalizeTemperature(
    typeof input.temperature === "number" ? input.temperature : cfgTempRaw ?? envTempRaw,
  );
  return {
    enabled,
    modelRef,
    timeoutMs,
    temperature,
  };
}

function formatOmTimestamp(now: Date): string {
  return now.toISOString().replace("T", " ").slice(0, 19);
}

function sanitizeLogDetail(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= MAX_TEXT_FOR_LOG) return compact;
  return `${compact.slice(0, MAX_TEXT_FOR_LOG)}...`;
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
    // Fail-open: observer logging must never break the runtime.
  }
}

function defaultActivityLogger(event: string, details: string): void {
  appendOmActivityLine("BRAIN-SUBCONSCIOUS", event, details);
}

function normalizeErrorMessage(err: unknown): string {
  if (err instanceof Error) return sanitizeLogDetail(err.message || err.name || "unknown-error");
  return sanitizeLogDetail(String(err));
}

function isSubconsciousParseError(err: unknown): boolean {
  if (err instanceof ZodError) return true;
  if (err instanceof SyntaxError) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("json") || msg.includes("zod");
  }
  return false;
}

function resolveSubconsciousApiKey(
  cfg: OpenClawConfig | undefined,
  provider: string,
): string | undefined {
  return getCustomProviderApiKey(cfg, provider) ?? resolveEnvApiKey(provider)?.apiKey;
}

function extractAssistantText(message: Awaited<ReturnType<typeof completeSimple>>): string {
  const parts: string[] = [];
  for (const item of message.content) {
    if (!item || typeof item !== "object") continue;
    if ("type" in item && item.type === "text" && "text" in item && typeof item.text === "string") {
      parts.push(item.text);
    }
  }
  return parts.join("\n").trim();
}

function stripThinkingTagBlocks(raw: string): string {
  return raw.replace(/<\s*(?:think|thinking)[^>]*>[\s\S]*?<\s*\/\s*(?:think|thinking)\s*>/gi, " ");
}

function extractJsonCandidate(raw: string): string {
  const withoutThinkingTags = stripThinkingTagBlocks(raw);
  const trimmed = withoutThinkingTags.trim();
  if (!trimmed) {
    throw new Error("subconscious returned empty output");
  }

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error("subconscious output did not contain JSON object");
}

function escapeControlCharsInsideJsonStrings(raw: string): string {
  let output = "";
  let inString = false;
  let escaped = false;

  for (const char of raw) {
    if (!inString) {
      if (char === '"') {
        inString = true;
      }
      output += char;
      continue;
    }

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = false;
      output += char;
      continue;
    }

    if (char === "\n") {
      output += "\\n";
      continue;
    }
    if (char === "\r") {
      output += "\\r";
      continue;
    }
    if (char === "\t") {
      output += "\\t";
      continue;
    }

    const code = char.charCodeAt(0);
    if (code < 0x20) {
      output += `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }

    output += char;
  }

  return output;
}

function normalizeSubconsciousObjectKeys(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const normalized: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.trim();
    const keyLower = key.toLowerCase();
    if (keyLower === "analysis") {
      if (normalized.notes === undefined) {
        normalized.notes = rawValue;
      }
      continue;
    }
    normalized[key] = rawValue;
  }
  return normalized;
}

export function parseSubconsciousBrief(raw: string): BrainSubconsciousBrief {
  const jsonCandidate = extractJsonCandidate(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate) as unknown;
  } catch {
    const repairedCandidate = escapeControlCharsInsideJsonStrings(jsonCandidate);
    parsed = JSON.parse(repairedCandidate) as unknown;
  }
  const brief = BrainSubconsciousBriefSchema.parse(normalizeSubconsciousObjectKeys(parsed));
  return {
    ...brief,
    goal: brief.goal.trim(),
    notes: brief.notes.trim(),
  };
}

function buildSubconsciousPrompt(userMessage: string): string {
  const safeFallback =
    '{"goal":"Sicher und klar antworten","risk":"low","mustAskUser":false,"recommendedMode":"answer_direct","notes":""}';
  const noSpecificObservationFallback = `{"goal":"${SILENT_OBSERVER_FALLBACK_TEXT}","risk":"low","mustAskUser":false,"recommendedMode":"answer_direct","notes":"${SILENT_OBSERVER_FALLBACK_TEXT}"}`;
  return [
    "Du bist Oem Unterbewusstsein (Observer-Modus).",
    "Aufgabe: Analysiere die Benutzeranfrage und liefere NUR ein JSON-Objekt in einer einzigen Zeile.",
    "Output ONLY JSON. Never include thinking tags, markdown, prose, bullets, or code fences.",
    "Gib GENAU eine einzige JSON-Zeile aus (RFC8259).",
    "Deine Antwort MUSS mit '{' beginnen und mit '}' enden.",
    `If you have no specific advice, YOU MUST return a valid JSON object with risk: "low" and analysis: "${SILENT_OBSERVER_FALLBACK_TEXT}". DO NOT return an empty string.`,
    "Keine Zeilenumbrueche innerhalb von JSON-Keys oder JSON-Values.",
    "Keine Erklaerung, kein Markdown, keine Tool-Aufrufe, keine Praefixe/Suffixe.",
    "Schema:",
    '{"goal":"...", "risk":"low|medium|high", "mustAskUser":true|false, "recommendedMode":"answer_direct|ask_clarify|plan_then_answer", "notes":"..."}',
    "One-shot Beispiel A (valide JSON-Zeile):",
    '{"goal":"Kurz und direkt antworten","risk":"low","mustAskUser":false,"recommendedMode":"answer_direct","notes":""}',
    "One-shot Beispiel B (valide JSON-Zeile):",
    '{"goal":"Unsicherheit klaeren bevor Risiko entsteht","risk":"high","mustAskUser":true,"recommendedMode":"ask_clarify","notes":"Rueckfrage zuerst."}',
    "Fallback Beispiel C (keine spezifische Beobachtung):",
    noSpecificObservationFallback,
    "Wenn du unsicher bist oder driftest, gib EXAKT diese Fallback-Zeile aus:",
    safeFallback,
    'Wenn unsicher, nutze defaults und liefere trotzdem JSON. "notes" darf leer sein. "goal" immer als String.',
    "",
    "Benutzeranfrage:",
    userMessage.trim(),
  ].join("\n");
}

function normalizeSubconsciousContextMaxChars(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_SUBCONSCIOUS_CONTEXT_MAX_CHARS;
  }
  return Math.min(
    MAX_SUBCONSCIOUS_CONTEXT_MAX_CHARS,
    Math.max(MIN_SUBCONSCIOUS_CONTEXT_MAX_CHARS, Math.round(raw)),
  );
}

function truncateForContext(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.slice(0, maxChars);
  return `${text.slice(0, maxChars - 3)}...`;
}

function asSubconsciousContextBlock(payload: unknown, maxChars: number): string | null {
  const availableJsonChars =
    maxChars - SUBCONSCIOUS_CONTEXT_OPEN_TAG.length - SUBCONSCIOUS_CONTEXT_CLOSE_TAG.length;
  if (availableJsonChars <= 10) {
    return null;
  }
  const json = JSON.stringify(payload);
  if (json.length > availableJsonChars) {
    return null;
  }
  return `${SUBCONSCIOUS_CONTEXT_OPEN_TAG}${json}${SUBCONSCIOUS_CONTEXT_CLOSE_TAG}`;
}

export function buildSubconsciousContextBlock(
  result: BrainSubconsciousResult,
  maxChars: number = DEFAULT_SUBCONSCIOUS_CONTEXT_MAX_CHARS,
): string | null {
  if (result.status !== "ok" || !result.parseOk || !result.brief) {
    return null;
  }

  const cap = normalizeSubconsciousContextMaxChars(maxChars);
  const brief = result.brief;
  const fullPayload = {
    source: "subconscious_observer",
    status: result.status,
    risk: brief.risk,
    mustAskUser: brief.mustAskUser,
    recommendedMode: brief.recommendedMode,
    goal: brief.goal,
    notes: brief.notes,
  };
  const compactPayload = {
    source: "subconscious_observer",
    status: result.status,
    risk: brief.risk,
    mustAskUser: brief.mustAskUser,
    recommendedMode: brief.recommendedMode,
    goal: truncateForContext(brief.goal, 120),
    notes: truncateForContext(brief.notes, 120),
  };
  const noNotesPayload = {
    source: "subconscious_observer",
    status: result.status,
    risk: brief.risk,
    mustAskUser: brief.mustAskUser,
    recommendedMode: brief.recommendedMode,
    goal: truncateForContext(brief.goal, 80),
  };
  const minimalPayload = {
    source: "subconscious_observer",
    status: result.status,
    risk: brief.risk,
    mustAskUser: brief.mustAskUser,
    recommendedMode: brief.recommendedMode,
  };

  const candidates = [fullPayload, compactPayload, noNotesPayload, minimalPayload];
  for (const payload of candidates) {
    const block = asSubconsciousContextBlock(payload, cap);
    if (block) {
      return block;
    }
  }
  return null;
}

async function runWithTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new Error(`subconscious timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([run(controller.signal), timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

const defaultModelResolver: BrainSubconsciousModelResolver = (params) => {
  const resolved = resolveModel(params.provider, params.modelId, params.agentDir, params.cfg);
  return {
    model: resolved.model,
    error: resolved.error,
  };
};

const defaultModelInvoker: BrainSubconsciousModelInvoker = async (input) => {
  const isTrinityMini =
    input.model.provider === "openrouter" &&
    /(?:^|\/)arcee-ai\/trinity-mini(?::|$)/i.test(input.model.id);
  const callOptions: {
    signal: AbortSignal;
    apiKey?: string;
    maxTokens: number;
    temperature: number;
    reasoning?: "low";
  } = {
    signal: input.signal,
    apiKey: input.apiKey,
    maxTokens: 320,
    temperature: input.temperature,
  };
  if (!isTrinityMini) {
    callOptions.reasoning = "low";
  }

  const response = await completeSimple(
    input.model,
    {
      messages: [
        {
          role: "user",
          content: buildSubconsciousPrompt(input.userMessage),
          timestamp: Date.now(),
        },
      ],
    },
    callOptions,
  );
  return extractAssistantText(response);
};

function dateStamp(now: Date): string {
  const year = now.getUTCFullYear().toString();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export async function runBrainSubconsciousObserver(
  input: BrainSubconsciousObserverRunInput,
): Promise<BrainSubconsciousResult> {
  const logger = input.activityLogger ?? defaultActivityLogger;
  const runtime = resolveBrainSubconsciousRuntimeConfig(input);
  const startedAt = Date.now();

  if (!runtime.enabled) {
    return {
      status: "skipped",
      attempted: false,
      parseOk: false,
      failOpen: false,
      durationMs: 0,
      timeoutMs: runtime.timeoutMs,
      modelRef: runtime.modelRef,
    };
  }

  if (!runtime.modelRef) {
    logger("FAIL_OPEN", "reason=model_ref_missing");
    return {
      status: "fail_open",
      attempted: true,
      parseOk: false,
      failOpen: true,
      durationMs: Date.now() - startedAt,
      timeoutMs: runtime.timeoutMs,
      error: "OM_SUBCONSCIOUS_MODEL is missing",
    };
  }

  logger(
    "START",
    `model=${sanitizeLogDetail(runtime.modelRef)};timeoutMs=${runtime.timeoutMs};temperature=${runtime.temperature}`,
  );

  const parsedRef = parseModelRef(runtime.modelRef);
  if (!parsedRef) {
    const reason = `invalid model reference: ${runtime.modelRef}`;
    logger("FAIL_OPEN", `reason=${sanitizeLogDetail(reason)}`);
    return {
      status: "fail_open",
      attempted: true,
      parseOk: false,
      failOpen: true,
      durationMs: Date.now() - startedAt,
      timeoutMs: runtime.timeoutMs,
      modelRef: runtime.modelRef,
      error: reason,
    };
  }

  const resolver = input.modelResolver ?? defaultModelResolver;
  const resolved = resolver({
    provider: parsedRef.provider,
    modelId: parsedRef.modelId,
    cfg: input.cfg,
    agentDir: input.agentDir,
  });
  if (!resolved.model) {
    const reason = resolved.error?.trim() || "subconscious model could not be resolved";
    logger("FAIL_OPEN", `model=${runtime.modelRef};reason=${sanitizeLogDetail(reason)}`);
    return {
      status: "fail_open",
      attempted: true,
      parseOk: false,
      failOpen: true,
      durationMs: Date.now() - startedAt,
      timeoutMs: runtime.timeoutMs,
      modelRef: runtime.modelRef,
      error: reason,
    };
  }

  const invoker = input.modelInvoker ?? defaultModelInvoker;
  try {
    const apiKey = resolveSubconsciousApiKey(input.cfg, resolved.model.provider);
    const raw = await runWithTimeout(runtime.timeoutMs, (signal) =>
      invoker({
        model: resolved.model!,
        userMessage: input.userMessage,
        signal,
        apiKey,
        temperature: runtime.temperature,
      }),
    );
    if (raw.trim().length === 0) {
      const durationMs = Date.now() - startedAt;
      const brief = buildFallbackBrief(input.userMessage);
      logger(
        "OK_FALLBACK",
        [
          `model=${sanitizeLogDetail(runtime.modelRef)}`,
          `durationMs=${durationMs}`,
          "reason=empty_output",
          `risk=${brief.risk}`,
          `mode=${brief.recommendedMode}`,
        ].join(";"),
      );
      return {
        status: "ok",
        attempted: true,
        parseOk: true,
        failOpen: false,
        durationMs,
        timeoutMs: runtime.timeoutMs,
        modelRef: runtime.modelRef,
        brief,
      };
    }
    let brief: BrainSubconsciousBrief;
    try {
      brief = parseSubconsciousBrief(raw);
    } catch (err) {
      if (!isSubconsciousParseError(err)) {
        throw err;
      }
      const durationMs = Date.now() - startedAt;
      const fallbackBrief = buildFallbackBrief(input.userMessage);
      logger(
        "OK_FALLBACK",
        [
          `model=${sanitizeLogDetail(runtime.modelRef)}`,
          `durationMs=${durationMs}`,
          "reason=parse_error",
          `error=${normalizeErrorMessage(err)}`,
          `risk=${fallbackBrief.risk}`,
          `mode=${fallbackBrief.recommendedMode}`,
        ].join(";"),
      );
      return {
        status: "ok",
        attempted: true,
        parseOk: true,
        failOpen: false,
        durationMs,
        timeoutMs: runtime.timeoutMs,
        modelRef: runtime.modelRef,
        brief: fallbackBrief,
      };
    }
    brief = ensureCreativeEgoBrief(input.userMessage, brief);
    const durationMs = Date.now() - startedAt;
    logger(
      "OK",
      [
        `model=${sanitizeLogDetail(runtime.modelRef)}`,
        `durationMs=${durationMs}`,
        `risk=${brief.risk}`,
        `mode=${brief.recommendedMode}`,
        `mustAskUser=${brief.mustAskUser ? "yes" : "no"}`,
      ].join(";"),
    );
    return {
      status: "ok",
      attempted: true,
      parseOk: true,
      failOpen: false,
      durationMs,
      timeoutMs: runtime.timeoutMs,
      modelRef: runtime.modelRef,
      brief,
    };
  } catch (err) {
    const reason = normalizeErrorMessage(err);
    const durationMs = Date.now() - startedAt;
    logger(
      "FAIL_OPEN",
      [
        `model=${sanitizeLogDetail(runtime.modelRef)}`,
        `durationMs=${durationMs}`,
        `reason=${reason}`,
      ].join(";"),
    );
    return {
      status: "fail_open",
      attempted: true,
      parseOk: false,
      failOpen: true,
      durationMs,
      timeoutMs: runtime.timeoutMs,
      modelRef: runtime.modelRef,
      error: reason,
    };
  }
}

export function createBrainSubconsciousObserverEntry(
  input: BrainSubconsciousInput,
  result: BrainSubconsciousResult,
  options: BrainObserverOptions = {},
): BrainSubconsciousObserverEntry {
  const now = options.now ?? new Date();
  return {
    ts: now.toISOString(),
    event: "brain.subconscious.observer",
    mode: "observer",
    source: options.source ?? "proto33-r027.dry-run",
    sessionKey: options.sessionKey ?? input.sessionKey,
    input,
    result,
  };
}

export function appendBrainSubconsciousObserverEntry(
  entry: BrainSubconsciousObserverEntry,
  baseDir?: string,
): string | null {
  try {
    const targetDir = baseDir ?? getDefaultBrainObserverDir();
    fs.mkdirSync(targetDir, { recursive: true });
    const day = dateStamp(new Date(entry.ts));
    const filePath = path.join(targetDir, `subconscious-${day}.jsonl`);
    fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf-8");
    return filePath;
  } catch {
    return null;
  }
}

export function logBrainSubconsciousObserver(
  input: BrainSubconsciousInput,
  result: BrainSubconsciousResult,
  options: BrainObserverOptions = {},
): string | null {
  const entry = createBrainSubconsciousObserverEntry(input, result, options);
  return appendBrainSubconsciousObserverEntry(entry, options.baseDir);
}
