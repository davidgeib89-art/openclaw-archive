import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveConfigPath, resolveStateDir } from "../config/paths.js";
import { runCommandWithTimeout } from "../process/exec.js";

const SNAPSHOT_ROOT_ENV = "OM_SNAPSHOT_DIR";
const SNAPSHOT_META_FILENAME = "snapshot.json";
const SNAPSHOT_MANIFEST_FILENAME = "snapshot-manifest.jsonl";
const SNAPSHOT_FILES_DIRNAME = "files";
const DEFAULT_GIT_TIMEOUT_MS = 15_000;

export type SnapshotLevel = "L1" | "L2" | "L3";

type SnapshotMode = "files" | "git";

export type SnapshotFileEntry = {
  sourcePath: string;
  backupPath?: string;
  existsAtSnapshot: boolean;
  kind: "file" | "missing" | "directory";
  sha256?: string;
  error?: string;
};

export type SnapshotGitEntry = {
  repoDir: string;
  baseCommitSha: string;
  branchName: string;
  commitSha: string;
};

export type SnapshotManifest = {
  id: string;
  createdAt: string;
  level: SnapshotLevel;
  mode: SnapshotMode;
  reason?: string;
  actor?: string;
  files?: SnapshotFileEntry[];
  git?: SnapshotGitEntry;
};

export type SnapshotCaptureInput = {
  level: SnapshotLevel;
  targetPath?: string;
  targetPaths?: readonly string[];
  workspaceDir?: string;
  repoDir?: string;
  reason?: string;
  actor?: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  gitTimeoutMs?: number;
};

export type SnapshotCaptureResult = {
  ok: boolean;
  failOpen: boolean;
  level: SnapshotLevel;
  mode?: SnapshotMode;
  snapshotId?: string;
  snapshotRoot: string;
  snapshotDir?: string;
  manifestPath?: string;
  fileCount?: number;
  branchName?: string;
  commitSha?: string;
  error?: string;
};

export type SnapshotRevertInput = {
  env?: NodeJS.ProcessEnv;
  gitTimeoutMs?: number;
};

export type SnapshotRevertResult = {
  ok: boolean;
  failOpen: boolean;
  snapshotId: string;
  mode?: SnapshotMode;
  restoredFiles?: number;
  removedFiles?: number;
  rescueBranchName?: string;
  targetCommitSha?: string;
  error?: string;
};

