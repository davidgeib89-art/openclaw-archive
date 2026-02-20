import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { calculateEnergy, updateEnergy } from "./energy.js";

const tempDirs: string[] = [];

async function createWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-energy-"));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, "knowledge", "sacred"), { recursive: true });
  return dir;
}

afterEach(async () => {
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
