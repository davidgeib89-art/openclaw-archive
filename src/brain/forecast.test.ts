import { describe, expect, it } from "vitest";
import { buildEnergyForecast } from "./forecast.js";

describe("buildEnergyForecast", () => {
  it("returns rest_integrating when chrono indicates sleeping", () => {
    const result = buildEnergyForecast({
      repetitionPressure: 20,
      repeatedPathStreak: 1,
      restingPathStreak: 2,
      playDreamStreak: 0,
      chosenPath: "DRIFT",
      energyLevel: 35,
      isSleeping: true,
      toolCallsTotal: 0,
    });

    expect(result.trajectory).toBe("rest_integrating");
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("returns stagnation_risk for high-energy resting streaks", () => {
    const result = buildEnergyForecast({
      repetitionPressure: 40,
      repeatedPathStreak: 2,
      restingPathStreak: 3,
      playDreamStreak: 0,
      chosenPath: "DRIFT",
      energyLevel: 92,
      isSleeping: false,
      toolCallsTotal: 0,
    });

    expect(result.trajectory).toBe("stagnation_risk");
    expect(result.evidence.join(" ")).toContain("resting streak");
  });

  it("returns habit_loop when loop-cause signals persistent habit", () => {
    const result = buildEnergyForecast({
      repetitionPressure: 70,
      repeatedPathStreak: 4,
      restingPathStreak: 1,
      playDreamStreak: 2,
      chosenPath: "PLAY",
      energyLevel: 88,
      isSleeping: false,
      toolCallsTotal: 1,
      recentToolDurationMsMax: [72_000, 65_000],
      loopCause: "model_habit",
    });

    expect(result.trajectory).toBe("habit_loop");
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("returns creative_opening for active low-repetition flow", () => {
    const result = buildEnergyForecast({
      repetitionPressure: 10,
      repeatedPathStreak: 1,
      restingPathStreak: 0,
      playDreamStreak: 0,
      chosenPath: "PLAY",
      energyLevel: 85,
      isSleeping: false,
      toolCallsTotal: 2,
      loopCause: "unknown",
    });

    expect(result.trajectory).toBe("creative_opening");
  });

  it("returns unknown when no strong trajectory is visible", () => {
    const result = buildEnergyForecast({
      repetitionPressure: 0,
      repeatedPathStreak: 0,
      restingPathStreak: 0,
      playDreamStreak: 0,
      chosenPath: "LEARN",
      energyLevel: 60,
      isSleeping: false,
      toolCallsTotal: 0,
    });

    expect(result.trajectory).toBe("unknown");
    expect(result.confidence).toBeLessThan(0.6);
  });

  it("fails open when input is malformed", () => {
    const result = buildEnergyForecast({
      repetitionPressure: Number.NaN,
      repeatedPathStreak: Number.POSITIVE_INFINITY,
      restingPathStreak: Number.NaN,
      playDreamStreak: Number.NaN,
      chosenPath: "UNKNOWN",
      energyLevel: Number.NaN,
      isSleeping: false,
      toolCallsTotal: Number.NaN,
      recentToolDurationMsMax: [Number.NaN],
      loopCause: "unknown",
    });

    expect(result.trajectory).toBe("unknown");
    expect(Array.isArray(result.evidence)).toBe(true);
  });
});
