import type { Api, Model } from "@mariozechner/pi-ai";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { BrainSubconsciousInput, BrainSubconsciousResult } from "./types.js";
import {
  createBrainSubconsciousObserverEntry,
  logBrainSubconsciousObserver,
  parseSubconsciousBrief,
  runBrainSubconsciousObserver,
} from "./subconscious.js";

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

  it("fails open when model output is not valid JSON", async () => {
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

    expect(result.status).toBe("fail_open");
    expect(result.attempted).toBe(true);
    expect(result.parseOk).toBe(false);
    expect(result.failOpen).toBe(true);
    expect(result.error).toContain("JSON");
    expect(events.map((item) => item.event)).toEqual(["START", "FAIL_OPEN"]);
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
