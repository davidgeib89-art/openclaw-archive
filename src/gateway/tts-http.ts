/**
 * TTS HTTP endpoint for the WebGUI.
 *
 * POST /api/tts
 *   Body: { text: string, voice?: string, rate?: string, pitch?: string, volume?: string }
 *   Response: audio/mpeg binary
 *
 * This allows the Control UI (webchat) to request TTS audio for assistant
 * messages, enabling voice playback in the browser.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/config.js";
import { saveMediaSource } from "../media/store.js";
import { textToSpeech } from "../tts/tts.js";

const TTS_PATH = "/api/tts";
const MAX_TEXT_LENGTH = 5000;

function resolveAudioContentType(params: { outputFormat?: string; audioPath?: string }): string {
  const fmt = (params.outputFormat ?? "").toLowerCase();
  if (fmt.includes("opus") || fmt.includes("ogg")) {
    return "audio/ogg";
  }
  if (fmt.includes("wav") || fmt.includes("riff") || fmt.includes("pcm")) {
    return "audio/wav";
  }
  const ext = path.extname(params.audioPath ?? "").toLowerCase();
  if (ext === ".wav") {
    return "audio/wav";
  }
  if (ext === ".ogg" || ext === ".opus") {
    return "audio/ogg";
  }
  return "audio/mpeg";
}

function readJsonBodySimple(
  req: IncomingMessage,
  maxBytes: number,
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        resolve(null);
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(typeof body === "object" && body !== null ? body : null);
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

export async function handleTtsHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== TTS_PATH) {
    return false;
  }

  // Handle CORS preflight (browser sends OPTIONS before POST with application/json)
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "3600");
    res.end();
    return true;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST, OPTIONS");
    res.setHeader("Content-Type", "text/plain");
    res.end("Method Not Allowed");
    return true;
  }

  const body = await readJsonBodySimple(req, 64 * 1024);
  if (!body) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return true;
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing or empty 'text' field" }));
    return true;
  }

  if (text.length > MAX_TEXT_LENGTH) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: `Text too long (${text.length} > ${MAX_TEXT_LENGTH})`,
      }),
    );
    return true;
  }

  try {
    const cfg = loadConfig();
    const result = await textToSpeech({
      text,
      cfg,
      channel: "webchat",
      strictProvider: true,
    });

    if (!result.success || !result.audioPath) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: result.error ?? "TTS generation failed" }));
      return true;
    }

    const audioData = readFileSync(result.audioPath);
    const contentType = resolveAudioContentType({
      outputFormat: result.outputFormat,
      audioPath: result.audioPath,
    });
    let mediaUrl: string | undefined;
    try {
      const saved = await saveMediaSource(result.audioPath);
      mediaUrl = `/media/${saved.id}`;
    } catch {
      // Fail-open: binary audio response should still work even if media cache write fails.
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(audioData.length));
    res.setHeader("Cache-Control", "no-store");
    if (mediaUrl) {
      res.setHeader("X-OpenClaw-Media-Url", mediaUrl);
    }
    if (result.provider) {
      res.setHeader("X-OpenClaw-Tts-Provider", result.provider);
    }
    if (result.outputFormat) {
      res.setHeader("X-OpenClaw-Tts-Format", result.outputFormat);
    }
    res.end(audioData);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: `TTS generation failed: ${err instanceof Error ? err.message : String(err)}`,
      }),
    );
  }

  return true;
}
