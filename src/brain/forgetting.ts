import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { omLog } from "../agents/om-scaffolding.js";

const ACTIVE_FORGETTING_ENABLED_ENV = "OM_ACTIVE_FORGETTING_ENABLED";
const ACTIVE_FORGETTING_OBSERVATION_HOURS_ENV = "OM_ACTIVE_FORGETTING_OBSERVATION_HOURS";
const ACTIVE_FORGETTING_THRESHOLD_ENV = "OM_ACTIVE_FORGETTING_THRESHOLD";
const ACTIVE_FORGETTING_MAX_SCAN_ROWS_ENV = "OM_ACTIVE_FORGETTING_MAX_SCAN_ROWS";

const DEFAULT_FORGETTING_OBSERVATION_HOURS = 48;
const DEFAULT_FORGETTING_THRESHOLD = 0.62;
const DEFAULT_FORGETTING_MAX_SCAN_ROWS = 4000;
const MAX_FREQUENCY_FOR_NORMALIZATION = 8;

const SALIENCE_WEIGHTS = {
  recency: 0.45,
  frequency: 0.25,
  emotion: 0.3,
} as const;
const SALIENCE_LAMBDA = 0.08;

type EpisodicForgettingRow = {
  entry_id: string;
  created_at: number;
  score: number;
  signals: string;
  primary_kind: string;
};

export type ForgettingScoreBreakdown = {
  ageDays: number;
  frequencyCount: number;
  emotionValue: number;
  recencyTerm: number;
  frequencyTerm: number;
  emotionTerm: number;
  salience: number;
  forgettingScore: number;
};

export type ActiveForgettingCandidate = {
  entryId: string;
  forgettingScore: number;
};

export type ActiveForgettingDryRunSummary = {
  enabled: boolean;
  dryRun: true;
  observationWindowHours: number;
  forgettingThreshold: number;
  evaluatedCount: number;
  matureCount: number;
  candidatesCount: number;
  protectedCount: number;
  sampleCandidateEntryIds: string[];
  reason: string;
};

type ActiveForgettingPolicy = {
  enabled: boolean;
  observationWindowHours: number;
  forgettingThreshold: number;
  maxScanRows: number;
};

export type RunActiveForgettingDryRunInput = {
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
  if (!raw) {
    return fallback;
  }
  if (["0", "false", "off", "no"].includes(raw)) {
    return false;
  }
  if (["1", "true", "on", "yes"].includes(raw)) {
    return true;
  }
  return fallback;
}

function readEnvInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function readEnvNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function resolveActiveForgettingPolicy(): ActiveForgettingPolicy {
  return {
    enabled: readEnvBoolean(ACTIVE_FORGETTING_ENABLED_ENV, true),
    observationWindowHours: readEnvInteger(
      ACTIVE_FORGETTING_OBSERVATION_HOURS_ENV,
      DEFAULT_FORGETTING_OBSERVATION_HOURS,
      1,
      24 * 90,
    ),
    forgettingThreshold: readEnvNumber(
      ACTIVE_FORGETTING_THRESHOLD_ENV,
      DEFAULT_FORGETTING_THRESHOLD,
      0.05,
      0.99,
    ),
    maxScanRows: readEnvInteger(
      ACTIVE_FORGETTING_MAX_SCAN_ROWS_ENV,
      DEFAULT_FORGETTING_MAX_SCAN_ROWS,
      1,
      50000,
    ),
  };
}

function parseSignals(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length > 0),
  );
}

function resolveEmotionValue(row: Pick<EpisodicForgettingRow, "signals" | "score">): number {
  const signals = parseSignals(row.signals);
  if (signals.has("emotion")) {
    return 1;
  }
  if (signals.has("identity")) {
    return 0.8;
  }
  if (row.score >= 5) {
    return 0.35;
  }
  if (row.score >= 4) {
    return 0.25;
  }
  if (row.score >= 3) {
    return 0.15;
  }
  return 0.05;
}

export function evaluateForgettingScore(input: {
  ageDays: number;
  frequencyCount: number;
  emotionValue: number;
}): ForgettingScoreBreakdown {
  const ageDays = clamp(input.ageDays, 0, 3650);
  const frequencyCount = clamp(Math.floor(input.frequencyCount), 0, 1000);
  const emotionValue = clamp(input.emotionValue, 0, 1);

  const recencyTerm = SALIENCE_WEIGHTS.recency * Math.exp(-SALIENCE_LAMBDA * ageDays);
  const frequencyTerm =
    SALIENCE_WEIGHTS.frequency *
    clamp(Math.log(frequencyCount + 1) / Math.log(MAX_FREQUENCY_FOR_NORMALIZATION + 1), 0, 1);
  const emotionTerm = SALIENCE_WEIGHTS.emotion * emotionValue;
  const salience = clamp(recencyTerm + frequencyTerm + emotionTerm, 0, 1);
  const forgettingScore = clamp(1 - salience, 0, 1);

  return {
    ageDays,
    frequencyCount,
    emotionValue,
    recencyTerm,
    frequencyTerm,
    emotionTerm,
    salience,
    forgettingScore,
  };
}

