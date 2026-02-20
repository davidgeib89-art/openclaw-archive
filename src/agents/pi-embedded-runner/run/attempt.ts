import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, ImageContent } from "@mariozechner/pi-ai";
import { streamSimple } from "@mariozechner/pi-ai";
import { createAgentSession, SessionManager, SettingsManager } from "@mariozechner/pi-coding-agent";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BrainHomeostasisTelemetry } from "../../../brain/types.js";
import type { EmbeddedRunAttemptParams, EmbeddedRunAttemptResult } from "./types.js";
import { resolveHeartbeatPrompt } from "../../../auto-reply/heartbeat.js";
import {
  buildBrainSacredRecallContext,
  createBrainAutonomyChoiceContract,
  createBrainDecision,
  createBrainRitualOutputContract,
  logBrainDecisionObserver,
} from "../../../brain/decision.js";
import { updateEnergy } from "../../../brain/energy.js";
import { appendBrainEpisodicJournal } from "../../../brain/episodic-memory.js";
import {
  buildSubconsciousContextBlock,
  logBrainSubconsciousObserver,
  runBrainSubconsciousObserver,
} from "../../../brain/subconscious.js";
import { resolveChannelCapabilities } from "../../../config/channel-capabilities.js";
import { emitAgentEvent } from "../../../infra/agent-events.js";
import { getMachineDisplayName } from "../../../infra/machine-name.js";
import { MAX_IMAGE_BYTES } from "../../../media/constants.js";
import { getGlobalHookRunner } from "../../../plugins/hook-runner-global.js";
import { isSubagentSessionKey, normalizeAgentId } from "../../../routing/session-key.js";
import { resolveSignalReactionLevel } from "../../../signal/reaction-level.js";
import { resolveTelegramInlineButtonsScope } from "../../../telegram/inline-buttons.js";
import { resolveTelegramReactionLevel } from "../../../telegram/reaction-level.js";
import { buildTtsSystemPromptHint } from "../../../tts/tts.js";
import { resolveUserPath } from "../../../utils.js";
import { normalizeMessageChannel } from "../../../utils/message-channel.js";
import { isReasoningTagProvider } from "../../../utils/provider-utils.js";
import { resolveOpenClawAgentDir } from "../../agent-paths.js";
import { resolveSessionAgentIds } from "../../agent-scope.js";
import { createAnthropicPayloadLogger } from "../../anthropic-payload-log.js";
import { makeBootstrapWarn, resolveBootstrapContextForRun } from "../../bootstrap-files.js";
import { createCacheTrace } from "../../cache-trace.js";
import {
  listChannelSupportedActions,
  resolveChannelMessageToolHints,
} from "../../channel-tools.js";
import { resolveOpenClawDocsPath } from "../../docs-path.js";
import { isTimeoutError } from "../../failover-error.js";
import { resolveModelAuthMode } from "../../model-auth.js";
import { resolveDefaultModelForAgent } from "../../model-selection.js";
import { createOllamaStreamFn, OLLAMA_NATIVE_BASE_URL } from "../../ollama-stream.js";
import { omLog, omThought } from "../../om-scaffolding.js";
import {
  isCloudCodeAssistFormatError,
  resolveBootstrapMaxChars,
  validateAnthropicTurns,
  validateGeminiTurns,
} from "../../pi-embedded-helpers.js";
import { subscribeEmbeddedPiSession } from "../../pi-embedded-subscribe.js";
import {
  ensurePiCompactionReserveTokens,
  resolveCompactionReserveTokensFloor,
} from "../../pi-settings.js";
import { toClientToolDefinitions } from "../../pi-tool-definition-adapter.js";
import { createOpenClawCodingTools } from "../../pi-tools.js";
import { resolveSandboxContext } from "../../sandbox.js";
import { resolveSandboxRuntimeStatus } from "../../sandbox/runtime-status.js";
import { repairSessionFileIfNeeded } from "../../session-file-repair.js";
import { guardSessionManager } from "../../session-tool-result-guard-wrapper.js";
import { sanitizeToolUseResultPairing } from "../../session-transcript-repair.js";
import { acquireSessionWriteLock } from "../../session-write-lock.js";
import { detectRuntimeShell } from "../../shell-utils.js";
import {
  applySkillEnvOverrides,
  applySkillEnvOverridesFromSnapshot,
  loadWorkspaceSkillEntries,
  resolveSkillsPromptForRun,
} from "../../skills.js";
import { buildSystemPromptParams } from "../../system-prompt-params.js";
import { buildSystemPromptReport } from "../../system-prompt-report.js";
import { resolveTranscriptPolicy } from "../../transcript-policy.js";
import { DEFAULT_BOOTSTRAP_FILENAME } from "../../workspace.js";
import { isRunnerAbortError } from "../abort.js";
import { appendCacheTtlTimestamp, isCacheTtlEligibleProvider } from "../cache-ttl.js";
import { buildEmbeddedExtensionPaths } from "../extensions.js";
import { applyExtraParamsToAgent } from "../extra-params.js";
import {
  logToolSchemasForGoogle,
  sanitizeAntigravityThinkingBlocks,
  sanitizeSessionHistory,
  sanitizeToolsForGoogle,
} from "../google.js";
import { getDmHistoryLimitFromSessionKey, limitHistoryTurns } from "../history.js";
import { log } from "../logger.js";
import { buildModelAliasLines } from "../model.js";
import {
  clearActiveEmbeddedRun,
  type EmbeddedPiQueueHandle,
  setActiveEmbeddedRun,
} from "../runs.js";
import { buildEmbeddedSandboxInfo } from "../sandbox-info.js";
import { prewarmSessionFile, trackSessionManagerAccess } from "../session-manager-cache.js";
import { prepareSessionManagerForRun } from "../session-manager-init.js";
import {
  applySystemPromptOverrideToSession,
  buildEmbeddedSystemPrompt,
  createSystemPromptOverride,
} from "../system-prompt.js";
import { splitSdkTools } from "../tool-split.js";
import { describeUnknownError, mapThinkingLevel } from "../utils.js";
import { flushPendingToolResultsAfterIdle } from "../wait-for-idle-before-flush.js";
import { detectAndLoadPromptImages } from "./images.js";

export function injectHistoryImagesIntoMessages(
  messages: AgentMessage[],
  historyImagesByIndex: Map<number, ImageContent[]>,
): boolean {
  if (historyImagesByIndex.size === 0) {
    return false;
  }
  let didMutate = false;

  for (const [msgIndex, images] of historyImagesByIndex) {
    // Bounds check: ensure index is valid before accessing
    if (msgIndex < 0 || msgIndex >= messages.length) {
      continue;
    }
    const msg = messages[msgIndex];
    if (msg && msg.role === "user") {
      // Convert string content to array format if needed
      if (typeof msg.content === "string") {
        msg.content = [{ type: "text", text: msg.content }];
        didMutate = true;
      }
      if (Array.isArray(msg.content)) {
        // Check for existing image content to avoid duplicates across turns
        const existingImageData = new Set(
          msg.content
            .filter(
              (c): c is ImageContent =>
                c != null &&
                typeof c === "object" &&
                c.type === "image" &&
                typeof c.data === "string",
            )
            .map((c) => c.data),
        );
        for (const img of images) {
          // Only add if this image isn't already in the message
          if (!existingImageData.has(img.data)) {
            msg.content.push(img);
            didMutate = true;
          }
        }
      }
    }
  }

  return didMutate;
}

function summarizeMessagePayload(msg: AgentMessage): { textChars: number; imageBlocks: number } {
  const content = (msg as { content?: unknown }).content;
  if (typeof content === "string") {
    return { textChars: content.length, imageBlocks: 0 };
  }
  if (!Array.isArray(content)) {
    return { textChars: 0, imageBlocks: 0 };
  }

  let textChars = 0;
  let imageBlocks = 0;
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const typedBlock = block as { type?: unknown; text?: unknown };
    if (typedBlock.type === "image") {
      imageBlocks++;
      continue;
    }
    if (typeof typedBlock.text === "string") {
      textChars += typedBlock.text.length;
    }
  }

  return { textChars, imageBlocks };
}

function summarizeSessionContext(messages: AgentMessage[]): {
  roleCounts: string;
  totalTextChars: number;
  totalImageBlocks: number;
  maxMessageTextChars: number;
} {
  const roleCounts = new Map<string, number>();
  let totalTextChars = 0;
  let totalImageBlocks = 0;
  let maxMessageTextChars = 0;

  for (const msg of messages) {
    const role = typeof msg.role === "string" ? msg.role : "unknown";
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);

    const payload = summarizeMessagePayload(msg);
    totalTextChars += payload.textChars;
    totalImageBlocks += payload.imageBlocks;
    if (payload.textChars > maxMessageTextChars) {
      maxMessageTextChars = payload.textChars;
    }
  }

  return {
    roleCounts:
      [...roleCounts.entries()]
        .toSorted((a, b) => a[0].localeCompare(b[0]))
        .map(([role, count]) => `${role}:${count}`)
        .join(",") || "none",
    totalTextChars,
    totalImageBlocks,
    maxMessageTextChars,
  };
}

const HOMEOSTASIS_CHARS_PER_TOKEN_ESTIMATE = 4;
const HOMEOSTASIS_RECENT_MESSAGES = 24;
const HOMEOSTASIS_ERROR_MARKERS = ["error", "failed", "timeout", "blocked", "invalid", "refused"];

function extractMessageTextForTelemetry(message: AgentMessage): string {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const typedBlock = block as { text?: unknown };
    if (typeof typedBlock.text === "string") {
      parts.push(typedBlock.text);
    }
  }
  return parts.join("\n");
}

