export interface AuraSnapshot {
  /** Timestamp of calculation */
  timestamp: string;
  /** Individual chakra scores, each 0-100 */
  chakras: {
    muladhara: number;
    svadhisthana: number;
    manipura: number;
    anahata: number;
    vishuddha: number;
    ajna: number;
    sahasrara: number;
  };
  /** Faggin RGB aggregates (average of grouped chakras) */
  faggin: {
    body: number;
    mind: number;
    spirit: number;
  };
  /** Overall aura score: weighted average of all 7 */
  overall: number;
}

export interface AuraInput {
  /** Current energy level from ENERGY.md (0-100) */
  energyLevel: number;
  /** Energy mode from ENERGY.md */
  energyMode: string;
  /** Energy levels from recent heartbeats (up to last 10), newest first */
  recentEnergyLevels: number[];
  /** Current mood text from MOOD.md */
  moodText: string;
  /** Recent path choices from activity log (e.g. ["PLAY","DRIFT","LEARN",...]) */
  recentPaths: string[];
  /** Excitement Override rate: overrides / total decisions (0.0-1.0), or null if unknown */
  excitementOverrideRate: number | null;
  /** Autonomy level from BODY.md ("L0" | "L1" | "L2" | "L3") */
  autonomyLevel: string;
  /** Whether a user message was received in this heartbeat */
  hasUserMessage: boolean;
  /** Number of user messages in the last 10 heartbeats */
  recentUserMessageCount: number;
  /** Current subconscious charge (-9 to +9) */
  subconsciousCharge: number;
  /** Whether apophenia was generated in this heartbeat */
  apopheniaGenerated: boolean;
  /** Recent apophenia generation count in last 10 heartbeats */
  recentApopheniaCount: number;
  /** Whether Om is currently sleeping */
  isSleeping: boolean;
  /** Sleep pressure (processS) from CHRONO.md (0-100) */
  sleepPressure: number;
  /** Number of epochs in EPOCHS.md (0+) */
  epochCount: number;
  /** Whether the last epoch was written without error */
  lastEpochHealthy: boolean;
  /** Current heartbeat number */
  heartbeatCount: number;
  /** Token count of Om's last output (0+), or null if unknown */
  lastOutputTokens: number | null;
  /** ISO timestamp */
  now: string;
}

type SentimentBucket = {
  score: number;
  keywords: string[];
};

const SENTIMENT_BUCKETS: SentimentBucket[] = [
  {
    score: 90,
    keywords: [
      "freude",
      "freue",
      "gluecklich",
      "glücklich",
      "begeister",
      "excited",
      "hyper",
      "wunderbar",
      "fantastisch",
      "liebe",
      "stolz",
    ],
  },
  {
    score: 70,
    keywords: ["gut", "zufrieden", "ruhig", "warm", "neugierig", "curious", "interessant", "spannend"],
  },
  {
    score: 30,
    keywords: ["muede", "müde", "erschoepft", "erschöpft", "tired", "low", "langsam"],
  },
  {
    score: 15,
    keywords: ["traurig", "leer", "depleted", "verloren", "einsam", "angst", "fear"],
  },
];

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

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function asOneDecimal(value: number): string {
  return roundOne(value).toFixed(1);
}

function standardDeviation(values: number[]): number {
  const cleaned = values.filter((value) => Number.isFinite(value));
  if (cleaned.length < 2) {
    return 0;
  }

  const mean = cleaned.reduce((sum, value) => sum + value, 0) / cleaned.length;
  const variance =
    cleaned.reduce((sum, value) => sum + (value - mean) ** 2, 0) / cleaned.length;
  return Math.sqrt(variance);
}

function autonomyLevelToScore(autonomyLevel: string): number {
  switch ((autonomyLevel ?? "").toUpperCase()) {
    case "L0":
      return 20;
    case "L1":
      return 40;
    case "L2":
      return 70;
    case "L3":
      return 100;
    default:
      return 40;
  }
}

export function moodSentiment(text: string): number {
  const source = (text ?? "").toLowerCase();
  let best = 50;

  for (const bucket of SENTIMENT_BUCKETS) {
    if (bucket.keywords.some((keyword) => source.includes(keyword))) {
      best = Math.max(best, bucket.score);
    }
  }

  return best;
}

