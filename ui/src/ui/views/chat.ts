import { html, nothing } from "lit";
import { ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
import type {
  ThoughtStreamEntry,
  ThoughtTraceAttachment,
  ThoughtTraceHistoryEntry,
} from "../app-tool-stream.ts";
import type { SessionsListResult } from "../types.ts";
import type { ChatItem, MessageGroup } from "../types/chat-types.ts";
import type { ChatAttachment, ChatQueueItem } from "../ui-types.ts";
import {
  renderMessageGroup,
  renderReadingIndicatorGroup,
  renderStreamingGroup,
} from "../chat/grouped-render.ts";
import { normalizeMessage, normalizeRoleForGrouping } from "../chat/message-normalizer.ts";
import { renderMicButton } from "../chat/voice-ui.ts";
import { icons } from "../icons.ts";
import { detectTextDirection } from "../text-direction.ts";
import "../components/resizable-divider.ts";
import { renderMarkdownSidebar } from "./markdown-sidebar.ts";

export type CompactionIndicatorStatus = {
  active: boolean;
  startedAt: number | null;
  completedAt: number | null;
};

export type ChatProps = {
  sessionKey: string;
  onSessionKeyChange: (next: string) => void;
  thinkingLevel: string | null;
  showThinking: boolean;
  loading: boolean;
  sending: boolean;
  canAbort?: boolean;
  compactionStatus?: CompactionIndicatorStatus | null;
  messages: unknown[];
  toolMessages: unknown[];
  thoughtEvents?: ThoughtStreamEntry[];
  thoughtHistory?: ThoughtTraceHistoryEntry[];
  stream: string | null;
  streamStartedAt: number | null;
  assistantAvatarUrl?: string | null;
  draft: string;
  queue: ChatQueueItem[];
  connected: boolean;
  canSend: boolean;
  disabledReason: string | null;
  error: string | null;
  sessions: SessionsListResult | null;
  // Focus mode
  focusMode: boolean;
  // Sidebar state
  sidebarOpen?: boolean;
  sidebarContent?: string | null;
  sidebarError?: string | null;
  splitRatio?: number;
  assistantName: string;
  assistantAvatar: string | null;
  // Image attachments
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (attachments: ChatAttachment[]) => void;
  // Scroll control
  showNewMessages?: boolean;
  onScrollToBottom?: () => void;
  // Event handlers
  onRefresh: () => void;
  onToggleFocusMode: () => void;
  onDraftChange: (next: string) => void;
  onSend: () => void;
  onAbort?: () => void;
  onQueueRemove: (id: string) => void;
  onNewSession: () => void;
  heartbeatTriggerRunning?: boolean;
  heartbeatTriggerMessage?: string | null;
  heartbeatTriggerMessageKind?: "info" | "success" | "error";
  onHeartbeatTrigger?: () => void;
  onOpenSidebar?: (content: string) => void;
  onCloseSidebar?: () => void;
  onSplitRatioChange?: (ratio: number) => void;
  onChatScroll?: (event: Event) => void;
};

const COMPACTION_TOAST_DURATION_MS = 5000;
const THOUGHT_STREAM_RENDER_LIMIT = 32;
const THOUGHT_HISTORY_RENDER_LIMIT = 24;
const HEARTBEAT_SIGNAL_SCAN_LIMIT = 80;
const CYCLE_PATHS = ["PLAY", "LEARN", "MAINTAIN", "DRIFT", "NO_OP"] as const;
const CYCLE_PATH_SET = new Set<string>(CYCLE_PATHS);

type CyclePath = (typeof CYCLE_PATHS)[number] | "UNKNOWN";
type CycleConfidence = "high" | "medium" | "low";
type MutationBudgetState =
  | {
      kind: "known";
      used: number;
      limit: number;
      remaining: number;
      exhausted: boolean;
      source: string;
    }
  | {
      kind: "exhausted_unknown";
      source: string;
    }
  | {
      kind: "unknown";
    };

type HeartbeatStatusPanelState = {
  cyclePath: CyclePath;
  cycleConfidence: CycleConfidence;
  cycleSource: string;
  driftActive: boolean;
  mutationBudget: MutationBudgetState;
  signalCount: number;
  updatedAt: number | null;
};

type PanelSignal = {
  text: string;
  ts: number;
  source: string;
};

function adjustTextareaHeight(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

type ThoughtTraceLookup = {
  byRunId: Map<string, ThoughtTraceAttachment>;
  byMessageTimestamp: Map<number, ThoughtTraceAttachment>;
};

function buildThoughtTraceLookup(
  history: readonly ThoughtTraceHistoryEntry[] | undefined,
  sessionKey: string,
): ThoughtTraceLookup {
  const byRunId = new Map<string, ThoughtTraceAttachment>();
  const byMessageTimestamp = new Map<number, ThoughtTraceAttachment>();
  for (const entry of history ?? []) {
    if (!entry || typeof entry !== "object" || !entry.trace) {
      continue;
    }
    const trace = entry.trace;
    if (trace.sessionKey && trace.sessionKey !== sessionKey) {
      continue;
    }
    byRunId.set(trace.runId, trace);
    if (typeof entry.messageTimestamp === "number" && Number.isFinite(entry.messageTimestamp)) {
      byMessageTimestamp.set(entry.messageTimestamp, trace);
    }
  }
  return { byRunId, byMessageTimestamp };
}

function withResolvedThoughtTrace(
  message: unknown,
  traceLookup: ThoughtTraceLookup,
): unknown {
  if (!message || typeof message !== "object") {
    return message;
  }
  const record = message as Record<string, unknown>;
  const role = typeof record.role === "string" ? record.role.toLowerCase() : "";
  if (role !== "assistant") {
    return message;
  }

  const markerRaw = record.__openclaw;
  const marker =
    markerRaw && typeof markerRaw === "object" ? (markerRaw as Record<string, unknown>) : null;
  if (marker && marker.thoughtTrace && typeof marker.thoughtTrace === "object") {
    return message;
  }

  const markerRunId = marker && typeof marker.runId === "string" ? marker.runId : null;
  const fromRun = markerRunId ? traceLookup.byRunId.get(markerRunId) : undefined;

  let resolvedTrace = fromRun;
  if (!resolvedTrace) {
    const ts = typeof record.timestamp === "number" && Number.isFinite(record.timestamp)
      ? record.timestamp
      : null;
    if (ts != null) {
      resolvedTrace = traceLookup.byMessageTimestamp.get(ts);
    }
  }
  if (!resolvedTrace) {
    return message;
  }

  const nextMarker: Record<string, unknown> = { ...(marker ?? {}) };
  if (typeof nextMarker.runId !== "string") {
    nextMarker.runId = resolvedTrace.runId;
  }
  nextMarker.thoughtTrace = resolvedTrace;
  return { ...record, __openclaw: nextMarker };
}

function extractToolMessageText(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const record = message as Record<string, unknown>;
  if (typeof record.content === "string") {
    return record.content;
  }
  const content = record.content;
  if (!Array.isArray(content)) {
    return typeof record.text === "string" ? record.text : null;
  }
  const parts = content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const typed = item as Record<string, unknown>;
      if (typeof typed.text === "string") {
        return typed.text;
      }
      return null;
    })
    .filter((entry): entry is string => Boolean(entry && entry.trim().length > 0));
  if (parts.length === 0) {
    return null;
  }
  return parts.join("\n");
}

