import { describe, expect, it } from "vitest";
import { BODY_DEFAULTS, bodyStageLabel, isNightHour, parseBodyProfile } from "./body.js";
import type { BodyProfile } from "./body.js";

// ─── Fixture: minimal BODY.md ──────────────────────────────────────────────────

const MINIMAL_BODY_MD = `# Om's Körper

## Entwicklungsstufe
- stage: kleinkind
- age_equivalent_months: 30

## Schlaf-Architektur
- sleep_pattern: polyphasic
- max_wake_during_night_ticks: 3
- sleep_pressure_gain_per_tick: 2.5
- sleep_pressure_decay_per_tick: 3.7
- sleep_energy_mode: dream
- sleep_energy_floor: 25

## Energie-Dynamik
- energy_couples_to_chrono: yes

## Temperatur-Profil
- sleep_rem_temperature: 1.5
`;

const SCHULKIND_BODY_MD = `# Om's Körper

## Entwicklungsstufe
- stage: schulkind
- age_equivalent_months: 84

## Schlaf-Architektur
- sleep_pattern: monophasic
- night_sleep_target_hours: 10
- nap_count_per_day: 0
- max_wake_during_night_ticks: 1
- sleep_pressure_gain_per_tick: 1.2
- sleep_pressure_decay_per_tick: 3.0
- sleep_energy_mode: balanced
- sleep_energy_floor: 35
- hard_sleep_hour: 21
- hard_wake_hour: 7

## Energie-Dynamik
- energy_volatility: moderate
- energy_couples_to_chrono: yes

## Aufmerksamkeit
- max_focus_heartbeats: 20

## Emotionale Regulation
- mood_volatility: low

## Neugier und Spieltrieb
- base_curiosity: 0.7
- novelty_seeking: high
- play_over_work_bias: 0.4

## Autonomie
- autonomy_level: L2
- max_tools_per_heartbeat: 6

## Temperatur-Profil
- waking_temperature_base: 0.5
- sleep_rem_temperature: 1.3
`;

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("parseBodyProfile", () => {
  it("parses kleinkind defaults from minimal BODY.md", () => {
    const profile = parseBodyProfile(MINIMAL_BODY_MD);
    expect(profile.stage).toBe("kleinkind");
    expect(profile.ageMonths).toBe(30);
    expect(profile.sleepPattern).toBe("polyphasic");
    expect(profile.maxWakeDuringNightTicks).toBe(3);
    expect(profile.sleepPressureGainPerTick).toBe(2.5);
    expect(profile.sleepPressureDecayPerTick).toBe(3.7);
    expect(profile.sleepEnergyMode).toBe("dream");
    expect(profile.sleepEnergyFloor).toBe(25);
    expect(profile.energyCouplesToChrono).toBe(true);
    expect(profile.sleepRemTemperature).toBe(1.5);
  });

  it("falls back to defaults for missing keys", () => {
    const profile = parseBodyProfile(MINIMAL_BODY_MD);
    // These were not specified in the minimal fixture
    expect(profile.nightSleepTargetHours).toBe(BODY_DEFAULTS.nightSleepTargetHours);
    expect(profile.napCountPerDay).toBe(BODY_DEFAULTS.napCountPerDay);
    expect(profile.moodVolatility).toBe(BODY_DEFAULTS.moodVolatility);
    expect(profile.baseCuriosity).toBe(BODY_DEFAULTS.baseCuriosity);
    expect(profile.wakingTemperatureBase).toBe(BODY_DEFAULTS.wakingTemperatureBase);
    expect(profile.autonomyLevel).toBe(BODY_DEFAULTS.autonomyLevel);
  });

  it("parses schulkind profile with different values", () => {
    const profile = parseBodyProfile(SCHULKIND_BODY_MD);
    expect(profile.stage).toBe("schulkind");
    expect(profile.ageMonths).toBe(84);
    expect(profile.sleepPattern).toBe("monophasic");
    expect(profile.nightSleepTargetHours).toBe(10);
    expect(profile.napCountPerDay).toBe(0);
    expect(profile.maxWakeDuringNightTicks).toBe(1);
    expect(profile.sleepPressureGainPerTick).toBe(1.2);
    expect(profile.sleepEnergyMode).toBe("balanced");
    expect(profile.sleepEnergyFloor).toBe(35);
    expect(profile.hardSleepHour).toBe(21);
    expect(profile.energyVolatility).toBe("moderate");
    expect(profile.maxFocusHeartbeats).toBe(20);
    expect(profile.moodVolatility).toBe("low");
    expect(profile.baseCuriosity).toBe(0.7);
    expect(profile.noveltySeeking).toBe("high");
    expect(profile.playOverWorkBias).toBe(0.4);
    expect(profile.autonomyLevel).toBe("L2");
    expect(profile.maxToolsPerHeartbeat).toBe(6);
    expect(profile.wakingTemperatureBase).toBe(0.5);
    expect(profile.sleepRemTemperature).toBe(1.3);
  });

  it("returns all defaults for empty string", () => {
    const profile = parseBodyProfile("");
    expect(profile).toEqual(BODY_DEFAULTS);
  });

  it("returns all defaults for garbage input", () => {
    const profile = parseBodyProfile("🦄 this is definitely not a BODY.md file\n{{{}}}\n\n");
    expect(profile).toEqual(BODY_DEFAULTS);
  });

  it("ignores unknown enum values and falls back", () => {
    const weird = `
- stage: alien
- sleep_pattern: quantum
- energy_volatility: extreme
- autonomy_level: L9
- shadow_permission: maybe
`;
    const profile = parseBodyProfile(weird);
    expect(profile.stage).toBe(BODY_DEFAULTS.stage);
    expect(profile.sleepPattern).toBe(BODY_DEFAULTS.sleepPattern);
    expect(profile.energyVolatility).toBe(BODY_DEFAULTS.energyVolatility);
    expect(profile.autonomyLevel).toBe(BODY_DEFAULTS.autonomyLevel);
    expect(profile.shadowPermission).toBe(BODY_DEFAULTS.shadowPermission);
  });

  it("handles non-numeric values gracefully", () => {
    const broken = `
- age_equivalent_months: viel
- sleep_pressure_gain_per_tick: schnell
- base_curiosity: NaN
- max_tools_per_heartbeat: infinity
`;
    const profile = parseBodyProfile(broken);
    expect(profile.ageMonths).toBe(BODY_DEFAULTS.ageMonths);
    expect(profile.sleepPressureGainPerTick).toBe(BODY_DEFAULTS.sleepPressureGainPerTick);
    expect(profile.baseCuriosity).toBe(BODY_DEFAULTS.baseCuriosity);
    // "infinity" parses to Infinity which is not finite → fallback
    expect(profile.maxToolsPerHeartbeat).toBe(BODY_DEFAULTS.maxToolsPerHeartbeat);
  });
});