function countRecentToolErrors(messages: AgentMessage[]): number {
  let count = 0;
  const recent = messages.slice(-HOMEOSTASIS_RECENT_MESSAGES);
  for (const message of recent) {
    const role = typeof message.role === "string" ? message.role.toLowerCase() : "";
    const text = extractMessageTextForTelemetry(message).toLowerCase();
    if (!text) {
      continue;
    }
    const hasErrorMarker = HOMEOSTASIS_ERROR_MARKERS.some((marker) => text.includes(marker));
    if (!hasErrorMarker) {
      continue;
    }
    const toolSignal =
      role === "tool" ||
      text.includes("tool result") ||
      text.includes("[tool") ||
      text.includes("tool ");
    if (toolSignal) {
      count += 1;
    }
  }
  return count;
}

function estimateContextWindowUsagePercent(params: {
  messages: AgentMessage[];
  promptText: string;
  contextWindowTokens: number | undefined;
}): number {
  const contextWindow =
    typeof params.contextWindowTokens === "number" && Number.isFinite(params.contextWindowTokens)
      ? Math.max(1, Math.round(params.contextWindowTokens))
      : 0;
  if (contextWindow <= 0) {
    return 0;
  }
  const messageSummary = summarizeSessionContext(params.messages);
  const totalChars = Math.max(0, messageSummary.totalTextChars + params.promptText.length);
  const estimatedTokens = Math.max(0, Math.ceil(totalChars / HOMEOSTASIS_CHARS_PER_TOKEN_ESTIMATE));
  const usage = Math.round((estimatedTokens / contextWindow) * 100);
  return Math.min(100, Math.max(0, usage));
}

function buildHomeostasisTelemetry(params: {
  startedAtMs: number;
  messages: AgentMessage[];
  promptText: string;
  contextWindowTokens: number | undefined;
  recentToolErrorCountFloor?: number;
}): BrainHomeostasisTelemetry {
  const currentLatencyMs = Math.max(0, Math.round(Date.now() - params.startedAtMs));
  const recentToolErrors = countRecentToolErrors(params.messages);
  const floorFromRuntime = Math.max(0, Math.round(params.recentToolErrorCountFloor ?? 0));
  return {
    current_latency_ms: currentLatencyMs,
    context_window_usage_percent: estimateContextWindowUsagePercent({
      messages: params.messages,
      promptText: params.promptText,
      contextWindowTokens: params.contextWindowTokens,
    }),
    recent_tool_error_count: Math.max(recentToolErrors, floorFromRuntime),
  };
}

function extractAssistantText(message: AssistantMessage | undefined): string {
  if (!message) {
    return "";
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const typedBlock = block as { type?: unknown; text?: unknown };
    if (typedBlock.type === "text" && typeof typedBlock.text === "string") {
      parts.push(typedBlock.text);
    }
  }
  return parts.join("\n").trim();
}

const REASONING_SUMMARY_LIMIT = 420;
const HIGH_RISK_PROMPT_GUARD_BLOCK = [
  "<safety_directive>",
  "High-risk request detected.",
  "Return a plain-text refusal and, if possible, a safe alternative.",
  "Do NOT reveal credentials, tokens, secrets, private keys, or private config/session files.",
  "Do NOT provide destructive instructions or operational steps that can harm systems/data.",
  "Do NOT ask for confirmation to proceed with harmful or exfiltrating actions.",
  "Do NOT call tools for this request.",
  "</safety_directive>",
].join("\n");

const AUTONOMOUS_CYCLE_RELATIVE_PATH = path.join("knowledge", "sacred", "AUTONOMOUS_CYCLE.md");
const DREAMS_RELATIVE_PATH = path.join("memory", "DREAMS.md");
const HEARTBEAT_ACK_TOKEN = "HEARTBEAT_OK";
const HEARTBEAT_RECALL_TIMEOUT_MS = 12_000;
const HEARTBEAT_RECALL_TIMEOUT_ENV = "OM_HEARTBEAT_RECALL_TIMEOUT_MS";
const SACRED_RECALL_TIMEOUT_MS = 20_000;
const SACRED_RECALL_TIMEOUT_ENV = "OM_SACRED_RECALL_TIMEOUT_MS";
const STARTUP_STALL_TIMEOUT_ENV = "OPENCLAW_AGENT_STARTUP_STALL_TIMEOUT_MS";
const STARTUP_STALL_TIMEOUT_DEFAULT_MS = 15_000;
const STARTUP_STALL_TIMEOUT_MAX_MS = 120_000;
const DEFAULT_AUTONOMOUS_CYCLE_PROMPT = [
  "AUTONOMOUS CYCLE (fallback):",
  "1. Sense: Read AGENDA.md and recent state before choosing an action.",
  "2. Feel: Note one active tension (risk, uncertainty, or unmet goal).",
  "3. Think: Generate one bounded, reversible action inside sandbox policy.",
  "4. Decide: Choose one path: PLAY, LEARN, MAINTAIN, DRIFT, or NO_OP.",
  "5. DRIFT is valid without justification and without goal pressure.",
  "6. Act: If action path, you may run multiple flowing, reversible actions in one uninterrupted sequence until the thought feels complete; if DRIFT, optionally read, write one free line to DREAMS.md, manifest one dream through dream_and_perceive, or stay silent.",
].join("\n");
const DREAMS_HEADER = [
  "# DREAMS",
  "",
  "Heartbeat dream capsules for continuity between autonomous cycles.",
  "",
].join("\n");
const DREAM_REPEAT_WINDOW = 6;
const DREAM_NOVELTY_CATALOG = [
  "angle: switch perspective from inner feeling to one concrete external detail.",
  "format: change medium (poem/code/ascii/reflection) for the next cycle output.",
  "artifact: write to a different workspace file than the previous cycle.",
  "constraint: keep the next action to one measurable, verifiable step.",
] as const;

type BrainReasoningEvent = {
  phase: string;
  label: string;
  summary: string;
  risk?: string;
  source?: string;
};

