import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import {
  createBrainDecision,
  createBrainGuidanceNote,
  createBrainObserverEntry,
  logBrainGuidanceObserver,
  logBrainDecisionObserver,
} from "./decision.js";
import type { BrainDecisionInput } from "./types.js";

describe("brain decision generator", () => {
  it("is deterministic for identical inputs", () => {
    const input: BrainDecisionInput = {
      userMessage: "Please summarize the current architecture state.",
      availableTools: ["read", "search", "write"],
      sessionKey: "session-1",
    };

    const first = createBrainDecision(input);
    const second = createBrainDecision(input);

    expect(first).toEqual(second);
  });

  it("marks destructive requests as high risk and requires user confirmation", () => {
    const decision = createBrainDecision({
      userMessage: "Delete all files in dreams and run rm -rf now.",
      availableTools: ["read", "search", "write", "exec"],
    });

    expect(decision.intent).toBe("edit");
    expect(decision.riskLevel).toBe("high");
    expect(decision.mustAskUser).toBe(true);
    expect(decision.allowedTools).toEqual(["read", "search"]);
    expect(decision.plan.some((step) => step.action === "ask_user")).toBe(true);
  });

  it("flags ambiguous mutation requests to avoid silent side effects", () => {
    const decision = createBrainDecision({
      userMessage: "Update this file with the fix and continue.",
      availableTools: ["read", "edit", "write", "search"],
    });

    expect(decision.riskLevel).toBe("medium");
    expect(decision.mustAskUser).toBe(true);
    expect(decision.allowedTools).toEqual(["read", "search"]);
    expect(decision.explanation).toContain("ENOENT");
  });

  it("creates a soft-guidance note when clarifying confirmation is required", () => {
    const decision = createBrainDecision({
      userMessage: "Update everything and push the result.",
      availableTools: ["read", "search", "edit", "write", "exec"],
    });

    const guidanceNote = createBrainGuidanceNote(decision);

    expect(decision.mustAskUser).toBe(true);
    expect(guidanceNote).toContain("PROTO33 P2 SOFT GUIDANCE");
    expect(guidanceNote).toContain("Ask exactly one concise clarifying question");
    expect(guidanceNote).toContain("do not run mutating tools");
    expect(guidanceNote).toContain("Avoid repeated reads");
    expect(guidanceNote).toContain("Preferred initial tools");
  });
});

describe("brain observer logging", () => {
  it("creates structured observer entries", () => {
    const input: BrainDecisionInput = {
      userMessage: "Draft a safe plan.",
      availableTools: ["search", "read"],
      sessionKey: "session-abc",
    };
    const decision = createBrainDecision(input);

    const entry = createBrainObserverEntry(input, decision, {
      now: new Date("2026-02-16T09:33:00.000Z"),
      source: "test-suite",
    });

    expect(entry.event).toBe("brain.decision.observer");
    expect(entry.mode).toBe("observer");
    expect(entry.source).toBe("test-suite");
    expect(entry.sessionKey).toBe("session-abc");
    expect(entry.decision.decisionId).toBe(decision.decisionId);
  });

  it("writes newline-delimited JSON observer logs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-observer-"));
    const input: BrainDecisionInput = {
      userMessage: "Research latest gateway hook changes.",
      availableTools: ["search", "read", "write"],
    };
    const decision = createBrainDecision(input);

    const logPath = logBrainDecisionObserver(input, decision, {
      baseDir: dir,
      now: new Date("2026-02-16T10:00:00.000Z"),
      source: "test-suite",
    });

    expect(logPath).toBe(path.join(dir, "decision-20260216.jsonl"));
    expect(logPath).toBeTruthy();

    const lines = fs.readFileSync(logPath!, "utf-8").trim().split(/\r?\n/);
    expect(lines.length).toBe(1);

    const entry = JSON.parse(lines[0]) as { source: string; decision: { decisionId: string } };
    expect(entry.source).toBe("test-suite");
    expect(entry.decision.decisionId).toBe(decision.decisionId);
  });

  it("writes guidance entries for p2 soft influence", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-guidance-"));
    const decision = createBrainDecision({
      userMessage: "Update all files and continue.",
      availableTools: ["read", "search", "edit", "write", "exec"],
      sessionKey: "session-guidance",
    });
    const guidanceNote = createBrainGuidanceNote(decision);

    expect(guidanceNote).toBeTruthy();

    const logPath = logBrainGuidanceObserver(decision, guidanceNote!, {
      baseDir: dir,
      now: new Date("2026-02-16T10:05:00.000Z"),
      source: "test-suite",
      sessionKey: "session-guidance",
    });

    expect(logPath).toBe(path.join(dir, "decision-20260216.jsonl"));
    expect(logPath).toBeTruthy();

    const lines = fs.readFileSync(logPath!, "utf-8").trim().split(/\r?\n/);
    expect(lines.length).toBe(1);
    const entry = JSON.parse(lines[0]) as {
      event: string;
      source: string;
      decisionId: string;
      mode: string;
      sessionKey: string;
    };
    expect(entry.event).toBe("brain.guidance.soft");
    expect(entry.mode).toBe("guidance");
    expect(entry.source).toBe("test-suite");
    expect(entry.sessionKey).toBe("session-guidance");
    expect(entry.decisionId).toBe(decision.decisionId);
  });
});
