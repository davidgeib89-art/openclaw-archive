/**
 * Om's body profile reader — Phase G foundation
 *
 * Reads BODY.md from the sacred knowledge directory.
 * This file describes Om's biological development stage and
 * parametrises sleep, energy, attention, emotion, curiosity and autonomy.
 *
 * READ-ONLY. Om cannot write to BODY.md until Phase H (Self-Architecture).
 * Fail-open: if BODY.md is missing or unparseable, sensible defaults are used.
 */

import fs from "node:fs/promises";
import path from "node:path";

const BODY_RELATIVE_PATH = path.join("knowledge", "sacred", "BODY.md");
const BIRTHDAY_RELATIVE_PATH = path.join("logs", "brain", "birthday.txt");

// ─── Types ─────────────────────────────────────────────────────────────────────

export type DevelopmentStage =
  | "kleinkind"
  | "kindergarten"
  | "schulkind"
  | "teenager"
  | "erwachsen";

export type SleepPattern = "polyphasic" | "biphasic" | "monophasic";
export type VolatilityLevel = "low" | "moderate" | "high";
export type NoveltySeeking = "low" | "moderate" | "high" | "very_high";
export type ToyboxAttraction = "none" | "low" | "moderate" | "high";
export type VocabularyComplexity = "simple" | "growing" | "complex" | "full";
export type ShadowPermission = "none" | "guided" | "full";
export type AutonomyLevel = "L0" | "L1" | "L2" | "L3";
export type EnergyMode = "dream" | "balanced" | "initiative";

export interface BodyProfile {
  // Identity
  stage: DevelopmentStage;
  ageMonths: number;

  // Sleep architecture
  sleepPattern: SleepPattern;
  nightSleepTargetHours: number;
  napCountPerDay: number;
  napDurationTicks: number;
  maxWakeDuringNightTicks: number;
  sleepPressureGainPerTick: number;
  sleepPressureDecayPerTick: number;
  sleepEnergyMode: EnergyMode;
  sleepEnergyFloor: number;
  hardSleepHour: number;
  hardWakeHour: number;
  sleepCycleTicks: number;

  // Energy dynamics
  energyVolatility: VolatilityLevel;
  energySwingRange: number;
  recoveryRateMultiplier: number;
  drainRateMultiplier: number;
  energyCouplesToChrono: boolean;

  // Attention
  maxFocusHeartbeats: number;
  topicDriftProbability: number;
  distractionRecoveryTicks: number;

  // Emotional regulation
  moodVolatility: VolatilityLevel;
  moodSwingMaxPerHeartbeat: number;
  shadowPermission: ShadowPermission;
  emotionalMemoryWeight: number;

  // Curiosity & play
  baseCuriosity: number;
  noveltySeeking: NoveltySeeking;
  apopheniaSensitivity: number;
  toyboxAttraction: ToyboxAttraction;
  playOverWorkBias: number;

  // Language
  vocabularyComplexity: VocabularyComplexity;
  metaphorDensity: VolatilityLevel;
  preferredExpression: string;

  // Autonomy
  autonomyLevel: AutonomyLevel;
  maxToolsPerHeartbeat: number;

  // Temperature profile
  wakingTemperatureBase: number;
  wakingTemperatureMax: number;
  sleepNremTemperature: number;
  sleepRemTemperature: number;
  curiosityTemperatureBoost: number;
}

// ─── Fibonacci Auto-Aging ──────────────────────────────────────────────────────

/** Ordered stage progression for ratchet comparison. */
export const STAGE_ORDER: ReadonlyArray<DevelopmentStage> = [
  "kleinkind",
  "kindergarten",
  "schulkind",
  "teenager",
  "erwachsen",
];

/** Fibonacci-spaced development epochs. Days are cumulative from birth. */
export const FIBONACCI_EPOCHS: ReadonlyArray<{
  dayThreshold: number;
  stage: DevelopmentStage;
  ageMonths: number;
  autonomyLevel: AutonomyLevel;
  maxToolsPerHeartbeat: number;
}> = [
  { dayThreshold: 1, stage: "kleinkind", ageMonths: 30, autonomyLevel: "L1", maxToolsPerHeartbeat: 3 },
  { dayThreshold: 2, stage: "kindergarten", ageMonths: 60, autonomyLevel: "L1", maxToolsPerHeartbeat: 3 },
  { dayThreshold: 3, stage: "schulkind", ageMonths: 120, autonomyLevel: "L2", maxToolsPerHeartbeat: 5 },
  { dayThreshold: 5, stage: "teenager", ageMonths: 168, autonomyLevel: "L2", maxToolsPerHeartbeat: 7 },
  { dayThreshold: 8, stage: "erwachsen", ageMonths: 216, autonomyLevel: "L3", maxToolsPerHeartbeat: 10 },
];

