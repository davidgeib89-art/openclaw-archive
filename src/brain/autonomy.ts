import * as path from "node:path";
import { resolveDefaultAgentWorkspaceDir } from "../agents/workspace.js";

export interface AutonomyConfig {
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
  blockedRelativePrefixes?: readonly string[];
}

const AUTONOMY_SANDBOX_ENV = "OM_AUTONOMY_SANDBOX";
const AUTONOMY_SANDBOX_ROOT_ENV = "OM_AUTONOMY_SANDBOX_ROOT";
const DEFAULT_BLOCKED_RELATIVE_PREFIXES = ["knowledge/sacred/"] as const;
const SANDBOX_TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
export const L1_IDENTITY_PATHS = [
  "knowledge/sacred/SOUL.md",
  "knowledge/sacred/IDENTITY.md",
  "knowledge/sacred/MOOD.md",
] as const;
const READ_ONLY_SACRED_PATHS = ["knowledge/sacred/David_Akasha.md"] as const;

function resolveSandboxWorkspaceDir(config: AutonomyConfig): string {
  const env = config.env ?? process.env;
  const override = env[AUTONOMY_SANDBOX_ROOT_ENV]?.trim();
  if (override) {
    return path.resolve(override);
  }
  const configured = config.workspaceDir?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(resolveDefaultAgentWorkspaceDir(env));
}

function normalizeRelativePath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/{2,}/g, "/");
}

const L1_IDENTITY_PATH_SET = new Set(
  L1_IDENTITY_PATHS.map((entry) => normalizeRelativePath(entry).toLowerCase()),
);
const READ_ONLY_SACRED_PATH_SET = new Set(
  READ_ONLY_SACRED_PATHS.map((entry) => normalizeRelativePath(entry).toLowerCase()),
);

export function isSandboxModeEnabled(config: AutonomyConfig = {}): boolean {
  const env = config.env ?? process.env;
  const raw = env[AUTONOMY_SANDBOX_ENV]?.trim().toLowerCase();
  if (!raw) return false;
  return SANDBOX_TRUE_VALUES.has(raw);
}

export function isPathWritableInSandbox(targetPath: string, config: AutonomyConfig = {}): boolean {
  const candidate = targetPath.trim();
  if (!candidate) return false;

  const workspaceDir = resolveSandboxWorkspaceDir(config);
  const targetAbs = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(workspaceDir, candidate);

  const relative = path.relative(workspaceDir, targetAbs);
  const insideWorkspace =
    relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
  if (!insideWorkspace) return false;

  const normalizedRelative = normalizeRelativePath(relative).toLowerCase();
  if (READ_ONLY_SACRED_PATH_SET.has(normalizedRelative)) {
    return false;
  }

  if (L1_IDENTITY_PATH_SET.has(normalizedRelative)) {
    return true;
  }

  const blockedPrefixes =
    config.blockedRelativePrefixes?.length && config.blockedRelativePrefixes.length > 0
      ? config.blockedRelativePrefixes
      : DEFAULT_BLOCKED_RELATIVE_PREFIXES;

  for (const blockedPrefix of blockedPrefixes) {
    const normalizedPrefix = normalizeRelativePath(blockedPrefix).toLowerCase();
    if (!normalizedPrefix) continue;
    const exactPrefix = normalizedPrefix.endsWith("/")
      ? normalizedPrefix.slice(0, -1)
      : normalizedPrefix;
    if (
      normalizedRelative === exactPrefix ||
      normalizedRelative.startsWith(
        normalizedPrefix.endsWith("/") ? normalizedPrefix : `${normalizedPrefix}/`,
      )
    ) {
      return false;
    }
  }

  return true;
}
