/**
 * ØM SCAFFOLDING LAYERS
 * 
 * Custom protective layers that make free/lightweight models (like Arcee Trinity)
 * smarter and safer when operating autonomously through OpenClaw.
 * 
 * Layer 1: Edit-Guardian — Fuzzy fallback when edit tool fails on inexact text matching.
 * Layer 2: Sacred File Protection — Auto-backup before overwriting critical files.
 * Layer 3: Loop Detector — Stops the model when it repeats the same action without progress.
 * Layer 4: Activity Logger — Structured log of all Øm actions for debugging.
 * 
 * These layers are model-agnostic and benefit ALL models, not just free ones.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { AnyAgentTool } from "./pi-tools.types.js";

// ─── LAYER 4: ACTIVITY LOGGER ───────────────────────────────────────────────────

const OM_LOG_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".openclaw",
  "workspace",
);

const OM_LOG_FILE = path.join(OM_LOG_DIR, "OM_ACTIVITY.log");

/** Max log file size before rotation (500KB) */
const MAX_LOG_SIZE = 500 * 1024;

function getTimestamp(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

/**
 * Write a structured log entry to the Øm Activity Log.
 * Format: [TIMESTAMP] [LAYER] EVENT | details
 */
export function omLog(layer: string, event: string, details?: string): void {
  try {
    // Ensure log directory exists
    if (!fs.existsSync(OM_LOG_DIR)) {
      fs.mkdirSync(OM_LOG_DIR, { recursive: true });
    }

    // Rotate if too large
    if (fs.existsSync(OM_LOG_FILE)) {
      const stat = fs.statSync(OM_LOG_FILE);
      if (stat.size > MAX_LOG_SIZE) {
        const rotated = OM_LOG_FILE.replace(".log", ".prev.log");
        if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
        fs.renameSync(OM_LOG_FILE, rotated);
      }
    }

    const line = `[${getTimestamp()}] [${layer}] ${event}${details ? ` | ${details}` : ""}\n`;
    fs.appendFileSync(OM_LOG_FILE, line, "utf-8");
  } catch {
    // Silent fail — logging should never break the agent
  }
}

/**
 * Log a tool call (start).
 */
export function logToolCall(toolName: string, filePath?: string): void {
  omLog("TOOL", `${toolName.toUpperCase()}`, filePath || "(no path)");
}

/**
 * Log a tool result (success or error).
 */
export function logToolResult(toolName: string, success: boolean, detail?: string): void {
  const status = success ? "✓ OK" : "✗ FAIL";
  omLog("TOOL", `${toolName.toUpperCase()} → ${status}`, detail);
}

/**
 * Log a guardian intervention.
 */
export function logGuardian(guardianName: string, action: string, detail?: string): void {
  omLog(guardianName, action, detail);
}

/**
 * Log a session marker (e.g., gateway start, heartbeat).
 */
export function logSession(event: string): void {
  omLog("SESSION", event);
  // Also write a separator for readability
  try {
    fs.appendFileSync(OM_LOG_FILE, "─".repeat(60) + "\n", "utf-8");
  } catch { /* silent */ }
}

// ─── CONFIGURATION ─────────────────────────────────────────────────────────────

/** Files/directories considered "sacred" — auto-backed-up before write overwrites. */
const SACRED_PATHS = [
  "knowledge/sacred/",
  "CHRONICLE_OF_",
  "ACTIVE_TASKS",
  "THINKING_PROTOCOL",
  "SELF_REVIEW",
  "LESSONS",
];

/** How much smaller a write can be before we warn (ratio: new/old). Below this = suspicious. */
const SACRED_SHRINK_THRESHOLD = 0.8;

/** Max consecutive identical tool+path calls before the loop detector fires. */
const LOOP_DETECT_THRESHOLD = 3;

// ─── LAYER 1: EDIT-GUARDIAN ─────────────────────────────────────────────────────

/**
 * Fuzzy text matching: Normalizes whitespace differences so that models
 * that quote text with slightly different spacing still succeed.
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")       // Normalize line endings
    .replace(/\t/g, "  ")          // Tabs to spaces
    .replace(/ +$/gm, "")          // Trailing spaces per line
    .replace(/^\s*\n/gm, "\n")     // Blank lines to single newlines
    .trim();
}

/**
 * Attempt a fuzzy edit: if the exact old_string wasn't found,
 * try normalizing whitespace on both the file content and the search string.
 * If a match is found after normalization, perform the replacement.
 */
function fuzzyEdit(
  filePath: string,
  oldText: string,
  newText: string,
): { success: boolean; message: string } {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, message: `File not found: ${filePath}` };
    }

    const fileContent = fs.readFileSync(filePath, "utf-8");
    const normalizedFile = normalizeWhitespace(fileContent);
    const normalizedOld = normalizeWhitespace(oldText);

    if (!normalizedOld) {
      return { success: false, message: "Empty old_string after normalization." };
    }

    const matchIndex = normalizedFile.indexOf(normalizedOld);
    if (matchIndex === -1) {
      // Even fuzzy match failed — give up gracefully
      return {
        success: false,
        message: `Fuzzy match also failed. The text you're trying to replace doesn't exist in the file (even after normalizing whitespace). Try using 'write' to overwrite the entire file instead, but make sure to include ALL existing content plus your changes.`,
      };
    }

    // Map the normalized match position back to the original file.
    // Strategy: split the original file into lines and rebuild, matching line by line.
    const originalLines = fileContent.split("\n");
    const searchLines = normalizedOld.split("\n");
    
    let startLineIdx = -1;
    let endLineIdx = -1;

    // Find the block of lines in the original that matches when normalized
    for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
      let matched = true;
      for (let j = 0; j < searchLines.length; j++) {
        if (normalizeWhitespace(originalLines[i + j]) !== searchLines[j]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        startLineIdx = i;
        endLineIdx = i + searchLines.length;
        break;
      }
    }

    if (startLineIdx === -1) {
      return { success: false, message: "Fuzzy line-by-line match failed." };
    }

    // Perform the replacement
    const before = originalLines.slice(0, startLineIdx).join("\n");
    const after = originalLines.slice(endLineIdx).join("\n");
    const result = [before, newText, after].filter(Boolean).join("\n");

    fs.writeFileSync(filePath, result, "utf-8");
    console.error(`[ØM Edit-Guardian] Fuzzy match succeeded for ${path.basename(filePath)} (lines ${startLineIdx + 1}-${endLineIdx})`);
    return {
      success: true,
      message: `Successfully replaced text in ${filePath}. (Edit-Guardian: whitespace-normalized fuzzy match was used.)`,
    };
  } catch (err) {
    return { success: false, message: `Edit-Guardian error: ${String(err)}` };
  }
}

