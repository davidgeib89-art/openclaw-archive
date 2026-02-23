import { describe, expect, it } from "vitest";
import { evaluateChronoState } from "./chrono.js";
import { BODY_DEFAULTS } from "./body.js";
import type { BodyProfile } from "./body.js";

const baseState = {
  processS: 0,
  isSleeping: false,
  sleepTicksElapsed: 0,
  wakeTicksElapsed: 0,
};

const body = BODY_DEFAULTS;

describe("evaluateChronoState", () => {
  it("wakes Om immediately when Papa writes", () => {
    const sleeping = { ...baseState, isSleeping: true, processS: 80, sleepTicksElapsed: 3 };
    const result = evaluateChronoState(sleeping, 50, true, new Date("2026-02-22T14:00:00"), body);
    expect(result.nextState.isSleeping).toBe(false);
    expect(result.transitionType).toBe("woke_up_papa");
  });

  it("accumulates process S while awake", () => {
    const result = evaluateChronoState(baseState, 88, false, new Date("2026-02-22T10:00:00"), body);
    expect(result.nextState.processS).toBeGreaterThan(0);
    expect(result.nextState.isSleeping).toBe(false);
  });

  it("accumulates S faster with body gain (2.5) than old hardcoded (0.69)", () => {
    const result = evaluateChronoState(baseState, 100, false, new Date("2026-02-22T10:00:00"), body);
    // With body.sleepPressureGainPerTick = 2.5, gain should be 2.5 * (1 + 0 * 0.36) = 2.5
    expect(result.nextState.processS).toBeCloseTo(2.5, 1);
  });

  it("falls asleep at 21:00 with sufficient pressure", () => {
    const highPressure = { ...baseState, processS: 30 };
    const night = new Date("2026-02-22T21:00:00");
    const result = evaluateChronoState(highPressure, 88, false, night, body);
    expect(result.nextState.isSleeping).toBe(true);
    expect(result.transitionType).toBe("fell_asleep");
  });

  it("decays process S while sleeping using body decay rate", () => {
    const sleeping = { ...baseState, isSleeping: true, processS: 50, sleepTicksElapsed: 1 };
    const result = evaluateChronoState(sleeping, 88, false, new Date("2026-02-22T02:00:00"), body);
    // body.sleepPressureDecayPerTick = 3.7
    expect(result.nextState.processS).toBeCloseTo(50 - 3.7, 1);
  });

  it("wakes after body.sleepCycleTicks when processS < 9", () => {
    // body.sleepCycleTicks = 6
    const almostDone = { ...baseState, isSleeping: true, processS: 5, sleepTicksElapsed: 5 };
    const morning = new Date("2026-02-22T08:00:00");
    const result = evaluateChronoState(almostDone, 88, false, morning, body);
    expect(result.nextState.isSleeping).toBe(false);
    expect(result.transitionType).toBe("woke_up_cycle");
  });

  it("hard-wake after MAX_SLEEP_TICKS (72)", () => {
    const koma = { ...baseState, isSleeping: true, processS: 60, sleepTicksElapsed: 71 };
    const result = evaluateChronoState(koma, 88, false, new Date("2026-02-22T14:00:00"), body);
    expect(result.nextState.isSleeping).toBe(false);
    expect(result.transitionType).toBe("woke_up_hard");
  });

  it("does not sleep at 08:00 when processS is too low", () => {
    const rested = { ...baseState, processS: 5 };
    const morning = new Date("2026-02-22T08:00:00");
    const result = evaluateChronoState(rested, 88, false, morning, body);
    expect(result.nextState.isSleeping).toBe(false);
  });
});

