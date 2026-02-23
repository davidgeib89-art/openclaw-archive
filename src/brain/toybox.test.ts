import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPatternHunt, runToyboxAction } from "./toybox.js";

const tempDirs: string[] = [];

function parseAsciiGrid(output: string): boolean[][] {
  return output
    .trim()
    .split("\n")
    .map((line) => [...line].map((cell) => cell === "█"));
}

async function createWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-toybox-"));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, "knowledge", "sacred"), { recursive: true });
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("runToyboxAction cellular_dream", () => {
  it("applies Conway rules correctly (live cell with two neighbors survives)", () => {
    const blinker = [
      [false, false, false, false, false],
      [false, false, false, false, false],
      [false, true, true, true, false],
      [false, false, false, false, false],
      [false, false, false, false, false],
    ];
    const result = runToyboxAction("cellular_dream", {
      size: 5,
      steps: 1,
      initialGrid: blinker,
    });
    const parsed = parseAsciiGrid(result.output);
    expect(parsed[2]?.[2]).toBe(true);
  });

  it("clamps grid size to max 20", () => {
    const result = runToyboxAction("cellular_dream", {
      size: 999,
      steps: 1,
      seed: 42,
    });
    const lines = result.output.split("\n");
    expect(lines).toHaveLength(20);
    for (const line of lines) {
      expect([...line]).toHaveLength(20);
    }
  });

  it("clamps steps to max 50", () => {
    const result = runToyboxAction("cellular_dream", {
      size: 8,
      steps: 999,
      seed: 42,
    });
    expect(result.metrics.generations_run).toBe(50);
  });

  it("always returns a cellular_dream result", () => {
    const result = runToyboxAction("cellular_dream", {});
    expect(result.mode).toBe("cellular_dream");
    expect(typeof result.output).toBe("string");
    expect(result.metrics).toBeTruthy();
  });
});

describe("runToyboxAction lorenz_dance", () => {
  it("produces wing switches with defaults", () => {
    const result = runToyboxAction("lorenz_dance", {});
    expect((result.metrics.wing_switches as number) > 0).toBe(true);
  });

  it("keeps zero fixed-point with no wing switches", () => {
    const result = runToyboxAction("lorenz_dance", { x0: 0, y0: 0, z0: 0 });
    expect(result.metrics.wing_switches).toBe(0);
  });

  it("returns non-negative chaos score", () => {
    const result = runToyboxAction("lorenz_dance", {});
    expect(typeof result.metrics.chaos_score).toBe("number");
    expect((result.metrics.chaos_score as number) >= 0).toBe(true);
  });
});

describe("runToyboxAction semantic_echo", () => {
  it("returns unchanged text when mutation_strength=0", () => {
    const source = "Ich bleibe genau gleich";
    const result = runToyboxAction("semantic_echo", {
      text: source,
      mutation_strength: 0,
    });
    expect(result.output).toContain(`Original: "${source}"`);
    expect(result.output).toContain(`Echo: "${source}"`);
    expect(result.metrics.words_mutated).toBe(0);
  });

  it("handles empty text without crashing", () => {
    const result = runToyboxAction("semantic_echo", { text: "" });
    expect(result.output).toContain('Original: ""');
    expect(result.output).toContain('Echo: ""');
    expect(result.metrics.words_total).toBe(0);
  });

  it("truncates text above 200 chars", () => {
    const input = "a".repeat(250);
    const result = runToyboxAction("semantic_echo", {
      text: input,
      mutation_strength: 0,
    });
    const expected = "a".repeat(200);
    expect(result.output).toContain(`Original: "${expected}"`);
  });
});

describe("runPatternHunt", () => {
  it("returns placeholders when workspace data does not exist", async () => {
    const workspace = path.join(os.tmpdir(), `openclaw-toybox-missing-${Date.now()}`);
    const result = await runPatternHunt({ workspaceDir: workspace });
    expect(result.mode).toBe("pattern_hunt");
    expect(result.output).toContain("(keine Daten)");
  });

  it("clamps lines to max 50", async () => {
    const workspace = await createWorkspace();
    const energyPath = path.join(workspace, "knowledge", "sacred", "ENERGY.md");
    const chronoPath = path.join(workspace, "knowledge", "sacred", "CHRONO.md");
    const manyLines = Array.from({ length: 100 }, (_, i) => `line-${i}`).join("\n");
    await fs.writeFile(energyPath, manyLines, "utf-8");
    await fs.writeFile(chronoPath, manyLines, "utf-8");

    const result = await runPatternHunt({ workspaceDir: workspace, lines: 999 });
    expect(result.metrics.energy_lines).toBe(50);
    expect(result.metrics.chrono_lines).toBe(50);
  });
});
