import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { evaluateSurge, resetSubconsciousSurgeStateForTests } from "../brain/salience.js";
import { setHeartbeatsEnabled, startHeartbeatRunner } from "./heartbeat-runner.js";

describe("heartbeat runner subconscious surge integration", () => {
  afterEach(() => {
    setHeartbeatsEnabled(true);
    resetSubconsciousSurgeStateForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("triggers an immediate heartbeat when subconsciousSurge is emitted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const runSpy = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    const runner = startHeartbeatRunner({
      cfg: {
        agents: { defaults: { heartbeat: { every: "30m" } } },
      } as OpenClawConfig,
      runOnce: runSpy,
    });

    evaluateSurge(
      {
        content: "Interrupt current wait and check the next pulse.",
        confidence: 0.96,
        urgency: 0.94,
        timestamp: 1,
      },
      { nowMs: 1_000, cooldownMs: 10_000 },
    );

    await vi.advanceTimersByTimeAsync(1);

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ reason: "subconscious-surge", agentId: "main" }),
    );

    runner.stop();
  });
});
