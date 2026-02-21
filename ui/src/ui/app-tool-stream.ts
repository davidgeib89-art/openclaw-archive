import { truncateText } from "./format.ts";

const TOOL_STREAM_LIMIT = 50;
const TOOL_STREAM_THROTTLE_MS = 80;
const TOOL_OUTPUT_CHAR_LIMIT = 120_000;
const THOUGHT_STREAM_LIMIT = 120;
const THOUGHT_SUMMARY_LIMIT = 260;
const THOUGHT_DETAIL_LIMIT = 1_800;

export type AgentEventPayload = {
  runId: string;
  seq: number;
  stream: string;
  ts: number;
  sessionKey?: string;
  data: Record<string, unknown>;
};

export type ToolStreamEntry = {
  toolCallId: string;
  runId: string;
  sessionKey?: string;
  name: string;
  args?: unknown;
  output?: string;
  startedAt: number;
  updatedAt: number;
  message: Record<string, unknown>;
};

export type ThoughtStreamEntry = {
  id: string;
  runId: string;
  seq: number;
  ts: number;
  sessionKey?: string;
  label: string;
  summary: string;
  rawSummary?: string;
  detail?: string;
  risk?: string;
  phase?: string;
  stream: "reasoning" | "reply";
};

export type ThoughtTraceStep = {
  seq: number;
  ts: number;
  label: string;
  phase?: string;
  risk?: string;
  stream: "reasoning" | "reply";
  summary: string;
  detail?: string;
};

export type ThoughtTraceAttachment = {
  version: 1;
  runId: string;
  sessionKey?: string;
  capturedAt: number;
  stepCount: number;
  steps: ThoughtTraceStep[];
};

export type ThoughtTraceHistoryEntry = {
  trace: ThoughtTraceAttachment;
  endedState: "final" | "aborted" | "error";
  endedAt: number;
  messageTimestamp?: number;
};

type ToolStreamHost = {
  sessionKey: string;
  chatRunId: string | null;
  toolStreamById: Map<string, ToolStreamEntry>;
  toolStreamOrder: string[];
  chatToolMessages: Record<string, unknown>[];
  chatThoughtEvents: ThoughtStreamEntry[];
  toolStreamSyncTimer: number | null;
};

function normalizeThoughtSummary(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length <= THOUGHT_SUMMARY_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, THOUGHT_SUMMARY_LIMIT - 3)}...`;
}

function normalizeThoughtDetail(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = raw.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length <= THOUGHT_DETAIL_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, THOUGHT_DETAIL_LIMIT - 3)}...`;
}

function parseSummaryKeyValueMap(summary: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const segment of summary.split(";")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!key || !value) continue;
    map[key] = value;
  }
  return map;
}

function toYesNo(raw: string | undefined): string {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized === "yes" || normalized === "true") return "yes";
  if (normalized === "no" || normalized === "false") return "no";
  return normalized || "n/a";
}

function intentLabel(raw: string | undefined): string {
  switch ((raw ?? "").trim().toLowerCase()) {
    case "qa":
      return "question answering";
    case "research":
      return "research";
    case "edit":
      return "file change";
    case "creative":
      return "creative step";
    case "ops":
      return "system operation";
    case "autonomous":
      return "autonomous heartbeat";
    default:
      return raw?.trim() || "n/a";
  }
}

function modeLabel(raw: string | undefined): string {
  switch ((raw ?? "").trim().toLowerCase()) {
    case "answer_direct":
      return "answer directly";
    case "ask_clarify":
      return "ask clarifying question";
    case "plan_then_answer":
      return "plan, then answer";
    default:
      return raw?.trim() || "n/a";
  }
}

function humanizeReasoningLabel(raw: string, phase: string | undefined): string {
  const normalized = (raw || phase || "").trim().toLowerCase();
  switch (normalized) {
    case "input":
      return "Your Message";
    case "intent":
      return "Goal";
    case "risk":
      return "Safety";
    case "recall":
      return "Memory";
    case "subconscious":
      return "Inner Observer";
    case "inject":
      return "Context Inject";
    case "contract":
      return "Contract";
    case "choice":
      return "Choice";
    case "cycle":
      return "Cycle";
    case "dream":
      return "Dream";
    case "guard":
      return "Guard";
    case "tools":
      return "Tool Limits";
    case "energy":
      return "Energy";
    case "brain":
      return "Brain";
    default:
      return raw;
  }
}

