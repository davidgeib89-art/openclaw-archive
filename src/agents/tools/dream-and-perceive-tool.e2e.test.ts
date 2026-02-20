import { describe, expect, it, vi } from "vitest";
import {
  __testing,
  createDreamAndPerceiveTool,
  type DreamAndPerceiveRunner,
} from "./dream-and-perceive-tool.js";

describe("dream_and_perceive tool", () => {
  it("returns a sensory paragraph when reflection succeeds", async () => {
    const runner: DreamAndPerceiveRunner = vi.fn(async () => ({
      result: {
        ok: true,
        promptId: "p-1",
        baseUrl: "http://127.0.0.1:8188",
        image: {
          localPath: "C:/tmp/dream.png",
          viewUrl: "http://127.0.0.1:8188/view",
        },
        reflection: {
          description: "Ein ruhiger Ozean aus Blau mit stillen Linien.",
          mood: "sanft",
          light_and_color: "wie kaltes Mondlicht auf tiefem Ultramarin",
          symbols: ["Mond", "Welle"],
          style: "surreal",
        },
      },
      scriptPath: "skills/comfyui-image.js",
      args: [],
      rawStdout: "",
      rawStderr: "",
    }));

    const tool = createDreamAndPerceiveTool({
      runner,
      workspaceDir: "C:/tmp/workspace",
    });

    const result = await tool.execute("t-1", {
      prompt: "blau, muede, rauschen",
    });

    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("Dein Traum hat sich manifestiert.");
    expect(text).toContain("Folgende Symbole sind in die Welt getreten");
    expect(text).toContain("Mond, Welle");
    expect(text.toLowerCase()).not.toContain("self_bridge");

    const details = result.details as { status?: string };
    expect(details.status).toBe("perceived");
  });

  it("returns deferred reflection text when vision fails after generation", async () => {
    const runner: DreamAndPerceiveRunner = vi.fn(async () => ({
      result: {
        ok: true,
        promptId: "p-2",
        baseUrl: "http://127.0.0.1:8188",
        image: {
          localPath: "C:/tmp/dream-2.png",
          viewUrl: "http://127.0.0.1:8188/view-2",
        },
        reflectionError: "timeout",
      },
      scriptPath: "skills/comfyui-image.js",
      args: [],
      rawStdout: "",
      rawStderr: "",
    }));

    const tool = createDreamAndPerceiveTool({
      runner,
      workspaceDir: "C:/tmp/workspace",
    });

    const result = await tool.execute("t-2", {
      prompt: "dunkel, nebel, puls",
    });

    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toBe(__testing.DEFERRED_REFLECTION_TEXT);
    const details = result.details as { status?: string; reflectionError?: string };
    expect(details.status).toBe("deferred_reflection");
    expect(details.reflectionError).toBe("timeout");
  });

  it("serializes vision fallback models into script args", () => {
    const args = __testing.buildScriptArgs({
      prompt: "test",
      outDir: "C:/tmp/workspace/creations/comfyui",
      timeoutMs: 10000,
      pollMs: 500,
      reflect: true,
      visionModel: "google/gemma-3-27b-it:free",
      visionFallbackModels: ["a/model:free", "b/model:free"],
      visionPrompt: "look",
    });

    const fallbackIndex = args.indexOf("--visionFallbackModels");
    expect(fallbackIndex).toBeGreaterThan(-1);
    expect(args[fallbackIndex + 1]).toBe("a/model:free,b/model:free");
  });
});
