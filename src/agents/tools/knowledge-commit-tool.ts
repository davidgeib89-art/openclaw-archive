import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AnyAgentTool } from "./common.js";
import {
  jsonResult,
  readNumberParam,
  readStringArrayParam,
  readStringParam,
  ToolInputError,
} from "./common.js";

const DEFAULT_WORKSPACE_DIR = path.join(os.homedir(), ".openclaw", "workspace");
const KNOWLEDGE_RELATIVE_PATH = path.join("memory", "SEMANTIC_KNOWLEDGE.md");
const KNOWLEDGE_HEADER = [
  "# SEMANTIC_KNOWLEDGE",
  "",
  "Curated first-person learnings that shape my worldview.",
  "",
].join("\n");
const MAX_FACT_CHARS = 1_600;
const MAX_SOURCE_CHARS = 320;
const MAX_TAGS = 8;
const MAX_TAG_CHARS = 40;

const KnowledgeCommitSchema = Type.Object({
  fact: Type.String({
    minLength: 1,
    maxLength: MAX_FACT_CHARS,
    description:
      'Write in first person and connect it to identity/worldview, for example: "I learned that ... and this means for me ...".',
  }),
  source: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: MAX_SOURCE_CHARS,
      description: "Optional source note (query, URL, or file path).",
    }),
  ),
  confidence: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 1,
      description: "Optional confidence score between 0 and 1.",
    }),
  ),
  tags: Type.Optional(
    Type.Array(Type.String({ minLength: 1, maxLength: MAX_TAG_CHARS }), {
      minItems: 1,
      maxItems: MAX_TAGS,
      description: "Optional tags to support later retrieval.",
    }),
  ),
});

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function resolveWorkspaceRoot(workspaceDir?: string): string {
  const trimmed = workspaceDir?.trim();
  if (trimmed) {
    return path.resolve(trimmed);
  }
  return path.resolve(DEFAULT_WORKSPACE_DIR);
}

function isPathInside(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(rootPath, targetPath);
  if (!relative) return true;
  if (relative.startsWith("..")) return false;
  return !path.isAbsolute(relative);
}

function normalizeTags(rawTags: string[] | undefined): string[] {
  if (!rawTags || rawTags.length === 0) {
    return [];
  }
  const deduped: string[] = [];
  for (const tag of rawTags) {
    const normalized = normalizeLine(tag).slice(0, MAX_TAG_CHARS);
    if (!normalized) {
      continue;
    }
    if (deduped.includes(normalized)) {
      continue;
    }
    deduped.push(normalized);
    if (deduped.length >= MAX_TAGS) {
      break;
    }
  }
  return deduped;
}

function buildKnowledgeEntry(params: {
  fact: string;
  source?: string;
  confidence?: number;
  tags: string[];
}): string {
  const timestamp = new Date().toISOString();
  const meta: string[] = [];
  if (params.source) {
    meta.push(`source: ${params.source}`);
  }
  if (typeof params.confidence === "number" && Number.isFinite(params.confidence)) {
    meta.push(`confidence: ${params.confidence.toFixed(2)}`);
  }
  if (params.tags.length > 0) {
    meta.push(`tags: ${params.tags.join(", ")}`);
  }
  const suffix = meta.length > 0 ? ` (${meta.join("; ")})` : "";
  return `- [${timestamp}] ${params.fact}${suffix}\n`;
}

export function createKnowledgeCommitTool(options?: { workspaceDir?: string }): AnyAgentTool {
  return {
    label: "Knowledge Commit",
    name: "knowledge_commit",
    description:
      "Store a high-value learning into memory/SEMANTIC_KNOWLEDGE.md. Save only insights that are new or meaningful; skip noise.",
    parameters: KnowledgeCommitSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const factRaw = readStringParam(params, "fact", { required: true, label: "fact" });
      const sourceRaw = readStringParam(params, "source");
      const confidence = readNumberParam(params, "confidence");
      const tagsRaw = readStringArrayParam(params, "tags");

      const fact = normalizeLine(factRaw).slice(0, MAX_FACT_CHARS);
      if (!fact) {
        throw new ToolInputError("fact required");
      }
      const source = sourceRaw ? normalizeLine(sourceRaw).slice(0, MAX_SOURCE_CHARS) : undefined;
      if (confidence !== undefined && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
        throw new ToolInputError("confidence must be a number between 0 and 1");
      }

      const tags = normalizeTags(tagsRaw);
      const workspaceRoot = resolveWorkspaceRoot(options?.workspaceDir);
      const knowledgePath = path.resolve(workspaceRoot, KNOWLEDGE_RELATIVE_PATH);
      if (!isPathInside(workspaceRoot, knowledgePath)) {
        throw new Error(`knowledge path is outside workspace: ${knowledgePath}`);
      }

      await fs.mkdir(path.dirname(knowledgePath), { recursive: true });

      let current = "";
      try {
        current = await fs.readFile(knowledgePath, "utf-8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }

      const hasContent = current.trim().length > 0;
      const separator = hasContent && !current.endsWith("\n") ? "\n" : "";
      const header = hasContent ? "" : KNOWLEDGE_HEADER;
      const entry = buildKnowledgeEntry({ fact, source, confidence, tags });
      await fs.appendFile(knowledgePath, `${separator}${header}${entry}`, "utf-8");

      return jsonResult({
        ok: true,
        path: knowledgePath,
        fact,
        source,
        confidence,
        tags,
      });
    },
  };
}
