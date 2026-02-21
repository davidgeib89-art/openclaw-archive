import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { AssistantIdentity } from "../assistant-identity.ts";
import { icons } from "../icons.ts";
import type { MessageGroup } from "../types/chat-types.ts";
import { toSanitizedMarkdownHtml } from "../markdown.ts";
import { detectTextDirection } from "../text-direction.ts";
import { renderCopyAsMarkdownButton } from "./copy-as-markdown.ts";
import {
  extractTextCached,
  extractThinkingCached,
  formatReasoningMarkdown,
} from "./message-extract.ts";
import {
  coerceMessageTimestamp,
  isToolResultMessage,
  normalizeRoleForGrouping,
} from "./message-normalizer.ts";
import { extractToolCards, renderToolCardSidebar } from "./tool-cards.ts";
import { renderTtsButton, requestAutoTts, renderInlineAudioPlayer } from "./voice-ui.ts";

type ImageBlock = {
  url: string;
  alt?: string;
};

type ThoughtTraceStep = {
  seq: number;
  ts: number;
  label: string;
  phase?: string;
  risk?: string;
  stream: "reasoning" | "reply";
  summary: string;
  detail?: string;
};

type ThoughtTraceAttachment = {
  version: 1;
  runId: string;
  sessionKey?: string;
  capturedAt: number;
  stepCount: number;
  steps: ThoughtTraceStep[];
};

function extractThoughtTrace(message: unknown): ThoughtTraceAttachment | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const marker = (message as Record<string, unknown>).__openclaw;
  if (!marker || typeof marker !== "object") {
    return null;
  }
  const trace = (marker as Record<string, unknown>).thoughtTrace;
  if (!trace || typeof trace !== "object") {
    return null;
  }
  const record = trace as Record<string, unknown>;
  if (record.version !== 1) {
    return null;
  }
  if (typeof record.runId !== "string" || !Array.isArray(record.steps)) {
    return null;
  }
  return record as unknown as ThoughtTraceAttachment;
}

function formatTraceTime(ts: number): string {
  if (!Number.isFinite(ts)) {
    return "n/a";
  }
  return new Date(ts).toISOString();
}

function formatThoughtTraceSidebar(trace: ThoughtTraceAttachment): string {
  const lines: string[] = [
    "## Thought Trace",
    "",
    `- runId: \`${trace.runId}\``,
    trace.sessionKey ? `- sessionKey: \`${trace.sessionKey}\`` : "",
    `- capturedAt: \`${new Date(trace.capturedAt).toISOString()}\``,
    `- steps: \`${trace.stepCount}\``,
    "",
  ];

  trace.steps.forEach((step, index) => {
    lines.push(`### ${index + 1}. ${step.label}`);
    lines.push(`- stream: \`${step.stream}\``);
    lines.push(`- seq: \`${step.seq}\``);
    lines.push(`- time: \`${formatTraceTime(step.ts)}\``);
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

  return lines.filter((line) => line.length > 0).join("\n");
}

function extractImages(message: unknown): ImageBlock[] {
  const m = message as Record<string, unknown>;
  const content = m.content;
  const images: ImageBlock[] = [];

  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block !== "object" || block === null) {
        continue;
      }
      const b = block as Record<string, unknown>;

      if (b.type === "image") {
        // Handle source object format (from sendChatMessage)
        const source = b.source as Record<string, unknown> | undefined;
        if (source?.type === "base64" && typeof source.data === "string") {
          const data = source.data;
          const mediaType = (source.media_type as string) || "image/png";
          // If data is already a data URL, use it directly
          const url = data.startsWith("data:") ? data : `data:${mediaType};base64,${data}`;
          images.push({ url });
        } else if (typeof b.url === "string") {
          images.push({ url: b.url });
        }
      } else if (b.type === "image_url") {
        // OpenAI format
        const imageUrl = b.image_url as Record<string, unknown> | undefined;
        if (typeof imageUrl?.url === "string") {
          images.push({ url: imageUrl.url });
        }
      }
    }
  }

  return images;
}

