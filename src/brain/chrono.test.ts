import { describe, expect, it } from "vitest";
import { evaluateChronoState } from "./chrono.js";

const baseState = {
  processS: 0,
  isSleeping: false,
  sleepTicksElapsed: 0,
  wakeTicksElapsed: 0,
};

describe("evaluateChronoState", () => {
  it("wakes Om immediately when Papa writes", () => {
    const sleeping = { ...baseState, isSleeping: true, processS: 80, sleepTicksElapsed: 3 };
    const result = evaluateChronoState(sleeping, 50, true, new Date("2026-02-22T14:00:00"));
    expect(result.nextState.isSleeping).toBe(false);
    expect(result.transitionType).toBe("woke_up_papa");
  });

  it("accumulates process S while awake", () => {
    const result = evaluateChronoState(baseState, 88, false, new Date("2026-02-22T10:00:00"));
    expect(result.nextState.processS).toBeGreaterThan(0);
    expect(result.nextState.isSleeping).toBe(false);
  });

  it("falls asleep at 21:00 with sufficient pressure", () => {
    const highPressure = { ...baseState, processS: 30 };
    const night = new Date("2026-02-22T21:00:00");
    const result = evaluateChronoState(highPressure, 88, false, night);
    expect(result.nextState.isSleeping).toBe(true);
    expect(result.transitionType).toBe("fell_asleep");
  });

  it("decays process S while sleeping", () => {
    const sleeping = { ...baseState, isSleeping: true, processS: 50, sleepTicksElapsed: 1 };
    const result = evaluateChronoState(sleeping, 88, false, new Date("2026-02-22T02:00:00"));
    expect(result.nextState.processS).toBeLessThan(50);
  });

  it("wakes after 6 sleep ticks when processS < 9", () => {
    const almostDone = { ...baseState, isSleeping: true, processS: 5, sleepTicksElapsed: 5 };
    const morning = new Date("2026-02-22T08:00:00");
    const result = evaluateChronoState(almostDone, 88, false, morning);
    expect(result.nextState.isSleeping).toBe(false);
    expect(result.transitionType).toBe("woke_up_cycle");
  });

  it("hard-wake after MAX_SLEEP_TICKS (72)", () => {
    const koma = { ...baseState, isSleeping: true, processS: 60, sleepTicksElapsed: 71 };
    const result = evaluateChronoState(koma, 88, false, new Date("2026-02-22T14:00:00"));
    expect(result.nextState.isSleeping).toBe(false);
    expect(result.transitionType).toBe("woke_up_hard");
  });

  it("does not sleep at 08:00 when processS is too low", () => {
    const rested = { ...baseState, processS: 5 };
    const morning = new Date("2026-02-22T08:00:00");
    const result = evaluateChronoState(rested, 88, false, morning);
    expect(result.nextState.isSleeping).toBe(false);
  });
});