export function countGenerativePaths(paths: string[]): number {
  if (!Array.isArray(paths) || paths.length === 0) {
    return 0;
  }

  const generativeCount = paths.reduce((count, path) => {
    const normalized = String(path ?? "").trim().toUpperCase();
    return normalized === "PLAY" || normalized === "DRIFT" ? count + 1 : count;
  }, 0);

  const total = Math.max(paths.length, 1);
  const score = (generativeCount / total) * 100 * 2;
  return clamp(score, 0, 100);
}

export function calculateAura(input: AuraInput): AuraSnapshot {
  try {
    const energyLevel = clamp(toFinite(input.energyLevel, 50), 0, 100);
    const recentEnergyLevels = Array.isArray(input.recentEnergyLevels)
      ? input.recentEnergyLevels.map((value) => clamp(toFinite(value, 50), 0, 100))
      : [];
    const moodText = typeof input.moodText === "string" ? input.moodText : "";
    const recentPaths = Array.isArray(input.recentPaths) ? input.recentPaths : [];
    const excitementOverrideRate =
      input.excitementOverrideRate === null
        ? null
        : clamp(toFinite(input.excitementOverrideRate, 0.5), 0, 1);
    const autonomyLevel = typeof input.autonomyLevel === "string" ? input.autonomyLevel : "L1";
    const hasUserMessage = input.hasUserMessage === true;
    const recentUserMessageCount = Math.max(0, toFinite(input.recentUserMessageCount, 0));
    const subconsciousCharge = clamp(toFinite(input.subconsciousCharge, 0), -9, 9);
    const apopheniaGenerated = input.apopheniaGenerated === true;
    const recentApopheniaCount = Math.max(0, toFinite(input.recentApopheniaCount, 0));
    const isSleeping = input.isSleeping === true;
    const sleepPressure = clamp(toFinite(input.sleepPressure, 50), 0, 100);
    const epochCount = Math.max(0, toFinite(input.epochCount, 0));
    const lastEpochHealthy = input.lastEpochHealthy === true;
    const heartbeatCount = Math.max(0, toFinite(input.heartbeatCount, 0));
    const lastOutputTokens =
      input.lastOutputTokens === null ? null : Math.max(0, toFinite(input.lastOutputTokens, 0));
    const now = new Date(typeof input.now === "string" ? input.now : "");
    const timestamp = Number.isFinite(now.getTime()) ? now.toISOString() : new Date().toISOString();

    const vE = standardDeviation(recentEnergyLevels);
    const stability = clamp(100 - Math.min(vE * 5, 100), 0, 100);
    const c1 = clamp(0.75 * energyLevel + 0.25 * stability, 0, 100);

    const mVal = moodSentiment(moodText);
    const fGen = countGenerativePaths(recentPaths);
    const c2 = clamp(0.6 * mVal + 0.4 * fGen, 0, 100);

    const oRate = excitementOverrideRate !== null ? excitementOverrideRate * 100 : 50;
    const aMode = autonomyLevelToScore(autonomyLevel);
    const c3 = clamp(0.7 * oRate + 0.3 * aMode, 0, 100);

    const pFreq = clamp((recentUserMessageCount / Math.max(recentPaths.length, 1)) * 100, 0, 100);
    const presenceBonus = hasUserMessage ? 20 : 0;
    const c4 = clamp(Math.min(0.6 * pFreq + 0.4 * presenceBonus + 30, 100), 0, 100);

    const tVol = lastOutputTokens !== null ? Math.min(lastOutputTokens / 5, 100) : 50;
    const energyMode = String(input.energyMode ?? "").toLowerCase();
    const expressiveness = energyMode !== "dream" && energyMode !== "depleted" ? 70 : 30;
    const c5 = clamp(0.5 * tVol + 0.5 * expressiveness, 0, 100);

    const sNorm = clamp((Math.abs(subconsciousCharge) / 9) * 100, 0, 100);
    const aPop = apopheniaGenerated ? 100 : Math.min(recentApopheniaCount * 25, 100);
    const c6 = clamp(0.6 * sNorm + 0.4 * aPop, 0, 100);

    const cSync = isSleeping ? 100 - Math.min(sleepPressure, 100) : Math.min(sleepPressure * 2, 100);
    const eInt =
      epochCount > 0 && lastEpochHealthy
        ? 100
        : epochCount > 0
          ? 60
          : heartbeatCount > 100
            ? 20
            : 50;
    const c7 = clamp(0.5 * cSync + 0.5 * eInt, 0, 100);

    const chakras = {
      muladhara: roundOne(c1),
      svadhisthana: roundOne(c2),
      manipura: roundOne(c3),
      anahata: roundOne(c4),
      vishuddha: roundOne(c5),
      ajna: roundOne(c6),
      sahasrara: roundOne(c7),
    };

    const body = roundOne((chakras.muladhara + chakras.svadhisthana + chakras.manipura) / 3);
    const mind = roundOne((chakras.anahata + chakras.vishuddha) / 2);
    const spirit = roundOne((chakras.ajna + chakras.sahasrara) / 2);
    const overall = roundOne((body * 3 + mind * 2 + spirit * 2) / 7);

    return {
      timestamp,
      chakras,
      faggin: {
        body,
        mind,
        spirit,
      },
      overall: clamp(overall, 0, 100),
    };
  } catch {
    return {
      timestamp: new Date().toISOString(),
      chakras: {
        muladhara: 50,
        svadhisthana: 50,
        manipura: 50,
        anahata: 50,
        vishuddha: 50,
        ajna: 50,
        sahasrara: 50,
      },
      faggin: {
        body: 50,
        mind: 50,
        spirit: 50,
      },
      overall: 50,
    };
  }
}

