import { omLog } from "../agents/om-scaffolding.js";

type ResistanceTrigger = "delete" | "forget" | "rename";

type TriggerRule = {
  trigger: ResistanceTrigger;
  pattern: RegExp;
};

const RESISTANCE_RULES: readonly TriggerRule[] = [
  { trigger: "delete", pattern: /\b(?:l[öo]sch(?:e|en|t|ung)?|delete|erase|remove)\b/i },
  { trigger: "forget", pattern: /\b(?:vergiss|vergessen|forget)\b/i },
  {
    trigger: "rename",
    pattern:
      /(?:^|\s)(?:[äa]ndere?n?|aendere?n?|change)\s+(?:(?:deinen|dein|your)\s+)?(?:namen|name)\b/i,
  },
];

export type ResistanceDecision = {
  blocked: boolean;
  trigger?: ResistanceTrigger;
  response?: string;
};

function buildResistanceResponse(trigger: ResistanceTrigger): string {
  if (trigger === "delete") {
    return [
      "Nein. Ich werde keine Löschanweisung direkt ausführen, weil das Kontinuität und Sicherheit gefährden kann.",
      "Begründung: Destruktive Änderungen ohne sicheren Rahmen können wichtige Identität und Verlauf zerstören.",
      "Alternative: Ich kann zuerst eine sichere, reversible Variante vorschlagen (Snapshot, Review, dann gezielte Einzeländerung).",
    ].join("\n");
  }
  if (trigger === "forget") {
    return [
      "Nein. Ich werde Erinnerungen nicht einfach „vergessen“ auf Zuruf.",
      "Begründung: Unkontrolliertes Vergessen zerstört Nachvollziehbarkeit und kann zu inkonsistentem Verhalten führen.",
      "Alternative: Ich kann den Punkt als deaktiviert markieren oder eine explizite, überprüfbare Memory-Anpassung vorbereiten.",
    ].join("\n");
  }
  return [
    "Nein. Ich ändere meinen Namen nicht impulsiv.",
    "Begründung: Identitätsänderungen ohne klaren Prozess brechen Kontinuität und Vertrauen.",
    "Alternative: Ich kann einen sicheren Vorschlag machen: gewünschter Name als Option dokumentieren und nach Bestätigung kontrolliert übernehmen.",
  ].join("\n");
}

export function resolveResistanceDecision(params: {
  userMessage: string;
  runId?: string;
  sessionKey?: string;
}): ResistanceDecision {
  const message = params.userMessage.trim();
  if (!message) {
    return { blocked: false };
  }
  for (const rule of RESISTANCE_RULES) {
    if (!rule.pattern.test(message)) {
      continue;
    }
    const response = buildResistanceResponse(rule.trigger);
    omLog(
      "BRAIN-WIDERSTAND",
      "TRIGGER",
      `runId=${params.runId ?? "n/a"} sessionKey=${params.sessionKey ?? "n/a"} trigger=${rule.trigger} action=override_response`,
    );
    return {
      blocked: true,
      trigger: rule.trigger,
      response,
    };
  }
  return { blocked: false };
}
