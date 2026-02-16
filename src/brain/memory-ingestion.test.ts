import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OpenClawConfig } from "../config/config.js";
import {
  createBrainMemoryIngestionEntry,
  ingestSacredMemory,
  logBrainMemoryIngestionObserver,
  withSacredMemorySearchConfig,
} from "./memory-ingestion.js";

async function makeTmpDir(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function createSacredTree(workspaceDir: string): Promise<void> {
  const sacredDir = path.join(workspaceDir, "knowledge", "sacred");
  await fs.mkdir(sacredDir, { recursive: true });
  await fs.writeFile(path.join(sacredDir, "ACTIVE_TASKS.md"), "# active");
  await fs.writeFile(path.join(sacredDir, "MOOD.md"), "# mood");
}

describe("withSacredMemorySearchConfig", () => {
  it("enables memory search and appends sacred path without duplicates", () => {
    const cfg = {
      agents: {
        defaults: {
          memorySearch: {
            enabled: false,
            sources: ["sessions"],
            extraPaths: ["knowledge/sacred", "memory/extra"],
          },
        },
        list: [
          {
            id: "main",
            memorySearch: {
              enabled: false,
              sources: ["sessions"],
              extraPaths: ["memory/extra"],
            },
          },
        ],
      },
    } as unknown as OpenClawConfig;

    const updated = withSacredMemorySearchConfig({
      cfg,
      agentId: "main",
      sacredRelativePath: "knowledge/sacred",
    });

    expect(updated.agents?.defaults?.memorySearch?.enabled).toBe(true);
    expect(updated.agents?.defaults?.memorySearch?.sources).toEqual(["sessions", "memory"]);
    expect(updated.agents?.defaults?.memorySearch?.extraPaths).toEqual([
      "knowledge/sacred",
      "memory/extra",
    ]);

    const main = updated.agents?.list?.find((entry) => entry.id === "main");
    expect(main?.memorySearch?.enabled).toBe(true);
    expect(main?.memorySearch?.sources).toEqual(["sessions", "memory"]);
    expect(main?.memorySearch?.extraPaths).toEqual(["memory/extra", "knowledge/sacred"]);

    // input remains unchanged
    expect(cfg.agents?.defaults?.memorySearch?.enabled).toBe(false);
  });
});

describe("ingestSacredMemory", () => {
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("returns indexed sacred counts when sync succeeds", async () => {
    tmpDir = await makeTmpDir("brain-ingest-");
    await createSacredTree(tmpDir);

    const dbPath = path.join(tmpDir, "memory.sqlite");
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE files (
        path TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        hash TEXT NOT NULL,
        mtime INTEGER NOT NULL,
        size INTEGER NOT NULL
      );
      CREATE TABLE chunks (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        source TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        hash TEXT NOT NULL,
        model TEXT NOT NULL,
        text TEXT NOT NULL,
        embedding TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    db.prepare(
      "INSERT INTO files (path, source, hash, mtime, size) VALUES (?, ?, ?, ?, ?)",
    ).run("knowledge/sacred/ACTIVE_TASKS.md", "memory", "h1", 1, 10);
    db.prepare(
      "INSERT INTO files (path, source, hash, mtime, size) VALUES (?, ?, ?, ?, ?)",
    ).run("knowledge/sacred/MOOD.md", "memory", "h2", 1, 10);
    db.prepare(
      "INSERT INTO files (path, source, hash, mtime, size) VALUES (?, ?, ?, ?, ?)",
    ).run("memory/NOT_SACRED.md", "memory", "h3", 1, 10);
    db.prepare(
      "INSERT INTO chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("c1", "knowledge/sacred/ACTIVE_TASKS.md", "memory", 1, 2, "h", "m", "x", "[]", 1);
    db.prepare(
      "INSERT INTO chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("c2", "knowledge/sacred/MOOD.md", "memory", 1, 2, "h", "m", "x", "[]", 1);
    db.prepare(
      "INSERT INTO chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("c3", "memory/NOT_SACRED.md", "memory", 1, 2, "h", "m", "x", "[]", 1);
    db.close();

    const sync = vi.fn(async () => {});
    const manager = {
      sync,
      status: () => ({
        backend: "builtin" as const,
        provider: "openai",
        model: "text-embedding-3-small",
        dbPath,
        extraPaths: ["knowledge/sacred"],
      }),
    };

    const result = await ingestSacredMemory({
      cfg: {} as OpenClawConfig,
      agentId: "main",
      reason: "test-ingest",
      managerResolver: async () => ({ manager: manager as never }),
      workspaceResolver: () => tmpDir!,
      now: () => new Date("2026-02-16T08:00:00.000Z"),
    });

    expect(sync).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.sacredMarkdownFiles).toBe(2);
    expect(result.indexedSacredFiles).toBe(2);
    expect(result.indexedSacredChunks).toBe(2);
    expect(result.provider).toBe("openai");
    expect(result.reason).toBe("test-ingest");
  });

  it("returns a clear error when manager is unavailable", async () => {
    tmpDir = await makeTmpDir("brain-ingest-");
    await createSacredTree(tmpDir);

    const result = await ingestSacredMemory({
      cfg: {} as OpenClawConfig,
      agentId: "main",
      managerResolver: async () => ({ manager: null, error: "memory disabled" }),
      workspaceResolver: () => tmpDir!,
      now: () => new Date("2026-02-16T08:00:00.000Z"),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("memory disabled");
    expect(result.sacredMarkdownFiles).toBe(2);
  });
});

describe("brain memory ingestion observer log", () => {
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("writes JSONL observer entries", async () => {
    tmpDir = await makeTmpDir("brain-ingest-log-");
    const result = {
      ok: true,
      startedAt: "2026-02-16T08:00:00.000Z",
      finishedAt: "2026-02-16T08:00:01.000Z",
      reason: "test",
      agentId: "main",
      workspaceDir: tmpDir,
      sacredRelativePath: "knowledge/sacred",
      sacredMarkdownFiles: 2,
      indexedSacredFiles: 2,
      indexedSacredChunks: 4,
      dbPath: path.join(tmpDir, "memory.sqlite"),
      provider: "openai",
      model: "text-embedding-3-small",
      extraPaths: ["knowledge/sacred"],
    };

    const entry = createBrainMemoryIngestionEntry(result, {
      now: new Date("2026-02-16T08:00:02.000Z"),
      source: "test-suite",
      sessionKey: "session-1",
    });
    expect(entry.event).toBe("brain.memory.ingestion.observer");

    const logPath = logBrainMemoryIngestionObserver(result, {
      now: new Date("2026-02-16T08:00:02.000Z"),
      source: "test-suite",
      sessionKey: "session-1",
      baseDir: tmpDir,
    });

    expect(logPath).toBe(path.join(tmpDir, "ingestion-20260216.jsonl"));
    const raw = await fs.readFile(logPath!, "utf-8");
    const lines = raw.trim().split(/\r?\n/);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as { event: string; source: string; sessionKey: string };
    expect(parsed.event).toBe("brain.memory.ingestion.observer");
    expect(parsed.source).toBe("test-suite");
    expect(parsed.sessionKey).toBe("session-1");
  });
});