/**
 * Wraps the stock "edit" tool with a fuzzy-matching fallback.
 * If the normal edit fails with "Could not find the exact text",
 * the guardian attempts a whitespace-normalized match.
 */
export function wrapEditWithGuardian(editTool: AnyAgentTool): AnyAgentTool {
  const originalExecute = editTool.execute.bind(editTool);

  const wrappedTool = {
    ...editTool,
    execute: async (args: Record<string, unknown>, context?: unknown) => {
      const filePath = (args.path || args.file_path) as string;
      logToolCall("edit", filePath);

      // First, try the normal edit
      const result = await (originalExecute as Function)(args, context);

      // Check if the result indicates a "not found" error
      const resultStr = typeof result === "string"
        ? result
        : JSON.stringify(result);

      if (resultStr.includes("Could not find the exact text") || resultStr.includes("old text must match exactly")) {
        logGuardian("EDIT-GUARD", "Normal edit FAILED, trying fuzzy match", filePath);
        console.error(`[ØM Edit-Guardian] Normal edit failed, attempting fuzzy match...`);

        const oldText = (args.oldText || args.old_string) as string;
        const newText = (args.newText || args.new_string) as string;

        if (filePath && oldText && newText) {
          const fuzzyResult = fuzzyEdit(filePath, oldText, newText);
          if (fuzzyResult.success) {
            logGuardian("EDIT-GUARD", "Fuzzy match SUCCEEDED", filePath);
            logToolResult("edit", true, "fuzzy match");
            return { content: [{ type: "text", text: fuzzyResult.message }] };
          }
          logGuardian("EDIT-GUARD", "Fuzzy match also FAILED", filePath);
          logToolResult("edit", false, "fuzzy match also failed");
          return { content: [{ type: "text", text: fuzzyResult.message }] };
        }
      }

      logToolResult("edit", true);
      return result;
    },
  };

  return wrappedTool as unknown as AnyAgentTool;
}

// ─── LAYER 2: SACRED FILE PROTECTION ────────────────────────────────────────────

function isSacredPath(filePath: string): boolean {
  if (!filePath) return false;
  
  // Normalize Windows backslashes to forward slashes
  const normalized = filePath.replace(/\\/g, "/");
  
  // Also check just the filename itself for matches like "ACTIVE_TASKS.md"
  const fileName = path.basename(filePath);

  const matched = SACRED_PATHS.some((sacred) => {
    // Check full path contains the sacred string (e.g. "knowledge/sacred/")
    if (normalized.includes(sacred)) return true;
    // Check just the filename contains the sacred string (e.g. "ACTIVE_TASKS")
    if (fileName.includes(sacred.replace("/", ""))) return true;
    return false;
  });

  if (matched) {
    // Only log if matched to avoid spam, or log unmatched for debugging if needed
    // process.stdout.write(`[Debug] Sacred matched: ${filePath}\n`);
  } else {
    // process.stdout.write(`[Debug] Sacred NOT matched: ${filePath}\n`);
  }

  return matched;
}

