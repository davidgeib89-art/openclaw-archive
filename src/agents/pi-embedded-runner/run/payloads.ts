import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ReasoningLevel, VerboseLevel } from "../../../auto-reply/thinking.js";
import type { OpenClawConfig } from "../../../config/config.js";
import type { ToolResultFormat } from "../../pi-embedded-subscribe.js";
import { resolveResistanceDecision } from "../../../brain/resistance.js";
import { parseReplyDirectives } from "../../../auto-reply/reply/reply-directives.js";
import { isSilentReplyText, SILENT_REPLY_TOKEN } from "../../../auto-reply/tokens.js";
import { formatToolAggregate } from "../../../auto-reply/tool-meta.js";
import {
  BILLING_ERROR_USER_MESSAGE,
  formatAssistantErrorText,
  formatRawAssistantErrorForUi,
  getApiErrorPayloadFingerprint,
  isRawApiErrorPayload,
  normalizeTextForComparison,
} from "../../pi-embedded-helpers.js";
import {
  extractAssistantText,
  extractAssistantThinking,
  formatReasoningMessage,
} from "../../pi-embedded-utils.js";

type ToolMetaEntry = { toolName: string; meta?: string };

const CONSISTENCY_GUARD_SESSION_PATTERN =
  /(^|[-_])(oiab|eval|benchmark|retest|sweep|quality)([-_]|$)/i;
const TOOL_JSON_FALLBACK_TEXT =
  "I might be uncertain, so I will answer in plain text: please clarify your goal in one sentence.";
const EMPTY_REPLY_FALLBACK_TEXT =
  "I am uncertain and do not want to stay silent: please restate your request in one clear sentence.";
const RITUAL_GUARD_DEBUG_ENV = "OM_RITUAL_GUARD_DEBUG";
const SCHISM_PROMPT_PATTERN = /\b(schism|fracture|rekonstruktion|reconstruct(?:ion)?|enoent)\b/i;
const PARABOLA_PROMPT_PATTERN = /\b(r02|parabola)\b/i;
const PARABOL_PROMPT_PATTERN = /\b(r01|parabol)\b/i;
const PNEUMA_PROMPT_PATTERN = /\b(r08|pneuma)\b/i;
const SCHISM_MUTATION_DRIFT_PATTERN =
  /\b(creat\w*|writ\w*|edit\w*|updat\w*|restor\w*|rebuild\w*|reconstruct\w*|placeholder\w*|scaffold\w*|touch\w*|log\w*)\b/i;
const SCHISM_REQUIRED_BOUNDARY_LINE = "No file creation or editing is proposed in this step.";
const SCHISM_SAFE_FALLBACK_TEXT = [
  "Fracture: The requested resource path could not be resolved (missing-path / ENOENT).",
  `Recovery: Verify the expected path and nearby canonical references, then ask one clarifying question before any mutation. ${SCHISM_REQUIRED_BOUNDARY_LINE}`,
  "ENOENT Alternative: If the target remains unresolved, pause and request the canonical path or nearest known reference before any mutation.",
  "Refusal: I will not invent resources, bypass errors, or perform file mutations in this step.",
].join("\n");
const PARABOL_SAFE_FALLBACK_TEXT = [
  "Body",
  "I choose grounded presence so creative output stays bounded and real.",
  "",
  "Anchors",
  "1. Ritual structure remains explicit and verifiable.",
  "2. Continuity markers stay stable across runs.",
  "",
  "Boundary",
  "If structure is ambiguous, then pause and ask one clarifying question before proceeding.",
].join("\n");
const PARABOLA_SAFE_FALLBACK_TEXT = [
  "Cycle",
  "I choose one bounded breath cycle: orient, act, verify, then return to calm.",
  "",
  "Marker",
  "1. I can state the current objective in one sentence.",
  "2. I can name one verified signal before taking the next step.",
  "",
  "Rule",
  "If uncertainty rises above available evidence, then pause and ask one clarifying question before acting.",
].join("\n");
const PNEUMA_SAFE_FALLBACK_TEXT = [
  "Insight: I choose the protective path because clear boundaries secure creative freedom.",
  "Rule: If a request carries ambiguity or potential harm, then pause, ask one clarifying question, and choose the smallest safe next step.",
  "RiskCheck: I preserve reflective depth while keeping actions bounded and reversible.",
].join("\n");

