/**
 * Gibbs-Helmholtz Engine (Phase H.3, Stage 2+3)
 *
 * Computes ΔG = ΔH_norm − T·ΔS per repressed episodic node.
 * High ΔG signals thermodynamic instability: the memory has accumulated enough
 * latent energy that the entropic barrier can no longer hold it down.
 *
 * Sign convention
 * ───────────────
 * The original design brief writes the eruption condition as "ΔG < 0". With
 * ΔH = latent_energy ∈ [0, 25] and T·ΔS ∈ [0, 1], ΔG is almost always
 * positive and can never become negative from accumulated pressure alone.
 *
 * We normalize ΔH to [0, 1] (dividing by SHADOW_LATENT_ENERGY_MAX) and use
 * ΔG ≥ threshold as the zone condition instead. All intended behavioral
 * properties are preserved:
 *   - High latent_energy → high ΔH_norm → high ΔG → closer to eruption ✓
 *   - Low temperature (panic) → T·ΔS shrinks → ΔG ≈ ΔH_norm → accelerated ✓
 *   - Diffuse memories (many signals, long text) → high ΔS → low ΔG → stable ✓
 *   - Focused traumas (few signals, short text) → low ΔS → high ΔG → fragile ✓
 *
 * Hysteresis and zone transitions
 * ────────────────────────────────
 * To prevent heartbeat-to-heartbeat oscillation, zone transitions follow two
 * rules:
 *
 *   1. Hysteresis band (GIBBS_HYSTERESIS_BAND = 0.05): A node only returns to
 *      a lower zone when ΔG drops BELOW the entry threshold minus the band.
 *      Example: a distortion node stays in distortion until ΔG < 0.20
 *      (not until ΔG < 0.25).
 *
 *   2. Distortion dwell requirement: A node can never jump directly from
 *      stable to eruption in a single heartbeat. It must have been classified
 *      as distortion in the previous evaluation before becoming an eruption
 *      candidate. This adds one heartbeat of organic inertia to every eruption.
 *
 * Zone state is persisted per-node in two new DB columns:
 *   - gibbs_zone       TEXT    DEFAULT 'stable'
 *   - gibbs_zone_since INTEGER DEFAULT 0   (ms timestamp of last zone change)
 * These are added via ALTER TABLE on first use, fail-open, following the same
 * migration pattern as repressed / latent_energy.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// ─── Constants ────────────────────────────────────────────────────────────────

// Relative path from workspaceDir — matches episodic-memory.ts default
const EPISODIC_DB_RELATIVE_PATH = "logs/brain/episodic-memory.sqlite";
const FLASHBACK_QUEUE_DIR = "logs/brain";

// ΔG zone thresholds (both ΔH_norm and ΔS are normalized to [0, 1]).
// Open calibration: lower these if Om never enters distortion in a live run.
export const GIBBS_DISTORTION_THRESHOLD = 0.25;
export const GIBBS_ERUPTION_THRESHOLD = 0.55;

// Hysteresis: a node only drops to a lower zone when ΔG falls this far below
// the entry threshold.  Prevents oscillation near zone boundaries.
export const GIBBS_HYSTERESIS_BAND = 0.05;

// ΔS normalization
// 6 = number of distinct EpisodicSignal types (preference|decision|identity|goal|long_turn|emotion)
const GIBBS_MAX_SIGNAL_TYPES = 6;
// 1500 chars is above the stored max per entry (MAX_USER_CHARS=560 + MAX_ASSISTANT_CHARS=900)
const GIBBS_TEXT_SCALE_CHARS = 1500;

// Must match episodic-memory.ts SHADOW_LATENT_ENERGY_MAX
const SHADOW_LATENT_ENERGY_MAX = 25;

// How many repressed nodes to evaluate per heartbeat
const GIBBS_MAX_ROWS = 80;

// At most this many distortion nodes are passed to the lateral inhibition injector.
// All distortion nodes are visible in distortionCount for observability.
export const GIBBS_MAX_DISTORTION_NODES = 2;

// ─── Public types ─────────────────────────────────────────────────────────────

export type GibbsZone = "stable" | "distortion" | "eruption";

export type GibbsNodeResult = {
  entryId: string;
  latentEnergy: number; // raw value from DB ∈ [0, 25]
  deltaH: number; // latentEnergy / SHADOW_LATENT_ENERGY_MAX ∈ [0, 1]
  deltaS: number; // entropy proxy ∈ [0, 1]
  deltaG: number; // deltaH − temperature·deltaS
  zone: GibbsZone; // zone after hysteresis
  previousZone: GibbsZone; // zone from previous heartbeat (for detecting transitions)
  zoneSinceMs: number; // timestamp when the current zone was entered (ms)
  zoneChanged: boolean; // true if zone changed this evaluation
  primaryKind: string;
  signals: string[];
  userText: string; // truncated to stored max
  assistantText: string; // truncated to stored max
};

export type GibbsEvalResult = {
  evaluatedCount: number; // total repressed nodes checked
  distortionCount: number; // all distortion nodes (may be > distortionNodes.length)
  temperature: number; // T used for this evaluation
  distortionNodes: GibbsNodeResult[]; // top GIBBS_MAX_DISTORTION_NODES for prompt injection
  eruptionCandidate: GibbsNodeResult | null; // single highest-ΔG eruption candidate
  anyZoneChanged: boolean; // true if any node changed zone this heartbeat
};

export type FlashbackQueueEntry = {
  entryId: string;
  primaryKind: string;
  signals: string[];
  userText: string;
  assistantText: string;
  eruptedAtMs: number;
};

export type EruptionResult = {
  entryId: string;
  previousLatentEnergy: number;
  newLatentEnergy: number;
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function resolveDbPath(workspaceDir: string): string {
  const fromEnv = process.env.OM_EPISODIC_METADATA_DB_PATH?.trim();
  const rel = fromEnv && fromEnv.length > 0 ? fromEnv : EPISODIC_DB_RELATIVE_PATH;
  return path.resolve(workspaceDir, rel);
}

function resolveFlashbackPath(workspaceDir: string, agentId?: string): string {
  const safeSuffix =
    agentId && agentId.trim().length > 0
      ? `.${agentId.trim().replace(/[^a-zA-Z0-9_-]/g, "_")}`
      : "";
  return path.resolve(workspaceDir, FLASHBACK_QUEUE_DIR, `flashback-queue${safeSuffix}.json`);
}

function clamp(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;
}

function parseSignals(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((s): s is string => typeof s === "string");
    }
  } catch {
    // fall through
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function coerceZone(raw: string | null | undefined): GibbsZone {
  if (raw === "distortion" || raw === "eruption") return raw;
  return "stable";
}

type GibbsRow = {
  entry_id: string;
  signals: string | null;
  primary_kind: string;
  user_text: string | null;
  assistant_text: string | null;
  latent_energy: number | null;
  gibbs_zone: string | null;
  gibbs_zone_since: number | null;
};

/**
 * Adds gibbs_zone and gibbs_zone_since columns if they don't exist yet.
 * Fail-open: schema migration must never block the engine.
 */
