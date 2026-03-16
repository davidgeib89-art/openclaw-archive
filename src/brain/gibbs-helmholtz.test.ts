import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyHysteresis,
  computeDeltaG,
  computeDeltaS,
  consumeFlashbackQueue,
  evaluateGibbsEnergy,
  executeEruption,
  GIBBS_DISTORTION_THRESHOLD,
  GIBBS_ERUPTION_THRESHOLD,
  GIBBS_HYSTERESIS_BAND,
  writeFlashbackQueue,
  type FlashbackQueueEntry,
} from "./gibbs-helmholtz.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeTmpDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function makeDb(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS episodic_entries (
      entry_id        TEXT    PRIMARY KEY,
      created_at      INTEGER NOT NULL DEFAULT 0,
      score           REAL    NOT NULL DEFAULT 0,
      signals         TEXT,
      primary_kind    TEXT    NOT NULL DEFAULT 'general',
      user_text       TEXT,
      assistant_text  TEXT,
      repressed       INTEGER NOT NULL DEFAULT 0,
      repression_weight REAL  NOT NULL DEFAULT 0,
      latent_energy   REAL    NOT NULL DEFAULT 0
    )
  `);
  return db;
}

function insertEntry(
  db: DatabaseSync,
  entry: {
    entryId: string;
    repressed?: number;
    latentEnergy?: number;
    signals?: string;
    primaryKind?: string;
    userText?: string;
    assistantText?: string;
  },
): void {
  db.prepare(
    `INSERT INTO episodic_entries
       (entry_id, created_at, repressed, latent_energy, signals, primary_kind, user_text, assistant_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.entryId,
    Date.now(),
    entry.repressed ?? 0,
    entry.latentEnergy ?? 0,
    entry.signals ?? null,
    entry.primaryKind ?? "general",
    entry.userText ?? "test user message",
    entry.assistantText ?? "test assistant reply",
  );
}

// ─── Pure formula tests ───────────────────────────────────────────────────────

describe("computeDeltaS", () => {
  it("returns 0 for zero signals and zero text", () => {
    expect(computeDeltaS(0, 0)).toBe(0);
  });

  it("returns 1 for maximum signals and maximum text", () => {
    expect(computeDeltaS(6, 1500)).toBe(1);
  });

  it("clamps signal count above MAX_SIGNAL_TYPES", () => {
    expect(computeDeltaS(100, 0)).toBeCloseTo(0.5, 5);
  });

  it("clamps text length above TEXT_SCALE_CHARS", () => {
    expect(computeDeltaS(0, 99999)).toBeCloseTo(0.5, 5);
  });

  it("gives equal weight to signals and text", () => {
    expect(computeDeltaS(6, 0)).toBeCloseTo(0.5, 5); // signal only
    expect(computeDeltaS(0, 1500)).toBeCloseTo(0.5, 5); // text only
  });

  it("produces 0.5 for mid-range inputs", () => {
    expect(computeDeltaS(3, 750)).toBeCloseTo(0.5, 5);
  });
});

describe("computeDeltaG", () => {
  it("increases with higher ΔH", () => {
    expect(computeDeltaG(0.8, 0.5, 0.3)).toBeGreaterThan(computeDeltaG(0.2, 0.5, 0.3));
  });

  it("is higher at low temperature (panic accelerates flashback)", () => {
    expect(computeDeltaG(0.5, 0.1, 0.5)).toBeGreaterThan(computeDeltaG(0.5, 0.9, 0.5));
  });

  it("decreases with higher ΔS (diffuse memories are harder to break through)", () => {
    expect(computeDeltaG(0.6, 0.5, 0.1)).toBeGreaterThan(computeDeltaG(0.6, 0.5, 0.9));
  });

  it("equals ΔH exactly when temperature is 0", () => {
    expect(computeDeltaG(0.7, 0, 0.5)).toBeCloseTo(0.7, 5);
  });

  it("is clamped to [-1, 1]", () => {
    expect(computeDeltaG(2, 0, 0)).toBe(1);
    expect(computeDeltaG(-2, 0, 0)).toBe(-1);
  });
});

// ─── Hysteresis tests ─────────────────────────────────────────────────────────