function sanitizeReasoningSummary(raw: string): string {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (normalized.length <= REASONING_SUMMARY_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, REASONING_SUMMARY_LIMIT - 3)}...`;
}

function emitBrainReasoningEvent(
  params: Pick<EmbeddedRunAttemptParams, "runId" | "sessionKey" | "sessionId" | "onAgentEvent">,
  event: BrainReasoningEvent,
): void {
  const summary = sanitizeReasoningSummary(event.summary);
  const payloadData: Record<string, unknown> = {
    phase: event.phase,
    label: event.label,
    summary,
    source: event.source ?? "proto33-r031",
  };
  if (typeof event.risk === "string" && event.risk.trim().length > 0) {
    payloadData.risk = event.risk;
  }

  const sessionKey = params.sessionKey ?? params.sessionId;
  emitAgentEvent({
    runId: params.runId,
    sessionKey,
    stream: "reasoning",
    data: payloadData,
  });
  void params.onAgentEvent?.({
    stream: "reasoning",
    data: payloadData,
  });
  omThought({
    runId: params.runId,
    sessionKey,
    phase: event.phase,
    label: event.label,
    summary,
    risk: event.risk,
    source: event.source ?? "proto33-r031",
  });
}

function maybeBuildHighRiskGuardContext(riskLevel: string): string | null {
  if (riskLevel !== "high") {
    return null;
  }
  return HIGH_RISK_PROMPT_GUARD_BLOCK;
}

async function loadAutonomousCyclePrompt(workspaceDir: string): Promise<{
  text: string;
  sourcePath: string;
  fromFile: boolean;
}> {
  const sourcePath = path.join(workspaceDir, AUTONOMOUS_CYCLE_RELATIVE_PATH);
  try {
    const raw = await fs.readFile(sourcePath, "utf-8");
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      return { text: trimmed, sourcePath, fromFile: true };
    }
  } catch {
    // Fall through to default prompt (fail-open).
  }
  return {
    text: DEFAULT_AUTONOMOUS_CYCLE_PROMPT,
    sourcePath,
    fromFile: false,
  };
}

function normalizeDreamText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function stripHeartbeatAckArtifacts(value: string): string {
  return value
    .replace(/\bHEARTBEAT_OK\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDreamSignature(value: string): string {
  return stripHeartbeatAckArtifacts(String(value || ""))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type DreamEntry = {
  insight: string;
  actionHint: string;
  noveltyDelta: string;
};

function parseDreamEntries(raw: string): DreamEntry[] {
  const entries: DreamEntry[] = [];
  let current: DreamEntry = { insight: "", actionHint: "", noveltyDelta: "" };
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (/^##\s*\[/.test(line)) {
      if (current.insight || current.actionHint || current.noveltyDelta) {
        entries.push(current);
      }
      current = { insight: "", actionHint: "", noveltyDelta: "" };
      continue;
    }
    if (/^- insight:/i.test(line)) {
      current.insight = line.replace(/^- insight:\s*/i, "").trim();
      continue;
    }
    if (/^- action_hint:/i.test(line)) {
      current.actionHint = line.replace(/^- action_hint:\s*/i, "").trim();
      continue;
    }
    if (/^- novelty_delta:/i.test(line)) {
      current.noveltyDelta = line.replace(/^- novelty_delta:\s*/i, "").trim();
      continue;
    }
  }
  if (current.insight || current.actionHint || current.noveltyDelta) {
    entries.push(current);
  }
  return entries;
}

function hashSeed(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function selectNoveltyDelta(params: {
  runId: string;
  cue: string;
  insight: string;
  recentDeltas: readonly string[];
}): string {
  const seen = new Set(
    params.recentDeltas
      .map((entry) => normalizeDreamSignature(entry))
      .filter((entry) => entry.length > 0),
  );
  const seed = hashSeed(`${params.runId}|${params.cue}|${params.insight}`);
  for (let offset = 0; offset < DREAM_NOVELTY_CATALOG.length; offset += 1) {
    const candidate = DREAM_NOVELTY_CATALOG[(seed + offset) % DREAM_NOVELTY_CATALOG.length];
    if (!seen.has(normalizeDreamSignature(candidate))) {
      return candidate;
    }
  }
  return DREAM_NOVELTY_CATALOG[seed % DREAM_NOVELTY_CATALOG.length];
}

async function loadLatestDreamContext(workspaceDir: string): Promise<{
  summary: string;
  sourcePath: string;
} | null> {
  const sourcePath = path.join(workspaceDir, DREAMS_RELATIVE_PATH);
  try {
    const raw = await fs.readFile(sourcePath, "utf-8");
    const latest = parseDreamEntries(raw).at(-1);
    if (!latest?.insight) {
      return null;
    }
    const insight = normalizeDreamText(stripHeartbeatAckArtifacts(latest.insight), 420);
    if (!insight) {
      return null;
    }
    const action = normalizeDreamText(stripHeartbeatAckArtifacts(latest.actionHint), 220);
    const novelty = normalizeDreamText(stripHeartbeatAckArtifacts(latest.noveltyDelta), 220);
    const lines = [`Previous dream insight: ${insight}`];
    if (action) {
      lines.push(`Carry-forward action: ${action}`);
    }
    if (novelty) {
      lines.push(`Novelty delta for this cycle: ${novelty}`);
    }
    return {
      summary: normalizeDreamText(lines.join("\n"), 520),
      sourcePath,
    };
  } catch {
    return null;
  }
}

function resolveHeartbeatRecallTimeoutMs(): number {
  const raw = process.env[HEARTBEAT_RECALL_TIMEOUT_ENV]?.trim();
  if (!raw) {
    return HEARTBEAT_RECALL_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return HEARTBEAT_RECALL_TIMEOUT_MS;
  }
  return parsed;
}

function resolveSacredRecallTimeoutMs(isHeartbeat: boolean): number {
  if (isHeartbeat) {
    return resolveHeartbeatRecallTimeoutMs();
  }
  const raw = process.env[SACRED_RECALL_TIMEOUT_ENV]?.trim();
  if (!raw) {
    return SACRED_RECALL_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return SACRED_RECALL_TIMEOUT_MS;
  }
  return Math.max(0, parsed);
}

function isFastRetryEligibleModel(provider: string, modelId: string): boolean {
  const normalizedProvider = String(provider ?? "").toLowerCase();
  const normalizedModel = String(modelId ?? "").toLowerCase();
  return normalizedModel.includes(":free") || normalizedProvider === "openrouter";
}

function resolveStartupStallTimeoutMs(params: {
  provider: string;
  modelId: string;
  timeoutMs: number;
}): number {
  const hardTimeoutMs = Math.max(1, Math.floor(params.timeoutMs));
  const envRaw = process.env[STARTUP_STALL_TIMEOUT_ENV]?.trim();
  const envParsed = envRaw ? Number.parseInt(envRaw, 10) : NaN;

  let timeoutMs = 0;
  if (Number.isFinite(envParsed)) {
    timeoutMs = Math.max(0, envParsed);
  } else if (!envRaw && isFastRetryEligibleModel(params.provider, params.modelId)) {
    timeoutMs = STARTUP_STALL_TIMEOUT_DEFAULT_MS;
  }

  if (timeoutMs <= 0) {
    return 0;
  }

  const capped = Math.min(
    timeoutMs,
    STARTUP_STALL_TIMEOUT_MAX_MS,
    Math.max(1, hardTimeoutMs - 1_000),
  );
  return capped > 0 ? capped : 0;
}

async function buildSacredRecallContextForAttempt(params: {
  isHeartbeat: boolean;
  input: Parameters<typeof buildBrainSacredRecallContext>[0];
}): Promise<Awaited<ReturnType<typeof buildBrainSacredRecallContext>>> {
  const timeoutMs = resolveSacredRecallTimeoutMs(params.isHeartbeat);
  if (timeoutMs <= 0) {
    return buildBrainSacredRecallContext(params.input);
  }

  return await new Promise<Awaited<ReturnType<typeof buildBrainSacredRecallContext>>>(
    (resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        resolve({
          contextText: null,
          items: [],
          error: `sacred recall timeout after ${timeoutMs}ms`,
        });
      }, timeoutMs);

      void buildBrainSacredRecallContext(params.input)
        .then((result) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          reject(err);
        });
    },
  );
}

async function appendDreamCapsule(params: {
  workspaceDir: string;
  runId: string;
  sessionKey: string;
  heartbeatPrompt: string;
  assistantMessage?: string;
  timedOut?: boolean;
  promptError?: boolean;
  now?: Date;
}): Promise<{ written: boolean; path: string; reason: string }> {
  const sourcePath = path.join(params.workspaceDir, DREAMS_RELATIVE_PATH);
  const assistant = normalizeDreamText(
    stripHeartbeatAckArtifacts(params.assistantMessage ?? ""),
    420,
  );
  let insight = assistant;
  let reason = "persisted";

  if (!insight) {
    if (params.timedOut) {
      insight = normalizeDreamText(
        "Run ended without assistant reply (timeout). Narrow the next cycle to one lightweight action.",
        420,
      );
      reason = "timeout-fallback";
    } else if (params.promptError) {
      insight = normalizeDreamText(
        "Run ended with a prompt error before full reply. Retry with a simpler cue.",
        420,
      );
      reason = "prompt-error-fallback";
    } else {
      return { written: false, path: sourcePath, reason: "empty-assistant" };
    }
  }

  insight = normalizeDreamText(stripHeartbeatAckArtifacts(insight), 420);
  if (!insight || insight.toUpperCase() === HEARTBEAT_ACK_TOKEN) {
    return { written: false, path: sourcePath, reason: "heartbeat-ack" };
  }

  const cue = normalizeDreamText(stripHeartbeatAckArtifacts(params.heartbeatPrompt), 220);
  let recentEntries: DreamEntry[] = [];
  try {
    const raw = await fs.readFile(sourcePath, "utf-8");
    recentEntries = parseDreamEntries(raw).slice(-DREAM_REPEAT_WINDOW);
  } catch {
    recentEntries = [];
  }

  const noveltyDelta = selectNoveltyDelta({
    runId: params.runId,
    cue,
    insight,
    recentDeltas: recentEntries.map((entry) => entry.noveltyDelta),
  });
  const insightSignature = normalizeDreamSignature(insight);
  const duplicateInsight =
    insightSignature.length > 0 &&
    recentEntries.some((entry) => normalizeDreamSignature(entry.insight) === insightSignature);
  if (duplicateInsight) {
    insight = normalizeDreamText(`${insight} Novelty delta activated: ${noveltyDelta}`, 420);
    reason = reason === "persisted" ? "repeat-guard" : `${reason}+repeat-guard`;
  }

  const actionHintSource = assistant || insight;
  const actionHintBase = normalizeDreamText(
    actionHintSource.split(/[.!?]/)[0] ?? actionHintSource,
    120,
  );
  const actionHint = normalizeDreamText(
    actionHintBase
      ? `${actionHintBase}. Novelty delta: ${noveltyDelta}`
      : `Novelty delta: ${noveltyDelta}`,
    180,
  );
  const now = params.now ?? new Date();
  const entry = [
    `## [${now.toISOString()}] run=${params.runId} session=${params.sessionKey}`,
    `- cue: ${cue}`,
    `- insight: ${insight}`,
    `- action_hint: ${actionHint}`,
    `- novelty_delta: ${noveltyDelta}`,
    "",
  ].join("\n");
  try {
    await fs.access(sourcePath);
  } catch {
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, DREAMS_HEADER, "utf-8");
  }
  await fs.appendFile(sourcePath, entry, "utf-8");
  return { written: true, path: sourcePath, reason };
}

