import { Type } from "@sinclair/typebox";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnyAgentTool } from "./common.js";
import { readNumberParam, readStringParam } from "./common.js";

const DEFAULT_COMFY_TIMEOUT_MS = 180_000;
const DEFAULT_COMFY_POLL_MS = 1_000;
const DEFAULT_PROCESS_GRACE_MS = 30_000;
const DEFAULT_VISION_MODEL = "google/gemma-3-27b-it:free";
const DEFAULT_OUTPUT_ROOT = path.join(os.homedir(), ".openclaw", "workspace");
const DEFAULT_OUTPUT_DIR = path.join(DEFAULT_OUTPUT_ROOT, "creations", "comfyui");
const DEFAULT_VISION_PROMPT = [
  "Beschreibe dieses Bild nur als Wahrnehmung, nicht als Interpretation.",
  "Gib NUR JSON zurueck (keine Markdown-Fences) mit den Feldern:",
  '{"description":"...","mood":"...","light_and_color":"...","symbols":["..."],"style":"..."}',
  "description: poetisch-konkrete Beobachtung in 3-5 dichten Saetzen.",
  "mood: eine kurze atmosphaerische Zeile.",
  "light_and_color: eine kurze Zeile ueber Lichtfuehrung und Farbfluss.",
  "symbols: bis zu 8 sichtbare Motive, keine Deutung.",
  "style: eine kurze stilistische Beobachtung.",
].join(" ");

export const DEFERRED_REFLECTION_TEXT =
  "Dein Traum wurde in die Welt gesetzt, aber dein inneres Auge ist gerade zu ersch\u00f6pft, um ihn klar zu sehen. Das Bild existiert sicher. Du kannst sp\u00e4ter versuchen, es zu betrachten, wenn der Nebel sich lichtet.";

const FALLBACK_NARRATIVE_TEXT =
  "Der Traum konnte nicht klar wahrgenommen werden. Atme kurz und versuche einen neuen Impuls.";

type DreamAndPerceiveReflection = {
  description: string;
  mood: string;
  style: string;
  symbols: string[];
  lightAndColor?: string;
};

type DreamAndPerceiveScriptResult = {
  ok?: boolean;
  baseUrl?: string;
  promptId?: string;
  image?: {
    localPath?: string | null;
    viewUrl?: string;
    filename?: string;
    bytes?: number;
    mimeType?: string;
  };
  reflection?: unknown;
  reflectionError?: string;
};

export type DreamAndPerceiveRunnerInput = {
  prompt: string;
  negativePrompt?: string;
  baseUrl?: string;
  workflow?: string;
  outDir: string;
  timeoutMs: number;
  pollMs: number;
  reflect: boolean;
  visionModel?: string;
  visionFallbackModels?: string[];
  visionPrompt?: string;
  checkpoint?: string;
};

type DreamAndPerceiveRunnerResult = {
  result: DreamAndPerceiveScriptResult;
  scriptPath: string;
  args: string[];
  rawStdout: string;
  rawStderr: string;
};

export type DreamAndPerceiveRunner = (
  input: DreamAndPerceiveRunnerInput,
) => Promise<DreamAndPerceiveRunnerResult>;

function readBooleanParam(
  params: Record<string, unknown>,
  key: string,
  defaultValue: boolean,
): boolean {
  const raw = params[key];
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return defaultValue;
}

function normalizePathToken(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const target = normalizePathToken(targetPath);
  const root = normalizePathToken(rootPath);
  return target === root || target.startsWith(`${root}/`);
}

function resolveAllowedOutputRoots(options?: {
  workspaceDir?: string;
  sandboxRoot?: string;
}): string[] {
  const roots = [DEFAULT_OUTPUT_ROOT, options?.workspaceDir, options?.sandboxRoot]
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => path.resolve(entry));
  return [...new Set(roots)];
}

