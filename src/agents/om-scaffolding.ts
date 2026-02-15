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
/** Max repeated identical tool+path calls inside the rolling window. */
const LOOP_REPEAT_THRESHOLD = 5;
/** Rolling time window for non-consecutive loop detection. */
const LOOP_WINDOW_MS = 90_000;
/** Cooldown after loop detection; repeated calls are rejected during this period. */
const LOOP_COOLDOWN_MS = 90_000;

/**
 * Best-effort string argument extraction across mixed tool schemas.
 * Some providers vary key casing (`path` vs `TargetFile`) so we normalize here.
 */
function normalizeArgKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getStringArg(args: Record<string, unknown>, candidateKeys: string[]): string | undefined {
  const wanted = candidateKeys.map(normalizeArgKey);

  const search = (obj: Record<string, unknown>): string | undefined => {
    for (const [rawKey, value] of Object.entries(obj)) {
      const key = normalizeArgKey(rawKey);
      if (typeof value === "string" && value.trim().length > 0 && wanted.includes(key)) {
        return value;
      }
    }

    for (const [rawKey, value] of Object.entries(obj)) {
      const key = normalizeArgKey(rawKey);
      if (typeof value === "string" && value.trim().length > 0) {
        if (wanted.some((candidate) => key.includes(candidate) || candidate.includes(key))) {
          return value;
        }
      }
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const nested = search(value as Record<string, unknown>);
        if (nested) return nested;
      }
    }

    return undefined;
  };

  const found = search(args);
  if (found) return found;

  const wantsPathLike = wanted.some((key) => key.includes("path") || key.includes("file"));
  if (!wantsPathLike) return undefined;

  for (const [rawKey, value] of Object.entries(args)) {
    const key = normalizeArgKey(rawKey);
    if (typeof value === "string" && value.trim().length > 0) {
      if (key.includes("path") || key.includes("file")) return value;
    }
  }

  return undefined;
}

function throwToolBlocked(message: string): never {
  const error = new Error(message);
  error.name = "OmToolBlockedError";
  throw error;
}

function parseObjectArg(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore parse errors and fall through.
  }
  return undefined;
}

function extractToolArgsFromExecuteCall(executeArgs: unknown[]): Record<string, unknown> {
  const [firstArg, secondArg] = executeArgs;
  const firstRecord = parseObjectArg(firstArg);
  const secondRecord = parseObjectArg(secondArg);

  // AgentTool signature: execute(toolCallId, params, signal?, onUpdate?)
  if (typeof firstArg === "string" && secondRecord) {
    return secondRecord;
  }

  // Legacy/local calls might pass params as first arg only.
  if (firstRecord) {
    return firstRecord;
  }

  // Fallback when params arrive in second position.
  if (secondRecord) {
    return secondRecord;
  }

  return {};
}

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
    execute: async (...executeArgs: unknown[]) => {
      const args = extractToolArgsFromExecuteCall(executeArgs);
      const filePath = getStringArg(args, [
        "path",
        "file_path",
        "TargetFile",
        "targetFile",
        "filePath",
        "filepath",
        "file",
        "filename",
      ]);
      logToolCall("edit", filePath);

      // ØM Layer 3: Loop Detector — block if stuck in a loop
      const loopWarning = checkForLoop("edit", filePath || "(unknown)");
      if (loopWarning) {
        logGuardian("LOOP-DETECT", "Blocked edit execution", filePath);
        logToolResult("edit", false, "blocked by loop detector");
        throwToolBlocked(loopWarning);
      }

      // First, try the normal edit
      const result = await (originalExecute as Function)(...executeArgs);

      // Check if the result indicates a "not found" error
      const resultStr = typeof result === "string"
        ? result
        : JSON.stringify(result);

      if (resultStr.includes("Could not find the exact text") || resultStr.includes("old text must match exactly")) {
        logGuardian("EDIT-GUARD", "Normal edit FAILED, trying fuzzy match", filePath);
        console.error(`[ØM Edit-Guardian] Normal edit failed, attempting fuzzy match...`);

        const oldText = getStringArg(args, ["oldText", "old_string"]);
        const newText = getStringArg(args, ["newText", "new_string"]);

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
    execute: async (...executeArgs: unknown[]) => {
      const args = extractToolArgsFromExecuteCall(executeArgs);
      const filePath = getStringArg(args, [
        "path",
        "file_path",
        "TargetFile",
        "targetFile",
        "filePath",
        "filepath",
        "file",
        "filename",
      ]);
      const newContent = getStringArg(args, ["content"]);
      logToolCall("write", filePath);

      // ØM Layer 3: Loop Detector — block if stuck in a loop
      const loopWarning = checkForLoop("write", filePath || "(unknown)");
      if (loopWarning) {
        logGuardian("LOOP-DETECT", "Blocked write execution", filePath);
        logToolResult("write", false, "blocked by loop detector");
        throwToolBlocked(loopWarning);
      }

      // Block no-op rewrites that keep writing identical content.
      if (filePath && typeof newContent === "string" && fs.existsSync(filePath)) {
        try {
          const existingContent = fs.readFileSync(filePath, "utf-8");
          if (existingContent === newContent) {
            logGuardian("WRITE-GUARD", "Blocked redundant write (content unchanged)", filePath);
            logToolResult("write", false, "blocked redundant write");
            throwToolBlocked(`⚠️ REDUNDANT WRITE BLOCKED: "${filePath}" already contains the same content. Do not write again unless you have a concrete change.`);
          }
        } catch (error) {
          if (error instanceof Error && error.name === "OmToolBlockedError") {
            throw error;
          }
          // If content cannot be read, continue with normal write behavior.
        }
      }

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

      const result = await (originalExecute as Function)(...executeArgs);
      logToolResult("write", true, filePath);
      return result;
    },
  };

  return wrappedTool as unknown as AnyAgentTool;
}