function normalizeCyclePath(raw: string | undefined): CyclePath | null {
  const normalized = raw?.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  return CYCLE_PATH_SET.has(normalized) ? (normalized as CyclePath) : null;
}

function collectPanelSignals(
  events: readonly ThoughtStreamEntry[] | undefined,
  toolMessages: readonly unknown[],
): PanelSignal[] {
  const signals: PanelSignal[] = [];
  for (const event of events ?? []) {
    const parts = [event.label, event.phase, event.summary, event.detail, event.rawSummary]
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .join("\n");
    if (!parts.trim()) {
      continue;
    }
    signals.push({
      text: parts,
      ts: Number.isFinite(event.ts) ? event.ts : Date.now(),
      source: `thought:${event.label.toLowerCase()}`,
    });
  }
  for (const message of toolMessages) {
    const text = extractToolMessageText(message);
    if (!text) {
      continue;
    }
    const record = message as Record<string, unknown>;
    const timestamp =
      typeof record.timestamp === "number" && Number.isFinite(record.timestamp)
        ? record.timestamp
        : Date.now();
    signals.push({
      text,
      ts: timestamp,
      source: "tool",
    });
  }
  if (signals.length <= HEARTBEAT_SIGNAL_SCAN_LIMIT) {
    return signals;
  }
  return signals.slice(signals.length - HEARTBEAT_SIGNAL_SCAN_LIMIT);
}

function resolveCycleState(signals: readonly PanelSignal[]): {
  cyclePath: CyclePath;
  cycleConfidence: CycleConfidence;
  cycleSource: string;
} {
  const explicitPatterns = [
    /\b(?:selected|chosen|decision|path|mode|cycle)\s*[:=]\s*(PLAY|LEARN|MAINTAIN|DRIFT|NO_OP)\b/i,
    /\b(?:i choose|ich waehle|ich wähle)\s+(PLAY|LEARN|MAINTAIN|DRIFT|NO_OP)\b/i,
    /\b(?:switching to|route:)\s*(PLAY|LEARN|MAINTAIN|DRIFT|NO_OP)\b/i,
  ];

  for (let idx = signals.length - 1; idx >= 0; idx -= 1) {
    const signal = signals[idx];
    for (const pattern of explicitPatterns) {
      const match = signal.text.match(pattern);
      const detected = normalizeCyclePath(match?.[1]);
      if (detected) {
        return {
          cyclePath: detected,
          cycleConfidence: "high",
          cycleSource: `explicit (${signal.source})`,
        };
      }
    }
  }

  for (let idx = signals.length - 1; idx >= 0; idx -= 1) {
    const signal = signals[idx];
    if (/\bdream\b|\bdrift\b|\bsilent presence\b|\bno prior dream capsule\b/i.test(signal.text)) {
      return {
        cyclePath: "DRIFT",
        cycleConfidence: "medium",
        cycleSource: `inferred (${signal.source})`,
      };
    }
    if (/\bHEARTBEAT_OK\b|\ball five candidate paths are blocked\b|\bNO_OP\b/i.test(signal.text)) {
      return {
        cyclePath: "NO_OP",
        cycleConfidence: "medium",
        cycleSource: `inferred (${signal.source})`,
      };
    }
  }

  return {
    cyclePath: "UNKNOWN",
    cycleConfidence: "low",
    cycleSource: "not enough visible signal",
  };
}

