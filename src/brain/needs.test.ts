import { describe, expect, it } from "vitest";
import {
  buildNeedsFileContent,
  buildNeedsPromptBlock,
  buildNeedsSnapshot,
  type NeedsInput,
} from "./needs.js";

function createInput(overrides: Partial<NeedsInput> = {}): NeedsInput {
  return {
    now: "2026-02-25T12:00:00.000Z",
    uptimeSeconds: 4 * 60 * 60,
    currentToolStats: {
      total: 3,
      successful: 3,
      failed: 0,
    },
    recentToolCallsTotal: [3, 2, 1, 0, 1],
    recentToolCallsFailed: [0, 0, 0, 0, 0],
    energyLevel: 82,
    sleepPressure: 28,
    isSleeping: false,
    repetitionPressure: 18,
    recentUserMessageCount: 2,
    recentPaths: ["PLAY", "LEARN", "CONNECT", "DRIFT", "PLAY"],
    loopCause: "unknown",
    forecastTrajectory: "creative_opening",
    forecastConfidence: 0.72,
    trinityCoherenceScore: 74,
    workspaceRequiredFilesPresent: 5,
    workspaceRequiredFilesTotal: 5,
    workspaceMissingFiles: [],
    guardRiskLevel: "low",
    guardEventCount: 0,
    promptErrorsRecent: 0,
    ...overrides,
  };
}

describe("needs", () => {
  it("computes all 7 needs in range", () => {
    const snapshot = buildNeedsSnapshot(createInput());
    expect(snapshot.needs).toHaveLength(7);
    for (const need of snapshot.needs) {
      expect(need.value).toBeGreaterThanOrEqual(0);
      expect(need.value).toBeLessThanOrEqual(100);
      expect(need.evidence.length).toBeGreaterThan(0);
    }
  });

  it("raises connection when recent user presence is high", () => {
    const low = buildNeedsSnapshot(createInput({ recentUserMessageCount: 0 }));
    const high = buildNeedsSnapshot(createInput({ recentUserMessageCount: 5 }));
    const lowConnection = low.needs.find((need) => need.name === "connection");
    const highConnection = high.needs.find((need) => need.name === "connection");
    expect(lowConnection?.value ?? 0).toBeLessThan(highConnection?.value ?? 0);
  });

  it("lowers self_coherence under habit-loop pressure", () => {
    const coherent = buildNeedsSnapshot(
      createInput({
        repetitionPressure: 10,
        loopCause: "unknown",
        forecastTrajectory: "creative_opening",
        forecastConfidence: 0.8,
      }),
    );
    const incoherent = buildNeedsSnapshot(
      createInput({
        repetitionPressure: 85,
        loopCause: "model_habit",
        forecastTrajectory: "habit_loop",
        forecastConfidence: 0.82,
      }),
    );
    const coherentNeed = coherent.needs.find((need) => need.name === "self_coherence");
    const incoherentNeed = incoherent.needs.find((need) => need.name === "self_coherence");
    expect(coherentNeed?.value ?? 0).toBeGreaterThan(incoherentNeed?.value ?? 0);
  });

  it("exposes top deficit and top resource", () => {
    const snapshot = buildNeedsSnapshot(
      createInput({
        recentUserMessageCount: 0,
        forecastTrajectory: "creative_opening",
      }),
    );
    expect(snapshot.topDeficit).toBeTruthy();
    expect(snapshot.topResource).toBeTruthy();
    expect(snapshot.topDeficit.value).toBeLessThanOrEqual(snapshot.topResource.value);
  });

  it("builds a C-lite prompt block with hard length budget", () => {
    const snapshot = buildNeedsSnapshot(createInput());
    const block = buildNeedsPromptBlock(snapshot, 320);
    expect(block.startsWith("<om_needs>")).toBe(true);
    expect(block.includes("</om_needs>")).toBe(true);
    expect(block.length).toBeLessThanOrEqual(320);
  });

  it("renders NEEDS.md content with ordered table rows", () => {
    const snapshot = buildNeedsSnapshot(createInput());
    const content = buildNeedsFileContent(snapshot);
    expect(content).toContain("# Om Needs Snapshot");
    expect(content).toContain("| Need | Score | Evidence |");
    expect(content).toContain("self_coherence");
  });
});
