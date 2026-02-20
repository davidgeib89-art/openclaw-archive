#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MODEL = "meta-llama/llama-4-maverick:free";
const DEFAULT_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";
const LOCAL_VISION_STYLE = "Local heuristic analyzer (sharp)";
const DEFAULT_IMAGE_DIR = path.join(os.homedir(), ".openclaw", "workspace", "creations", "comfyui");
const DEFAULT_PROMPT =
  'Beschreibe dieses Bild in deutscher Sprache mit hoher Detailtiefe (Komposition, Farben, Licht, AtmosphÃ¤re, Symbolik, Stil). Gib NUR reines JSON (kein Markdown, keine Backticks) im Format {"description":"...","mood":"...","symbols":["..."],"style":"..."}. description: maximal 5 dichte SÃ¤tze. mood: 1 kurze Zeile. symbols: Liste mit bis zu 8 Symbolen. style: 1 kurze Zeile.';
const STATIC_FREE_VISION_FALLBACKS = [
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "google/gemma-3-27b-it:free",
  "google/gemma-3-12b-it:free",
  "google/gemma-3-4b-it:free",
];
const COMPOSITION_ZONE_LABELS = [
  "oben-links",
  "oben-mitte",
  "oben-rechts",
  "mitte-links",
  "mitte",
  "mitte-rechts",
  "unten-links",
  "unten-mitte",
  "unten-rechts",
];
const PROMPT_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "art",
  "bild",
  "create",
  "das",
  "den",
  "der",
  "die",
  "ein",
  "eine",
  "einer",
  "einem",
  "einen",
  "for",
  "generate",
  "image",
  "mit",
  "of",
  "oder",
  "the",
  "und",
  "von",
  "with",
]);

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = String(argv[i] ?? "");
    if (!token.startsWith("--")) {
      continue;
    }
    const eq = token.indexOf("=");
    if (eq !== -1) {
      args[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (typeof next === "string" && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function resolvePath(input) {
  if (!input) {
    return null;
  }
  const expanded = String(input)
    .trim()
    .replace(/^~(?=$|[\\/])/, os.homedir());
  return path.resolve(expanded);
}

function detectMimeType(filePath) {
  const lower = String(filePath || "").toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  return "image/png";
}

function resolveLatestImagePath(dirPath) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Image directory not found: ${dirPath}`);
  }
  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dirPath, entry.name))
    .filter((filePath) => /\.(png|jpg|jpeg|webp|gif)$/i.test(filePath))
    .map((filePath) => {
      const stat = fs.statSync(filePath);
      return { filePath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const latest = entries[0]?.filePath;
  if (!latest) {
    throw new Error(`No image files found in ${dirPath}`);
  }
  return latest;
}

function extractMessageContentText(messageContent) {
  if (typeof messageContent === "string") {
    return messageContent;
  }
  if (!Array.isArray(messageContent)) {
    return "";
  }
  const texts = [];
  for (const block of messageContent) {
    if (!block || typeof block !== "object") {
      continue;
    }
    if (block.type === "text" && typeof block.text === "string") {
      texts.push(block.text);
    }
  }
  return texts.join("\n").trim();
}

function extractJsonCandidate(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    // ignore and continue
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const slice = trimmed.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeVisionResult(parsed, fallbackText) {
  const fallback = String(fallbackText || "").trim();
  if (!parsed || typeof parsed !== "object") {
    return {
      description: fallback,
      mood: "",
      symbols: [],
      style: "",
      light_and_color: "",
    };
  }
  const record = parsed;
  const descriptionRaw = typeof record.description === "string" ? record.description.trim() : "";
  const moodRaw = typeof record.mood === "string" ? record.mood.trim() : "";
  const styleRaw = typeof record.style === "string" ? record.style.trim() : "";
  const lightAndColorRaw =
    typeof record.light_and_color === "string"
      ? record.light_and_color.trim()
      : typeof record.lightAndColor === "string"
        ? record.lightAndColor.trim()
        : "";
  const symbolsRaw = Array.isArray(record.symbols)
    ? record.symbols
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .slice(0, 20)
    : [];

  return {
    description: descriptionRaw || fallback,
    mood: moodRaw,
    symbols: symbolsRaw,
    style: styleRaw,
    light_and_color: lightAndColorRaw,
  };
}

function isFreeModelId(modelId) {
  return String(modelId || "")
    .trim()
    .toLowerCase()
    .endsWith(":free");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toHexColor(rgb) {
  const r = clamp(Math.round(Number(rgb?.r ?? 0)), 0, 255);
  const g = clamp(Math.round(Number(rgb?.g ?? 0)), 0, 255);
  const b = clamp(Math.round(Number(rgb?.b ?? 0)), 0, 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
    .toString(16)
    .padStart(2, "0")}`;
}

function toLuminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function extractPromptKeywords(prompt) {
  const tokens = String(prompt || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .split(/[\s-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !PROMPT_STOPWORDS.has(token));
  const unique = [];
  const seen = new Set();
  for (const token of tokens) {
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    unique.push(token);
    if (unique.length >= 12) {
      break;
    }
  }
  return unique;
}

function mergeUniqueSymbols(primary, secondary, maxItems) {
  const merged = [];
  const seen = new Set();
  for (const token of [...primary, ...secondary]) {
    const normalized = String(token || "")
      .trim()
      .toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    merged.push(normalized);
    if (merged.length >= maxItems) {
      break;
    }
  }
  return merged;
}

function computePaletteClusters(raw, channels, maxClusters = 3) {
  if (!raw || raw.length === 0 || channels < 3) {
    return [];
  }
  const buckets = new Map();
  for (let i = 0; i + 2 < raw.length; i += channels) {
    const r = raw[i];
    const g = raw[i + 1];
    const b = raw[i + 2];
    const key = `${Math.floor(r / 32)}-${Math.floor(g / 32)}-${Math.floor(b / 32)}`;
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  const total = raw.length / channels;
  return [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, maxClusters)
    .map((bucket) => ({
      hex: toHexColor({
        r: bucket.r / bucket.count,
        g: bucket.g / bucket.count,
        b: bucket.b / bucket.count,
      }),
      share: total > 0 ? bucket.count / total : 0,
    }));
}

function computeCompositionAndEdges(params) {
  const width = Number(params?.width ?? 0);
  const height = Number(params?.height ?? 0);
  const channels = Number(params?.channels ?? 0);
  const raw = params?.raw;
  if (!raw || width <= 1 || height <= 1 || channels < 3) {
    return {
      edgeDensity: 0,
      edgeLabel: "niedrig",
      brightestZone: "mitte",
      textureZone: "mitte",
    };
  }

  const zoneStats = Array.from({ length: 9 }, () => ({
    lumSum: 0,
    lumCount: 0,
    edgeHits: 0,
    edgeCount: 0,
  }));
  const zoneIndexFor = (x, y) => {
    const xBand = clamp(Math.floor((x / Math.max(1, width)) * 3), 0, 2);
    const yBand = clamp(Math.floor((y / Math.max(1, height)) * 3), 0, 2);
    return yBand * 3 + xBand;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * channels;
      const luminance = toLuminance(raw[idx], raw[idx + 1], raw[idx + 2]);
      const zoneIndex = zoneIndexFor(x, y);
      zoneStats[zoneIndex].lumSum += luminance;
      zoneStats[zoneIndex].lumCount += 1;
    }
  }

  let edgeHits = 0;
  let edgeCount = 0;
  const edgeThreshold = 44;
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const idx = (y * width + x) * channels;
      const rightIdx = (y * width + (x + 1)) * channels;
      const downIdx = ((y + 1) * width + x) * channels;
      const centerLum = toLuminance(raw[idx], raw[idx + 1], raw[idx + 2]);
      const rightLum = toLuminance(raw[rightIdx], raw[rightIdx + 1], raw[rightIdx + 2]);
      const downLum = toLuminance(raw[downIdx], raw[downIdx + 1], raw[downIdx + 2]);
      const gradient = Math.abs(centerLum - rightLum) + Math.abs(centerLum - downLum);
      const zoneIndex = zoneIndexFor(x, y);
      zoneStats[zoneIndex].edgeCount += 1;
      edgeCount += 1;
      if (gradient >= edgeThreshold) {
        zoneStats[zoneIndex].edgeHits += 1;
        edgeHits += 1;
      }
    }
  }

  const edgeDensity = edgeCount > 0 ? edgeHits / edgeCount : 0;
  const edgeLabel = edgeDensity < 0.08 ? "niedrig" : edgeDensity < 0.18 ? "moderat" : "hoch";
  const brightestZone = zoneStats
    .map((zone, index) => ({
      index,
      value: zone.lumCount > 0 ? zone.lumSum / zone.lumCount : 0,
    }))
    .sort((a, b) => b.value - a.value)[0]?.index;
  const textureZone = zoneStats
    .map((zone, index) => ({
      index,
      value: zone.edgeCount > 0 ? zone.edgeHits / zone.edgeCount : 0,
    }))
    .sort((a, b) => b.value - a.value)[0]?.index;

  return {
    edgeDensity,
    edgeLabel,
    brightestZone:
      COMPOSITION_ZONE_LABELS[
        clamp(Number(brightestZone ?? 4), 0, COMPOSITION_ZONE_LABELS.length - 1)
      ],
    textureZone:
      COMPOSITION_ZONE_LABELS[
        clamp(Number(textureZone ?? 4), 0, COMPOSITION_ZONE_LABELS.length - 1)
      ],
  };
}

function summarizePromptAlignment(params) {
  const promptKeywords = extractPromptKeywords(params.generationPrompt);
  if (promptKeywords.length === 0) {
    return {
      summary: "Promptabgleich: kein expliziter Generierungs-Prompt uebergeben.",
      promptKeywords: [],
      promptMatches: [],
    };
  }
  const symbols = Array.isArray(params.symbols) ? params.symbols : [];
  const matches = promptKeywords.filter((keyword) =>
    symbols.some((symbol) => symbol.includes(keyword) || keyword.includes(symbol)),
  );
  const ratio = matches.length / promptKeywords.length;
  const quality = ratio >= 0.45 ? "stark" : ratio >= 0.2 ? "teilweise" : "indirekt";
  const promptPreview = promptKeywords.slice(0, 6).join(", ");
  const matchPreview = matches.slice(0, 4).join(", ");
  const summary = matchPreview
    ? `Promptabgleich (${quality}): intent=[${promptPreview}], wiedergefunden=[${matchPreview}].`
    : `Promptabgleich (${quality}): intent=[${promptPreview}] nur indirekt ueber Farbe/Form erkennbar.`;
  return {
    summary,
    promptKeywords,
    promptMatches: matches,
  };
}

function extractSymbolsFromFilename(imagePath) {
  const base = path.basename(String(imagePath || ""), path.extname(String(imagePath || "")));
  const rawTokens = base
    .split(/[^a-zA-Z0-9]+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token) && !/\d/.test(token));
  const blocked = new Set(["comfyui", "output", "image", "flux", "png", "jpg", "jpeg", "webp"]);
  const symbols = [];
  for (const token of rawTokens) {
    if (blocked.has(token)) {
      continue;
    }
    if (symbols.includes(token)) {
      continue;
    }
    symbols.push(token);
    if (symbols.length >= 8) {
      break;
    }
  }
  return symbols;
}

async function describeImageLocally(imagePath, options = {}) {
  const filenameSymbols = extractSymbolsFromFilename(imagePath);
  const promptKeywords = extractPromptKeywords(options.generationPrompt || "");
  const symbols = mergeUniqueSymbols(filenameSymbols, promptKeywords, 8);
  try {
    const mod = await import("sharp");
    const sharp = mod.default ?? mod;
    const [metadata, stats, sample] = await Promise.all([
      sharp(imagePath, { failOnError: false }).metadata(),
      sharp(imagePath, { failOnError: false }).stats(),
      sharp(imagePath, { failOnError: false })
        .resize(96, 96, { fit: "inside", withoutEnlargement: true })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true }),
    ]);

    const width = Number(metadata?.width ?? 0);
    const height = Number(metadata?.height ?? 0);
    const orientation =
      width > height ? "Querformat" : width < height ? "Hochformat" : "quadratisches Format";

    const channels = Array.isArray(stats?.channels) ? stats.channels : [];
    const rgbChannels = channels.slice(0, 3);
    const means = rgbChannels.map((channel) => Number(channel?.mean ?? 0));
    const stdev = rgbChannels.map((channel) => Number(channel?.stdev ?? 0));
    const brightness = means.length
      ? means.reduce((sum, value) => sum + value, 0) / means.length
      : 0;
    const contrast = stdev.length ? stdev.reduce((sum, value) => sum + value, 0) / stdev.length : 0;
    const colorSpread = means.length ? Math.max(...means) - Math.min(...means) : 0;
    const dominantHex = toHexColor(stats?.dominant);
    const paletteClusters = computePaletteClusters(
      sample?.data,
      Number(sample?.info?.channels ?? 0),
      3,
    );
    const composition = computeCompositionAndEdges({
      raw: sample?.data,
      width: Number(sample?.info?.width ?? 0),
      height: Number(sample?.info?.height ?? 0),
      channels: Number(sample?.info?.channels ?? 0),
    });

    const brightnessMood =
      brightness < 70 ? "dunkel-introspektiv" : brightness > 180 ? "hell-offen" : "balanciert";
    const contrastMood = contrast > 55 ? "dynamisch" : contrast < 22 ? "ruhig" : "moderat";
    const colorMood = colorSpread > 45 ? "farbintensiv" : "monochrom-nah";
    const paletteText =
      paletteClusters.length > 0
        ? paletteClusters
            .map((cluster) => `${cluster.hex}(${Math.round(cluster.share * 100)}%)`)
            .join(", ")
        : "n/a";
    const promptAlignment = summarizePromptAlignment({
      generationPrompt: options.generationPrompt,
      symbols,
    });

    const description = [
      `Lokale Analyse: ${orientation} (${width}x${height}px), dominanter Farbton ${dominantHex}.`,
      `Palette-Cluster: ${paletteText}.`,
      `Helligkeit wirkt ${brightnessMood}, Kontrast ist ${contrastMood}, Farbverteilung erscheint ${colorMood}.`,
      `Komposition: hellster Bereich ${composition.brightestZone}, hoechste Textur ${composition.textureZone}, Kantenstruktur ${composition.edgeLabel}.`,
      promptAlignment.summary,
    ].join(" ");

    return {
      description,
      mood: `${brightnessMood}, ${contrastMood}, ${colorMood}, kanten-${composition.edgeLabel}`,
      symbols,
      style: `${LOCAL_VISION_STYLE}; dominant=${dominantHex}; contrast=${contrast.toFixed(1)}; edge=${composition.edgeDensity.toFixed(3)}; zones=${composition.brightestZone}/${composition.textureZone}`,
    };
  } catch {
    const stat = fs.statSync(imagePath);
    const description = `Lokale Analyse (Fallback ohne Vision-Backend): Datei ${path.basename(imagePath)} mit ${stat.size} Bytes. Inhalt konnte nur auf Dateiebene bewertet werden.`;
    const promptAlignment = summarizePromptAlignment({
      generationPrompt: options.generationPrompt,
      symbols,
    });
    return {
      description: `${description} ${promptAlignment.summary}`,
      mood: "unbestimmt, da nur Dateimetadaten verfÃ¼gbar",
      symbols,
      style: `${LOCAL_VISION_STYLE}; metadata-only`,
    };
  }
}

