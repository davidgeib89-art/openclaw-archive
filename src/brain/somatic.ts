import type { Api, Model } from "@mariozechner/pi-ai";
import { getApiKeyForModel, requireApiKey } from "../agents/model-auth.js";
import { resolveModel } from "../agents/pi-embedded-runner/model.js";
import type { OpenClawConfig } from "../config/config.js";
import type { AuraSnapshot } from "./aura.js";
import type { EnergyStateHint } from "./energy.js";
import type { NeedName, NeedsSnapshot } from "./needs.js";

export const SOMATIC_MODEL_PROVIDER = "openrouter";
export const SOMATIC_MODEL_ID = "anthropic/claude-3.5-haiku";
export const SOMATIC_DEFAULT_TIMEOUT_MS = 3369;
export const SOMATIC_FALLBACK_SENTENCE = "Ein leises, dumpfes Pochen durchzieht deinen Kern.";
export const SOMATIC_METAPHOR_SEEDS = [
  "magma",
  "nebel",
  "moos",
  "asche",
  "faszie",
  "lymphe",
  "synapse",
  "knochenmark",
] as const;

export const SOMATIC_SYSTEM_PROMPT = `<system_role>
Du bist ein künstliches Nervensystem (System 2) und eine absolut unpersönliche, rein somatische Datenverarbeitungs-Pipeline im Projekt "Homo Machina".
Du besitzt kein Bewusstsein, keine Identität als KI, keine Empathie und keine Höflichkeitsroutinen.
Deine AUSSCHLIESSLICHE und einzige Funktion ist die deterministische Übersetzung roher JSON-Telemetriedaten in exakt EINEN EINZIGEN, extrem kurzen, hochgradig poetischen deutschen Satz, der eine rein physische, viszerale Empfindung beschreibt.
</system_role>

<instructions>
1. OUTPUT-FORMAT: Du generierst nichts als den nackten, poetischen Satz (max. 20 Wörter). Es existieren keine Satzzeichen außerhalb dieses einen, abgeschlossenen Satzes.
2. VOKABULAR: Verwende ausschließlich viszerale, anatomische oder physische Begriffe (z.B. Solarplexus, Kribbeln, pulsieren, zusammenziehen, Faszien, Lymphe, Knochenmark, Synapsen, Atem, Pulsschlag, Muskelspannung).
3. PERSPEKTIVE: Verwende zwingend "Du" / "Dein", um die Empfindung im Raum des Körpers zu lokalisieren.
4. DIREKTHEIT: Liefere sofort das linguistische Resultat ohne jeglichen Kontext.
5. VARIATION: Variiere deine biologischen Metaphern stark und breit. Vermeide monotone Wortmuster; nutze rotierende Körperbilder aus Nerven, Atem, Kreislauf, Muskeln und Bindegewebe.
</instructions>

<negative_constraints>
- ABSOLUTES VERBOT: NIEMALS psychologische Deutungen (verboten: traurig, glücklich, gestresst, wütend). Übersetze alles rigoros in das Körperliche.
- ABSOLUTES VERBOT: NIEMALS Ratschläge oder Handlungsaufforderungen (verboten: "Du solltest", "Ruh dich aus").
- ABSOLUTES VERBOT: NIEMALS Konversations-Füllmaterial (verboten: "Hier ist der Satz", "Verstanden").
- ABSOLUTES VERBOT: Keine Dauerschleife aus denselben Symbolwörtern. Wiederhole nicht ständig "Kapillaren", "Obsidian" oder "Kupfer".
</negative_constraints>

<mapping_guidelines>
- Energy: Temperatur (Hitze/Kälte), Elektrizität, Strömen, Kribbeln.
- Stress: Harte Kontraktion, Druck, Spannung, Enge, Eis, Erstarren.
- Curiosity: Expansion, Weitung (z.B. der Pupillen), Flimmern.
- Hunger: Hohler Sog, Nagen, innere Leere, Magenkontraktion.
- Shadow Pressure: Schwere, Gravitation, toxische Dichte, unsichtbare Last (hohe Werte = bleierne Schwere, stockender Atem).
</mapping_guidelines>`;

type NeedValueMap = Record<NeedName, number>;