function resolveMutationBudgetState(signals: readonly PanelSignal[]): MutationBudgetState {
  const budgetPattern = /\bheartbeat mutation budget\s+(\d+)\s*\/\s*(\d+)\b/i;
  let sawExhausted = false;
  let exhaustedSource = "tool";
  for (let idx = signals.length - 1; idx >= 0; idx -= 1) {
    const signal = signals[idx];
    const budgetMatch = signal.text.match(budgetPattern);
    if (budgetMatch?.[1] && budgetMatch?.[2]) {
      const used = Number.parseInt(budgetMatch[1], 10);
      const limit = Number.parseInt(budgetMatch[2], 10);
      if (Number.isFinite(used) && Number.isFinite(limit) && limit > 0) {
        const clampedUsed = Math.max(0, Math.min(used, limit));
        const remaining = Math.max(0, limit - clampedUsed);
        return {
          kind: "known",
          used: clampedUsed,
          limit,
          remaining,
          exhausted: clampedUsed >= limit,
          source: signal.source,
        };
      }
    }
    if (
      /\bAUTONOMY_HEARTBEAT_MUTATION_LIMIT_REACHED\b|\bmutation budget exhausted\b/i.test(
        signal.text,
      )
    ) {
      sawExhausted = true;
      exhaustedSource = signal.source;
    }
  }
  if (sawExhausted) {
    return {
      kind: "exhausted_unknown",
      source: exhaustedSource,
    };
  }
  return { kind: "unknown" };
}

function buildHeartbeatPanelState(
  events: readonly ThoughtStreamEntry[] | undefined,
  toolMessages: readonly unknown[],
): HeartbeatStatusPanelState | null {
  const signals = collectPanelSignals(events, toolMessages);
  if (signals.length === 0) {
    return null;
  }
  const cycle = resolveCycleState(signals);
  const budget = resolveMutationBudgetState(signals);
  const updatedAt = signals.reduce<number | null>((latest, signal) => {
    if (!Number.isFinite(signal.ts)) return latest;
    if (latest == null || signal.ts > latest) return signal.ts;
    return latest;
  }, null);
  return {
    cyclePath: cycle.cyclePath,
    cycleConfidence: cycle.cycleConfidence,
    cycleSource: cycle.cycleSource,
    driftActive: cycle.cyclePath === "DRIFT",
    mutationBudget: budget,
    signalCount: signals.length,
    updatedAt,
  };
}

function buildHeartbeatPanelSidebarContent(state: HeartbeatStatusPanelState): string {
  const budgetLine =
    state.mutationBudget.kind === "known"
      ? `${state.mutationBudget.used}/${state.mutationBudget.limit} (remaining ${state.mutationBudget.remaining})`
      : state.mutationBudget.kind === "exhausted_unknown"
        ? "exhausted (limit unknown in UI-only mode)"
        : "not exposed in UI-only mode";
  return [
    "## Heartbeat Status Snapshot",
    "",
    `- cycle_path: \`${state.cyclePath}\``,
    `- confidence: \`${state.cycleConfidence}\``,
    `- source: \`${state.cycleSource}\``,
    `- drift_active: \`${state.driftActive ? "yes" : "no"}\``,
    `- mutation_budget: \`${budgetLine}\``,
    `- visible_signals_scanned: \`${state.signalCount}\``,
    `- updated_at: \`${state.updatedAt ? new Date(state.updatedAt).toISOString() : "n/a"}\``,
    "",
    "_UI-only mode: no runtime behavior changes, no brain changes._",
  ].join("\n");
}

