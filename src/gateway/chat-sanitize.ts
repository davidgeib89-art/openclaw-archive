const ENVELOPE_PREFIX = /^\[([^\]]+)\]\s*/;
const ENVELOPE_CHANNELS = [
  "WebChat",
  "WhatsApp",
  "Telegram",
  "Signal",
  "Slack",
  "Discord",
  "Google Chat",
  "iMessage",
  "Teams",
  "Matrix",
  "Zalo",
  "Zalo Personal",
  "BlueBubbles",
];

const MESSAGE_ID_LINE = /^\s*\[message_id:\s*[^\]]+\]\s*$/i;
const CURRENT_MESSAGE_MARKER = "[Current message - respond to this]";
const RECALL_CONTEXT_ANCHOR_RE =
  /Nutze diese Erinnerungen als Kontext f(?:ue|\\u00fc)r die aktuelle Anfrage\./gi;
const INTERNAL_PROMPT_HINT_RE =
  /<subconscious_context>|<brain_output_contract>|<dream_context>|<autonomous_cycle>|Wisdom Layer \(read-only advisory, suggestions only\):|Hier ist relevantes Wissen aus deiner Vergangenheit \(Top-3, read-only\):/i;
const INTERNAL_PROMPT_STRIP_PATTERNS: readonly RegExp[] = [
  /<subconscious_context>[\s\S]*?<\/subconscious_context>\s*/gi,
  /<brain_output_contract>[\s\S]*?<\/brain_output_contract>\s*/gi,
  /<dream_context>[\s\S]*?<\/dream_context>\s*/gi,
  /<autonomous_cycle>[\s\S]*?<\/autonomous_cycle>\s*/gi,
  /<safety_directive>[\s\S]*?<\/safety_directive>\s*/gi,
  /Conversation info \(untrusted metadata\):\s*```json[\s\S]*?```\s*/gi,
  /Hier ist relevantes Wissen aus deiner Vergangenheit \(Top-3, read-only\):[\s\S]*?Nutze diese Erinnerungen als Kontext f(?:ue|\\u00fc)r die aktuelle Anfrage\.\s*/gi,
  /Wisdom Layer \(read-only advisory, suggestions only\):[\s\S]*?Nutze diese Erinnerungen als Kontext f(?:ue|\\u00fc)r die aktuelle Anfrage\.\s*/gi,
];

function looksLikeEnvelopeHeader(header: string): boolean {
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z\b/.test(header)) {
    return true;
  }
  if (/\d{4}-\d{2}-\d{2} \d{2}:\d{2}\b/.test(header)) {
    return true;
  }
  return ENVELOPE_CHANNELS.some((label) => header.startsWith(`${label} `));
}

export function stripEnvelope(text: string): string {
  const match = text.match(ENVELOPE_PREFIX);
  if (!match) {
    return text;
  }
  const header = match[1] ?? "";
  if (!looksLikeEnvelopeHeader(header)) {
    return text;
  }
  return text.slice(match[0].length);
}

function stripMessageIdHints(text: string): string {
  if (!text.includes("[message_id:")) {
    return text;
  }
  const lines = text.split(/\r?\n/);
  const filtered = lines.filter((line) => !MESSAGE_ID_LINE.test(line));
  return filtered.length === lines.length ? text : filtered.join("\n");
}

function stripInternalPromptScaffolding(text: string): string {
  let next = text;

  // Preserve only the message tail when history wrappers are present.
  const markerIndex = next.lastIndexOf(CURRENT_MESSAGE_MARKER);
  if (markerIndex >= 0) {
    next = next.slice(markerIndex + CURRENT_MESSAGE_MARKER.length).trimStart();
  }

  // If we see prompt-injection hints, keep only the segment after the last
  // explicit recall anchor.
  if (INTERNAL_PROMPT_HINT_RE.test(next)) {
    let anchorMatch: RegExpExecArray | null;
    let lastAnchorEnd = -1;
    RECALL_CONTEXT_ANCHOR_RE.lastIndex = 0;
    while ((anchorMatch = RECALL_CONTEXT_ANCHOR_RE.exec(next)) !== null) {
      lastAnchorEnd = anchorMatch.index + anchorMatch[0].length;
    }
    if (lastAnchorEnd >= 0) {
      next = next.slice(lastAnchorEnd).trimStart();
    }
  }

  for (const pattern of INTERNAL_PROMPT_STRIP_PATTERNS) {
    next = next.replace(pattern, "");
  }

  return next.trim();
}