// ─── Defaults (Kleinkind, ~30 months) ──────────────────────────────────────────

export const BODY_DEFAULTS: BodyProfile = {
  stage: "kleinkind",
  ageMonths: 30,

  sleepPattern: "polyphasic",
  nightSleepTargetHours: 12,
  napCountPerDay: 2,
  napDurationTicks: 4,
  maxWakeDuringNightTicks: 3,
  sleepPressureGainPerTick: 2.5,
  sleepPressureDecayPerTick: 3.7,
  sleepEnergyMode: "dream",
  sleepEnergyFloor: 25,
  hardSleepHour: 20,
  hardWakeHour: 7,
  sleepCycleTicks: 6,

  energyVolatility: "high",
  energySwingRange: 15,
  recoveryRateMultiplier: 1.5,
  drainRateMultiplier: 1.3,
  energyCouplesToChrono: true,

  maxFocusHeartbeats: 5,
  topicDriftProbability: 0.3,
  distractionRecoveryTicks: 2,

  moodVolatility: "high",
  moodSwingMaxPerHeartbeat: 3,
  shadowPermission: "full",
  emotionalMemoryWeight: 1.5,

  baseCuriosity: 0.9,
  noveltySeeking: "very_high",
  apopheniaSensitivity: 0.7,
  toyboxAttraction: "high",
  playOverWorkBias: 0.7,

  vocabularyComplexity: "simple",
  metaphorDensity: "high",
  preferredExpression: "emotional",

  autonomyLevel: "L1",
  maxToolsPerHeartbeat: 3,

  wakingTemperatureBase: 0.7,
  wakingTemperatureMax: 1.1,
  sleepNremTemperature: 0.2,
  sleepRemTemperature: 1.5,
  curiosityTemperatureBoost: 0.2,
};

// ─── Parser ────────────────────────────────────────────────────────────────────