function shouldAttachRawSummaryDetail(rawSummary: string, summary: string): boolean {
  if (rawSummary === summary) {
    return false;
  }
  return /[=;:{}<>]/.test(rawSummary);
}

function humanizeReasoningSummary(
  data: Record<string, unknown>,
  rawSummary: string,
): { summary: string; detail?: string; rawSummary?: string } {
  const phase = typeof data.phase === "string" ? data.phase.trim().toLowerCase() : "";
  const label = typeof data.label === "string" ? data.label.trim().toLowerCase() : "";
  const kv = parseSummaryKeyValueMap(rawSummary);

  let summary = rawSummary;

  if (phase === "input" || label === "input") {
    summary = `Your message: "${rawSummary}"`;
  } else if (phase === "intent" || label === "intent") {
    const intent = intentLabel(kv.intent);
    const mustAskUser = toYesNo(kv.mustAskUser);
    const allowedTools = kv.allowedTools ?? "n/a";
    summary = `Goal recognized: ${intent}. Clarification needed: ${mustAskUser}. Allowed tools: ${allowedTools}.`;
  } else if (phase === "risk" || label === "risk") {
    const cleaned = rawSummary.replace(/^Observer decision:\s*/i, "");
    summary = `Safety check: ${cleaned}`;
  } else if (phase === "recall" || label === "recall") {
    const hitsRaw = kv.hits;
    const hits = typeof hitsRaw === "string" ? Number(hitsRaw) : Number.NaN;
    if (/fail-open/i.test(rawSummary)) {
      summary = "Memory recall was unavailable for a moment, run continued safely (fail-open).";
    } else if (Number.isFinite(hits)) {
      summary =
        hits > 0
          ? `Memory recall found ${hits} relevant hit${hits === 1 ? "" : "s"}.`
          : "Memory recall found no direct hit and continued without blocking.";
    } else if (/no relevant sacred memory found/i.test(rawSummary)) {
      summary = "Memory recall found no direct hit and continued without blocking.";
    }
  } else if (phase === "subconscious" || label === "subconscious") {
    const status = kv.status ?? "n/a";
    const parseOk = toYesNo(kv.parseOk);
    const mode = modeLabel(kv.mode);
    const note = kv.note ?? "n/a";
    summary = `Inner observer: status ${status}, parse ${parseOk}, mode ${mode}. Signal: ${note}.`;
  } else if (phase === "inject" || label === "inject") {
    summary = "Inner context was injected into the run before the final response.";
  } else if (phase === "energy" || label === "energy") {
    const level = kv.level ?? "n/a";
    const mode = kv.mode ?? "n/a";
    const dream = toYesNo(kv.dream);
    const initiative = toYesNo(kv.initiative);
    summary = `Energy snapshot: ${level}% (${mode}). Dream mode: ${dream}. Initiative: ${initiative}.`;
  }

  const detailFromEvent = normalizeThoughtDetail(data.detail);
  if (detailFromEvent) {
    return {
      summary,
      detail: detailFromEvent,
      rawSummary: summary === rawSummary ? undefined : rawSummary,
    };
  }
  if (shouldAttachRawSummaryDetail(rawSummary, summary)) {
    return {
      summary,
      detail: rawSummary,
      rawSummary,
    };
  }
  return {
    summary,
    rawSummary: summary === rawSummary ? undefined : rawSummary,
  };
}

function trimThoughtStream(host: ToolStreamHost) {
  if (host.chatThoughtEvents.length <= THOUGHT_STREAM_LIMIT) {
    return;
  }
  host.chatThoughtEvents = host.chatThoughtEvents.slice(
    host.chatThoughtEvents.length - THOUGHT_STREAM_LIMIT,
  );
}

function isThoughtEventInActiveRun(host: ToolStreamHost, payload: AgentEventPayload): boolean {
  const sessionKey = typeof payload.sessionKey === "string" ? payload.sessionKey : undefined;
  if (sessionKey && sessionKey !== host.sessionKey) {
    return false;
  }
  if (!sessionKey && host.chatRunId && payload.runId !== host.chatRunId) {
    return false;
  }
  if (host.chatRunId && payload.runId !== host.chatRunId) {
    return false;
  }
  if (!host.chatRunId) {
    return false;
  }
  return true;
}

function pushThoughtEvent(host: ToolStreamHost, entry: ThoughtStreamEntry) {
  host.chatThoughtEvents = [...host.chatThoughtEvents, entry];
  trimThoughtStream(host);
}