function renderHeartbeatStatusPanel(
  events: readonly ThoughtStreamEntry[] | undefined,
  toolMessages: readonly unknown[],
  onOpenSidebar?: (content: string) => void,
) {
  const state = buildHeartbeatPanelState(events, toolMessages);
  if (!state) {
    return nothing;
  }
  const cycleDescription =
    state.cyclePath === "UNKNOWN"
      ? "Cycle not clearly visible yet"
      : `Current cycle: ${state.cyclePath}`;

  const budgetContent =
    state.mutationBudget.kind === "known"
      ? html`
          <div class="chat-heartbeat-panel__budget-head">
            <span class="chat-heartbeat-panel__budget-value"
              >${state.mutationBudget.used}/${state.mutationBudget.limit}</span
            >
            <span class="chat-heartbeat-panel__budget-remaining">
              ${state.mutationBudget.remaining} left
            </span>
          </div>
          <div
            class="chat-heartbeat-panel__budget-bar"
            role="progressbar"
            aria-label="Mutation budget usage"
            aria-valuemin="0"
            aria-valuemax=${state.mutationBudget.limit}
            aria-valuenow=${state.mutationBudget.used}
          >
            <span
              class="chat-heartbeat-panel__budget-fill ${state.mutationBudget.exhausted ? "chat-heartbeat-panel__budget-fill--exhausted" : ""}"
              style=${`width: ${(state.mutationBudget.used / state.mutationBudget.limit) * 100}%`}
            ></span>
          </div>
        `
      : state.mutationBudget.kind === "exhausted_unknown"
        ? html`
            <div class="chat-heartbeat-panel__budget-warning">
              Budget exhausted signal detected (limit hidden in UI-only mode)
            </div>
          `
        : html`
            <div class="chat-heartbeat-panel__budget-muted">
              Budget not exposed in UI-only mode
            </div>
          `;

  return html`
    <section class="chat-heartbeat-panel" aria-live="polite" aria-label="Heartbeat status panel">
      <div class="chat-heartbeat-panel__header">
        <div>
          <div class="chat-heartbeat-panel__title">Heartbeat Status</div>
          <div class="chat-heartbeat-panel__sub">${cycleDescription}</div>
        </div>
        <div class="chat-heartbeat-panel__meta">
          <span class="chat-heartbeat-panel__pill">${state.cycleConfidence}</span>
          <span
            class="chat-heartbeat-panel__pill ${state.driftActive ? "chat-heartbeat-panel__pill--drift" : ""}"
          >
            ${state.driftActive ? "DRIFT active" : "DRIFT idle"}
          </span>
        </div>
      </div>

      <div class="chat-heartbeat-panel__cycles">
        ${CYCLE_PATHS.map(
          (path) => html`
            <span
              class="chat-heartbeat-panel__cycle ${state.cyclePath === path ? "chat-heartbeat-panel__cycle--active" : ""}"
              >${path}</span
            >
          `,
        )}
      </div>

      <div class="chat-heartbeat-panel__budget">
        <div class="chat-heartbeat-panel__budget-label">Mutation Budget</div>
        ${budgetContent}
      </div>

      <div class="chat-heartbeat-panel__foot">
        <span>Source: ${state.cycleSource}</span>
        <span>
          ${state.updatedAt ? `Updated ${formatThoughtTime(state.updatedAt)}` : "Updated --:--:--"}
        </span>
        ${
          onOpenSidebar
            ? html`
                <button
                  class="chat-heartbeat-panel__detail-btn"
                  type="button"
                  @click=${() => onOpenSidebar(buildHeartbeatPanelSidebarContent(state))}
                >
                  View status detail
                </button>
              `
            : nothing
        }
      </div>
    </section>
  `;
}

function renderCompactionIndicator(status: CompactionIndicatorStatus | null | undefined) {
  if (!status) {
    return nothing;
  }

  // Show "compacting..." while active
  if (status.active) {
    return html`
      <div class="compaction-indicator compaction-indicator--active" role="status" aria-live="polite">
        ${icons.loader} Compacting context...
      </div>
    `;
  }

  // Show "compaction complete" briefly after completion
  if (status.completedAt) {
    const elapsed = Date.now() - status.completedAt;
    if (elapsed < COMPACTION_TOAST_DURATION_MS) {
      return html`
        <div class="compaction-indicator compaction-indicator--complete" role="status" aria-live="polite">
          ${icons.check} Context compacted
        </div>
      `;
    }
  }

  return nothing;
}

function normalizeRiskLevel(risk: string | undefined): "low" | "medium" | "high" | null {
  const normalized = risk?.trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  return null;
}

