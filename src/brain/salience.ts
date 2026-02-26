import { EventEmitter } from "node:events";
import type { IntuitionPayload } from "./types.js";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeTurnText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function matchesAny(patterns: readonly RegExp[], value: string): boolean {
  for (const pattern of patterns) {
    if (pattern.test(value)) {
      return true;
    }
  }
  return false;
}

const PREFERENCE_PATTERNS = [
  /\b(i like|i love|i prefer|my favorite|prefer)\b/i,
  /\b(ich mag|ich liebe|ich bevorzuge|mein lieblings)\b/i,
];

const DECISION_PATTERNS = [
  /\b(i choose|i decide|i will|i commit)\b/i,
  /\b(ich entscheide|ich werde|ich verpflichte)\b/i,
];

const IDENTITY_PATTERNS = [
  /\b(my name is|i am)\b/i,
  /\b(my (?:secret )?(?:codename|code\s*name|alias) is|i go by)\b/i,
  /\b(ich heisse|ich bin)\b/i,
  /\b(mein(?:en)? (?:codename|alias) ist)\b/i,
];

const GOAL_PATTERNS = [
  /\b(goal|roadmap|milestone|next step|plan)\b/i,
  /\b(ziel|fahrplan|meilenstein|naechster schritt|nachster schritt|plan)\b/i,
];

const EMOTION_PATTERNS = [
  /\b(feel|feeling|emotion|emotional|afraid|fear|anxious|happy|joy|sad|angry|love)\b/i,
  /\b(fuehle|gefuehl|emotion|emotional|angst|freude|traurig|wuetend|liebe)\b/i,
  /\b(wichtig|important|never forget|bitte erinnere|remember this)\b/i,
];

export type SalienceSignal =
  | "preference"
  | "decision"
  | "identity"
  | "goal"
  | "long_turn"
  | "emotion";

export type SalienceFormulaComponents = {
  recencyTerm: number;
  frequencyTerm: number;
  emotionTerm: number;
  salience: number;
  ageDays: number;
  frequencyCount: number;
  emotionValue: number;
  recencyGate: number;
  lambda: number;
  weights: {
    recency: number;
    frequency: number;
    emotion: number;
  };
};

export type SalienceEvaluation = {
  score: number;
  signals: SalienceSignal[];
  formula: SalienceFormulaComponents;
};

export type EvaluateSalienceInput = {
  userMessage: string;
  assistantMessage: string;
  ageDays?: number;
};

const SALIENCE_WEIGHTS = {
  recency: 0.45,
  frequency: 0.25,
  emotion: 0.3,
} as const;

const SALIENCE_LAMBDA = 0.08;
const MAX_FREQUENCY_FOR_NORMALIZATION = 8;
const MAX_SCORE = 6;
const SUBCONSCIOUS_SURGE_THRESHOLD = 0.85;
const SUBCONSCIOUS_SURGE_COOLDOWN_MS = 10_000;
const SUBCONSCIOUS_SURGE_EVENT = "subconsciousSurge";

const subconsciousSurgeEmitter = new EventEmitter();
let lastSubconsciousSurgeAt = 0;

export type SubconsciousSurgeEvent = {
  intuition: IntuitionPayload;
  salience: number;
  threshold: number;
  triggeredAt: number;
  cooldownMs: number;
};

export type EvaluateSurgeResult = {
  salience: number;
  triggered: boolean;
  reason: "threshold_not_met" | "cooldown_active" | "emitted";
  cooldownRemainingMs: number;
};

