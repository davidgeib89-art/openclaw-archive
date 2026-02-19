import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
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
  const previousStructuredPathEnv = process.env.OM_EPISODIC_STRUCTURED_PATH;
  const previousMetadataPathEnv = process.env.OM_EPISODIC_METADATA_DB_PATH;
  const previousCompactionEnabledEnv = process.env.OM_EPISODIC_METADATA_COMPACTION_ENABLED;
  const previousCompactionMaxRowsEnv = process.env.OM_EPISODIC_METADATA_MAX_ROWS;
  const previousCompactionRetentionEnv = process.env.OM_EPISODIC_METADATA_RETENTION_DAYS;
  const previousCompactionLowScoreRetentionEnv =
    process.env.OM_EPISODIC_METADATA_LOW_SCORE_RETENTION_DAYS;
  const previousCompactionLowScoreThresholdEnv =
    process.env.OM_EPISODIC_METADATA_LOW_SCORE_THRESHOLD;
  const previousStructuredRotateEnabledEnv = process.env.OM_EPISODIC_STRUCTURED_ROTATE_ENABLED;
  const previousStructuredRotateMaxBytesEnv = process.env.OM_EPISODIC_STRUCTURED_ROTATE_MAX_BYTES;
  const previousStructuredRotateMaxFilesEnv = process.env.OM_EPISODIC_STRUCTURED_ROTATE_MAX_FILES;
  const previousActiveForgettingEnabledEnv = process.env.OM_ACTIVE_FORGETTING_ENABLED;
  const previousActiveForgettingWindowEnv = process.env.OM_ACTIVE_FORGETTING_OBSERVATION_HOURS;
  const previousActiveForgettingThresholdEnv = process.env.OM_ACTIVE_FORGETTING_THRESHOLD;
  const previousActiveForgettingMaxScanRowsEnv = process.env.OM_ACTIVE_FORGETTING_MAX_SCAN_ROWS;
  const previousEpisodicIndexEnabledEnv = process.env.OM_EPISODIC_INDEX_ENABLED;
  const previousEpisodicIndexPathEnv = process.env.OM_EPISODIC_INDEX_PATH;
  const previousEpisodicIndexActiveDaysEnv = process.env.OM_EPISODIC_INDEX_ACTIVE_DAYS;
  const previousEpisodicIndexWindowDaysEnv = process.env.OM_EPISODIC_INDEX_WINDOW_DAYS;
  const previousEpisodicIndexLongTermMinScoreEnv = process.env.OM_EPISODIC_INDEX_LONG_TERM_MIN_SCORE;
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
    if (previousStructuredPathEnv === undefined) {
      delete process.env.OM_EPISODIC_STRUCTURED_PATH;
    } else {
      process.env.OM_EPISODIC_STRUCTURED_PATH = previousStructuredPathEnv;
    }
    if (previousMetadataPathEnv === undefined) {
      delete process.env.OM_EPISODIC_METADATA_DB_PATH;
    } else {
      process.env.OM_EPISODIC_METADATA_DB_PATH = previousMetadataPathEnv;
    }
    if (previousCompactionEnabledEnv === undefined) {
      delete process.env.OM_EPISODIC_METADATA_COMPACTION_ENABLED;
    } else {
      process.env.OM_EPISODIC_METADATA_COMPACTION_ENABLED = previousCompactionEnabledEnv;
    }
    if (previousCompactionMaxRowsEnv === undefined) {
      delete process.env.OM_EPISODIC_METADATA_MAX_ROWS;
    } else {
      process.env.OM_EPISODIC_METADATA_MAX_ROWS = previousCompactionMaxRowsEnv;
    }
    if (previousCompactionRetentionEnv === undefined) {
      delete process.env.OM_EPISODIC_METADATA_RETENTION_DAYS;
    } else {
      process.env.OM_EPISODIC_METADATA_RETENTION_DAYS = previousCompactionRetentionEnv;
    }
    if (previousCompactionLowScoreRetentionEnv === undefined) {
      delete process.env.OM_EPISODIC_METADATA_LOW_SCORE_RETENTION_DAYS;
    } else {
      process.env.OM_EPISODIC_METADATA_LOW_SCORE_RETENTION_DAYS =
        previousCompactionLowScoreRetentionEnv;
    }
    if (previousCompactionLowScoreThresholdEnv === undefined) {
      delete process.env.OM_EPISODIC_METADATA_LOW_SCORE_THRESHOLD;
    } else {
      process.env.OM_EPISODIC_METADATA_LOW_SCORE_THRESHOLD = previousCompactionLowScoreThresholdEnv;
    }
    if (previousStructuredRotateEnabledEnv === undefined) {
      delete process.env.OM_EPISODIC_STRUCTURED_ROTATE_ENABLED;
    } else {
      process.env.OM_EPISODIC_STRUCTURED_ROTATE_ENABLED = previousStructuredRotateEnabledEnv;
    }
    if (previousStructuredRotateMaxBytesEnv === undefined) {
      delete process.env.OM_EPISODIC_STRUCTURED_ROTATE_MAX_BYTES;
    } else {
      process.env.OM_EPISODIC_STRUCTURED_ROTATE_MAX_BYTES = previousStructuredRotateMaxBytesEnv;
    }
    if (previousStructuredRotateMaxFilesEnv === undefined) {
      delete process.env.OM_EPISODIC_STRUCTURED_ROTATE_MAX_FILES;
    } else {
      process.env.OM_EPISODIC_STRUCTURED_ROTATE_MAX_FILES = previousStructuredRotateMaxFilesEnv;
    }
    if (previousActiveForgettingEnabledEnv === undefined) {
      delete process.env.OM_ACTIVE_FORGETTING_ENABLED;
    } else {
      process.env.OM_ACTIVE_FORGETTING_ENABLED = previousActiveForgettingEnabledEnv;
    }
    if (previousActiveForgettingWindowEnv === undefined) {
      delete process.env.OM_ACTIVE_FORGETTING_OBSERVATION_HOURS;
    } else {
      process.env.OM_ACTIVE_FORGETTING_OBSERVATION_HOURS = previousActiveForgettingWindowEnv;
    }
    if (previousActiveForgettingThresholdEnv === undefined) {
      delete process.env.OM_ACTIVE_FORGETTING_THRESHOLD;
    } else {
      process.env.OM_ACTIVE_FORGETTING_THRESHOLD = previousActiveForgettingThresholdEnv;
    }
    if (previousActiveForgettingMaxScanRowsEnv === undefined) {
      delete process.env.OM_ACTIVE_FORGETTING_MAX_SCAN_ROWS;
    } else {
      process.env.OM_ACTIVE_FORGETTING_MAX_SCAN_ROWS = previousActiveForgettingMaxScanRowsEnv;
    }
    if (previousEpisodicIndexEnabledEnv === undefined) {
      delete process.env.OM_EPISODIC_INDEX_ENABLED;
    } else {
      process.env.OM_EPISODIC_INDEX_ENABLED = previousEpisodicIndexEnabledEnv;
    }
    if (previousEpisodicIndexPathEnv === undefined) {
      delete process.env.OM_EPISODIC_INDEX_PATH;
    } else {
      process.env.OM_EPISODIC_INDEX_PATH = previousEpisodicIndexPathEnv;
    }
    if (previousEpisodicIndexActiveDaysEnv === undefined) {
      delete process.env.OM_EPISODIC_INDEX_ACTIVE_DAYS;
    } else {
      process.env.OM_EPISODIC_INDEX_ACTIVE_DAYS = previousEpisodicIndexActiveDaysEnv;
    }
    if (previousEpisodicIndexWindowDaysEnv === undefined) {
      delete process.env.OM_EPISODIC_INDEX_WINDOW_DAYS;
    } else {
      process.env.OM_EPISODIC_INDEX_WINDOW_DAYS = previousEpisodicIndexWindowDaysEnv;
    }
    if (previousEpisodicIndexLongTermMinScoreEnv === undefined) {
      delete process.env.OM_EPISODIC_INDEX_LONG_TERM_MIN_SCORE;
    } else {
      process.env.OM_EPISODIC_INDEX_LONG_TERM_MIN_SCORE = previousEpisodicIndexLongTermMinScoreEnv;
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
    expect(result.primaryKind).toBe("preference");
    expect(result.kinds).toContain("preference");
    expect(result.path.endsWith(path.join("memory", "EPISODIC_JOURNAL.md"))).toBe(true);
    expect(result.structuredPersisted).toBe(true);
    expect(result.metadataPersisted).toBe(true);
    expect(result.memoryIndexUpdated).toBe(true);
    expect(result.episodicIndex?.updated).toBe(true);
    expect(result.episodicIndex?.path).toContain(path.join("memory", "EPISODIC_INDEX.md"));
    expect(result.memoryIndexPath).toContain(path.join("memory", "MEMORY_INDEX.md"));
    expect(result.structuredPath).toContain("EPISODIC_JOURNAL.jsonl");
    expect(result.metadataDbPath).toContain(path.join("logs", "brain", "episodic-memory.sqlite"));
    expect(result.entryId).toBeTruthy();

    const journal = await fs.readFile(result.path, "utf-8");
    expect(journal).toContain("# EPISODIC JOURNAL");
    expect(journal).toContain("run=run-ep-1");
    expect(journal).toContain("signals:");
    expect(journal).toContain("user: I prefer ambient music while coding.");
    expect(journal).toContain(
      "assistant: I choose to honor that preference because it supports focus.",
    );

    const structuredRaw = await fs.readFile(result.structuredPath!, "utf-8");
    const structuredLines = structuredRaw.trim().split(/\r?\n/);
    expect(structuredLines.length).toBe(1);
    const structured = JSON.parse(structuredLines[0] ?? "{}") as {
      entryId: string;
      primaryKind: string;
      kinds: string[];
      score: number;
    };
    expect(structured.entryId).toBe(result.entryId);
    expect(structured.primaryKind).toBe("preference");
    expect(structured.kinds).toContain("preference");
    expect(structured.score).toBe(result.score);

    const memoryIndexRaw = await fs.readFile(result.memoryIndexPath!, "utf-8");
    expect(memoryIndexRaw).toContain("# MEMORY INDEX");
    expect(memoryIndexRaw).toContain(`#${result.primaryKind}`);
    expect(memoryIndexRaw).toContain(`entry=${result.entryId}`);

    const db = new DatabaseSync(result.metadataDbPath!);
    const row = db
      .prepare(
        "SELECT entry_id, primary_kind, score, kinds FROM episodic_entries WHERE entry_id = ?",
      )
      .get(result.entryId) as
      | { entry_id: string; primary_kind: string; score: number; kinds: string }
      | undefined;
    expect(row?.entry_id).toBe(result.entryId);
    expect(row?.primary_kind).toBe("preference");
    expect(row?.score).toBe(result.score);
    expect(row?.kinds).toContain("preference");

    const preferenceRelation = db
      .prepare(
        "SELECT source_entity, predicate, target_entity FROM semantic_relationships WHERE entry_id = ?",
      )
      .all(result.entryId) as Array<{
      source_entity: string;
      predicate: string;
      target_entity: string;
    }>;
    expect(preferenceRelation.length).toBeGreaterThanOrEqual(1);
    expect(preferenceRelation.some((row) => row.source_entity === "Operator")).toBe(true);
    expect(preferenceRelation.some((row) => row.predicate === "PREFERS")).toBe(true);
    db.close();
  });

  it("extracts graph relationships from named entity facts", async () => {
    tmpDir = await makeTmpDir("episodic-journal-");
    delete process.env.OM_EPISODIC_WRITE_ENABLED;

    const result = await appendBrainEpisodicJournal({
      cfg: makeCfg(),
      workspaceDir: tmpDir,
      runId: "run-ep-graph-1",
      sessionKey: "agent:main:main",
      userMessage:
        "I decide to document this fact now: Alice manages Auth Team and should keep ownership.",
      assistantMessage:
        "I choose to keep this relationship stable and reversible so future recall stays coherent.",
      now: () => new Date("2026-02-17T08:00:30.000Z"),
    });

    expect(result.persisted).toBe(true);
    expect(result.graphPersisted).toBe(true);
    expect(result.graphRelationshipsExtracted).toBeGreaterThanOrEqual(1);
    expect(result.graphRelationshipsInserted).toBeGreaterThanOrEqual(1);

    const db = new DatabaseSync(result.metadataDbPath!);
    const rows = db
      .prepare(
        "SELECT source_entity, predicate, target_entity FROM semantic_relationships WHERE entry_id = ?",
      )
      .all(result.entryId) as Array<{
      source_entity: string;
      predicate: string;
      target_entity: string;
    }>;
    db.close();

    expect(
      rows.some(
        (row) =>
          row.source_entity === "Alice" &&
          row.predicate === "MANAGES" &&
          row.target_entity === "Auth Team",
      ),
    ).toBe(true);
  });

  it("captures codename phrasing as identity relationship", async () => {
    tmpDir = await makeTmpDir("episodic-journal-");
    delete process.env.OM_EPISODIC_WRITE_ENABLED;

    const result = await appendBrainEpisodicJournal({
      cfg: makeCfg(),
      workspaceDir: tmpDir,
      runId: "run-ep-codename-1",
      sessionKey: "agent:main:main",
      userMessage: "My secret codename is Omega.",
      assistantMessage: "Acknowledged. I will remember this identity marker for continuity.",
      now: () => new Date("2026-02-17T08:01:15.000Z"),
    });

    expect(result.persisted).toBe(true);
    expect(result.primaryKind).toBe("identity");
    expect(result.graphPersisted).toBe(true);
    expect(result.graphRelationshipsExtracted).toBeGreaterThanOrEqual(1);

    const db = new DatabaseSync(result.metadataDbPath!);
    const rows = db
      .prepare(
        "SELECT source_entity, predicate, target_entity FROM semantic_relationships WHERE entry_id = ?",
      )
      .all(result.entryId) as Array<{
      source_entity: string;
      predicate: string;
      target_entity: string;
    }>;
    db.close();

    expect(
      rows.some(
        (row) =>
          row.source_entity === "Operator" &&
          row.predicate === "IDENTITY" &&
          row.target_entity === "Omega",
      ),
    ).toBe(true);
  });

  it("applies new-vs-old conflict policy for single-target predicates", async () => {
    tmpDir = await makeTmpDir("episodic-journal-");
    delete process.env.OM_EPISODIC_WRITE_ENABLED;
    delete process.env.OM_EPISODIC_GRAPH_CONFLICT_POLICY_ENABLED;

    const first = await appendBrainEpisodicJournal({
      cfg: makeCfg(),
      workspaceDir: tmpDir,
      runId: "run-ep-conflict-1",
      sessionKey: "agent:main:main",
      userMessage: "Alice manages Auth Team.",
      assistantMessage: "I choose to keep this ownership fact stable.",
      now: () => new Date("2026-02-17T08:10:00.000Z"),
    });
    const second = await appendBrainEpisodicJournal({
      cfg: makeCfg(),
      workspaceDir: tmpDir,
      runId: "run-ep-conflict-2",
      sessionKey: "agent:main:main",
      userMessage: "Bob manages Auth Team.",
      assistantMessage: "I choose to update the manager assignment.",
      now: () => new Date("2026-02-17T08:11:00.000Z"),
    });

    expect(first.persisted).toBe(true);
    expect(second.persisted).toBe(true);
    expect(second.graphConflictsResolved).toBeGreaterThanOrEqual(1);

    const db = new DatabaseSync(second.metadataDbPath!);
    const rows = db
      .prepare(
        `SELECT source_entity, predicate, target_entity
         FROM semantic_relationships
         WHERE predicate = 'MANAGES' AND target_entity = 'Auth Team'
         ORDER BY created_at DESC`,
      )
      .all() as Array<{ source_entity: string; predicate: string; target_entity: string }>;
    db.close();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.source_entity).toBe("Bob");
    expect(rows[0]?.target_entity).toBe("Auth Team");
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
    expect(result.structuredPersisted).toBe(false);
    expect(result.metadataPersisted).toBe(false);
    expect(result.memoryIndexUpdated).toBe(false);
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
    expect(result.memoryIndexUpdated).toBe(false);
  });

  it("skips agenda heartbeat turns", async () => {
    tmpDir = await makeTmpDir("episodic-journal-");

    const result = await appendBrainEpisodicJournal({
      cfg: makeCfg(),
      workspaceDir: tmpDir,
      runId: "run-ep-3b",
      sessionKey: "agent:main:main",
      userMessage: "Read AGENDA.md if it exists. If nothing needs attention, reply HEARTBEAT_OK.",
      assistantMessage: "HEARTBEAT_OK",
      now: () => new Date("2026-02-17T08:02:30.000Z"),
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

  it("evaluates forgetting in 48h dry-run mode without deleting entries", async () => {
    tmpDir = await makeTmpDir("episodic-journal-");
    process.env.OM_ACTIVE_FORGETTING_ENABLED = "true";
    process.env.OM_ACTIVE_FORGETTING_OBSERVATION_HOURS = "48";
    process.env.OM_ACTIVE_FORGETTING_THRESHOLD = "0.62";
    process.env.OM_ACTIVE_FORGETTING_MAX_SCAN_ROWS = "200";
    process.env.OM_EPISODIC_INDEX_LONG_TERM_MIN_SCORE = "2";

    const first = await appendBrainEpisodicJournal({
      cfg: makeCfg(),
      workspaceDir: tmpDir,
      runId: "run-ep-forget-1",
      sessionKey: "agent:main:main",
      userMessage: "I prefer tea while coding.",
      assistantMessage: "I choose tea as our default coding beverage.",
      now: () => new Date("2025-12-10T07:00:00.000Z"),
    });
    const second = await appendBrainEpisodicJournal({
      cfg: makeCfg(),
      workspaceDir: tmpDir,
      runId: "run-ep-forget-2",
      sessionKey: "agent:main:main",
      userMessage: "My name is Omega and this is important to me.",
      assistantMessage: "I will remember this identity marker clearly.",
      now: () => new Date("2026-02-12T07:00:00.000Z"),
    });
    const third = await appendBrainEpisodicJournal({
      cfg: makeCfg(),
      workspaceDir: tmpDir,
      runId: "run-ep-forget-3",
      sessionKey: "agent:main:main",
      userMessage: "I prefer one clear step for today.",
      assistantMessage: "I choose one clear step and keep it focused.",
      now: () => new Date("2026-02-19T07:00:00.000Z"),
    });

    expect(first.persisted).toBe(true);
    expect(second.persisted).toBe(true);
    expect(third.persisted).toBe(true);
    expect(third.forgetting?.dryRun).toBe(true);
    expect(third.forgetting?.observationWindowHours).toBe(48);
    expect(third.forgetting?.reason).toBe("evaluated");
    expect(third.forgetting?.evaluatedCount).toBeGreaterThanOrEqual(3);
    expect(third.forgetting?.candidatesCount).toBeGreaterThanOrEqual(1);
    expect(third.forgetting?.sampleCandidateEntryIds).toContain(first.entryId);
    expect(third.episodicIndex?.updated).toBe(true);
    expect(third.episodicIndex?.counts.shortTermActive).toBeGreaterThanOrEqual(1);
    expect(third.episodicIndex?.counts.longTermCandidates).toBeGreaterThanOrEqual(1);

    const db = new DatabaseSync(third.metadataDbPath!);
    const count = db.prepare("SELECT COUNT(*) AS count FROM episodic_entries").get() as {
      count: number;
    };
    const ids = db
      .prepare("SELECT entry_id FROM episodic_entries ORDER BY created_at ASC")
      .all() as Array<{ entry_id: string }>;
    db.close();

    expect(count.count).toBe(3);
    expect(ids.map((row) => row.entry_id)).toContain(first.entryId);
    expect(ids.map((row) => row.entry_id)).toContain(second.entryId);
    expect(ids.map((row) => row.entry_id)).toContain(third.entryId);
  });

  it("applies metadata compaction policy when enabled", async () => {
    tmpDir = await makeTmpDir("episodic-journal-");
    process.env.OM_EPISODIC_METADATA_COMPACTION_ENABLED = "true";
    process.env.OM_EPISODIC_METADATA_MAX_ROWS = "2";
    process.env.OM_EPISODIC_METADATA_RETENTION_DAYS = "3650";
    process.env.OM_EPISODIC_METADATA_LOW_SCORE_RETENTION_DAYS = "3650";

    const first = await appendBrainEpisodicJournal({
      cfg: makeCfg(),
      workspaceDir: tmpDir,
      runId: "run-ep-6-a",
      sessionKey: "agent:main:main",
      userMessage: "I prefer ambient while coding.",
      assistantMessage: "I choose ambient as default during coding sessions.",
      now: () => new Date("2026-02-17T09:00:00.000Z"),
    });
    const second = await appendBrainEpisodicJournal({
      cfg: makeCfg(),
      workspaceDir: tmpDir,
      runId: "run-ep-6-b",
      sessionKey: "agent:main:main",
      userMessage: "My next step is to improve recall quality.",
      assistantMessage: "I choose to prioritize recall quality this week.",
      now: () => new Date("2026-02-17T09:01:00.000Z"),
    });
    const third = await appendBrainEpisodicJournal({
      cfg: makeCfg(),
      workspaceDir: tmpDir,
      runId: "run-ep-6-c",
      sessionKey: "agent:main:main",
      userMessage: "I decide to keep one rule and one safeguard.",
      assistantMessage: "I choose the same policy because it stays testable.",
      now: () => new Date("2026-02-17T09:02:00.000Z"),
    });

    expect(first.persisted).toBe(true);
    expect(second.persisted).toBe(true);
    expect(third.persisted).toBe(true);
    expect(third.compactionApplied).toBe(true);
    expect(third.compactionDeletedRows).toBeGreaterThanOrEqual(1);

    const db = new DatabaseSync(third.metadataDbPath!);
    const count = db.prepare("SELECT COUNT(*) AS count FROM episodic_entries").get() as {
      count: number;
    };
    const ids = db
      .prepare("SELECT entry_id FROM episodic_entries ORDER BY created_at DESC")
      .all() as Array<{ entry_id: string }>;
    const orphanCountRow = db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM semantic_relationships
         WHERE entry_id NOT IN (SELECT entry_id FROM episodic_entries)`,
      )
      .get() as { count: number };
    db.close();

    expect(count.count).toBeLessThanOrEqual(2);
    expect(ids.map((row) => row.entry_id)).toContain(third.entryId);
    expect(ids.map((row) => row.entry_id)).toContain(second.entryId);
    expect(ids.map((row) => row.entry_id)).not.toContain(first.entryId);
    expect(orphanCountRow.count).toBe(0);
  });

  it("rotates structured episodic journal when size threshold is exceeded", async () => {
    tmpDir = await makeTmpDir("episodic-journal-");
    process.env.OM_EPISODIC_STRUCTURED_ROTATE_ENABLED = "true";
    process.env.OM_EPISODIC_STRUCTURED_ROTATE_MAX_BYTES = "220";
    process.env.OM_EPISODIC_STRUCTURED_ROTATE_MAX_FILES = "1";

    const longUser =
      "I prefer a very specific creative style with ambient textures, reflective language, and continuity across future sessions.";
    const longAssistant =
      "I choose this style because it supports identity continuity, creative coherence, and safe operational clarity in our next steps.";

    const first = await appendBrainEpisodicJournal({
      cfg: makeCfg(),
      workspaceDir: tmpDir,
      runId: "run-ep-7-a",
      sessionKey: "agent:main:main",
      userMessage: longUser,
      assistantMessage: longAssistant,
      now: () => new Date("2026-02-17T10:00:00.000Z"),
    });
    const second = await appendBrainEpisodicJournal({
      cfg: makeCfg(),
      workspaceDir: tmpDir,
      runId: "run-ep-7-b",
      sessionKey: "agent:main:main",
      userMessage: `${longUser} Next step stays the same.`,
      assistantMessage: `${longAssistant} I will keep it stable.`,
      now: () => new Date("2026-02-17T10:01:00.000Z"),
    });
    const third = await appendBrainEpisodicJournal({
      cfg: makeCfg(),
      workspaceDir: tmpDir,
      runId: "run-ep-7-c",
      sessionKey: "agent:main:main",
      userMessage: `${longUser} We continue this tomorrow.`,
      assistantMessage: `${longAssistant} This remains my operating stance.`,
      now: () => new Date("2026-02-17T10:02:00.000Z"),
    });

    expect(first.persisted).toBe(true);
    expect(second.persisted).toBe(true);
    expect(third.persisted).toBe(true);
    expect(second.structuredRotated).toBe(true);
    expect(third.structuredRotated).toBe(true);
    expect(third.structuredRotationPrunedFiles).toBeGreaterThanOrEqual(1);

    const structuredRaw = await fs.readFile(third.structuredPath!, "utf-8");
    const lines = structuredRaw.trim().split(/\r?\n/);
    expect(lines.length).toBe(1);
    const row = JSON.parse(lines[0] ?? "{}") as { runId: string };
    expect(row.runId).toBe("run-ep-7-c");

    const memoryDir = path.dirname(third.structuredPath!);
    const baseName = path.basename(third.structuredPath!);
    const files = await fs.readdir(memoryDir);
    const rotatedFiles = files.filter(
      (name) => name.startsWith(`${baseName}.`) && name.toLowerCase().endsWith(".jsonl"),
    );
    expect(rotatedFiles.length).toBe(1);
  });
});
