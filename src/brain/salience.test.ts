import { describe, expect, it } from "vitest";
import { evaluateSalience } from "./salience.js";

describe("evaluateSalience", () => {
  it("scores high for identity-heavy turns", () => {
    const result = evaluateSalience({
      userMessage: "My secret codename is Omega. Please remember this.",
      assistantMessage: "I choose to remember this identity marker.",
    });

    expect(result.score).toBeGreaterThanOrEqual(3);
    expect(result.signals).toContain("identity");
    expect(result.formula.emotionValue).toBeGreaterThan(0);
  });

  it("stays low for trivial noise turns", () => {
    const result = evaluateSalience({
      userMessage: "ok",
      assistantMessage: "done",
    });

    expect(result.score).toBeLessThan(2);
    expect(result.signals).toHaveLength(0);
    expect(result.formula.recencyGate).toBeLessThan(1);
  });

  it("applies time decay when age increases", () => {
    const fresh = evaluateSalience({
      userMessage: "I prefer ambient music while coding.",
      assistantMessage: "I choose ambient as the default profile.",
      ageDays: 0,
    });
    const old = evaluateSalience({
      userMessage: "I prefer ambient music while coding.",
      assistantMessage: "I choose ambient as the default profile.",
      ageDays: 90,
    });

    expect(old.formula.recencyTerm).toBeLessThan(fresh.formula.recencyTerm);
    expect(old.score).toBeLessThanOrEqual(fresh.score);
  });
});