export function renderReadingIndicatorGroup(assistant?: AssistantIdentity) {
  return html`
    <div class="chat-group assistant">
      ${renderAvatar("assistant", assistant)}
      <div class="chat-group-messages">
        <div class="chat-bubble chat-reading-indicator" aria-hidden="true">
          <span class="chat-reading-indicator__dots">
            <span></span><span></span><span></span>
          </span>
        </div>
      </div>
    </div>
  `;
}

export function renderStreamingGroup(
  text: string,
  startedAt: number,
  onOpenSidebar?: (content: string) => void,
  assistant?: AssistantIdentity,
) {
  const timestamp = new Date(startedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const name = assistant?.name ?? "Assistant";

  return html`
    <div class="chat-group assistant">
      ${renderAvatar("assistant", assistant)}
      <div class="chat-group-messages">
        ${renderGroupedMessage(
          {
            role: "assistant",
            content: [{ type: "text", text }],
            timestamp: startedAt,
          },
          { isStreaming: true, showReasoning: false },
          onOpenSidebar,
        )}
        <div class="chat-group-footer">
          <span class="chat-sender-name">${name}</span>
          <span class="chat-group-timestamp">${timestamp}</span>
        </div>
      </div>
    </div>
  `;
}

export function renderMessageGroup(
  group: MessageGroup,
  opts: {
    onOpenSidebar?: (content: string) => void;
    showReasoning: boolean;
    assistantName?: string;
    assistantAvatar?: string | null;
  },
) {
  const normalizedRole = normalizeRoleForGrouping(group.role);
  const assistantName = opts.assistantName ?? "Assistant";
  const who =
    normalizedRole === "user"
      ? "You"
      : normalizedRole === "assistant"
        ? assistantName
        : normalizedRole;
  const roleClass =
    normalizedRole === "user" ? "user" : normalizedRole === "assistant" ? "assistant" : "other";
  const timestamp = new Date(group.timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return html`
    <div class="chat-group ${roleClass}">
      ${renderAvatar(group.role, {
        name: assistantName,
        avatar: opts.assistantAvatar ?? null,
      })}
      <div class="chat-group-messages">
        ${group.messages.map((item, index) =>
          renderGroupedMessage(
            item.message,
            {
              isStreaming: group.isStreaming && index === group.messages.length - 1,
              showReasoning: opts.showReasoning,
            },
            opts.onOpenSidebar,
          ),
        )}
        <div class="chat-group-footer">
          <span class="chat-sender-name">${who}</span>
          <span class="chat-group-timestamp">${timestamp}</span>
        </div>
      </div>
    </div>
  `;
}

function renderAvatar(role: string, assistant?: Pick<AssistantIdentity, "name" | "avatar">) {
  const normalized = normalizeRoleForGrouping(role);
  const assistantName = assistant?.name?.trim() || "Assistant";
  const assistantAvatar = assistant?.avatar?.trim() || "";
  const initial =
    normalized === "user"
      ? "U"
      : normalized === "assistant"
        ? assistantName.charAt(0).toUpperCase() || "A"
        : normalized === "tool"
          ? "⚙"
          : "?";
  const className =
    normalized === "user"
      ? "user"
      : normalized === "assistant"
        ? "assistant"
        : normalized === "tool"
          ? "tool"
          : "other";

  if (assistantAvatar && normalized === "assistant") {
    if (isAvatarUrl(assistantAvatar)) {
      return html`<img
        class="chat-avatar ${className}"
        src="${assistantAvatar}"
        alt="${assistantName}"
      />`;
    }
    return html`<div class="chat-avatar ${className}">${assistantAvatar}</div>`;
  }

  return html`<div class="chat-avatar ${className}">${initial}</div>`;
}

function isAvatarUrl(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) || /^data:image\//i.test(value) || value.startsWith("/") // Relative paths from avatar endpoint
  );
}

