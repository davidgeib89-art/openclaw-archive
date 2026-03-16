import type { Api, Model } from "@mariozechner/pi-ai";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BrainSubconsciousInput, BrainSubconsciousResult } from "./types.js";
import {
  BrainState,
  buildApopheniaHint,
  calculateDynamicCFG,
  parseIntuitionPayloadFromRaw,
  runBrainSubconsciousDaemonIteration,
  buildSubconsciousContextBlock,
  createBrainSubconsciousObserverEntry,
  logBrainSubconsciousObserver,
  parseSubconsciousBrief,
  resolveBrainSubconsciousDaemonRuntimeConfig,
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

afterEach(async () => {
  await BrainState.setLatestIntuition(null);
});

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

  it("uses mercury daemon defaults when daemon env is unset", () => {
    const previousEnabled = process.env.OM_SUBCONSCIOUS_DAEMON_ENABLED;
    const previousModel = process.env.OM_SUBCONSCIOUS_DAEMON_MODEL;
    const previousInterval = process.env.OM_SUBCONSCIOUS_DAEMON_INTERVAL_MS;
    try {
      delete process.env.OM_SUBCONSCIOUS_DAEMON_ENABLED;
      delete process.env.OM_SUBCONSCIOUS_DAEMON_MODEL;
      delete process.env.OM_SUBCONSCIOUS_DAEMON_INTERVAL_MS;
      const runtime = resolveBrainSubconsciousDaemonRuntimeConfig({
        enabled: true,
      });
      expect(runtime.modelRef).toBe("inception/mercury-2");
      expect(runtime.timeoutMs).toBe(20_000);
      expect(runtime.intervalMs).toBe(144_000);
      expect(runtime.windowMinutes).toBe(20);
    } finally {
      if (typeof previousEnabled === "string") {
        process.env.OM_SUBCONSCIOUS_DAEMON_ENABLED = previousEnabled;
      } else {
        delete process.env.OM_SUBCONSCIOUS_DAEMON_ENABLED;
      }
      if (typeof previousModel === "string") {
        process.env.OM_SUBCONSCIOUS_DAEMON_MODEL = previousModel;
      } else {
        delete process.env.OM_SUBCONSCIOUS_DAEMON_MODEL;
      }
      if (typeof previousInterval === "string") {
        process.env.OM_SUBCONSCIOUS_DAEMON_INTERVAL_MS = previousInterval;
      } else {
        delete process.env.OM_SUBCONSCIOUS_DAEMON_INTERVAL_MS;
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
      "Du hast jetzt viel gelernt. Fuehle in dich hinein: Willst du das Wissen integrieren und in dir wirken lassen (TRAEUMEN/RUHE), oder treibt dich echte Neugier weiter (LERNEN)?",
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
    expect(logPath).toBe(null);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("brain subconscious apophenia hint", () => {
  it("returns null below threshold", () => {
    expect(buildApopheniaHint(3, true)).toBeNull();
  });

  it("returns null when charge is zero", () => {
    expect(buildApopheniaHint(0, true)).toBeNull();
  });

  it("returns a signal block at threshold", () => {
    const hint = buildApopheniaHint(5, true);
    expect(hint).toContain("<apophenia_signal");
  });

  it("marks low strength for charge 5", () => {
    const hint = buildApopheniaHint(5, true);
    expect(hint).toContain('strength="low"');
  });

  it("marks high strength for charge 7", () => {
    const hint = buildApopheniaHint(7, true);
    expect(hint).toContain('strength="high"');
  });

  it("returns null when not a heartbeat", () => {
    expect(buildApopheniaHint(9, false)).toBeNull();
  });

  it("supports negative charge by absolute threshold", () => {
    const hint = buildApopheniaHint(-6, true);
    expect(hint).toContain("<apophenia_signal");
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

  it("builds a narrative context block within char cap", () => {
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
    expect(block).toContain("*A deep, quiet intuition surfaces in your mind:*");
    expect(block).toContain("GGGG");
    expect(block!.length).toBeLessThanOrEqual(500);
    expect(block).not.toContain("<subconscious_context>");
    expect(block).not.toContain("</subconscious_context>");
  });

  it("keeps backward compatibility without apophenia by default", () => {
    const result: BrainSubconsciousResult = {
      status: "ok",
      attempted: true,
      parseOk: true,
      failOpen: false,
      durationMs: 120,
      timeoutMs: 8_000,
      modelRef: "openrouter/anthropic/claude-3.5-sonnet",
      brief: {
        goal: "Ruhe halten",
        risk: "low",
        mustAskUser: false,
        recommendedMode: "answer_direct",
        notes: "",
        charge: 8,
      },
    };
    const block = buildSubconsciousContextBlock(result, 500);
    expect(block).toBeTruthy();
    expect(block).not.toContain("<apophenia_signal");
  });
});

describe("brain subconscious daemon", () => {
  it("parses intuition payload from mercury prose-wrapped JSON", () => {
    const raw = [
      "Here is your intuition:",
      '{"content":"Follow the smallest reversible spark.","confidence":77,"urgency":0.66,"timestamp":1700000000123}',
      "stay curious",
    ].join("\n");

    const parsed = parseIntuitionPayloadFromRaw(raw, {
      nowMs: 1_700_000_000_000,
      dynamicCfg: 3.2,
      auraStressLevel: 0.4,
    });

    expect(parsed.mode).toBe("strict_json");
    expect(parsed.payload.content).toContain("reversible spark");
    expect(parsed.payload.confidence).toBeCloseTo(0.77, 5);
    expect(parsed.payload.urgency).toBeCloseTo(0.66, 5);
    expect(parsed.payload.timestamp).toBe(1_700_000_000_123);
    expect(parsed.payload.dynamicCfg).toBeCloseTo(3.2, 5);
    expect(parsed.payload.auraStressLevel).toBeCloseTo(0.4, 5);
  });

  it("falls back to low-salience noise intuition when JSON is broken", () => {
    const parsed = parseIntuitionPayloadFromRaw("mercury drift: {{broken", {
      nowMs: 42,
      dynamicCfg: 2.8,
      auraStressLevel: 0.7,
    });

    expect(parsed.mode).toBe("fallback_noise");
    expect(parsed.payload.content).toContain("Subconscious noise");
    expect(parsed.payload.confidence).toBeLessThan(0.2);
    expect(parsed.payload.urgency).toBeLessThan(0.2);
    expect(parsed.payload.timestamp).toBe(42);
    expect(parsed.payload.dynamicCfg).toBeCloseTo(2.8, 5);
  });

  it("maps aura stress to dynamic cfg bounds", () => {
    expect(calculateDynamicCFG(0)).toBeCloseTo(5.0, 5);
    expect(calculateDynamicCFG(1)).toBeCloseTo(2.0, 5);
    expect(calculateDynamicCFG(2)).toBeCloseTo(2.0, 5);
    expect(calculateDynamicCFG(-1)).toBeCloseTo(5.0, 5);
  });

  it("daemon iteration fail-opens and still publishes fallback intuition", async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-daemon-failopen-"));
    const result = await runBrainSubconsciousDaemonIteration({
      enabled: true,
      modelRef: "openrouter/inception/mercury",
      timeoutMs: 2_000,
      intervalMs: 20_000,
      modelResolver: () => ({ model: makeFakeModel() }),
      modelInvoker: async () => {
        throw new Error("simulated mercury outage");
      },
      workspaceDir,
    });

    expect(result.status).toBe("fail_open");
    expect(result.intuition?.content).toContain("Subconscious noise");

    const consumed = await BrainState.consumeIntuition();
    expect(consumed?.content).toContain("Subconscious noise");
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("uses instinct xml prompt shape while awake", async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-daemon-instinct-"));
    let capturedPrompt = "";
    const result = await runBrainSubconsciousDaemonIteration({
      enabled: true,
      modelRef: "openrouter/inception/mercury",
      timeoutMs: 2_000,
      intervalMs: 20_000,
      modelResolver: () => ({ model: makeFakeModel() }),
      modelInvoker: async ({ prompt }) => {
        capturedPrompt = prompt;
        return JSON.stringify({
          content:
            "<instinct><valence>-0.41</valence><arousal>0.77</arousal><heuristic_impulse>HALT</heuristic_impulse></instinct>",
          confidence: 0.7,
          urgency: 0.9,
          timestamp: 1_700_000_123_000,
        });
      },
      workspaceDir,
    });

    expect(result.status).toBe("ok");
    expect(capturedPrompt).toContain("waking spinal reflex");
    expect(capturedPrompt).toContain("<instinct>");
    expect(capturedPrompt).toContain("<heuristic_impulse>PROCEED or HALT</heuristic_impulse>");
    const consumed = await BrainState.consumeIntuition();
    expect(consumed?.content).toContain("<instinct>");
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("skips daemon iteration when defibrillator is active", async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-daemon-defib-"));
    const markerPath = path.join(workspaceDir, "logs", "brain", "defibrillator.json");
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, JSON.stringify({ remainingBeats: 2 }), "utf-8");

    const result = await runBrainSubconsciousDaemonIteration({
      enabled: true,
      workspaceDir,
    });

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("defibrillator_active");
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });
});
