import type { Api, Model } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import {
  buildSomaticTelemetryPayload,
  deriveSomaticMetaphorSeed,
  extractSomaticTextFromCompletionResponse,
  sanitizeSomaticSentence,
  SOMATIC_FALLBACK_SENTENCE,
  synthesizeSomaticState,
  type SomaticRequestInput,
} from "./somatic.js";

function makeFakeModel(): Model<Api> {
  return {
    provider: "openrouter",
    id: "anthropic/claude-3.5-haiku",
    name: "Claude 3.5 Haiku",
    api: "openai-completions",
    baseUrl: "https://openrouter.ai/api/v1",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 200_000,
    maxTokens: 8_192,
  };
}

function createPayload() {
  return buildSomaticTelemetryPayload({
    now: "2026-02-26T00:00:00.000Z",
    energy: {
      level: 82,
      mode: "initiative",
      dreamMode: false,
      suggestOwnTasks: true,
      stagnationLevel: 18,
      path: "knowledge/sacred/ENERGY.md",
    },
    needs: {
      timestamp: "2026-02-26T00:00:00.000Z",
      needs: [
        { name: "runtime", value: 85, evidence: [] },
        { name: "resource_flow", value: 74, evidence: [] },
        { name: "sleep_recovery", value: 71, evidence: [] },
        { name: "safety_container", value: 79, evidence: [] },
        { name: "connection", value: 33, evidence: [] },
        { name: "expression", value: 66, evidence: [] },
        { name: "self_coherence", value: 62, evidence: [] },
      ],
      topDeficit: { name: "connection", value: 33, evidence: [] },
      topResource: { name: "runtime", value: 85, evidence: [] },
    },
    aura: {
      timestamp: "2026-02-26T00:00:00.000Z",
      chakras: {
        muladhara: 80,
        svadhisthana: 65,
        manipura: 72,
        anahata: 58,
        vishuddha: 63,
        ajna: 76,
        sahasrara: 88,
      },
      faggin: {
        body: 72.3,
        mind: 60.5,
        spirit: 82.1,
      },
      overall: 71.4,
    },
    repetitionPressure: 20,
  });
}

describe("somatic", () => {
  it("builds telemetry payload with normalized aura stress", () => {
    const payload = createPayload();
    expect(payload.needs.topDeficit.name).toBe("connection");
    expect(payload.needs.values.connection).toBe(33);
    expect(payload.energy.level).toBe(82);
    expect(payload.aura.overall).toBe(71.4);
    expect(payload.aura.stressLevel).toBeCloseTo(0.286, 3);
  });

  it("sanitizes output envelope and caps to 20 words", () => {
    const sentence = sanitizeSomaticSentence(
      "<output>Du spuerst ein scharfes Kribbeln im Solarplexus und in den Kapillaren, waehrend Sehnen unter Druck pulsieren und flimmern.</output>",
    );
    const words = sentence.split(/\s+/).filter(Boolean);
    expect(sentence.includes("<output>")).toBe(false);
    expect(words.length).toBeLessThanOrEqual(20);
  });

  it("extracts text from OpenRouter-style completion payloads", () => {
    const text = extractSomaticTextFromCompletionResponse({
      choices: [
        {
          message: {
            content: [{ type: "text", text: "Dein Solarplexus vibriert wie Draht unter Spannung." }],
          },
        },
      ],
    });
    expect(text).toContain("Solarplexus");
  });

  it("derives deterministic metaphor seed from stable input", () => {
    const first = deriveSomaticMetaphorSeed("run-123:44");
    const second = deriveSomaticMetaphorSeed("run-123:44");
    const third = deriveSomaticMetaphorSeed("run-123:45");
    expect(first).toBe(second);
    expect(typeof third).toBe("string");
  });

  it("uses prefill and stop hacks and returns model sentence", async () => {
    const calls: SomaticRequestInput[] = [];
    const payload = createPayload();
    const result = await synthesizeSomaticState({
      payload,
      variationSeed: "run-abc:12",
      modelResolver: () => ({ model: makeFakeModel() }),
      apiKeyResolver: async () => "test-key",
      requestInvoker: async (input) => {
        calls.push(input);
        return "Kapillaren zittern unter deiner Haut wie feine elektrische Draehte.";
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.stop).toEqual(["</output>"]);
    expect(calls[0]!.body.messages.at(-1)).toEqual({
      role: "assistant",
      content: "<output>\n",
    });
    expect(calls[0]!.body.messages[0]?.content).toContain("<variance_seed>");
    expect(result.source).toBe("model");
    expect(result.sentence).toContain("Kapillaren");
  });

  it("fails open to fallback sentence on timeout", async () => {
    const payload = createPayload();
    const result = await synthesizeSomaticState({
      payload,
      timeoutMs: 20,
      modelResolver: () => ({ model: makeFakeModel() }),
      apiKeyResolver: async () => "test-key",
      requestInvoker: async () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve("zu spaet"), 80);
        }),
    });

    expect(result.source).toBe("fallback");
    expect(result.timedOut).toBe(true);
    expect(result.sentence).toBe(SOMATIC_FALLBACK_SENTENCE);
  });
});