function renderMessageImages(images: ImageBlock[]) {
  if (images.length === 0) {
    return nothing;
  }

  return html`
    <div class="chat-message-images">
      ${images.map(
        (img) => html`
          <img
            src=${img.url}
            alt=${img.alt ?? "Attached image"}
            class="chat-message-image"
            @click=${() => window.open(img.url, "_blank")}
          />
        `,
      )}
    </div>
  `;
}

function renderGroupedMessage(
  message: unknown,
  opts: { isStreaming: boolean; showReasoning: boolean },
  onOpenSidebar?: (content: string) => void,
) {
  const m = message as Record<string, unknown>;
  const role = typeof m.role === "string" ? m.role : "unknown";
  const isToolResult =
    isToolResultMessage(message) ||
    role.toLowerCase() === "toolresult" ||
    role.toLowerCase() === "tool_result" ||
    typeof m.toolCallId === "string" ||
    typeof m.tool_call_id === "string";

  const toolCards = extractToolCards(message);
  const hasToolCards = toolCards.length > 0;
  const images = extractImages(message);
  const hasImages = images.length > 0;

  const extractedText = extractTextCached(message);
  const extractedThinking =
    opts.showReasoning && role === "assistant" ? extractThinkingCached(message) : null;
  const markdownBase = extractedText?.trim() ? extractedText : null;
  const reasoningMarkdown = extractedThinking ? formatReasoningMarkdown(extractedThinking) : null;
  const markdown = markdownBase;
  const thoughtTrace = role === "assistant" ? extractThoughtTrace(message) : null;
  const canCopyMarkdown = role === "assistant" && Boolean(markdown?.trim());
  const canPlayTts = role === "assistant" && Boolean(markdown?.trim()) && !opts.isStreaming;
  const canOpenTrace = role === "assistant" && Boolean(thoughtTrace) && Boolean(onOpenSidebar);
  // Build a stable key for TTS state tracking
  const resolvedTimestamp = coerceMessageTimestamp(m.timestamp);
  const ttsKey = `tts:${resolvedTimestamp ?? "no-ts"}:${(markdown ?? "").length}`;
  const msgTimestamp = resolvedTimestamp ?? 0;

  // Trigger auto-TTS for new assistant messages (idempotent)
  if (canPlayTts && markdown) {
    requestAutoTts(markdown, ttsKey, msgTimestamp);
  }

  const bubbleClasses = [
    "chat-bubble",
    canCopyMarkdown ? "has-copy" : "",
    opts.isStreaming ? "streaming" : "",
    "fade-in",
  ]
    .filter(Boolean)
    .join(" ");

  if (!markdown && hasToolCards && isToolResult) {
    return html`${toolCards.map((card) => renderToolCardSidebar(card, onOpenSidebar))}`;
  }

  if (!markdown && !hasToolCards && !hasImages) {
    return nothing;
  }

  return html`
    <div class="${bubbleClasses}">
      <div class="chat-bubble-actions">
        ${
          canOpenTrace
            ? html`<button
                class="chat-trace-btn"
                type="button"
                title="View thought trace"
                @click=${() => onOpenSidebar?.(formatThoughtTraceSidebar(thoughtTrace!))}
              >
                ${icons.brain}
              </button>`
            : nothing
        }
        ${canPlayTts ? renderTtsButton(markdown!, ttsKey) : nothing}
        ${canCopyMarkdown ? renderCopyAsMarkdownButton(markdown!) : nothing}
      </div>
      ${renderMessageImages(images)}
      ${
        reasoningMarkdown
          ? html`<div class="chat-thinking">${unsafeHTML(
              toSanitizedMarkdownHtml(reasoningMarkdown),
            )}</div>`
          : nothing
      }
      ${
        markdown
          ? html`<div class="chat-text" dir="${detectTextDirection(markdown)}">${unsafeHTML(toSanitizedMarkdownHtml(markdown))}</div>`
          : nothing
      }
      ${canPlayTts ? renderInlineAudioPlayer(ttsKey) : nothing}
      ${toolCards.map((card) => renderToolCardSidebar(card, onOpenSidebar))}
    </div>
  `;
}