function formatSnapshotStamp(now: Date): string {
  const year = now.getUTCFullYear().toString();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hour = String(now.getUTCHours()).padStart(2, "0");
  const minute = String(now.getUTCMinutes()).padStart(2, "0");
  const second = String(now.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function buildSnapshotId(level: SnapshotLevel, now: Date): string {
  return `om-${level.toLowerCase()}-${formatSnapshotStamp(now)}-${randomBytes(4).toString("hex")}`;
}

function resolveSnapshotRoot(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[SNAPSHOT_ROOT_ENV]?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(resolveStateDir(env), "snapshots");
}

function resolvePrimaryTarget(input: SnapshotCaptureInput): string | null {
  if (input.targetPath?.trim()) return input.targetPath.trim();
  const fromList = input.targetPaths?.find((entry) => entry.trim().length > 0);
  return fromList?.trim() ?? null;
}

function resolvePathForSnapshot(rawPath: string, workspaceDir?: string): string {
  if (path.isAbsolute(rawPath)) return path.resolve(rawPath);
  if (workspaceDir?.trim()) return path.resolve(workspaceDir.trim(), rawPath);
  return path.resolve(process.cwd(), rawPath);
}

function dedupePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of paths) {
    const key = process.platform === "win32" ? entry.toLowerCase() : entry;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
}

function backupFileName(index: number, sourcePath: string): string {
  const base = path.basename(sourcePath).replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
  return `${String(index + 1).padStart(2, "0")}-${base}.bak`;
}

async function digestFileSha256(filePath: string): Promise<string> {
  const bytes = await fs.readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

async function captureFileEntries(params: {
  snapshotDir: string;
  sourcePaths: readonly string[];
}): Promise<SnapshotFileEntry[]> {
  const filesDir = path.join(params.snapshotDir, SNAPSHOT_FILES_DIRNAME);
  await fs.mkdir(filesDir, { recursive: true });
  const entries: SnapshotFileEntry[] = [];

  for (const [index, sourcePath] of params.sourcePaths.entries()) {
    const resolvedSource = path.resolve(sourcePath);
    try {
      const stat = await fs.stat(resolvedSource);
      if (stat.isDirectory()) {
        entries.push({
          sourcePath: resolvedSource,
          existsAtSnapshot: true,
          kind: "directory",
        });
        continue;
      }

      const relativeBackup = path.join(
        SNAPSHOT_FILES_DIRNAME,
        backupFileName(index, resolvedSource),
      );
      const absoluteBackup = path.join(params.snapshotDir, relativeBackup);
      await fs.mkdir(path.dirname(absoluteBackup), { recursive: true });
      await fs.copyFile(resolvedSource, absoluteBackup);
      entries.push({
        sourcePath: resolvedSource,
        backupPath: relativeBackup,
        existsAtSnapshot: true,
        kind: "file",
        sha256: await digestFileSha256(absoluteBackup),
      });
    } catch (error) {
      const details = String(error);
      if (details.includes("ENOENT")) {
        entries.push({
          sourcePath: resolvedSource,
          existsAtSnapshot: false,
          kind: "missing",
        });
        continue;
      }
      entries.push({
        sourcePath: resolvedSource,
        existsAtSnapshot: false,
        kind: "missing",
        error: details,
      });
    }
  }

  return entries;
}

function defaultGitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...env,
    GIT_AUTHOR_NAME: env.GIT_AUTHOR_NAME ?? "Om Snapshot",
    GIT_AUTHOR_EMAIL: env.GIT_AUTHOR_EMAIL ?? "om-snapshot@local",
    GIT_COMMITTER_NAME: env.GIT_COMMITTER_NAME ?? "Om Snapshot",
    GIT_COMMITTER_EMAIL: env.GIT_COMMITTER_EMAIL ?? "om-snapshot@local",
  };
}