describe("applyHysteresis", () => {
  it("stable → stable when ΔG is below distortion threshold", () => {
    expect(applyHysteresis("stable", GIBBS_DISTORTION_THRESHOLD - 0.01)).toBe("stable");
  });

  it("stable → distortion when ΔG meets distortion threshold", () => {
    expect(applyHysteresis("stable", GIBBS_DISTORTION_THRESHOLD)).toBe("distortion");
  });

  it("stable → distortion (NOT eruption) even when ΔG exceeds eruption threshold", () => {
    // Cannot jump directly from stable to eruption — must dwell in distortion first
    expect(applyHysteresis("stable", GIBBS_ERUPTION_THRESHOLD + 0.1)).toBe("distortion");
  });

  it("distortion → distortion when ΔG drops within hysteresis band", () => {
    const inBand = GIBBS_DISTORTION_THRESHOLD - GIBBS_HYSTERESIS_BAND + 0.01;
    expect(applyHysteresis("distortion", inBand)).toBe("distortion");
  });

  it("distortion → stable when ΔG drops clearly below threshold", () => {
    const clearlyBelow = GIBBS_DISTORTION_THRESHOLD - GIBBS_HYSTERESIS_BAND - 0.01;
    expect(applyHysteresis("distortion", clearlyBelow)).toBe("stable");
  });

  it("distortion → eruption when ΔG exceeds eruption threshold", () => {
    expect(applyHysteresis("distortion", GIBBS_ERUPTION_THRESHOLD)).toBe("eruption");
  });

  it("eruption → eruption when ΔG drops within eruption hysteresis band", () => {
    const inBand = GIBBS_ERUPTION_THRESHOLD - GIBBS_HYSTERESIS_BAND + 0.01;
    expect(applyHysteresis("eruption", inBand)).toBe("eruption");
  });

  it("eruption → distortion when ΔG drops clearly below eruption threshold", () => {
    const clearlyBelow = GIBBS_ERUPTION_THRESHOLD - GIBBS_HYSTERESIS_BAND - 0.01;
    expect(applyHysteresis("eruption", clearlyBelow)).toBe("distortion");
  });

  it("eruption cannot fall directly to stable — must pass through distortion", () => {
    // Even if ΔG is clearly below distortion threshold, eruption → distortion (not stable)
    expect(applyHysteresis("eruption", 0)).toBe("distortion");
  });
});

// ─── evaluateGibbsEnergy integration tests ───────────────────────────────────

describe("evaluateGibbsEnergy – basic", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
    delete process.env.OM_EPISODIC_METADATA_DB_PATH;
  });

  it("returns null when DB does not exist", async () => {
    tmpDir = await makeTmpDir("gibbs-no-db-");
    expect(await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 0.7 })).toBeNull();
  });

  it("returns empty result when no repressed entries exist", async () => {
    tmpDir = await makeTmpDir("gibbs-empty-");
    process.env.OM_EPISODIC_METADATA_DB_PATH = path.join(tmpDir, "ep.sqlite");
    const db = makeDb(process.env.OM_EPISODIC_METADATA_DB_PATH);
    insertEntry(db, { entryId: "active-1", repressed: 0, latentEnergy: 20 });
    db.close();

    const result = await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 0.7 });
    expect(result).not.toBeNull();
    expect(result!.evaluatedCount).toBe(0);
    expect(result!.distortionNodes).toHaveLength(0);
    expect(result!.eruptionCandidate).toBeNull();
  });

  it("adds gibbs_zone columns to the DB (schema migration)", async () => {
    tmpDir = await makeTmpDir("gibbs-migration-");
    process.env.OM_EPISODIC_METADATA_DB_PATH = path.join(tmpDir, "ep.sqlite");
    const db = makeDb(process.env.OM_EPISODIC_METADATA_DB_PATH);
    insertEntry(db, { entryId: "mig-1", repressed: 1, latentEnergy: 5 });
    db.close();

    await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 0.5 });

    const verify = new DatabaseSync(process.env.OM_EPISODIC_METADATA_DB_PATH);
    const info = verify.prepare("PRAGMA table_info(episodic_entries)").all() as Array<{ name: string }>;
    verify.close();
    const cols = info.map((c) => c.name);
    expect(cols).toContain("gibbs_zone");
    expect(cols).toContain("gibbs_zone_since");
  });

  it("stable node (low energy, high temperature, high entropy) produces no candidates", async () => {
    tmpDir = await makeTmpDir("gibbs-stable-");
    process.env.OM_EPISODIC_METADATA_DB_PATH = path.join(tmpDir, "ep.sqlite");
    const db = makeDb(process.env.OM_EPISODIC_METADATA_DB_PATH);
    insertEntry(db, {
      entryId: "stable-1",
      repressed: 1,
      latentEnergy: 2,
      signals: '["preference","decision","identity","goal","long_turn","emotion"]',
      userText: "a".repeat(560),
      assistantText: "b".repeat(900),
    });
    db.close();

    const result = await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 1.0 });
    expect(result!.distortionNodes).toHaveLength(0);
    expect(result!.eruptionCandidate).toBeNull();
  });
});

