import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateForgettingScore, runActiveForgetting } from "./forgetting.js";

async function makeTmpDir(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("active forgetting score", () => {
  it("increases forgetting pressure as memories age", () => {
    const recent = evaluateForgettingScore({
      ageDays: 1,
      frequencyCount: 0,
      emotionValue: 0.1,
    });
    const older = evaluateForgettingScore({
      ageDays: 40,
      frequencyCount: 0,
      emotionValue: 0.1,
    });

    expect(older.forgettingScore).toBeGreaterThan(recent.forgettingScore);
  });

  it("protects high-frequency and emotional memories from forgetting", () => {
    const lowSignal = evaluateForgettingScore({
      ageDays: 12,
      frequencyCount: 0,
      emotionValue: 0.1,
    });
    const highSignal = evaluateForgettingScore({
      ageDays: 12,
      frequencyCount: 7,
      emotionValue: 1,
    });

    expect(highSignal.forgettingScore).toBeLessThan(lowSignal.forgettingScore);
  });
});

describe("active forgetting repression", () => {
  const previousEnabledEnv = process.env.OM_ACTIVE_FORGETTING_ENABLED;
  const previousWindowEnv = process.env.OM_ACTIVE_FORGETTING_OBSERVATION_HOURS;
  const previousThresholdEnv = process.env.OM_ACTIVE_FORGETTING_THRESHOLD;
  const previousScanEnv = process.env.OM_ACTIVE_FORGETTING_MAX_SCAN_ROWS;
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
    if (previousEnabledEnv === undefined) {
      delete process.env.OM_ACTIVE_FORGETTING_ENABLED;
    } else {
      process.env.OM_ACTIVE_FORGETTING_ENABLED = previousEnabledEnv;
    }
    if (previousWindowEnv === undefined) {
      delete process.env.OM_ACTIVE_FORGETTING_OBSERVATION_HOURS;
    } else {
      process.env.OM_ACTIVE_FORGETTING_OBSERVATION_HOURS = previousWindowEnv;
    }
    if (previousThresholdEnv === undefined) {
      delete process.env.OM_ACTIVE_FORGETTING_THRESHOLD;
    } else {
      process.env.OM_ACTIVE_FORGETTING_THRESHOLD = previousThresholdEnv;
    }
    if (previousScanEnv === undefined) {
      delete process.env.OM_ACTIVE_FORGETTING_MAX_SCAN_ROWS;
    } else {
      process.env.OM_ACTIVE_FORGETTING_MAX_SCAN_ROWS = previousScanEnv;
    }
  });

  it("updates candidates into repressed state without deleting rows", async () => {
    tmpDir = await makeTmpDir("active-forgetting-");
    const dbPath = path.join(tmpDir, "episodic-memory.sqlite");
    const now = new Date("2026-02-28T10:00:00.000Z");
    const nowMs = now.getTime();
    const hour = 60 * 60 * 1000;
    const db = new DatabaseSync(dbPath);
    try {
      db.exec(`
        CREATE TABLE episodic_entries (
          entry_id TEXT PRIMARY KEY,
          created_at INTEGER NOT NULL,
          score INTEGER NOT NULL,
          signals TEXT NOT NULL,
          primary_kind TEXT NOT NULL,
          repressed INTEGER NOT NULL DEFAULT 0,
          repression_weight REAL NOT NULL DEFAULT 0.0,
          latent_energy REAL NOT NULL DEFAULT 0.0
        );
      `);
      const insert = db.prepare(
        `INSERT INTO episodic_entries (
           entry_id, created_at, score, signals, primary_kind, repressed, repression_weight, latent_energy
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      insert.run("entry-old-low", nowMs - 120 * hour, 1, "long_turn", "general", 0, 0, 0);
      insert.run("entry-fresh", nowMs - 2 * hour, 5, "emotion,identity", "identity", 0, 0, 0);
    } finally {
      db.close();
    }

    process.env.OM_ACTIVE_FORGETTING_ENABLED = "true";
    process.env.OM_ACTIVE_FORGETTING_OBSERVATION_HOURS = "24";
    process.env.OM_ACTIVE_FORGETTING_THRESHOLD = "0.62";
    process.env.OM_ACTIVE_FORGETTING_MAX_SCAN_ROWS = "100";

    const summary = runActiveForgetting({
      metadataDbPath: dbPath,
      runId: "run-forgetting-active-1",
      sessionKey: "agent:main:main",
      now,
    });

    expect(summary.dryRun).toBe(false);
    expect(summary.reason).toBe("evaluated");
    expect(summary.candidatesCount).toBeGreaterThanOrEqual(1);
    expect(summary.repressedCount).toBeGreaterThanOrEqual(1);
    expect(summary.sampleCandidateEntryIds).toContain("entry-old-low");

    const verifyDb = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const count = verifyDb.prepare("SELECT COUNT(*) AS count FROM episodic_entries").get() as {
        count: number;
      };
      const oldRow = verifyDb
        .prepare(
          "SELECT repressed, repression_weight, latent_energy FROM episodic_entries WHERE entry_id = ?",
        )
        .get("entry-old-low") as {
        repressed: number;
        repression_weight: number;
        latent_energy: number;
      };
      const freshRow = verifyDb
        .prepare("SELECT repressed FROM episodic_entries WHERE entry_id = ?")
        .get("entry-fresh") as { repressed: number };

      expect(count.count).toBe(2);
      expect(oldRow.repressed).toBe(1);
      expect(oldRow.repression_weight).toBeGreaterThan(0);
      expect(oldRow.repression_weight).toBeLessThanOrEqual(1);
      expect(oldRow.latent_energy).toBeGreaterThanOrEqual(0);
      expect(oldRow.latent_energy).toBeLessThanOrEqual(1);
      expect(freshRow.repressed).toBe(0);
    } finally {
      verifyDb.close();
    }
  });

  it("fails open with schema-missing when repression columns are absent", async () => {
    tmpDir = await makeTmpDir("active-forgetting-schema-");
    const dbPath = path.join(tmpDir, "episodic-memory.sqlite");
    const now = new Date("2026-02-28T10:00:00.000Z");
    const nowMs = now.getTime();
    const day = 24 * 60 * 60 * 1000;
    const db = new DatabaseSync(dbPath);
    try {
      db.exec(`
        CREATE TABLE episodic_entries (
          entry_id TEXT PRIMARY KEY,
          created_at INTEGER NOT NULL,
          score INTEGER NOT NULL,
          signals TEXT NOT NULL,
          primary_kind TEXT NOT NULL
        );
      `);
      db.prepare(
        `INSERT INTO episodic_entries (entry_id, created_at, score, signals, primary_kind)
         VALUES (?, ?, ?, ?, ?)`,
      ).run("entry-legacy", nowMs - 10 * day, 1, "long_turn", "general");
    } finally {
      db.close();
    }

    process.env.OM_ACTIVE_FORGETTING_ENABLED = "true";
    process.env.OM_ACTIVE_FORGETTING_OBSERVATION_HOURS = "24";
    process.env.OM_ACTIVE_FORGETTING_THRESHOLD = "0.62";
    process.env.OM_ACTIVE_FORGETTING_MAX_SCAN_ROWS = "100";

    const summary = runActiveForgetting({
      metadataDbPath: dbPath,
      runId: "run-forgetting-active-2",
      sessionKey: "agent:main:main",
      now,
    });

    expect(summary.reason).toBe("schema-missing");
    expect(summary.repressedCount).toBe(0);
    expect(summary.candidatesCount).toBeGreaterThanOrEqual(1);
  });
});
