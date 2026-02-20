import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { omLog } from "../agents/om-scaffolding.js";

const EPISODIC_INDEX_ENABLED_ENV = "OM_EPISODIC_INDEX_ENABLED";
const EPISODIC_INDEX_PATH_ENV = "OM_EPISODIC_INDEX_PATH";
const EPISODIC_INDEX_ACTIVE_DAYS_ENV = "OM_EPISODIC_INDEX_ACTIVE_DAYS";
const EPISODIC_INDEX_WINDOW_DAYS_ENV = "OM_EPISODIC_INDEX_WINDOW_DAYS";
const EPISODIC_INDEX_LONG_TERM_MIN_SCORE_ENV = "OM_EPISODIC_INDEX_LONG_TERM_MIN_SCORE";
const EPISODIC_INDEX_MAX_SCAN_ROWS_ENV = "OM_EPISODIC_INDEX_MAX_SCAN_ROWS";

const DEFAULT_EPISODIC_INDEX_RELATIVE_PATH = "memory/EPISODIC_INDEX.md";
const DEFAULT_EPISODIC_INDEX_ACTIVE_DAYS = 7;
const DEFAULT_EPISODIC_INDEX_WINDOW_DAYS = 30;
const DEFAULT_EPISODIC_INDEX_LONG_TERM_MIN_SCORE = 4;
const DEFAULT_EPISODIC_INDEX_MAX_SCAN_ROWS = 4000;
const MAX_ITEMS_PER_SECTION = 12;
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

type EpisodicIndexRow = {
  entry_id: string;
  created_at: number;
  ts: string;
  score: number;
  primary_kind: string;
  signals: string;
};

type EpisodicIndexPolicy = {
  enabled: boolean;
  activeDays: number;
  windowDays: number;
  longTermMinScore: number;
  maxScanRows: number;
};

type IndexedEntry = {
  entryId: string;
  createdAt: number;
  ts: string;
  score: number;
  primaryKind: string;
  signals: string[];
  ageDays: number;
};

export type EpisodicIndexSnapshot = {
  enabled: boolean;
  updated: boolean;
  path: string;
  reason: "updated" | "disabled" | "metadata-missing" | "no-entries" | "error";
  policy: {
    activeDays: number;
    windowDays: number;
    longTermMinScore: number;
  };
  counts: {
    evaluated: number;
    shortTermActive: number;
    shortTermWindow: number;
    longTermCandidates: number;
    archived: number;
  };
};

export type UpdateEpisodicIndexInput = {
  workspaceDir: string;
  metadataDbPath: string;
  runId: string;
  sessionKey?: string;
  now?: Date;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readEnvBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["0", "false", "off", "no"].includes(raw)) return false;
  if (["1", "true", "on", "yes"].includes(raw)) return true;
  return fallback;
}

function readEnvInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function resolvePolicy(): EpisodicIndexPolicy {
  const activeDays = readEnvInteger(
    EPISODIC_INDEX_ACTIVE_DAYS_ENV,
    DEFAULT_EPISODIC_INDEX_ACTIVE_DAYS,
    1,
    90,
  );
  const windowDaysRaw = readEnvInteger(
    EPISODIC_INDEX_WINDOW_DAYS_ENV,
    DEFAULT_EPISODIC_INDEX_WINDOW_DAYS,
    2,
    180,
  );
  const windowDays = Math.max(windowDaysRaw, activeDays);
  return {
    enabled: readEnvBoolean(EPISODIC_INDEX_ENABLED_ENV, true),
    activeDays,
    windowDays,
    longTermMinScore: readEnvInteger(
      EPISODIC_INDEX_LONG_TERM_MIN_SCORE_ENV,
      DEFAULT_EPISODIC_INDEX_LONG_TERM_MIN_SCORE,
      0,
      100,
    ),
    maxScanRows: readEnvInteger(
      EPISODIC_INDEX_MAX_SCAN_ROWS_ENV,
      DEFAULT_EPISODIC_INDEX_MAX_SCAN_ROWS,
      1,
      50000,
    ),
  };
}

function resolveEpisodicIndexPath(workspaceDir: string): string {
  const fromEnv = process.env[EPISODIC_INDEX_PATH_ENV]?.trim();
  const rel = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_EPISODIC_INDEX_RELATIVE_PATH;
  return path.resolve(workspaceDir, rel);
}