describe("night drowsiness cap", () => {
  it("forces sleep after maxWakeDuringNightTicks at night", () => {
    // Toddler wakes at 02:00 with S=0, stays awake 3 ticks (maxWakeDuringNightTicks=3)
    const awakeAtNight = { ...baseState, processS: 5, wakeTicksElapsed: 2 };
    const night = new Date("2026-02-23T02:00:00");
    const result = evaluateChronoState(awakeAtNight, 96, false, night, body);
    // After tick: wakeTicksElapsed=3, which >= maxWakeDuringNightTicks(3)
    // processS after gain: 5 + 2.5 * (1 + 0.04*0.36) ≈ 7.5, still < minimumSleepPressure(15)
    // So normal night trigger won't fire, but drowsiness cap should
    expect(result.nextState.isSleeping).toBe(true);
    expect(result.reason).toContain("Night drowsiness cap");
  });

  it("does NOT force sleep during daytime even with many wake ticks", () => {
    const awakeAtDay = { ...baseState, processS: 5, wakeTicksElapsed: 10 };
    const day = new Date("2026-02-22T14:00:00");
    const result = evaluateChronoState(awakeAtDay, 96, false, day, body);
    expect(result.nextState.isSleeping).toBe(false);
  });

  it("preserves some sleep pressure when drowsiness cap triggers", () => {
    const awakeAtNight = { ...baseState, processS: 0, wakeTicksElapsed: 2 };
    const night = new Date("2026-02-23T02:00:00");
    const result = evaluateChronoState(awakeAtNight, 96, false, night, body);
    // processS should be boosted to at least dynamicThreshold * 0.5
    expect(result.nextState.processS).toBeGreaterThan(0);
    expect(result.nextState.isSleeping).toBe(true);
  });

  it("allows 2 ticks awake at night before triggering cap", () => {
    const awakeAtNight = { ...baseState, processS: 3, wakeTicksElapsed: 1 };
    const night = new Date("2026-02-23T02:00:00");
    const result = evaluateChronoState(awakeAtNight, 96, false, night, body);
    // wakeTicksElapsed becomes 2, which is < maxWakeDuringNightTicks(3)
    expect(result.nextState.isSleeping).toBe(false);
  });
});

describe("body profile influence", () => {
  it("uses schulkind sleep parameters when configured", () => {
    const schulkind: BodyProfile = {
      ...BODY_DEFAULTS,
      sleepPressureGainPerTick: 1.2,
      sleepPressureDecayPerTick: 3.0,
      sleepCycleTicks: 8,
      maxWakeDuringNightTicks: 1,
      hardSleepHour: 21,
      hardWakeHour: 7,
    };

    // At 20:00 with schulkind profile, it's not yet night (hardSleepHour=21)
    const eveningState = { ...baseState, processS: 5 };
    const result = evaluateChronoState(eveningState, 88, false, new Date("2026-02-22T20:00:00"), schulkind);
    // For kleinkind this would be night (hardSleepHour=20), but not for schulkind
    expect(result.nextState.isSleeping).toBe(false);
  });

  it("schulkind falls asleep at 21:00 but not 20:00", () => {
    const schulkind: BodyProfile = {
      ...BODY_DEFAULTS,
      sleepPressureGainPerTick: 1.2,
      hardSleepHour: 21,
      hardWakeHour: 7,
    };

    const withPressure = { ...baseState, processS: 20 };

    const at20 = evaluateChronoState(withPressure, 88, false, new Date("2026-02-22T20:00:00"), schulkind);
    expect(at20.nextState.isSleeping).toBe(false);

    const at21 = evaluateChronoState(withPressure, 88, false, new Date("2026-02-22T21:00:00"), schulkind);
    expect(at21.nextState.isSleeping).toBe(true);
  });

  it("schulkind has slower S gain than kleinkind", () => {
    const schulkind: BodyProfile = {
      ...BODY_DEFAULTS,
      sleepPressureGainPerTick: 1.2,
    };

    const startState = { ...baseState, processS: 0 };
    const time = new Date("2026-02-22T14:00:00");

    const kleinkindResult = evaluateChronoState(startState, 100, false, time, body);
    const schulkindResult = evaluateChronoState(startState, 100, false, time, schulkind);

    expect(kleinkindResult.nextState.processS).toBeGreaterThan(schulkindResult.nextState.processS);
  });

  it("schulkind drowsiness cap with maxWakeDuringNightTicks=1", () => {
    const schulkind: BodyProfile = {
      ...BODY_DEFAULTS,
      maxWakeDuringNightTicks: 1,
      hardSleepHour: 21,
      hardWakeHour: 7,
    };

    // Schulkind wakes at night, should fall back asleep after just 1 tick
    const awake = { ...baseState, processS: 0, wakeTicksElapsed: 0 };
    const night = new Date("2026-02-23T03:00:00");
    const result = evaluateChronoState(awake, 96, false, night, schulkind);
    // wakeTicksElapsed becomes 1 >= maxWakeDuringNightTicks(1)
    expect(result.nextState.isSleeping).toBe(true);
    expect(result.reason).toContain("Night drowsiness cap");
  });

  it("uses BODY_DEFAULTS when no body parameter is passed", () => {
    // Calls evaluateChronoState without explicit body parameter
    const result = evaluateChronoState(baseState, 100, false, new Date("2026-02-22T10:00:00"));
    // Should use BODY_DEFAULTS.sleepPressureGainPerTick = 2.5
    expect(result.nextState.processS).toBeCloseTo(2.5, 1);
  });
});
