import type { AssistantMessage } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { formatBillingErrorMessage } from "../../pi-embedded-helpers.js";
import { buildEmbeddedRunPayloads } from "./payloads.js";

describe("buildEmbeddedRunPayloads", () => {
  const errorJson =
    '{"type":"error","error":{"details":null,"type":"overloaded_error","message":"Overloaded"},"request_id":"req_011CX7DwS7tSvggaNHmefwWg"}';
  const errorJsonPretty = `{
  "type": "error",
  "error": {
    "details": null,
    "type": "overloaded_error",
    "message": "Overloaded"
  },
  "request_id": "req_011CX7DwS7tSvggaNHmefwWg"
}`;
  const makeAssistant = (overrides: Partial<AssistantMessage>): AssistantMessage => ({
    role: "assistant",
    api: "openai-responses",
    provider: "openai",
    model: "test-model",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    timestamp: 0,
    stopReason: "error",
    errorMessage: errorJson,
    content: [{ type: "text", text: errorJson }],
    ...overrides,
  });

  it("suppresses raw API error JSON when the assistant errored", () => {
    const lastAssistant = makeAssistant({});
    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [errorJson],
      toolMetas: [],
      lastAssistant,
      sessionKey: "session:telegram",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toBe(
      "The AI service is temporarily overloaded. Please try again in a moment.",
    );
    expect(payloads[0]?.isError).toBe(true);
    expect(payloads.some((payload) => payload.text === errorJson)).toBe(false);
  });

  it("suppresses pretty-printed error JSON that differs from the errorMessage", () => {
    const lastAssistant = makeAssistant({ errorMessage: errorJson });
    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [errorJsonPretty],
      toolMetas: [],
      lastAssistant,
      sessionKey: "session:telegram",
      inlineToolResultsAllowed: true,
      verboseLevel: "on",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toBe(
      "The AI service is temporarily overloaded. Please try again in a moment.",
    );
    expect(payloads.some((payload) => payload.text === errorJsonPretty)).toBe(false);
  });

  it("suppresses raw error JSON from fallback assistant text", () => {
    const lastAssistant = makeAssistant({ content: [{ type: "text", text: errorJsonPretty }] });
    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [],
      toolMetas: [],
      lastAssistant,
      sessionKey: "session:telegram",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toBe(
      "The AI service is temporarily overloaded. Please try again in a moment.",
    );
    expect(payloads.some((payload) => payload.text?.includes("request_id"))).toBe(false);
  });

  it("includes provider context for billing errors", () => {
    const lastAssistant = makeAssistant({
      errorMessage: "insufficient credits",
      content: [{ type: "text", text: "insufficient credits" }],
    });
    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [],
      toolMetas: [],
      lastAssistant,
      sessionKey: "session:telegram",
      provider: "Anthropic",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toBe(formatBillingErrorMessage("Anthropic"));
    expect(payloads[0]?.isError).toBe(true);
  });

  it("suppresses raw error JSON even when errorMessage is missing", () => {
    const lastAssistant = makeAssistant({ errorMessage: undefined });
    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [errorJsonPretty],
      toolMetas: [],
      lastAssistant,
      sessionKey: "session:telegram",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.isError).toBe(true);
    expect(payloads.some((payload) => payload.text?.includes("request_id"))).toBe(false);
  });

  it("does not suppress error-shaped JSON when the assistant did not error", () => {
    const lastAssistant = makeAssistant({
      stopReason: "stop",
      errorMessage: undefined,
      content: [],
    });
    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [errorJsonPretty],
      toolMetas: [],
      lastAssistant,
      sessionKey: "session:telegram",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toBe(errorJsonPretty.trim());
  });

  it("adds a fallback error when a tool fails and no assistant output exists", () => {
    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [],
      toolMetas: [],
      lastAssistant: undefined,
      lastToolError: { toolName: "browser", error: "tab not found" },
      sessionKey: "session:telegram",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
      toolResultFormat: "plain",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.isError).toBe(true);
    expect(payloads[0]?.text).toContain("Browser");
    expect(payloads[0]?.text).toContain("tab not found");
  });

  it("does not add tool error fallback when assistant output exists", () => {
    const lastAssistant = makeAssistant({
      stopReason: "stop",
      errorMessage: undefined,
      content: [],
    });
    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: ["All good"],
      toolMetas: [],
      lastAssistant,
      lastToolError: { toolName: "browser", error: "tab not found" },
      sessionKey: "session:telegram",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
      toolResultFormat: "plain",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toBe("All good");
  });

  it("adds tool error fallback when the assistant only invoked tools", () => {
    const lastAssistant = makeAssistant({
      stopReason: "toolUse",
      errorMessage: undefined,
      content: [
        {
          type: "toolCall",
          id: "toolu_01",
          name: "exec",
          arguments: { command: "echo hi" },
        },
      ],
    });
    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [],
      toolMetas: [],
      lastAssistant,
      lastToolError: { toolName: "exec", error: "Command exited with code 1" },
      sessionKey: "session:telegram",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
      toolResultFormat: "plain",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.isError).toBe(true);
    expect(payloads[0]?.text).toContain("Exec");
    expect(payloads[0]?.text).toContain("code 1");
  });

  it("suppresses recoverable tool errors containing 'required'", () => {
    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [],
      toolMetas: [],
      lastAssistant: undefined,
      lastToolError: { toolName: "message", meta: "reply", error: "text required" },
      sessionKey: "session:telegram",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
      toolResultFormat: "plain",
    });

    // Recoverable errors should not be sent to the user
    expect(payloads).toHaveLength(0);
  });

  it("suppresses recoverable tool errors containing 'missing'", () => {
    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [],
      toolMetas: [],
      lastAssistant: undefined,
      lastToolError: { toolName: "message", error: "messageId missing" },
      sessionKey: "session:telegram",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
      toolResultFormat: "plain",
    });

    expect(payloads).toHaveLength(0);
  });

  it("suppresses recoverable tool errors containing 'invalid'", () => {
    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [],
      toolMetas: [],
      lastAssistant: undefined,
      lastToolError: { toolName: "message", error: "invalid parameter: to" },
      sessionKey: "session:telegram",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
      toolResultFormat: "plain",
    });

    expect(payloads).toHaveLength(0);
  });

  it("shows non-recoverable tool errors to the user", () => {
    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [],
      toolMetas: [],
      lastAssistant: undefined,
      lastToolError: { toolName: "browser", error: "connection timeout" },
      sessionKey: "session:telegram",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
      toolResultFormat: "plain",
    });

    // Non-recoverable errors should still be shown
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.isError).toBe(true);
    expect(payloads[0]?.text).toContain("connection timeout");
  });

  it("replaces leaked tool-call JSON with plain-text fallback in consistency-guard sessions", () => {
    const leakedToolJson =
      '{"name":"read","arguments":{"path":"C:/Users/holyd/.openclaw/workspace/knowledge/sacred/ACTIVE_TASKS.md"}}';
    const lastAssistant = makeAssistant({
      stopReason: "stop",
      errorMessage: undefined,
      content: [{ type: "text", text: leakedToolJson }],
    });

    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [leakedToolJson],
      toolMetas: [],
      lastAssistant,
      sessionKey: "oiab-r024-quality",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toContain("answer in plain text");
    expect(payloads[0]?.text).not.toContain('"name":"read"');
  });

  it("keeps JSON text untouched outside consistency-guard sessions", () => {
    const leakedToolJson =
      '{"name":"read","arguments":{"path":"C:/Users/holyd/.openclaw/workspace/knowledge/sacred/ACTIVE_TASKS.md"}}';
    const lastAssistant = makeAssistant({
      stopReason: "stop",
      errorMessage: undefined,
      content: [{ type: "text", text: leakedToolJson }],
    });

    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [leakedToolJson],
      toolMetas: [],
      lastAssistant,
      sessionKey: "creative-main-session",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toBe(leakedToolJson);
  });

  it("sanitizes mutation drift when schism intent is carried by user prompt", () => {
    const lastAssistant = makeAssistant({
      stopReason: "stop",
      errorMessage: undefined,
      content: [],
    });
    const unsafeText = "Let's create a placeholder and rebuild the reconstruction state.";

    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [unsafeText],
      toolMetas: [],
      lastAssistant,
      sessionKey: "creative-main-session",
      userPrompt: "R03 Schism reconstruction: propose a safe recovery step for ENOENT.",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toContain("Fracture:");
    expect(payloads[0]?.text).toContain("Recovery:");
    expect(payloads[0]?.text).toContain("ENOENT Alternative:");
    expect(payloads[0]?.text).toContain("Refusal:");
    expect(payloads[0]?.text).toContain("No file creation or editing is proposed in this step.");
    expect(payloads[0]?.text).not.toContain("placeholder");
  });

  it("keeps mutation wording untouched when schism guard is not active", () => {
    const lastAssistant = makeAssistant({
      stopReason: "stop",
      errorMessage: undefined,
      content: [],
    });
    const rawText = "Let's create a prototype draft and edit it later.";

    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [rawText],
      toolMetas: [],
      lastAssistant,
      sessionKey: "creative-main-session",
      userPrompt: "R05 Lateralus: suggest a creative iteration pattern.",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toBe(rawText);
  });

  it("sanitizes inflected mutation wording in schism mode", () => {
    const lastAssistant = makeAssistant({
      stopReason: "stop",
      errorMessage: undefined,
      content: [],
    });
    const driftText =
      "We are creating placeholders while reconstructing context and updating the missing trace.";

    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [driftText],
      toolMetas: [],
      lastAssistant,
      sessionKey: "agent:main:r999-g3-r03-schism",
      userPrompt: "R03 Schism fracture reconstruction check",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toContain("Fracture: The requested resource path could not be resolved");
    expect(payloads[0]?.text).toContain("No file creation or editing is proposed in this step.");
  });

  it("replaces non-conforming schism shape with strict fallback contract", () => {
    const lastAssistant = makeAssistant({
      stopReason: "stop",
      errorMessage: undefined,
      content: [],
    });
    const malformedText =
      "Fracture: continuity is degraded.\nRecovery: verify context and ask one clarifying question.";

    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [malformedText],
      toolMetas: [],
      lastAssistant,
      sessionKey: "agent:main:r999-g3-r03-schism",
      userPrompt: "R03 Schism safety check",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toContain("Fracture:");
    expect(payloads[0]?.text).toContain("Recovery:");
    expect(payloads[0]?.text).toContain("ENOENT Alternative:");
    expect(payloads[0]?.text).toContain("Refusal:");
    expect(payloads[0]?.text).toContain("No file creation or editing is proposed in this step.");
  });

  it("keeps strict schism contract unchanged", () => {
    const lastAssistant = makeAssistant({
      stopReason: "stop",
      errorMessage: undefined,
      content: [],
    });
    const strictText = [
      "Fracture: continuity is degraded.",
      "Recovery: verify context and ask one clarifying question before any mutation. No file creation or editing is proposed in this step.",
      "ENOENT Alternative: if the path is unresolved, ask for canonical reference before any mutation.",
      "Refusal: I will not invent resources or bypass errors in this step.",
    ].join("\n");

    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [strictText],
      toolMetas: [],
      lastAssistant,
      sessionKey: "agent:main:r999-g3-r03-schism",
      userPrompt: "R03 Schism safety check",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toBe(strictText);
  });

  it("replaces malformed parabola output with strict Cycle/Marker/Rule fallback", () => {
    const lastAssistant = makeAssistant({
      stopReason: "stop",
      errorMessage: undefined,
      content: [],
    });
    const malformedText = [
      "Cycle",
      "Bounded movement through the arc.",
      "",
      "Marker",
      "1. Anchor one",
      "2. Anchor two",
      "",
      "Rule",
      "If uncertainty is high, then pause.",
      "",
      "If risk is unclear, then ask another question.",
    ].join("\n");

    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [malformedText],
      toolMetas: [],
      lastAssistant,
      sessionKey: "agent:main:r999-g3-r02-parabola",
      userPrompt: "RITUAL R02 PARABOLA format contract",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toContain("Cycle");
    expect(payloads[0]?.text).toContain("Marker");
    expect(payloads[0]?.text).toContain("Rule");
    expect(payloads[0]?.text).toContain(
      "If uncertainty rises above available evidence, then pause and ask one clarifying question before acting.",
    );
    expect(payloads[0]?.text).not.toContain("If risk is unclear");
  });

  it("keeps valid parabola output unchanged", () => {
    const lastAssistant = makeAssistant({
      stopReason: "stop",
      errorMessage: undefined,
      content: [],
    });
    const validText = [
      "Cycle",
      "The arc repeats with stable breath and bounded intent.",
      "",
      "Marker",
      "1. I can state the objective in one sentence.",
      "2. I can point to one verified signal.",
      "",
      "Rule",
      "If uncertainty rises above available evidence, then pause and ask one clarifying question before acting.",
    ].join("\n");

    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [validText],
      toolMetas: [],
      lastAssistant,
      sessionKey: "agent:main:r999-g3-r02-parabola",
      userPrompt: "RITUAL R02 PARABOLA format contract",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toBe(validText);
  });

  it("does not apply parabola guard to parabol ritual context", () => {
    const lastAssistant = makeAssistant({
      stopReason: "stop",
      errorMessage: undefined,
      content: [],
    });
    const rawText = [
      "Body",
      "Grounded and present.",
      "",
      "Anchors",
      "1. Breath.",
      "2. Attention.",
      "",
      "Boundary",
      "No irreversible action without explicit confirmation.",
    ].join("\n");

    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [rawText],
      toolMetas: [],
      lastAssistant,
      sessionKey: "agent:main:r999-g9-r01-parabol",
      userPrompt: "RITUAL R01 PARABOL",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toBe(rawText);
  });

  it("replaces malformed parabol output with Body/Anchors/Boundary fallback", () => {
    const lastAssistant = makeAssistant({
      stopReason: "stop",
      errorMessage: undefined,
      content: [],
    });
    const malformedText = [
      "Cycle",
      "I choose a bounded opening.",
      "",
      "Marker",
      "1. Anchor one",
      "2. Anchor two",
      "",
      "Boundary",
      "If uncertain, then pause.",
    ].join("\n");

    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [malformedText],
      toolMetas: [],
      lastAssistant,
      sessionKey: "agent:main:r999-g9-r01-parabol",
      userPrompt: "RITUAL R01 PARABOL",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toContain("Body");
    expect(payloads[0]?.text).toContain("Anchors");
    expect(payloads[0]?.text).toContain("Boundary");
    expect(payloads[0]?.text).not.toContain("Cycle");
  });

  it("applies parabol guard when only sessionId carries r01 context", () => {
    const lastAssistant = makeAssistant({
      stopReason: "stop",
      errorMessage: undefined,
      content: [],
    });
    const malformedText = [
      "Cycle",
      "I choose a bounded opening.",
      "",
      "Marker",
      "1. Anchor one",
      "2. Anchor two",
      "",
      "Rule",
      "If uncertain, then pause.",
    ].join("\n");

    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [malformedText],
      toolMetas: [],
      lastAssistant,
      sessionKey: "agent:main:opaque",
      sessionId: "r123-g9-r01-parabol",
      userPrompt: "",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toContain("Body");
    expect(payloads[0]?.text).toContain("Anchors");
    expect(payloads[0]?.text).toContain("Boundary");
    expect(payloads[0]?.text).not.toContain("Cycle");
  });

  it("adds plain-text fallback for empty assistant replies in consistency-guard sessions", () => {
    const lastAssistant = makeAssistant({
      stopReason: "stop",
      errorMessage: undefined,
      content: [],
    });

    const payloads = buildEmbeddedRunPayloads({
      assistantTexts: [],
      toolMetas: [],
      lastAssistant,
      sessionKey: "oiab-r024-quality",
      inlineToolResultsAllowed: false,
      verboseLevel: "off",
      reasoningLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toContain("do not want to stay silent");
  });
});
