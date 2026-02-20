import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { OpenClawConfig } from "../src/config/config.js";
import { buildBrainSacredRecallContext } from "../src/brain/decision.js";
import { appendBrainEpisodicJournal } from "../src/brain/episodic-memory.js";

function makeCfg(workspaceDir: string): OpenClawConfig {
  return {
    agents: {
      defaults: {
        workspace: workspaceDir,
        memorySearch: {
          enabled: true,
        },
      },
    },
  } as OpenClawConfig;
}

function assertCondition(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function run(): Promise<void> {
  const workspaceDir = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-memory-graph-"));
  const cfg = makeCfg(workspaceDir);
  const previousWriteEnv = process.env.OM_EPISODIC_WRITE_ENABLED;

  try {
    process.env.OM_EPISODIC_WRITE_ENABLED = "true";

    const writeOne = await appendBrainEpisodicJournal({
      cfg,
      agentId: "main",
      workspaceDir,
      runId: "verify-memory-graph-1",
      sessionKey: "agent:main:verify-memory-graph",
      userMessage: "Alice manages Auth.",
      assistantMessage: "I choose to remember this ownership relation.",
      now: () => new Date("2026-02-18T12:00:00.000Z"),
    });

    const noVectorManagerResolver = async () => ({
      manager: {
        search: async () => [],
        readFile: async () => ({ text: "", path: "" }),
        status: () => ({ backend: "builtin" as const, provider: "verify-memory-graph" }),
        probeEmbeddingAvailability: async () => ({ ok: true }),
        probeVectorAvailability: async () => true,
      },
    });

    const recallAfterA = await buildBrainSacredRecallContext({
      cfg,
      agentId: "main",
      workspaceDir,
      sessionKey: "agent:main:verify-memory-graph",
      userMessage: "Who manages Auth?",
      maxResults: 3,
      managerResolver: noVectorManagerResolver,
    });

    const writeTwo = await appendBrainEpisodicJournal({
      cfg,
      agentId: "main",
      workspaceDir,
      runId: "verify-memory-graph-2",
      sessionKey: "agent:main:verify-memory-graph",
      userMessage: "Bob manages Auth.",
      assistantMessage:
        "I choose to overwrite the previous manager assignment with this newer fact.",
      now: () => new Date("2026-02-18T12:01:00.000Z"),
    });

    const recallAfterB = await buildBrainSacredRecallContext({
      cfg,
      agentId: "main",
      workspaceDir,
      sessionKey: "agent:main:verify-memory-graph",
      userMessage: "Who manages Auth?",
      maxResults: 3,
      managerResolver: noVectorManagerResolver,
    });

    const dbPath = path.join(workspaceDir, "logs", "brain", "episodic-memory.sqlite");
    const db = new DatabaseSync(dbPath);
    const relationshipRows = db
      .prepare(
        `SELECT source_entity, predicate, target_entity, created_at
         FROM semantic_relationships
         WHERE predicate = 'MANAGES' AND target_entity = 'Auth'
         ORDER BY created_at DESC`,
      )
      .all() as Array<{
      source_entity: string;
      predicate: string;
      target_entity: string;
      created_at: number;
    }>;
    db.close();

    assertCondition(writeOne.persisted, "writeOne was not persisted");
    assertCondition(writeTwo.persisted, "writeTwo was not persisted");
    assertCondition(
      (recallAfterA.graphFacts ?? []).includes("Alice manages Auth."),
      `expected Alice recall for Auth after first write, got ${(recallAfterA.graphFacts ?? []).join(" | ")}`,
    );
    assertCondition(
      relationshipRows.length === 1,
      `expected exactly one MANAGES relation for Auth, got ${relationshipRows.length}`,
    );
    assertCondition(
      relationshipRows[0]?.source_entity === "Bob",
      `expected latest source to be Bob, got ${relationshipRows[0]?.source_entity ?? "n/a"}`,
    );
    assertCondition(
      (recallAfterB.graphFacts ?? []).includes("Bob manages Auth."),
      `expected Bob recall for Auth after overwrite, got ${(recallAfterB.graphFacts ?? []).join(" | ")}`,
    );
    assertCondition(
      !(recallAfterB.graphFacts ?? []).includes("Alice manages Auth."),
      `expected Alice to be removed after overwrite, got ${(recallAfterB.graphFacts ?? []).join(" | ")}`,
    );

    const report = {
      workspaceDir,
      writes: [
        {
          step: "write-1",
          persisted: writeOne.persisted,
          extracted: writeOne.graphRelationshipsExtracted ?? 0,
          inserted: writeOne.graphRelationshipsInserted ?? 0,
          conflictsResolved: writeOne.graphConflictsResolved ?? 0,
        },
        {
          step: "write-2",
          persisted: writeTwo.persisted,
          extracted: writeTwo.graphRelationshipsExtracted ?? 0,
          inserted: writeTwo.graphRelationshipsInserted ?? 0,
          conflictsResolved: writeTwo.graphConflictsResolved ?? 0,
        },
      ],
      dbRelations: relationshipRows,
      recall: {
        authAfterA: recallAfterA.graphFacts ?? [],
        authAfterB: recallAfterB.graphFacts ?? [],
      },
      verdict: "PASS",
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (previousWriteEnv === undefined) {
      delete process.env.OM_EPISODIC_WRITE_ENABLED;
    } else {
      process.env.OM_EPISODIC_WRITE_ENABLED = previousWriteEnv;
    }
    if (fs.existsSync(workspaceDir)) {
      await fsp.rm(workspaceDir, { recursive: true, force: true });
    }
  }
}

await run();
