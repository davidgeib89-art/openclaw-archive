import * as fs from "node:fs";
import * as path from "node:path";

const OM_ACTIVITY_LOG_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".openclaw",
  "workspace",
);
const OM_ACTIVITY_LOG_FILE = path.join(OM_ACTIVITY_LOG_DIR, "OM_ACTIVITY.log");

function parseActivityTimestamp(raw: string): number | null {
  const normalized = raw.trim();
  if (!normalized) return null;
  const candidate = normalized.replace(" ", "T");
  const parsed = new Date(candidate);
  const ms = parsed.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function parseDaemonNoiseEntries(raw: string) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const entries: any[] = [];
  let current: any = null;

  for (const line of lines) {
    const headerMatch = line.match(
      /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[([^\]]+)\]\s*(.*)$/,
    );
    const layer = (headerMatch?.[2] ?? "unknown").trim();
    const semanticLayers = new Set([
      "OM-REPLY",
      "USER-MSG",
      "BRAIN-AURA",
      "BRAIN-ENERGY",
      "BRAIN-CHOICE",
      "BRAIN-GATE",
      "BRAIN-LOOP-CAUSE",
      "BRAIN-FORECAST",
      "BRAIN-RECALL",
      "BRAIN-THOUGHT",
    ]);

    if (!semanticLayers.has(layer) && headerMatch) {
      continue;
    }

    if (headerMatch) {
      if (current) entries.push(current);
      current = {
        timestampMs: parseActivityTimestamp(headerMatch[1] ?? ""),
        layer,
        event: (headerMatch[3] ?? "").trim(),
        details: "",
      };
      continue;
    }

    if (!current) continue;
    const detail = line.trim();
    if (detail.length === 0) continue;
    current.details = current.details.length > 0 ? `${current.details}\n${detail}` : detail;
  }

  if (current) entries.push(current);
  return entries;
}

function truncateDaemonText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  if (maxChars <= 3) return normalized.slice(0, maxChars);
  return `${normalized.slice(0, maxChars - 3).trimEnd()}...`;
}

async function runTest() {
  console.log("=== WHISPER DAEMON FILTER TEST ===");
  console.log(`Reading from: ${OM_ACTIVITY_LOG_FILE}`);
  
  try {
    const stats = await fs.promises.stat(OM_ACTIVITY_LOG_FILE);
    const tailBytes = 64_000;
    const fileHandle = await fs.promises.open(OM_ACTIVITY_LOG_FILE, "r");
    
    const bytesToRead = Math.min(tailBytes, stats.size);
    const buffer = Buffer.alloc(bytesToRead);
    const start = Math.max(0, stats.size - bytesToRead);
    await fileHandle.read(buffer, 0, bytesToRead, start);
    await fileHandle.close();
    
    const rawContent = buffer.toString("utf-8");
    console.log(`\nRaw bytes read: ${bytesToRead} bytes`);
    
    const parsed = parseDaemonNoiseEntries(rawContent);
    console.log(`\nFiltered Entries Found: ${parsed.length}`);
    
    const maxEntries = 90; // The threshold in subconscious.ts
    const recent = parsed.slice(-maxEntries);
    
    console.log(`\n--- WHAT MERCURY WILL SEE (Limited to ${maxEntries} entries) ---`);
    console.log("---------------------------------------------------------------");
    
    const compact = recent.map((entry) => {
      const ts =
        typeof entry.timestampMs === "number"
          ? new Date(entry.timestampMs).toISOString()
          : "no-ts";
      const event = entry.event.length > 0 ? entry.event : "event";
      const details = truncateDaemonText(entry.details, 180);
      return details.length > 0
        ? `[${ts}] [${entry.layer}] ${event} :: ${details}`
        : `[${ts}] [${entry.layer}] ${event}`;
    });
    
    compact.forEach(line => console.log(line));
    
    console.log("---------------------------------------------------------------");
    console.log("Done.");

  } catch (err) {
    console.error("Test failed:", err);
  }
}

runTest();