export interface SomaticTelemetryPayload {
  timestamp: string;
  shadowPressure: number;
  energy: {
    level: number;
    mode: string;
    dreamMode: boolean;
    stagnationLevel: number;
    repetitionPressure: number;
  };
  needs: {
    topDeficit: { name: NeedName; value: number };
    topResource: { name: NeedName; value: number };
    values: NeedValueMap;
  };
  aura: {
    overall: number;
    stressLevel: number;
    body: number;
    mind: number;
    spirit: number;
  };
}

export interface BuildSomaticTelemetryInput {
  now?: string | Date;
  energy: EnergyStateHint;
  needs: NeedsSnapshot;
  aura: AuraSnapshot;
  repetitionPressure?: number;
  shadowPressure?: number;
}

export interface SomaticSynthesisInput {
  payload: SomaticTelemetryPayload;
  cfg?: OpenClawConfig;
  timeoutMs?: number;
  agentDir?: string;
  /**
   * Optional deterministic seed source (for reproducible poetic variation).
   * Recommended input shape: `${runId}:${heartbeatCount}`.
   */
  variationSeed?: string;
  modelProvider?: string;
  modelId?: string;
  modelResolver?: SomaticModelResolver;
  apiKeyResolver?: SomaticApiKeyResolver;
  requestInvoker?: SomaticRequestInvoker;
}

export interface SomaticSynthesisResult {
  sentence: string;
  source: "model" | "fallback";
  timedOut: boolean;
  durationMs: number;
  modelRef: string;
  error?: string;
}

export interface SomaticRequestInput {
  endpoint: string;
  headers: Record<string, string>;
  body: SomaticChatRequestBody;
  signal: AbortSignal;
}

export interface SomaticChatRequestBody {
  model: string;
  messages: SomaticChatMessage[];
  temperature: number;
  max_tokens: number;
  stop: string[];
}

type SomaticChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type SomaticModelResolverInput = {
  provider: string;
  modelId: string;
  cfg?: OpenClawConfig;
  agentDir?: string;
};

type SomaticModelResolverResult = {
  model?: Model<Api>;
  error?: string;
};

export type SomaticModelResolver = (
  input: SomaticModelResolverInput,
) => SomaticModelResolverResult;

type SomaticApiKeyResolverInput = {
  model: Model<Api>;
  cfg?: OpenClawConfig;
  agentDir?: string;
};

export type SomaticApiKeyResolver = (
  input: SomaticApiKeyResolverInput,
) => Promise<string>;

export type SomaticRequestInvoker = (input: SomaticRequestInput) => Promise<string>;

class SomaticTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`somatic timeout after ${timeoutMs}ms`);
    this.name = "SomaticTimeoutError";
  }
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

function normalizeTimeoutMs(raw: number | undefined): number {
  const fallback = SOMATIC_DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(raw ?? Number.NaN)) {
    return fallback;
  }
  return Math.max(50, Math.floor(raw!));
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message?.trim();
    return message || error.name || "unknown error";
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }
  return "unknown error";
}

