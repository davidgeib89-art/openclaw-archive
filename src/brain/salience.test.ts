import { afterEach, describe, expect, it } from "vitest";
import type { IntuitionPayload } from "./types.js";
import {
  evaluateSalience,
  evaluateSurge,
  onSubconsciousSurge,
  resetSubconsciousSurgeStateForTests,
} from "./salience.js";

afterEach(() => {
  resetSubconsciousSurgeStateForTests();
});

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

describe("evaluateSurge", () => {
  function createIntuition(overrides: Partial<IntuitionPayload> = {}): IntuitionPayload {
    return {
      content: "Investigate a reversible next step.",
      confidence: 0.9,
      urgency: 0.9,
      timestamp: 123,
      ...overrides,
    };
  }

  it("emits subconsciousSurge when salience exceeds threshold", () => {
    const events: number[] = [];
    const unsubscribe = onSubconsciousSurge((event) => {
      events.push(event.salience);
    });

    const result = evaluateSurge(createIntuition(), { nowMs: 1_000, cooldownMs: 10_000 });

    expect(result.triggered).toBe(true);
    expect(result.reason).toBe("emitted");
    expect(events).toHaveLength(1);
    expect(events[0]).toBeGreaterThan(0.85);

    unsubscribe();
  });

  it("suppresses repeated surges during cooldown", () => {
    const first = evaluateSurge(createIntuition(), { nowMs: 1_000, cooldownMs: 10_000 });
    const second = evaluateSurge(createIntuition(), { nowMs: 5_000, cooldownMs: 10_000 });
    const third = evaluateSurge(createIntuition(), { nowMs: 11_001, cooldownMs: 10_000 });

    expect(first.triggered).toBe(true);
    expect(second.triggered).toBe(false);
    expect(second.reason).toBe("cooldown_active");
    expect(second.cooldownRemainingMs).toBeGreaterThan(0);
    expect(third.triggered).toBe(true);
    expect(third.reason).toBe("emitted");
  });

  it("does not emit when salience is below threshold", () => {
    const result = evaluateSurge(
      createIntuition({
        confidence: 0.6,
        urgency: 0.4,
      }),
      { nowMs: 1_000, cooldownMs: 10_000 },
    );

    expect(result.salience).toBeLessThanOrEqual(0.85);
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe("threshold_not_met");
  });
});