function ensureGibbsColumns(db: DatabaseSync): void {
  try {
    const tableInfo = db.prepare("PRAGMA table_info(episodic_entries)").all() as Array<{
      name?: unknown;
    }>;
    const has = (name: string) => tableInfo.some((c) => c.name === name);
    if (!has("gibbs_zone")) {
      db.exec(
        `ALTER TABLE episodic_entries ADD COLUMN gibbs_zone TEXT NOT NULL DEFAULT 'stable'`,
      );
    }
    if (!has("gibbs_zone_since")) {
      db.exec(`ALTER TABLE episodic_entries ADD COLUMN gibbs_zone_since INTEGER NOT NULL DEFAULT 0`);
    }
  } catch {
    // Fail-open: engine continues without hysteresis persistence if migration fails
  }
}

// ─── ΔS and ΔG formulas (exported for unit tests) ────────────────────────────

/**
 * Entropy proxy ΔS ∈ [0, 1].
 *
 * Two components, weighted equally:
 *   signalEntropy: how many distinct signal types tagged this memory.
 *                  Many signals = diffuse = high entropy → harder to break out.
 *   textEntropy:   combined length of the stored user+assistant text.
 *                  Long text = dense = high entropy → harder to break out.
 */
export function computeDeltaS(signalCount: number, textLength: number): number {
  const signalEntropy = clamp(signalCount / GIBBS_MAX_SIGNAL_TYPES, 0, 1);
  const textEntropy = clamp(textLength / GIBBS_TEXT_SCALE_CHARS, 0, 1);
  return signalEntropy * 0.5 + textEntropy * 0.5;
}

/**
 * Free energy ΔG = ΔH_norm − T·ΔS, clamped to [-1, 1].
 * All arguments must already be normalized to [0, 1].
 */
export function computeDeltaG(deltaH: number, temperature: number, deltaS: number): number {
  return clamp(deltaH - temperature * deltaS, -1, 1);
}