function upsertThoughtEvent(host: ToolStreamHost, entry: ThoughtStreamEntry) {
  const idx = host.chatThoughtEvents.findIndex((event) => event.id === entry.id);
  if (idx < 0) {
    pushThoughtEvent(host, entry);
    return;
  }
  const next = [...host.chatThoughtEvents];
  next[idx] = entry;
  host.chatThoughtEvents = next;
}

function extractToolOutputText(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") {
    return record.text;
  }
  const content = record.content;
  if (!Array.isArray(content)) {
    return null;
  }
  const parts = content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const entry = item as Record<string, unknown>;
      if (entry.type === "text" && typeof entry.text === "string") {
        return entry.text;
      }
      return null;
    })
    .filter((part): part is string => Boolean(part));
  if (parts.length === 0) {
    return null;
  }
  return parts.join("\n");
}

function formatToolOutput(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const contentText = extractToolOutputText(value);
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else if (contentText) {
    text = contentText;
  } else {
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      // oxlint-disable typescript/no-base-to-string
      text = String(value);
    }
  }
  const truncated = truncateText(text, TOOL_OUTPUT_CHAR_LIMIT);
  if (!truncated.truncated) {
    return truncated.text;
  }
  return `${truncated.text}\n\n… truncated (${truncated.total} chars, showing first ${truncated.text.length}).`;
}

function buildToolStreamMessage(entry: ToolStreamEntry): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = [];
  content.push({
    type: "toolcall",
    name: entry.name,
    arguments: entry.args ?? {},
  });
  if (entry.output) {
    content.push({
      type: "toolresult",
      name: entry.name,
      text: entry.output,
    });
  }
  return {
    role: "assistant",
    toolCallId: entry.toolCallId,
    runId: entry.runId,
    content,
    timestamp: entry.startedAt,
  };
}

function trimToolStream(host: ToolStreamHost) {
  if (host.toolStreamOrder.length <= TOOL_STREAM_LIMIT) {
    return;
  }
  const overflow = host.toolStreamOrder.length - TOOL_STREAM_LIMIT;
  const removed = host.toolStreamOrder.splice(0, overflow);
  for (const id of removed) {
    host.toolStreamById.delete(id);
  }
}

function syncToolStreamMessages(host: ToolStreamHost) {
  host.chatToolMessages = host.toolStreamOrder
    .map((id) => host.toolStreamById.get(id)?.message)
    .filter((msg): msg is Record<string, unknown> => Boolean(msg));
}

export function flushToolStreamSync(host: ToolStreamHost) {
  if (host.toolStreamSyncTimer != null) {
    clearTimeout(host.toolStreamSyncTimer);
    host.toolStreamSyncTimer = null;
  }
  syncToolStreamMessages(host);
}

export function scheduleToolStreamSync(host: ToolStreamHost, force = false) {
  if (force) {
    flushToolStreamSync(host);
    return;
  }
  if (host.toolStreamSyncTimer != null) {
    return;
  }
  host.toolStreamSyncTimer = window.setTimeout(
    () => flushToolStreamSync(host),
    TOOL_STREAM_THROTTLE_MS,
  );
}

export function resetToolStream(host: ToolStreamHost) {
  host.toolStreamById.clear();
  host.toolStreamOrder = [];
  host.chatToolMessages = [];
  host.chatThoughtEvents = [];
  flushToolStreamSync(host);
}

export type CompactionStatus = {
  active: boolean;
  startedAt: number | null;
  completedAt: number | null;
};

type CompactionHost = ToolStreamHost & {
  compactionStatus?: CompactionStatus | null;
  compactionClearTimer?: number | null;
};

const COMPACTION_TOAST_DURATION_MS = 5000;

export function handleCompactionEvent(host: CompactionHost, payload: AgentEventPayload) {
  const data = payload.data ?? {};
  const phase = typeof data.phase === "string" ? data.phase : "";

  // Clear any existing timer
  if (host.compactionClearTimer != null) {
    window.clearTimeout(host.compactionClearTimer);
    host.compactionClearTimer = null;
  }

  if (phase === "start") {
    host.compactionStatus = {
      active: true,
      startedAt: Date.now(),
      completedAt: null,
    };
  } else if (phase === "end") {
    host.compactionStatus = {
      active: false,
      startedAt: host.compactionStatus?.startedAt ?? null,
      completedAt: Date.now(),
    };
    // Auto-clear the toast after duration
    host.compactionClearTimer = window.setTimeout(() => {
      host.compactionStatus = null;
      host.compactionClearTimer = null;
    }, COMPACTION_TOAST_DURATION_MS);
  }
}