function backupSacredFile(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return;

    const backupDir = path.join(path.dirname(filePath), ".backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `${path.basename(filePath)}.${timestamp}.bak`;
    const backupPath = path.join(backupDir, backupName);
    
    fs.copyFileSync(filePath, backupPath);
    console.error(`[ØM Sacred-Guard] Backed up ${path.basename(filePath)} → .backups/${backupName}`);

    // Keep only last 10 backups per file
    const prefix = path.basename(filePath);
    const allBackups = fs.readdirSync(backupDir)
      .filter((f) => f.startsWith(prefix) && f.endsWith(".bak"))
      .sort()
      .reverse();
    
    for (const old of allBackups.slice(10)) {
      fs.unlinkSync(path.join(backupDir, old));
    }
  } catch (err) {
    console.error(`[ØM Sacred-Guard] Backup failed: ${String(err)}`);
  }
}

/**
 * Wraps the "write" tool with sacred file protection.
 * Before overwriting a sacred file, it:
 * 1. Creates an automatic backup.
 * 2. Warns if the new content is suspiciously smaller than the old content.
 */
export function wrapWriteWithSacredProtection(writeTool: AnyAgentTool): AnyAgentTool {
  const originalExecute = writeTool.execute.bind(writeTool);

  const wrappedTool = {
    ...writeTool,
    execute: async (args: Record<string, unknown>, context?: unknown) => {
      const filePath = (args.path || args.file_path) as string;
      const newContent = (args.content) as string;
      logToolCall("write", filePath);

      if (filePath && isSacredPath(filePath)) {
        // AUTO-BACKUP before any write to a sacred file
        logGuardian("SACRED-GUARD", "Auto-backup before write", filePath);
        backupSacredFile(filePath);

        // SIZE-CHECK: warn if new content is dramatically smaller
        if (newContent && fs.existsSync(filePath)) {
          const oldSize = fs.statSync(filePath).size;
          const newSize = Buffer.byteLength(newContent, "utf-8");

          if (oldSize > 100 && newSize / oldSize < SACRED_SHRINK_THRESHOLD) {
            const pct = Math.round((newSize / oldSize) * 100);
            logGuardian("SACRED-GUARD", `⚠️ SHRINK WARNING: ${oldSize}B → ${newSize}B (${pct}%)`, filePath);
            console.error(
              `[ØM Sacred-Guard] ⚠️ WARNING: Write to ${path.basename(filePath)} would shrink it from ${oldSize}B to ${newSize}B (${pct}%). Allowing but logged.`,
            );
            // We still allow the write but log it prominently.
            // Future enhancement: could reject and tell the model to include all content.
          }
        }
      }

      const result = await (originalExecute as Function)(args, context);
      logToolResult("write", true, filePath);
      return result;
    },
  };

  return wrappedTool as unknown as AnyAgentTool;
}

// ─── LAYER 3: LOOP DETECTOR ─────────────────────────────────────────────────────

/** Tracks recent tool calls to detect loops. */
const recentCalls: Array<{ tool: string; path: string; timestamp: number }> = [];

/**
 * Check if the current tool+path call is part of a repetitive loop.
 * Returns a warning message if a loop is detected, or null if everything is fine.
 */
export function checkForLoop(toolName: string, filePath: string): string | null {
  const now = Date.now();
  const key = `${toolName}:${filePath}`;

  // Add new call
  recentCalls.push({ tool: toolName, path: filePath, timestamp: now });

  // Prune old calls (older than 60 seconds)
  while (recentCalls.length > 0 && now - recentCalls[0].timestamp > 60000) {
    recentCalls.shift();
  }

  // Count consecutive identical calls
  let consecutive = 0;
  for (let i = recentCalls.length - 1; i >= 0; i--) {
    const call = recentCalls[i];
    if (`${call.tool}:${call.path}` === key) {
      consecutive++;
    } else {
      break;
    }
  }

  if (consecutive >= LOOP_DETECT_THRESHOLD) {
    console.error(`[ØM Loop-Detector] ⚠️ Detected ${consecutive}x consecutive ${toolName} on ${path.basename(filePath)}`);
    return `⚠️ LOOP DETECTED: You have called "${toolName}" on "${filePath}" ${consecutive} times in a row. This suggests you are stuck in a loop. Please try a DIFFERENT approach or tool. If editing fails, try using "write" with the COMPLETE file content. If writing fails, try reading the file first to understand its current state.`;
  }

  return null;
}

// ─── EXPORTS ────────────────────────────────────────────────────────────────────

export { isSacredPath, backupSacredFile, SACRED_PATHS };