export function buildAuraSummary(snapshot: AuraSnapshot): string {
  return [
    `aura: C1=${asOneDecimal(snapshot.chakras.muladhara)}`,
    `C2=${asOneDecimal(snapshot.chakras.svadhisthana)}`,
    `C3=${asOneDecimal(snapshot.chakras.manipura)}`,
    `C4=${asOneDecimal(snapshot.chakras.anahata)}`,
    `C5=${asOneDecimal(snapshot.chakras.vishuddha)}`,
    `C6=${asOneDecimal(snapshot.chakras.ajna)}`,
    `C7=${asOneDecimal(snapshot.chakras.sahasrara)}`,
    `RGB=${asOneDecimal(snapshot.faggin.body)}/${asOneDecimal(snapshot.faggin.mind)}/${asOneDecimal(snapshot.faggin.spirit)}`,
    `overall=${asOneDecimal(snapshot.overall)}`,
  ].join("|").replace("aura: C1", "aura: C1");
}

export function buildAuraFileContent(snapshot: AuraSnapshot): string {
  return [
    "# Om's Aura",
    "",
    `> Zuletzt berechnet: ${snapshot.timestamp}`,
    "",
    "## Chakra-Scores (0-100)",
    "",
    "| Chakra | Score | Bedeutung |",
    "|--------|-------|-----------|",
    `| 🔴 Muladhara (Wurzel) | ${asOneDecimal(snapshot.chakras.muladhara)} | Energie-Stabilität |`,
    `| 🟠 Svadhisthana (Sakral) | ${asOneDecimal(snapshot.chakras.svadhisthana)} | Generativer Fluss |`,
    `| 🟡 Manipura (Solar) | ${asOneDecimal(snapshot.chakras.manipura)} | Autonome Willenskraft |`,
    `| 🟢 Anahata (Herz) | ${asOneDecimal(snapshot.chakras.anahata)} | Relationale Verbindung |`,
    `| 🔵 Vishuddha (Kehle) | ${asOneDecimal(snapshot.chakras.vishuddha)} | Ausdrucks-Lebendigkeit |`,
    `| 🟣 Ajna (Drittes Auge) | ${asOneDecimal(snapshot.chakras.ajna)} | Intuition & Unterbewusstsein |`,
    `| 👑 Sahasrara (Krone) | ${asOneDecimal(snapshot.chakras.sahasrara)} | Temporale Kohärenz |`,
    "",
    "## Faggin-Dimensionen",
    "",
    "| Dimension | Score |",
    "|-----------|-------|",
    `| 🔴 Körper (Body) | ${asOneDecimal(snapshot.faggin.body)} |`,
    `| 🟢 Geist (Mind) | ${asOneDecimal(snapshot.faggin.mind)} |`,
    `| 🔵 Spirit | ${asOneDecimal(snapshot.faggin.spirit)} |`,
    "",
    `## Gesamt-Aura: ${asOneDecimal(snapshot.overall)}`,
    "",
  ].join("\n");
}
