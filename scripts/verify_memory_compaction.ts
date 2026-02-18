import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { OpenClawConfig } from "../src/config/config.js";
import { appendBrainEpisodicJournal } from "../src/brain/episodic-memory.js";

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;
const LOW_COUNT = 100;
const HIGH_COUNT = 10;

function makeCfg(workspaceDir: string): OpenClawConfig {
  return {
    agents: {
      defaults: {
        workspace: workspaceDir,
        memorySearch: {
          enabled: true,
        },
      },
    },
  } as OpenClawConfig;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertCondition(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function setEnv(name: string, value: string): () => void {
  const previous = process.env[name];
  process.env[name] = value;
  return () => {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  };
}

function countByRunPrefix(db: DatabaseSync, prefix: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM episodic_entries WHERE run_id LIKE ?`)
    .get(`${prefix}%`) as {
    count: number;
  };
  return row.count;
}

async function run(): Promise<void> {
  const workspaceDir = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-memory-compaction-"));
  const cfg = makeCfg(workspaceDir);
  const restoreEnv: Array<() => void> = [];

  restoreEnv.push(setEnv("OM_EPISODIC_WRITE_ENABLED", "true"));
  restoreEnv.push(setEnv("OM_EPISODIC_GRAPH_ENABLED", "false"));
  restoreEnv.push(setEnv("OM_EPISODIC_METADATA_COMPACTION_ENABLED", "true"));
  restoreEnv.push(setEnv("OM_EPISODIC_METADATA_MAX_ROWS", "10000"));
  restoreEnv.push(setEnv("OM_EPISODIC_METADATA_RETENTION_DAYS", "3650"));
  restoreEnv.push(setEnv("OM_EPISODIC_METADATA_LOW_SCORE_RETENTION_DAYS", "7"));
  restoreEnv.push(setEnv("OM_EPISODIC_METADATA_LOW_SCORE_THRESHOLD", "9"));

  try {
    const now = new Date();
    const old = new Date(now.getTime() - 30 * MILLIS_PER_DAY);

    // Bootstrap schema by writing one valid entry through the production path.
    await appendBrainEpisodicJournal({
      cfg,
      agentId: "main",
      workspaceDir,
      runId: "compaction-seed-1",
      sessionKey: "agent:main:verify-memory-compaction",
      userMessage: "My name is Seed.",
      assistantMessage: "I keep this memory.",
      now: () => now,
    });

    const dbPath = path.join(workspaceDir, "logs", "brain", "episodic-memory.sqlite");
    assertCondition(fs.existsSync(dbPath), `metadata db missing at ${dbPath}`);

    const db = new DatabaseSync(dbPath);
    const markdownPath = path.join(workspaceDir, "memory", "EPISODIC_JOURNAL.md");
    const structuredPath = path.join(workspaceDir, "memory", "EPISODIC_JOURNAL.jsonl");
    const insert = db.prepare(
      `INSERT INTO episodic_entries (
         entry_id,
         schema_version,
         ts,
         created_at,
         run_id,
         session_key,
         score,
         signals,
         kinds,
         primary_kind,
         user_text,
         assistant_text,
         user_hash,
         assistant_hash,
         markdown_path,
         structured_path
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (let i = 0; i < LOW_COUNT; i += 1) {
      const user = `Low score memory #${i}`;
      const assistant = "low-signal";
      insert.run(
        `low-${i}`,
        2,
        old.toISOString(),
        old.getTime() + i,
        `compaction-low-${i}`,
        "agent:main:verify-memory-compaction",
        5,
        "general",
        "general",
        "general",
        user,
        assistant,
        hashText(user),
        hashText(assistant),
        markdownPath,
        structuredPath,
      );
    }

    for (let i = 0; i < HIGH_COUNT; i += 1) {
      const user = `High score memory #${i}`;
      const assistant = "high-signal";
      insert.run(
        `high-${i}`,
        2,
        old.toISOString(),
        old.getTime() + 10_000 + i,
        `compaction-high-${i}`,
        "agent:main:verify-memory-compaction",
        60,
        "decision",
        "decision",
        "decision",
        user,
        assistant,
        hashText(user),
        hashText(assistant),
        markdownPath,
        structuredPath,
      );
    }

    const beforeLow = countByRunPrefix(db, "compaction-low-");
    const beforeHigh = countByRunPrefix(db, "compaction-high-");
    const beforeTotal = (
      db.prepare(`SELECT COUNT(*) AS count FROM episodic_entries`).get() as { count: number }
    ).count;
    db.close();

    // Trigger production compaction path.
    const trigger = await appendBrainEpisodicJournal({
      cfg,
      agentId: "main",
      workspaceDir,
      runId: "compaction-trigger-1",
      sessionKey: "agent:main:verify-memory-compaction",
      userMessage: "I choose a verified compact state.",
      assistantMessage: "Compaction should remove stale low-score entries.",
      now: () => new Date(),
    });

    const dbAfter = new DatabaseSync(dbPath);
    const afterLow = countByRunPrefix(dbAfter, "compaction-low-");
    const afterHigh = countByRunPrefix(dbAfter, "compaction-high-");
    const afterTotal = (
      dbAfter.prepare(`SELECT COUNT(*) AS count FROM episodic_entries`).get() as { count: number }
    ).count;
    dbAfter.close();

    assertCondition(beforeLow === LOW_COUNT, `expected ${LOW_COUNT} low before, got ${beforeLow}`);
    assertCondition(beforeHigh === HIGH_COUNT, `expected ${HIGH_COUNT} high before, got ${beforeHigh}`);
    assertCondition(afterLow === 0, `expected all low-score rows deleted, got ${afterLow}`);
    assertCondition(
      afterHigh === HIGH_COUNT,
      `expected all ${HIGH_COUNT} high-score rows preserved, got ${afterHigh}`,
    );

    const report = {
      workspaceDir,
      dbPath,
      policy: {
        OM_EPISODIC_METADATA_COMPACTION_ENABLED: process.env.OM_EPISODIC_METADATA_COMPACTION_ENABLED,
        OM_EPISODIC_METADATA_MAX_ROWS: process.env.OM_EPISODIC_METADATA_MAX_ROWS,
        OM_EPISODIC_METADATA_RETENTION_DAYS: process.env.OM_EPISODIC_METADATA_RETENTION_DAYS,
        OM_EPISODIC_METADATA_LOW_SCORE_RETENTION_DAYS:
          process.env.OM_EPISODIC_METADATA_LOW_SCORE_RETENTION_DAYS,
        OM_EPISODIC_METADATA_LOW_SCORE_THRESHOLD:
          process.env.OM_EPISODIC_METADATA_LOW_SCORE_THRESHOLD,
      },
      inserted: {
        lowScoreOlderThan30Days: LOW_COUNT,
        highScoreOlderThan30Days: HIGH_COUNT,
      },
      before: {
        lowCount: beforeLow,
        highCount: beforeHigh,
        totalCount: beforeTotal,
      },
      trigger: {
        persisted: trigger.persisted,
        reason: trigger.reason,
        compactionApplied: trigger.compactionApplied ?? false,
        compactionDeletedRows: trigger.compactionDeletedRows ?? 0,
      },
      after: {
        lowCount: afterLow,
        highCount: afterHigh,
        totalCount: afterTotal,
      },
      verdict: "PASS",
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
  } finally {
    for (const restore of restoreEnv.reverse()) {
      restore();
    }
    if (fs.existsSync(workspaceDir)) {
      await fsp.rm(workspaceDir, { recursive: true, force: true });
    }
  }
}

await run();