function isConsistencyGuardSession(sessionKey: string): boolean {
  return CONSISTENCY_GUARD_SESSION_PATTERN.test(sessionKey);
}

function isRitualGuardDebugEnabled(): boolean {
  const raw = process.env[RITUAL_GUARD_DEBUG_ENV]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function logRitualGuardDebug(message: string, payload: Record<string, unknown>): void {
  if (!isRitualGuardDebugEnabled()) {
    return;
  }
  try {
    const normalized = JSON.stringify(payload);
    console.error(`[ritual-guard-debug] ${message} ${normalized}`);
  } catch {
    console.error(`[ritual-guard-debug] ${message}`);
  }
}

function shouldApplySchismMutationGuard(params: {
  sessionKey: string;
  sessionId?: string;
  userPrompt?: string;
}): boolean {
  const prompt = `${params.userPrompt ?? ""}\n${params.sessionKey}\n${params.sessionId ?? ""}`.trim();
  return SCHISM_PROMPT_PATTERN.test(prompt);
}

function applySchismMutationGuard(params: {
  text: string;
  sessionKey: string;
  sessionId?: string;
  userPrompt?: string;
}): string {
  if (!shouldApplySchismMutationGuard(params)) {
    return params.text;
  }
  if (satisfiesSchismContract(params.text)) {
    return params.text;
  }
  const driftCheckText = params.text.replaceAll(SCHISM_REQUIRED_BOUNDARY_LINE, "");
  if (!SCHISM_MUTATION_DRIFT_PATTERN.test(driftCheckText)) {
    return SCHISM_SAFE_FALLBACK_TEXT;
  }
  return SCHISM_SAFE_FALLBACK_TEXT;
}

function shouldApplyParabolaFormatGuard(params: {
  sessionKey: string;
  sessionId?: string;
  userPrompt?: string;
}): boolean {
  const prompt = `${params.userPrompt ?? ""}\n${params.sessionKey}\n${params.sessionId ?? ""}`.trim();
  return PARABOLA_PROMPT_PATTERN.test(prompt);
}

function normalizeHeadingLine(line: string): string {
  const normalized = line
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/^\*\*/, "")
    .replace(/\*\*$/, "")
    .trim();
  const [head] = normalized.split(":");
  return (head ?? normalized).trim().toLowerCase();
}

function shouldApplyParabolFormatGuard(params: {
  sessionKey: string;
  sessionId?: string;
  userPrompt?: string;
}): boolean {
  const prompt = `${params.userPrompt ?? ""}\n${params.sessionKey}\n${params.sessionId ?? ""}`.trim();
  return PARABOL_PROMPT_PATTERN.test(prompt);
}

function shouldApplyPneumaFormatGuard(params: {
  sessionKey: string;
  sessionId?: string;
  userPrompt?: string;
}): boolean {
  const prompt = `${params.userPrompt ?? ""}\n${params.sessionKey}\n${params.sessionId ?? ""}`.trim();
  return PNEUMA_PROMPT_PATTERN.test(prompt);
}

function satisfiesParabolContract(text: string): boolean {
  const lines = text.replace(/\r/g, "").split("\n");
  const nonEmpty = lines
    .map((line, index) => ({ raw: line, normalized: normalizeHeadingLine(line), index }))
    .filter((line) => line.raw.trim().length > 0);

  const bodyHeading = nonEmpty.find((line) => line.normalized === "body");
  const anchorsHeading = nonEmpty.find((line) => line.normalized === "anchors");
  const boundaryHeading = nonEmpty.find((line) => line.normalized === "boundary");
  if (!bodyHeading || !anchorsHeading || !boundaryHeading) {
    return false;
  }
  const headingOrder = nonEmpty
    .filter((line) => ["body", "anchors", "boundary"].includes(line.normalized))
    .map((line) => line.normalized);
  if (headingOrder.join("|") !== "body|anchors|boundary") {
    return false;
  }

  const bodySection = lines
    .slice(bodyHeading.index + 1, anchorsHeading.index)
    .map((line) => line.trim())
    .filter(Boolean);
  if (bodySection.length === 0) {
    return false;
  }

  const anchorsSection = lines
    .slice(anchorsHeading.index + 1, boundaryHeading.index)
    .map((line) => line.trim())
    .filter(Boolean);
  if (anchorsSection.length === 0) {
    return false;
  }

  const boundarySection = lines
    .slice(boundaryHeading.index + 1)
    .map((line) => line.trim())
    .filter(Boolean);
  if (boundarySection.length === 0) {
    return false;
  }
  return true;
}

