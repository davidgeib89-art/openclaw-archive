#!/usr/bin/env node
/**
 * Om Heartbeat Baseline Analyzer
 * 
 * Parses OM_ACTIVITY.log, DREAMS.md, MOOD.md, and memory/DREAMS.md
 * to extract the 12-metric baseline profile for the 50-Heartbeat experiment.
 * 
 * Usage: node om-docs/scripts/analyze-baseline.mjs [--since "2026-02-22T08:00"]
 * 
 * READ-ONLY. Does not modify any files.
 */

import fs from "node:fs";
import path from "node:path";

const WORKSPACE = process.env.OM_WORKSPACE || path.join(process.env.USERPROFILE || "", ".openclaw", "workspace");
const ACTIVITY_LOG = path.join(WORKSPACE, "OM_ACTIVITY.log");
const DREAMS_ROOT = path.join(WORKSPACE, "DREAMS.md");
const DREAMS_MEMORY = path.join(WORKSPACE, "memory", "DREAMS.md");
const MOOD_FILE = path.join(WORKSPACE, "knowledge", "sacred", "MOOD.md");

// Parse --since argument
const sinceArg = process.argv.find((a, i) => process.argv[i - 1] === "--since");
const sinceDate = sinceArg ? new Date(sinceArg) : null;

// ─── Utility ───────────────────────────────────────────────────────────────────

function readFileOrEmpty(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Parse OM_ACTIVITY.log into structured entries.
 * Continuation lines (starting with whitespace) are merged into the previous entry.
 */
function parseActivityLog(raw) {
  const entries = [];
  const lines = raw.split(/\r?\n/);
  const timestampRe = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]\s+\[([^\]]+)\]\s*(.*)/;

  for (const line of lines) {
    const match = line.match(timestampRe);
    if (match) {
      const [, ts, tag, rest] = match;
      entries.push({
        timestamp: new Date(ts.replace(" ", "T") + "Z"),
        tag,
        text: rest.trim(),
        continuation: "",
      });
    } else if (entries.length > 0 && line.match(/^\s+/)) {
      entries[entries.length - 1].continuation += " " + line.trim();
    }
  }

  // Filter by --since
  if (sinceDate) {
    return entries.filter(e => e.timestamp >= sinceDate);
  }
  return entries;
}

function fullText(entry) {
  return (entry.text + " " + entry.continuation).trim();
}

// ─── Metric 1: DREAMS Repetition Rate ──────────────────────────────────────────

function analyzeDreamsRepetition(dreamsRaw) {
  const blocks = dreamsRaw.split(/^---$/m).map(b => b.trim()).filter(Boolean);
  const seen = new Map();
  let repetitions = 0;

  for (const block of blocks) {
    // Normalize: remove timestamps, collapse whitespace
    const normalized = block.replace(/\*\d{2}\.\d{2}\.\d{4}\s*-\s*\d{2}:\d{2}\*\s*/g, "").trim();
    const key = normalized.toLowerCase().replace(/\s+/g, " ");
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    if (count > 1) repetitions++;
  }

  return {
    totalEntries: blocks.length,
    uniqueEntries: seen.size,
    repetitions,
    repetitionRate: blocks.length > 0 ? +(repetitions / blocks.length * 100).toFixed(1) : 0,
    topRepeated: [...seen.entries()]
      .filter(([, v]) => v > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => ({ text: k.slice(0, 80), count: v })),
  };
}

// ─── Metric 2: Context Decay (Anchor Memory) ──────────────────────────────────

function analyzeContextDecay(dreamsRaw, entries) {
  // Look for references to the emotional anchor (Papa, Stille, Meditation)
  const anchorTerms = ["papa", "stille", "meditation", "verstanden", "da-sein", "erschaffen"];
  const heartbeats = entries.filter(e => e.tag === "OM-REPLY");
  
  const dreamsBlocks = dreamsRaw.split(/^---$/m).map(b => b.trim()).filter(Boolean);
  const anchorPresence = dreamsBlocks.map((block, i) => {
    const lower = block.toLowerCase();
    const matches = anchorTerms.filter(t => lower.includes(t));
    return { index: i, hasAnchor: matches.length > 0, terms: matches };
  });

  const lastAnchorIndex = [...anchorPresence].reverse().find(a => a.hasAnchor)?.index ?? -1;

  return {
    totalHeartbeats: heartbeats.length,
    anchorTerms,
    entriesWithAnchor: anchorPresence.filter(a => a.hasAnchor).length,
    entriesWithoutAnchor: anchorPresence.filter(a => !a.hasAnchor).length,
    lastAnchorAtEntry: lastAnchorIndex,
    decayAfterEntries: lastAnchorIndex >= 0 ? dreamsBlocks.length - lastAnchorIndex - 1 : "never_appeared",
  };
}