export function handleAgentEvent(host: ToolStreamHost, payload?: AgentEventPayload) {
  if (!payload) {
    return;
  }

  if (payload.stream === "reasoning" || payload.stream === "thinking") {
    if (!isThoughtEventInActiveRun(host, payload)) {
      return;
    }
    const data = payload.data ?? {};
    const rawSummary =
      normalizeThoughtSummary(data.summary) ??
      normalizeThoughtSummary(data.text) ??
      normalizeThoughtSummary(JSON.stringify(data));
    if (!rawSummary) {
      return;
    }
    const humanized = humanizeReasoningSummary(data, rawSummary);
    const phase = typeof data.phase === "string" ? data.phase : undefined;
    const risk = typeof data.risk === "string" ? data.risk : undefined;
    const labelRaw =
      typeof data.label === "string" && data.label.trim().length > 0
        ? data.label.trim()
        : payload.stream === "thinking"
          ? "THINKING"
          : phase
            ? phase.toUpperCase()
            : "THOUGHT";
    const label = humanizeReasoningLabel(labelRaw, phase);
    pushThoughtEvent(host, {
      id: `reasoning:${payload.runId}:${payload.seq}`,
      runId: payload.runId,
      seq: payload.seq,
      ts: typeof payload.ts === "number" ? payload.ts : Date.now(),
      sessionKey: typeof payload.sessionKey === "string" ? payload.sessionKey : undefined,
      label,
      summary: humanized.summary,
      rawSummary: humanized.rawSummary,
      detail: humanized.detail,
      risk,
      phase,
      stream: "reasoning",
    });
    return;
  }

  if (payload.stream === "assistant") {
    if (!isThoughtEventInActiveRun(host, payload)) {
      return;
    }
    const data = payload.data ?? {};
    const summary = normalizeThoughtSummary(data.delta) ?? normalizeThoughtSummary(data.text);
    if (!summary) {
      return;
    }
    upsertThoughtEvent(host, {
      id: `reply:${payload.runId}`,
      runId: payload.runId,
      seq: payload.seq,
      ts: typeof payload.ts === "number" ? payload.ts : Date.now(),
      sessionKey: typeof payload.sessionKey === "string" ? payload.sessionKey : undefined,
      label: "REPLY",
      summary,
      stream: "reply",
    });
  }

  // Handle compaction events
  if (payload.stream === "compaction") {
    handleCompactionEvent(host as CompactionHost, payload);
    return;
  }

  if (payload.stream !== "tool") {
    return;
  }
  const sessionKey = typeof payload.sessionKey === "string" ? payload.sessionKey : undefined;
  if (sessionKey && sessionKey !== host.sessionKey) {
    return;
  }
  // Fallback: only accept session-less events for the active run.
  if (!sessionKey && host.chatRunId && payload.runId !== host.chatRunId) {
    return;
  }
  if (host.chatRunId && payload.runId !== host.chatRunId) {
    return;
  }
  if (!host.chatRunId) {
    return;
  }

  const data = payload.data ?? {};
  const toolCallId = typeof data.toolCallId === "string" ? data.toolCallId : "";
  if (!toolCallId) {
    return;
  }
  const name = typeof data.name === "string" ? data.name : "tool";
  const phase = typeof data.phase === "string" ? data.phase : "";
  const args = phase === "start" ? data.args : undefined;
  const output =
    phase === "update"
      ? formatToolOutput(data.partialResult)
      : phase === "result"
        ? formatToolOutput(data.result)
        : undefined;

  const now = Date.now();
  let entry = host.toolStreamById.get(toolCallId);
  if (!entry) {
    entry = {
      toolCallId,
      runId: payload.runId,
      sessionKey,
      name,
      args,
      output: output || undefined,
      startedAt: typeof payload.ts === "number" ? payload.ts : now,
      updatedAt: now,
      message: {},
    };
    host.toolStreamById.set(toolCallId, entry);
    host.toolStreamOrder.push(toolCallId);
  } else {
    entry.name = name;
    if (args !== undefined) {
      entry.args = args;
    }
    if (output !== undefined) {
      entry.output = output || undefined;
    }
    entry.updatedAt = now;
  }

  entry.message = buildToolStreamMessage(entry);
  trimToolStream(host);
  scheduleToolStreamSync(host, phase === "result");
}
