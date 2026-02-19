import { describe, expect, it } from "vitest";
import { buildWisdomLayerAdvisory } from "./wisdom-layer.js";

describe("wisdom layer advisory", () => {
  it("returns read-only advisory entries when enabled", () => {
    delete process.env.OM_WISDOM_LAYER_ENABLED;

    const result = buildWisdomLayerAdvisory({
      route: "project",
      recalledItemsCount: 1,
      memoryIndexFactsCount: 1,
      dreamFactsCount: 0,
      graphFactsCount: 1,
    });

    expect(result.enabled).toBe(true);
    expect(result.readOnly).toBe(true);
    expect(result.items).toHaveLength(4);
    expect(result.items[0]).toContain("Systems Thinking");
    expect(result.items[1]).toContain("Chaos Theory");
    expect(result.items[2]).toContain("Karma");
    expect(result.items[3]).toContain("Complexity Sentinel");
  });

  it("can be disabled via env toggle", () => {
    process.env.OM_WISDOM_LAYER_ENABLED = "false";

    const result = buildWisdomLayerAdvisory({
      route: "identity",
      recalledItemsCount: 1,
      memoryIndexFactsCount: 0,
      dreamFactsCount: 0,
      graphFactsCount: 0,
    });

    expect(result.enabled).toBe(false);
    expect(result.readOnly).toBe(true);
    expect(result.items).toHaveLength(0);
  });
});
