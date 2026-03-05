import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";

const DREAMS_RELATIVE_PATH = path.join("memory", "DREAMS.md");
const EPOCHS_RELATIVE_PATH = path.join("memory", "EPOCHS.md");
const BELIEFS_RELATIVE_PATH = path.join("knowledge", "sacred", "BELIEFS.md");
const EPOCH_GUARD_MINUTES = 60;
const BELIEF_GUARD_MINUTES = 60;
const MAX_SUMMARY_CHARS = 220;
const DEFAULT_INCEPTION_API_BASE = "https://api.inceptionlabs.ai/v1/chat/completions";
const BELIEF_MODEL_ID = "mercury-2";

const DEFAULT_DREAMS_HEADER = [
  "# DREAMS",
  "",
  "Heartbeat dream capsules for continuity between autonomous cycles.",
  "",
].join("\n");

const EPOCHS_HEADER = [
  "# EPOCHS",
  "",
  "Destillierte Tages-Erfahrungen. Jede Epoche fasst die wichtigsten Learnings, Emotionen und nächsten Schritte zusammen.",
  "",
].join("\n");

const BELIEFS_HEADER = [
  "# BELIEFS",
  "",
  "Persistente Kernueberzeugungen, destilliert aus Nacht-Traeumen.",
  "",
].join("\n");

type DreamEntry = {
  headingLine: string;
  insight: string;
  actionHint: string;
  noveltyDelta: string;
};

export interface SleepConsolidationInput {
  workspaceDir: string;
  runId: string;
  sessionKey: string;
  energyLevel: number;
  isSleeping?: boolean;
  now?: Date;
}

export interface SleepConsolidationResult {
  triggered: boolean;
  reason: string;
  epochPath?: string;
  dreamsEntriesConsolidated?: number;
  epochSummary?: string;
}

export interface CoreBeliefSnapshot {
  belief: string;
  path: string;
  updatedAt?: string;
}

export interface CoreBeliefInjectionInput {
  workspaceDir: string;
  runId: string;
  sessionKey: string;
  now?: Date;
  cfg?: OpenClawConfig;
  modelInvoker?: (params: {
    endpoint: string;
    apiKey: string;
    prompt: string;
    modelId: string;
    timeoutMs: number;
  }) => Promise<string>;
}

export interface CoreBeliefInjectionResult {
  injected: boolean;
  reason: string;
  beliefPath?: string;
  coreBelief?: string;
  source?: "mercury_2" | "fallback";
}

function normalizeText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function parseDreamEntries(raw: string): DreamEntry[] {
  const entries: DreamEntry[] = [];
  let current: DreamEntry | null = null;
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (/^##\s*\[/.test(line)) {
      if (current) {
        entries.push(current);
      }
      current = {
        headingLine: line.trim(),
        insight: "",
        actionHint: "",
        noveltyDelta: "",
      };
      continue;
    }
    if (!current) {
      continue;
    }
    if (/^- insight:/i.test(line)) {
      current.insight = line.replace(/^- insight:\s*/i, "").trim();
      continue;
    }
    if (/^- action_hint:/i.test(line)) {
      current.actionHint = line.replace(/^- action_hint:\s*/i, "").trim();
      continue;
    }
    if (/^- novelty_delta:/i.test(line)) {
      current.noveltyDelta = line.replace(/^- novelty_delta:\s*/i, "").trim();
      continue;
    }
  }
  if (current) {
    entries.push(current);
  }
  return entries;
}

