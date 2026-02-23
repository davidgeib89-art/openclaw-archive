import { describe, expect, it } from "vitest";
import { selectFibonacciDreamEntries, type DreamEntry } from "./attempt.js";

describe("fibonacci dream recall", () => {
  it("selects entries at Fibonacci offsets from the end", () => {
    const entries: DreamEntry[] = Array.from({ length: 10 }, (_, i) => ({
      insight: `insight-${i}`,
      actionHint: `hint-${i}`,
      noveltyDelta: `delta-${i}`,
    }));

    const selected = selectFibonacciDreamEntries(entries, 5);

    // Offsets 1,2,3,5,8 from end = indices 9,8,7,5,2
    // Reversed to chronological: indices 2,5,7,8,9
    expect(selected).toHaveLength(5);
    expect(selected[0]?.insight).toBe("insight-2");
    expect(selected[1]?.insight).toBe("insight-5");
    expect(selected[2]?.insight).toBe("insight-7");
    expect(selected[3]?.insight).toBe("insight-8");
    expect(selected[4]?.insight).toBe("insight-9");
  });

  it("gracefully handles fewer entries than Fibonacci slots", () => {
    const entries: DreamEntry[] = [
      { insight: "only-one", actionHint: "hint", noveltyDelta: "delta" },
    ];

    const selected = selectFibonacciDreamEntries(entries, 5);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.insight).toBe("only-one");
  });

  it("returns empty array for no entries", () => {
    expect(selectFibonacciDreamEntries([], 5)).toHaveLength(0);
  });

  it("deduplicates overlapping Fibonacci indices for small arrays", () => {
    const entries: DreamEntry[] = Array.from({ length: 3 }, (_, i) => ({
      insight: `insight-${i}`,
      actionHint: `hint-${i}`,
      noveltyDelta: `delta-${i}`,
    }));

    const selected = selectFibonacciDreamEntries(entries, 5);

    expect(selected).toHaveLength(3);
    expect(selected[0]?.insight).toBe("insight-0");
    expect(selected[1]?.insight).toBe("insight-1");
    expect(selected[2]?.insight).toBe("insight-2");
  });
});
