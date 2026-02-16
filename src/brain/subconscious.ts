import { completeSimple, type Api, type Model } from "@mariozechner/pi-ai";
import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
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
const MAX_TEXT_FOR_LOG = 280;
const MAX_NOTES_CHARS = 420;
const MAX_GOAL_CHARS = 240;
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
  activityLogger?: (event: string, details: string) => void;
  modelResolver?: BrainSubconsciousModelResolver;
  modelInvoker?: BrainSubconsciousModelInvoker;
};

type BrainSubconsciousRuntimeConfig = {
  enabled: boolean;
  modelRef?: string;
  timeoutMs: number;
};

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
  input: Pick<BrainSubconsciousObserverRunInput, "enabled" | "modelRef" | "timeoutMs"> = {},
): BrainSubconsciousRuntimeConfig {
  const enabled = input.enabled ?? isTruthyEnvValue(process.env.OM_SUBCONSCIOUS_ENABLED);
  const modelRef = normalizeModelRef(input.modelRef ?? process.env.OM_SUBCONSCIOUS_MODEL);
  const envTimeoutRaw = Number(process.env.OM_SUBCONSCIOUS_TIMEOUT_MS);
  const timeoutMs = normalizeTimeoutMs(
    typeof input.timeoutMs === "number" ? input.timeoutMs : envTimeoutRaw,
  );
  return {
    enabled,
    modelRef,
    timeoutMs,
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
    const line = `[${formatOmTimestamp(new Date())}] [${layer}] ${event} | ${details}\n`;
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

export function parseSubconsciousBrief(raw: string): BrainSubconsciousBrief {
  const jsonCandidate = extractJsonCandidate(raw);
  const parsed = JSON.parse(jsonCandidate) as unknown;
  const brief = BrainSubconsciousBriefSchema.parse(parsed);
  return {
    ...brief,
    goal: brief.goal.trim(),
    notes: brief.notes.trim(),
  };
}

function buildSubconsciousPrompt(userMessage: string): string {
  return [
    "Du bist Oem Unterbewusstsein (Observer-Modus).",
    "Aufgabe: Analysiere die Benutzeranfrage und liefere NUR ein JSON-Objekt.",
    "Output ONLY JSON. No thinking tags inside the response body if possible.",
    "Keine Erklaerung, kein Markdown, keine Tool-Aufrufe.",
    "Schema:",
    '{"goal":"...", "risk":"low|medium|high", "mustAskUser":true|false, "recommendedMode":"answer_direct|ask_clarify|plan_then_answer", "notes":"..."}',
    'Wenn unsicher, nutze defaults und liefere trotzdem JSON. "notes" darf leer sein.',
    "",
    "Benutzeranfrage:",
    userMessage.trim(),
  ].join("\n");
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
    {
      signal: input.signal,
      apiKey: input.apiKey,
      reasoning: "low",
      maxTokens: 320,
    },
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

  logger("START", `model=${sanitizeLogDetail(runtime.modelRef)};timeoutMs=${runtime.timeoutMs}`);

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
      }),
    );
    const brief = parseSubconsciousBrief(raw);
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
