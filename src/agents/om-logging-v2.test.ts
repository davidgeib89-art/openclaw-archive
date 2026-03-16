import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { omTelemetry, omLog } from "./om-scaffolding.js";

describe("Logging V2: Telemetry and Rotation", () => {
  const originalEnv = process.env;
  let testWorkspace: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    testWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "om-logging-v2-"));
    process.env.OPENCLAW_WORKSPACE = testWorkspace;
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(testWorkspace, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("writes structured telemetry to OM_TELEMETRY.jsonl with stable schema", () => {
    const payload = {
      path: "PLAY",
      energyLevel: 90,
      toolCallsTotal: 5,
    };

    omTelemetry("HEARTBEAT", "SUMMARY", payload);

    const telemetryFile = path.join(testWorkspace, "OM_TELEMETRY.jsonl");
    expect(fs.existsSync(telemetryFile)).toBe(true);

    const lines = fs.readFileSync(telemetryFile, "utf-8").trim().split(/\r?\n/);
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]!);
    expect(parsed.layer).toBe("HEARTBEAT");
    expect(parsed.event).toBe("SUMMARY");
    expect(parsed.path).toBe("PLAY");
    expect(parsed.energyLevel).toBe(90);
    expect(parsed.ts).toBeDefined();
  });

  it("enforces volume control by rotating OM_ACTIVITY.log and OM_TRACE.jsonl", () => {
    const logFile = path.join(testWorkspace, "OM_ACTIVITY.log");
    const traceFile = path.join(testWorkspace, "OM_TRACE.jsonl");

    // Write over each limit to trigger rotation on the next write.
    // rotateLogIfNeeded fires BEFORE the append, so the file must already exceed
    // the threshold when omLog/appendTraceLogEntry is called.
    fs.writeFileSync(logFile, "A".repeat(500 * 1024 + 1), "utf-8");
    fs.writeFileSync(traceFile, "A".repeat(5 * 1024 * 1024 + 1), "utf-8");

    omLog("SYSTEM", "TEST", "This is a test of the emergency broadcast system");

    // Rotation produces timestamp-based names like OM_ACTIVITY.prev.2026-...log
    const files = fs.readdirSync(testWorkspace);
    expect(
      files.some((f) => f.startsWith("OM_ACTIVITY") && f.includes(".prev.")),
    ).toBe(true);
    expect(
      files.some((f) => f.startsWith("OM_TRACE") && f.includes(".prev.")),
    ).toBe(true);

    const newLogContent = fs.readFileSync(logFile, "utf-8");
    expect(newLogContent.length).toBeLessThan(1024);
    expect(newLogContent).toContain("This is a test");
  });

  it("degrades human operator log by truncating long details", () => {
    const longString = "A".repeat(500);
    omLog("HUMAN", "READABLE", longString);

    const logFile = path.join(testWorkspace, "OM_ACTIVITY.log");
    const logContent = fs.readFileSync(logFile, "utf-8");

    expect(logContent).toContain("HUMAN");
    expect(logContent.length).toBeLessThan(300);
    expect(logContent).toContain("A".repeat(147) + "...");
  });
});