function formatThoughtTime(ts: number): string {
  if (!Number.isFinite(ts)) {
    return "--:--:--";
  }
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function buildThoughtSidebarContent(entry: ThoughtStreamEntry): string {
  const detail = entry.detail?.trim() || entry.rawSummary?.trim() || entry.summary;
  const detailBlock =
    detail.startsWith("{") || detail.startsWith("[")
      ? `\`\`\`json\n${detail}\n\`\`\``
      : detail;
  const timestampIso = Number.isFinite(entry.ts) ? new Date(entry.ts).toISOString() : "n/a";
  return [
    `## Thought Trace: ${entry.label}`,
    "",
    `- runId: \`${entry.runId}\``,
    `- stream: \`${entry.stream}\``,
    entry.phase ? `- phase: \`${entry.phase}\`` : "",
    entry.risk ? `- risk: \`${entry.risk}\`` : "",
    `- seq: \`${entry.seq}\``,
    `- time: \`${timestampIso}\``,
    "",
    "### Human Summary",
    entry.summary,
    "",
    "### Raw Detail",
    detailBlock,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function renderThoughtMonitor(
  events: readonly ThoughtStreamEntry[] | undefined,
  onOpenSidebar?: (content: string) => void,
) {
  if (!events || events.length === 0) {
    return nothing;
  }
  const recent = events.slice(Math.max(0, events.length - THOUGHT_STREAM_RENDER_LIMIT));
  return html`
    <section class="chat-thought-monitor" aria-live="polite" aria-label="Thought stream">
      <div class="chat-thought-monitor__header">
        <div class="chat-thought-monitor__title-wrap">
          <span class="chat-thought-monitor__title">Thought Stream</span>
          <span class="chat-thought-monitor__mode">Live Mind Trace</span>
        </div>
        <div class="chat-thought-monitor__stats">
          <span class="chat-thought-monitor__count">${recent.length} events</span>
          <span class="chat-thought-monitor__pulse">live</span>
        </div>
      </div>
      <div class="chat-thought-monitor__list">
        ${recent.map((entry, index) => {
          const risk = normalizeRiskLevel(entry.risk);
          const tone =
            risk ?? (entry.stream === "reply" ? "reply" : entry.phase ? "phase" : "neutral");
          const timestamp = formatThoughtTime(entry.ts);
          return html`
            <article class="chat-thought-monitor__item chat-thought-monitor__item--${tone}">
              <div class="chat-thought-monitor__rail" aria-hidden="true">
                <span class="chat-thought-monitor__dot"></span>
                ${index < recent.length - 1 ? html`<span class="chat-thought-monitor__line"></span>` : nothing}
              </div>
              <div class="chat-thought-monitor__content">
                <div class="chat-thought-monitor__meta">
                  <span class="chat-thought-monitor__label">${entry.label}</span>
                  <span class="chat-thought-monitor__stream chat-thought-monitor__stream--${entry.stream}">
                    ${entry.stream === "reply" ? "Reply" : "Thought"}
                  </span>
                  ${
                    entry.phase
                      ? html`<span class="chat-thought-monitor__phase">${entry.phase}</span>`
                      : nothing
                  }
                  ${
                    risk
                      ? html`<span class="chat-thought-monitor__risk chat-thought-monitor__risk--${risk}">${risk}</span>`
                      : nothing
                  }
                </div>
                <p class="chat-thought-monitor__summary">${entry.summary}</p>
                ${
                  entry.detail || entry.rawSummary
                    ? html`<button
                        class="chat-thought-monitor__detail-btn"
                        type="button"
                        @click=${() => onOpenSidebar?.(buildThoughtSidebarContent(entry))}
                        ?disabled=${!onOpenSidebar}
                      >
                        View detail
                      </button>`
                    : nothing
                }
                <div class="chat-thought-monitor__foot">
                  <span class="chat-thought-monitor__seq">#${entry.seq}</span>
                  <time class="chat-thought-monitor__time" datetime=${new Date(entry.ts).toISOString()}>
                    ${timestamp}
                  </time>
                </div>
              </div>
            </article>
          `;
        })}
      </div>
    </section>
  `;
}

function normalizeEndState(state: ThoughtTraceHistoryEntry["endedState"]): string {
  if (state === "final") return "final";
  if (state === "aborted") return "aborted";
  return "error";
}

function formatHistoryLabels(trace: ThoughtTraceAttachment): string {
  const labels = trace.steps
    .map((step) => step.label.trim())
    .filter((label) => label.length > 0)
    .slice(0, 5);
  if (labels.length === 0) {
    return "no visible thought labels";
  }
  if (trace.steps.length > labels.length) {
    return `${labels.join(" -> ")} -> ...`;
  }
  return labels.join(" -> ");
}

function buildThoughtHistorySidebarContent(entry: ThoughtTraceHistoryEntry): string {
  const trace = entry.trace;
  const lines: string[] = [
    "## Thought Stream History",
    "",
    `- runId: \`${trace.runId}\``,
    `- state: \`${entry.endedState}\``,
    `- endedAt: \`${new Date(entry.endedAt).toISOString()}\``,
    trace.sessionKey ? `- sessionKey: \`${trace.sessionKey}\`` : "",
    `- steps: \`${trace.stepCount}\``,
    "",
  ];

  trace.steps.forEach((step, index) => {
    lines.push(`### ${index + 1}. ${step.label}`);
    lines.push(`- stream: \`${step.stream}\``);
    lines.push(`- seq: \`${step.seq}\``);
    lines.push(`- time: \`${Number.isFinite(step.ts) ? new Date(step.ts).toISOString() : "n/a"}\``);
    if (step.phase) {
      lines.push(`- phase: \`${step.phase}\``);
    }
    if (step.risk) {
      lines.push(`- risk: \`${step.risk}\``);
    }
    lines.push("", step.summary);
    if (step.detail) {
      const detailBlock =
        step.detail.startsWith("{") || step.detail.startsWith("[")
          ? `\`\`\`json\n${step.detail}\n\`\`\``
          : step.detail;
      lines.push("", detailBlock);
    }
    lines.push("");
  });

  lines.push(`### Stream Ended: ${entry.endedState.toUpperCase()}`);
  lines.push(`Ended at ${new Date(entry.endedAt).toISOString()}.`);

  return lines.filter((line) => line.length > 0).join("\n");
}

function renderThoughtHistoryPanel(
  history: readonly ThoughtTraceHistoryEntry[] | undefined,
  sessionKey: string,
  onOpenSidebar?: (content: string) => void,
) {
  const recent = (history ?? [])
    .filter((entry) => {
      const traceSession = entry.trace?.sessionKey;
      return !traceSession || traceSession === sessionKey;
    })
    .slice(-THOUGHT_HISTORY_RENDER_LIMIT)
    .reverse();

  if (recent.length === 0) {
    return nothing;
  }

  return html`
    <section class="chat-thought-history" aria-live="polite" aria-label="Thought stream history">
      <div class="chat-thought-history__header">
        <span class="chat-thought-history__title">Thought Stream History</span>
        <span class="chat-thought-history__count">${recent.length} runs</span>
      </div>
      <div class="chat-thought-history__list">
        ${recent.map((entry) => {
          const endState = normalizeEndState(entry.endedState);
          const lastStep = entry.trace.steps[entry.trace.steps.length - 1];
          return html`
            <article class="chat-thought-history__item">
              <div class="chat-thought-history__meta">
                <span class="chat-thought-history__run">${entry.trace.runId.slice(0, 8)}</span>
                <span class="chat-thought-history__state chat-thought-history__state--${endState}">
                  ${endState}
                </span>
                <time
                  class="chat-thought-history__time"
                  datetime=${new Date(entry.endedAt).toISOString()}
                >
                  ${formatThoughtTime(entry.endedAt)}
                </time>
              </div>
              <p class="chat-thought-history__labels">${formatHistoryLabels(entry.trace)}</p>
              <p class="chat-thought-history__summary">
                ${lastStep?.summary ?? "No thought summary captured for this run."}
              </p>
              <div class="chat-thought-history__foot">
                <span>${entry.trace.stepCount} steps</span>
                ${
                  onOpenSidebar
                    ? html`
                        <button
                          class="chat-thought-history__detail-btn"
                          type="button"
                          @click=${() => onOpenSidebar(buildThoughtHistorySidebarContent(entry))}
                        >
                          Open trace
                        </button>
                      `
                    : nothing
                }
              </div>
            </article>
          `;
        })}
      </div>
    </section>
  `;
}

function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function handlePaste(e: ClipboardEvent, props: ChatProps) {
  const items = e.clipboardData?.items;
  if (!items || !props.onAttachmentsChange) {
    return;
  }

  const imageItems: DataTransferItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith("image/")) {
      imageItems.push(item);
    }
  }

  if (imageItems.length === 0) {
    return;
  }

  e.preventDefault();

  for (const item of imageItems) {
    const file = item.getAsFile();
    if (!file) {
      continue;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = reader.result as string;
      const newAttachment: ChatAttachment = {
        id: generateAttachmentId(),
        dataUrl,
        mimeType: file.type,
      };
      const current = props.attachments ?? [];
      props.onAttachmentsChange?.([...current, newAttachment]);
    });
    reader.readAsDataURL(file);
  }
}