// ─── Zone transition and hysteresis integration tests ─────────────────────────

describe("evaluateGibbsEnergy – zone transitions with hysteresis", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
    delete process.env.OM_EPISODIC_METADATA_DB_PATH;
  });

  it("node enters distortion on first eval when ΔG ≥ DISTORTION_THRESHOLD at panic T", async () => {
    tmpDir = await makeTmpDir("gibbs-dist-enter-");
    process.env.OM_EPISODIC_METADATA_DB_PATH = path.join(tmpDir, "ep.sqlite");
    const db = makeDb(process.env.OM_EPISODIC_METADATA_DB_PATH);
    // latentEnergy=10 → ΔH=0.4; 1 signal, short text → ΔS≈0.08; T=0.1 → ΔG≈0.39
    insertEntry(db, { entryId: "dist-1", repressed: 1, latentEnergy: 10, signals: '["preference"]', userText: "short", assistantText: "reply" });
    db.close();

    const result = await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 0.1 });
    expect(result!.distortionCount).toBeGreaterThan(0);
    const node = result!.distortionNodes[0]!;
    expect(node.zone).toBe("distortion");
    expect(node.previousZone).toBe("stable");
    expect(node.zoneChanged).toBe(true);
    expect(result!.anyZoneChanged).toBe(true);
  });

  it("node does NOT jump to eruption on first eval even at max energy and panic T (must dwell)", async () => {
    tmpDir = await makeTmpDir("gibbs-nodirect-");
    process.env.OM_EPISODIC_METADATA_DB_PATH = path.join(tmpDir, "ep.sqlite");
    const db = makeDb(process.env.OM_EPISODIC_METADATA_DB_PATH);
    insertEntry(db, { entryId: "no-jump-1", repressed: 1, latentEnergy: 25, signals: '["identity"]', userText: "a", assistantText: "b" });
    db.close();

    const result = await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 0.1 });
    // Must be in distortion (not eruption) on first eval
    expect(result!.eruptionCandidate).toBeNull();
    expect(result!.distortionCount).toBe(1);
    expect(result!.distortionNodes[0]!.zone).toBe("distortion");
  });

  it("node enters eruption on second eval after dwelling in distortion", async () => {
    tmpDir = await makeTmpDir("gibbs-dwell-");
    process.env.OM_EPISODIC_METADATA_DB_PATH = path.join(tmpDir, "ep.sqlite");
    const db = makeDb(process.env.OM_EPISODIC_METADATA_DB_PATH);
    insertEntry(db, { entryId: "dwell-1", repressed: 1, latentEnergy: 25, signals: '["identity"]', userText: "a", assistantText: "b" });
    db.close();

    // First eval: enters distortion
    await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 0.1 });

    // Second eval: now eligible for eruption (previousZone = distortion)
    const result2 = await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 0.1 });
    expect(result2!.eruptionCandidate).not.toBeNull();
    expect(result2!.eruptionCandidate!.entryId).toBe("dwell-1");
    expect(result2!.eruptionCandidate!.zone).toBe("eruption");
    expect(result2!.eruptionCandidate!.previousZone).toBe("distortion");
  });

  it("single-node rule: only the highest-ΔG node becomes the eruption candidate", async () => {
    tmpDir = await makeTmpDir("gibbs-single-node-");
    process.env.OM_EPISODIC_METADATA_DB_PATH = path.join(tmpDir, "ep.sqlite");
    const db = makeDb(process.env.OM_EPISODIC_METADATA_DB_PATH);
    insertEntry(db, { entryId: "high-1", repressed: 1, latentEnergy: 25, signals: '["identity"]', userText: "a", assistantText: "b" });
    insertEntry(db, { entryId: "high-2", repressed: 1, latentEnergy: 23, signals: '["identity"]', userText: "c", assistantText: "d" });
    db.close();

    // First eval: both enter distortion
    await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 0.1 });

    // Second eval: both are eligible; highest-ΔG wins
    const result = await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 0.1 });
    expect(result!.eruptionCandidate).not.toBeNull();
    expect(result!.eruptionCandidate!.entryId).toBe("high-1");
    // Eruption candidate must NOT appear in distortionNodes
    expect(result!.distortionNodes.map((n) => n.entryId)).not.toContain("high-1");
  });

  it("node stays in distortion when ΔG drops within hysteresis band", async () => {
    tmpDir = await makeTmpDir("gibbs-hysteresis-");
    process.env.OM_EPISODIC_METADATA_DB_PATH = path.join(tmpDir, "ep.sqlite");
    const db = makeDb(process.env.OM_EPISODIC_METADATA_DB_PATH);
    // latentEnergy=9 → ΔH=0.36; no signals, short text → ΔS≈0; T=0.1 → ΔG≈0.36 (distortion)
    insertEntry(db, { entryId: "hyst-1", repressed: 1, latentEnergy: 9, signals: null, userText: "a", assistantText: "b" });
    db.close();

    // First eval at T=0.1: enters distortion
    const r1 = await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 0.1 });
    expect(r1!.distortionCount).toBe(1);

    // Second eval at higher T (ΔG drops but stays within hysteresis band of 0.25):
    // ΔG = 0.36 - 0.7 * ~0.03 ≈ 0.34 → still above 0.25 - 0.05 = 0.20 → hysteresis holds
    const r2 = await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 0.7 });
    expect(r2!.distortionCount).toBe(1); // still in distortion despite calmer T
    expect(r2!.distortionNodes[0]!.zoneChanged).toBe(false); // no transition
  });

  it("node returns to stable when ΔG drops clearly below exit threshold", async () => {
    tmpDir = await makeTmpDir("gibbs-return-stable-");
    process.env.OM_EPISODIC_METADATA_DB_PATH = path.join(tmpDir, "ep.sqlite");
    const db = makeDb(process.env.OM_EPISODIC_METADATA_DB_PATH);
    // ΔH=0.36 (latentEnergy=9); ΔS≈0.67 (6 signals, 500 chars of text)
    // At T=0.1: ΔG = 0.36 - 0.1×0.67 = 0.293 → distortion
    // At T=1.0: ΔG = 0.36 - 1.0×0.67 = -0.31 → clearly below exit threshold (0.20) → stable
    insertEntry(db, {
      entryId: "ret-1",
      repressed: 1,
      latentEnergy: 9,
      signals: '["preference","decision","identity","goal","long_turn","emotion"]',
      userText: "a".repeat(200),
      assistantText: "b".repeat(300),
    });
    db.close();

    // First eval at T=0.1: enters distortion
    const r1 = await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 0.1 });
    expect(r1!.distortionCount).toBe(1);

    // Second eval at T=1.0 (calm): ΔG ≈ -0.31 → clearly below exit threshold → returns to stable
    const r2 = await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 1.0 });
    expect(r2!.distortionCount).toBe(0);
    expect(r2!.eruptionCandidate).toBeNull();
  });

  it("distortionCount reflects all distortion nodes, distortionNodes is capped at GIBBS_MAX_DISTORTION_NODES", async () => {
    tmpDir = await makeTmpDir("gibbs-count-");
    process.env.OM_EPISODIC_METADATA_DB_PATH = path.join(tmpDir, "ep.sqlite");
    const db = makeDb(process.env.OM_EPISODIC_METADATA_DB_PATH);
    // Three nodes that will enter distortion but not eruption
    for (let i = 1; i <= 3; i++) {
      insertEntry(db, {
        entryId: `count-${i}`,
        repressed: 1,
        latentEnergy: 7 + i, // 8, 9, 10 → ΔH 0.32, 0.36, 0.40; short text → ΔS≈0; T=0.1 → ΔG > 0.25
        signals: null,
        userText: "a",
        assistantText: "b",
      });
    }
    db.close();

    // First eval: all three enter distortion (won't become eruption candidates yet)
    const r = await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 0.1 });
    expect(r!.distortionCount).toBe(3);
    expect(r!.distortionNodes.length).toBeLessThanOrEqual(2); // capped at GIBBS_MAX_DISTORTION_NODES
  });

  it("anyZoneChanged is false when all nodes stay in their current zone", async () => {
    tmpDir = await makeTmpDir("gibbs-no-change-");
    process.env.OM_EPISODIC_METADATA_DB_PATH = path.join(tmpDir, "ep.sqlite");
    const db = makeDb(process.env.OM_EPISODIC_METADATA_DB_PATH);
    insertEntry(db, { entryId: "nochange-1", repressed: 1, latentEnergy: 10, signals: '["preference"]', userText: "short", assistantText: "reply" });
    db.close();

    await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 0.1 }); // enters distortion
    const r2 = await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 0.1 }); // stays in distortion
    expect(r2!.anyZoneChanged).toBe(false);
    expect(r2!.distortionNodes[0]!.zoneChanged).toBe(false);
  });
});

