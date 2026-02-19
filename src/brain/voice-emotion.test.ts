import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveVoiceEmotionConfig,
  resolveVoiceEmotionForWorkspace,
  toVoiceEmotionTtsOverrides,
} from "./voice-emotion.js";

const tempDirs: string[] = [];

async function createWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-voice-emotion-"));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, "knowledge", "sacred"), { recursive: true });
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("resolveVoiceEmotionConfig", () => {
  it("maps negative mood to grounded/calm profile", () => {
    const result = resolveVoiceEmotionConfig("müde erschöpft überfordert");
    expect(["grounded", "calm"]).toContain(result.config.profile);
    expect(result.config.speed).toBeLessThan(1);
  });

  it("maps positive mood to uplifted/energized profile", () => {
    const result = resolveVoiceEmotionConfig("calm focused creative energized");
    expect(["uplifted", "energized"]).toContain(result.config.profile);
    expect(result.config.speed).toBeGreaterThanOrEqual(1.05);
  });

  it("builds TTS overrides for edge and elevenlabs", () => {
    const result = resolveVoiceEmotionConfig("focused and curious");
    const overrides = toVoiceEmotionTtsOverrides(result.config);
    expect(overrides.edge.rate).toBeTruthy();
    expect(overrides.edge.pitch).toBeTruthy();
    expect(overrides.edge.volume).toBeTruthy();
    expect(overrides.elevenlabs.voiceSettings.speed).toBe(result.config.speed);
  });
});

describe("resolveVoiceEmotionForWorkspace", () => {
  it("reads MOOD.md from workspace", async () => {
    const workspace = await createWorkspace();
    const moodPath = path.join(workspace, "knowledge", "sacred", "MOOD.md");
    await fs.writeFile(moodPath, "calm focused creative", "utf-8");

    const result = await resolveVoiceEmotionForWorkspace(workspace);

    expect(result.moodPath).toBe(moodPath);
    expect(result.moodExcerpt).toContain("calm focused creative");
    expect(["neutral", "uplifted", "energized"]).toContain(result.config.profile);
  });
});
