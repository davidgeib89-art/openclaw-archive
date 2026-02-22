import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateEnergy, updateEnergy } from "./energy.js";

const tempDirs: string[] = [];

async function createWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-energy-"));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, "knowledge", "sacred"), { recursive: true });
  return dir;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("calculateEnergy", () => {
  it("enters dream mode below 20", () => {
    const snapshot = calculateEnergy({
      toolStats: { total: 6, successful: 0, failed: 6 },
    });

    expect(snapshot.level).toBeLessThan(20);
    expect(snapshot.mode).toBe("dream");
    expect(snapshot.dreamMode).toBe(true);
    expect(snapshot.suggestOwnTasks).toBe(false);
  });

  it("enables initiative mode above 80", () => {
    const snapshot = calculateEnergy({
      toolStats: { total: 0, successful: 0, failed: 0 },
    });

    expect(snapshot.level).toBeGreaterThan(80);
    expect(snapshot.mode).toBe("initiative");
    expect(snapshot.dreamMode).toBe(false);
    expect(snapshot.suggestOwnTasks).toBe(true);
  });

  it("applies monotony drain when low activity repeats within 30 minutes", () => {
    const now = new Date("2026-02-22T05:00:00.000Z");
    const previousUpdatedAt = new Date("2026-02-22T04:55:00.000Z"); // 5 minutes ago

    const snapshot = calculateEnergy({
      toolStats: { total: 0, successful: 0, failed: 0 },
      previousUpdatedAt,
      now,
    });

    expect(snapshot.components.blended).toBeLessThan(93);
  });

  it("applies true regen after one hour of rest", () => {
    const now = new Date("2026-02-22T05:00:00.000Z");
    const previousUpdatedAt = new Date("2026-02-22T04:00:00.000Z"); // 60 minutes ago

    const snapshot = calculateEnergy({
      toolStats: { total: 0, successful: 0, failed: 0 },
      previousUpdatedAt,
      now,
    });

    expect(snapshot.components.blended).toBeGreaterThan(93);
  });

  it("does not apply regen boost on first run without updated_at", () => {
    const now = new Date("2026-02-22T05:00:00.000Z");

    const snapshot = calculateEnergy({
      toolStats: { total: 0, successful: 0, failed: 0 },
      previousUpdatedAt: undefined,
      now,
    });

    expect(snapshot.components.blended).toBe(93);
  });

  it("low-activity monotony yields lower level than first run with same noise", () => {
    const now = new Date("2026-02-22T05:00:00.000Z");
    const previousLevel = 70;

    // First run: no regen/drain, only noise.
    vi.spyOn(Math, "random").mockReturnValueOnce(0.5); // noise = 0
    const firstRun = calculateEnergy({
      toolStats: { total: 0, successful: 0, failed: 0 },
      previousLevel,
      previousUpdatedAt: undefined,
      now,
    });

    // Repeated low activity within 30 min: drain + same neutral noise.
    vi.restoreAllMocks();
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0) // monotony drain = -3
      .mockReturnValueOnce(0.5); // noise = 0
    const monotony = calculateEnergy({
      toolStats: { total: 0, successful: 0, failed: 0 },
      previousLevel,
      previousUpdatedAt: new Date("2026-02-22T04:55:00.000Z"),
      now,
    });

    expect(monotony.level).toBeLessThan(firstRun.level);
  });
});

describe("updateEnergy", () => {
  it("writes knowledge/sacred/ENERGY.md automatically", async () => {
    const workspace = await createWorkspace();
    const moodPath = path.join(workspace, "knowledge", "sacred", "MOOD.md");
    await fs.writeFile(moodPath, "calm focused curious", "utf-8");

    const result = await updateEnergy({
      workspaceDir: workspace,
      runId: "run-energy-test",
      sessionKey: "agent:main:test",
      toolStats: { total: 2, successful: 2, failed: 0 },
    });

    const energyPath = path.join(workspace, "knowledge", "sacred", "ENERGY.md");
    const content = await fs.readFile(energyPath, "utf-8");

    expect(result.path).toBe(energyPath);
    expect(result.moodPath).toBe(moodPath);
    expect(content).toContain("# ENERGY");
    expect(content).toContain("- level:");
    expect(content).toContain("- mode:");
    expect(content).toContain("- suggest_own_tasks:");
  });
});
