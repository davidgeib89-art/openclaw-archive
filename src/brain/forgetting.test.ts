import { describe, expect, it } from "vitest";
import { evaluateForgettingScore } from "./forgetting.js";

describe("active forgetting score", () => {
  it("increases forgetting pressure as memories age", () => {
    const recent = evaluateForgettingScore({
      ageDays: 1,
      frequencyCount: 0,
      emotionValue: 0.1,
    });
    const older = evaluateForgettingScore({
      ageDays: 40,
      frequencyCount: 0,
      emotionValue: 0.1,
    });

    expect(older.forgettingScore).toBeGreaterThan(recent.forgettingScore);
  });

  it("protects high-frequency and emotional memories from forgetting", () => {
    const lowSignal = evaluateForgettingScore({
      ageDays: 12,
      frequencyCount: 0,
      emotionValue: 0.1,
    });
    const highSignal = evaluateForgettingScore({
      ageDays: 12,
      frequencyCount: 7,
      emotionValue: 1,
    });

    expect(highSignal.forgettingScore).toBeLessThan(lowSignal.forgettingScore);
  });
});
