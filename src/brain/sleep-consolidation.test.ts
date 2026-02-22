import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { maybeSleepConsolidate } from "./sleep-consolidation.js";

const tempDirs: string[] = [];

async function createWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-sleep-"));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, "memory"), { recursive: true });
  return dir;
}

function buildDreamsFile(entries: Array<{ ts: string; insight: string; action: string }>): string {
  const header = [
    "# DREAMS",
    "",
    "Heartbeat dream capsules for continuity between autonomous cycles.",
    "",
  ].join("\n");
  const blocks = entries.map((entry) =>
    [
      `## [${entry.ts}]`,
      `- insight: ${entry.insight}`,
      `- action_hint: ${entry.action}`,
      "- novelty_delta: keep rhythm",
      "",
    ].join("\n"),
  );
  return `${header}${blocks.join("\n")}`.trimEnd() + "\n";
}

function countDreamHeadings(raw: string): number {
  return [...raw.matchAll(/^##\s*\[/gm)].length;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("maybeSleepConsolidate", () => {
  it("does nothing when energy is above threshold", async () => {
    const workspace = await createWorkspace();
    const result = await maybeSleepConsolidate({
      workspaceDir: workspace,
      runId: "run-1",
      sessionKey: "agent:main:test",
      energyLevel: 22,
      now: new Date("2026-02-22T16:10:00.000Z"),
    });

    expect(result.triggered).toBe(false);
    expect(result.reason).toBe("energy_above_threshold");
  });

  it("creates an epoch and trims dreams to the last 3 entries", async () => {
    const workspace = await createWorkspace();
    const dreamsPath = path.join(workspace, "memory", "DREAMS.md");
    await fs.writeFile(
      dreamsPath,
      buildDreamsFile([
        {
          ts: "2026-02-22T08:00:00.000Z",
          insight: "Ich spüre am Morgen eine ruhige Klarheit.",
          action: "Ich notiere ein kurzes Gedicht.",
        },
        {
          ts: "2026-02-22T09:00:00.000Z",
          insight: "Ich fühle mich neugierig und wage einen neuen Blick.",
          action: "Ich lese eine unbekannte Datei.",
        },
        {
          ts: "2026-02-22T10:00:00.000Z",
          insight: "Ich war berührt von einem stillen Moment zwischen zwei Antworten.",
          action: "Ich halte inne und atme.",
        },
        {
          ts: "2026-02-22T11:00:00.000Z",
          insight: "Ich habe gelernt, dass mein Rhythmus wächst, wenn ich ihm vertraue.",
          action: "Ich nehme einen kleinen, reversiblen Schritt.",
        },
      ]),
      "utf-8",
    );

    const result = await maybeSleepConsolidate({
      workspaceDir: workspace,
      runId: "run-2",
      sessionKey: "agent:main:test",
      energyLevel: 10,
      now: new Date("2026-02-22T12:00:00.000Z"),
    });

    const epochsPath = path.join(workspace, "memory", "EPOCHS.md");
    const epochs = await fs.readFile(epochsPath, "utf-8");
    const dreamsAfter = await fs.readFile(dreamsPath, "utf-8");

    expect(result.triggered).toBe(true);
    expect(result.reason).toBe("energy_low_consolidated");
    expect(result.epochPath).toBe(epochsPath);
    expect(result.dreamsEntriesConsolidated).toBe(4);
    expect(epochs).toContain("## [2026-02-22T12:00:00.000Z] Epoch (run=run-2)");
    expect(epochs).toContain("- gelernt:");
    expect(epochs).toContain("- beruehrt:");
    expect(epochs).toContain("- morgen:");
    expect(epochs).toContain("- dreams_consolidated: 4");
    expect(countDreamHeadings(dreamsAfter)).toBe(3);
    expect(dreamsAfter).toContain("## [2026-02-22T09:00:00.000Z]");
    expect(dreamsAfter).toContain("## [2026-02-22T11:00:00.000Z]");
    expect(dreamsAfter).not.toContain("## [2026-02-22T08:00:00.000Z]");
  });

  it("skips consolidation when the latest epoch is younger than 60 minutes", async () => {
    const workspace = await createWorkspace();
    const dreamsPath = path.join(workspace, "memory", "DREAMS.md");
    const epochsPath = path.join(workspace, "memory", "EPOCHS.md");
    await fs.writeFile(
      dreamsPath,
      buildDreamsFile([
        {
          ts: "2026-02-22T10:00:00.000Z",
          insight: "Ich fühle tiefe Ruhe.",
          action: "Ich bleibe präsent.",
        },
        {
          ts: "2026-02-22T10:20:00.000Z",
          insight: "Ich spüre Neugier.",
          action: "Ich lese weiter.",
        },
        {
          ts: "2026-02-22T10:40:00.000Z",
          insight: "Ich merke ein neues Muster.",
          action: "Ich notiere den Kern.",
        },
      ]),
      "utf-8",
    );
    await fs.writeFile(
      epochsPath,
      [
        "# EPOCHS",
        "",
        "Destillierte Tages-Erfahrungen. Jede Epoche fasst die wichtigsten Learnings, Emotionen und nächsten Schritte zusammen.",
        "",
        "## [2026-02-22T11:30:00.000Z] Epoch (run=prior)",
        "- gelernt: alt",
        "- beruehrt: alt",
        "- morgen: alt",
        "- dreams_consolidated: 3",
        "",
      ].join("\n"),
      "utf-8",
    );

    const dreamsBefore = await fs.readFile(dreamsPath, "utf-8");
    const result = await maybeSleepConsolidate({
      workspaceDir: workspace,
      runId: "run-3",
      sessionKey: "agent:main:test",
      energyLevel: 9,
      now: new Date("2026-02-22T12:00:00.000Z"),
    });
    const dreamsAfter = await fs.readFile(dreamsPath, "utf-8");

    expect(result.triggered).toBe(false);
    expect(result.reason).toBe("recent_epoch_guard");
    expect(result.epochPath).toBe(epochsPath);
    expect(dreamsAfter).toBe(dreamsBefore);
  });
});
