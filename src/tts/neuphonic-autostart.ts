import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { OpenClawConfig } from "../config/config.js";
import { resolveStateDir } from "../config/config.js";
import { logVerbose } from "../globals.js";
import { getTtsProvider, resolveTtsConfig, resolveTtsPrefsPath } from "./tts.js";
import { resolveNeuphonicTtsUrl } from "./tts-core.js";

type LoggerLike = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

const HEALTHCHECK_TIMEOUT_MS = 1200;
const WAIT_FOR_READY_MS = 8000;
const WAIT_POLL_MS = 400;

function normalizeHealthUrl(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}/`;
  } catch {
    return "http://127.0.0.1:42890/";
  }
}

async function canReachServer(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTHCHECK_TIMEOUT_MS);
  try {
    // Any HTTP response (even 404/405) means the server is reachable.
    await fetch(url, { method: "GET", signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForReady(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canReachServer(url)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
  }
  return false;
}

function buildCandidates(scriptPath: string): Array<{ command: string; args: string[] }> {
  if (process.platform === "win32") {
    return [
      { command: "py", args: ["-3.12", "-u", scriptPath] },
      { command: "py", args: ["-3", "-u", scriptPath] },
      { command: "python", args: ["-u", scriptPath] },
    ];
  }
  return [
    { command: "python3", args: ["-u", scriptPath] },
    { command: "python", args: ["-u", scriptPath] },
  ];
}

function spawnDetachedServer(params: {
  command: string;
  args: string[];
  cwd: string;
  logPath: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let logFd: number | undefined;
    try {
      logFd = openSync(params.logPath, "a");
      const child = spawn(params.command, params.args, {
        cwd: params.cwd,
        detached: true,
        windowsHide: true,
        stdio: ["ignore", logFd, logFd],
      });
      closeSync(logFd);
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(ok);
      };
      child.once("error", () => finish(false));
      child.once("spawn", () => {
        child.unref();
        finish(true);
      });
      setTimeout(() => finish(true), 250);
    } catch {
      if (typeof logFd === "number") {
        try {
          closeSync(logFd);
        } catch {
          // ignore cleanup errors
        }
      }
      resolve(false);
    }
  });
}

export async function maybeAutoStartNeuphonicServer(params: {
  cfg: OpenClawConfig;
  logger: LoggerLike;
}): Promise<void> {
  const ttsConfig = resolveTtsConfig(params.cfg);
  const prefsPath = resolveTtsPrefsPath(ttsConfig);
  const activeProvider = getTtsProvider(ttsConfig, prefsPath);
  if (activeProvider !== "neuphonic") {
    return;
  }

  const endpoint = resolveNeuphonicTtsUrl();
  const healthUrl = normalizeHealthUrl(endpoint);
  if (await canReachServer(healthUrl)) {
    logVerbose(`TTS: Neuphonic server already reachable at ${endpoint}`);
    return;
  }

  const repoRoot = process.cwd();
  const scriptPath = path.resolve(repoRoot, "src", "tts", "neutts_server.py");
  if (!existsSync(scriptPath)) {
    params.logger.warn(
      `neuphonic autostart skipped: script not found at ${scriptPath}.`,
    );
    return;
  }
  const stateDir = resolveStateDir(process.env);
  const logsDir = path.join(stateDir, "logs");
  mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, "neutts-server.log");
  const candidates = buildCandidates(scriptPath);

  for (const candidate of candidates) {
    const started = await spawnDetachedServer({
      command: candidate.command,
      args: candidate.args,
      cwd: repoRoot,
      logPath,
    });
    if (!started) {
      continue;
    }
    if (await waitForReady(healthUrl, WAIT_FOR_READY_MS)) {
      params.logger.info(
        `neuphonic autostart: online via "${candidate.command}" (${endpoint}); log=${logPath}`,
      );
      return;
    }
    params.logger.warn(
      `neuphonic autostart: process started via "${candidate.command}", still warming up (${endpoint}); log=${logPath}`,
    );
    return;
  }

  params.logger.warn(
    `neuphonic autostart failed: no Python launcher worked. Start manually and check ${logPath}`,
  );
}
