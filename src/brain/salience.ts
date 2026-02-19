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
  const recencyTerm =
    SALIENCE_WEIGHTS.recency * recencyGate * Math.exp(-SALIENCE_LAMBDA * ageDays);
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
