#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeImage } from "./image-describe.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_COMFYUI_HOST = "127.0.0.1";
const DEFAULT_COMFYUI_PORT = 8188;
const DEFAULT_WORKFLOW_PATH = path.join(SCRIPT_DIR, "flux_workflow.json");
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_POLL_MS = 1_000;
const DEFAULT_VISION_MODEL = "meta-llama/llama-4-maverick:free";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = String(argv[i] ?? "");
    if (!token.startsWith("--")) {
      continue;
    }
    const eq = token.indexOf("=");
    if (eq !== -1) {
      const key = token.slice(2, eq);
      const value = token.slice(eq + 1);
      args[key] = value;
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

function toNumber(value, fallback) {
  if (value == null) {
    return fallback;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toBoolean(value, fallback) {
  if (value == null) {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
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

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeForFileName(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeNaturalPrompt(rawPrompt) {
  const trimmed = String(rawPrompt || "").trim();
  if (!trimmed) {
    return trimmed;
  }

  const patterns = [
    /^(?:bitte\s+)?(?:generiere|erstelle|mach)\s+(?:mir\s+)?(?:ein|eine)?\s*(?:bild|image|foto|cover)?\s*(?:von|mit)?\s+(.+)$/i,
    /^(?:bitte\s+)?zeichne\s+(?:mir\s+)?(?:ein|eine)?\s*(?:bild|szene|cover)?\s*(?:von|mit)?\s+(.+)$/i,
    /^(?:please\s+)?(?:generate|create|draw)\s+(?:an?|the)?\s*(?:image|picture|artwork|cover)?\s*(?:of|with)?\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate) {
      return candidate;
    }
  }
  return trimmed;
}

function resolveComfyBaseUrl(args) {
  const explicitBase = String(args.baseUrl || process.env.COMFYUI_BASE_URL || "").trim();
  if (explicitBase) {
    return explicitBase.replace(/\/+$/, "");
  }

  const hostRaw = String(args.host || process.env.COMFYUI_HOST || DEFAULT_COMFYUI_HOST).trim();
  const port = Math.max(
    1,
    Math.floor(toNumber(args.port ?? process.env.COMFYUI_PORT, DEFAULT_COMFYUI_PORT)),
  );

  if (/^https?:\/\//i.test(hostRaw)) {
    const parsed = new URL(hostRaw);
    if (!parsed.port) {
      parsed.port = String(port);
    }
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port}`.replace(/\/+$/, "");
  }

  return `http://${hostRaw}:${port}`;
}

function getMimeTypeFromFileName(fileName) {
  const lower = String(fileName || "").toLowerCase();
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

function createDefaultWorkflow(params) {
  const seed = Number.isFinite(params.seed)
    ? Math.floor(params.seed)
    : Math.floor(Math.random() * 2_147_483_647);
  return {
    3: {
      inputs: {
        seed,
        steps: params.steps,
        cfg: params.cfgScale,
        sampler_name: params.samplerName,
        scheduler: params.scheduler,
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
      class_type: "KSampler",
    },
    4: {
      inputs: {
        ckpt_name: params.checkpoint,
      },
      class_type: "CheckpointLoaderSimple",
    },
    5: {
      inputs: {
        width: params.width,
        height: params.height,
        batch_size: params.batchSize,
      },
      class_type: "EmptyLatentImage",
    },
    6: {
      inputs: {
        text: "{{prompt}}",
        clip: ["4", 1],
      },
      class_type: "CLIPTextEncode",
    },
    7: {
      inputs: {
        text: "{{negative_prompt}}",
        clip: ["4", 1],
      },
      class_type: "CLIPTextEncode",
    },
    8: {
      inputs: {
        samples: ["3", 0],
        vae: ["4", 2],
      },
      class_type: "VAEDecode",
    },
    9: {
      inputs: {
        filename_prefix: params.filenamePrefix,
        images: ["8", 0],
      },
      class_type: "SaveImage",
    },
  };
}

function replacePromptPlaceholdersInText(text, prompt, negativePrompt) {
  const promptTokens = ["{{prompt}}", "{prompt}", "$PROMPT", "__PROMPT__", "[[PROMPT]]"];
  const negativeTokens = [
    "{{negative_prompt}}",
    "{negative_prompt}",
    "$NEGATIVE_PROMPT",
    "__NEGATIVE_PROMPT__",
    "[[NEGATIVE_PROMPT]]",
  ];
  let out = String(text);
  for (const token of promptTokens) {
    out = out.split(token).join(prompt);
  }
  for (const token of negativeTokens) {
    out = out.split(token).join(negativePrompt || "");
  }
  return out;
}

function deepReplacePromptPlaceholders(value, prompt, negativePrompt) {
  if (typeof value === "string") {
    return replacePromptPlaceholdersInText(value, prompt, negativePrompt);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => deepReplacePromptPlaceholders(entry, prompt, negativePrompt));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = deepReplacePromptPlaceholders(entry, prompt, negativePrompt);
    }
    return out;
  }
  return value;
}

function looksNegativeNode(node, textValue) {
  const classType = String(node?.class_type || "").toLowerCase();
  const title = String(node?._meta?.title || node?.title || "").toLowerCase();
  const text = String(textValue || "").toLowerCase();
  if (!classType.includes("cliptextencode")) {
    return false;
  }
  return title.includes("negative") || text.includes("negative");
}

function normalizeWorkflowPayload(raw) {
  if (raw && typeof raw === "object" && raw.prompt && typeof raw.prompt === "object") {
    return {
      payload: { ...raw },
      graph: raw.prompt,
      wrapped: true,
    };
  }
  return {
    payload: { prompt: raw },
    graph: raw,
    wrapped: false,
  };
}

function injectPromptIntoWorkflow(rawWorkflow, params) {
  const prompt = String(params.prompt || "").trim();
  const negativePrompt = String(params.negativePrompt || "").trim();
  const explicitPromptNodeId = params.promptNodeId ? String(params.promptNodeId) : null;
  const explicitNegativeNodeId = params.negativeNodeId ? String(params.negativeNodeId) : null;
  const seed = Number.isFinite(params.seed) ? Math.floor(params.seed) : null;
  const workflowCloned = deepReplacePromptPlaceholders(rawWorkflow, prompt, negativePrompt);
  const normalized = normalizeWorkflowPayload(workflowCloned);
  const graph = normalized.graph;

  if (!graph || typeof graph !== "object") {
    throw new Error("Workflow must be a JSON object.");
  }

  const nodeEntries = Object.entries(graph).filter(([, node]) => node && typeof node === "object");
  const clipNodes = [];
  for (const [nodeId, node] of nodeEntries) {
    const classType = String(node.class_type || "");
    const hasTextInput = node.inputs && typeof node.inputs === "object" && "text" in node.inputs;
    if (classType.toLowerCase().includes("cliptextencode") && hasTextInput) {
      clipNodes.push({ nodeId, node });
    }
  }

  let promptSet = false;
  let negativeSet = false;

  if (explicitPromptNodeId && graph[explicitPromptNodeId]?.inputs) {
    graph[explicitPromptNodeId].inputs.text = prompt;
    promptSet = true;
  }
  if (explicitNegativeNodeId && graph[explicitNegativeNodeId]?.inputs) {
    graph[explicitNegativeNodeId].inputs.text = negativePrompt;
    negativeSet = true;
  }

  if (!promptSet && clipNodes.length > 0) {
    const positiveCandidate = clipNodes.find(
      ({ node }) => !looksNegativeNode(node, node?.inputs?.text),
    );
    const target = positiveCandidate || clipNodes[0];
    target.node.inputs.text = prompt;
    promptSet = true;
  }

  if (!negativeSet && negativePrompt && clipNodes.length > 0) {
    const negativeCandidate = clipNodes.find(({ node }) =>
      looksNegativeNode(node, node?.inputs?.text),
    );
    if (negativeCandidate) {
      negativeCandidate.node.inputs.text = negativePrompt;
      negativeSet = true;
    } else if (clipNodes.length > 1) {
      clipNodes[1].node.inputs.text = negativePrompt;
      negativeSet = true;
    }
  }

  if (seed !== null) {
    for (const [, node] of nodeEntries) {
      if (!node?.inputs || typeof node.inputs !== "object") {
        continue;
      }
      if ("seed" in node.inputs) {
        node.inputs.seed = seed;
      }
      if ("noise_seed" in node.inputs) {
        node.inputs.noise_seed = seed;
      }
    }
  }

  if (!promptSet) {
    throw new Error(
      "Could not inject prompt into workflow. Add a CLIPTextEncode node or pass --promptNodeId.",
    );
  }

  return normalized.payload;
}

function buildViewUrl(baseUrl, imageRef) {
  const query = new URLSearchParams({
    filename: String(imageRef.filename || ""),
    subfolder: String(imageRef.subfolder || ""),
    type: String(imageRef.type || "output"),
  });
  return `${baseUrl}/view?${query.toString()}`;
}

function collectImagesFromHistoryEntry(entry) {
  const outputs = entry?.outputs;
  if (!outputs || typeof outputs !== "object") {
    return [];
  }
  const images = [];
  for (const [nodeId, output] of Object.entries(outputs)) {
    if (!output || typeof output !== "object") {
      continue;
    }
    if (!Array.isArray(output.images)) {
      continue;
    }
    for (const image of output.images) {
      if (!image || typeof image !== "object") {
        continue;
      }
      if (typeof image.filename !== "string" || !image.filename.trim()) {
        continue;
      }
      images.push({
        nodeId,
        filename: image.filename,
        subfolder: typeof image.subfolder === "string" ? image.subfolder : "",
        type: typeof image.type === "string" ? image.type : "output",
      });
    }
  }
  return images;
}

async function httpJson(url, init) {
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not reach ComfyUI endpoint ${url}: ${message}`);
  }
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  return { ok: response.ok, status: response.status, text, payload };
}

async function submitPrompt(baseUrl, payload) {
  const result = await httpJson(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!result.ok) {
    throw new Error(`ComfyUI /prompt failed (${result.status}): ${result.text || "no body"}`);
  }
  const promptId = result.payload?.prompt_id;
  if (!promptId) {
    throw new Error(`ComfyUI /prompt returned no prompt_id: ${JSON.stringify(result.payload)}`);
  }
  return String(promptId);
}

async function submitPromptWithFallback(params) {
  const candidates = params.baseUrls;
  const errors = [];
  for (const baseUrl of candidates) {
    try {
      const promptId = await submitPrompt(baseUrl, params.payload);
      return { baseUrl, promptId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ baseUrl, message });
      const unreachable = message.includes("Could not reach ComfyUI endpoint");
      if (!unreachable) {
        throw error;
      }
    }
  }
  const details = errors.map((entry) => `${entry.baseUrl}: ${entry.message}`).join(" | ");
  throw new Error(`Could not reach ComfyUI on any candidate endpoint. ${details}`);
}

async function waitForHistoryEntry(baseUrl, promptId, timeoutMs, pollMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await httpJson(`${baseUrl}/history/${encodeURIComponent(promptId)}`, {
      method: "GET",
    });
    if (result.ok && result.payload && typeof result.payload === "object") {
      const entry = result.payload[promptId] || result.payload[String(promptId)];
      if (entry && typeof entry === "object") {
        const images = collectImagesFromHistoryEntry(entry);
        if (images.length > 0) {
          return { entry, images };
        }
      }
    }
    await sleep(pollMs);
  }
  throw new Error(`ComfyUI generation timed out after ${timeoutMs}ms for prompt_id=${promptId}`);
}

async function fetchImage(baseUrl, imageRef) {
  const viewUrl = buildViewUrl(baseUrl, imageRef);
  const response = await fetch(viewUrl, { method: "GET" });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`ComfyUI /view failed (${response.status}): ${text || "no body"}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return { viewUrl, bytes };
}

function persistReflectionArtifact(params) {
  try {
    const reflectionsDir = path.join(params.outputDir, "reflections");
    fs.mkdirSync(reflectionsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safePromptId = sanitizeForFileName(params.promptId || "prompt");
    const filePath = path.join(reflectionsDir, `${stamp}_${safePromptId}_reflection.json`);
    const payload = {
      ts: new Date().toISOString(),
      promptId: params.promptId,
      prompt: params.prompt,
      image: {
        localPath: params.localPath,
        viewUrl: params.viewUrl,
      },
      ...(params.reflection ? { reflection: params.reflection } : {}),
      ...(params.reflectionError ? { reflectionError: params.reflectionError } : {}),
    };
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return filePath;
  } catch {
    return null;
  }
}

function printHelp() {
  process.stdout.write(
    [
      "ComfyUI image generator for OpenClaw skills",
      "",
      "Usage:",
      '  node skills/comfyui-image.js --prompt "your prompt" [options]',
      "",
      "Options:",
      "  --prompt <text>              Required positive prompt",
      "  --negative <text>            Optional negative prompt",
      "  --workflow <path>            Workflow JSON file (default: skills/flux_workflow.json)",
      "  --promptNodeId <id>          Optional workflow node id for positive prompt text",
      "  --negativeNodeId <id>        Optional workflow node id for negative prompt text",
      "  --baseUrl <url>              ComfyUI base URL (overrides host/port)",
      "  --host <host>                ComfyUI host (default: 127.0.0.1)",
      "  --port <port>                ComfyUI port (default: 8188)",
      "  --timeoutMs <ms>             Poll timeout (default: 180000)",
      "  --pollMs <ms>                Poll interval (default: 1000)",
      "  --return <json|path|base64>  Output mode (default: json)",
      "  --save <true|false>          Save image locally (default: true)",
      "  --describe <true|false>      Auto-run image-describe after generation (default: true)",
      "  --visionModel <id>           Vision model for reflection loop",
      "  --visionFallbackModels <csv> Extra free fallback vision models",
      "  --describePrompt <text>      Custom prompt for image-describe",
      "  --outDir <path>              Local save dir (default: ~/.openclaw/workspace/creations/comfyui)",
      "  --seed <int>                 Optional deterministic seed",
      "  --checkpoint <name>          Fallback workflow checkpoint if no --workflow",
      "  --width <int>                Fallback workflow width (default: 1024)",
      "  --height <int>               Fallback workflow height (default: 1024)",
      "  --steps <int>                Fallback workflow steps (default: 30)",
      "  --cfgScale <num>             Fallback workflow CFG scale (default: 7)",
      "  --sampler <name>             Fallback workflow sampler (default: euler)",
      "  --scheduler <name>           Fallback workflow scheduler (default: normal)",
      "  --batchSize <int>            Fallback workflow batch size (default: 1)",
      "  --help                       Show this help",
      "",
      "Environment variables:",
      "  COMFYUI_BASE_URL, COMFYUI_HOST, COMFYUI_PORT, COMFYUI_WORKFLOW_PATH, COMFYUI_OUTPUT_DIR, COMFYUI_CHECKPOINT",
      "  COMFYUI_AUTO_DESCRIBE, OPENROUTER_VISION_MODEL, OPENROUTER_VISION_FALLBACK_MODELS, OPENROUTER_VISION_PROMPT, OPENROUTER_API_KEY",
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

  const prompt = normalizeNaturalPrompt(args.prompt);
  if (!prompt) {
    throw new Error("Missing required --prompt.");
  }
  const negativePrompt = String(args.negative || "").trim();

  const baseUrl = resolveComfyBaseUrl(args);
  const fallbackBaseUrls = [baseUrl];
  if (baseUrl === "http://127.0.0.1:8188") {
    fallbackBaseUrls.push("http://127.0.0.1:8000");
  } else if (baseUrl === "http://127.0.0.1:8000") {
    fallbackBaseUrls.push("http://127.0.0.1:8188");
  }
  const workflowPath = resolvePath(
    args.workflow || process.env.COMFYUI_WORKFLOW_PATH || DEFAULT_WORKFLOW_PATH,
  );

  const timeoutMs = Math.max(5_000, toNumber(args.timeoutMs, DEFAULT_TIMEOUT_MS));
  const pollMs = Math.max(250, toNumber(args.pollMs, DEFAULT_POLL_MS));
  const returnMode = String(args.return || "json")
    .trim()
    .toLowerCase();
  const shouldSave = toBoolean(args.save, true);
  const autoDescribe = toBoolean(args.describe ?? process.env.COMFYUI_AUTO_DESCRIBE, true);
  const visionModel = String(
    args.visionModel || process.env.OPENROUTER_VISION_MODEL || DEFAULT_VISION_MODEL,
  ).trim();
  const visionFallbackModels = String(
    args.visionFallbackModels || process.env.OPENROUTER_VISION_FALLBACK_MODELS || "",
  ).trim();
  const describePrompt = String(
    args.describePrompt || process.env.OPENROUTER_VISION_PROMPT || "",
  ).trim();
  const outputDir =
    resolvePath(args.outDir || process.env.COMFYUI_OUTPUT_DIR) ||
    path.join(os.homedir(), ".openclaw", "workspace", "creations", "comfyui");

  const fallbackCheckpoint = String(args.checkpoint || process.env.COMFYUI_CHECKPOINT || "").trim();
  const fallbackParams = {
    checkpoint: fallbackCheckpoint,
    width: Math.max(64, Math.floor(toNumber(args.width, 1024))),
    height: Math.max(64, Math.floor(toNumber(args.height, 1024))),
    steps: Math.max(1, Math.floor(toNumber(args.steps, 30))),
    cfgScale: Math.max(0.1, toNumber(args.cfgScale, 7)),
    samplerName: String(args.sampler || "euler"),
    scheduler: String(args.scheduler || "normal"),
    batchSize: Math.max(1, Math.floor(toNumber(args.batchSize, 1))),
    filenamePrefix:
      sanitizeForFileName(String(args.filenamePrefix || "om_comfyui")) || "om_comfyui",
    seed: args.seed != null ? Math.floor(toNumber(args.seed, NaN)) : NaN,
  };

  const workflowConfiguredExplicitly = Boolean(args.workflow || process.env.COMFYUI_WORKFLOW_PATH);
  const workflowFileExists = Boolean(workflowPath && fs.existsSync(workflowPath));

  let workflowRaw;
  if (workflowFileExists && workflowPath) {
    workflowRaw = readJsonFile(workflowPath);
  } else {
    if (workflowConfiguredExplicitly && workflowPath) {
      throw new Error(`Workflow file not found: ${workflowPath}`);
    }
    if (!fallbackCheckpoint) {
      throw new Error(
        `No workflow provided. Expected default workflow at ${DEFAULT_WORKFLOW_PATH}. Set --workflow (or COMFYUI_WORKFLOW_PATH), or set --checkpoint (or COMFYUI_CHECKPOINT) for fallback workflow mode.`,
      );
    }
    workflowRaw = createDefaultWorkflow(fallbackParams);
  }

  const payload = injectPromptIntoWorkflow(workflowRaw, {
    prompt,
    negativePrompt,
    promptNodeId: args.promptNodeId,
    negativeNodeId: args.negativeNodeId,
    seed: Number.isFinite(fallbackParams.seed) ? fallbackParams.seed : null,
  });

  const submitted = await submitPromptWithFallback({
    baseUrls: fallbackBaseUrls,
    payload,
  });
  const effectiveBaseUrl = submitted.baseUrl;
  const promptId = submitted.promptId;
  const { images } = await waitForHistoryEntry(effectiveBaseUrl, promptId, timeoutMs, pollMs);
  const firstImage = images[0];
  if (!firstImage) {
    throw new Error(`ComfyUI completed prompt_id=${promptId}, but no image outputs were found.`);
  }

  const fetched = await fetchImage(effectiveBaseUrl, firstImage);
  const mimeType = getMimeTypeFromFileName(firstImage.filename);

  let localPath = null;
  if (shouldSave) {
    fs.mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeBase = sanitizeForFileName(path.basename(firstImage.filename)) || "image.png";
    const outName = `${stamp}_${safeBase}`;
    localPath = path.join(outputDir, outName);
    fs.writeFileSync(localPath, fetched.bytes);
  }

  let reflection = null;
  let reflectionError = null;
  if (autoDescribe) {
    if (!localPath) {
      reflectionError = "Auto describe skipped: no local image path available (save=false).";
    } else {
      try {
        reflection = await describeImage({
          imagePath: localPath,
          model: visionModel || DEFAULT_VISION_MODEL,
          generationPrompt: prompt,
          ...(visionFallbackModels ? { fallbackModels: visionFallbackModels } : {}),
          ...(describePrompt ? { prompt: describePrompt } : {}),
        });
      } catch (error) {
        reflectionError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  const reflectionArtifactPath =
    autoDescribe && (reflection || reflectionError)
      ? persistReflectionArtifact({
          outputDir,
          promptId,
          prompt,
          localPath,
          viewUrl: fetched.viewUrl,
          reflection,
          reflectionError,
        })
      : null;

  const result = {
    ok: true,
    baseUrl: effectiveBaseUrl,
    promptId,
    prompt,
    image: {
      filename: firstImage.filename,
      subfolder: firstImage.subfolder,
      type: firstImage.type,
      viewUrl: fetched.viewUrl,
      localPath,
      mimeType,
      bytes: fetched.bytes.length,
    },
    ...(reflection ? { reflection } : {}),
    ...(reflectionError ? { reflectionError } : {}),
    ...(reflectionArtifactPath ? { reflectionArtifactPath } : {}),
  };

  if (returnMode === "path") {
    process.stdout.write(`${localPath || fetched.viewUrl}\n`);
    return;
  }
  if (returnMode === "base64") {
    const dataUrl = `data:${mimeType};base64,${fetched.bytes.toString("base64")}`;
    process.stdout.write(`${dataUrl}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`comfyui-image failed: ${message}\n`);
  process.exit(1);
});