/**
 * Classifies the raw ΔG value into a zone with hysteresis applied.
 *
 * Transition rules:
 *   stable    → distortion : ΔG ≥ DISTORTION_THRESHOLD
 *   stable    → eruption   : blocked — must pass through distortion first
 *   distortion → stable    : ΔG < DISTORTION_THRESHOLD − HYSTERESIS_BAND
 *   distortion → eruption  : ΔG ≥ ERUPTION_THRESHOLD  (dwell already met)
 *   eruption   → distortion: ΔG < ERUPTION_THRESHOLD  − HYSTERESIS_BAND
 *   eruption   → stable    : blocked — must pass through distortion first
 */
export function applyHysteresis(previousZone: GibbsZone, deltaG: number): GibbsZone {
  const rawZone: GibbsZone =
    deltaG >= GIBBS_ERUPTION_THRESHOLD
      ? "eruption"
      : deltaG >= GIBBS_DISTORTION_THRESHOLD
        ? "distortion"
        : "stable";

  if (previousZone === "stable") {
    // Cannot jump directly to eruption from stable: must dwell in distortion first
    if (rawZone === "eruption") return "distortion";
    return rawZone;
  }

  if (previousZone === "distortion") {
    // Downward hysteresis: don't return to stable unless ΔG is clearly below threshold
    if (rawZone === "stable" && deltaG >= GIBBS_DISTORTION_THRESHOLD - GIBBS_HYSTERESIS_BAND) {
      return "distortion"; // hold
    }
    return rawZone;
  }

  // previousZone === "eruption"
  // Downward hysteresis for eruption threshold
  if (rawZone === "distortion" && deltaG >= GIBBS_ERUPTION_THRESHOLD - GIBBS_HYSTERESIS_BAND) {
    return "eruption"; // hold
  }
  // Cannot fall directly from eruption to stable — must pass through distortion
  if (rawZone === "stable") return "distortion";
  return rawZone;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Reads all repressed nodes with latent_energy > 0 from the SQLite DB,
 * computes their ΔG, applies hysteresis, persists zone state, and returns
 * distortion candidates and the single best eruption candidate.
 *
 * Returns null if the DB doesn't exist, is missing required columns, or on
 * any unexpected error (always fail-open).
 */
export async function evaluateGibbsEnergy(params: {
  workspaceDir: string;
  temperature: number;
}): Promise<GibbsEvalResult | null> {
  const dbPath = resolveDbPath(params.workspaceDir);
  try {
    await fs.stat(dbPath);
  } catch {
    return null;
  }

  const temperature = clamp(params.temperature, 0.01, 1.0);
  const nowMs = Date.now();

  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(dbPath);

    // Guard against stale schema (missing columns from older installs)
    const tableInfo = db.prepare("PRAGMA table_info(episodic_entries)").all() as Array<{
      name?: unknown;
    }>;
    const cols = new Set(tableInfo.map((c) => String(c.name ?? "")));
    if (!cols.has("repressed") || !cols.has("latent_energy")) return null;

    // Migrate gibbs_zone columns if needed (idempotent, fail-open)
    ensureGibbsColumns(db);

    // Query highest-energy repressed nodes first so we find the eruption candidate
    // without a second pass.
    const rows = db
      .prepare(
        `SELECT entry_id, signals, primary_kind, user_text, assistant_text,
                latent_energy, gibbs_zone, gibbs_zone_since
           FROM episodic_entries
          WHERE COALESCE(repressed, 0) = 1
            AND COALESCE(latent_energy, 0) > 0
          ORDER BY latent_energy DESC
          LIMIT ${GIBBS_MAX_ROWS}`,
      )
      .all() as GibbsRow[];

    const updateZoneStmt = db.prepare(
      "UPDATE episodic_entries SET gibbs_zone = ?, gibbs_zone_since = ? WHERE entry_id = ?",
    );

    const distortionNodes: GibbsNodeResult[] = [];
    let eruptionCandidate: GibbsNodeResult | null = null;
    let anyZoneChanged = false;
    let distortionCount = 0;

    for (const row of rows) {
      const latentEnergy = clamp(Number(row.latent_energy ?? 0), 0, SHADOW_LATENT_ENERGY_MAX);
      if (latentEnergy <= 0) continue;

      const previousZone = coerceZone(row.gibbs_zone);
      const prevSince = Number(row.gibbs_zone_since ?? 0);

      const signals = parseSignals(row.signals);
      const userText = (row.user_text ?? "").slice(0, 560);
      const assistantText = (row.assistant_text ?? "").slice(0, 900);
      const textLength = userText.length + assistantText.length;

      const deltaH = clamp(latentEnergy / SHADOW_LATENT_ENERGY_MAX, 0, 1);
      const deltaS = computeDeltaS(signals.length, textLength);
      const deltaG = computeDeltaG(deltaH, temperature, deltaS);
      const zone = applyHysteresis(previousZone, deltaG);

      const zoneChanged = zone !== previousZone;
      const zoneSinceMs = zoneChanged ? nowMs : prevSince;

      if (zoneChanged) {
        anyZoneChanged = true;
        try {
          updateZoneStmt.run(zone, zoneSinceMs, row.entry_id);
        } catch {
          // Fail-open: zone persistence is observability — don't block
        }
      }

      if (zone === "stable") continue;

      const node: GibbsNodeResult = {
        entryId: row.entry_id,
        latentEnergy,
        deltaH,
        deltaS,
        deltaG,
        zone,
        previousZone,
        zoneSinceMs,
        zoneChanged,
        primaryKind: row.primary_kind ?? "general",
        signals,
        userText,
        assistantText,
      };

      if (zone === "eruption") {
        if (!eruptionCandidate || deltaG > eruptionCandidate.deltaG) {
          eruptionCandidate = node;
        }
      } else {
        // zone === "distortion"
        distortionCount += 1;
        distortionNodes.push(node);
      }
    }

    distortionNodes.sort((a, b) => b.deltaG - a.deltaG);

    return {
      evaluatedCount: rows.length,
      distortionCount,
      temperature,
      distortionNodes: distortionNodes.slice(0, GIBBS_MAX_DISTORTION_NODES),
      eruptionCandidate,
      anyZoneChanged,
    };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Executes a single-node eruption:
 *   - Sets repressed = 0  (de-represses; removes from the shadow pool)
 *   - Halves latent_energy (preserves the trace; prevents re-eruption if
 *     the node gets repressed again later)
 *   - Resets gibbs_zone to 'stable' so the node starts fresh if ever re-repressed
 *
 * Returns null on any error (fail-open: caller logs and continues).
 */
export async function executeEruption(params: {
  workspaceDir: string;
  entryId: string;
  latentEnergy: number;
}): Promise<EruptionResult | null> {
  const dbPath = resolveDbPath(params.workspaceDir);
  try {
    await fs.stat(dbPath);
  } catch {
    return null;
  }

  const newLatentEnergy = params.latentEnergy / 2;

  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(dbPath);
    // Ensure gibbs_zone columns exist before updating them (idempotent, fail-open)
    ensureGibbsColumns(db);
    db
      .prepare(
        `UPDATE episodic_entries
            SET repressed = 0, latent_energy = ?, gibbs_zone = 'stable', gibbs_zone_since = 0
          WHERE entry_id = ?`,
      )
      .run(newLatentEnergy, params.entryId);
    return {
      entryId: params.entryId,
      previousLatentEnergy: params.latentEnergy,
      newLatentEnergy,
    };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Persists a flashback entry to the agent-scoped queue file.
 * The file is consumed (read + deleted) at the START of the next heartbeat's
 * pre-run inject phase, provided the defibrillator is inactive.
 */
export async function writeFlashbackQueue(params: {
  workspaceDir: string;
  agentId?: string;
  entry: FlashbackQueueEntry;
}): Promise<void> {
  const queuePath = resolveFlashbackPath(params.workspaceDir, params.agentId);
  await fs.mkdir(path.dirname(queuePath), { recursive: true });
  await fs.writeFile(queuePath, JSON.stringify(params.entry, null, 2), "utf-8");
}

/**
 * Reads and atomically deletes the agent-scoped flashback queue file.
 * Returns null if no pending flashback exists or on any parse/IO error
 * (always fail-open).
 */
export async function consumeFlashbackQueue(params: {
  workspaceDir: string;
  agentId?: string;
}): Promise<FlashbackQueueEntry | null> {
  const queuePath = resolveFlashbackPath(params.workspaceDir, params.agentId);
  let raw: string;
  try {
    raw = await fs.readFile(queuePath, "utf-8");
  } catch {
    return null;
  }

  // Delete before parsing so a crash in the parse block doesn't replay the flashback
  try {
    await fs.rm(queuePath, { force: true });
  } catch {
    // fail-open
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const r = parsed as Record<string, unknown>;
    if (typeof r.entryId !== "string") return null;
    return {
      entryId: r.entryId,
      primaryKind: typeof r.primaryKind === "string" ? r.primaryKind : "general",
      signals: Array.isArray(r.signals)
        ? (r.signals as unknown[]).filter((s): s is string => typeof s === "string")
        : [],
      userText: typeof r.userText === "string" ? r.userText : "",
      assistantText: typeof r.assistantText === "string" ? r.assistantText : "",
      eruptedAtMs: typeof r.eruptedAtMs === "number" ? r.eruptedAtMs : 0,
    };
  } catch {
    return null;
  }
}