function resolveSafeOutputDir(
  requestedOutputDir: string | undefined,
  options?: {
    workspaceDir?: string;
    sandboxRoot?: string;
  },
): string {
  const resolved = requestedOutputDir ? path.resolve(requestedOutputDir) : DEFAULT_OUTPUT_DIR;
  const allowedRoots = resolveAllowedOutputRoots(options);
  if (allowedRoots.some((root) => isPathInsideRoot(resolved, root))) {
    return resolved;
  }

  const rootsPreview = allowedRoots.join(", ");
  throw new Error(
    `outDir must stay inside workspace roots. Requested=${resolved}. Allowed roots=${rootsPreview}`,
  );
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("comfyui-image returned empty output.");
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("comfyui-image output did not contain JSON.");
    }
    const candidate = trimmed.slice(start, end + 1);
    return JSON.parse(candidate) as unknown;
  }
}

function toStringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toStringArray(value: unknown, maxItems = 8): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const unique: string[] = [];
  for (const item of value) {
    const text = String(item ?? "").trim();
    if (!text) continue;
    if (unique.includes(text)) continue;
    unique.push(text);
    if (unique.length >= maxItems) break;
  }
  return unique;
}

function normalizeReflection(raw: unknown): DreamAndPerceiveReflection | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const description = toStringOrEmpty(record.description);
  if (!description) {
    return null;
  }

  const mood = toStringOrEmpty(record.mood) || "offene";
  const style = toStringOrEmpty(record.style);
  const symbols = toStringArray(record.symbols);
  const lightAndColor =
    toStringOrEmpty(record.light_and_color) || toStringOrEmpty(record.lightAndColor);

  return {
    description,
    mood,
    style,
    symbols,
    ...(lightAndColor ? { lightAndColor } : {}),
  };
}