// ─── executeEruption tests ────────────────────────────────────────────────────

describe("executeEruption", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
    delete process.env.OM_EPISODIC_METADATA_DB_PATH;
  });

  it("sets repressed=0, halves latent_energy, and resets gibbs_zone to stable", async () => {
    tmpDir = await makeTmpDir("gibbs-exec-");
    process.env.OM_EPISODIC_METADATA_DB_PATH = path.join(tmpDir, "ep.sqlite");
    const db = makeDb(process.env.OM_EPISODIC_METADATA_DB_PATH);
    insertEntry(db, { entryId: "erupt-1", repressed: 1, latentEnergy: 20 });
    // Simulate a pre-existing zone state
    db.exec(`ALTER TABLE episodic_entries ADD COLUMN gibbs_zone TEXT NOT NULL DEFAULT 'stable'`);
    db.prepare("UPDATE episodic_entries SET gibbs_zone = 'eruption' WHERE entry_id = 'erupt-1'").run();
    db.close();

    const result = await executeEruption({ workspaceDir: tmpDir, entryId: "erupt-1", latentEnergy: 20 });
    expect(result).not.toBeNull();
    expect(result!.previousLatentEnergy).toBe(20);
    expect(result!.newLatentEnergy).toBe(10);

    const verify = new DatabaseSync(process.env.OM_EPISODIC_METADATA_DB_PATH);
    const row = verify
      .prepare("SELECT repressed, latent_energy, gibbs_zone FROM episodic_entries WHERE entry_id = ?")
      .get("erupt-1") as { repressed: number; latent_energy: number; gibbs_zone: string };
    verify.close();
    expect(row.repressed).toBe(0);
    expect(row.latent_energy).toBe(10);
    expect(row.gibbs_zone).toBe("stable");
  });

  it("returns null when DB does not exist", async () => {
    tmpDir = await makeTmpDir("gibbs-exec-nodb-");
    expect(await executeEruption({ workspaceDir: tmpDir, entryId: "ghost", latentEnergy: 10 })).toBeNull();
  });

  it("de-repressed node is excluded from the next evaluateGibbsEnergy call", async () => {
    tmpDir = await makeTmpDir("gibbs-excluded-");
    process.env.OM_EPISODIC_METADATA_DB_PATH = path.join(tmpDir, "ep.sqlite");
    const db = makeDb(process.env.OM_EPISODIC_METADATA_DB_PATH);
    insertEntry(db, { entryId: "ex-1", repressed: 1, latentEnergy: 25, signals: '["identity"]', userText: "a", assistantText: "b" });
    db.close();

    await executeEruption({ workspaceDir: tmpDir, entryId: "ex-1", latentEnergy: 25 });
    const result = await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 0.1 });
    expect(result!.eruptionCandidate).toBeNull();
    expect(result!.distortionCount).toBe(0);
  });
});