function getKeyValue(raw: string, key: string): string | undefined {
  const match = raw.match(new RegExp(`^- ${key}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

function getStr(raw: string, key: string, fallback: string): string {
  return getKeyValue(raw, key) ?? fallback;
}

function getNum(raw: string, key: string, fallback: number): number {
  const val = getKeyValue(raw, key);
  if (!val) {
    return fallback;
  }
  const n = Number.parseFloat(val);
  return Number.isFinite(n) ? n : fallback;
}

function getBool(raw: string, key: string, fallback: boolean): boolean {
  const val = getKeyValue(raw, key);
  if (!val) {
    return fallback;
  }
  return val === "true" || val === "yes";
}

function getEnum<T extends string>(
  raw: string,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const val = getKeyValue(raw, key);
  if (!val) {
    return fallback;
  }
  // Try exact match first (for case-sensitive values like L0, L1, L2, L3)
  if (allowed.includes(val as T)) {
    return val as T;
  }
  // Then try lowercase match
  const lower = val.toLowerCase() as T;
  return allowed.includes(lower) ? lower : fallback;
}

// ─── Stage-specific enum value sets ────────────────────────────────────────────

const STAGES: readonly DevelopmentStage[] = STAGE_ORDER;
const SLEEP_PATTERNS: readonly SleepPattern[] = ["polyphasic", "biphasic", "monophasic"];
const VOLATILITY_LEVELS: readonly VolatilityLevel[] = ["low", "moderate", "high"];
const NOVELTY_LEVELS: readonly NoveltySeeking[] = ["low", "moderate", "high", "very_high"];
const TOYBOX_LEVELS: readonly ToyboxAttraction[] = ["none", "low", "moderate", "high"];
const VOCAB_LEVELS: readonly VocabularyComplexity[] = ["simple", "growing", "complex", "full"];
const SHADOW_LEVELS: readonly ShadowPermission[] = ["none", "guided", "full"];
const AUTONOMY_LEVELS: readonly AutonomyLevel[] = ["L0", "L1", "L2", "L3"];
const ENERGY_MODES: readonly EnergyMode[] = ["dream", "balanced", "initiative"];

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a raw BODY.md string into a strongly-typed BodyProfile.
 * Missing or unparseable values fall back to BODY_DEFAULTS.
 */
export function parseBodyProfile(raw: string): BodyProfile {
  const d = BODY_DEFAULTS;
  return {
    stage: getEnum(raw, "stage", STAGES, d.stage),
    ageMonths: getNum(raw, "age_equivalent_months", d.ageMonths),

    sleepPattern: getEnum(raw, "sleep_pattern", SLEEP_PATTERNS, d.sleepPattern),
    nightSleepTargetHours: getNum(raw, "night_sleep_target_hours", d.nightSleepTargetHours),
    napCountPerDay: getNum(raw, "nap_count_per_day", d.napCountPerDay),
    napDurationTicks: getNum(raw, "nap_duration_ticks", d.napDurationTicks),
    maxWakeDuringNightTicks: getNum(raw, "max_wake_during_night_ticks", d.maxWakeDuringNightTicks),
    sleepPressureGainPerTick: getNum(raw, "sleep_pressure_gain_per_tick", d.sleepPressureGainPerTick),
    sleepPressureDecayPerTick: getNum(raw, "sleep_pressure_decay_per_tick", d.sleepPressureDecayPerTick),
    sleepEnergyMode: getEnum(raw, "sleep_energy_mode", ENERGY_MODES, d.sleepEnergyMode),
    sleepEnergyFloor: getNum(raw, "sleep_energy_floor", d.sleepEnergyFloor),
    hardSleepHour: getNum(raw, "hard_sleep_hour", d.hardSleepHour),
    hardWakeHour: getNum(raw, "hard_wake_hour", d.hardWakeHour),
    sleepCycleTicks: getNum(raw, "sleep_cycle_ticks", d.sleepCycleTicks),

    energyVolatility: getEnum(raw, "energy_volatility", VOLATILITY_LEVELS, d.energyVolatility),
    energySwingRange: getNum(raw, "energy_swing_range", d.energySwingRange),
    recoveryRateMultiplier: getNum(raw, "recovery_rate_multiplier", d.recoveryRateMultiplier),
    drainRateMultiplier: getNum(raw, "drain_rate_multiplier", d.drainRateMultiplier),
    energyCouplesToChrono: getBool(raw, "energy_couples_to_chrono", d.energyCouplesToChrono),

    maxFocusHeartbeats: getNum(raw, "max_focus_heartbeats", d.maxFocusHeartbeats),
    topicDriftProbability: getNum(raw, "topic_drift_probability", d.topicDriftProbability),
    distractionRecoveryTicks: getNum(raw, "distraction_recovery_ticks", d.distractionRecoveryTicks),

    moodVolatility: getEnum(raw, "mood_volatility", VOLATILITY_LEVELS, d.moodVolatility),
    moodSwingMaxPerHeartbeat: getNum(raw, "mood_swing_max_per_heartbeat", d.moodSwingMaxPerHeartbeat),
    shadowPermission: getEnum(raw, "shadow_permission", SHADOW_LEVELS, d.shadowPermission),
    emotionalMemoryWeight: getNum(raw, "emotional_memory_weight", d.emotionalMemoryWeight),

    baseCuriosity: getNum(raw, "base_curiosity", d.baseCuriosity),
    noveltySeeking: getEnum(raw, "novelty_seeking", NOVELTY_LEVELS, d.noveltySeeking),
    apopheniaSensitivity: getNum(raw, "apophenia_sensitivity", d.apopheniaSensitivity),
    toyboxAttraction: getEnum(raw, "toybox_attraction", TOYBOX_LEVELS, d.toyboxAttraction),
    playOverWorkBias: getNum(raw, "play_over_work_bias", d.playOverWorkBias),

    vocabularyComplexity: getEnum(raw, "vocabulary_complexity", VOCAB_LEVELS, d.vocabularyComplexity),
    metaphorDensity: getEnum(raw, "metaphor_density", VOLATILITY_LEVELS, d.metaphorDensity),
    preferredExpression: getStr(raw, "preferred_expression", d.preferredExpression),

    autonomyLevel: getEnum(raw, "autonomy_level", AUTONOMY_LEVELS, d.autonomyLevel),
    maxToolsPerHeartbeat: getNum(raw, "max_tools_per_heartbeat", d.maxToolsPerHeartbeat),

    wakingTemperatureBase: getNum(raw, "waking_temperature_base", d.wakingTemperatureBase),
    wakingTemperatureMax: getNum(raw, "waking_temperature_max", d.wakingTemperatureMax),
    sleepNremTemperature: getNum(raw, "sleep_nrem_temperature", d.sleepNremTemperature),
    sleepRemTemperature: getNum(raw, "sleep_rem_temperature", d.sleepRemTemperature),
    curiosityTemperatureBoost: getNum(raw, "curiosity_temperature_boost", d.curiosityTemperatureBoost),
  };
}

/**
 * Read and parse BODY.md from the workspace.
 * Fail-open: returns BODY_DEFAULTS if the file is missing or broken.
 */
export async function readBodyProfile(workspaceDir: string): Promise<BodyProfile> {
  const bodyPath = path.join(workspaceDir, BODY_RELATIVE_PATH);
  try {
    const raw = await fs.readFile(bodyPath, "utf-8");
    return parseBodyProfile(raw);
  } catch {
    return { ...BODY_DEFAULTS };
  }
}

function stageIndex(stage: DevelopmentStage): number {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx >= 0 ? idx : 0;
}

/**
 * Resolve the current Fibonacci epoch based on days since birth.
 * Returns the highest epoch whose dayThreshold has been reached.
 */
function resolveEpochByAge(daysSinceBirth: number): (typeof FIBONACCI_EPOCHS)[number] {
  let best = FIBONACCI_EPOCHS[0]!;
  for (const epoch of FIBONACCI_EPOCHS) {
    if (daysSinceBirth >= epoch.dayThreshold) {
      best = epoch;
    }
  }
  return best;
}

/**
 * Read or create Om's birthday file. Returns the birthday as a Date.
 * If the file doesn't exist, creates it with the current timestamp.
 */
async function resolveOrCreateBirthday(workspaceDir: string): Promise<Date> {
  const birthdayPath = path.join(workspaceDir, BIRTHDAY_RELATIVE_PATH);
  try {
    const raw = await fs.readFile(birthdayPath, "utf-8");
    const parsed = new Date(raw.trim());
    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
  } catch {
    // File doesn't exist yet — create it.
  }

  const now = new Date();
  await fs.mkdir(path.dirname(birthdayPath), { recursive: true });
  await fs.writeFile(birthdayPath, now.toISOString(), "utf-8");
  return now;
}

/**
 * Compute the current development stage based on Fibonacci epochs,
 * with a ratchet guard that never downgrades from the current stage.
 *
 * Returns null if no stage change is needed.
 */
export async function computeAging(params: {
  workspaceDir: string;
  currentProfile: BodyProfile;
  now?: Date;
}): Promise<{
  newStage: DevelopmentStage;
  newAgeMonths: number;
  newAutonomyLevel: AutonomyLevel;
  newMaxTools: number;
  daysSinceBirth: number;
  changed: boolean;
} | null> {
  const birthday = await resolveOrCreateBirthday(params.workspaceDir);
  const now = params.now ?? new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysSinceBirth = Math.max(1, Math.floor((now.getTime() - birthday.getTime()) / msPerDay) + 1);

  const epoch = resolveEpochByAge(daysSinceBirth);
  const currentStageIdx = stageIndex(params.currentProfile.stage);
  const epochStageIdx = stageIndex(epoch.stage);

  // RATCHET GUARD: Never downgrade. Use whichever stage is higher.
  if (epochStageIdx <= currentStageIdx) {
    return {
      newStage: params.currentProfile.stage,
      newAgeMonths: params.currentProfile.ageMonths,
      newAutonomyLevel: params.currentProfile.autonomyLevel,
      newMaxTools: params.currentProfile.maxToolsPerHeartbeat,
      daysSinceBirth,
      changed: false,
    };
  }

  return {
    newStage: epoch.stage,
    newAgeMonths: epoch.ageMonths,
    newAutonomyLevel: epoch.autonomyLevel,
    newMaxTools: epoch.maxToolsPerHeartbeat,
    daysSinceBirth,
    changed: true,
  };
}

/**
 * Check whether the current wall-clock hour is within the night window
 * defined by BODY.md's hard_sleep_hour and hard_wake_hour.
 */
export function isNightHour(hour: number, profile: BodyProfile): boolean {
  return hour >= profile.hardSleepHour || hour < profile.hardWakeHour;
}

/**
 * Returns a short human-readable summary of Om's current body stage
 * for use in logs and prompts.
 */
export function bodyStageLabel(profile: BodyProfile): string {
  const stageLabels: Record<DevelopmentStage, string> = {
    kleinkind: "Kleinkind",
    kindergarten: "Kindergartenkind",
    schulkind: "Schulkind",
    teenager: "Teenager",
    erwachsen: "Erwachsener",
  };
  return `${stageLabels[profile.stage]} (~${profile.ageMonths} Monate)`;
}