function parseSignals(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function normalizeEntry(row: EpisodicIndexRow, nowMs: number): IndexedEntry {
  return {
    entryId: row.entry_id,
    createdAt: row.created_at,
    ts: row.ts,
    score: row.score,
    primaryKind: row.primary_kind || "general",
    signals: parseSignals(row.signals),
    ageDays: clamp((nowMs - row.created_at) / MILLIS_PER_DAY, 0, 3650),
  };
}

function formatIndexLine(entry: IndexedEntry): string {
  const ageDays = Math.floor(entry.ageDays);
  const signals = entry.signals.length > 0 ? entry.signals.join(",") : "none";
  return `- [${entry.ts}] entry=${entry.entryId} score=${entry.score} kind=${entry.primaryKind} age_days=${ageDays} signals=${signals}`;
}

function sectionLines(entries: readonly IndexedEntry[]): string[] {
  return entries.slice(0, MAX_ITEMS_PER_SECTION).map((entry) => formatIndexLine(entry));
}

function buildIndexContent(params: {
  now: Date;
  runId: string;
  sessionKey?: string;
  policy: EpisodicIndexPolicy;
  allEntriesCount: number;
  shortTermActive: IndexedEntry[];
  shortTermWindow: IndexedEntry[];
  longTermCandidates: IndexedEntry[];
  archivedCount: number;
}): string {
  const shortActiveLines = sectionLines(params.shortTermActive);
  const shortWindowLines = sectionLines(params.shortTermWindow);
  const longTermLines = sectionLines(params.longTermCandidates);

  return [
    "# EPISODIC INDEX",
    "",
    "Kurzzeit/Langzeit Trennung fuer episodische Erinnerungen (deterministisch).",
    "",
    `- updated_at: ${params.now.toISOString()}`,
    `- run_id: ${params.runId}`,
    `- session_key: ${params.sessionKey ?? "n/a"}`,
    `- active_days: ${params.policy.activeDays}`,
    `- window_days: ${params.policy.windowDays}`,
    `- long_term_min_score: ${params.policy.longTermMinScore}`,
    "",
    "## Counts",
    `- evaluated: ${params.allEntriesCount}`,
    `- short_term_active: ${params.shortTermActive.length}`,
    `- short_term_window: ${params.shortTermWindow.length}`,
    `- long_term_candidates: ${params.longTermCandidates.length}`,
    `- archived: ${params.archivedCount}`,
    "",
    `## Short-Term Active (0-${params.policy.activeDays} days)`,
    ...(shortActiveLines.length > 0 ? shortActiveLines : ["- none"]),
    "",
    `## Short-Term Window (${params.policy.activeDays + 1}-${params.policy.windowDays} days)`,
    ...(shortWindowLines.length > 0 ? shortWindowLines : ["- none"]),
    "",
    `## Long-Term Candidates (> ${params.policy.windowDays} days and score >= ${params.policy.longTermMinScore})`,
    ...(longTermLines.length > 0 ? longTermLines : ["- none"]),
    "",
  ].join("\n");
}

function emptySnapshot(
  pathValue: string,
  policy: EpisodicIndexPolicy,
): Omit<EpisodicIndexSnapshot, "reason"> {
  return {
    enabled: policy.enabled,
    updated: false,
    path: pathValue,
    policy: {
      activeDays: policy.activeDays,
      windowDays: policy.windowDays,
      longTermMinScore: policy.longTermMinScore,
    },
    counts: {
      evaluated: 0,
      shortTermActive: 0,
      shortTermWindow: 0,
      longTermCandidates: 0,
      archived: 0,
    },
  };
}

export async function updateEpisodicIndex(
  input: UpdateEpisodicIndexInput,
): Promise<EpisodicIndexSnapshot> {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const policy = resolvePolicy();
  const indexPath = resolveEpisodicIndexPath(input.workspaceDir);
  const base = emptySnapshot(indexPath, policy);

  if (!policy.enabled) {
    return {
      ...base,
      reason: "disabled",
    };
  }

  if (!fs.existsSync(input.metadataDbPath)) {
    return {
      ...base,
      reason: "metadata-missing",
    };
  }

  try {
    const db = new DatabaseSync(input.metadataDbPath, { readOnly: true });
    try {
      const rows = db
        .prepare(
          `SELECT entry_id, created_at, ts, score, primary_kind, signals
           FROM episodic_entries
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .all(policy.maxScanRows) as EpisodicIndexRow[];

      if (rows.length === 0) {
        return {
          ...base,
          reason: "no-entries",
        };
      }

      const normalizedEntries = rows.map((row) => normalizeEntry(row, nowMs));
      const shortTermActive: IndexedEntry[] = [];
      const shortTermWindow: IndexedEntry[] = [];
      const longTermCandidates: IndexedEntry[] = [];
      let archivedCount = 0;

      for (const entry of normalizedEntries) {
        if (entry.ageDays <= policy.activeDays) {
          shortTermActive.push(entry);
          continue;
        }
        if (entry.ageDays <= policy.windowDays) {
          shortTermWindow.push(entry);
          continue;
        }
        if (entry.score >= policy.longTermMinScore) {
          longTermCandidates.push(entry);
          continue;
        }
        archivedCount += 1;
      }

      longTermCandidates.sort((a, b) => b.score - a.score || b.createdAt - a.createdAt);

      await fsPromises.mkdir(path.dirname(indexPath), { recursive: true });
      await fsPromises.writeFile(
        indexPath,
        buildIndexContent({
          now,
          runId: input.runId,
          sessionKey: input.sessionKey,
          policy,
          allEntriesCount: normalizedEntries.length,
          shortTermActive,
          shortTermWindow,
          longTermCandidates,
          archivedCount,
        }),
        "utf-8",
      );

      omLog(
        "BRAIN-EPISODIC-INDEX",
        "UPDATED",
        [
          `runId=${input.runId}`,
          `sessionKey=${input.sessionKey ?? "n/a"}`,
          `evaluated=${normalizedEntries.length}`,
          `active=${shortTermActive.length}`,
          `window=${shortTermWindow.length}`,
          `longTerm=${longTermCandidates.length}`,
          `archived=${archivedCount}`,
          `path=${indexPath}`,
        ].join(" "),
      );

      return {
        ...base,
        updated: true,
        reason: "updated",
        counts: {
          evaluated: normalizedEntries.length,
          shortTermActive: shortTermActive.length,
          shortTermWindow: shortTermWindow.length,
          longTermCandidates: longTermCandidates.length,
          archived: archivedCount,
        },
      };
    } finally {
      db.close();
    }
  } catch {
    return {
      ...base,
      reason: "error",
    };
  }
}