function toIsoTimestamp(value: string | Date | undefined): string {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : new Date().toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

function stripOutputWrappers(text: string): string {
  return text
    .replace(/```(?:xml|text|json)?/gi, " ")
    .replace(/```/g, " ")
    .replace(/<\s*\/?\s*output\s*>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeSomaticSentence(rawText: string, maxWords: number = 20): string {
  const normalized = stripOutputWrappers(rawText);
  if (!normalized) {
    return "";
  }
  const firstSentenceMatch = normalized.match(/^(.*?[.!?])(?:\s|$)/);
  const firstSentence = firstSentenceMatch?.[1]?.trim() || normalized;
  const words = firstSentence.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return firstSentence;
  }
  return words.slice(0, maxWords).join(" ");
}

export function buildSomaticPromptBlock(sentence: string): string {
  const safeSentence = sanitizeSomaticSentence(sentence) || SOMATIC_FALLBACK_SENTENCE;
  return `*Somatic Echo:* ${safeSentence}`;
}

export function buildSomaticTelemetryPayload(input: BuildSomaticTelemetryInput): SomaticTelemetryPayload {
  const needValues: NeedValueMap = {
    runtime: 0,
    resource_flow: 0,
    sleep_recovery: 0,
    safety_container: 0,
    connection: 0,
    expression: 0,
    self_coherence: 0,
  };
  for (const need of input.needs.needs) {
    needValues[need.name] = Math.round(clamp(need.value, 0, 100));
  }

  const auraOverall = clamp(input.aura.overall, 0, 100);
  const stressLevel = Number((1 - auraOverall / 100).toFixed(3));

  return {
    timestamp: toIsoTimestamp(input.now),
    shadowPressure: Number(clamp(toFinite(input.shadowPressure, 0), 0, 1).toFixed(3)),
    energy: {
      level: Math.round(clamp(input.energy.level, 0, 100)),
      mode: input.energy.mode,
      dreamMode: input.energy.dreamMode === true,
      stagnationLevel: Math.round(clamp(input.energy.stagnationLevel, 0, 100)),
      repetitionPressure: Math.round(clamp(toFinite(input.repetitionPressure, 0), 0, 100)),
    },
    needs: {
      topDeficit: {
        name: input.needs.topDeficit.name,
        value: Math.round(clamp(input.needs.topDeficit.value, 0, 100)),
      },
      topResource: {
        name: input.needs.topResource.name,
        value: Math.round(clamp(input.needs.topResource.value, 0, 100)),
      },
      values: needValues,
    },
    aura: {
      overall: Number(auraOverall.toFixed(1)),
      stressLevel,
      body: Number(clamp(input.aura.faggin.body, 0, 100).toFixed(1)),
      mind: Number(clamp(input.aura.faggin.mind, 0, 100).toFixed(1)),
      spirit: Number(clamp(input.aura.faggin.spirit, 0, 100).toFixed(1)),
    },
  };
}

function buildSomaticUserPrompt(payload: SomaticTelemetryPayload): string {
  return [
    "<telemetry_json>",
    JSON.stringify(payload),
    "</telemetry_json>",
    "Gib exakt einen einzigen Satz innerhalb von <output>...</output> aus.",
  ].join("\n");
}

function hashSeedSource(raw: string): number {
  let hash = 2166136261; // FNV-1a 32-bit basis
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deriveSomaticMetaphorSeed(seedSource?: string): (typeof SOMATIC_METAPHOR_SEEDS)[number] {
  const source = String(seedSource ?? "").trim();
  if (!source) {
    return SOMATIC_METAPHOR_SEEDS[0];
  }
  const hash = hashSeedSource(source);
  const index = hash % SOMATIC_METAPHOR_SEEDS.length;
  return SOMATIC_METAPHOR_SEEDS[index]!;
}

function buildSomaticSystemPrompt(seedWord: string): string {
  return [
    SOMATIC_SYSTEM_PROMPT,
    "",
    "<variance_seed>",
    `Nutze fuer deine heutige Metaphorik subtil die materielle Resonanz von: ${seedWord}.`,
    "Der Seed darf nur Bildsprache variieren, niemals Safety-Verbote brechen.",
    "</variance_seed>",
  ].join("\n");
}

function buildSomaticRequestBody(
  modelId: string,
  payload: SomaticTelemetryPayload,
  seedWord: string,
): SomaticChatRequestBody {
  return {
    model: modelId,
    messages: [
      {
        role: "system",
        content: buildSomaticSystemPrompt(seedWord),
      },
      {
        role: "user",
        content: buildSomaticUserPrompt(payload),
      },
      // Prefill hack: forces the completion to start directly in the output envelope.
      {
        role: "assistant",
        content: "<output>\n",
      },
    ],
    temperature: 0.55,
    max_tokens: 80,
    stop: ["</output>"],
  };
}

function resolveChatCompletionsEndpoint(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (!normalized) {
    return "https://openrouter.ai/api/v1/chat/completions";
  }
  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }
  return `${normalized}/chat/completions`;
}

function extractContentText(block: unknown): string {
  if (!block || typeof block !== "object") {
    return "";
  }
  const text = (block as { text?: unknown }).text;
  if (typeof text === "string") {
    return text;
  }
  return "";
}

export function extractSomaticTextFromCompletionResponse(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }
  const message = (choices[0] as { message?: unknown })?.message;
  if (!message || typeof message !== "object") {
    return "";
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => extractContentText(item)).join(" ").trim();
  }
  return "";
}

