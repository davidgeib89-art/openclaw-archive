import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_REFRACTORY_THRESHOLD,
  NEURO_COHERENCE_MIN_TEMPERATURE_EPSILON,
  REFRACTORY_COUNTER_RELATIVE_PATH,
  tickRefractoryCounter,
} from "./refractory.js";
import {
  activateDefibrillator,
  readDefibrillatorState,
} from "./defibrillator.js";

const MIN_TEMPERATURE = 0.1;

function createWorkspaceDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupWorkspace(workspaceDir: string): void {
  fs.rmSync(workspaceDir, { recursive: true, force: true });
}

function writeDefibrillatorMarker(workspaceDir: string, payload: unknown): void {
  const markerPath = path.join(workspaceDir, "logs", "brain", "defibrillator.json");
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify(payload), "utf-8");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("refractory", () => {
  it("increments counter when temperature is at min", async () => {
    const workspaceDir = createWorkspaceDir("refractory-increment-");

    const result = await tickRefractoryCounter({
      workspaceDir,
      currentTemperature: MIN_TEMPERATURE,
    });

    expect(result.shouldFire).toBe(false);
    expect(result.newState.consecutiveMinTempBeats).toBe(1);

    cleanupWorkspace(workspaceDir);
  });

  it("resets counter when temperature rises above min + epsilon", async () => {
    const workspaceDir = createWorkspaceDir("refractory-reset-");

    await tickRefractoryCounter({
      workspaceDir,
      currentTemperature: MIN_TEMPERATURE,
    });
    const result = await tickRefractoryCounter({
      workspaceDir,
      currentTemperature: MIN_TEMPERATURE + NEURO_COHERENCE_MIN_TEMPERATURE_EPSILON + 0.01,
    });

    expect(result.newState.consecutiveMinTempBeats).toBe(0);

    cleanupWorkspace(workspaceDir);
  });

  it("does not fire when below the threshold", async () => {
    const workspaceDir = createWorkspaceDir("refractory-subthreshold-");
    let result;

    for (let i = 0; i < AUTO_REFRACTORY_THRESHOLD - 1; i += 1) {
      result = await tickRefractoryCounter({
        workspaceDir,
        currentTemperature: MIN_TEMPERATURE,
      });
    }

    expect(result?.shouldFire).toBe(false);

    cleanupWorkspace(workspaceDir);
  });

  it("fires at the threshold", async () => {
    const workspaceDir = createWorkspaceDir("refractory-threshold-");
    let result;

    for (let i = 0; i < AUTO_REFRACTORY_THRESHOLD; i += 1) {
      result = await tickRefractoryCounter({
        workspaceDir,
        currentTemperature: MIN_TEMPERATURE,
      });
    }

    expect(result?.shouldFire).toBe(true);

    cleanupWorkspace(workspaceDir);
  });

  it("resets counter after firing", async () => {
    const workspaceDir = createWorkspaceDir("refractory-reset-after-fire-");

    for (let i = 0; i < AUTO_REFRACTORY_THRESHOLD; i += 1) {
      await tickRefractoryCounter({
        workspaceDir,
        currentTemperature: MIN_TEMPERATURE,
      });
    }

    const result = await tickRefractoryCounter({
      workspaceDir,
      currentTemperature: MIN_TEMPERATURE,
    });

    expect(result.newState.consecutiveMinTempBeats).toBe(1);

    cleanupWorkspace(workspaceDir);
  });

  it("fails open when readFile throws", async () => {
    const workspaceDir = createWorkspaceDir("refractory-fail-open-");
    const markerPath = path.join(
      workspaceDir,
      ...REFRACTORY_COUNTER_RELATIVE_PATH.split("/"),
    );
    fs.mkdirSync(markerPath, { recursive: true });

    const result = await tickRefractoryCounter({
      workspaceDir,
      currentTemperature: MIN_TEMPERATURE,
    });

    expect(result.shouldFire).toBe(false);

    cleanupWorkspace(workspaceDir);
  });

  it("activates the defibrillator with the requested beats", async () => {
    const workspaceDir = createWorkspaceDir("refractory-defib-");

    await activateDefibrillator({ workspaceDir, beats: 2 });
    const state = await readDefibrillatorState({ workspaceDir });

    expect(state.active).toBe(true);
    expect(state.remainingBeats).toBe(2);
    expect(state.totalBeats).toBe(2);

    cleanupWorkspace(workspaceDir);
  });

  it("does not overwrite an active defibrillator with more remaining beats", async () => {
    const workspaceDir = createWorkspaceDir("refractory-defib-no-overwrite-");
    writeDefibrillatorMarker(workspaceDir, { remainingBeats: 4, totalBeats: 4 });

    await activateDefibrillator({ workspaceDir, beats: 2 });
    const state = await readDefibrillatorState({ workspaceDir });

    expect(state.remainingBeats).toBe(4);

    cleanupWorkspace(workspaceDir);
  });
});
