import { describe, expect, it } from "vitest";
import {
  classifyLoopCause,
  extractLatchedAutonomyPathFromAssistantTexts,
  extractLatchedMoodFromAssistantTexts,
  parseInstinctSignalFromText,
  selectFibonacciDreamEntries,
  shouldInjectActionBindingRetry,
  type DreamEntry,
} from "./attempt.js";

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

describe("assistant tag latching", () => {
  it("latches path from an earlier assistant text when final text is ambiguous", () => {
    const assistantTexts = [
      "<om_path>PLAY</om_path>\n<om_mood>Ich fuehle mich neugierig.</om_mood>",
      "PLAY LEARN MAINTAIN DRIFT NO_OP",
    ];

    expect(extractLatchedAutonomyPathFromAssistantTexts(assistantTexts)).toBe("PLAY");
  });

  it("returns UNKNOWN when no path can be extracted", () => {
    expect(extractLatchedAutonomyPathFromAssistantTexts(["Ich weiss noch nicht."])).toBe("UNKNOWN");
  });

  it("latches mood from earliest tagged assistant text", () => {
    const assistantTexts = [
      "<om_mood>Ich fuehle mich lebendig.</om_mood>",
      "<om_mood>Ich fuehle mich ruhig.</om_mood>",
    ];

    expect(extractLatchedMoodFromAssistantTexts(assistantTexts)).toBe("Ich fuehle mich lebendig.");
  });
});

describe("action binding retry decision", () => {
  it("retries when active path has no tool calls", () => {
    expect(
      shouldInjectActionBindingRetry({
        candidatePath: "PLAY",
        toolCallsTotal: 0,
        assistantText: "<om_path>PLAY</om_path>",
      }),
    ).toBe(true);
  });

  it("retries when path is UNKNOWN and no tools ran", () => {
    expect(
      shouldInjectActionBindingRetry({
        candidatePath: "UNKNOWN",
        toolCallsTotal: 0,
        assistantText: "HEARTBEAT_OK",
      }),
    ).toBe(true);
  });

  it("does not retry UNKNOWN path when NO_OP contract is present", () => {
    expect(
      shouldInjectActionBindingRetry({
        candidatePath: "UNKNOWN",
        toolCallsTotal: 0,
        assistantText:
          "<om_blocker>network unavailable</om_blocker><om_retry_trigger>on reconnect</om_retry_trigger>",
      }),
    ).toBe(false);
  });

  it("does not retry when a tool already ran", () => {
    expect(
      shouldInjectActionBindingRetry({
        candidatePath: "UNKNOWN",
        toolCallsTotal: 1,
        assistantText: "HEARTBEAT_OK",
      }),
    ).toBe(false);
  });
});

describe("loop cause classification", () => {
  it("classifies unresolved path as prompt_bias", () => {
    const result = classifyLoopCause({
      repetitionPressure: 30,
      repeatedPathStreak: 2,
      restingPathStreak: 1,
      playDreamStreak: 0,
      chosenPath: "UNKNOWN",
      chosenPathSource: "final_assistant_text",
      tagFound: false,
      toolCallsTotal: 0,
      energyLevel: 95,
      isSleeping: false,
    });

    expect(result.cause).toBe("prompt_bias");
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("classifies high-latency play loops as tool_latency_bias", () => {
    const result = classifyLoopCause({
      repetitionPressure: 50,
      repeatedPathStreak: 2,
      restingPathStreak: 0,
      playDreamStreak: 3,
      recentToolDurationMsMax: [75_000, 68_000, 62_000],
      chosenPath: "PLAY",
      chosenPathSource: "latched_run_messages",
      tagFound: true,
      toolCallsTotal: 1,
      energyLevel: 92,
      isSleeping: false,
    });

    expect(result.cause).toBe("tool_latency_bias");
  });

  it("classifies low-energy resting streak as no_viable_alt", () => {
    const result = classifyLoopCause({
      repetitionPressure: 45,
      repeatedPathStreak: 1,
      restingPathStreak: 3,
      playDreamStreak: 0,
      chosenPath: "DRIFT",
      chosenPathSource: "latched_run_messages",
      tagFound: true,
      toolCallsTotal: 0,
      energyLevel: 20,
      isSleeping: true,
    });

    expect(result.cause).toBe("no_viable_alt");
  });

  it("classifies repeated active loops as model_habit", () => {
    const result = classifyLoopCause({
      repetitionPressure: 60,
      repeatedPathStreak: 4,
      restingPathStreak: 2,
      playDreamStreak: 0,
      chosenPath: "PLAY",
      chosenPathSource: "latched_run_messages",
      tagFound: true,
      toolCallsTotal: 1,
      energyLevel: 90,
      isSleeping: false,
    });

    expect(result.cause).toBe("model_habit");
  });
});

describe("spinal reflex instinct parsing", () => {
  it("parses instinct xml and normalizes ABORT to HALT", () => {
    const parsed = parseInstinctSignalFromText(
      "<instinct><valence>-1.2</valence><arousal>1.7</arousal><heuristic_impulse>ABORT</heuristic_impulse></instinct>",
    );

    expect(parsed).toBeTruthy();
    expect(parsed?.heuristicImpulse).toBe("HALT");
    expect(parsed?.valence).toBe(-1);
    expect(parsed?.arousal).toBe(1);
  });

  it("returns null when no instinct xml exists", () => {
    expect(parseInstinctSignalFromText("plain whisper without xml")).toBeNull();
  });
});
