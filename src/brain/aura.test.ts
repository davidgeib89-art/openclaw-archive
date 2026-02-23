import { describe, expect, it } from "vitest";
import {
  buildAuraFileContent,
  buildAuraSummary,
  calculateAura,
  countGenerativePaths,
  moodSentiment,
  type AuraInput,
} from "./aura.js";

function createNeutralInput(overrides: Partial<AuraInput> = {}): AuraInput {
  return {
    energyLevel: 50,
    energyMode: "active",
    recentEnergyLevels: [50, 51, 49, 50],
    moodText: "",
    recentPaths: ["MAINTAIN", "NO_OP", "LEARN", "DRIFT"],
    excitementOverrideRate: null,
    autonomyLevel: "L1",
    hasUserMessage: false,
    recentUserMessageCount: 1,
    subconsciousCharge: 3,
    apopheniaGenerated: false,
    recentApopheniaCount: 1,
    isSleeping: false,
    sleepPressure: 20,
    epochCount: 0,
    lastEpochHealthy: false,
    heartbeatCount: 20,
    lastOutputTokens: 150,
    now: "2026-02-23T10:00:00.000Z",
    ...overrides,
  };
}

describe("aura", () => {
  describe("moodSentiment", () => {
    it("returns 90 for highly positive mood terms", () => {
      expect(moodSentiment("Ich bin glücklich")).toBe(90);
    });

    it("returns 70 for medium positive mood terms", () => {
      expect(moodSentiment("Mir geht es gut")).toBe(70);
    });

    it("returns 50 for neutral or empty text", () => {
      expect(moodSentiment("")).toBe(50);
    });

    it("returns 30 for low-energy mood terms", () => {
      expect(moodSentiment("Ich bin müde")).toBe(30);
    });

    it("returns 15 for strongly negative mood terms", () => {
      expect(moodSentiment("Ich fühle mich leer")).toBe(15);
    });

    it("uses the highest matching score when mixed terms exist", () => {
      expect(moodSentiment("Ich bin müde aber neugierig")).toBe(70);
    });

    it("matches case-insensitively", () => {
      expect(moodSentiment("BEGEISTERT")).toBe(90);
    });
  });

  describe("countGenerativePaths", () => {
    it("counts PLAY/DRIFT as generative paths", () => {
      expect(countGenerativePaths(["PLAY", "PLAY", "LEARN"])).toBeGreaterThan(0);
    });

    it("returns 0 when no generative paths exist", () => {
      expect(countGenerativePaths(["LEARN", "MAINTAIN", "NO_OP"])).toBe(0);
    });

    it("returns 0 for an empty array", () => {
      expect(countGenerativePaths([])).toBe(0);
    });
  });

  describe("calculateAura", () => {
    it("keeps neutral telemetry in a non-extreme range", () => {
      const snapshot = calculateAura(createNeutralInput());
      const values = [
        snapshot.chakras.muladhara,
        snapshot.chakras.svadhisthana,
        snapshot.chakras.manipura,
        snapshot.chakras.anahata,
        snapshot.chakras.vishuddha,
        snapshot.chakras.ajna,
        snapshot.chakras.sahasrara,
      ];
      for (const value of values) {
        expect(value).toBeGreaterThanOrEqual(30);
        expect(value).toBeLessThanOrEqual(70);
      }
    });

    it("raises C1 with high and stable energy", () => {
      const snapshot = calculateAura(
        createNeutralInput({
          energyLevel: 95,
          recentEnergyLevels: [95, 95, 94, 96],
        }),
      );
      expect(snapshot.chakras.muladhara).toBeGreaterThan(80);
    });

    it("lowers C1 with low energy and high variance", () => {
      const snapshot = calculateAura(
        createNeutralInput({
          energyLevel: 10,
          recentEnergyLevels: [0, 100, 0, 100],
        }),
      );
      expect(snapshot.chakras.muladhara).toBeLessThan(30);
    });

    it("raises C6 with high subconscious charge and active apophenia", () => {
      const snapshot = calculateAura(
        createNeutralInput({
          subconsciousCharge: 8,
          apopheniaGenerated: true,
          recentApopheniaCount: 4,
        }),
      );
      expect(snapshot.chakras.ajna).toBeGreaterThan(70);
    });

    it("keeps C6 low with no charge and no apophenia", () => {
      const snapshot = calculateAura(
        createNeutralInput({
          subconsciousCharge: 0,
          apopheniaGenerated: false,
          recentApopheniaCount: 0,
        }),
      );
      expect(snapshot.chakras.ajna).toBeLessThan(40);
    });

    it("computes Faggin aggregation from chakra groups", () => {
      const snapshot = calculateAura(createNeutralInput());
      const expectedBody =
        (snapshot.chakras.muladhara + snapshot.chakras.svadhisthana + snapshot.chakras.manipura) / 3;
      const expectedMind = (snapshot.chakras.anahata + snapshot.chakras.vishuddha) / 2;
      const expectedSpirit = (snapshot.chakras.ajna + snapshot.chakras.sahasrara) / 2;

      expect(snapshot.faggin.body).toBeCloseTo(expectedBody, 1);
      expect(snapshot.faggin.mind).toBeCloseTo(expectedMind, 1);
      expect(snapshot.faggin.spirit).toBeCloseTo(expectedSpirit, 1);
    });

    it("returns overall score in [0,100]", () => {
      const snapshot = calculateAura(createNeutralInput());
      expect(snapshot.overall).toBeGreaterThanOrEqual(0);
      expect(snapshot.overall).toBeLessThanOrEqual(100);
    });
  });

  describe("buildAuraSummary", () => {
    it("returns a summary that contains aura prefix", () => {
      const summary = buildAuraSummary(calculateAura(createNeutralInput()));
      expect(summary).toContain("aura:");
    });

    it("contains RGB and overall fields", () => {
      const summary = buildAuraSummary(calculateAura(createNeutralInput()));
      expect(summary).toContain("RGB=");
      expect(summary).toContain("overall=");
    });
  });

  describe("buildAuraFileContent", () => {
    it("returns markdown with title", () => {
      const content = buildAuraFileContent(calculateAura(createNeutralInput()));
      expect(content).toContain("# Om's Aura");
    });

    it("contains first and last chakra names", () => {
      const content = buildAuraFileContent(calculateAura(createNeutralInput()));
      expect(content).toContain("Muladhara");
      expect(content).toContain("Sahasrara");
    });
  });
});
