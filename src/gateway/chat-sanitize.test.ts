import { describe, expect, test } from "vitest";
import { stripEnvelopeFromMessage } from "./chat-sanitize.js";

describe("stripEnvelopeFromMessage", () => {
  test("removes message_id hint lines from user messages", () => {
    const input = {
      role: "user",
      content: "[WhatsApp 2026-01-24 13:36] yolo\n[message_id: 7b8b]",
    };
    const result = stripEnvelopeFromMessage(input) as { content?: string };
    expect(result.content).toBe("yolo");
  });

  test("removes message_id hint lines from text content arrays", () => {
    const input = {
      role: "user",
      content: [{ type: "text", text: "hi\n[message_id: abc123]" }],
    };
    const result = stripEnvelopeFromMessage(input) as {
      content?: Array<{ type: string; text?: string }>;
    };
    expect(result.content?.[0]?.text).toBe("hi");
  });

  test("does not strip inline message_id text that is part of a line", () => {
    const input = {
      role: "user",
      content: "I typed [message_id: 123] on purpose",
    };
    const result = stripEnvelopeFromMessage(input) as { content?: string };
    expect(result.content).toBe("I typed [message_id: 123] on purpose");
  });

  test("does not strip assistant messages", () => {
    const input = {
      role: "assistant",
      content: "note\n[message_id: 123]",
    };
    const result = stripEnvelopeFromMessage(input) as { content?: string };
    expect(result.content).toBe("note\n[message_id: 123]");
  });

  test("extracts original user message from injected recall scaffolding", () => {
    const input = {
      role: "user",
      content:
        '<subconscious_context>{"status":"ok"}</subconscious_context>\n\n' +
        "Hier ist relevantes Wissen aus deiner Vergangenheit (Top-3, read-only):\n" +
        "1. foo\n2. bar\n" +
        "Nutze diese Erinnerungen als Kontext fuer die aktuelle Anfrage.\n\n" +
        "Hi Om, sag mir kurz wer du bist.",
    };
    const result = stripEnvelopeFromMessage(input) as { content?: string };
    expect(result.content).toBe("Hi Om, sag mir kurz wer du bist.");
  });

  test("keeps only current message after history marker", () => {
    const input = {
      role: "user",
      content:
        "[Chat messages since your last reply - for context]\n" +
        "User: old\n\n" +
        "[Current message - respond to this]\n" +
        "This is the real message.",
    };
    const result = stripEnvelopeFromMessage(input) as { content?: string };
    expect(result.content).toBe("This is the real message.");
  });
});