// ─── Flashback queue tests ────────────────────────────────────────────────────

describe("flashback queue", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns null when no queue file exists", async () => {
    tmpDir = await makeTmpDir("gibbs-fq-empty-");
    expect(await consumeFlashbackQueue({ workspaceDir: tmpDir })).toBeNull();
  });

  it("round-trips a full entry through write → consume", async () => {
    tmpDir = await makeTmpDir("gibbs-fq-roundtrip-");
    const entry: FlashbackQueueEntry = {
      entryId: "fq-1",
      primaryKind: "identity",
      signals: ["preference", "emotion"],
      userText: "Something important happened.",
      assistantText: "I remember this now.",
      eruptedAtMs: 1234567890,
    };

    await writeFlashbackQueue({ workspaceDir: tmpDir, entry });
    const consumed = await consumeFlashbackQueue({ workspaceDir: tmpDir });

    expect(consumed).not.toBeNull();
    expect(consumed!.entryId).toBe("fq-1");
    expect(consumed!.primaryKind).toBe("identity");
    expect(consumed!.signals).toEqual(["preference", "emotion"]);
    expect(consumed!.userText).toBe("Something important happened.");
    expect(consumed!.assistantText).toBe("I remember this now.");
    expect(consumed!.eruptedAtMs).toBe(1234567890);
  });

  it("deletes the queue file after consuming (no replay on next heartbeat)", async () => {
    tmpDir = await makeTmpDir("gibbs-fq-delete-");
    await writeFlashbackQueue({ workspaceDir: tmpDir, entry: { entryId: "fq-2", primaryKind: "general", signals: [], userText: "t", assistantText: "t", eruptedAtMs: 0 } });
    await consumeFlashbackQueue({ workspaceDir: tmpDir });
    expect(await consumeFlashbackQueue({ workspaceDir: tmpDir })).toBeNull();
  });

  // Fix 1: cross-session queue isolation via agentId scoping
  it("agents with different agentId write to separate queue files", async () => {
    tmpDir = await makeTmpDir("gibbs-fq-scope-");
    const base = { primaryKind: "identity", signals: ["preference"], userText: "msg", assistantText: "rep", eruptedAtMs: Date.now() };
    await writeFlashbackQueue({ workspaceDir: tmpDir, agentId: "alpha", entry: { ...base, entryId: "alpha-1" } });
    await writeFlashbackQueue({ workspaceDir: tmpDir, agentId: "beta", entry: { ...base, entryId: "beta-1" } });

    const alpha = await consumeFlashbackQueue({ workspaceDir: tmpDir, agentId: "alpha" });
    const beta = await consumeFlashbackQueue({ workspaceDir: tmpDir, agentId: "beta" });

    expect(alpha!.entryId).toBe("alpha-1");
    expect(beta!.entryId).toBe("beta-1");
  });

  it("unscoped consume does not interfere with a scoped queue", async () => {
    tmpDir = await makeTmpDir("gibbs-fq-noscope-");
    await writeFlashbackQueue({ workspaceDir: tmpDir, agentId: "main", entry: { entryId: "scoped-1", primaryKind: "general", signals: [], userText: "x", assistantText: "y", eruptedAtMs: 0 } });

    expect(await consumeFlashbackQueue({ workspaceDir: tmpDir })).toBeNull(); // unscoped finds nothing
    expect((await consumeFlashbackQueue({ workspaceDir: tmpDir, agentId: "main" }))!.entryId).toBe("scoped-1");
  });

  // Fix 2: defibrillator-loss prevention — queue persists when caller skips consume
  it("queue file persists across multiple non-consuming calls (defibrillator scenario)", async () => {
    tmpDir = await makeTmpDir("gibbs-fq-persist-");
    await writeFlashbackQueue({ workspaceDir: tmpDir, agentId: "main", entry: { entryId: "persist-1", primaryKind: "decision", signals: ["decision"], userText: "important", assistantText: "remembered", eruptedAtMs: Date.now() } });

    // Simulate two defibrillator-locked heartbeats where consume is skipped
    // (caller does not call consumeFlashbackQueue)

    // Third heartbeat: defibrillator clears
    const consumed = await consumeFlashbackQueue({ workspaceDir: tmpDir, agentId: "main" });
    expect(consumed).not.toBeNull();
    expect(consumed!.entryId).toBe("persist-1");
  });
});

