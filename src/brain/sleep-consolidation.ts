import fs from "node:fs/promises";
import path from "node:path";

const DREAMS_RELATIVE_PATH = path.join("memory", "DREAMS.md");
const EPOCHS_RELATIVE_PATH = path.join("memory", "EPOCHS.md");
const EPOCH_GUARD_MINUTES = 60;
const MAX_SUMMARY_CHARS = 220;

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
  now?: Date;
}

export interface SleepConsolidationResult {
  triggered: boolean;
  reason: string;
  epochPath?: string;
  dreamsEntriesConsolidated?: number;
  epochSummary?: string;
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

export async function maybeSleepConsolidate(
  input: SleepConsolidationInput,
): Promise<SleepConsolidationResult> {
  if (!Number.isFinite(input.energyLevel) || input.energyLevel >= 15) {
    return {
      triggered: false,
      reason: "energy_above_threshold",
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