function renderAttachmentPreview(props: ChatProps) {
  const attachments = props.attachments ?? [];
  if (attachments.length === 0) {
    return nothing;
  }

  return html`
    <div class="chat-attachments">
      ${attachments.map(
        (att) => html`
          <div class="chat-attachment">
            <img
              src=${att.dataUrl}
              alt="Attachment preview"
              class="chat-attachment__img"
            />
            <button
              class="chat-attachment__remove"
              type="button"
              aria-label="Remove attachment"
              @click=${() => {
                const next = (props.attachments ?? []).filter((a) => a.id !== att.id);
                props.onAttachmentsChange?.(next);
              }}
            >
              ${icons.x}
            </button>
          </div>
        `,
      )}
    </div>
  `;
}

export function renderChat(props: ChatProps) {
  const canCompose = props.connected;
  const isBusy = props.sending || props.stream !== null;
  const canAbort = Boolean(props.canAbort && props.onAbort);
  const activeSession = props.sessions?.sessions?.find((row) => row.key === props.sessionKey);
  const reasoningLevel = activeSession?.reasoningLevel ?? "off";
  const showReasoning = props.showThinking && reasoningLevel !== "off";
  const assistantIdentity = {
    name: props.assistantName,
    avatar: props.assistantAvatar ?? props.assistantAvatarUrl ?? null,
  };

  const hasAttachments = (props.attachments?.length ?? 0) > 0;
  const composePlaceholder = props.connected
    ? hasAttachments
      ? "Add a message or paste more images..."
      : "Message (↩ to send, Shift+↩ for line breaks, paste images)"
    : "Connect to the gateway to start chatting…";

  const splitRatio = props.splitRatio ?? 0.6;
  const sidebarOpen = Boolean(props.sidebarOpen && props.onCloseSidebar);
  const thread = html`
    <div
      class="chat-thread"
      role="log"
      aria-live="polite"
      @scroll=${props.onChatScroll}
    >
      ${
        props.loading
          ? html`
              <div class="muted">Loading chat…</div>
            `
          : nothing
      }
      ${repeat(
        buildChatItems(props),
        (item) => item.key,
        (item) => {
          if (item.kind === "divider") {
            return html`
              <div class="chat-divider" role="separator" data-ts=${String(item.timestamp)}>
                <span class="chat-divider__line"></span>
                <span class="chat-divider__label">${item.label}</span>
                <span class="chat-divider__line"></span>
              </div>
            `;
          }

          if (item.kind === "reading-indicator") {
            return renderReadingIndicatorGroup(assistantIdentity);
          }

          if (item.kind === "stream") {
            return renderStreamingGroup(
              item.text,
              item.startedAt,
              props.onOpenSidebar,
              assistantIdentity,
            );
          }

          if (item.kind === "group") {
            return renderMessageGroup(item, {
              onOpenSidebar: props.onOpenSidebar,
              showReasoning,
              assistantName: props.assistantName,
              assistantAvatar: assistantIdentity.avatar,
            });
          }

          return nothing;
        },
      )}
    </div>
  `;

  return html`
    <section class="card chat">
      ${props.disabledReason ? html`<div class="callout">${props.disabledReason}</div>` : nothing}

      ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}

      ${
        props.focusMode
          ? html`
            <button
              class="chat-focus-exit"
              type="button"
              @click=${props.onToggleFocusMode}
              aria-label="Exit focus mode"
              title="Exit focus mode"
            >
              ${icons.x}
            </button>
          `
          : nothing
      }

      <div
        class="chat-split-container ${sidebarOpen ? "chat-split-container--open" : ""}"
      >
        <div
          class="chat-main"
          style="flex: ${sidebarOpen ? `0 0 ${splitRatio * 100}%` : "1 1 100%"}"
        >
          ${thread}
        </div>

        ${
          sidebarOpen
            ? html`
              <resizable-divider
                .splitRatio=${splitRatio}
                @resize=${(e: CustomEvent) => props.onSplitRatioChange?.(e.detail.splitRatio)}
              ></resizable-divider>
              <div class="chat-sidebar">
                ${renderMarkdownSidebar({
                  content: props.sidebarContent ?? null,
                  error: props.sidebarError ?? null,
                  onClose: props.onCloseSidebar!,
                  onViewRawText: () => {
                    if (!props.sidebarContent || !props.onOpenSidebar) {
                      return;
                    }
                    props.onOpenSidebar(`\`\`\`\n${props.sidebarContent}\n\`\`\``);
                  },
                })}
              </div>
            `
            : nothing
        }
      </div>

      ${
        props.queue.length
          ? html`
            <div class="chat-queue" role="status" aria-live="polite">
              <div class="chat-queue__title">Queued (${props.queue.length})</div>
              <div class="chat-queue__list">
                ${props.queue.map(
                  (item) => html`
                    <div class="chat-queue__item">
                      <div class="chat-queue__text">
                        ${
                          item.text ||
                          (item.attachments?.length ? `Image (${item.attachments.length})` : "")
                        }
                      </div>
                      <button
                        class="btn chat-queue__remove"
                        type="button"
                        aria-label="Remove queued message"
                        @click=${() => props.onQueueRemove(item.id)}
                      >
                        ${icons.x}
                      </button>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
          : nothing
      }

      ${renderCompactionIndicator(props.compactionStatus)}
      ${renderHeartbeatStatusPanel(props.thoughtEvents, props.toolMessages, props.onOpenSidebar)}
      ${renderThoughtMonitor(props.thoughtEvents, props.onOpenSidebar)}
      ${renderThoughtHistoryPanel(props.thoughtHistory, props.sessionKey, props.onOpenSidebar)}

      ${
        props.showNewMessages
          ? html`
            <button
              class="btn chat-new-messages"
              type="button"
              @click=${props.onScrollToBottom}
            >
              New messages ${icons.arrowDown}
            </button>
          `
          : nothing
      }

      <div class="chat-compose">
        ${renderAttachmentPreview(props)}
        <div class="chat-compose__row">
          <label class="field chat-compose__field">
            <span>Message</span>
            <textarea
              ${ref((el) => el && adjustTextareaHeight(el as HTMLTextAreaElement))}
              .value=${props.draft}
              dir=${detectTextDirection(props.draft)}
              ?disabled=${!props.connected}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key !== "Enter") {
                  return;
                }
                if (e.isComposing || e.keyCode === 229) {
                  return;
                }
                if (e.shiftKey) {
                  return;
                } // Allow Shift+Enter for line breaks
                if (!props.connected) {
                  return;
                }
                e.preventDefault();
                if (canCompose) {
                  props.onSend();
                }
              }}
              @input=${(e: Event) => {
                const target = e.target as HTMLTextAreaElement;
                adjustTextareaHeight(target);
                props.onDraftChange(target.value);
              }}
              @paste=${(e: ClipboardEvent) => handlePaste(e, props)}
              placeholder=${composePlaceholder}
            ></textarea>
          </label>
          <div class="chat-compose__actions">
            ${renderMicButton({
              connected: props.connected,
              lang: "de-DE",
              onResult: (text) => {
                const current = props.draft.trim();
                const next = current ? `${current} ${text}` : text;
                props.onDraftChange(next);
              },
              onInterim: (text) => {
                // Show interim results in the draft as preview
                props.onDraftChange(text);
              },
            })}
            <button
              class="btn"
              ?disabled=${!props.connected || (!canAbort && props.sending)}
              @click=${canAbort ? props.onAbort : props.onNewSession}
            >
              ${canAbort ? "Stop" : "New session"}
            </button>
            <button
              class="btn btn--icon chat-heartbeat"
              type="button"
              ?disabled=${!props.connected || props.heartbeatTriggerRunning}
              @click=${() => props.onHeartbeatTrigger?.()}
              title=${
                props.heartbeatTriggerRunning ? "Heartbeat running..." : "Trigger heartbeat now"
              }
              aria-label=${
                props.heartbeatTriggerRunning ? "Heartbeat running" : "Trigger heartbeat now"
              }
            >
              ${
                props.heartbeatTriggerRunning
                  ? html`
                      <span class="chat-heartbeat__loading">...</span>
                    `
                  : icons.heart
              }
            </button>
            <button
              class="btn primary"
              ?disabled=${!props.connected}
              @click=${props.onSend}
            >
              ${isBusy ? "Queue" : "Send"}<kbd class="btn-kbd">↵</kbd>
            </button>
          </div>
        </div>
      </div>
      ${
        props.heartbeatTriggerMessage
          ? html`<div
              class="chat-heartbeat-status chat-heartbeat-status--${props.heartbeatTriggerMessageKind ?? "info"}"
              role="status"
              aria-live="polite"
            >
              ${props.heartbeatTriggerMessage}
            </div>`
          : nothing
      }
    </section>
  `;
}

const CHAT_HISTORY_RENDER_LIMIT = 200;

function groupMessages(items: ChatItem[]): Array<ChatItem | MessageGroup> {
  const result: Array<ChatItem | MessageGroup> = [];
  let currentGroup: MessageGroup | null = null;

  for (const item of items) {
    if (item.kind !== "message") {
      if (currentGroup) {
        result.push(currentGroup);
        currentGroup = null;
      }
      result.push(item);
      continue;
    }

    const normalized = normalizeMessage(item.message);
    const role = normalizeRoleForGrouping(normalized.role);
    const timestamp = normalized.timestamp || Date.now();

    if (!currentGroup || currentGroup.role !== role) {
      if (currentGroup) {
        result.push(currentGroup);
      }
      currentGroup = {
        kind: "group",
        key: `group:${role}:${item.key}`,
        role,
        messages: [{ message: item.message, key: item.key }],
        timestamp,
        isStreaming: false,
      };
    } else {
      currentGroup.messages.push({ message: item.message, key: item.key });
    }
  }

  if (currentGroup) {
    result.push(currentGroup);
  }
  return result;
}

function buildChatItems(props: ChatProps): Array<ChatItem | MessageGroup> {
  const items: ChatItem[] = [];
  const history = Array.isArray(props.messages) ? props.messages : [];
  const tools = Array.isArray(props.toolMessages) ? props.toolMessages : [];
  const traceLookup = buildThoughtTraceLookup(props.thoughtHistory, props.sessionKey);
  const historyStart = Math.max(0, history.length - CHAT_HISTORY_RENDER_LIMIT);
  if (historyStart > 0) {
    items.push({
      kind: "message",
      key: "chat:history:notice",
      message: {
        role: "system",
        content: `Showing last ${CHAT_HISTORY_RENDER_LIMIT} messages (${historyStart} hidden).`,
        timestamp: Date.now(),
      },
    });
  }
  for (let i = historyStart; i < history.length; i++) {
    const msg = withResolvedThoughtTrace(history[i], traceLookup);
    const normalized = normalizeMessage(msg);
    const raw = msg as Record<string, unknown>;
    const marker = raw.__openclaw as Record<string, unknown> | undefined;
    if (marker && marker.kind === "compaction") {
      items.push({
        kind: "divider",
        key:
          typeof marker.id === "string"
            ? `divider:compaction:${marker.id}`
            : `divider:compaction:${normalized.timestamp}:${i}`,
        label: "Compaction",
        timestamp: normalized.timestamp ?? Date.now(),
      });
      continue;
    }

    if (!props.showThinking && normalized.role.toLowerCase() === "toolresult") {
      continue;
    }

    items.push({
      kind: "message",
      key: messageKey(msg, i),
      message: msg,
    });
  }
  if (props.showThinking) {
    for (let i = 0; i < tools.length; i++) {
      items.push({
        kind: "message",
        key: messageKey(tools[i], i + history.length),
        message: tools[i],
      });
    }
  }

  if (props.stream !== null) {
    const key = `stream:${props.sessionKey}:${props.streamStartedAt ?? "live"}`;
    if (props.stream.trim().length > 0) {
      items.push({
        kind: "stream",
        key,
        text: props.stream,
        startedAt: props.streamStartedAt ?? Date.now(),
      });
    } else {
      items.push({ kind: "reading-indicator", key });
    }
  }

  return groupMessages(items);
}

function messageKey(message: unknown, index: number): string {
  const m = message as Record<string, unknown>;
  const toolCallId = typeof m.toolCallId === "string" ? m.toolCallId : "";
  if (toolCallId) {
    return `tool:${toolCallId}`;
  }
  const id = typeof m.id === "string" ? m.id : "";
  if (id) {
    return `msg:${id}`;
  }
  const messageId = typeof m.messageId === "string" ? m.messageId : "";
  if (messageId) {
    return `msg:${messageId}`;
  }
  const timestamp = typeof m.timestamp === "number" ? m.timestamp : null;
  const role = typeof m.role === "string" ? m.role : "unknown";
  if (timestamp != null) {
    return `msg:${role}:${timestamp}:${index}`;
  }
  return `msg:${role}:${index}`;
}