// ─── Defibrillator guard (caller responsibility) ──────────────────────────────

describe("evaluateGibbsEnergy – no internal defibrillator check", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
    delete process.env.OM_EPISODIC_METADATA_DB_PATH;
  });

  it("still evaluates nodes when a defibrillator file exists (caller is responsible)", async () => {
    tmpDir = await makeTmpDir("gibbs-defib-");
    process.env.OM_EPISODIC_METADATA_DB_PATH = path.join(tmpDir, "ep.sqlite");

    const defibPath = path.join(tmpDir, "logs", "brain", "defibrillator.json");
    await fs.mkdir(path.dirname(defibPath), { recursive: true });
    await fs.writeFile(defibPath, JSON.stringify({ remainingBeats: 3 }), "utf-8");

    const db = makeDb(process.env.OM_EPISODIC_METADATA_DB_PATH);
    insertEntry(db, { entryId: "defib-1", repressed: 1, latentEnergy: 10, signals: '["identity"]', userText: "a", assistantText: "b" });
    db.close();

    // Engine itself does not check defibrillator — it returns results; caller must gate
    const result = await evaluateGibbsEnergy({ workspaceDir: tmpDir, temperature: 0.1 });
    expect(result).not.toBeNull();
    expect(result!.distortionCount).toBeGreaterThan(0);
  });
});
