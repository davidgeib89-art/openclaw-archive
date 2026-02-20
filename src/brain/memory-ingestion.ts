import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { OpenClawConfig } from "../config/config.js";
import type { MemorySearchConfig } from "../config/types.tools.js";
import type { MemoryProviderStatus, MemorySyncProgressUpdate } from "../memory/types.js";
import { resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import { getMemorySearchManager } from "../memory/index.js";

const DEFAULT_BRAIN_LOG_SOURCE = "proto33-p3.memory-ingestion";
const DEFAULT_SYNC_REASON = "brain.memory.ingestion";

export const DEFAULT_SACRED_MEMORY_RELATIVE_PATH = "knowledge/sacred";

export type BrainMemoryIngestionResult = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  reason: string;
  agentId: string;
  workspaceDir: string;
  sacredRelativePath: string;
  sacredMarkdownFiles: number;
  indexedSacredFiles: number;
  indexedSacredChunks: number;
  dbPath?: string;
  provider?: string;
  model?: string;
  extraPaths: string[];
  error?: string;
};

export type BrainMemoryIngestionEntry = {
  ts: string;
  event: "brain.memory.ingestion.observer";
  mode: "observer";
  source: string;
  sessionKey?: string;
  result: BrainMemoryIngestionResult;
};

export type BrainMemoryIngestionLogOptions = {
  now?: Date;
  baseDir?: string;
  source?: string;
  sessionKey?: string;
};

type IngestionParams = {
  cfg: OpenClawConfig;
  agentId: string;
  sacredRelativePath?: string;
  reason?: string;
  force?: boolean;
  progress?: (update: MemorySyncProgressUpdate) => void;
  managerResolver?: typeof getMemorySearchManager;
  workspaceResolver?: (cfg: OpenClawConfig, agentId: string) => string;
  now?: () => Date;
};

function normalizeRelativePath(value: string): string {
  const normalized = value
    .trim()
    .replace(/^[./\\]+/, "")
    .replace(/\\/g, "/");
  return normalized.replace(/\/{2,}/g, "/");
}

function dedupeExtraPaths(values: readonly string[]): string[] {
  const deduped = new Set<string>();
  for (const value of values) {
    const normalized = normalizeRelativePath(value);
    if (!normalized) {
      continue;
    }
    deduped.add(normalized);
  }
  return Array.from(deduped);
}

function mergeMemorySearchConfig(
  base: MemorySearchConfig | undefined,
  sacredRelativePath: string,
): MemorySearchConfig {
  const sources = new Set<"memory" | "sessions">(base?.sources ?? []);
  sources.add("memory");
  const extraPaths = dedupeExtraPaths([...(base?.extraPaths ?? []), sacredRelativePath]);
  return {
    ...(base ?? {}),
    enabled: true,
    sources: Array.from(sources),
    extraPaths,
  };
}

export function withSacredMemorySearchConfig(params: {
  cfg: OpenClawConfig;
  agentId?: string;
  sacredRelativePath?: string;
}): OpenClawConfig {
  const sacredRelativePath = normalizeRelativePath(
    params.sacredRelativePath ?? DEFAULT_SACRED_MEMORY_RELATIVE_PATH,
  );
  const agentId = params.agentId?.trim();
  const agents = params.cfg.agents ?? {};
  const defaults = agents.defaults ?? {};

  const nextDefaults = {
    ...defaults,
    memorySearch: mergeMemorySearchConfig(defaults.memorySearch, sacredRelativePath),
  };

  const nextList = agents.list?.map((agent) => {
    if (!agentId || agent.id !== agentId) {
      return agent;
    }
    return {
      ...agent,
      memorySearch: mergeMemorySearchConfig(agent.memorySearch, sacredRelativePath),
    };
  });

  return {
    ...params.cfg,
    agents: {
      ...agents,
      defaults: nextDefaults,
      ...(nextList ? { list: nextList } : {}),
    },
  };
}

async function countMarkdownFiles(rootPath: string): Promise<number> {
  let rootStat;
  try {
    rootStat = await fs.lstat(rootPath);
  } catch {
    return 0;
  }
  if (rootStat.isSymbolicLink()) {
    return 0;
  }
  if (rootStat.isFile()) {
    return rootPath.endsWith(".md") ? 1 : 0;
  }
  if (!rootStat.isDirectory()) {
    return 0;
  }

  let count = 0;
  const stack = [rootPath];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        count += 1;
      }
    }
  }
  return count;
}

function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function countIndexedSacredRows(params: { dbPath?: string; sacredRelativePath: string }): {
  files: number;
  chunks: number;
} {
  if (!params.dbPath || !fsSync.existsSync(params.dbPath)) {
    return { files: 0, chunks: 0 };
  }

  const db = new DatabaseSync(params.dbPath);
  try {
    const sacred = normalizeRelativePath(params.sacredRelativePath);
    const like = `${escapeLike(sacred)}/%`;
    const files = db
      .prepare(
        "SELECT COUNT(*) as c FROM files WHERE source = ? AND (path = ? OR path LIKE ? ESCAPE '\\')",
      )
      .get("memory", sacred, like) as { c?: number };
    const chunks = db
      .prepare(
        "SELECT COUNT(*) as c FROM chunks WHERE source = ? AND (path = ? OR path LIKE ? ESCAPE '\\')",
      )
      .get("memory", sacred, like) as { c?: number };
    return {
      files: files?.c ?? 0,
      chunks: chunks?.c ?? 0,
    };
  } catch {
    return { files: 0, chunks: 0 };
  } finally {
    db.close();
  }
}