async function runGit(params: {
  repoDir: string;
  args: string[];
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
}): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const gitCommand = process.platform === "win32" ? "git.exe" : "git";
  const result = await runCommandWithTimeout([gitCommand, "-C", params.repoDir, ...params.args], {
    timeoutMs: params.timeoutMs,
    env: params.env,
  });
  return {
    ok: result.code === 0,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

async function captureGitSnapshot(params: {
  repoDir: string;
  snapshotId: string;
  reason?: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
}): Promise<{ ok: boolean; git?: SnapshotGitEntry; error?: string }> {
  const repoDir = path.resolve(params.repoDir);
  const env = defaultGitEnv(params.env);
  const insideRepo = await runGit({
    repoDir,
    args: ["rev-parse", "--is-inside-work-tree"],
    timeoutMs: params.timeoutMs,
    env,
  });
  if (!insideRepo.ok || insideRepo.stdout !== "true") {
    return { ok: false, error: insideRepo.stderr || "Not a git repository." };
  }

  const baseCommit = await runGit({
    repoDir,
    args: ["rev-parse", "HEAD"],
    timeoutMs: params.timeoutMs,
    env,
  });
  if (!baseCommit.ok || !baseCommit.stdout) {
    return { ok: false, error: baseCommit.stderr || "Failed to resolve HEAD commit." };
  }

  const commitObject = await runGit({
    repoDir,
    args: ["cat-file", "-p", "HEAD"],
    timeoutMs: params.timeoutMs,
    env,
  });
  if (!commitObject.ok || !commitObject.stdout) {
    return { ok: false, error: commitObject.stderr || "Failed to read HEAD commit object." };
  }

  const treeMatch = commitObject.stdout.match(/^tree ([0-9a-f]{40})$/m);
  const treeSha = treeMatch?.[1];
  if (!treeSha) {
    return { ok: false, error: "Failed to parse HEAD tree sha." };
  }

  const branchName = `om-snapshot-l3-${params.snapshotId}`;
  const commitMessage = params.reason?.trim()
    ? `OM L3 snapshot ${params.snapshotId}: ${params.reason.trim()}`
    : `OM L3 snapshot ${params.snapshotId}`;

  const commitSha = await runGit({
    repoDir,
    args: ["commit-tree", treeSha, "-p", baseCommit.stdout, "-m", commitMessage],
    timeoutMs: params.timeoutMs,
    env,
  });
  if (!commitSha.ok || !commitSha.stdout) {
    return { ok: false, error: commitSha.stderr || "Failed to create snapshot commit." };
  }

  const branchUpdate = await runGit({
    repoDir,
    args: ["update-ref", `refs/heads/${branchName}`, commitSha.stdout],
    timeoutMs: params.timeoutMs,
    env,
  });
  if (!branchUpdate.ok) {
    return { ok: false, error: branchUpdate.stderr || "Failed to update snapshot branch ref." };
  }

  return {
    ok: true,
    git: {
      repoDir,
      baseCommitSha: baseCommit.stdout,
      branchName,
      commitSha: commitSha.stdout,
    },
  };
}

async function writeManifest(params: {
  snapshotRoot: string;
  snapshotDir: string;
  manifest: SnapshotManifest;
}): Promise<{ manifestPath: string; journalPath: string }> {
  const manifestPath = path.join(params.snapshotDir, SNAPSHOT_META_FILENAME);
  const journalPath = path.join(params.snapshotRoot, SNAPSHOT_MANIFEST_FILENAME);
  await fs.writeFile(manifestPath, `${JSON.stringify(params.manifest, null, 2)}\n`, "utf-8");
  await fs.appendFile(journalPath, `${JSON.stringify(params.manifest)}\n`, "utf-8");
  return { manifestPath, journalPath };
}

export async function captureSnapshotBeforeMutation(
  input: SnapshotCaptureInput,
): Promise<SnapshotCaptureResult> {
  const env = input.env ?? process.env;
  const now = input.now ?? new Date();
  const snapshotRoot = resolveSnapshotRoot(env);
  const snapshotId = buildSnapshotId(input.level, now);
  const snapshotDir = path.join(snapshotRoot, snapshotId);

  try {
    await fs.mkdir(snapshotDir, { recursive: true });

    if (input.level === "L3") {
      const gitResult = await captureGitSnapshot({
        repoDir: input.repoDir ?? process.cwd(),
        snapshotId,
        reason: input.reason,
        timeoutMs: input.gitTimeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
        env,
      });
      if (!gitResult.ok || !gitResult.git) {
        return {
          ok: false,
          failOpen: true,
          level: input.level,
          snapshotRoot,
          snapshotDir,
          snapshotId,
          error: gitResult.error ?? "L3 snapshot failed.",
        };
      }

      const manifest: SnapshotManifest = {
        id: snapshotId,
        createdAt: now.toISOString(),
        level: input.level,
        mode: "git",
        reason: input.reason?.trim() || undefined,
        actor: input.actor?.trim() || undefined,
        git: gitResult.git,
      };
      const { manifestPath } = await writeManifest({ snapshotRoot, snapshotDir, manifest });
      return {
        ok: true,
        failOpen: false,
        level: input.level,
        mode: "git",
        snapshotRoot,
        snapshotDir,
        snapshotId,
        manifestPath,
        branchName: gitResult.git.branchName,
        commitSha: gitResult.git.commitSha,
      };
    }

    const primaryTarget = resolvePrimaryTarget(input);
    if (!primaryTarget) {
      return {
        ok: false,
        failOpen: true,
        level: input.level,
        snapshotRoot,
        snapshotDir,
        snapshotId,
        error: "Missing targetPath/targetPaths for file snapshot.",
      };
    }

    const sourcePaths = [resolvePathForSnapshot(primaryTarget, input.workspaceDir)];
    if (input.level === "L2") {
      const stateDir = resolveStateDir(env);
      sourcePaths.push(resolveConfigPath(env, stateDir));
    }
    const dedupedPaths = dedupePaths(sourcePaths);
    const fileEntries = await captureFileEntries({ snapshotDir, sourcePaths: dedupedPaths });

    const manifest: SnapshotManifest = {
      id: snapshotId,
      createdAt: now.toISOString(),
      level: input.level,
      mode: "files",
      reason: input.reason?.trim() || undefined,
      actor: input.actor?.trim() || undefined,
      files: fileEntries,
    };
    const { manifestPath } = await writeManifest({ snapshotRoot, snapshotDir, manifest });

    return {
      ok: true,
      failOpen: false,
      level: input.level,
      mode: "files",
      snapshotRoot,
      snapshotDir,
      snapshotId,
      manifestPath,
      fileCount: fileEntries.length,
    };
  } catch (error) {
    return {
      ok: false,
      failOpen: true,
      level: input.level,
      snapshotRoot,
      snapshotDir,
      snapshotId,
      error: String(error),
    };
  }
}

export async function readSnapshotManifest(
  snapshotId: string,
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<SnapshotManifest | null> {
  const snapshotRoot = resolveSnapshotRoot(options.env ?? process.env);
  const manifestPath = path.join(snapshotRoot, snapshotId, SNAPSHOT_META_FILENAME);
  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    return JSON.parse(raw) as SnapshotManifest;
  } catch {
    return null;
  }
}

export async function revertToSnapshot(
  snapshotId: string,
  input: SnapshotRevertInput = {},
): Promise<SnapshotRevertResult> {
  const env = input.env ?? process.env;
  const snapshotRoot = resolveSnapshotRoot(env);
  const snapshotDir = path.join(snapshotRoot, snapshotId);
  const manifest = await readSnapshotManifest(snapshotId, { env });
  if (!manifest) {
    return {
      ok: false,
      failOpen: true,
      snapshotId,
      error: `Snapshot not found: ${snapshotId}`,
    };
  }

  if (manifest.mode === "files") {
    let restoredFiles = 0;
    let removedFiles = 0;
    try {
      for (const entry of manifest.files ?? []) {
        if (entry.kind === "file" && entry.existsAtSnapshot && entry.backupPath) {
          const sourceBackup = path.join(snapshotDir, entry.backupPath);
          await fs.mkdir(path.dirname(entry.sourcePath), { recursive: true });
          await fs.copyFile(sourceBackup, entry.sourcePath);
          restoredFiles += 1;
          continue;
        }
        if (entry.kind === "missing" && !entry.existsAtSnapshot) {
          await fs.rm(entry.sourcePath, { force: true });
          removedFiles += 1;
        }
      }
      return {
        ok: true,
        failOpen: false,
        snapshotId,
        mode: manifest.mode,
        restoredFiles,
        removedFiles,
      };
    } catch (error) {
      return {
        ok: false,
        failOpen: true,
        snapshotId,
        mode: manifest.mode,
        restoredFiles,
        removedFiles,
        error: String(error),
      };
    }
  }

  try {
    const git = manifest.git;
    if (!git?.repoDir || !git.commitSha) {
      return {
        ok: false,
        failOpen: true,
        snapshotId,
        mode: manifest.mode,
        error: "Snapshot metadata missing git details.",
      };
    }

    const nowToken = formatSnapshotStamp(new Date()).replace("-", "");
    const rescueBranchName = `om-revert-rescue-${nowToken}-${snapshotId.slice(-6)}`;
    const timeoutMs = input.gitTimeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;
    await runGit({
      repoDir: git.repoDir,
      args: ["branch", rescueBranchName, "HEAD"],
      timeoutMs,
      env: defaultGitEnv(env),
    });
    const resetResult = await runGit({
      repoDir: git.repoDir,
      args: ["reset", "--hard", git.commitSha],
      timeoutMs,
      env: defaultGitEnv(env),
    });
    if (!resetResult.ok) {
      return {
        ok: false,
        failOpen: true,
        snapshotId,
        mode: manifest.mode,
        rescueBranchName,
        targetCommitSha: git.commitSha,
        error: resetResult.stderr || "git reset --hard failed.",
      };
    }

    return {
      ok: true,
      failOpen: false,
      snapshotId,
      mode: manifest.mode,
      rescueBranchName,
      targetCommitSha: git.commitSha,
    };
  } catch (error) {
    return {
      ok: false,
      failOpen: true,
      snapshotId,
      mode: manifest.mode,
      error: String(error),
    };
  }
}
