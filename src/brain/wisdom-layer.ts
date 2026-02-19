const WISDOM_LAYER_ENABLED_ENV = "OM_WISDOM_LAYER_ENABLED";

export type WisdomRoute = "identity" | "preference" | "project" | "ritual" | "creative" | "general";

export type WisdomAdvisoryInput = {
  route: WisdomRoute;
  recalledItemsCount: number;
  memoryIndexFactsCount: number;
  dreamFactsCount: number;
  graphFactsCount: number;
};

export type WisdomAdvisory = {
  enabled: boolean;
  readOnly: true;
  items: string[];
};

function readEnvBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (["0", "false", "off", "no"].includes(raw)) {
    return false;
  }
  if (["1", "true", "on", "yes"].includes(raw)) {
    return true;
  }
  return fallback;
}

export function isWisdomLayerEnabled(): boolean {
  return readEnvBoolean(WISDOM_LAYER_ENABLED_ENV, true);
}

export function buildWisdomLayerAdvisory(input: WisdomAdvisoryInput): WisdomAdvisory {
  if (!isWisdomLayerEnabled()) {
    return {
      enabled: false,
      readOnly: true,
      items: [],
    };
  }

  const hasMultipleSources =
    (input.recalledItemsCount > 0 ? 1 : 0) +
      (input.memoryIndexFactsCount > 0 ? 1 : 0) +
      (input.dreamFactsCount > 0 ? 1 : 0) +
      (input.graphFactsCount > 0 ? 1 : 0) >=
    2;
  const lowEvidence =
    input.recalledItemsCount === 0 &&
    input.memoryIndexFactsCount === 0 &&
    input.dreamFactsCount === 0 &&
    input.graphFactsCount === 0;

  const systemsThinking = hasMultipleSources
    ? "Systems Thinking: gleiche Fakten ueber mehrere Quellen ab; bei Konflikt eine praezise Rueckfrage stellen."
    : "Systems Thinking: nutze zuerst einen stabilen Anker aus der Erinnerung, dann nur einen naechsten Schritt.";

  const chaosTheory = lowEvidence
    ? "Chaos Theory: geringe Evidenz erkannt; antworte vorsichtig und markiere Unsicherheit explizit."
    : "Chaos Theory: halte Variabilitaet begrenzt; keine weitreichenden Schluesse aus einem einzelnen Fragment.";

  const karma = ["identity", "ritual"].includes(input.route)
    ? "Karma: schuetze Kontinuitaet von Identitaet und Ritualen; vermeide impulsive Umschreibungen."
    : "Karma: bevorzuge reversible Entscheidungen mit klarer Nachvollziehbarkeit.";

  const complexitySentinel = hasMultipleSources
    ? "Complexity Sentinel: verdichte auf eine umsetzbare Empfehlung plus einen Risiko-Check."
    : "Complexity Sentinel: vermeide Overengineering; bleibe bei einem klar begrenzten Schritt.";

  return {
    enabled: true,
    readOnly: true,
    items: [systemsThinking, chaosTheory, karma, complexitySentinel],
  };
}