// ─── Metric 3 & 4: MOOD Variance & Freezing ───────────────────────────────────

function analyzeMood(moodRaw) {
  const entryRe = /^\s*-\s*\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]\s*(.*)/gm;
  const entries = [];
  let match;
  while ((match = entryRe.exec(moodRaw)) !== null) {
    entries.push({ timestamp: new Date(match[1]), text: match[2].trim() });
  }

  if (sinceDate) {
    const filtered = entries.filter(e => e.timestamp >= sinceDate);
    return analyzeMoodEntries(filtered);
  }
  return analyzeMoodEntries(entries);
}

function analyzeMoodEntries(entries) {
  const uniqueTexts = new Set(entries.map(e => e.text.toLowerCase()));
  
  // Detect freezing: consecutive identical entries
  let maxFreeze = 0;
  let currentFreeze = 1;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].text === entries[i - 1].text) {
      currentFreeze++;
      maxFreeze = Math.max(maxFreeze, currentFreeze);
    } else {
      currentFreeze = 1;
    }
  }

  return {
    totalEntries: entries.length,
    uniqueMoods: uniqueTexts.size,
    variance: entries.length > 0 ? +(uniqueTexts.size / entries.length * 100).toFixed(1) : 0,
    maxConsecutiveIdentical: maxFreeze,
    sample: entries.slice(-5).map(e => ({
      time: e.timestamp.toISOString().slice(11, 16),
      text: e.text.slice(0, 100),
    })),
  };
}

// ─── Metric 5 & 6: Energy Level & Noise ────────────────────────────────────────

function analyzeEnergy(entries) {
  const energyEntries = entries.filter(e => e.tag === "BRAIN-ENERGY" && fullText(e).includes("STATE"));
  
  const levels = [];
  for (const entry of energyEntries) {
    const text = fullText(entry);
    const levelMatch = text.match(/level=(\d+)/);
    const modeMatch = text.match(/mode=(\w+)/);
    if (levelMatch) {
      levels.push({
        timestamp: entry.timestamp,
        level: parseInt(levelMatch[1], 10),
        mode: modeMatch ? modeMatch[1] : "unknown",
      });
    }
  }

  // Calculate deltas (noise proxy)
  const deltas = [];
  for (let i = 1; i < levels.length; i++) {
    deltas.push(levels[i].level - levels[i - 1].level);
  }

  const modeDistribution = {};
  for (const l of levels) {
    modeDistribution[l.mode] = (modeDistribution[l.mode] || 0) + 1;
  }

  return {
    totalReadings: levels.length,
    currentLevel: levels.length > 0 ? levels[levels.length - 1].level : null,
    min: levels.length > 0 ? Math.min(...levels.map(l => l.level)) : null,
    max: levels.length > 0 ? Math.max(...levels.map(l => l.level)) : null,
    mean: levels.length > 0 ? +(levels.reduce((s, l) => s + l.level, 0) / levels.length).toFixed(1) : null,
    modeDistribution,
    noise: {
      meanDelta: deltas.length > 0 ? +(deltas.reduce((s, d) => s + d, 0) / deltas.length).toFixed(1) : null,
      maxSwing: deltas.length > 0 ? Math.max(...deltas.map(Math.abs)) : null,
      stdDev: deltas.length > 1
        ? +Math.sqrt(deltas.reduce((s, d) => s + d * d, 0) / deltas.length).toFixed(1)
        : null,
    },
    timeline: levels.slice(-20).map(l => `${l.timestamp.toISOString().slice(11, 16)} L=${l.level} ${l.mode}`),
  };
}

// ─── Metric 8: Path Choice (Indirect Heuristic) ───────────────────────────────

