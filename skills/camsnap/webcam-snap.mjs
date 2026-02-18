#!/usr/bin/env node
/**
 * webcam-snap.mjs — Windows-compatible webcam snapshot tool for Øm
 *
 * Uses ffmpeg + DirectShow to capture a single frame from the webcam.
 * Designed to be called by Øm (via shell/tool) to "see" the world.
 *
 * Usage:
 *   node webcam-snap.mjs [--out <path>] [--device <name>] [--quality <1-31>]
 *
 * Defaults:
 *   --out      ./snapshot_<timestamp>.jpg
 *   --device   "HD Pro Webcam C920"
 *   --quality  4 (lower = better, range 1-31)
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// --- Parse args ---
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const DEFAULT_DEVICE = "HD Pro Webcam C920";
const device = getArg("device", DEFAULT_DEVICE);
const quality = getArg("quality", "4");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const defaultOut = resolve(process.cwd(), `snapshot_${timestamp}.jpg`);
const outPath = resolve(getArg("out", defaultOut));

// Ensure output directory exists
const outDir = dirname(outPath);
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

// --- Capture ---
const cmd = [
  "ffmpeg",
  "-f dshow",
  `-i video="${device}"`,
  "-frames:v 1",
  "-update 1",
  `-q:v ${quality}`,
  "-y",
  `"${outPath}"`,
].join(" ");

console.log(`📸 Capturing from "${device}"...`);

try {
  execSync(cmd, { stdio: "pipe", timeout: 15_000 });
} catch (err) {
  // ffmpeg often exits with code 1 even on success (dshow quirk)
  // Check if the file was actually written
}

if (existsSync(outPath)) {
  const { size } = /** @type {import('fs').Stats} */ (
    /** @type {any} */ (await import("node:fs/promises")).stat(outPath).catch(() => ({ size: 0 }))
  );
  console.log(
    `✅ Snapshot saved: ${outPath} (${Math.round((await import("node:fs")).statSync(outPath).size / 1024)}KB)`,
  );
  console.log(`📍 Path: ${outPath}`);
} else {
  console.error("❌ Snapshot failed — no output file created.");
  console.error("   Check that the webcam device name is correct.");
  console.error(`   Tried: "${device}"`);
  console.error("   List devices: ffmpeg -list_devices true -f dshow -i dummy");
  process.exit(1);
}