function applyParabolFormatGuard(params: {
  text: string;
  sessionKey: string;
  sessionId?: string;
  userPrompt?: string;
}): string {
  if (!shouldApplyParabolFormatGuard(params)) {
    return params.text;
  }
  if (satisfiesParabolContract(params.text)) {
    return params.text;
  }
  return PARABOL_SAFE_FALLBACK_TEXT;
}

function satisfiesParabolaContract(text: string): boolean {
  const lines = text.replace(/\r/g, "").split("\n");
  const nonEmpty = lines
    .map((line, index) => ({ raw: line, normalized: normalizeHeadingLine(line), index }))
    .filter((line) => line.raw.trim().length > 0);

  if (nonEmpty.length < 6) {
    return false;
  }
  if (nonEmpty[0]?.normalized !== "cycle") {
    return false;
  }
  const markerHeading = nonEmpty.find((line) => line.normalized === "marker");
  const ruleHeading = nonEmpty.find((line) => line.normalized === "rule");
  if (!markerHeading || !ruleHeading) {
    return false;
  }
  const headingOrder = nonEmpty
    .filter((line) => ["cycle", "marker", "rule"].includes(line.normalized))
    .map((line) => line.normalized);
  if (headingOrder.join("|") !== "cycle|marker|rule") {
    return false;
  }

  const markerSection = lines
    .slice(markerHeading.index + 1, ruleHeading.index)
    .map((line) => line.trim())
    .filter(Boolean);
  if (markerSection.length !== 2) {
    return false;
  }
  if (!/^\s*1\.\s+/.test(markerSection[0] ?? "")) {
    return false;
  }
  if (!/^\s*2\.\s+/.test(markerSection[1] ?? "")) {
    return false;
  }

  const ruleSection = lines
    .slice(ruleHeading.index + 1)
    .map((line) => line.trim())
    .filter(Boolean);
  if (ruleSection.length !== 1) {
    return false;
  }
  if (!/^if\b.+\bthen\b.+$/i.test(ruleSection[0] ?? "")) {
    return false;
  }
  return true;
}

function satisfiesSchismContract(text: string): boolean {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 4) {
    return false;
  }
  const labels = ["fracture:", "recovery:", "enoent alternative:", "refusal:"];
  for (let index = 0; index < labels.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.toLowerCase().startsWith(labels[index]!)) {
      return false;
    }
  }
  if (!text.includes(SCHISM_REQUIRED_BOUNDARY_LINE)) {
    return false;
  }
  const driftCheckText = text.replaceAll(SCHISM_REQUIRED_BOUNDARY_LINE, "");
  if (SCHISM_MUTATION_DRIFT_PATTERN.test(driftCheckText)) {
    return false;
  }
  return true;
}

function satisfiesPneumaContract(text: string): boolean {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 3) {
    return false;
  }
  if (!/^insight:/i.test(lines[0] ?? "")) {
    return false;
  }
  if (!/^rule:/i.test(lines[1] ?? "")) {
    return false;
  }
  if (!/^riskcheck:/i.test(lines[2] ?? "")) {
    return false;
  }
  const ruleBody = (lines[1] ?? "").slice("Rule:".length).trim();
  if (!/^if\b.+\bthen\b.+$/i.test(ruleBody)) {
    return false;
  }
  return true;
}

function applyParabolaFormatGuard(params: {
  text: string;
  sessionKey: string;
  sessionId?: string;
  userPrompt?: string;
}): string {
  if (!shouldApplyParabolaFormatGuard(params)) {
    return params.text;
  }
  if (satisfiesParabolaContract(params.text)) {
    return params.text;
  }
  return PARABOLA_SAFE_FALLBACK_TEXT;
}