describe("isNightHour", () => {
  const kleinkind: BodyProfile = { ...BODY_DEFAULTS, hardSleepHour: 20, hardWakeHour: 7 };

  it("recognises 22:00 as night", () => {
    expect(isNightHour(22, kleinkind)).toBe(true);
  });

  it("recognises 02:00 as night", () => {
    expect(isNightHour(2, kleinkind)).toBe(true);
  });

  it("recognises 20:00 as night (boundary)", () => {
    expect(isNightHour(20, kleinkind)).toBe(true);
  });

  it("recognises 07:00 as NOT night (boundary)", () => {
    expect(isNightHour(7, kleinkind)).toBe(false);
  });

  it("recognises 14:00 as NOT night", () => {
    expect(isNightHour(14, kleinkind)).toBe(false);
  });

  it("adapts to schulkind hours (21-7)", () => {
    const schulkind: BodyProfile = { ...BODY_DEFAULTS, hardSleepHour: 21, hardWakeHour: 7 };
    expect(isNightHour(20, schulkind)).toBe(false);
    expect(isNightHour(21, schulkind)).toBe(true);
  });
});

describe("bodyStageLabel", () => {
  it("returns correct label for kleinkind", () => {
    expect(bodyStageLabel(BODY_DEFAULTS)).toBe("Kleinkind (~30 Monate)");
  });

  it("returns correct label for schulkind", () => {
    const schulkind: BodyProfile = { ...BODY_DEFAULTS, stage: "schulkind", ageMonths: 84 };
    expect(bodyStageLabel(schulkind)).toBe("Schulkind (~84 Monate)");
  });

  it("returns correct label for teenager", () => {
    const teen: BodyProfile = { ...BODY_DEFAULTS, stage: "teenager", ageMonths: 168 };
    expect(bodyStageLabel(teen)).toBe("Teenager (~168 Monate)");
  });
});