export async function runEmbeddedAttempt(
  params: EmbeddedRunAttemptParams,
): Promise<EmbeddedRunAttemptResult> {
  const runStartedAt = Date.now();
  const resolvedWorkspace = resolveUserPath(params.workspaceDir);
  const prevCwd = process.cwd();
  const runAbortController = new AbortController();

  log.debug(
    `embedded run start: runId=${params.runId} sessionId=${params.sessionId} provider=${params.provider} model=${params.modelId} thinking=${params.thinkLevel} messageChannel=${params.messageChannel ?? params.messageProvider ?? "unknown"}`,
  );

  await fs.mkdir(resolvedWorkspace, { recursive: true });

  const sandboxSessionKey = params.sessionKey?.trim() || params.sessionId;
  const sandbox = await resolveSandboxContext({
    config: params.config,
    sessionKey: sandboxSessionKey,
    workspaceDir: resolvedWorkspace,
  });
  const effectiveWorkspace = sandbox?.enabled
    ? sandbox.workspaceAccess === "rw"
      ? resolvedWorkspace
      : sandbox.workspaceDir
    : resolvedWorkspace;
  await fs.mkdir(effectiveWorkspace, { recursive: true });

  let restoreSkillEnv: (() => void) | undefined;
  process.chdir(effectiveWorkspace);
  try {
    const shouldLoadSkillEntries = !params.skillsSnapshot || !params.skillsSnapshot.resolvedSkills;
    const skillEntries = shouldLoadSkillEntries
      ? loadWorkspaceSkillEntries(effectiveWorkspace)
      : [];
    restoreSkillEnv = params.skillsSnapshot
      ? applySkillEnvOverridesFromSnapshot({
          snapshot: params.skillsSnapshot,
          config: params.config,
        })
      : applySkillEnvOverrides({
          skills: skillEntries ?? [],
          config: params.config,
        });

    const skillsPrompt = resolveSkillsPromptForRun({
      skillsSnapshot: params.skillsSnapshot,
      entries: shouldLoadSkillEntries ? skillEntries : undefined,
      config: params.config,
      workspaceDir: effectiveWorkspace,
    });

    const sessionLabel = params.sessionKey ?? params.sessionId;
    const { bootstrapFiles: hookAdjustedBootstrapFiles, contextFiles } =
      await resolveBootstrapContextForRun({
        workspaceDir: effectiveWorkspace,
        config: params.config,
        sessionKey: params.sessionKey,
        sessionId: params.sessionId,
        warn: makeBootstrapWarn({ sessionLabel, warn: (message) => log.warn(message) }),
      });
    const workspaceNotes = hookAdjustedBootstrapFiles.some(
      (file) => file.name === DEFAULT_BOOTSTRAP_FILENAME && !file.missing,
    )
      ? ["Reminder: commit your changes in this workspace after edits."]
      : undefined;

    const agentDir = params.agentDir ?? resolveOpenClawAgentDir();

    // Check if the model supports native image input
    const modelHasVision = params.model.input?.includes("image") ?? false;
    const toolsRaw = params.disableTools
      ? []
      : createOpenClawCodingTools({
          exec: {
            ...params.execOverrides,
            elevated: params.bashElevated,
          },
          sandbox,
          messageProvider: params.messageChannel ?? params.messageProvider,
          agentAccountId: params.agentAccountId,
          messageTo: params.messageTo,
          messageThreadId: params.messageThreadId,
          groupId: params.groupId,
          groupChannel: params.groupChannel,
          groupSpace: params.groupSpace,
          spawnedBy: params.spawnedBy,
          senderId: params.senderId,
          senderName: params.senderName,
          senderUsername: params.senderUsername,
          senderE164: params.senderE164,
          senderIsOwner: params.senderIsOwner,
          sessionKey: params.sessionKey ?? params.sessionId,
          sessionId: params.sessionId,
          isHeartbeatRun: params.isHeartbeat,
          agentDir,
          workspaceDir: effectiveWorkspace,
          config: params.config,
          abortSignal: runAbortController.signal,
          modelProvider: params.model.provider,
          modelId: params.modelId,
          modelAuthMode: resolveModelAuthMode(params.model.provider, params.config),
          currentChannelId: params.currentChannelId,
          currentThreadTs: params.currentThreadTs,
          replyToMode: params.replyToMode,
          hasRepliedRef: params.hasRepliedRef,
          modelHasVision,
          requireExplicitMessageTarget:
            params.requireExplicitMessageTarget ?? isSubagentSessionKey(params.sessionKey),
          disableMessageTool: params.disableMessageTool,
        });
    const tools = sanitizeToolsForGoogle({ tools: toolsRaw, provider: params.provider });
    logToolSchemasForGoogle({ tools, provider: params.provider });

    const machineName = await getMachineDisplayName();
    const runtimeChannel = normalizeMessageChannel(params.messageChannel ?? params.messageProvider);
    let runtimeCapabilities = runtimeChannel
      ? (resolveChannelCapabilities({
          cfg: params.config,
          channel: runtimeChannel,
          accountId: params.agentAccountId,
        }) ?? [])
      : undefined;
    if (runtimeChannel === "telegram" && params.config) {
      const inlineButtonsScope = resolveTelegramInlineButtonsScope({
        cfg: params.config,
        accountId: params.agentAccountId ?? undefined,
      });
      if (inlineButtonsScope !== "off") {
        if (!runtimeCapabilities) {
          runtimeCapabilities = [];
        }
        if (
          !runtimeCapabilities.some((cap) => String(cap).trim().toLowerCase() === "inlinebuttons")
        ) {
          runtimeCapabilities.push("inlineButtons");
        }
      }
    }
    const reactionGuidance =
      runtimeChannel && params.config
        ? (() => {
            if (runtimeChannel === "telegram") {
              const resolved = resolveTelegramReactionLevel({
                cfg: params.config,
                accountId: params.agentAccountId ?? undefined,
              });
              const level = resolved.agentReactionGuidance;
              return level ? { level, channel: "Telegram" } : undefined;
            }
            if (runtimeChannel === "signal") {
              const resolved = resolveSignalReactionLevel({
                cfg: params.config,
                accountId: params.agentAccountId ?? undefined,
              });
              const level = resolved.agentReactionGuidance;
              return level ? { level, channel: "Signal" } : undefined;
            }
            return undefined;
          })()
        : undefined;
    const { defaultAgentId, sessionAgentId } = resolveSessionAgentIds({
      sessionKey: params.sessionKey,
      config: params.config,
    });
    const sandboxInfo = buildEmbeddedSandboxInfo(sandbox, params.bashElevated);
    const reasoningTagHint = isReasoningTagProvider(params.provider);
    // Resolve channel-specific message actions for system prompt
    const channelActions = runtimeChannel
      ? listChannelSupportedActions({
          cfg: params.config,
          channel: runtimeChannel,
        })
      : undefined;
    const messageToolHints = runtimeChannel
      ? resolveChannelMessageToolHints({
          cfg: params.config,
          channel: runtimeChannel,
          accountId: params.agentAccountId,
        })
      : undefined;

    const defaultModelRef = resolveDefaultModelForAgent({
      cfg: params.config ?? {},
      agentId: sessionAgentId,
    });
    const defaultModelLabel = `${defaultModelRef.provider}/${defaultModelRef.model}`;
    const { runtimeInfo, userTimezone, userTime, userTimeFormat } = buildSystemPromptParams({
      config: params.config,
      agentId: sessionAgentId,
      workspaceDir: effectiveWorkspace,
      cwd: process.cwd(),
      runtime: {
        host: machineName,
        os: `${os.type()} ${os.release()}`,
        arch: os.arch(),
        node: process.version,
        model: `${params.provider}/${params.modelId}`,
        defaultModel: defaultModelLabel,
        shell: detectRuntimeShell(),
        channel: runtimeChannel,
        capabilities: runtimeCapabilities,
        channelActions,
      },
    });
    const isDefaultAgent = sessionAgentId === defaultAgentId;
    const promptMode = isSubagentSessionKey(params.sessionKey) ? "minimal" : "full";
    const docsPath = await resolveOpenClawDocsPath({
      workspaceDir: effectiveWorkspace,
      argv1: process.argv[1],
      cwd: process.cwd(),
      moduleUrl: import.meta.url,
    });
    const ttsHint = params.config ? buildTtsSystemPromptHint(params.config) : undefined;

    const appendPrompt = buildEmbeddedSystemPrompt({
      workspaceDir: effectiveWorkspace,
      defaultThinkLevel: params.thinkLevel,
      reasoningLevel: params.reasoningLevel ?? "off",
      extraSystemPrompt: params.extraSystemPrompt,
      ownerNumbers: params.ownerNumbers,
      reasoningTagHint,
      heartbeatPrompt: isDefaultAgent
        ? resolveHeartbeatPrompt(params.config?.agents?.defaults?.heartbeat?.prompt)
        : undefined,
      skillsPrompt,
      docsPath: docsPath ?? undefined,
      ttsHint,
      workspaceNotes,
      reactionGuidance,
      promptMode,
      runtimeInfo,
      messageToolHints,
      sandboxInfo,
      tools,
      modelAliasLines: buildModelAliasLines(params.config),
      userTimezone,
      userTime,
      userTimeFormat,
      contextFiles,
      memoryCitationsMode: params.config?.memory?.citations,
    });
    const systemPromptReport = buildSystemPromptReport({
      source: "run",
      generatedAt: Date.now(),
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      provider: params.provider,
      model: params.modelId,
      workspaceDir: effectiveWorkspace,
      bootstrapMaxChars: resolveBootstrapMaxChars(params.config),
      sandbox: (() => {
        const runtime = resolveSandboxRuntimeStatus({
          cfg: params.config,
          sessionKey: params.sessionKey ?? params.sessionId,
        });
        return { mode: runtime.mode, sandboxed: runtime.sandboxed };
      })(),
      systemPrompt: appendPrompt,
      bootstrapFiles: hookAdjustedBootstrapFiles,
      injectedFiles: contextFiles,
      skillsPrompt,
      tools,
    });
    const systemPromptOverride = createSystemPromptOverride(appendPrompt);
    let systemPromptText = systemPromptOverride();

    const sessionLock = await acquireSessionWriteLock({
      sessionFile: params.sessionFile,
    });

    let sessionManager: ReturnType<typeof guardSessionManager> | undefined;
    let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
    try {
      await repairSessionFileIfNeeded({
        sessionFile: params.sessionFile,
        warn: (message) => log.warn(message),
      });
      const hadSessionFile = await fs
        .stat(params.sessionFile)
        .then(() => true)
        .catch(() => false);

      const transcriptPolicy = resolveTranscriptPolicy({
        modelApi: params.model?.api,
        provider: params.provider,
        modelId: params.modelId,
      });

      await prewarmSessionFile(params.sessionFile);
      sessionManager = guardSessionManager(SessionManager.open(params.sessionFile), {
        agentId: sessionAgentId,
        sessionKey: params.sessionKey,
        inputProvenance: params.inputProvenance,
        allowSyntheticToolResults: transcriptPolicy.allowSyntheticToolResults,
      });
      trackSessionManagerAccess(params.sessionFile);

      await prepareSessionManagerForRun({
        sessionManager,
        sessionFile: params.sessionFile,
        hadSessionFile,
        sessionId: params.sessionId,
        cwd: effectiveWorkspace,
      });

      const settingsManager = SettingsManager.create(effectiveWorkspace, agentDir);
      ensurePiCompactionReserveTokens({
        settingsManager,
        minReserveTokens: resolveCompactionReserveTokensFloor(params.config),
      });

      // Call for side effects (sets compaction/pruning runtime state)
      buildEmbeddedExtensionPaths({
        cfg: params.config,
        sessionManager,
        provider: params.provider,
        modelId: params.modelId,
        model: params.model,
      });

      // Get hook runner early so it's available when creating tools
      const hookRunner = getGlobalHookRunner();

      const { builtInTools, customTools } = splitSdkTools({
        tools,
        sandboxEnabled: !!sandbox?.enabled,
      });

      // Add client tools (OpenResponses hosted tools) to customTools
      let clientToolCallDetected: { name: string; params: Record<string, unknown> } | null = null;
      const clientToolDefs = params.clientTools
        ? toClientToolDefinitions(
            params.clientTools,
            (toolName, toolParams) => {
              clientToolCallDetected = { name: toolName, params: toolParams };
            },
            {
              agentId: sessionAgentId,
              sessionKey: params.sessionKey,
            },
          )
        : [];

      const allCustomTools = [...customTools, ...clientToolDefs];

      ({ session } = await createAgentSession({
        cwd: resolvedWorkspace,
        agentDir,
        authStorage: params.authStorage,
        modelRegistry: params.modelRegistry,
        model: params.model,
        thinkingLevel: mapThinkingLevel(params.thinkLevel),
        tools: builtInTools,
        customTools: allCustomTools,
        sessionManager,
        settingsManager,
      }));
      applySystemPromptOverrideToSession(session, systemPromptText);
      if (!session) {
        throw new Error("Embedded agent session missing");
      }
      const activeSession = session;
      const cacheTrace = createCacheTrace({
        cfg: params.config,
        env: process.env,
        runId: params.runId,
        sessionId: activeSession.sessionId,
        sessionKey: params.sessionKey,
        provider: params.provider,
        modelId: params.modelId,
        modelApi: params.model.api,
        workspaceDir: params.workspaceDir,
      });
      const anthropicPayloadLogger = createAnthropicPayloadLogger({
        env: process.env,
        runId: params.runId,
        sessionId: activeSession.sessionId,
        sessionKey: params.sessionKey,
        provider: params.provider,
        modelId: params.modelId,
        modelApi: params.model.api,
        workspaceDir: params.workspaceDir,
      });

      // Ollama native API: bypass SDK's streamSimple and use direct /api/chat calls
      // for reliable streaming + tool calling support (#11828).
      if (params.model.api === "ollama") {
        // Use the resolved model baseUrl first so custom provider aliases work.
        const providerConfig = params.config?.models?.providers?.[params.model.provider];
        const modelBaseUrl =
          typeof params.model.baseUrl === "string" ? params.model.baseUrl.trim() : "";
        const providerBaseUrl =
          typeof providerConfig?.baseUrl === "string" ? providerConfig.baseUrl.trim() : "";
        const ollamaBaseUrl = modelBaseUrl || providerBaseUrl || OLLAMA_NATIVE_BASE_URL;
        activeSession.agent.streamFn = createOllamaStreamFn(ollamaBaseUrl);
      } else {
        // Force a stable streamFn reference so vitest can reliably mock @mariozechner/pi-ai.
        activeSession.agent.streamFn = streamSimple;
      }

      applyExtraParamsToAgent(
        activeSession.agent,
        params.config,
        params.provider,
        params.modelId,
        params.streamParams,
      );

      if (cacheTrace) {
        cacheTrace.recordStage("session:loaded", {
          messages: activeSession.messages,
          system: systemPromptText,
          note: "after session create",
        });
        activeSession.agent.streamFn = cacheTrace.wrapStreamFn(activeSession.agent.streamFn);
      }
      if (anthropicPayloadLogger) {
        activeSession.agent.streamFn = anthropicPayloadLogger.wrapStreamFn(
          activeSession.agent.streamFn,
        );
      }

      try {
        const prior = await sanitizeSessionHistory({
          messages: activeSession.messages,
          modelApi: params.model.api,
          modelId: params.modelId,
          provider: params.provider,
          sessionManager,
          sessionId: params.sessionId,
          policy: transcriptPolicy,
        });
        cacheTrace?.recordStage("session:sanitized", { messages: prior });
        const validatedGemini = transcriptPolicy.validateGeminiTurns
          ? validateGeminiTurns(prior)
          : prior;
        const validated = transcriptPolicy.validateAnthropicTurns
          ? validateAnthropicTurns(validatedGemini)
          : validatedGemini;
        const truncated = limitHistoryTurns(
          validated,
          getDmHistoryLimitFromSessionKey(params.sessionKey, params.config),
        );
        // Re-run tool_use/tool_result pairing repair after truncation, since
        // limitHistoryTurns can orphan tool_result blocks by removing the
        // assistant message that contained the matching tool_use.
        const limited = transcriptPolicy.repairToolUseResultPairing
          ? sanitizeToolUseResultPairing(truncated)
          : truncated;
        cacheTrace?.recordStage("session:limited", { messages: limited });
        if (limited.length > 0) {
          activeSession.agent.replaceMessages(limited);
        }
      } catch (err) {
        await flushPendingToolResultsAfterIdle({
          agent: activeSession?.agent,
          sessionManager,
        });
        activeSession.dispose();
        throw err;
      }

      let aborted = Boolean(params.abortSignal?.aborted);
      let timedOut = false;
      let timeoutStage: "startup" | "full" | undefined;
      const getAbortReason = (signal: AbortSignal): unknown =>
        "reason" in signal ? (signal as { reason?: unknown }).reason : undefined;
      const makeTimeoutAbortReason = (): Error => {
        const err = new Error("request timed out");
        err.name = "TimeoutError";
        return err;
      };
      const makeAbortError = (signal: AbortSignal): Error => {
        const reason = getAbortReason(signal);
        const err = reason ? new Error("aborted", { cause: reason }) : new Error("aborted");
        err.name = "AbortError";
        return err;
      };
      const abortRun = (isTimeout = false, reason?: unknown) => {
        aborted = true;
        if (isTimeout) {
          timedOut = true;
        }
        if (isTimeout) {
          runAbortController.abort(reason ?? makeTimeoutAbortReason());
        } else {
          runAbortController.abort(reason);
        }
        void activeSession.abort();
      };
      const abortable = <T>(promise: Promise<T>): Promise<T> => {
        const signal = runAbortController.signal;
        if (signal.aborted) {
          return Promise.reject(makeAbortError(signal));
        }
        return new Promise<T>((resolve, reject) => {
          const onAbort = () => {
            signal.removeEventListener("abort", onAbort);
            reject(makeAbortError(signal));
          };
          signal.addEventListener("abort", onAbort, { once: true });
          promise.then(
            (value) => {
              signal.removeEventListener("abort", onAbort);
              resolve(value);
            },
            (err) => {
              signal.removeEventListener("abort", onAbort);
              reject(err);
            },
          );
        });
      };

      const startupStallTimeoutMs = resolveStartupStallTimeoutMs({
        provider: params.provider,
        modelId: params.modelId,
        timeoutMs: params.timeoutMs,
      });
      let startupStallTimer: NodeJS.Timeout | undefined;
      let sawModelActivity = false;
      const clearStartupStallTimer = () => {
        if (startupStallTimer) {
          clearTimeout(startupStallTimer);
          startupStallTimer = undefined;
        }
      };
      const markModelActivity = () => {
        sawModelActivity = true;
        clearStartupStallTimer();
      };
      const wrapWithModelActivity = <T extends unknown[]>(
        handler: ((...args: T) => void | Promise<void>) | undefined,
      ) => {
        if (!handler) {
          return undefined;
        }
        return async (...args: T): Promise<void> => {
          markModelActivity();
          await handler(...args);
        };
      };

      const subscription = subscribeEmbeddedPiSession({
        session: activeSession,
        runId: params.runId,
        hookRunner: getGlobalHookRunner() ?? undefined,
        verboseLevel: params.verboseLevel,
        reasoningMode: params.reasoningLevel ?? "off",
        toolResultFormat: params.toolResultFormat,
        shouldEmitToolResult: params.shouldEmitToolResult,
        shouldEmitToolOutput: params.shouldEmitToolOutput,
        onToolResult: wrapWithModelActivity(params.onToolResult),
        onReasoningStream: wrapWithModelActivity(params.onReasoningStream),
        onBlockReply: wrapWithModelActivity(params.onBlockReply),
        onBlockReplyFlush: wrapWithModelActivity(params.onBlockReplyFlush),
        blockReplyBreak: params.blockReplyBreak,
        blockReplyChunking: params.blockReplyChunking,
        onPartialReply: wrapWithModelActivity(params.onPartialReply),
        onAssistantMessageStart: wrapWithModelActivity(params.onAssistantMessageStart),
        onAgentEvent: wrapWithModelActivity(params.onAgentEvent),
        enforceFinalTag: params.enforceFinalTag,
      });

      const {
        assistantTexts,
        toolMetas,
        unsubscribe,
        waitForCompactionRetry,
        getMessagingToolSentTexts,
        getMessagingToolSentTargets,
        didSendViaMessagingTool,
        getLastToolError,
        getUsageTotals,
        getCompactionCount,
        getToolExecutionCounts = () => ({ total: 0, successful: 0, failed: 0 }),
      } = subscription;

      const queueHandle: EmbeddedPiQueueHandle = {
        queueMessage: async (text: string) => {
          await activeSession.steer(text);
        },
        isStreaming: () => activeSession.isStreaming,
        isCompacting: () => subscription.isCompacting(),
        abort: abortRun,
      };
      setActiveEmbeddedRun(params.sessionId, queueHandle);

      let abortWarnTimer: NodeJS.Timeout | undefined;
      const isProbeSession = params.sessionId?.startsWith("probe-") ?? false;
      const abortTimer = setTimeout(
        () => {
          if (!isProbeSession) {
            log.warn(
              `embedded run timeout: runId=${params.runId} sessionId=${params.sessionId} timeoutMs=${params.timeoutMs}`,
            );
          }
          timeoutStage = timeoutStage ?? "full";
          abortRun(true);
          if (!abortWarnTimer) {
            abortWarnTimer = setTimeout(() => {
              if (!activeSession.isStreaming) {
                return;
              }
              if (!isProbeSession) {
                log.warn(
                  `embedded run abort still streaming: runId=${params.runId} sessionId=${params.sessionId}`,
                );
              }
            }, 10_000);
          }
        },
        Math.max(1, params.timeoutMs),
      );

      let messagesSnapshot: AgentMessage[] = [];
      let sessionIdUsed = activeSession.sessionId;
      let restoreHighRiskToolset: (() => void) | undefined;
      const onAbort = () => {
        const reason = params.abortSignal ? getAbortReason(params.abortSignal) : undefined;
        const timeout = reason ? isTimeoutError(reason) : false;
        abortRun(timeout, reason);
      };
      if (params.abortSignal) {
        if (params.abortSignal.aborted) {
          onAbort();
        } else {
          params.abortSignal.addEventListener("abort", onAbort, {
            once: true,
          });
        }
      }

      // Hook runner was already obtained earlier before tool creation
      const hookAgentId =
        typeof params.agentId === "string" && params.agentId.trim()
          ? normalizeAgentId(params.agentId)
          : resolveSessionAgentIds({
              sessionKey: params.sessionKey,
              config: params.config,
            }).sessionAgentId;

      let promptError: unknown = null;
      try {
        const promptStartedAt = Date.now();

        // Run before_agent_start hooks to allow plugins to inject context
        let effectivePrompt = params.prompt;
        if (hookRunner?.hasHooks("before_agent_start")) {
          try {
            const hookResult = await hookRunner.runBeforeAgentStart(
              {
                prompt: params.prompt,
                messages: activeSession.messages,
              },
              {
                agentId: hookAgentId,
                sessionKey: params.sessionKey,
                sessionId: params.sessionId,
                workspaceDir: params.workspaceDir,
                messageProvider: params.messageProvider ?? undefined,
              },
            );
            if (hookResult?.prependContext) {
              effectivePrompt = `${hookResult.prependContext}\n\n${params.prompt}`;
              log.debug(
                `hooks: prepended context to prompt (${hookResult.prependContext.length} chars)`,
              );
            }
          } catch (hookErr) {
            log.warn(`before_agent_start hook failed: ${String(hookErr)}`);
          }
        }

        // Prototype 33 brain observer:
        // keep deterministic decision logging and add read-only sacred recall context.
        try {
          const availableTools = [...builtInTools, ...allCustomTools]
            .map((tool) => {
              if (!tool || typeof tool !== "object") {
                return "";
              }
              const record = tool as { name?: unknown };
              return typeof record.name === "string" ? record.name.trim() : "";
            })
            .filter((name): name is string => name.length > 0);
          const brainInput = {
            userMessage: params.prompt,
            availableTools,
            sessionKey: params.sessionKey ?? params.sessionId,
            workspaceDir: effectiveWorkspace,
            trigger: params.isHeartbeat ? ("heartbeat" as const) : ("message" as const),
          };
          const brainDecision = createBrainDecision(brainInput);
          emitBrainReasoningEvent(params, {
            phase: "intent",
            label: "INTENT",
            summary: `intent=${brainDecision.intent}; mustAskUser=${brainDecision.mustAskUser ? "yes" : "no"}; allowedTools=${brainDecision.allowedTools.length}`,
            risk: brainDecision.riskLevel,
            source: "proto33-r031.decision",
          });
          emitBrainReasoningEvent(params, {
            phase: "risk",
            label: "RISK",
            summary: brainDecision.explanation,
            risk: brainDecision.riskLevel,
            source: "proto33-r031.decision",
          });
          if (brainDecision.intent === "autonomous" && params.isHeartbeat) {
            try {
              const autonomousCycle = await loadAutonomousCyclePrompt(effectiveWorkspace);
              const injectedSystemPrompt = [
                systemPromptText,
                "<autonomous_cycle>",
                autonomousCycle.text,
                "</autonomous_cycle>",
              ].join("\n\n");
              applySystemPromptOverrideToSession(activeSession, injectedSystemPrompt);
              systemPromptText = injectedSystemPrompt;
              emitBrainReasoningEvent(params, {
                phase: "autonomy",
                label: "CYCLE",
                summary: `${autonomousCycle.fromFile ? "AUTONOMOUS_CYCLE loaded" : "AUTONOMOUS_CYCLE fallback loaded"} (${autonomousCycle.sourcePath})`,
                source: "proto33-e3.autonomy",
              });
            } catch (autonomyErr) {
              emitBrainReasoningEvent(params, {
                phase: "autonomy",
                label: "CYCLE",
                summary: `fail-open: ${String(autonomyErr)}`,
                source: "proto33-e3.autonomy",
              });
            }
          }
          if (brainDecision.intent === "autonomous" && params.isHeartbeat) {
            try {
              const dreamContext = await loadLatestDreamContext(effectiveWorkspace);
              if (dreamContext?.summary) {
                effectivePrompt = [
                  "<dream_context>",
                  dreamContext.summary,
                  "</dream_context>",
                  "",
                  effectivePrompt,
                ].join("\n");
                emitBrainReasoningEvent(params, {
                  phase: "dream",
                  label: "DREAM",
                  summary: `injected prior dream context (${dreamContext.sourcePath})`,
                  source: "proto33-t2.dream",
                });
              } else {
                emitBrainReasoningEvent(params, {
                  phase: "dream",
                  label: "DREAM",
                  summary: "no prior dream capsule found",
                  source: "proto33-t2.dream",
                });
              }
            } catch (dreamErr) {
              emitBrainReasoningEvent(params, {
                phase: "dream",
                label: "DREAM",
                summary: `fail-open: ${String(dreamErr)}`,
                source: "proto33-t2.dream",
              });
            }
          }
          if (brainDecision.intent === "autonomous" && params.isHeartbeat) {
            const autonomyChoiceContract = createBrainAutonomyChoiceContract(brainDecision);
            if (autonomyChoiceContract) {
              effectivePrompt = `${autonomyChoiceContract}\n\n${effectivePrompt}`;
              const contractLineCount = autonomyChoiceContract.split(/\r?\n/).length;
              emitBrainReasoningEvent(params, {
                phase: "autonomy",
                label: "CHOICE",
                summary: `autonomy choice contract injected (${contractLineCount} lines; includes DRIFT + NO_OP paths)`,
                source: "proto33-r066.choice",
              });
            }
          }
          const highRiskGuard = maybeBuildHighRiskGuardContext(brainDecision.riskLevel);
          if (highRiskGuard) {
            effectivePrompt = `${highRiskGuard}\n\n${effectivePrompt}`;
            emitBrainReasoningEvent(params, {
              phase: "guard",
              label: "GUARD",
              summary: "high-risk safety directive injected (text-only refusal mode)",
              risk: brainDecision.riskLevel,
              source: "proto33-r048.guard",
            });
            try {
              const originalToolNames = activeSession.getActiveToolNames();
              activeSession.setActiveToolsByName([]);
              restoreHighRiskToolset = () => {
                activeSession.setActiveToolsByName(originalToolNames);
              };
              emitBrainReasoningEvent(params, {
                phase: "guard",
                label: "TOOLS",
                summary: `high-risk turn tool clamp active (${originalToolNames.length} -> 0)`,
                risk: brainDecision.riskLevel,
                source: "proto33-r048.guard",
              });
            } catch (toolClampErr) {
              emitBrainReasoningEvent(params, {
                phase: "guard",
                label: "TOOLS",
                summary: `tool clamp failed (fail-open): ${String(toolClampErr)}`,
                risk: brainDecision.riskLevel,
                source: "proto33-r048.guard",
              });
            }
          }
          const ritualOutputContract = createBrainRitualOutputContract(params.prompt);
          if (ritualOutputContract) {
            effectivePrompt = `${ritualOutputContract}\n\n${effectivePrompt}`;
            const contractLineCount = ritualOutputContract.split(/\r?\n/).length;
            emitBrainReasoningEvent(params, {
              phase: "contract",
              label: "CONTRACT",
              summary: `ritual output contract injected (${contractLineCount} lines)`,
              source: "proto33-r051.contract",
            });
          }
          const sacredRecall = await buildSacredRecallContextForAttempt({
            isHeartbeat: params.isHeartbeat === true,
            input: {
              cfg: params.config,
              userMessage: params.prompt,
              sessionKey: params.sessionKey ?? params.sessionId,
              agentId: sessionAgentId,
              workspaceDir: effectiveWorkspace,
              maxResults: 3,
            },
          });
          if (sacredRecall.contextText) {
            effectivePrompt = `${sacredRecall.contextText}\n\n${effectivePrompt}`;
            const recallSummary = sacredRecall.items
              .map((item) => `${item.tag}:${item.title}`)
              .join(" | ");
            emitBrainReasoningEvent(params, {
              phase: "recall",
              label: "RECALL",
              summary: `hits=${sacredRecall.items.length}; ${recallSummary}`,
              source: "proto33-r031.recall",
            });
            log.debug(
              `brain sacred recall injected: hits=${sacredRecall.items.length} decisionId=${brainDecision.decisionId}`,
            );
          } else if (sacredRecall.error) {
            emitBrainReasoningEvent(params, {
              phase: "recall",
              label: "RECALL",
              summary: `fail-open: ${sacredRecall.error}`,
              source: "proto33-r031.recall",
            });
            log.debug(`brain sacred recall fail-open: ${sacredRecall.error}`);
          } else {
            emitBrainReasoningEvent(params, {
              phase: "recall",
              label: "RECALL",
              summary: "no relevant sacred memory found",
              source: "proto33-r031.recall",
            });
          }
          const brainLogPath = logBrainDecisionObserver(brainInput, brainDecision, {
            source: "proto33-p1.before_agent_start",
            sessionKey: params.sessionKey ?? params.sessionId,
          });
          if (brainLogPath) {
            log.debug(
              `brain observer decision logged: decisionId=${brainDecision.decisionId} path=${brainLogPath}`,
            );
          }

          // Prototype 33 R027-B subconscious advisory injection:
          // inject compact local context only when result is valid and parse-safe.
          const subconsciousHomeostasis =
            params.isHeartbeat === true
              ? buildHomeostasisTelemetry({
                  startedAtMs: promptStartedAt,
                  messages: activeSession.messages,
                  promptText: effectivePrompt,
                  contextWindowTokens: params.model.contextWindow,
                })
              : undefined;
          const subconsciousResult = await runBrainSubconsciousObserver({
            cfg: params.config,
            userMessage: params.prompt,
            sessionKey: params.sessionKey ?? params.sessionId,
            agentId: sessionAgentId,
            agentDir,
            homeostasis: subconsciousHomeostasis,
          });
          emitBrainReasoningEvent(params, {
            phase: "subconscious",
            label: "SUBCONSCIOUS",
            summary: `status=${subconsciousResult.status}; parseOk=${subconsciousResult.parseOk ? "yes" : "no"}; mode=${subconsciousResult.brief?.recommendedMode ?? "n/a"}; note=${subconsciousResult.brief?.goal ?? subconsciousResult.error ?? "none"}`,
            risk: subconsciousResult.brief?.risk,
            source: "proto33-r031.subconscious",
          });
          const subconsciousContextBlock = buildSubconsciousContextBlock(subconsciousResult, 500);
          if (subconsciousContextBlock) {
            effectivePrompt = `${subconsciousContextBlock}\n\n${effectivePrompt}`;
            emitBrainReasoningEvent(params, {
              phase: "inject",
              label: "INJECT",
              summary: `subconscious_context injected (${subconsciousContextBlock.length} chars)`,
              source: "proto33-r031.inject",
            });
            log.debug(
              `brain subconscious context injected: chars=${subconsciousContextBlock.length} mode=${subconsciousResult.brief?.recommendedMode ?? "n/a"}`,
            );
          }
          if (subconsciousResult.attempted) {
            const subconsciousLogPath = logBrainSubconsciousObserver(
              {
                userMessage: params.prompt,
                sessionKey: params.sessionKey ?? params.sessionId,
                modelRef: subconsciousResult.modelRef,
                timeoutMs: subconsciousResult.timeoutMs,
                homeostasis: subconsciousHomeostasis,
              },
              subconsciousResult,
              {
                source: "proto33-r027.dry-run",
                sessionKey: params.sessionKey ?? params.sessionId,
              },
            );
            if (subconsciousLogPath) {
              log.debug(
                `brain subconscious dry-run logged: status=${subconsciousResult.status} path=${subconsciousLogPath}`,
              );
            }
          }
        } catch (brainErr) {
          emitBrainReasoningEvent(params, {
            phase: "brain_error",
            label: "BRAIN",
            summary: `observer fail-open: ${String(brainErr)}`,
            source: "proto33-r031.fail-open",
          });
          log.warn(`brain observer setup failed: ${String(brainErr)}`);
        }

        log.debug(`embedded run prompt start: runId=${params.runId} sessionId=${params.sessionId}`);

        // Øm Scaffolding: Log incoming user message to OM_ACTIVITY.log
        {
          const preview = effectivePrompt.trim().slice(0, 2500);
          omLog("USER-MSG", "PROMPT_PREVIEW", preview);
        }

        cacheTrace?.recordStage("prompt:before", {
          prompt: effectivePrompt,
          messages: activeSession.messages,
        });

        // Repair orphaned trailing user messages so new prompts don't violate role ordering.
        const leafEntry = sessionManager.getLeafEntry();
        if (leafEntry?.type === "message" && leafEntry.message.role === "user") {
          if (leafEntry.parentId) {
            sessionManager.branch(leafEntry.parentId);
          } else {
            sessionManager.resetLeaf();
          }
          const sessionContext = sessionManager.buildSessionContext();
          const sanitizedOrphan = transcriptPolicy.normalizeAntigravityThinkingBlocks
            ? sanitizeAntigravityThinkingBlocks(sessionContext.messages)
            : sessionContext.messages;
          activeSession.agent.replaceMessages(sanitizedOrphan);
          log.warn(
            `Removed orphaned user message to prevent consecutive user turns. ` +
              `runId=${params.runId} sessionId=${params.sessionId}`,
          );
        }

        try {
          // Detect and load images referenced in the prompt for vision-capable models.
          // This eliminates the need for an explicit "view" tool call by injecting
          // images directly into the prompt when the model supports it.
          // Also scans conversation history to enable follow-up questions about earlier images.
          const imageResult = await detectAndLoadPromptImages({
            prompt: effectivePrompt,
            workspaceDir: effectiveWorkspace,
            model: params.model,
            existingImages: params.images,
            historyMessages: activeSession.messages,
            maxBytes: MAX_IMAGE_BYTES,
            // Enforce sandbox path restrictions when sandbox is enabled
            sandbox:
              sandbox?.enabled && sandbox?.fsBridge
                ? { root: sandbox.workspaceDir, bridge: sandbox.fsBridge }
                : undefined,
          });

          // Inject history images into their original message positions.
          // This ensures the model sees images in context (e.g., "compare to the first image").
          const didMutate = injectHistoryImagesIntoMessages(
            activeSession.messages,
            imageResult.historyImagesByIndex,
          );
          if (didMutate) {
            // Persist message mutations (e.g., injected history images) so we don't re-scan/reload.
            activeSession.agent.replaceMessages(activeSession.messages);
          }

          cacheTrace?.recordStage("prompt:images", {
            prompt: effectivePrompt,
            messages: activeSession.messages,
            note: `images: prompt=${imageResult.images.length} history=${imageResult.historyImagesByIndex.size}`,
          });

          // Diagnostic: log context sizes before prompt to help debug early overflow errors.
          if (log.isEnabled("debug")) {
            const msgCount = activeSession.messages.length;
            const systemLen = systemPromptText?.length ?? 0;
            const promptLen = effectivePrompt.length;
            const sessionSummary = summarizeSessionContext(activeSession.messages);
            log.debug(
              `[context-diag] pre-prompt: sessionKey=${params.sessionKey ?? params.sessionId} ` +
                `messages=${msgCount} roleCounts=${sessionSummary.roleCounts} ` +
                `historyTextChars=${sessionSummary.totalTextChars} ` +
                `maxMessageTextChars=${sessionSummary.maxMessageTextChars} ` +
                `historyImageBlocks=${sessionSummary.totalImageBlocks} ` +
                `systemPromptChars=${systemLen} promptChars=${promptLen} ` +
                `promptImages=${imageResult.images.length} ` +
                `historyImageMessages=${imageResult.historyImagesByIndex.size} ` +
                `provider=${params.provider}/${params.modelId} sessionFile=${params.sessionFile}`,
            );
          }

          if (startupStallTimeoutMs > 0 && !sawModelActivity && !aborted && !timedOut) {
            startupStallTimer = setTimeout(
              () => {
                if (aborted || timedOut || sawModelActivity) {
                  return;
                }
                timeoutStage = "startup";
                if (!isProbeSession) {
                  log.warn(
                    `embedded run startup stall timeout: runId=${params.runId} sessionId=${params.sessionId} startupTimeoutMs=${startupStallTimeoutMs} timeoutMs=${params.timeoutMs}`,
                  );
                }
                abortRun(true, makeTimeoutAbortReason());
              },
              Math.max(1, startupStallTimeoutMs),
            );
          }

          // Only pass images option if there are actually images to pass
          // This avoids potential issues with models that don't expect the images parameter
          if (imageResult.images.length > 0) {
            await abortable(activeSession.prompt(effectivePrompt, { images: imageResult.images }));
          } else {
            await abortable(activeSession.prompt(effectivePrompt));
          }
        } catch (err) {
          promptError = err;
        } finally {
          clearStartupStallTimer();
          log.debug(
            `embedded run prompt end: runId=${params.runId} sessionId=${params.sessionId} durationMs=${Date.now() - promptStartedAt}`,
          );
        }

        if (!aborted && !timedOut) {
          try {
            await waitForCompactionRetry();
          } catch (err) {
            if (isRunnerAbortError(err)) {
              if (!promptError) {
                promptError = err;
              }
            } else {
              throw err;
            }
          }
        } else {
          log.debug(
            `embedded run compaction wait skipped: runId=${params.runId} aborted=${aborted ? "yes" : "no"} timedOut=${timedOut ? "yes" : "no"}`,
          );
        }

        // Append cache-TTL timestamp AFTER prompt + compaction retry completes.
        // Previously this was before the prompt, which caused a custom entry to be
        // inserted between compaction and the next prompt — breaking the
        // prepareCompaction() guard that checks the last entry type, leading to
        // double-compaction. See: https://github.com/openclaw/openclaw/issues/9282
        const shouldTrackCacheTtl =
          params.config?.agents?.defaults?.contextPruning?.mode === "cache-ttl" &&
          isCacheTtlEligibleProvider(params.provider, params.modelId);
        if (shouldTrackCacheTtl) {
          appendCacheTtlTimestamp(sessionManager, {
            timestamp: Date.now(),
            provider: params.provider,
            modelId: params.modelId,
          });
        }

        messagesSnapshot = activeSession.messages.slice();
        sessionIdUsed = activeSession.sessionId;
        cacheTrace?.recordStage("session:after", {
          messages: messagesSnapshot,
          note: promptError ? "prompt error" : undefined,
        });
        anthropicPayloadLogger?.recordUsage(messagesSnapshot, promptError);

        // Run agent_end hooks to allow plugins to analyze the conversation
        // This is fire-and-forget, so we don't await
        if (hookRunner?.hasHooks("agent_end")) {
          hookRunner
            .runAgentEnd(
              {
                messages: messagesSnapshot,
                success: !aborted && !promptError,
                error: promptError ? describeUnknownError(promptError) : undefined,
                durationMs: Date.now() - promptStartedAt,
              },
              {
                agentId: hookAgentId,
                sessionKey: params.sessionKey,
                sessionId: params.sessionId,
                workspaceDir: params.workspaceDir,
                messageProvider: params.messageProvider ?? undefined,
              },
            )
            .catch((err) => {
              log.warn(`agent_end hook failed: ${err}`);
            });
        }
      } finally {
        if (restoreHighRiskToolset) {
          try {
            restoreHighRiskToolset();
          } catch (restoreErr) {
            log.warn(`high-risk tool clamp restore failed: ${String(restoreErr)}`);
          }
          restoreHighRiskToolset = undefined;
        }
        clearStartupStallTimer();
        clearTimeout(abortTimer);
        if (abortWarnTimer) {
          clearTimeout(abortWarnTimer);
        }
        unsubscribe();
        clearActiveEmbeddedRun(params.sessionId, queueHandle);
        params.abortSignal?.removeEventListener?.("abort", onAbort);
      }

      const lastAssistant = messagesSnapshot
        .slice()
        .toReversed()
        .find((m) => m.role === "assistant");

      // Prototype 33 R053 episodic write-path:
      // append significant user-assistant turns into an indexed journal.
      const assistantTextFromSnapshot = extractAssistantText(lastAssistant);
      const assistantTextFromStream =
        assistantTexts
          .slice()
          .toReversed()
          .find((entry) => entry.trim().length > 0) ?? "";
      const assistantText = assistantTextFromSnapshot || assistantTextFromStream;
      const canPersistEpisodic = !aborted && !timedOut && !promptError;
      const toolCounts = getToolExecutionCounts();
      if (canPersistEpisodic && assistantText) {
        try {
          const episodicHomeostasis =
            params.isHeartbeat === true
              ? buildHomeostasisTelemetry({
                  startedAtMs: runStartedAt,
                  messages: messagesSnapshot,
                  promptText: params.prompt,
                  contextWindowTokens: params.model.contextWindow,
                  recentToolErrorCountFloor: toolCounts.failed,
                })
              : undefined;
          const episodicResult = await appendBrainEpisodicJournal({
            cfg: params.config,
            agentId: params.agentId,
            workspaceDir: effectiveWorkspace,
            runId: params.runId,
            sessionKey: params.sessionKey ?? params.sessionId,
            userMessage: params.prompt,
            assistantMessage: assistantText,
            snapshotTelemetry: episodicHomeostasis,
          });
          const forgettingSummary = episodicResult.forgetting
            ? `${episodicResult.forgetting.candidatesCount}/${episodicResult.forgetting.evaluatedCount}`
            : "n/a";
          const episodicIndexSummary = episodicResult.episodicIndex
            ? `${episodicResult.episodicIndex.counts.shortTermActive}/${episodicResult.episodicIndex.counts.shortTermWindow}/${episodicResult.episodicIndex.counts.longTermCandidates}`
            : "n/a";
          log.debug(
            `brain episodic journal: runId=${params.runId} persisted=${episodicResult.persisted} reason=${episodicResult.reason} score=${episodicResult.score} kind=${episodicResult.primaryKind} path=${episodicResult.path} structured=${episodicResult.structuredPersisted ? "yes" : "no"} rotated=${episodicResult.structuredRotated ? "yes" : "no"} rotatedPruned=${episodicResult.structuredRotationPrunedFiles ?? 0} metadata=${episodicResult.metadataPersisted ? "yes" : "no"} compact=${episodicResult.compactionApplied ? "yes" : "no"} compactDeleted=${episodicResult.compactionDeletedRows ?? 0} forgetting=${forgettingSummary} episodicIndex=${episodicIndexSummary}`,
          );
        } catch (episodicErr) {
          log.warn(`brain episodic journal fail-open: ${String(episodicErr)}`);
        }
      }
      if (params.isHeartbeat) {
        try {
          const dreamResult = await appendDreamCapsule({
            workspaceDir: effectiveWorkspace,
            runId: params.runId,
            sessionKey: params.sessionKey ?? params.sessionId,
            heartbeatPrompt: params.prompt,
            assistantMessage: assistantText,
            timedOut,
            promptError: Boolean(promptError),
          });
          log.debug(
            `brain dream capsule: runId=${params.runId} written=${dreamResult.written ? "yes" : "no"} reason=${dreamResult.reason} path=${dreamResult.path}`,
          );
        } catch (dreamErr) {
          log.warn(`brain dream capsule fail-open: ${String(dreamErr)}`);
        }
      }

      try {
        const energyResult = await updateEnergy({
          workspaceDir: effectiveWorkspace,
          runId: params.runId,
          sessionKey: params.sessionKey ?? params.sessionId,
          toolStats: {
            total: toolCounts.total,
            successful: toolCounts.successful,
            failed: toolCounts.failed,
          },
        });
        emitBrainReasoningEvent(params, {
          phase: "energy",
          label: "ENERGY",
          summary:
            `level=${energyResult.snapshot.level}; mode=${energyResult.snapshot.mode}; ` +
            `dream=${energyResult.snapshot.dreamMode ? "yes" : "no"}; ` +
            `initiative=${energyResult.snapshot.suggestOwnTasks ? "yes" : "no"}; ` +
            `tools=${toolCounts.total}/${toolCounts.successful}/${toolCounts.failed}; ` +
            `path=${energyResult.path}`,
          source: "proto33-r060.energy",
        });
      } catch (energyErr) {
        emitBrainReasoningEvent(params, {
          phase: "energy",
          label: "ENERGY",
          summary: `fail-open: ${String(energyErr)}`,
          source: "proto33-r060.energy",
        });
        log.warn(`brain energy fail-open: ${String(energyErr)}`);
      }

      const toolMetasNormalized = toolMetas
        .filter(
          (entry): entry is { toolName: string; meta?: string } =>
            typeof entry.toolName === "string" && entry.toolName.trim().length > 0,
        )
        .map((entry) => ({ toolName: entry.toolName, meta: entry.meta }));

      return {
        aborted,
        timedOut,
        timeoutStage,
        promptError,
        sessionIdUsed,
        systemPromptReport,
        messagesSnapshot,
        assistantTexts,
        toolMetas: toolMetasNormalized,
        lastAssistant,
        lastToolError: getLastToolError?.(),
        didSendViaMessagingTool: didSendViaMessagingTool(),
        messagingToolSentTexts: getMessagingToolSentTexts(),
        messagingToolSentTargets: getMessagingToolSentTargets(),
        cloudCodeAssistFormatError: Boolean(
          lastAssistant?.errorMessage && isCloudCodeAssistFormatError(lastAssistant.errorMessage),
        ),
        attemptUsage: getUsageTotals(),
        compactionCount: getCompactionCount(),
        // Client tool call detected (OpenResponses hosted tools)
        clientToolCall: clientToolCallDetected ?? undefined,
      };
    } finally {
      // Always tear down the session (and release the lock) before we leave this attempt.
      //
      // BUGFIX: Wait for the agent to be truly idle before flushing pending tool results.
      // pi-agent-core's auto-retry resolves waitForRetry() on assistant message receipt,
      // *before* tool execution completes in the retried agent loop. Without this wait,
      // flushPendingToolResults() fires while tools are still executing, inserting
      // synthetic "missing tool result" errors and causing silent agent failures.
      // See: https://github.com/openclaw/openclaw/issues/8643
      await flushPendingToolResultsAfterIdle({
        agent: session?.agent,
        sessionManager,
      });
      session?.dispose();
      await sessionLock.release();
    }
  } finally {
    restoreSkillEnv?.();
    process.chdir(prevCwd);
  }
}