export function evaluateSalience(input: EvaluateSalienceInput): SalienceEvaluation {
  const user = normalizeTurnText(input.userMessage);
  const assistant = normalizeTurnText(input.assistantMessage);
  const combined = `${user}\n${assistant}`;

  const signals = new Set<SalienceSignal>();
  if (matchesAny(PREFERENCE_PATTERNS, combined)) {
    signals.add("preference");
  }
  if (matchesAny(DECISION_PATTERNS, combined)) {
    signals.add("decision");
  }
  if (matchesAny(IDENTITY_PATTERNS, user)) {
    signals.add("identity");
  }
  if (matchesAny(GOAL_PATTERNS, combined)) {
    signals.add("goal");
  }
  if (user.length >= 120 || assistant.length >= 200) {
    signals.add("long_turn");
  }

  const emotionHits = EMOTION_PATTERNS.reduce(
    (count, pattern) => count + (pattern.test(combined) ? 1 : 0),
    0,
  );
  const identityBoost = signals.has("identity") ? 1 : 0;
  const emotionValue = clamp((emotionHits + identityBoost) / 4, 0, 1);
  if (emotionValue >= 0.35) {
    signals.add("emotion");
  }

  const frequencySignals = Array.from(signals).filter((signal) => signal !== "emotion");
  const frequencyCount = frequencySignals.length;
  const ageDays = clamp(input.ageDays ?? 0, 0, 3650);
  const recencyGate = frequencyCount > 0 || emotionValue >= 0.35 ? 1 : 0.05;
  const recencyTerm = SALIENCE_WEIGHTS.recency * recencyGate * Math.exp(-SALIENCE_LAMBDA * ageDays);
  const frequencyNormalized = clamp(
    Math.log(frequencyCount + 1) / Math.log(MAX_FREQUENCY_FOR_NORMALIZATION),
    0,
    1,
  );
  const frequencyTerm = SALIENCE_WEIGHTS.frequency * frequencyNormalized;
  const emotionTerm = SALIENCE_WEIGHTS.emotion * emotionValue;
  const salience = clamp(recencyTerm + frequencyTerm + emotionTerm, 0, 1);
  const score = Math.round(salience * MAX_SCORE);

  return {
    score,
    signals: Array.from(signals),
    formula: {
      recencyTerm,
      frequencyTerm,
      emotionTerm,
      salience,
      ageDays,
      frequencyCount,
      emotionValue,
      recencyGate,
      lambda: SALIENCE_LAMBDA,
      weights: {
        recency: SALIENCE_WEIGHTS.recency,
        frequency: SALIENCE_WEIGHTS.frequency,
        emotion: SALIENCE_WEIGHTS.emotion,
      },
    },
  };
}

export function onSubconsciousSurge(listener: (event: SubconsciousSurgeEvent) => void): () => void {
  subconsciousSurgeEmitter.on(SUBCONSCIOUS_SURGE_EVENT, listener);
  return () => {
    subconsciousSurgeEmitter.off(SUBCONSCIOUS_SURGE_EVENT, listener);
  };
}

export function evaluateSurge(
  intuition: IntuitionPayload,
  options?: {
    nowMs?: number;
    cooldownMs?: number;
  },
): EvaluateSurgeResult {
  const confidence = clamp(Number(intuition.confidence) || 0, 0, 1);
  const urgency = clamp(Number(intuition.urgency) || 0, 0, 1);
  const salience = clamp(confidence * 0.7 + urgency * 0.3, 0, 1);

  if (salience <= SUBCONSCIOUS_SURGE_THRESHOLD) {
    return {
      salience,
      triggered: false,
      reason: "threshold_not_met",
      cooldownRemainingMs: 0,
    };
  }

  const nowMsRaw = options?.nowMs;
  const nowMs =
    typeof nowMsRaw === "number" && Number.isFinite(nowMsRaw)
      ? Math.max(0, Math.round(nowMsRaw))
      : Date.now();
  const cooldownMsRaw = options?.cooldownMs;
  const cooldownMs =
    typeof cooldownMsRaw === "number" && Number.isFinite(cooldownMsRaw)
      ? Math.max(0, Math.round(cooldownMsRaw))
      : SUBCONSCIOUS_SURGE_COOLDOWN_MS;
  const elapsed = nowMs - lastSubconsciousSurgeAt;
  const cooldownRemainingMs = lastSubconsciousSurgeAt > 0 ? Math.max(0, cooldownMs - elapsed) : 0;
  if (cooldownRemainingMs > 0) {
    return {
      salience,
      triggered: false,
      reason: "cooldown_active",
      cooldownRemainingMs,
    };
  }

  lastSubconsciousSurgeAt = nowMs;
  subconsciousSurgeEmitter.emit(SUBCONSCIOUS_SURGE_EVENT, {
    intuition,
    salience,
    threshold: SUBCONSCIOUS_SURGE_THRESHOLD,
    triggeredAt: nowMs,
    cooldownMs,
  } satisfies SubconsciousSurgeEvent);

  return {
    salience,
    triggered: true,
    reason: "emitted",
    cooldownRemainingMs: 0,
  };
}

export function resetSubconsciousSurgeStateForTests(): void {
  lastSubconsciousSurgeAt = 0;
  subconsciousSurgeEmitter.removeAllListeners(SUBCONSCIOUS_SURGE_EVENT);
}