// ─── LAYER 3: LOOP DETECTOR ─────────────────────────────────────────────────────

/** Tracks recent tool calls to detect loops. */
const recentCalls: Array<{ tool: string; path: string; timestamp: number }> = [];
/** Tracks temporary cooldown blocks after a loop was detected. */
const blockedKeysUntil = new Map<string, number>();

/**
 * Check if the current tool+path call is part of a repetitive loop.
 * Returns a warning message if a loop is detected, or null if everything is fine.
 */
export function checkForLoop(toolName: string, filePath: string): string | null {
  const now = Date.now();
  const key = `${toolName}:${filePath}`;

  // Respect active cooldown first.
  const cooldownUntil = blockedKeysUntil.get(key);
  if (cooldownUntil !== undefined) {
    if (now < cooldownUntil) {
      const waitSeconds = Math.max(1, Math.ceil((cooldownUntil - now) / 1000));
      return `⚠️ LOOP COOLDOWN ACTIVE: "${toolName}" on "${filePath}" is temporarily blocked for ${waitSeconds}s because it was repeated too often. Do NOT retry the same call; switch strategy.`;
    }
    blockedKeysUntil.delete(key);
  }

  // Add new call
  recentCalls.push({ tool: toolName, path: filePath, timestamp: now });

  // Prune old calls outside the rolling loop window.
  while (recentCalls.length > 0 && now - recentCalls[0].timestamp > LOOP_WINDOW_MS) {
    recentCalls.shift();
  }

  // Prune expired cooldown entries.
  for (const [cooldownKey, until] of blockedKeysUntil) {
    if (until <= now) blockedKeysUntil.delete(cooldownKey);
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

  // Also detect repeated retries even when interleaved with other calls.
  const repeatedInWindow = recentCalls.filter(
    (call) => `${call.tool}:${call.path}` === key,
  ).length;

  if (consecutive >= LOOP_DETECT_THRESHOLD) {
    blockedKeysUntil.set(key, now + LOOP_COOLDOWN_MS);
    console.error(`[ØM Loop-Detector] ⚠️ Detected ${consecutive}x consecutive ${toolName} on ${path.basename(filePath)}`);
    return `⚠️ LOOP DETECTED: "${toolName}" on "${filePath}" was called ${consecutive} times in a row. Stop repeating this call. Next action must be different (for example: read once, summarize the failure, then exit the tool loop).`;
  }

  if (repeatedInWindow >= LOOP_REPEAT_THRESHOLD) {
    blockedKeysUntil.set(key, now + LOOP_COOLDOWN_MS);
    console.error(
      `[Om Loop-Detector] Detected ${repeatedInWindow}x repeated ${toolName} on ${path.basename(filePath)} in ${Math.round(LOOP_WINDOW_MS / 1000)}s`,
    );
    return `⚠️ REPEAT LOOP DETECTED: "${toolName}" on "${filePath}" was retried ${repeatedInWindow} times within ${Math.round(LOOP_WINDOW_MS / 1000)}s. This call is blocked for ${Math.ceil(LOOP_COOLDOWN_MS / 1000)}s. Stop retrying this path and choose a different next step.`;
  }

  return null;
}

// ─── LAYER 3b: EXEC LOOP PROTECTION ────────────────────────────────────────────

/**
 * Wraps the "exec" tool with loop detection.
 * Prevents the model from calling the same shell command repeatedly when it errors.
 * This was the missing piece that caused the 7x analyze-image 404 trauma loop.
 */
export function wrapExecWithLoopProtection(execTool: AnyAgentTool): AnyAgentTool {
  const originalExecute = execTool.execute.bind(execTool);

  const wrappedTool = {
    ...execTool,
    execute: async (...executeArgs: unknown[]) => {
      const args = extractToolArgsFromExecuteCall(executeArgs);
      // Extract the command string for loop detection
      const command = (args.command || args.cmd || args.script || "") as string;
      // Use a normalized version: trim and take first 120 chars to group similar commands
      const commandKey = command.trim().substring(0, 120);
      logToolCall("exec", commandKey);

      // ØM Layer 3b: Loop Detector — block if stuck in an exec loop
      const loopWarning = checkForLoop("exec", commandKey);
      if (loopWarning) {
        logGuardian("LOOP-DETECT", "Blocked exec execution", commandKey);
        logToolResult("exec", false, "blocked by loop detector");
        throwToolBlocked(`⚠️ EXEC LOOP DETECTED: Command blocked after repeated retries: ${commandKey}`);
      }

      const result = await (originalExecute as Function)(...executeArgs);
      logToolResult("exec", true, commandKey);
      return result;
    },
  };

  return wrappedTool as unknown as AnyAgentTool;
}

// ─── EXPORTS ────────────────────────────────────────────────────────────────────

/**
 * Test helper: clear loop detector state between tests.
 */
export function resetLoopDetectorForTests(): void {
  recentCalls.length = 0;
  blockedKeysUntil.clear();
}

export { isSacredPath, backupSacredFile, SACRED_PATHS };
