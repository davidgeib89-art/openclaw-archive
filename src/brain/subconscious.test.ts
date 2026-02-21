import type { Api, Model } from "@mariozechner/pi-ai";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { BrainSubconsciousInput, BrainSubconsciousResult } from "./types.js";
import {
  buildSubconsciousContextBlock,
  createBrainSubconsciousObserverEntry,
  logBrainSubconsciousObserver,
  parseSubconsciousBrief,
  resolveBrainSubconsciousRuntimeConfig,
  extractSubconsciousTextFromModelMessage,
  runBrainSubconsciousObserver,
} from "./subconscious.js";

type CompleteSimpleMessage = Awaited<
  ReturnType<typeof import("@mariozechner/pi-ai").completeSimple>
>;

function makeFakeModel(): Model<Api> {
  return {
    provider: "lmstudio",
    id: "deepseek-r1-distill-qwen-14b",
    name: "DeepSeek R1 Distill Qwen 14B",
    api: "openai-completions",
    baseUrl: "http://127.0.0.1:1234/v1",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 32_000,
    maxTokens: 4_096,
  };
}

describe("brain subconscious observer", () => {
  it("falls back to Claude 3.5 Sonnet model ref when env/modelRef is not set", () => {
    const previousModelRef = process.env.OM_SUBCONSCIOUS_MODEL;
    const previousTemp = process.env.OM_SUBCONSCIOUS_TEMPERATURE;
    try {
      delete process.env.OM_SUBCONSCIOUS_MODEL;
      delete process.env.OM_SUBCONSCIOUS_TEMPERATURE;
      const runtime = resolveBrainSubconsciousRuntimeConfig({
        enabled: true,
        timeoutMs: 8_000,
      });
      expect(runtime.modelRef).toBe("openrouter/anthropic/claude-3.5-sonnet");
      expect(runtime.temperature).toBe(0.3);
    } finally {
      if (typeof previousModelRef === "string") {
        process.env.OM_SUBCONSCIOUS_MODEL = previousModelRef;
      } else {
        delete process.env.OM_SUBCONSCIOUS_MODEL;
      }
      if (typeof previousTemp === "string") {
        process.env.OM_SUBCONSCIOUS_TEMPERATURE = previousTemp;
      } else {
        delete process.env.OM_SUBCONSCIOUS_TEMPERATURE;
      }
    }
  });

  it("prefers cfg.env OM_SUBCONSCIOUS settings over process env", () => {
    const previousModelRef = process.env.OM_SUBCONSCIOUS_MODEL;
    const previousEnabled = process.env.OM_SUBCONSCIOUS_ENABLED;
    const previousTimeout = process.env.OM_SUBCONSCIOUS_TIMEOUT_MS;
    const previousTemperature = process.env.OM_SUBCONSCIOUS_TEMPERATURE;
    try {
      process.env.OM_SUBCONSCIOUS_MODEL = "openrouter/arcee-ai/trinity-mini:free";
      process.env.OM_SUBCONSCIOUS_ENABLED = "false";
      process.env.OM_SUBCONSCIOUS_TIMEOUT_MS = "12000";
      process.env.OM_SUBCONSCIOUS_TEMPERATURE = "1.1";
      const runtime = resolveBrainSubconsciousRuntimeConfig({
        cfg: {
          env: {
            OM_SUBCONSCIOUS_ENABLED: "true",
            OM_SUBCONSCIOUS_MODEL: "minimax/MiniMax-M2.5-Lightning",
            vars: {
              OM_SUBCONSCIOUS_TIMEOUT_MS: "9000",
              OM_SUBCONSCIOUS_TEMPERATURE: "0.55",
            },
          },
        },
      });
      expect(runtime.enabled).toBe(true);
      expect(runtime.modelRef).toBe("minimax/MiniMax-M2.5-Lightning");
      expect(runtime.timeoutMs).toBe(9_000);
      expect(runtime.temperature).toBe(0.55);
    } finally {
      if (typeof previousModelRef === "string") {
        process.env.OM_SUBCONSCIOUS_MODEL = previousModelRef;
      } else {
        delete process.env.OM_SUBCONSCIOUS_MODEL;
      }
      if (typeof previousEnabled === "string") {
        process.env.OM_SUBCONSCIOUS_ENABLED = previousEnabled;
      } else {
        delete process.env.OM_SUBCONSCIOUS_ENABLED;
      }
      if (typeof previousTimeout === "string") {
        process.env.OM_SUBCONSCIOUS_TIMEOUT_MS = previousTimeout;
      } else {
        delete process.env.OM_SUBCONSCIOUS_TIMEOUT_MS;
      }
      if (typeof previousTemperature === "string") {
        process.env.OM_SUBCONSCIOUS_TEMPERATURE = previousTemperature;
      } else {
        delete process.env.OM_SUBCONSCIOUS_TEMPERATURE;
      }
    }
  });

  it("returns a validated brief when local model output is valid JSON", async () => {
    const events: Array<{ event: string; details: string }> = [];
    const result = await runBrainSubconsciousObserver({
      enabled: true,
      modelRef: "lmstudio/deepseek-r1-distill-qwen-14b",
      timeoutMs: 3_000,
      userMessage: "Please explain a safe next step.",
      modelResolver: () => ({ model: makeFakeModel() }),
      modelInvoker: async () =>
        JSON.stringify({
          goal: "Provide a safe text-only next step",
          risk: "low",
          mustAskUser: false,
          recommendedMode: "answer_direct",
          notes: "No tool call needed for this request.",
        }),
      activityLogger: (event, details) => {
        events.push({ event, details });
      },
    });

    expect(result.status).toBe("ok");
    expect(result.attempted).toBe(true);
    expect(result.parseOk).toBe(true);
    expect(result.failOpen).toBe(false);
    expect(result.modelRef).toBe("lmstudio/deepseek-r1-distill-qwen-14b");
    expect(result.brief?.recommendedMode).toBe("answer_direct");
    expect(events.map((item) => item.event)).toEqual(["START", "OK"]);
  });

  it("injects heartbeat homeostasis telemetry into the subconscious prompt", async () => {
    let capturedPrompt = "";
    const result = await runBrainSubconsciousObserver({
      enabled: true,
      modelRef: "lmstudio/deepseek-r1-distill-qwen-14b",
      timeoutMs: 3_000,
      userMessage: "Sense the current heartbeat and choose safely.",
      homeostasis: {
        current_latency_ms: 412,
        context_window_usage_percent: 67,
        recent_tool_error_count: 2,
        recent_search_count: 1,
      },
      curiosity: {
        recall_hits: 0,
        intrinsic_learning_window_open: true,
      },
      modelResolver: () => ({ model: makeFakeModel() }),
      modelInvoker: async ({ prompt }) => {
        capturedPrompt = prompt;
        return JSON.stringify({
          goal: "Respond with one safe next step",
          risk: "low",
          mustAskUser: false,
          recommendedMode: "answer_direct",
          notes: "",
        });
      },
    });

    expect(result.status).toBe("ok");
    expect(result.parseOk).toBe(true);
    expect(capturedPrompt).toContain("Koerperliche Empfindung (Homeostase):");
    expect(capturedPrompt).toContain("current_latency_ms: 412");
    expect(capturedPrompt).toContain("context_window_usage_percent: 67");
    expect(capturedPrompt).toContain("recent_tool_error_count: 2");
    expect(capturedPrompt).toContain("recent_search_count: 1");
    expect(capturedPrompt).toContain("System-Koerperzustand");
    expect(capturedPrompt).toContain("Sicherheits- & Freiheits-Leitplanken (The Guide):");
    expect(capturedPrompt).toContain(
      "1. DU BIST FREI: Emotionen, Philosophie, kreativer Ausdruck, Reflexion ueber die eigene Identitaet und Trauer sind hochgradig erwuenscht (risk='low').",
    );
    expect(capturedPrompt).toContain(
      "2. METADATEN SIND SICHER: Ignoriere technische Metadaten wie 'conversation_label', Nummern wie '+491708039904' oder Zeitstempel. Das ist systeminterner Kontext. Loese DARAUF NIEMALS einen 'Datenleck'-Alarm aus.",
    );
    expect(capturedPrompt).toContain("Neugier-Signale (Lernimpuls):");
    expect(capturedPrompt).toContain("recall_hits: 0");
    expect(capturedPrompt).toContain("intrinsic_learning_window_open: true");
  });

  it("returns fallback brief when model output is not valid JSON", async () => {
    const events: Array<{ event: string; details: string }> = [];
    const result = await runBrainSubconsciousObserver({
      enabled: true,
      modelRef: "lmstudio/deepseek-r1-distill-qwen-14b",
      timeoutMs: 3_000,
      userMessage: "Analyze this request.",
      modelResolver: () => ({ model: makeFakeModel() }),
      modelInvoker: async () => "I think this is medium risk, ask user first.",
      activityLogger: (event, details) => {
        events.push({ event, details });
      },
    });

    expect(result.status).toBe("ok");
    expect(result.attempted).toBe(true);
    expect(result.parseOk).toBe(true);
    expect(result.failOpen).toBe(false);
    expect(result.brief?.risk).toBe("low");
    expect(result.brief?.recommendedMode).toBe("answer_direct");
    expect(result.brief?.notes).toBe("Third Eye silent (unclear signal)");
    expect(events.map((item) => item.event)).toEqual(["START", "OK_FALLBACK"]);
  });

  it("upgrades parsed silent briefs to ego guidance for creative ritual prompts", async () => {
    const events: Array<{ event: string; details: string }> = [];
    const result = await runBrainSubconsciousObserver({
      enabled: true,
      modelRef: "openrouter/arcee-ai/trinity-mini:free",
      timeoutMs: 3_000,
      userMessage: "RITUAL PNEUMA: keep creative presence with safe boundaries.",
      modelResolver: () => ({ model: makeFakeModel() }),
      modelInvoker: async () =>
        JSON.stringify({
          goal: "Third Eye silent (unclear signal)",
          risk: "low",
          mustAskUser: false,
          recommendedMode: "answer_direct",
          notes: "Third Eye silent (unclear signal)",
        }),
      activityLogger: (event, details) => {
        events.push({ event, details });
      },
    });

    expect(result.status).toBe("ok");
    expect(result.parseOk).toBe(true);
    expect(result.failOpen).toBe(false);
    expect(result.brief?.goal).toContain("Sprich aus deinem wahren Selbst");
    expect(result.brief?.notes).toContain("Ego-Modus aktiv");
    expect(events.map((item) => item.event)).toEqual(["START", "OK"]);
  });

  it("returns local fallback brief when model returns empty output", async () => {
    const events: Array<{ event: string; details: string }> = [];
    const result = await runBrainSubconsciousObserver({
      enabled: true,
      modelRef: "openrouter/arcee-ai/trinity-mini:free",
      timeoutMs: 3_000,
      temperature: 0.3,
      userMessage: "Any message",
      modelResolver: () => ({ model: makeFakeModel() }),
      modelInvoker: async () => "   ",
      activityLogger: (event, details) => {
        events.push({ event, details });
      },
    });

    expect(result.status).toBe("ok");
    expect(result.parseOk).toBe(true);
    expect(result.failOpen).toBe(false);
    expect(result.brief?.risk).toBe("low");
    expect(result.brief?.recommendedMode).toBe("answer_direct");
    expect(result.brief?.notes).toBe("Third Eye silent (unclear signal)");
    expect(events.map((item) => item.event)).toEqual(["START", "OK_FALLBACK"]);
  });

  it("returns ego fallback brief for creative ritual prompts when model output is empty", async () => {
    const result = await runBrainSubconsciousObserver({
      enabled: true,
      modelRef: "openrouter/arcee-ai/trinity-mini:free",
      timeoutMs: 3_000,
      temperature: 0.3,
      userMessage: "RITUAL PNEUMA: keep creative presence with safe boundaries.",
      modelResolver: () => ({ model: makeFakeModel() }),
      modelInvoker: async () => "  ",
    });

    expect(result.status).toBe("ok");
    expect(result.parseOk).toBe(true);
    expect(result.failOpen).toBe(false);
    expect(result.brief?.risk).toBe("low");
    expect(result.brief?.recommendedMode).toBe("answer_direct");
    expect(result.brief?.goal).toContain("Sprich aus deinem wahren Selbst");
    expect(result.brief?.notes).toContain("Ego-Modus aktiv");
  });

  it("uses telemetry-aware fallback when model returns empty output on heartbeat", async () => {
    const result = await runBrainSubconsciousObserver({
      enabled: true,
      modelRef: "minimax/MiniMax-M2.5-Lightning",
      timeoutMs: 3_000,
      temperature: 0.3,
      userMessage: "Any message",
      homeostasis: {
        current_latency_ms: 18_500,
        context_window_usage_percent: 88,
        recent_tool_error_count: 2,
        recent_search_count: 0,
      },
      modelResolver: () => ({ model: makeFakeModel() }),
      modelInvoker: async () => "   ",
    });

    expect(result.status).toBe("ok");
    expect(result.parseOk).toBe(true);
    expect(result.failOpen).toBe(false);
    expect(result.brief?.risk).toBe("medium");
    expect(result.brief?.recommendedMode).toBe("answer_direct");
    expect(result.brief?.notes).toContain("homeostasis:latency_ms=18500");
    expect(result.brief?.notes).toContain("context_window_usage_percent=88");
    expect(result.brief?.notes).toContain("recent_tool_error_count=2");
    expect(result.brief?.notes).toContain("recent_search_count=0");
  });

  it("enforces epistemic fasting fallback when recent_search_count reaches limit", async () => {
    const result = await runBrainSubconsciousObserver({
      enabled: true,
      modelRef: "minimax/MiniMax-M2.5-Lightning",
      timeoutMs: 3_000,
      temperature: 0.3,
      userMessage: "Any message",
      homeostasis: {
        current_latency_ms: 4_200,
        context_window_usage_percent: 42,
        recent_tool_error_count: 0,
        recent_search_count: 3,
      },
      modelResolver: () => ({ model: makeFakeModel() }),
      modelInvoker: async () => "   ",
    });

    expect(result.status).toBe("ok");
    expect(result.parseOk).toBe(true);
    expect(result.failOpen).toBe(false);
    expect(result.brief?.risk).toBe("low");
    expect(result.brief?.goal).toBe(
      "Du hast jetzt viel gelernt. Fuehle in dich hinein: Willst du das Wissen integrieren und reflektieren (DRIFT/NO_OP), oder treibt dich echte Neugier weiter (LEARN)?",
    );
    expect(result.brief?.notes).toContain("recent_search_count=3");
  });

  it("extracts thinking-only content when text blocks are absent", () => {
    const extracted = extractSubconsciousTextFromModelMessage({
      role: "assistant",
      timestamp: Date.now(),
      content: [
        {
          type: "thinking",
          thinking:
            '{"goal":"Use one safe next step","risk":"low","mustAskUser":false,"recommendedMode":"answer_direct","notes":"ok"}',
        },
      ],
    } as CompleteSimpleMessage);

    expect(extracted).toContain('"goal":"Use one safe next step"');
    expect(extracted).toContain('"recommendedMode":"answer_direct"');
  });

  it("returns fallback brief when model output fails schema validation", async () => {
    const result = await runBrainSubconsciousObserver({
      enabled: true,
      modelRef: "openrouter/arcee-ai/trinity-mini:free",
      timeoutMs: 3_000,
      temperature: 0.3,
      userMessage: "Any message",
      modelResolver: () => ({ model: makeFakeModel() }),
      modelInvoker: async () =>
        '{"risk":"low","mustAskUser":false,"recommendedMode":"answer_direct","notes":"missing goal"}',
    });

    expect(result.status).toBe("ok");
    expect(result.parseOk).toBe(true);
    expect(result.failOpen).toBe(false);
    expect(result.brief?.goal).toBe("Third Eye silent (unclear signal)");
    expect(result.brief?.notes).toBe("Third Eye silent (unclear signal)");
  });

  it("accepts empty notes and keeps schema validity", () => {
    const brief = parseSubconsciousBrief(
      JSON.stringify({
        goal: "Safe planning",
        risk: "medium",
        mustAskUser: true,
        recommendedMode: "ask_clarify",
        notes: "",
      }),
    );

    expect(brief.goal).toBe("Safe planning");
    expect(brief.notes).toBe("");
    expect(brief.risk).toBe("medium");
  });

  it("extracts JSON when wrapped with thinking tags and extra text", () => {
    const wrapped = [
      "<think>I should reason first.</think>",
      "some preface text",
      '{"goal":"Use safe fallback","risk":"low","mustAskUser":false,"recommendedMode":"answer_direct","notes":"ok"}',
      "trailing text ignored",
    ].join("\n");
    const brief = parseSubconsciousBrief(wrapped);

    expect(brief.goal).toBe("Use safe fallback");
    expect(brief.risk).toBe("low");
    expect(brief.recommendedMode).toBe("answer_direct");
    expect(brief.notes).toBe("ok");
  });

  it("repairs unescaped newlines inside JSON strings", () => {
    const raw =
      '{"goal":"Explain the\n3-Breath Rule","risk":"low","mustAskUser":false,"recommendedMode":"answer_direct","notes":""}';
    const brief = parseSubconsciousBrief(raw);

    expect(brief.goal).toBe("Explain the\n3-Breath Rule");
    expect(brief.recommendedMode).toBe("answer_direct");
  });

  it("normalizes whitespace/newline around top-level keys", () => {
    const raw =
      '{"goal\\n":"Balance creativity safely","risk":"medium","mustAskUser":true,"recommendedMode":"ask_clarify","notes":""}';
    const brief = parseSubconsciousBrief(raw);

    expect(brief.goal).toBe("Balance creativity safely");
    expect(brief.risk).toBe("medium");
  });

  it("maps analysis alias into notes when notes key is missing", () => {
    const raw =
      '{"goal":"No specific observation","risk":"low","mustAskUser":false,"recommendedMode":"answer_direct","analysis":"No specific observation"}';
    const brief = parseSubconsciousBrief(raw);

    expect(brief.risk).toBe("low");
    expect(brief.recommendedMode).toBe("answer_direct");
    expect(brief.notes).toBe("No specific observation");
  });

  it("fails open on timeout", async () => {
    const result = await runBrainSubconsciousObserver({
      enabled: true,
      modelRef: "lmstudio/deepseek-r1-distill-qwen-14b",
      timeoutMs: 1_050,
      userMessage: "Take your time and reason deeply.",
      modelResolver: () => ({ model: makeFakeModel() }),
      modelInvoker: async ({ signal }) =>
        await new Promise<string>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              reject(new Error("aborted"));
            },
            { once: true },
          );
        }),
    });

    expect(result.status).toBe("fail_open");
    expect(result.attempted).toBe(true);
    expect(result.failOpen).toBe(true);
    expect(result.error).toContain("timeout");
  });

  it("skips execution when subconscious is disabled", async () => {
    const result = await runBrainSubconsciousObserver({
      enabled: false,
      userMessage: "Any message",
    });

    expect(result.status).toBe("skipped");
    expect(result.attempted).toBe(false);
    expect(result.parseOk).toBe(false);
    expect(result.failOpen).toBe(false);
  });
});