function ensureSentenceEnding(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (/[.!?]$/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}.`;
}

function deriveLightAndColor(reflection: DreamAndPerceiveReflection): string {
  const direct = toStringOrEmpty(reflection.lightAndColor);
  if (direct) {
    return direct;
  }

  const sentences = reflection.description
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  for (const sentence of sentences) {
    if (/(licht|farbe|farben|palette|schatten|glow|neon)/i.test(sentence)) {
      return sentence;
    }
  }

  const style = toStringOrEmpty(reflection.style);
  if (style && !/local heuristic/i.test(style)) {
    return style;
  }

  return "in sanften Schichten zwischen Schatten und Leuchten";
}

function symbolsToNarrative(symbols: string[]): string {
  if (symbols.length === 0) {
    return "keine festen Symbole, eher ein fliessender Eindruck";
  }
  return symbols.join(", ");
}

function buildPerceptionNarrative(reflection: DreamAndPerceiveReflection): string {
  const description = ensureSentenceEnding(reflection.description);
  const mood = toStringOrEmpty(reflection.mood) || "offene";
  const lightAndColor = deriveLightAndColor(reflection);
  const symbols = symbolsToNarrative(reflection.symbols);
  return [
    `Dein Traum hat sich manifestiert. Du oeffnest die Augen und siehst: ${description}`,
    `Das Licht faellt ${lightAndColor}, und die gesamte Szene atmet eine ${mood} Textur.`,
    `Folgende Symbole sind in die Welt getreten: ${symbols}.`,
  ].join(" ");
}

function resolveComfyImageScriptPath(): string {
  const fromModule = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "skills",
    "comfyui-image.js",
  );
  const fromCwd = path.resolve(process.cwd(), "skills", "comfyui-image.js");
  const candidates = [fromModule, fromCwd];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error("comfyui-image script not found. Expected skills/comfyui-image.js.");
}

function buildScriptArgs(input: DreamAndPerceiveRunnerInput): string[] {
  const args: string[] = [
    "--prompt",
    input.prompt,
    "--return",
    "json",
    "--save",
    "true",
    "--describe",
    input.reflect ? "true" : "false",
    "--outDir",
    input.outDir,
    "--timeoutMs",
    String(Math.max(5_000, Math.round(input.timeoutMs))),
    "--pollMs",
    String(Math.max(250, Math.round(input.pollMs))),
  ];

  if (input.negativePrompt) {
    args.push("--negative", input.negativePrompt);
  }
  if (input.baseUrl) {
    args.push("--baseUrl", input.baseUrl);
  }
  if (input.workflow) {
    args.push("--workflow", input.workflow);
  }
  if (input.checkpoint) {
    args.push("--checkpoint", input.checkpoint);
  }
  if (input.visionModel) {
    args.push("--visionModel", input.visionModel);
  }
  if (input.visionPrompt) {
    args.push("--describePrompt", input.visionPrompt);
  }
  if (input.visionFallbackModels && input.visionFallbackModels.length > 0) {
    args.push("--visionFallbackModels", input.visionFallbackModels.join(","));
  }
  return args;
}

async function runNodeScript(params: {
  scriptPath: string;
  args: string[];
  timeoutMs: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [params.scriptPath, ...params.args], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: { stdout: string; stderr: string; exitCode: number | null }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      fail(error);
    });
    child.on("close", (exitCode) => {
      finish({ stdout, stderr, exitCode });
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      fail(new Error(`comfyui-image timed out after ${params.timeoutMs}ms`));
    }, params.timeoutMs);
  });
}

async function runDreamAndPerceiveScript(
  input: DreamAndPerceiveRunnerInput,
): Promise<DreamAndPerceiveRunnerResult> {
  const scriptPath = resolveComfyImageScriptPath();
  const args = buildScriptArgs(input);
  const processTimeoutMs = Math.max(input.timeoutMs + DEFAULT_PROCESS_GRACE_MS, 30_000);
  const processResult = await runNodeScript({
    scriptPath,
    args,
    timeoutMs: processTimeoutMs,
  });

  if (processResult.exitCode !== 0) {
    const stderr = processResult.stderr.trim();
    const stdout = processResult.stdout.trim();
    const detail = stderr || stdout || `exitCode=${String(processResult.exitCode)}`;
    throw new Error(`comfyui-image failed: ${detail}`);
  }

  const parsed = extractJsonObject(processResult.stdout) as DreamAndPerceiveScriptResult;
  return {
    result: parsed,
    scriptPath,
    args,
    rawStdout: processResult.stdout,
    rawStderr: processResult.stderr,
  };
}

const DreamAndPerceiveToolSchema = Type.Object({
  prompt: Type.String({ description: "Creative image intention to manifest with ComfyUI." }),
  negativePrompt: Type.Optional(Type.String({ description: "Optional negative prompt." })),
  baseUrl: Type.Optional(Type.String({ description: "Optional ComfyUI base URL override." })),
  workflow: Type.Optional(Type.String({ description: "Optional ComfyUI workflow JSON path." })),
  outDir: Type.Optional(
    Type.String({ description: "Optional output directory for generated images." }),
  ),
  timeoutMs: Type.Optional(Type.Number({ description: "ComfyUI wait timeout in milliseconds." })),
  pollMs: Type.Optional(Type.Number({ description: "ComfyUI poll interval in milliseconds." })),
  reflect: Type.Optional(
    Type.Boolean({
      description: "If true, automatically run vision reflection after generation.",
    }),
  ),
  visionModel: Type.Optional(Type.String({ description: "Optional vision model override." })),
  visionFallbackModels: Type.Optional(
    Type.Array(Type.String({ description: "Optional fallback vision model." })),
  ),
  visionPrompt: Type.Optional(
    Type.String({ description: "Optional custom prompt for the vision reflection step." }),
  ),
  checkpoint: Type.Optional(
    Type.String({
      description: "Optional fallback ComfyUI checkpoint when no workflow is provided.",
    }),
  ),
});

export function createDreamAndPerceiveTool(options?: {
  workspaceDir?: string;
  sandboxRoot?: string;
  runner?: DreamAndPerceiveRunner;
}): AnyAgentTool {
  const runner = options?.runner ?? runDreamAndPerceiveScript;
  return {
    label: "Dream",
    name: "dream_and_perceive",
    description:
      "Manifest an image with ComfyUI, then perceive it in the same tool call. Returns sensory text for PLAY/DRIFT loops.",
    parameters: DreamAndPerceiveToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const prompt = readStringParam(params, "prompt", { required: true });
      const negativePrompt = readStringParam(params, "negativePrompt");
      const baseUrl = readStringParam(params, "baseUrl");
      const workflow = readStringParam(params, "workflow");
      const requestedOutDir = readStringParam(params, "outDir");
      const timeoutMs = readNumberParam(params, "timeoutMs") ?? DEFAULT_COMFY_TIMEOUT_MS;
      const pollMs = readNumberParam(params, "pollMs") ?? DEFAULT_COMFY_POLL_MS;
      const reflect = readBooleanParam(params, "reflect", true);
      const visionModel = readStringParam(params, "visionModel") || DEFAULT_VISION_MODEL;
      const visionPrompt = readStringParam(params, "visionPrompt") || DEFAULT_VISION_PROMPT;
      const checkpoint = readStringParam(params, "checkpoint");
      const visionFallbackModelsRaw = params.visionFallbackModels;
      const visionFallbackModels = Array.isArray(visionFallbackModelsRaw)
        ? visionFallbackModelsRaw
            .map((entry) => String(entry).trim())
            .filter((entry) => entry.length > 0)
        : typeof visionFallbackModelsRaw === "string"
          ? visionFallbackModelsRaw
              .split(",")
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0)
          : undefined;
      const outDir = resolveSafeOutputDir(requestedOutDir, {
        workspaceDir: options?.workspaceDir,
        sandboxRoot: options?.sandboxRoot,
      });

      try {
        const runResult = await runner({
          prompt,
          ...(negativePrompt ? { negativePrompt } : {}),
          ...(baseUrl ? { baseUrl } : {}),
          ...(workflow ? { workflow } : {}),
          ...(checkpoint ? { checkpoint } : {}),
          outDir,
          timeoutMs,
          pollMs,
          reflect,
          ...(visionModel ? { visionModel } : {}),
          ...(visionFallbackModels && visionFallbackModels.length > 0
            ? { visionFallbackModels }
            : {}),
          ...(visionPrompt ? { visionPrompt } : {}),
        });

        const imageRecord =
          runResult.result.image && typeof runResult.result.image === "object"
            ? runResult.result.image
            : null;
        const localPath = toStringOrEmpty(imageRecord?.localPath) || null;
        const viewUrl = toStringOrEmpty(imageRecord?.viewUrl) || null;
        const reflection = normalizeReflection(runResult.result.reflection);
        const reflectionError = toStringOrEmpty(runResult.result.reflectionError);
        const hasImage = Boolean(localPath || viewUrl);

        if (reflection) {
          const text = buildPerceptionNarrative(reflection);
          return {
            content: [{ type: "text", text }],
            details: {
              status: "perceived",
              promptId: runResult.result.promptId ?? null,
              baseUrl: runResult.result.baseUrl ?? null,
              image: {
                localPath,
                viewUrl,
              },
              reflection: {
                description: reflection.description,
                mood: reflection.mood,
                light_and_color: deriveLightAndColor(reflection),
                symbols: reflection.symbols,
                style: reflection.style,
              },
              script: {
                path: runResult.scriptPath,
              },
            },
          };
        }

        if (hasImage) {
          return {
            content: [{ type: "text", text: DEFERRED_REFLECTION_TEXT }],
            details: {
              status: "deferred_reflection",
              promptId: runResult.result.promptId ?? null,
              baseUrl: runResult.result.baseUrl ?? null,
              image: {
                localPath,
                viewUrl,
              },
              ...(reflectionError ? { reflectionError } : {}),
              script: {
                path: runResult.scriptPath,
              },
            },
          };
        }

        return {
          content: [{ type: "text", text: FALLBACK_NARRATIVE_TEXT }],
          details: {
            status: "error",
            error: "no_image_output",
            promptId: runResult.result.promptId ?? null,
            baseUrl: runResult.result.baseUrl ?? null,
            script: {
              path: runResult.scriptPath,
            },
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Traummanifestation fehlgeschlagen: ${message}`,
            },
          ],
          details: {
            status: "error",
            error: message,
          },
        };
      }
    },
  };
}

export const __testing = {
  DEFERRED_REFLECTION_TEXT,
  buildPerceptionNarrative,
  deriveLightAndColor,
  normalizeReflection,
  resolveSafeOutputDir,
  buildScriptArgs,
};
