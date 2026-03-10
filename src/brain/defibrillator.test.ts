import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { consumeDefibrillatorBeat, readDefibrillatorState } from "./defibrillator.js";

function writeMarker(workspaceDir: string, payload: unknown): string {
  const markerPath = path.join(workspaceDir, "logs", "brain", "defibrillator.json");
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify(payload), "utf-8");
  return markerPath;
}

describe("defibrillator", () => {
  it("consumes beats and clears the marker when finished", async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "defibrillator-"));
    const markerPath = writeMarker(workspaceDir, { remainingBeats: 2 });

    const first = await consumeDefibrillatorBeat({ workspaceDir });
    expect(first.active).toBe(true);
    expect(first.remainingBeats).toBe(1);
    expect(fs.existsSync(markerPath)).toBe(true);

    const second = await consumeDefibrillatorBeat({ workspaceDir });
    expect(second.active).toBe(true);
    expect(second.remainingBeats).toBe(0);
    expect(fs.existsSync(markerPath)).toBe(false);

    const inactive = await readDefibrillatorState({ workspaceDir });
    expect(inactive.active).toBe(false);

    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("treats invalid marker data as inactive", async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "defibrillator-invalid-"));
    const markerPath = path.join(workspaceDir, "logs", "brain", "defibrillator.json");
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, "{not:valid", "utf-8");

    const state = await readDefibrillatorState({ workspaceDir });
    expect(state.active).toBe(false);

    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });
});
