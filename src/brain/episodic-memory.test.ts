import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { appendBrainEpisodicJournal } from "./episodic-memory.js";

async function makeTmpDir(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function makeCfg(): OpenClawConfig {
  return {
    agents: {
      defaults: {
        memorySearch: {
          enabled: true,
        },
      },
    },
  } as OpenClawConfig;
}

function makeCfgWithAgentOverride(): OpenClawConfig {
  return {
    agents: {
      defaults: {
        memorySearch: {
          enabled: false,
        },
      },
      list: [
        {
          id: "main",
          memorySearch: {
            enabled: true,
          },
        },
      ],
    },
  } as OpenClawConfig;
}

describe("brain episodic memory write path", () => {
  const previousWriteEnv = process.env.OM_EPISODIC_WRITE_ENABLED;
  const previousJournalPathEnv = process.env.OM_EPISODIC_JOURNAL_PATH;
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
    if (previousWriteEnv === undefined) {
      delete process.env.OM_EPISODIC_WRITE_ENABLED;
    } else {
      process.env.OM_EPISODIC_WRITE_ENABLED = previousWriteEnv;
    }
    if (previousJournalPathEnv === undefined) {
      delete process.env.OM_EPISODIC_JOURNAL_PATH;
    } else {
      process.env.OM_EPISODIC_JOURNAL_PATH = previousJournalPathEnv;
    }
  });

  it("persists significant turns into append-only episodic journal", async () => {
    tmpDir = await makeTmpDir("episodic-journal-");
    delete process.env.OM_EPISODIC_WRITE_ENABLED;
    delete process.env.OM_EPISODIC_JOURNAL_PATH;

    const result = await appendBrainEpisodicJournal({
      cfg: makeCfg(),
      workspaceDir: tmpDir,
      runId: "run-ep-1",
      sessionKey: "agent:main:main",
      userMessage: "I prefer ambient music while coding. Please remember this for future sessions.",
      assistantMessage:
        "I choose to honor that preference because it supports focus. Next step: I will use it in future creative suggestions.",
      now: () => new Date("2026-02-17T08:00:00.000Z"),
    });

    expect(result.persisted).toBe(true);
    expect(result.reason).toBe("persisted");
    expect(result.score).toBeGreaterThanOrEqual(2);
    expect(result.path.endsWith(path.join("memory", "EPISODIC_JOURNAL.md"))).toBe(true);

    const journal = await fs.readFile(result.path, "utf-8");
    expect(journal).toContain("# EPISODIC JOURNAL");
    expect(journal).toContain("run=run-ep-1");
    expect(journal).toContain("signals:");
    expect(journal).toContain("user: I prefer ambient music while coding.");
    expect(journal).toContain("assistant: I choose to honor that preference because it supports focus.");
  });

  it("skips low-signal turns below significance threshold", async () => {
    tmpDir = await makeTmpDir("episodic-journal-");
    delete process.env.OM_EPISODIC_WRITE_ENABLED;
    delete process.env.OM_EPISODIC_JOURNAL_PATH;

    const result = await appendBrainEpisodicJournal({
      cfg: makeCfg(),
      workspaceDir: tmpDir,
      runId: "run-ep-2",
      sessionKey: "agent:main:main",
      userMessage: "ok",
      assistantMessage: "done",
      now: () => new Date("2026-02-17T08:01:00.000Z"),
    });

    expect(result.persisted).toBe(false);
    expect(result.reason).toBe("below-threshold");
    await expect(fs.access(result.path)).rejects.toThrow();
  });

  it("skips heartbeat turns", async () => {
    tmpDir = await makeTmpDir("episodic-journal-");

    const result = await appendBrainEpisodicJournal({
      cfg: makeCfg(),
      workspaceDir: tmpDir,
      runId: "run-ep-3",
      sessionKey: "agent:main:main",
      userMessage:
        "Read HEARTBEAT.md if it exists. If nothing needs attention, reply HEARTBEAT_OK.",
      assistantMessage: "HEARTBEAT_OK",
      now: () => new Date("2026-02-17T08:02:00.000Z"),
    });

    expect(result.persisted).toBe(false);
    expect(result.reason).toBe("heartbeat-turn");
  });

  it("honors explicit env disable", async () => {
    tmpDir = await makeTmpDir("episodic-journal-");
    process.env.OM_EPISODIC_WRITE_ENABLED = "false";

    const result = await appendBrainEpisodicJournal({
      cfg: makeCfg(),
      workspaceDir: tmpDir,
      runId: "run-ep-4",
      sessionKey: "agent:main:main",
      userMessage: "I like this project roadmap.",
      assistantMessage: "I choose to continue with the same roadmap.",
      now: () => new Date("2026-02-17T08:03:00.000Z"),
    });

    expect(result.persisted).toBe(false);
    expect(result.reason).toBe("disabled");
  });

  it("uses effective memory config with agent override", async () => {
    tmpDir = await makeTmpDir("episodic-journal-");
    delete process.env.OM_EPISODIC_WRITE_ENABLED;

    const result = await appendBrainEpisodicJournal({
      cfg: makeCfgWithAgentOverride(),
      agentId: "main",
      workspaceDir: tmpDir,
      runId: "run-ep-5",
      sessionKey: "agent:main:main",
      userMessage: "I prefer clear creative rules for this project.",
      assistantMessage: "I choose to keep one explicit rule and one explicit risk check.",
      now: () => new Date("2026-02-17T08:04:00.000Z"),
    });

    expect(result.persisted).toBe(true);
    expect(result.reason).toBe("persisted");
  });
});