function supportsImageInput(model) {
  const modalities =
    model?.architecture?.input_modalities ?? model?.input_modalities ?? model?.input;
  if (!Array.isArray(modalities)) {
    return false;
  }
  return modalities.map((entry) => String(entry).toLowerCase()).includes("image");
}

function hasZeroTextPricing(model) {
  const prompt = String(model?.pricing?.prompt ?? "");
  const completion = String(model?.pricing?.completion ?? "");
  return prompt === "0" && completion === "0";
}

async function fetchDynamicFreeVisionModels(apiKey) {
  const response = await fetch(DEFAULT_MODELS_ENDPOINT, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to fetch models (${response.status}): ${text || "no body"}`);
  }
  const payload = await response.json();
  const items = Array.isArray(payload?.data) ? payload.data : [];
  return items
    .filter(
      (model) => isFreeModelId(model?.id) && supportsImageInput(model) && hasZeroTextPricing(model),
    )
    .map((model) => String(model.id).trim())
    .filter(Boolean);
}

async function resolveFreeVisionCandidates(params) {
  const primary = String(params.primaryModel || "").trim();
  const configuredFallbacks = String(params.fallbackModelsRaw || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const ordered = [];
  if (primary) {
    ordered.push(primary);
  }

  for (const model of configuredFallbacks) {
    ordered.push(model);
  }

  try {
    const dynamic = await fetchDynamicFreeVisionModels(params.apiKey);
    for (const model of dynamic) {
      ordered.push(model);
    }
  } catch {
    // fail-open on model index fetch; static list below keeps behavior safe.
  }

  for (const model of STATIC_FREE_VISION_FALLBACKS) {
    ordered.push(model);
  }

  const uniqueFree = [];
  for (const model of ordered) {
    if (!isFreeModelId(model)) {
      continue;
    }
    const normalized = model.toLowerCase();
    if (uniqueFree.some((entry) => entry.toLowerCase() === normalized)) {
      continue;
    }
    uniqueFree.push(model);
  }
  if (uniqueFree.length === 0) {
    throw new Error("No free vision model candidates available.");
  }
  return uniqueFree;
}

export async function describeImage(params) {
  const imagePath =
    resolvePath(params.imagePath || "") || resolveLatestImagePath(DEFAULT_IMAGE_DIR);
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }
  const prompt = String(params.prompt || DEFAULT_PROMPT).trim();
  const generationPrompt = String(params.generationPrompt || "").trim();

  const apiKey = String(params.apiKey || process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) {
    return await describeImageLocally(imagePath, { generationPrompt: generationPrompt || prompt });
  }

  const primaryModel = String(
    params.model || process.env.OPENROUTER_VISION_MODEL || DEFAULT_MODEL,
  ).trim();
  const modelCandidates = await resolveFreeVisionCandidates({
    primaryModel,
    fallbackModelsRaw: params.fallbackModels || process.env.OPENROUTER_VISION_FALLBACK_MODELS || "",
    apiKey,
  });

  const mimeType = detectMimeType(imagePath);
  const bytes = fs.readFileSync(imagePath);
  const dataUrl = `data:${mimeType};base64,${bytes.toString("base64")}`;

  let payload = null;
  let lastErrorMessage = "";
  for (const model of modelCandidates) {
    const response = await fetch(DEFAULT_OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "HTTP-Referer": "https://openclaw.ai",
        "X-Title": "OpenClaw",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: dataUrl,
                },
              },
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    const responseText = await response.text();
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      payload = null;
    }

    if (response.ok) {
      break;
    }

    lastErrorMessage = `OpenRouter vision request failed (${response.status}) for model=${model}: ${responseText || "no body"}`;
    const endpointNotFound =
      response.status === 404 && /No endpoints found/i.test(String(responseText));
    const modelUnavailable =
      response.status === 429 ||
      response.status >= 500 ||
      /model not found/i.test(String(responseText)) ||
      /temporarily unavailable/i.test(String(responseText));
    if (endpointNotFound || modelUnavailable) {
      payload = null;
      continue;
    }
    throw new Error(lastErrorMessage);
  }

  if (!payload) {
    return await describeImageLocally(imagePath, { generationPrompt: generationPrompt || prompt });
  }

  const rawMessage = payload?.choices?.[0]?.message?.content;
  const modelText = extractMessageContentText(rawMessage);
  if (!modelText) {
    throw new Error(`OpenRouter response missing content: ${JSON.stringify(payload)}`);
  }
  const parsed = extractJsonCandidate(modelText);
  const result = normalizeVisionResult(parsed, modelText);
  return result;
}

function printHelp() {
  process.stdout.write(
    [
      "Image describe skill (OpenRouter vision)",
      "",
      "Usage:",
      '  node skills/image-describe.js --image "C:/path/to/image.png"',
      "",
      "Options:",
      "  --image <path>   Optional image path. If omitted, uses latest image from ~/.openclaw/workspace/creations/comfyui",
      "  --model <id>     Vision model (default: meta-llama/llama-4-maverick:free)",
      "  --fallbackModels <csv> Optional extra free fallback models (comma-separated)",
      "  --prompt <text>  Optional custom analysis prompt",
      "  --help           Show this help",
      "",
      "Environment variables:",
      "  OPENROUTER_API_KEY, OPENROUTER_VISION_MODEL, OPENROUTER_VISION_FALLBACK_MODELS",
      "  (without OPENROUTER_API_KEY, local heuristic fallback is used)",
      "",
    ].join("\n"),
  );
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const result = await describeImage({
    imagePath: args.image,
    model: args.model,
    fallbackModels: args.fallbackModels,
    prompt: args.prompt,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const entryScript = process.argv[1] ? path.resolve(process.argv[1]) : "";
const currentFile = fileURLToPath(import.meta.url);
if (entryScript && currentFile === entryScript) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`image-describe failed: ${message}\n`);
    process.exitCode = 1;
  });
}
