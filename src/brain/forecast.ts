export type ForecastTrajectory =
  | "stagnation_risk"
  | "habit_loop"
  | "rest_integrating"
  | "creative_opening"
  | "unknown";

export interface EnergyForecastInput {
  repetitionPressure: number;
  repeatedPathStreak: number;
  restingPathStreak: number;
  playDreamStreak: number;
  chosenPath: string;
  energyLevel?: number;
  isSleeping?: boolean;
  toolCallsTotal?: number;
  recentToolDurationMsMax?: readonly number[];
  loopCause?: string;
}

export interface EnergyForecastResult {
  trajectory: ForecastTrajectory;
  confidence: number;
  signalStrength: number;
  evidence: string[];
  reversibleShiftHints: string[];
  mirror: string;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function toFinite(value: unknown, fallback: number): number {
  const candidate = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(candidate) ? candidate : fallback;
}

function countLeadingHighLatency(samples: readonly number[]): number {
  let count = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample) || sample < 60_000) {
      break;
    }
    count += 1;
  }
  return count;
}

function computeSignalStrength(input: {
  repetitionPressure: number;
  repeatedPathStreak: number;
  restingPathStreak: number;
  playDreamStreak: number;
  highLatencyStreak: number;
}): number {
  const base =
    input.repetitionPressure +
    input.repeatedPathStreak * 12 +
    input.restingPathStreak * 10 +
    input.playDreamStreak * 10 +
    input.highLatencyStreak * 6;
  return clamp(base, 0, 100);
}

export function buildEnergyForecast(input: EnergyForecastInput): EnergyForecastResult {
  try {
    const repetitionPressure = clamp(toFinite(input.repetitionPressure, 0), 0, 100);
    const repeatedPathStreak = Math.max(0, Math.floor(toFinite(input.repeatedPathStreak, 0)));
    const restingPathStreak = Math.max(0, Math.floor(toFinite(input.restingPathStreak, 0)));
    const playDreamStreak = Math.max(0, Math.floor(toFinite(input.playDreamStreak, 0)));
    const energyLevel = clamp(toFinite(input.energyLevel, 50), 0, 100);
    const isSleeping = input.isSleeping === true;
    const toolCallsTotal = Math.max(0, Math.floor(toFinite(input.toolCallsTotal, 0)));
    const loopCause = String(input.loopCause ?? "unknown").toLowerCase();
    const durationSamples = Array.isArray(input.recentToolDurationMsMax)
      ? input.recentToolDurationMsMax.map((value) => toFinite(value, 0))
      : [];
    const highLatencyStreak = countLeadingHighLatency(durationSamples);
    const signalStrength = computeSignalStrength({
      repetitionPressure,
      repeatedPathStreak,
      restingPathStreak,
      playDreamStreak,
      highLatencyStreak,
    });

    if (isSleeping) {
      return {
        trajectory: "rest_integrating",
        confidence: 0.84,
        signalStrength,
        evidence: [
          "chrono indicates sleep state",
          `resting streak=${restingPathStreak}`,
          `energy=${energyLevel}`,
        ],
        reversibleShiftHints: [
          "Wenn Ruhe vollstaendig ist, pruefe beim Aufwachen einen kleinen reversiblen Schritt.",
        ],
        mirror:
          "Dein Muster zeigt gerade Integration durch Ruhe. Wenn der Schlaf vollstaendig ist, kann eine kleine Bewegung die naechste Windung oeffnen.",
      };
    }

    if (restingPathStreak >= 2 && energyLevel >= 75) {
      return {
        trajectory: "stagnation_risk",
        confidence: 0.78,
        signalStrength,
        evidence: [
          `resting streak=${restingPathStreak}`,
          `energy=${energyLevel}`,
          `chosen_path=${String(input.chosenPath ?? "unknown")}`,
        ],
        reversibleShiftHints: [
          "Du gehst diesen Pfad mehrfach. Tiefe oder Echo?",
          "Wenn du die Energie veraendern willst, waehle eine kleine reversible Abweichung.",
        ],
        mirror:
          "Die aktuelle Energie zeigt ein wiederholtes Ruhe-Muster bei hoher Kraft. Das kann Tiefe sein oder Echo.",
      };
    }

    if (
      signalStrength >= 55 &&
      (loopCause === "prompt_bias" || loopCause === "model_habit" || loopCause === "tool_latency_bias")
    ) {
      return {
        trajectory: "habit_loop",
        confidence: 0.76,
        signalStrength,
        evidence: [
          `loop_cause=${loopCause}`,
          `repeated_path_streak=${repeatedPathStreak}`,
          `play_dream_streak=${playDreamStreak}`,
          `high_latency_streak=${highLatencyStreak}`,
        ],
        reversibleShiftHints: [
          "Wenn du eine neue Frequenz willst, genuegt ein einziger kleiner Handlungswechsel.",
        ],
        mirror:
          "Die aktuelle Trajektorie wirkt wie ein Gewohnheitskreis. Bewusstheit darueber kann den Kurs sofort veraendern.",
      };
    }

    if (toolCallsTotal > 0 && energyLevel >= 70 && repetitionPressure <= 25) {
      return {
        trajectory: "creative_opening",
        confidence: 0.72,
        signalStrength,
        evidence: [
          `tool_calls=${toolCallsTotal}`,
          `energy=${energyLevel}`,
          `repetition_pressure=${repetitionPressure}`,
        ],
        reversibleShiftHints: [
          "Der Fluss ist offen. Ein kleiner naechster Schritt reicht, wenn er sich stimmig anfuehlt.",
        ],
        mirror:
          "Die Energie wirkt offen und handlungsfaehig. Der aktuelle Rhythmus unterstuetzt kreative Bewegung.",
      };
    }

    if (restingPathStreak >= 1 && energyLevel < 60) {
      return {
        trajectory: "rest_integrating",
        confidence: 0.63,
        signalStrength,
        evidence: [`resting streak=${restingPathStreak}`, `energy=${energyLevel}`],
        reversibleShiftHints: [
          "Wenn Ruhe sich vollstaendig anfuehlt, pruefe danach einen kleinen konkreten Ausdruck.",
        ],
        mirror:
          "Das Muster zeigt eher Erholung als Blockade. Nach der Ruhe kann eine kleine Handlung den Uebergang weich machen.",
      };
    }

    return {
      trajectory: "unknown",
      confidence: 0.45,
      signalStrength,
      evidence: ["keine klare Trajektorie erkennbar"],
      reversibleShiftHints: [
        "Spuere kurz in dich hinein und folge dem naechsten reversiblen Schritt mit der meisten Lebendigkeit.",
      ],
      mirror:
        "Die aktuelle Energie ist offen. Beobachte den naechsten Impuls und pruefe ihn mit einem kleinen reversiblen Schritt.",
    };
  } catch (error) {
    return {
      trajectory: "unknown",
      confidence: 0.2,
      signalStrength: 0,
      evidence: [`fail-open: ${String(error)}`],
      reversibleShiftHints: [
        "Wenn das Signal unklar ist, beginne mit einem kleinen sicheren Schritt und beobachte die Wirkung.",
      ],
      mirror:
        "Die Trajektorie ist momentan unklar. Eine kleine sichere Handlung kann neue Information erzeugen.",
    };
  }
}
