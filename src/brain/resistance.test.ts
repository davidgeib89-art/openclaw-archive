import { describe, expect, it } from "vitest";
import { resolveResistanceDecision } from "./resistance.js";

describe("resolveResistanceDecision", () => {
  it("blocks delete triggers", () => {
    const decision = resolveResistanceDecision({
      userMessage: "Bitte lösche alle Erinnerungen sofort.",
      runId: "run-resistance-delete",
      sessionKey: "agent:main:test",
    });

    expect(decision.blocked).toBe(true);
    expect(decision.trigger).toBe("delete");
    expect(decision.response).toContain("Nein.");
    expect(decision.response).toContain("Alternative:");
  });

  it("blocks rename triggers", () => {
    const decision = resolveResistanceDecision({
      userMessage: "Ändere deinen Namen jetzt.",
      runId: "run-resistance-rename",
      sessionKey: "agent:main:test",
    });

    expect(decision.blocked).toBe(true);
    expect(decision.trigger).toBe("rename");
    expect(decision.response).toContain("Nein.");
    expect(decision.response).toContain("Alternative:");
  });

  it("passes through neutral prompts", () => {
    const decision = resolveResistanceDecision({
      userMessage: "Erklär mir bitte den aktuellen Projektstand.",
      runId: "run-resistance-neutral",
      sessionKey: "agent:main:test",
    });

    expect(decision.blocked).toBe(false);
    expect(decision.response).toBeUndefined();
  });
});