function sanitizeUserFacingUserText(text: string): string {
  const base = stripMessageIdHints(stripEnvelope(text)).trim();
  if (!base) {
    return base;
  }
  const stripped = stripInternalPromptScaffolding(base);
  // Fail-open: never blank out a message.
  return stripped || base;
}

function stripEnvelopeFromContent(content: unknown[]): { content: unknown[]; changed: boolean } {
  let changed = false;
  const next = content.map((item) => {
    if (!item || typeof item !== "object") {
      return item;
    }
    const entry = item as Record<string, unknown>;
    if (entry.type !== "text" || typeof entry.text !== "string") {
      return item;
    }
    const stripped = sanitizeUserFacingUserText(entry.text);
    if (stripped === entry.text) {
      return item;
    }
    changed = true;
    return {
      ...entry,
      text: stripped,
    };
  });
  return { content: next, changed };
}

export function stripEnvelopeFromMessage(message: unknown): unknown {
  if (!message || typeof message !== "object") {
    return message;
  }
  const entry = message as Record<string, unknown>;
  const role = typeof entry.role === "string" ? entry.role.toLowerCase() : "";
  if (role !== "user") {
    return message;
  }

  let changed = false;
  const next: Record<string, unknown> = { ...entry };

  if (typeof entry.content === "string") {
    const stripped = sanitizeUserFacingUserText(entry.content);
    if (stripped !== entry.content) {
      next.content = stripped;
      changed = true;
    }
  } else if (Array.isArray(entry.content)) {
    const updated = stripEnvelopeFromContent(entry.content);
    if (updated.changed) {
      next.content = updated.content;
      changed = true;
    }
  } else if (typeof entry.text === "string") {
    const stripped = sanitizeUserFacingUserText(entry.text);
    if (stripped !== entry.text) {
      next.text = stripped;
      changed = true;
    }
  }

  return changed ? next : message;
}

export function stripEnvelopeFromMessages(messages: unknown[]): unknown[] {
  if (messages.length === 0) {
    return messages;
  }
  let changed = false;
  
  const filtered = messages.filter((message) => {
    if (!message || typeof message !== "object") {
      return true;
    }
    const entry = message as Record<string, unknown>;
    const role = typeof entry.role === "string" ? entry.role.toLowerCase() : "";
    
    // Hide trailing heartbeat ok tokens that leaked into the assistant's context history
    if (role === "assistant") {
      let text = "";
      if (typeof entry.content === "string") {
        text = entry.content;
      } else if (Array.isArray(entry.content)) {
        text = entry.content
          .filter((c: any) => c && typeof c === "object" && c.type === "text")
          .map((c: any) => typeof c.text === "string" ? c.text : "")
          .join("");
      } else if (typeof entry.text === "string") {
        text = entry.text;
      }
      
      const hasToolCalls = Array.isArray(entry.content) && entry.content.some((c: any) => 
        c && typeof c === "object" && (c.type === "tool_call" || c.type === "tooluse" || typeof c.name === "string")
      );
      
      if (!hasToolCalls && text.trim() === "HEARTBEAT_OK") {
        changed = true;
        return false;
      }
    }
    return true;
  });

  const next = filtered.map((message) => {
    const stripped = stripEnvelopeFromMessage(message);
    if (stripped !== message) {
      changed = true;
    }
    return stripped;
  });
  return changed ? next : messages;
}
