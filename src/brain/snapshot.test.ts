import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../process/exec.js";
import {
  captureSnapshotBeforeMutation,
  readSnapshotManifest,
  revertToSnapshot,
} from "./snapshot.js";

const createdDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  createdDirs.push(dir);
  return dir;
}

async function writeText(filePath: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value, "utf-8");
}

async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}

async function isGitAvailable(): Promise<boolean> {
  const result = await runCommandWithTimeout(["git", "--version"], 4_000);
  return result.code === 0;
}

async function runGit(repoDir: string, args: string[]): Promise<string> {
  const result = await runCommandWithTimeout(["git", "-C", repoDir, ...args], {
    timeoutMs: 8_000,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Snapshot Test",
      GIT_AUTHOR_EMAIL: "snapshot-test@local",
      GIT_COMMITTER_NAME: "Snapshot Test",
      GIT_COMMITTER_EMAIL: "snapshot-test@local",
    },
  });
  if (result.code !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

afterEach(async () => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (!dir) continue;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe("brain snapshot safety net", () => {
  it("captures and restores L1 file snapshots", async () => {
    const stateDir = await makeTempDir("openclaw-snapshot-state-");
    const workspaceDir = await makeTempDir("openclaw-snapshot-workspace-");
    const target = path.join(workspaceDir, "SOUL.md");
    await writeText(target, "I begin.");

    const capture = await captureSnapshotBeforeMutation({
      level: "L1",
      targetPath: target,
      workspaceDir,
      reason: "test-l1",
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: stateDir,
      },
    });

    expect(capture.ok).toBe(true);
    expect(capture.snapshotId).toBeTruthy();

    await writeText(target, "I changed.");

    const revert = await revertToSnapshot(capture.snapshotId!, {
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: stateDir,
      },
    });

    expect(revert.ok).toBe(true);
    expect(await readText(target)).toBe("I begin.");
  });

  it("captures target + openclaw.json for L2 snapshots", async () => {
    const stateDir = await makeTempDir("openclaw-snapshot-state-");
    const workspaceDir = await makeTempDir("openclaw-snapshot-workspace-");
    const target = path.join(workspaceDir, "THINKING_PROTOCOL.md");
    const configPath = path.join(stateDir, "openclaw.json");
    await writeText(target, "breath one");
    await writeText(configPath, '{ "gateway": { "port": 18789 } }\n');

    const capture = await captureSnapshotBeforeMutation({
      level: "L2",
      targetPath: target,
      workspaceDir,
      reason: "test-l2",
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: stateDir,
      },
    });

    expect(capture.ok).toBe(true);
    const manifest = await readSnapshotManifest(capture.snapshotId!, {
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: stateDir,
      },
    });
    expect(manifest?.mode).toBe("files");
    const listedSources = (manifest?.files ?? []).map((entry) => entry.sourcePath);
    expect(listedSources).toContain(path.resolve(target));
    expect(listedSources).toContain(path.resolve(configPath));

    await writeText(target, "breath two");
    await writeText(configPath, '{ "gateway": { "port": 9999 } }\n');

    const revert = await revertToSnapshot(capture.snapshotId!, {
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: stateDir,
      },
    });
    expect(revert.ok).toBe(true);
    expect(await readText(target)).toBe("breath one");
    expect(await readText(configPath)).toContain("18789");
  });

  it("creates L3 branch+commit snapshots and can hard-reset to the snapshot commit", async () => {
    if (!(await isGitAvailable())) {
      return;
    }

    const stateDir = await makeTempDir("openclaw-snapshot-state-");
    const repoDir = await makeTempDir("openclaw-snapshot-repo-");
    const source = path.join(repoDir, "decision.ts");
    await writeText(source, "export const state = 'baseline';\n");

    await runGit(repoDir, ["init"]);
    await runGit(repoDir, ["add", "."]);
    await runGit(repoDir, ["commit", "-m", "baseline"]);

    const capture = await captureSnapshotBeforeMutation({
      level: "L3",
      repoDir,
      reason: "test-l3",
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: stateDir,
      },
    });

    expect(capture.ok).toBe(true);
    expect(capture.branchName).toMatch(/^om-snapshot-l3-/);
    expect(capture.commitSha).toMatch(/^[0-9a-f]{40}$/);

    await writeText(source, "export const state = 'mutated';\n");
    await runGit(repoDir, ["add", "."]);
    await runGit(repoDir, ["commit", "-m", "mutated"]);

    const headBeforeRevert = await runGit(repoDir, ["rev-parse", "HEAD"]);
    expect(headBeforeRevert).not.toBe(capture.commitSha);

    const revert = await revertToSnapshot(capture.snapshotId!, {
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: stateDir,
      },
    });

    expect(revert.ok).toBe(true);
    const headAfterRevert = await runGit(repoDir, ["rev-parse", "HEAD"]);
    expect(headAfterRevert).toBe(capture.commitSha);
  });
});
