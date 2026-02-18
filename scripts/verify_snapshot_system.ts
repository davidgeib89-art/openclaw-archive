import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { captureSnapshotBeforeMutation, revertToSnapshot } from "../src/brain/snapshot.js";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function writeText(filePath: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value, "utf-8");
}

async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}

async function runGit(repoDir: string, args: string[]): Promise<string> {
  const result = await runCommandWithTimeout(["git", "-C", repoDir, ...args], {
    timeoutMs: 10_000,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Snapshot Verify",
      GIT_AUTHOR_EMAIL: "snapshot-verify@local",
      GIT_COMMITTER_NAME: "Snapshot Verify",
      GIT_COMMITTER_EMAIL: "snapshot-verify@local",
    },
  });
  if (result.code !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

async function isGitAvailable(): Promise<boolean> {
  const result = await runCommandWithTimeout(["git", "--version"], 4_000);
  return result.code === 0;
}

async function run(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-snapshot-verify-"));
  const stateDir = path.join(root, "state");
  const workspaceDir = path.join(root, "workspace");
  const env = {
    ...process.env,
    OPENCLAW_STATE_DIR: stateDir,
  };

  try {
    await fs.mkdir(stateDir, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });
    await writeText(path.join(stateDir, "openclaw.json"), '{ "gateway": { "port": 18789 } }\n');

    const l1Path = path.join(workspaceDir, "SOUL.md");
    await writeText(l1Path, "baseline-l1");
    const l1Snapshot = await captureSnapshotBeforeMutation({
      level: "L1",
      targetPath: l1Path,
      workspaceDir,
      reason: "verify-l1",
      env,
    });
    await writeText(l1Path, "mutated-l1");
    const l1Revert = await revertToSnapshot(l1Snapshot.snapshotId ?? "", { env });

    const l2Path = path.join(workspaceDir, "THINKING_PROTOCOL.md");
    const configPath = path.join(stateDir, "openclaw.json");
    await writeText(l2Path, "baseline-l2");
    await writeText(configPath, '{ "gateway": { "port": 18789 } }\n');
    const l2Snapshot = await captureSnapshotBeforeMutation({
      level: "L2",
      targetPath: l2Path,
      workspaceDir,
      reason: "verify-l2",
      env,
    });
    await writeText(l2Path, "mutated-l2");
    await writeText(configPath, '{ "gateway": { "port": 9999 } }\n');
    const l2Revert = await revertToSnapshot(l2Snapshot.snapshotId ?? "", { env });

    const report: Record<string, unknown> = {
      snapshotRoot: path.join(stateDir, "snapshots"),
      l1: {
        snapshotOk: l1Snapshot.ok,
        revertOk: l1Revert.ok,
        finalValue: await readText(l1Path),
      },
      l2: {
        snapshotOk: l2Snapshot.ok,
        revertOk: l2Revert.ok,
        finalTarget: await readText(l2Path),
        finalConfig: await readText(configPath),
      },
    };

    if (await isGitAvailable()) {
      const repoDir = path.join(root, "repo");
      const source = path.join(repoDir, "runtime.ts");
      await writeText(source, "export const mode = 'baseline';\n");
      await runGit(repoDir, ["init"]);
      await runGit(repoDir, ["add", "."]);
      await runGit(repoDir, ["commit", "-m", "baseline"]);

      const l3Snapshot = await captureSnapshotBeforeMutation({
        level: "L3",
        repoDir,
        reason: "verify-l3",
        env,
      });
      await writeText(source, "export const mode = 'mutated';\n");
      await runGit(repoDir, ["add", "."]);
      await runGit(repoDir, ["commit", "-m", "mutated"]);
      const headBefore = await runGit(repoDir, ["rev-parse", "HEAD"]);
      const l3Revert = await revertToSnapshot(l3Snapshot.snapshotId ?? "", { env });
      const headAfter = await runGit(repoDir, ["rev-parse", "HEAD"]);

      report.l3 = {
        snapshotOk: l3Snapshot.ok,
        revertOk: l3Revert.ok,
        branchName: l3Snapshot.branchName,
        snapshotCommit: l3Snapshot.commitSha,
        headBefore,
        headAfter,
      };
    } else {
      report.l3 = { skipped: true, reason: "git unavailable" };
    }

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ verdict: "PASS", ...report }, null, 2));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

await run();