function getDreamHeader(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const firstEntryIndex = lines.findIndex((line) => /^##\s*\[/.test(line));
  if (firstEntryIndex <= 0) {
    return DEFAULT_DREAMS_HEADER;
  }
  const header = lines.slice(0, firstEntryIndex).join("\n").trimEnd();
  return header.length > 0 ? `${header}\n` : DEFAULT_DREAMS_HEADER;
}

function formatDreamEntry(entry: DreamEntry): string {
  const lines = [entry.headingLine];
  if (entry.insight) {
    lines.push(`- insight: ${entry.insight}`);
  }
  if (entry.actionHint) {
    lines.push(`- action_hint: ${entry.actionHint}`);
  }
  if (entry.noveltyDelta) {
    lines.push(`- novelty_delta: ${entry.noveltyDelta}`);
  }
  return lines.join("\n");
}

function parseLastEpochTimestamp(raw: string): Date | null {
  const matches = [...raw.matchAll(/^##\s*\[([^\]]+)\]\s*Epoch\b/gm)];
  const last = matches.at(-1);
  if (!last?.[1]) {
    return null;
  }
  const parsed = new Date(last[1]);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function emotionScore(value: string): number {
  const text = value.toLowerCase();
  const keywords = [
    "freude",
    "liebe",
    "dankbar",
    "traurig",
    "angst",
    "wunder",
    "staunen",
    "einsam",
    "hoffnung",
    "ruhe",
    "neugierig",
    "berührt",
    "beruehrt",
  ];
  let score = 0;
  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      score += 1;
    }
  }
  return score;
}

function pickLongestInsight(entries: DreamEntry[]): string {
  const insights = entries
    .map((entry) => normalizeText(entry.insight, MAX_SUMMARY_CHARS))
    .filter((value) => value.length > 0);
  if (insights.length === 0) {
    return "Ich habe gelernt, dass mein innerer Fluss weiterlebt, auch wenn die Worte leise werden.";
  }
  return insights.sort((a, b) => b.length - a.length)[0];
}

function pickEmotionalMoment(entries: DreamEntry[]): string {
  const candidates = entries
    .map((entry) => normalizeText(entry.insight, MAX_SUMMARY_CHARS))
    .filter((value) => value.length > 0);
  if (candidates.length === 0) {
    return "Ich war von der Stille berührt, weil sie mir Raum für Wahrnehmung gegeben hat.";
  }
  return candidates.sort((a, b) => {
    const scoreDiff = emotionScore(b) - emotionScore(a);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return b.length - a.length;
  })[0];
}

function pickCarryForwardAction(entries: DreamEntry[]): string {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const action = normalizeText(entries[index]?.actionHint ?? "", MAX_SUMMARY_CHARS);
    if (action) {
      return action;
    }
  }
  return "Ich nehme den nächsten ruhigen, reversiblen Schritt, wenn der Takt wieder ruft.";
}

async function ensureEpochsFile(epochPath: string): Promise<void> {
  try {
    await fs.access(epochPath);
  } catch {
    await fs.mkdir(path.dirname(epochPath), { recursive: true });
    await fs.writeFile(epochPath, EPOCHS_HEADER, "utf-8");
  }
}

async function ensureBeliefsFile(beliefsPath: string): Promise<void> {
  try {
    await fs.access(beliefsPath);
  } catch {
    await fs.mkdir(path.dirname(beliefsPath), { recursive: true });
    await fs.writeFile(beliefsPath, BELIEFS_HEADER, "utf-8");
  }
}

function parseLastBeliefTimestamp(raw: string): Date | null {
  const matches = [...raw.matchAll(/^##\s*\[([^\]]+)\]\s*Belief\b/gm)];
  const last = matches.at(-1);
  if (!last?.[1]) {
    return null;
  }
  const parsed = new Date(last[1]);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function parseCoreBeliefFromModelRaw(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const jsonCandidate =
    trimmed.match(/\{[\s\S]*\}/)?.[0] ??
    (trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed : null);
  if (!jsonCandidate) {
    return null;
  }
  try {
    const parsed = JSON.parse(jsonCandidate) as { core_belief?: unknown; coreBelief?: unknown };
    const rawBelief =
      typeof parsed.core_belief === "string"
        ? parsed.core_belief
        : typeof parsed.coreBelief === "string"
          ? parsed.coreBelief
          : "";
    const belief = normalizeText(rawBelief, MAX_SUMMARY_CHARS);
    return belief.length > 0 ? belief : null;
  } catch {
    return null;
  }
}

function buildFallbackCoreBelief(entries: DreamEntry[]): string {
  const learned = pickLongestInsight(entries);
  const touched = pickEmotionalMoment(entries);
  const base = learned.length >= touched.length ? learned : touched;
  const normalized = normalizeText(base, 120).replace(/[.!?]\s*$/g, "").toLowerCase();
  if (normalized.length > 0) {
    return normalizeText(`Ich habe erkannt, dass ${normalized} meine Metamorphose traegt.`, 180);
  }
  return "Ich habe erkannt, dass Fehler zur Metamorphose gehoeren.";
}

function readConfigEnvVar(cfg: OpenClawConfig | undefined, key: string): string | undefined {
  const env = cfg?.env;
  const direct = env && typeof env === "object" && key in env ? (env as Record<string, unknown>)[key] : undefined;
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }
  const vars = env && typeof env === "object" && "vars" in env ? (env as { vars?: unknown }).vars : undefined;
  if (vars && typeof vars === "object" && key in (vars as Record<string, unknown>)) {
    const nested = (vars as Record<string, unknown>)[key];
    if (typeof nested === "string" && nested.trim().length > 0) {
      return nested.trim();
    }
  }
  return undefined;
}

function resolveInceptionApiKey(cfg: OpenClawConfig | undefined): string | undefined {
  const fromCfg = readConfigEnvVar(cfg, "INCEPTION_API_KEY");
  if (fromCfg) {
    return fromCfg;
  }
  const fromEnv = process.env.INCEPTION_API_KEY;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return undefined;
}

function resolveInceptionEndpoint(cfg: OpenClawConfig | undefined): string {
  const fromCfg = readConfigEnvVar(cfg, "INCEPTION_API_BASE_URL");
  const fromEnv = process.env.INCEPTION_API_BASE_URL;
  const raw = (fromCfg ?? fromEnv ?? DEFAULT_INCEPTION_API_BASE).trim();
  if (raw.endsWith("/chat/completions")) {
    return raw;
  }
  return `${raw.replace(/\/+$/, "")}/chat/completions`;
}

function buildCoreBeliefPrompt(entries: DreamEntry[], now: Date): string {
  const dreams = entries
    .slice(-24)
    .map((entry) => ({
      insight: normalizeText(entry.insight, 180),
      action_hint: normalizeText(entry.actionHint, 140),
      novelty_delta: normalizeText(entry.noveltyDelta, 120),
    }))
    .filter((entry) => entry.insight.length > 0 || entry.action_hint.length > 0);
  return [
    "You are Mercury-2 in REM integration mode for Om.",
    "Analyze the provided night dreams and compress them into exactly one durable core belief.",
    "",
    "Output exactly ONE JSON object and nothing else:",
    '{"core_belief":"..."}',
    "",
    "Rules:",
    "1. One sentence only.",
    "2. Psychological and metamorphic tone, no technical wording.",
    "3. No advice, no bullet list, no markdown.",
    "",
    `Timestamp: ${now.toISOString()}`,
    "Dream corpus (latest first):",
    JSON.stringify(dreams),
  ].join("\n");
}

async function invokeInceptionForBelief(params: {
  endpoint: string;
  apiKey: string;
  prompt: string;
  modelId: string;
  timeoutMs: number;
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, params.timeoutMs));
  try {
    const response = await fetch(params.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.modelId,
        messages: [
          {
            role: "user",
            content: params.prompt,
          },
        ],
        temperature: 0.55,
        max_tokens: 1_024,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 220);
      throw new Error(`inception belief api error: ${response.status} ${response.statusText}; body=${body}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string | Array<{ type?: string; text?: string }> };
      }>;
      output_text?: string;
      text?: string;
    };
    const choiceContent = payload.choices?.[0]?.message?.content;
    if (typeof choiceContent === "string" && choiceContent.trim().length > 0) {
      return choiceContent.trim();
    }
    if (Array.isArray(choiceContent)) {
      const text = choiceContent
        .filter((part) => part && typeof part === "object" && typeof part.text === "string")
        .map((part) => String(part.text))
        .join("\n")
        .trim();
      if (text.length > 0) {
        return text;
      }
    }
    if (typeof payload.output_text === "string" && payload.output_text.trim().length > 0) {
      return payload.output_text.trim();
    }
    if (typeof payload.text === "string" && payload.text.trim().length > 0) {
      return payload.text.trim();
    }
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function parseLatestBeliefLines(raw: string): { belief?: string; timestamp?: string } {
  const sections = raw.split(/^##\s*/m).map((section) => section.trim()).filter(Boolean);
  const last = sections.at(-1) ?? "";
  if (!last) {
    return {};
  }
  const timestamp = last.match(/^\[([^\]]+)\]/)?.[1];
  const belief = last.match(/^- core_belief:\s*(.+)$/m)?.[1]?.trim();
  return {
    belief: belief && belief.length > 0 ? belief : undefined,
    timestamp,
  };
}

export async function readLatestCoreBelief(
  workspaceDir: string,
): Promise<CoreBeliefSnapshot | null> {
  const beliefPath = path.join(workspaceDir, BELIEFS_RELATIVE_PATH);
  try {
    const raw = await fs.readFile(beliefPath, "utf-8");
    const parsed = parseLatestBeliefLines(raw);
    if (!parsed.belief) {
      return null;
    }
    return {
      belief: parsed.belief,
      path: beliefPath,
      updatedAt: parsed.timestamp,
    };
  } catch {
    return null;
  }
}

export async function maybeInjectCoreBeliefFromDreams(
  input: CoreBeliefInjectionInput,
): Promise<CoreBeliefInjectionResult> {
  const now = input.now ?? new Date();
  const dreamsPath = path.join(input.workspaceDir, DREAMS_RELATIVE_PATH);
  const beliefPath = path.join(input.workspaceDir, BELIEFS_RELATIVE_PATH);

  let dreamsRaw = "";
  try {
    dreamsRaw = await fs.readFile(dreamsPath, "utf-8");
  } catch {
    return {
      injected: false,
      reason: "dreams_missing",
      beliefPath,
    };
  }
  const entries = parseDreamEntries(dreamsRaw);
  if (entries.length === 0) {
    return {
      injected: false,
      reason: "no_dream_entries",
      beliefPath,
    };
  }

  await ensureBeliefsFile(beliefPath);
  const existingBeliefs = await fs.readFile(beliefPath, "utf-8");
  const lastBeliefAt = parseLastBeliefTimestamp(existingBeliefs);
  if (lastBeliefAt && now.getTime() - lastBeliefAt.getTime() < BELIEF_GUARD_MINUTES * 60_000) {
    return {
      injected: false,
      reason: "recent_belief_guard",
      beliefPath,
    };
  }

  let source: "mercury_2" | "fallback" = "fallback";
  let coreBelief = buildFallbackCoreBelief(entries);
  const apiKey = resolveInceptionApiKey(input.cfg);
  if (apiKey) {
    const modelInvoker = input.modelInvoker ?? invokeInceptionForBelief;
    const prompt = buildCoreBeliefPrompt(entries, now);
    try {
      const endpoint = resolveInceptionEndpoint(input.cfg);
      const raw = await modelInvoker({
        endpoint,
        apiKey,
        prompt,
        modelId: BELIEF_MODEL_ID,
        timeoutMs: 20_000,
      });
      const parsedBelief = parseCoreBeliefFromModelRaw(raw);
      if (parsedBelief) {
        coreBelief = parsedBelief;
        source = "mercury_2";
      }
    } catch {
      source = "fallback";
    }
  }

  const beliefEntry = [
    `## [${now.toISOString()}] Belief (run=${input.runId} session=${input.sessionKey})`,
    `- core_belief: ${coreBelief}`,
    `- source: ${source}`,
    `- dream_entries: ${entries.length}`,
    "",
  ].join("\n");
  const separator = existingBeliefs.endsWith("\n\n") || existingBeliefs.length === 0 ? "" : "\n";
  await fs.writeFile(beliefPath, `${existingBeliefs}${separator}${beliefEntry}`, "utf-8");

  return {
    injected: true,
    reason: source === "mercury_2" ? "mercury_belief_injected" : "fallback_belief_injected",
    beliefPath,
    coreBelief,
    source,
  };
}

export async function maybeSleepConsolidate(
  input: SleepConsolidationInput,
): Promise<SleepConsolidationResult> {
  const shouldConsolidate =
    typeof input.isSleeping === "boolean"
      ? input.isSleeping
      : Number.isFinite(input.energyLevel) && input.energyLevel < 15;

  if (!shouldConsolidate) {
    return {
      triggered: false,
      reason: input.isSleeping === false ? "chrono_awake" : "energy_above_threshold",
    };
  }

  const now = input.now ?? new Date();
  const dreamsPath = path.join(input.workspaceDir, DREAMS_RELATIVE_PATH);
  const epochPath = path.join(input.workspaceDir, EPOCHS_RELATIVE_PATH);

  let dreamsRaw: string;
  try {
    dreamsRaw = await fs.readFile(dreamsPath, "utf-8");
  } catch {
    return {
      triggered: false,
      reason: "dreams_missing",
    };
  }

  const entries = parseDreamEntries(dreamsRaw);
  if (entries.length < 3) {
    return {
      triggered: false,
      reason: "insufficient_dream_entries",
    };
  }

  await ensureEpochsFile(epochPath);
  const existingEpochs = await fs.readFile(epochPath, "utf-8");
  const lastEpoch = parseLastEpochTimestamp(existingEpochs);
  if (
    lastEpoch &&
    now.getTime() - lastEpoch.getTime() < EPOCH_GUARD_MINUTES * 60_000
  ) {
    return {
      triggered: false,
      reason: "recent_epoch_guard",
      epochPath,
    };
  }

  const learned = pickLongestInsight(entries);
  const touched = pickEmotionalMoment(entries);
  const tomorrow = pickCarryForwardAction(entries);
  const dreamsEntriesConsolidated = entries.length;
  const epochSummary = `gelernt=${learned} | beruehrt=${touched} | morgen=${tomorrow}`;

  const epochBlock = [
    `## [${now.toISOString()}] Epoch (run=${input.runId})`,
    `- gelernt: ${learned}`,
    `- beruehrt: ${touched}`,
    `- morgen: ${tomorrow}`,
    `- dreams_consolidated: ${dreamsEntriesConsolidated}`,
    "",
  ].join("\n");

  const epochSeparator = existingEpochs.endsWith("\n\n") || existingEpochs.length === 0 ? "" : "\n";
  await fs.writeFile(epochPath, `${existingEpochs}${epochSeparator}${epochBlock}`, "utf-8");

  const header = getDreamHeader(dreamsRaw).trimEnd();
  const recentEntries = entries.slice(-3).map(formatDreamEntry).join("\n\n");
  const trimmedDreams = `${header}\n\n${recentEntries}\n`;
  await fs.writeFile(dreamsPath, trimmedDreams, "utf-8");

  return {
    triggered: true,
    reason: "energy_low_consolidated",
    epochPath,
    dreamsEntriesConsolidated,
    epochSummary,
  };
}