function summarizeAndLog(params: {
  input: RunActiveForgettingDryRunInput;
  policy: ActiveForgettingPolicy;
  summary: ActiveForgettingDryRunSummary;
}): ActiveForgettingDryRunSummary {
  const sample = params.summary.sampleCandidateEntryIds.join(",");
  omLog(
    "BRAIN-FORGETTING",
    "DRY_RUN",
    [
      `runId=${params.input.runId}`,
      `sessionKey=${params.input.sessionKey ?? "n/a"}`,
      `enabled=${params.summary.enabled ? "yes" : "no"}`,
      `reason=${params.summary.reason}`,
      `evaluated=${params.summary.evaluatedCount}`,
      `mature=${params.summary.matureCount}`,
      `candidates=${params.summary.candidatesCount}`,
      `protected=${params.summary.protectedCount}`,
      `threshold=${params.policy.forgettingThreshold.toFixed(2)}`,
      `windowHours=${params.policy.observationWindowHours}`,
      `sample=${sample || "none"}`,
      "no_delete=yes",
    ].join(" "),
  );
  return params.summary;
}

export function runActiveForgettingDryRun(
  input: RunActiveForgettingDryRunInput,
): ActiveForgettingDryRunSummary {
  const policy = resolveActiveForgettingPolicy();
  const baseSummary = {
    enabled: policy.enabled,
    dryRun: true as const,
    observationWindowHours: policy.observationWindowHours,
    forgettingThreshold: policy.forgettingThreshold,
    evaluatedCount: 0,
    matureCount: 0,
    candidatesCount: 0,
    protectedCount: 0,
    sampleCandidateEntryIds: [],
  };

  if (!policy.enabled) {
    return summarizeAndLog({
      input,
      policy,
      summary: {
        ...baseSummary,
        reason: "disabled",
      },
    });
  }

  if (!fs.existsSync(input.metadataDbPath)) {
    return summarizeAndLog({
      input,
      policy,
      summary: {
        ...baseSummary,
        reason: "metadata-missing",
      },
    });
  }

  const nowMs = (input.now ?? new Date()).getTime();
  const minAgeHours = policy.observationWindowHours;

  try {
    const db = new DatabaseSync(input.metadataDbPath, { readOnly: true });
    try {
      const rows = db
        .prepare(
          `SELECT entry_id, created_at, score, signals, primary_kind
           FROM episodic_entries
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .all(policy.maxScanRows) as EpisodicForgettingRow[];

      if (rows.length === 0) {
        return summarizeAndLog({
          input,
          policy,
          summary: {
            ...baseSummary,
            reason: "no-entries",
          },
        });
      }

      const kindCounts = new Map<string, number>();
      for (const row of rows) {
        const kind = row.primary_kind.trim().toLowerCase() || "general";
        kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
      }

      const candidates: ActiveForgettingCandidate[] = [];
      let matureCount = 0;
      for (const row of rows) {
        const ageDays = clamp((nowMs - row.created_at) / (24 * 60 * 60 * 1000), 0, 3650);
        const ageHours = ageDays * 24;
        const kind = row.primary_kind.trim().toLowerCase() || "general";
        const frequencyCount = Math.max(0, (kindCounts.get(kind) ?? 1) - 1);
        const emotionValue = resolveEmotionValue(row);
        const score = evaluateForgettingScore({
          ageDays,
          frequencyCount,
          emotionValue,
        });
        if (ageHours < minAgeHours) {
          continue;
        }
        matureCount += 1;
        if (score.forgettingScore >= policy.forgettingThreshold) {
          candidates.push({
            entryId: row.entry_id,
            forgettingScore: score.forgettingScore,
          });
        }
      }

      candidates.sort((a, b) => b.forgettingScore - a.forgettingScore);
      const sample = candidates.slice(0, 5).map((entry) => entry.entryId);

      return summarizeAndLog({
        input,
        policy,
        summary: {
          ...baseSummary,
          evaluatedCount: rows.length,
          matureCount,
          candidatesCount: candidates.length,
          protectedCount: rows.length - candidates.length,
          sampleCandidateEntryIds: sample,
          reason: "evaluated",
        },
      });
    } finally {
      db.close();
    }
  } catch {
    return summarizeAndLog({
      input,
      policy,
      summary: {
        ...baseSummary,
        reason: "error",
      },
    });
  }
}
