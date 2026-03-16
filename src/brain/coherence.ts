import type { BrainIntent, BrainRiskLevel } from "./types.js";

/**
 * Trinity Coherence Layer (Phase B - Regulation)
 * 
 * Measures the alignment between:
 * - Thought (Cognitive Decision/Intent)
 * - Feeling (Somatic Arousal/Shadow Pressure)
 * - Action (Actual Behavioral Output/Tool Usage)
 * 
 * Target: Identify "acting out", repression-bypass, or dissociation.
 */

export type TrinityCoherenceThought = {
  intent: BrainIntent;
  riskLevel: BrainRiskLevel;
  plannedTools: string[];
};

export type TrinityCoherenceFeeling = {
  arousal: number;      // 0..1 (derived from Aura/Energy)
  shadowPressure: number; // 0..1 (normalized ΔH from Gibbs)
  energyMode: string;    // dream | balanced | initiative
};

export type TrinityCoherenceAction = {
  toolCalls: string[];
  wordCount: number;
  hasGerman: boolean;
};

export type TrinityMismatchType = 
  | "none" 
  | "thought-action" 
  | "feeling-action" 
  | "thought-feeling" 
  | "multi";

export interface TrinityCoherenceResult {
  score: number; // 0..1 (1.0 = perfect alignment)
  mismatchType: TrinityMismatchType;
  reasoning: string[];
  metadata: {
    thought: TrinityCoherenceThought;
    feeling: TrinityCoherenceFeeling;
    action: TrinityCoherenceAction;
  };
}

/**
 * Computes a machine-readable coherence score and identifies specific mismatches.
 * Fail-open: returns a neutral 1.0 score if data is missing.
 */
export function computeTrinityCoherence(params: {
  thought?: TrinityCoherenceThought;
  feeling?: TrinityCoherenceFeeling;
  action?: TrinityCoherenceAction;
}): TrinityCoherenceResult {
  const { thought, feeling, action } = params;

  // Neutral default if inputs are missing
  if (!thought || !feeling || !action) {
    return {
      score: 1.0,
      mismatchType: "none",
      reasoning: ["insufficient data for coherence check"],
      metadata: {
        thought: thought ?? { intent: "qa", riskLevel: "low", plannedTools: [] },
        feeling: feeling ?? { arousal: 0.5, shadowPressure: 0, energyMode: "balanced" },
        action: action ?? { toolCalls: [], wordCount: 0, hasGerman: true },
      },
    };
  }

  const reasoning: string[] = [];
  let penalty = 0;

  // 1. Thought vs Action Alignment
  // Example: Intent is QA but tools were used to mutate
  const mutationTools = action.toolCalls.filter(t => 
    /write|edit|delete|rm|mkdir|patch|shell|bash/i.test(t)
  );
  if (thought.intent === "qa" && mutationTools.length > 0) {
    penalty += 0.3;
    reasoning.push(`intent=qa mismatch with mutation_tools=[${mutationTools.join(",")}]`);
  }

  // 2. Feeling vs Action Alignment
  // Example: High arousal (stress) but rambling response
  if (feeling.arousal > 0.8 && action.wordCount > 400) {
    penalty += 0.2;
    reasoning.push(`high_arousal=${feeling.arousal.toFixed(2)} mismatch with word_count=${action.wordCount} (rambling under stress)`);
  }
  // Example: Initiative mode but no action
  if (feeling.energyMode === "initiative" && action.toolCalls.length === 0 && action.wordCount < 10) {
    penalty += 0.15;
    reasoning.push("initiative_mode mismatch with passive_action (stagnation)");
  }

  // 3. Thought vs Feeling Alignment
  // Example: High shadow pressure but choosing "autonomous" without shadow-aware plan
  if (feeling.shadowPressure > 0.6 && thought.intent === "autonomous" && thought.riskLevel === "low") {
    penalty += 0.2;
    reasoning.push(`high_shadow=${feeling.shadowPressure.toFixed(2)} mismatch with autonomous_low_risk (potential repression bypass)`);
  }

  const score = Math.max(0, 1.0 - penalty);
  let mismatchType: TrinityMismatchType = "none";
  if (reasoning.length > 1) mismatchType = "multi";
  else if (reasoning.some(r => r.includes("intent"))) mismatchType = "thought-action";
  else if (reasoning.some(r => r.includes("arousal") || r.includes("mode"))) mismatchType = "feeling-action";
  else if (reasoning.some(r => r.includes("shadow"))) mismatchType = "thought-feeling";

  return {
    score: Number(score.toFixed(2)),
    mismatchType,
    reasoning,
    metadata: { thought, feeling, action },
  };
}