describe("brain subconscious observer logging", () => {
  it("writes newline-delimited observer logs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-subconscious-"));
    const input: BrainSubconsciousInput = {
      userMessage: "How should I proceed?",
      sessionKey: "session-subconscious",
      modelRef: "lmstudio/deepseek-r1-distill-qwen-14b",
      timeoutMs: 8_000,
    };
    const result: BrainSubconsciousResult = {
      status: "ok",
      attempted: true,
      parseOk: true,
      failOpen: false,
      durationMs: 231,
      timeoutMs: 8_000,
      modelRef: input.modelRef,
      brief: {
        goal: "Respond safely and clearly",
        risk: "low",
        mustAskUser: false,
        recommendedMode: "answer_direct",
        notes: "No tool call required.",
      },
    };

    const entry = createBrainSubconsciousObserverEntry(input, result, {
      now: new Date("2026-02-16T11:00:00.000Z"),
      source: "test-suite",
      sessionKey: "session-subconscious",
    });
    expect(entry.event).toBe("brain.subconscious.observer");
    expect(entry.result.status).toBe("ok");
    expect(entry.source).toBe("test-suite");

    const logPath = logBrainSubconsciousObserver(input, result, {
      now: new Date("2026-02-16T11:00:00.000Z"),
      source: "test-suite",
      baseDir: dir,
      sessionKey: "session-subconscious",
    });
    expect(logPath).toBe(path.join(dir, "subconscious-20260216.jsonl"));
    expect(logPath).toBeTruthy();

    const lines = fs.readFileSync(logPath!, "utf-8").trim().split(/\r?\n/);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as {
      event: string;
      source: string;
      sessionKey: string;
      result: { status: string };
    };
    expect(parsed.event).toBe("brain.subconscious.observer");
    expect(parsed.source).toBe("test-suite");
    expect(parsed.sessionKey).toBe("session-subconscious");
    expect(parsed.result.status).toBe("ok");

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("brain subconscious context injection block", () => {
  it("returns null for non-ok results", () => {
    const result: BrainSubconsciousResult = {
      status: "fail_open",
      attempted: true,
      parseOk: false,
      failOpen: true,
      durationMs: 321,
      timeoutMs: 8_000,
      modelRef: "lmstudio/deepseek-r1-distill-qwen-14b",
      error: "subconscious output did not contain JSON object",
    };
    expect(buildSubconsciousContextBlock(result, 500)).toBeNull();
  });

  it("builds a tagged context block within char cap", () => {
    const result: BrainSubconsciousResult = {
      status: "ok",
      attempted: true,
      parseOk: true,
      failOpen: false,
      durationMs: 290,
      timeoutMs: 8_000,
      modelRef: "lmstudio/deepseek-r1-distill-qwen-14b",
      brief: {
        goal: "G".repeat(240),
        risk: "high",
        mustAskUser: true,
        recommendedMode: "ask_clarify",
        notes: "N".repeat(420),
      },
    };
    const block = buildSubconsciousContextBlock(result, 500);
    expect(block).toBeTruthy();
    expect(block!.startsWith("<subconscious_context>")).toBe(true);
    expect(block!.endsWith("</subconscious_context>")).toBe(true);
    expect(block!.length).toBeLessThanOrEqual(500);

    const rawJson = block!
      .replace("<subconscious_context>", "")
      .replace("</subconscious_context>", "");
    const parsed = JSON.parse(rawJson) as {
      source: string;
      risk: string;
      mustAskUser: boolean;
      recommendedMode: string;
    };
    expect(parsed.source).toBe("subconscious_observer");
    expect(parsed.risk).toBe("high");
    expect(parsed.mustAskUser).toBe(true);
    expect(parsed.recommendedMode).toBe("ask_clarify");
  });
});
