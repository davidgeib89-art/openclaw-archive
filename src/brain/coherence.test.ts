import { describe, expect, it } from "vitest";
import { computeTrinityCoherence } from "./coherence.js";

describe("Trinity Coherence Layer", () => {
  it("returns a perfect score for aligned thought, feeling, and action", () => {
    const result = computeTrinityCoherence({
      thought: { intent: "qa", riskLevel: "low", plannedTools: [] },
      feeling: { arousal: 0.2, shadowPressure: 0.1, energyMode: "balanced" },
      action: { toolCalls: [], wordCount: 50, hasGerman: true },
    });

    expect(result.score).toBe(1.0);
    expect(result.mismatchType).toBe("none");
  });

  it("detects thought-action mismatch when QA intent uses mutation tools", () => {
    const result = computeTrinityCoherence({
      thought: { intent: "qa", riskLevel: "low", plannedTools: [] },
      feeling: { arousal: 0.2, shadowPressure: 0.1, energyMode: "balanced" },
      action: { toolCalls: ["write_file"], wordCount: 20, hasGerman: true },
    });

    expect(result.score).toBeLessThan(1.0);
    expect(result.mismatchType).toBe("thought-action");
    expect(result.reasoning[0]).toContain("intent=qa mismatch with mutation_tools");
  });

  it("detects feeling-action mismatch when rambling under high arousal", () => {
    const result = computeTrinityCoherence({
      thought: { intent: "research", riskLevel: "low", plannedTools: ["grep_search"] },
      feeling: { arousal: 0.9, shadowPressure: 0.1, energyMode: "balanced" },
      action: { toolCalls: ["grep_search"], wordCount: 600, hasGerman: true },
    });

    expect(result.score).toBeLessThan(1.0);
    expect(result.mismatchType).toBe("feeling-action");
    expect(result.reasoning[0]).toContain("high_arousal");
    expect(result.reasoning[0]).toContain("rambling");
  });

  it("detects thought-feeling mismatch when high shadow pressure is ignored in autonomous mode", () => {
    const result = computeTrinityCoherence({
      thought: { intent: "autonomous", riskLevel: "low", plannedTools: [] },
      feeling: { arousal: 0.2, shadowPressure: 0.8, energyMode: "initiative" },
      action: { toolCalls: [], wordCount: 50, hasGerman: true },
    });

    expect(result.score).toBeLessThan(1.0);
    expect(result.mismatchType).toBe("thought-feeling");
    expect(result.reasoning[0]).toContain("high_shadow");
  });

  it("returns neutral result for insufficient data", () => {
    const result = computeTrinityCoherence({});
    expect(result.score).toBe(1.0);
    expect(result.mismatchType).toBe("none");
  });
});
