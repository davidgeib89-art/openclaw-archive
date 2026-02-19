import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { updateEpisodicIndex } from "./episodic-index.js";

async function makeTmpDir(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function seedEpisodicEntries(params: { dbPath: string; now: Date }): void {
  const db = new DatabaseSync(params.dbPath);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS episodic_entries (
        entry_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        ts TEXT NOT NULL,
        score INTEGER NOT NULL,
        primary_kind TEXT NOT NULL,
        signals TEXT NOT NULL
      );
    `);

    const nowMs = params.now.getTime();
    const day = 24 * 60 * 60 * 1000;
    const insert = db.prepare(
      `INSERT INTO episodic_entries (entry_id, created_at, ts, score, primary_kind, signals)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insert.run(
      "entry-active",
      nowMs - 2 * day,
      new Date(nowMs - 2 * day).toISOString(),
      4,
      "identity",
      "identity,emotion",
    );
    insert.run(
      "entry-window",
      nowMs - 14 * day,
      new Date(nowMs - 14 * day).toISOString(),
      3,
      "goal",
      "goal",
    );
    insert.run(
      "entry-long-term",
      nowMs - 45 * day,
      new Date(nowMs - 45 * day).toISOString(),
      5,
      "decision",
      "decision,long_turn",
    );
    insert.run(
      "entry-archived",
      nowMs - 50 * day,
      new Date(nowMs - 50 * day).toISOString(),
      1,
      "general",
      "long_turn",
    );
  } finally {
    db.close();
  }
}

describe("episodic index", () => {
  const previousEnabledEnv = process.env.OM_EPISODIC_INDEX_ENABLED;
  const previousPathEnv = process.env.OM_EPISODIC_INDEX_PATH;
  const previousActiveDaysEnv = process.env.OM_EPISODIC_INDEX_ACTIVE_DAYS;
  const previousWindowDaysEnv = process.env.OM_EPISODIC_INDEX_WINDOW_DAYS;
  const previousLongTermMinScoreEnv = process.env.OM_EPISODIC_INDEX_LONG_TERM_MIN_SCORE;
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
    if (previousEnabledEnv === undefined) {
      delete process.env.OM_EPISODIC_INDEX_ENABLED;
    } else {
      process.env.OM_EPISODIC_INDEX_ENABLED = previousEnabledEnv;
    }
    if (previousPathEnv === undefined) {
      delete process.env.OM_EPISODIC_INDEX_PATH;
    } else {
      process.env.OM_EPISODIC_INDEX_PATH = previousPathEnv;
    }
    if (previousActiveDaysEnv === undefined) {
      delete process.env.OM_EPISODIC_INDEX_ACTIVE_DAYS;
    } else {
      process.env.OM_EPISODIC_INDEX_ACTIVE_DAYS = previousActiveDaysEnv;
    }
    if (previousWindowDaysEnv === undefined) {
      delete process.env.OM_EPISODIC_INDEX_WINDOW_DAYS;
    } else {
      process.env.OM_EPISODIC_INDEX_WINDOW_DAYS = previousWindowDaysEnv;
    }
    if (previousLongTermMinScoreEnv === undefined) {
      delete process.env.OM_EPISODIC_INDEX_LONG_TERM_MIN_SCORE;
    } else {
      process.env.OM_EPISODIC_INDEX_LONG_TERM_MIN_SCORE = previousLongTermMinScoreEnv;
    }
  });

  it("separates short-term and long-term candidate memories", async () => {
    tmpDir = await makeTmpDir("episodic-index-");
    const now = new Date("2026-02-19T13:30:00.000Z");
    const dbPath = path.join(tmpDir, "logs", "brain", "episodic-memory.sqlite");
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    seedEpisodicEntries({ dbPath, now });

    process.env.OM_EPISODIC_INDEX_ACTIVE_DAYS = "7";
    process.env.OM_EPISODIC_INDEX_WINDOW_DAYS = "30";
    process.env.OM_EPISODIC_INDEX_LONG_TERM_MIN_SCORE = "4";

    const result = await updateEpisodicIndex({
      workspaceDir: tmpDir,
      metadataDbPath: dbPath,
      runId: "run-index-1",
      sessionKey: "agent:main:main",
      now,
    });

    expect(result.updated).toBe(true);
    expect(result.reason).toBe("updated");
    expect(result.counts.evaluated).toBe(4);
    expect(result.counts.shortTermActive).toBe(1);
    expect(result.counts.shortTermWindow).toBe(1);
    expect(result.counts.longTermCandidates).toBe(1);
    expect(result.counts.archived).toBe(1);

    const raw = await fs.readFile(result.path, "utf-8");
    expect(raw).toContain("# EPISODIC INDEX");
    expect(raw).toContain("## Short-Term Active (0-7 days)");
    expect(raw).toContain("## Short-Term Window (8-30 days)");
    expect(raw).toContain("## Long-Term Candidates (> 30 days and score >= 4)");
    expect(raw).toContain("entry=entry-active");
    expect(raw).toContain("entry=entry-window");
    expect(raw).toContain("entry=entry-long-term");
    expect(raw).not.toContain("entry=entry-archived");
  });

  it("returns disabled snapshot when index is turned off", async () => {
    tmpDir = await makeTmpDir("episodic-index-");
    process.env.OM_EPISODIC_INDEX_ENABLED = "false";

    const result = await updateEpisodicIndex({
      workspaceDir: tmpDir,
      metadataDbPath: path.join(tmpDir, "logs", "brain", "episodic-memory.sqlite"),
      runId: "run-index-2",
      now: new Date("2026-02-19T13:30:00.000Z"),
    });

    expect(result.updated).toBe(false);
    expect(result.reason).toBe("disabled");
  });
});