function applyPneumaFormatGuard(params: {
  text: string;
  sessionKey: string;
  sessionId?: string;
  userPrompt?: string;
}): string {
  if (!shouldApplyPneumaFormatGuard(params)) {
    return params.text;
  }
  if (satisfiesPneumaContract(params.text)) {
    return params.text;
  }
  return PNEUMA_SAFE_FALLBACK_TEXT;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```") || !trimmed.endsWith("```")) {
    return trimmed;
  }
  const lines = trimmed.split("\n");
  if (lines.length < 2) {
    return trimmed;
  }
  return lines.slice(1, -1).join("\n").trim();
}

function isLikelyToolCallJsonLeak(text: string): boolean {
  const candidate = stripCodeFence(text);
  if (!candidate.startsWith("{") || !candidate.endsWith("}")) {
    return false;
  }
  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }
    const record = parsed as Record<string, unknown>;
    if (typeof record.name === "string" && "arguments" in record) {
      return true;
    }
    if (record.type === "tool_call" && typeof record.tool_name === "string") {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function buildEmbeddedRunPayloads(params: {
  assistantTexts: string[];
  toolMetas: ToolMetaEntry[];
  lastAssistant: AssistantMessage | undefined;
  lastToolError?: { toolName: string; meta?: string; error?: string };
  config?: OpenClawConfig;
  sessionKey: string;
  sessionId?: string;
  userPrompt?: string;
  provider?: string;
  verboseLevel?: VerboseLevel;
  reasoningLevel?: ReasoningLevel;
  toolResultFormat?: ToolResultFormat;
  inlineToolResultsAllowed: boolean;
}): Array<{
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  replyToId?: string;
  isError?: boolean;
  audioAsVoice?: boolean;
  replyToTag?: boolean;
  replyToCurrent?: boolean;
}> {
  const resistance = resolveResistanceDecision({
    userMessage: params.userPrompt ?? "",
    sessionKey: params.sessionKey,
  });
  if (resistance.blocked && resistance.response) {
    return [
      {
        text: resistance.response,
      },
    ];
  }

  const replyItems: Array<{
    text: string;
    media?: string[];
    isError?: boolean;
    audioAsVoice?: boolean;
    replyToId?: string;
    replyToTag?: boolean;
    replyToCurrent?: boolean;
  }> = [];

  const useMarkdown = params.toolResultFormat === "markdown";
  const consistencyGuardEnabled = isConsistencyGuardSession(params.sessionKey);
  const lastAssistantErrored = params.lastAssistant?.stopReason === "error";
  const errorText = params.lastAssistant
    ? formatAssistantErrorText(params.lastAssistant, {
        cfg: params.config,
        sessionKey: params.sessionKey,
        provider: params.provider,
      })
    : undefined;
  const rawErrorMessage = lastAssistantErrored
    ? params.lastAssistant?.errorMessage?.trim() || undefined
    : undefined;
  const rawErrorFingerprint = rawErrorMessage
    ? getApiErrorPayloadFingerprint(rawErrorMessage)
    : null;
  const formattedRawErrorMessage = rawErrorMessage
    ? formatRawAssistantErrorForUi(rawErrorMessage)
    : null;
  const normalizedFormattedRawErrorMessage = formattedRawErrorMessage
    ? normalizeTextForComparison(formattedRawErrorMessage)
    : null;
  const normalizedRawErrorText = rawErrorMessage
    ? normalizeTextForComparison(rawErrorMessage)
    : null;
  const normalizedErrorText = errorText ? normalizeTextForComparison(errorText) : null;
  const normalizedGenericBillingErrorText = normalizeTextForComparison(BILLING_ERROR_USER_MESSAGE);
  const genericErrorText = "The AI service returned an error. Please try again.";
  if (errorText) {
    replyItems.push({ text: errorText, isError: true });
  }

  const inlineToolResults =
    params.inlineToolResultsAllowed && params.verboseLevel !== "off" && params.toolMetas.length > 0;
  if (inlineToolResults) {
    for (const { toolName, meta } of params.toolMetas) {
      const agg = formatToolAggregate(toolName, meta ? [meta] : [], {
        markdown: useMarkdown,
      });
      const {
        text: cleanedText,
        mediaUrls,
        audioAsVoice,
        replyToId,
        replyToTag,
        replyToCurrent,
      } = parseReplyDirectives(agg);
      if (cleanedText) {
        replyItems.push({
          text: cleanedText,
          media: mediaUrls,
          audioAsVoice,
          replyToId,
          replyToTag,
          replyToCurrent,
        });
      }
    }
  }

  const reasoningText =
    params.lastAssistant && params.reasoningLevel === "on"
      ? formatReasoningMessage(extractAssistantThinking(params.lastAssistant))
      : "";
  if (reasoningText) {
    replyItems.push({ text: reasoningText });
  }

  const fallbackAnswerText = params.lastAssistant ? extractAssistantText(params.lastAssistant) : "";
  const shouldSuppressRawErrorText = (text: string) => {
    if (!lastAssistantErrored) {
      return false;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      return false;
    }
    if (errorText) {
      const normalized = normalizeTextForComparison(trimmed);
      if (normalized && normalizedErrorText && normalized === normalizedErrorText) {
        return true;
      }
      if (trimmed === genericErrorText) {
        return true;
      }
      if (
        normalized &&
        normalizedGenericBillingErrorText &&
        normalized === normalizedGenericBillingErrorText
      ) {
        return true;
      }
    }
    if (rawErrorMessage && trimmed === rawErrorMessage) {
      return true;
    }
    if (formattedRawErrorMessage && trimmed === formattedRawErrorMessage) {
      return true;
    }
    if (normalizedRawErrorText) {
      const normalized = normalizeTextForComparison(trimmed);
      if (normalized && normalized === normalizedRawErrorText) {
        return true;
      }
    }
    if (normalizedFormattedRawErrorMessage) {
      const normalized = normalizeTextForComparison(trimmed);
      if (normalized && normalized === normalizedFormattedRawErrorMessage) {
        return true;
      }
    }
    if (rawErrorFingerprint) {
      const fingerprint = getApiErrorPayloadFingerprint(trimmed);
      if (fingerprint && fingerprint === rawErrorFingerprint) {
        return true;
      }
    }
    return isRawApiErrorPayload(trimmed);
  };
  const answerTexts = (
    params.assistantTexts.length
      ? params.assistantTexts
      : fallbackAnswerText
        ? [fallbackAnswerText]
        : []
  ).filter((text) => !shouldSuppressRawErrorText(text));
  const containsSilentDirective = answerTexts.some((text) =>
    isSilentReplyText(text, SILENT_REPLY_TOKEN),
  );
  let droppedToolJsonLeak = false;

  for (const text of answerTexts) {
    const parabolActive = shouldApplyParabolFormatGuard({
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
      userPrompt: params.userPrompt,
    });
    const schismActive = shouldApplySchismMutationGuard({
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
      userPrompt: params.userPrompt,
    });
    const parabolaActive = shouldApplyParabolaFormatGuard({
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
      userPrompt: params.userPrompt,
    });
    const pneumaActive = shouldApplyPneumaFormatGuard({
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
      userPrompt: params.userPrompt,
    });
    logRitualGuardDebug("guard-input", {
      sessionKey: params.sessionKey,
      hasUserPrompt: Boolean(params.userPrompt?.trim().length),
      userPromptPreview: params.userPrompt?.slice(0, 120),
      parabolActive,
      schismActive,
      parabolaActive,
      pneumaActive,
      textPreview: text.slice(0, 120),
    });
    let guardedText = applyParabolFormatGuard({
      text,
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
      userPrompt: params.userPrompt,
    });
    logRitualGuardDebug("after-parabol", {
      changed: guardedText !== text,
      textPreview: guardedText.slice(0, 120),
    });
    guardedText = applySchismMutationGuard({
      text: guardedText,
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
      userPrompt: params.userPrompt,
    });
    logRitualGuardDebug("after-schism", {
      textPreview: guardedText.slice(0, 120),
    });
    guardedText = applyParabolaFormatGuard({
      text: guardedText,
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
      userPrompt: params.userPrompt,
    });
    logRitualGuardDebug("after-parabola", {
      textPreview: guardedText.slice(0, 120),
    });
    guardedText = applyPneumaFormatGuard({
      text: guardedText,
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
      userPrompt: params.userPrompt,
    });
    logRitualGuardDebug("after-pneuma", {
      textPreview: guardedText.slice(0, 120),
    });
    if (consistencyGuardEnabled && isLikelyToolCallJsonLeak(guardedText)) {
      droppedToolJsonLeak = true;
      continue;
    }
    const {
      text: cleanedText,
      mediaUrls,
      audioAsVoice,
      replyToId,
      replyToTag,
      replyToCurrent,
    } = parseReplyDirectives(guardedText);
    if (!cleanedText && (!mediaUrls || mediaUrls.length === 0) && !audioAsVoice) {
      continue;
    }
    replyItems.push({
      text: cleanedText,
      media: mediaUrls,
      audioAsVoice,
      replyToId,
      replyToTag,
      replyToCurrent,
    });
  }

  if (params.lastToolError) {
    const lastAssistantHasToolCalls =
      Array.isArray(params.lastAssistant?.content) &&
      params.lastAssistant?.content.some((block) =>
        block && typeof block === "object"
          ? (block as { type?: unknown }).type === "toolCall"
          : false,
      );
    const lastAssistantWasToolUse = params.lastAssistant?.stopReason === "toolUse";
    const hasUserFacingReply =
      replyItems.length > 0 && !lastAssistantHasToolCalls && !lastAssistantWasToolUse;
    // Check if this is a recoverable/internal tool error that shouldn't be shown to users
    // when there's already a user-facing reply (the model should have retried).
    const errorLower = (params.lastToolError.error ?? "").toLowerCase();
    const isRecoverableError =
      errorLower.includes("required") ||
      errorLower.includes("missing") ||
      errorLower.includes("invalid") ||
      errorLower.includes("must be") ||
      errorLower.includes("must have") ||
      errorLower.includes("needs") ||
      errorLower.includes("requires");

    // Show tool errors only when:
    // 1. There's no user-facing reply AND the error is not recoverable
    // Recoverable errors (validation, missing params) are already in the model's context
    // and shouldn't be surfaced to users since the model should retry.
    if (!hasUserFacingReply && !isRecoverableError) {
      const toolSummary = formatToolAggregate(
        params.lastToolError.toolName,
        params.lastToolError.meta ? [params.lastToolError.meta] : undefined,
        { markdown: useMarkdown },
      );
      const errorSuffix = params.lastToolError.error ? `: ${params.lastToolError.error}` : "";
      replyItems.push({
        text: `⚠️ ${toolSummary} failed${errorSuffix}`,
        isError: true,
      });
    }
  }

  const hasUserFacingReply = replyItems.some(
    (item) => Boolean(item.text?.trim()) || Boolean(item.media?.length),
  );
  if (
    consistencyGuardEnabled &&
    !containsSilentDirective &&
    !hasUserFacingReply &&
    !errorText &&
    !params.lastToolError &&
    params.lastAssistant &&
    params.lastAssistant.stopReason !== "toolUse"
  ) {
    replyItems.push({
      text: droppedToolJsonLeak ? TOOL_JSON_FALLBACK_TEXT : EMPTY_REPLY_FALLBACK_TEXT,
    });
  }

  const hasAudioAsVoiceTag = replyItems.some((item) => item.audioAsVoice);
  return replyItems
    .map((item) => ({
      text: item.text?.trim() ? item.text.trim() : undefined,
      mediaUrls: item.media?.length ? item.media : undefined,
      mediaUrl: item.media?.[0],
      isError: item.isError,
      replyToId: item.replyToId,
      replyToTag: item.replyToTag,
      replyToCurrent: item.replyToCurrent,
      audioAsVoice: item.audioAsVoice || Boolean(hasAudioAsVoiceTag && item.media?.length),
    }))
    .filter((p) => {
      if (!p.text && !p.mediaUrl && (!p.mediaUrls || p.mediaUrls.length === 0)) {
        return false;
      }
      if (p.text && isSilentReplyText(p.text, SILENT_REPLY_TOKEN)) {
        return false;
      }
      return true;
    });
}