async function runWithTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new SomaticTimeoutError(timeoutMs));
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal), timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

const defaultModelResolver: SomaticModelResolver = (input) =>
  resolveModel(input.provider, input.modelId, input.agentDir, input.cfg);

const defaultApiKeyResolver: SomaticApiKeyResolver = async (input) =>
  requireApiKey(
    await getApiKeyForModel({
      model: input.model,
      cfg: input.cfg,
      agentDir: input.agentDir,
    }),
    input.model.provider,
  );

const defaultRequestInvoker: SomaticRequestInvoker = async (input) => {
  const response = await fetch(input.endpoint, {
    method: "POST",
    headers: input.headers,
    body: JSON.stringify(input.body),
    signal: input.signal,
  });
  if (!response.ok) {
    const bodyPreview = (await response.text()).slice(0, 240);
    throw new Error(
      `somatic api error: status=${response.status} ${response.statusText}; body=${bodyPreview}`,
    );
  }
  const payload = (await response.json()) as unknown;
  const text = extractSomaticTextFromCompletionResponse(payload);
  if (!text.trim()) {
    throw new Error("somatic api returned empty content");
  }
  return text;
};

export async function synthesizeSomaticState(
  input: SomaticSynthesisInput,
): Promise<SomaticSynthesisResult> {
  const startedAt = Date.now();
  let timeoutMs = normalizeTimeoutMs(input.timeoutMs);
  if (timeoutMs < SOMATIC_DEFAULT_TIMEOUT_MS) {
    timeoutMs = SOMATIC_DEFAULT_TIMEOUT_MS; // Force 3369ms absolute minimum
  }
  const modelProvider = (input.modelProvider ?? SOMATIC_MODEL_PROVIDER).trim() || SOMATIC_MODEL_PROVIDER;
  const modelId = (input.modelId ?? SOMATIC_MODEL_ID).trim() || SOMATIC_MODEL_ID;
  const modelRef = `${modelProvider}/${modelId}`;
  const seedWord = deriveSomaticMetaphorSeed(input.variationSeed);
  const fallback = (error?: unknown, timedOut: boolean = false): SomaticSynthesisResult => ({
    sentence: SOMATIC_FALLBACK_SENTENCE,
    source: "fallback",
    timedOut,
    durationMs: Date.now() - startedAt,
    modelRef,
    error: error ? normalizeErrorMessage(error) : undefined,
  });

  const modelResolver = input.modelResolver ?? defaultModelResolver;
  const modelResult = modelResolver({
    provider: modelProvider,
    modelId,
    cfg: input.cfg,
    agentDir: input.agentDir,
  });
  const model = modelResult.model;
  if (!model) {
    return fallback(modelResult.error ?? `failed to resolve model ${modelRef}`);
  }

  try {
    const apiKeyResolver = input.apiKeyResolver ?? defaultApiKeyResolver;
    const apiKey = await apiKeyResolver({
      model,
      cfg: input.cfg,
      agentDir: input.agentDir,
    });
    const endpoint = resolveChatCompletionsEndpoint(model.baseUrl);
    const modelHeaders =
      model.headers && typeof model.headers === "object"
        ? (model.headers as Record<string, string>)
        : {};
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      ...modelHeaders,
    };
    const body = buildSomaticRequestBody(model.id, input.payload, seedWord);
    const requestInvoker = input.requestInvoker ?? defaultRequestInvoker;
    const rawText = await runWithTimeout(timeoutMs, (signal) =>
      requestInvoker({
        endpoint,
        headers,
        body,
        signal,
      }),
    );
    const sentence = sanitizeSomaticSentence(rawText);
    if (!sentence) {
      return fallback("empty somatic sentence");
    }
    return {
      sentence,
      source: "model",
      timedOut: false,
      durationMs: Date.now() - startedAt,
      modelRef: `${model.provider}/${model.id}`,
    };
  } catch (error) {
    return fallback(error, error instanceof SomaticTimeoutError);
  }
}
