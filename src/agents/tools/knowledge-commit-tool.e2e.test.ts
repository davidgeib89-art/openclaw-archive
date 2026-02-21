import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createKnowledgeCommitTool } from "./knowledge-commit-tool.js";

const tempDirs: string[] = [];

async function makeWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-commit-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    }),
  );
});

describe("knowledge_commit tool", () => {
  it("creates SEMANTIC_KNOWLEDGE.md and stores a first insight", async () => {
    const workspaceDir = await makeWorkspace();
    const tool = createKnowledgeCommitTool({ workspaceDir });
    const execute = tool.execute;
    expect(execute).toBeTypeOf("function");

    const result = await execute!("tool-1", {
      fact: "I learned that short retries reduce waiting time, and this means I stay calmer under load.",
      source: "web_search: retry best practices",
      confidence: 0.84,
      tags: ["reliability", "latency"],
    });

    const details = result.details as {
      path: string;
      fact: string;
      source?: string;
      confidence?: number;
      tags?: string[];
    };
    expect(details.path).toBe(path.join(workspaceDir, "memory", "SEMANTIC_KNOWLEDGE.md"));
    expect(details.fact).toContain("I learned that short retries");
    expect(details.source).toBe("web_search: retry best practices");
    expect(details.confidence).toBe(0.84);
    expect(details.tags).toEqual(["reliability", "latency"]);

    const stored = await fs.readFile(details.path, "utf-8");
    expect(stored).toContain("# SEMANTIC_KNOWLEDGE");
    expect(stored).toContain("Curated first-person learnings");
    expect(stored).toContain("I learned that short retries reduce waiting time");
  });

  it("appends without duplicating the header", async () => {
    const workspaceDir = await makeWorkspace();
    const tool = createKnowledgeCommitTool({ workspaceDir });
    const execute = tool.execute;
    expect(execute).toBeTypeOf("function");

    await execute!("tool-1", {
      fact: "I learned that reversible steps keep exploration safe and playful.",
    });
    await execute!("tool-2", {
      fact: "I learned that curiosity in DRIFT can evolve into focused LEARN actions.",
    });

    const knowledgePath = path.join(workspaceDir, "memory", "SEMANTIC_KNOWLEDGE.md");
    const stored = await fs.readFile(knowledgePath, "utf-8");
    expect((stored.match(/# SEMANTIC_KNOWLEDGE/g) ?? []).length).toBe(1);
    expect(stored).toContain("reversible steps keep exploration safe");
    expect(stored).toContain("curiosity in DRIFT can evolve");
  });

  it("rejects invalid confidence values", async () => {
    const workspaceDir = await makeWorkspace();
    const tool = createKnowledgeCommitTool({ workspaceDir });
    const execute = tool.execute;
    expect(execute).toBeTypeOf("function");

    await expect(
      execute!("tool-1", {
        fact: "I learned that input validation protects the system.",
        confidence: 1.4,
      }),
    ).rejects.toThrow("confidence must be a number between 0 and 1");
  });
});