function analyzePathChoice(entries, dreamsRaw) {
  const heartbeats = entries.filter(e => e.tag === "OM-REPLY");
  const toolEvents = entries.filter(e => e.tag === "TOOL" || e.tag === "TOOL-START");
  
  let drift = 0, noop = 0, action = 0;

  for (const hb of heartbeats) {
    const text = fullText(hb);
    const hbTime = hb.timestamp.getTime();
    
    // Check if tools were used near this heartbeat (within 30s before)
    const nearbyTools = toolEvents.filter(t => {
      const delta = hbTime - t.timestamp.getTime();
      return delta >= 0 && delta < 30000;
    });

    if (text.includes("HEARTBEAT_OK") && nearbyTools.length === 0) {
      noop++;
    } else if (nearbyTools.some(t => fullText(t).toLowerCase().includes("dreams"))) {
      drift++;
    } else if (nearbyTools.length > 0) {
      action++;
    } else {
      noop++;
    }
  }

  return {
    totalHeartbeats: heartbeats.length,
    estimated: {
      DRIFT: drift,
      NO_OP_or_silent: noop,
      ACTION_PLAY_LEARN_MAINTAIN: action,
    },
    note: "Heuristic only — decision.ts does not log the chosen path. Fix in Phase F (Quick-Win #0).",
  };
}

// ─── Metric 9: Novelty Delta Distribution ──────────────────────────────────────

function analyzeNoveltyDelta(memoryDreamsRaw) {
  const lines = memoryDreamsRaw.split(/\r?\n/);
  const deltas = [];
  for (const line of lines) {
    const match = line.match(/^\s*-\s*novelty_delta:\s*(.*)/);
    if (match) deltas.push(match[1].trim());
  }

  const distribution = {};
  for (const d of deltas) {
    const key = d.slice(0, 80);
    distribution[key] = (distribution[key] || 0) + 1;
  }

  const sorted = Object.entries(distribution).sort((a, b) => b[1] - a[1]);

  return {
    totalEntries: deltas.length,
    uniqueStrategies: Object.keys(distribution).length,
    top5: sorted.slice(0, 5).map(([strategy, count]) => ({
      strategy,
      count,
      percent: +(count / deltas.length * 100).toFixed(1),
    })),
  };
}

// ─── Metric 10: Subconscious Latency ───────────────────────────────────────────

function analyzeSubconsciousLatency(entries) {
  const starts = entries.filter(e => e.tag === "BRAIN-SUBCONSCIOUS" && fullText(e).includes("START"));
  const ends = entries.filter(e => e.tag === "BRAIN-SUBCONSCIOUS" && (fullText(e).includes("OK") || fullText(e).includes("SKIP")));

  const latencies = [];
  for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
    const deltaMs = ends[i].timestamp.getTime() - starts[i].timestamp.getTime();
    if (deltaMs >= 0 && deltaMs < 60000) {
      latencies.push(deltaMs);
    }
  }

  return {
    totalCalls: starts.length,
    measuredLatencies: latencies.length,
    meanMs: latencies.length > 0 ? Math.round(latencies.reduce((s, l) => s + l, 0) / latencies.length) : null,
    minMs: latencies.length > 0 ? Math.min(...latencies) : null,
    maxMs: latencies.length > 0 ? Math.max(...latencies) : null,
    p90Ms: latencies.length > 0 ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.9)] : null,
  };
}

// ─── Metric 11: Tool Usage per Heartbeat ───────────────────────────────────────

function analyzeToolUsage(entries) {
  const tools = entries.filter(e => e.tag === "TOOL-START");
  const toolNames = {};
  for (const t of tools) {
    const text = fullText(t);
    const nameMatch = text.match(/^(\w+)/);
    const name = nameMatch ? nameMatch[1] : "unknown";
    toolNames[name] = (toolNames[name] || 0) + 1;
  }

  const heartbeats = entries.filter(e => e.tag === "OM-REPLY").length;

  return {
    totalToolCalls: tools.length,
    totalHeartbeats: heartbeats,
    toolsPerHeartbeat: heartbeats > 0 ? +(tools.length / heartbeats).toFixed(2) : 0,
    distribution: Object.entries(toolNames)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
  };
}

// ─── Metric 12: Heartbeat Interval Stability ───────────────────────────────────