function dateStamp(now: Date): string {
  const year = now.getUTCFullYear().toString();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function getDefaultBrainLogDir(): string {
  return path.join(
    process.env.HOME || process.env.USERPROFILE || ".",
    ".openclaw",
    "workspace",
    "logs",
    "brain",
  );
}

function resolveStatusFields(status: MemoryProviderStatus | undefined): {
  dbPath?: string;
  provider?: string;
  model?: string;
  extraPaths: string[];
} {
  if (!status) {
    return { extraPaths: [] };
  }
  return {
    dbPath: status.dbPath,
    provider: status.provider,
    model: status.model,
    extraPaths: status.extraPaths ?? [],
  };
}

export async function ingestSacredMemory(
  params: IngestionParams,
): Promise<BrainMemoryIngestionResult> {
  const now = params.now ?? (() => new Date());
  const startedAt = now();
  const reason = params.reason?.trim() || DEFAULT_SYNC_REASON;
  const sacredRelativePath = normalizeRelativePath(
    params.sacredRelativePath ?? DEFAULT_SACRED_MEMORY_RELATIVE_PATH,
  );
  const cfg = withSacredMemorySearchConfig({
    cfg: params.cfg,
    agentId: params.agentId,
    sacredRelativePath,
  });
  const workspaceResolver = params.workspaceResolver ?? resolveAgentWorkspaceDir;
  const workspaceDir = workspaceResolver(cfg, params.agentId);
  const sacredAbsPath = path.resolve(workspaceDir, sacredRelativePath);
  const sacredMarkdownFiles = await countMarkdownFiles(sacredAbsPath);
  const managerResolver = params.managerResolver ?? getMemorySearchManager;

  const managerResult = await managerResolver({
    cfg,
    agentId: params.agentId,
  });
  if (!managerResult.manager) {
    const finishedAt = now();
    return {
      ok: false,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      reason,
      agentId: params.agentId,
      workspaceDir,
      sacredRelativePath,
      sacredMarkdownFiles,
      indexedSacredFiles: 0,
      indexedSacredChunks: 0,
      extraPaths: [],
      error: managerResult.error ?? "memory manager unavailable",
    };
  }

  const manager = managerResult.manager;
  const statusBefore = resolveStatusFields(manager.status());

  try {
    if (manager.sync) {
      await manager.sync({
        reason,
        force: params.force,
        progress: params.progress,
      });
    }
    const statusAfter = resolveStatusFields(manager.status());
    const dbPath = statusAfter.dbPath ?? statusBefore.dbPath;
    const indexed = countIndexedSacredRows({
      dbPath,
      sacredRelativePath,
    });
    const finishedAt = now();
    return {
      ok: true,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      reason,
      agentId: params.agentId,
      workspaceDir,
      sacredRelativePath,
      sacredMarkdownFiles,
      indexedSacredFiles: indexed.files,
      indexedSacredChunks: indexed.chunks,
      dbPath,
      provider: statusAfter.provider ?? statusBefore.provider,
      model: statusAfter.model ?? statusBefore.model,
      extraPaths: dedupeExtraPaths([...statusBefore.extraPaths, ...statusAfter.extraPaths]),
    };
  } catch (err) {
    const finishedAt = now();
    return {
      ok: false,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      reason,
      agentId: params.agentId,
      workspaceDir,
      sacredRelativePath,
      sacredMarkdownFiles,
      indexedSacredFiles: 0,
      indexedSacredChunks: 0,
      dbPath: statusBefore.dbPath,
      provider: statusBefore.provider,
      model: statusBefore.model,
      extraPaths: statusBefore.extraPaths,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function createBrainMemoryIngestionEntry(
  result: BrainMemoryIngestionResult,
  options: BrainMemoryIngestionLogOptions = {},
): BrainMemoryIngestionEntry {
  const now = options.now ?? new Date();
  return {
    ts: now.toISOString(),
    event: "brain.memory.ingestion.observer",
    mode: "observer",
    source: options.source ?? DEFAULT_BRAIN_LOG_SOURCE,
    sessionKey: options.sessionKey,
    result,
  };
}

export function appendBrainMemoryIngestionEntry(
  entry: BrainMemoryIngestionEntry,
  baseDir?: string,
): string | null {
  try {
    const targetDir = baseDir ?? getDefaultBrainLogDir();
    fsSync.mkdirSync(targetDir, { recursive: true });
    const filePath = path.join(targetDir, `ingestion-${dateStamp(new Date(entry.ts))}.jsonl`);
    fsSync.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf-8");
    return filePath;
  } catch {
    return null;
  }
}

export function logBrainMemoryIngestionObserver(
  result: BrainMemoryIngestionResult,
  options: BrainMemoryIngestionLogOptions = {},
): string | null {
  const entry = createBrainMemoryIngestionEntry(result, options);
  return appendBrainMemoryIngestionEntry(entry, options.baseDir);
}