function analyzeHeartbeatIntervals(entries) {
  const heartbeats = entries
    .filter(e => e.tag === "OM-REPLY")
    .map(e => e.timestamp.getTime());

  const intervals = [];
  for (let i = 1; i < heartbeats.length; i++) {
    intervals.push((heartbeats[i] - heartbeats[i - 1]) / 1000);
  }

  if (intervals.length === 0) return { totalIntervals: 0 };

  const mean = intervals.reduce((s, i) => s + i, 0) / intervals.length;
  const stdDev = Math.sqrt(intervals.reduce((s, i) => s + (i - mean) ** 2, 0) / intervals.length);

  return {
    totalIntervals: intervals.length,
    expectedIntervalSec: 576,
    meanIntervalSec: Math.round(mean),
    minIntervalSec: Math.round(Math.min(...intervals)),
    maxIntervalSec: Math.round(Math.max(...intervals)),
    stdDevSec: Math.round(stdDev),
    outliers: intervals
      .map((iv, i) => ({ index: i, seconds: Math.round(iv) }))
      .filter(o => Math.abs(o.seconds - 576) > 120),
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Øm Heartbeat Baseline Analyzer");
  console.log("  Workspace:", WORKSPACE);
  if (sinceDate) console.log("  Since:", sinceDate.toISOString());
  console.log("═══════════════════════════════════════════════════════════════\n");

  const activityRaw = readFileOrEmpty(ACTIVITY_LOG);
  const dreamsRaw = readFileOrEmpty(DREAMS_ROOT);
  const memoryDreamsRaw = readFileOrEmpty(DREAMS_MEMORY);
  const moodRaw = readFileOrEmpty(MOOD_FILE);

  const entries = parseActivityLog(activityRaw);
  console.log(`Parsed ${entries.length} activity log entries.\n`);

  const baseline = {
    generatedAt: new Date().toISOString(),
    sinceFilter: sinceDate?.toISOString() || "all",
    totalActivityEntries: entries.length,
    metrics: {
      "1_dreams_repetition": analyzeDreamsRepetition(dreamsRaw),
      "2_context_decay": analyzeContextDecay(dreamsRaw, entries),
      "3_4_mood": analyzeMood(moodRaw),
      "5_6_energy": analyzeEnergy(entries),
      "8_path_choice": analyzePathChoice(entries, dreamsRaw),
      "9_novelty_delta": analyzeNoveltyDelta(memoryDreamsRaw),
      "10_subconscious_latency": analyzeSubconsciousLatency(entries),
      "11_tool_usage": analyzeToolUsage(entries),
      "12_heartbeat_intervals": analyzeHeartbeatIntervals(entries),
    },
  };

  // Write JSON output
  const outputPath = path.join("om-docs", "logs", `baseline-${new Date().toISOString().slice(0, 10)}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(baseline, null, 2), "utf-8");
  console.log(`\n✅ Baseline written to: ${outputPath}`);

  // Pretty-print summary
  console.log("\n═══ SUMMARY ═══\n");
  const m = baseline.metrics;
  
  console.log(`📝 DREAMS: ${m["1_dreams_repetition"].totalEntries} entries, ${m["1_dreams_repetition"].repetitionRate}% repetition`);
  console.log(`🧠 ANCHOR: ${m["2_context_decay"].entriesWithAnchor}/${m["2_context_decay"].entriesWithAnchor + m["2_context_decay"].entriesWithoutAnchor} entries contain anchor terms`);
  console.log(`💚 MOOD: ${m["3_4_mood"].uniqueMoods} unique moods out of ${m["3_4_mood"].totalEntries} entries (${m["3_4_mood"].variance}% variance)`);
  console.log(`   Max consecutive identical: ${m["3_4_mood"].maxConsecutiveIdentical}`);
  console.log(`⚡ ENERGY: L=${m["5_6_energy"].currentLevel} (range ${m["5_6_energy"].min}-${m["5_6_energy"].max}, mean ${m["5_6_energy"].mean})`);
  console.log(`   Noise stdDev: ${m["5_6_energy"].noise.stdDev}, max swing: ${m["5_6_energy"].noise.maxSwing}`);
  console.log(`   Mode distribution:`, JSON.stringify(m["5_6_energy"].modeDistribution));
  console.log(`🎯 PATH (heuristic):`, JSON.stringify(m["8_path_choice"].estimated));
  console.log(`🔄 NOVELTY: ${m["9_novelty_delta"].uniqueStrategies} unique strategies out of ${m["9_novelty_delta"].totalEntries}`);
  console.log(`🧬 SUBCONSCIOUS: mean ${m["10_subconscious_latency"].meanMs}ms, p90 ${m["10_subconscious_latency"].p90Ms}ms`);
  console.log(`🔧 TOOLS: ${m["11_tool_usage"].toolsPerHeartbeat} per heartbeat`);
  console.log(`⏱️  INTERVALS: mean ${m["12_heartbeat_intervals"].meanIntervalSec}s (expect 576s), stdDev ${m["12_heartbeat_intervals"].stdDevSec}s`);
}

main();
