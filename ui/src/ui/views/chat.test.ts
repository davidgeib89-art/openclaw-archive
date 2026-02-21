import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { SessionsListResult } from "../types.ts";
import { renderChat, type ChatProps } from "./chat.ts";

function createSessions(): SessionsListResult {
  return {
    ts: 0,
    path: "",
    count: 0,
    defaults: { model: null, contextTokens: null },
    sessions: [],
  };
}

function createProps(overrides: Partial<ChatProps> = {}): ChatProps {
  return {
    sessionKey: "main",
    onSessionKeyChange: () => undefined,
    thinkingLevel: null,
    showThinking: false,
    loading: false,
    sending: false,
    canAbort: false,
    compactionStatus: null,
    messages: [],
    toolMessages: [],
    stream: null,
    streamStartedAt: null,
    assistantAvatarUrl: null,
    draft: "",
    queue: [],
    connected: true,
    canSend: true,
    disabledReason: null,
    error: null,
    sessions: createSessions(),
    focusMode: false,
    assistantName: "OpenClaw",
    assistantAvatar: null,
    onRefresh: () => undefined,
    onToggleFocusMode: () => undefined,
    onDraftChange: () => undefined,
    onSend: () => undefined,
    onQueueRemove: () => undefined,
    onNewSession: () => undefined,
    ...overrides,
  };
}

describe("chat view", () => {
  it("renders compacting indicator as a badge", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          compactionStatus: {
            active: true,
            startedAt: Date.now(),
            completedAt: null,
          },
        }),
      ),
      container,
    );

    const indicator = container.querySelector(".compaction-indicator--active");
    expect(indicator).not.toBeNull();
    expect(indicator?.textContent).toContain("Compacting context...");
  });

  it("renders completion indicator shortly after compaction", () => {
    const container = document.createElement("div");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    render(
      renderChat(
        createProps({
          compactionStatus: {
            active: false,
            startedAt: 900,
            completedAt: 900,
          },
        }),
      ),
      container,
    );

    const indicator = container.querySelector(".compaction-indicator--complete");
    expect(indicator).not.toBeNull();
    expect(indicator?.textContent).toContain("Context compacted");
    nowSpy.mockRestore();
  });

  it("hides stale compaction completion indicator", () => {
    const container = document.createElement("div");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(10_000);
    render(
      renderChat(
        createProps({
          compactionStatus: {
            active: false,
            startedAt: 0,
            completedAt: 0,
          },
        }),
      ),
      container,
    );

    expect(container.querySelector(".compaction-indicator")).toBeNull();
    nowSpy.mockRestore();
  });

  it("shows a stop button when aborting is available", () => {
    const container = document.createElement("div");
    const onAbort = vi.fn();
    render(
      renderChat(
        createProps({
          canAbort: true,
          onAbort,
        }),
      ),
      container,
    );

    const stopButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "Stop",
    );
    expect(stopButton).not.toBeUndefined();
    stopButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("New session");
  });

  it("shows a new session button when aborting is unavailable", () => {
    const container = document.createElement("div");
    const onNewSession = vi.fn();
    render(
      renderChat(
        createProps({
          canAbort: false,
          onNewSession,
        }),
      ),
      container,
    );

    const newSessionButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "New session",
    );
    expect(newSessionButton).not.toBeUndefined();
    newSessionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onNewSession).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("Stop");
  });

  it("renders heartbeat button next to compose controls", () => {
    const container = document.createElement("div");
    const onHeartbeatTrigger = vi.fn();
    render(
      renderChat(
        createProps({
          onHeartbeatTrigger,
          heartbeatTriggerRunning: false,
        }),
      ),
      container,
    );

    const heartbeatButton = container.querySelector(
      'button.chat-heartbeat[aria-label="Trigger heartbeat now"]',
    ) as HTMLButtonElement | null;
    expect(heartbeatButton).not.toBeNull();
    heartbeatButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onHeartbeatTrigger).toHaveBeenCalledTimes(1);
  });

  it("renders thought stream timeline entries", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          thoughtEvents: [
            {
              id: "thought-1",
              runId: "run-1",
              seq: 1,
              ts: Date.now(),
              label: "INTENT",
              summary: "intent=research; mustAskUser=no",
              stream: "reasoning",
            },
            {
              id: "thought-2",
              runId: "run-1",
              seq: 2,
              ts: Date.now(),
              label: "RISK",
              summary: "risk=medium because command touches workspace",
              risk: "medium",
              stream: "reasoning",
            },
          ],
        }),
      ),
      container,
    );

    expect(container.querySelector(".chat-thought-monitor")).not.toBeNull();
    expect(container.textContent).toContain("INTENT");
    expect(container.textContent).toContain("RISK");
    expect(container.querySelector(".chat-thought-monitor__risk--medium")).not.toBeNull();
    expect(container.querySelector(".chat-thought-monitor__stream--reasoning")).not.toBeNull();
  });

  it("renders heartbeat status panel with explicit cycle and known mutation budget", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          thoughtEvents: [
            {
              id: "thought-cycle",
              runId: "run-2",
              seq: 1,
              ts: 1_000,
              label: "CYCLE",
              summary: "cycle=DRIFT",
              stream: "reasoning",
            },
          ],
          toolMessages: [
            {
              content: "heartbeat mutation budget 2/33",
              timestamp: 1_001,
            },
          ],
        }),
      ),
      container,
    );

    const panel = container.querySelector(".chat-heartbeat-panel");
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("Current cycle: DRIFT");
    expect(panel?.textContent).toContain("DRIFT active");
    expect(panel?.textContent).toContain("2/33");
    expect(panel?.textContent).toContain("31 left");
    expect(panel?.textContent).toContain("high");
  });

  it("shows unknown mutation budget when no budget signal is visible", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          thoughtEvents: [
            {
              id: "thought-play",
              runId: "run-3",
              seq: 1,
              ts: 2_000,
              label: "CYCLE",
              summary: "path=PLAY",
              stream: "reasoning",
            },
          ],
        }),
      ),
      container,
    );

    const panel = container.querySelector(".chat-heartbeat-panel");
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("Current cycle: PLAY");
    expect(panel?.textContent).toContain("Budget not exposed in UI-only mode");
  });

  it("opens sidebar detail from heartbeat status panel", () => {
    const container = document.createElement("div");
    const onOpenSidebar = vi.fn();
    render(
      renderChat(
        createProps({
          onOpenSidebar,
          thoughtEvents: [
            {
              id: "thought-maintain",
              runId: "run-4",
              seq: 1,
              ts: 3_000,
              label: "CYCLE",
              summary: "selected=MAINTAIN",
              stream: "reasoning",
            },
          ],
          toolMessages: [
            {
              content: "heartbeat mutation budget 4/33",
              timestamp: 3_001,
            },
          ],
        }),
      ),
      container,
    );

    const detailButton = container.querySelector(
      ".chat-heartbeat-panel__detail-btn",
    ) as HTMLButtonElement | null;
    expect(detailButton).not.toBeNull();
    detailButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onOpenSidebar).toHaveBeenCalledTimes(1);
    const markdown = onOpenSidebar.mock.calls[0]?.[0];
    expect(markdown).toContain("Heartbeat Status Snapshot");
    expect(markdown).toContain("cycle_path: `MAINTAIN`");
    expect(markdown).toContain("mutation_budget: `4/33 (remaining 29)`");
  });

  it("renders thought stream history with explicit end state", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          thoughtHistory: [
            {
              trace: {
                version: 1,
                runId: "run-history-1",
                sessionKey: "main",
                capturedAt: 4_000,
                stepCount: 2,
                steps: [
                  {
                    seq: 1,
                    ts: 4_000,
                    label: "Goal",
                    stream: "reasoning",
                    summary: "Goal recognized",
                  },
                  {
                    seq: 2,
                    ts: 4_001,
                    label: "Choice",
                    stream: "reasoning",
                    summary: "Chose direct answer path",
                  },
                ],
              },
              endedState: "final",
              endedAt: 4_005,
              messageTimestamp: 4_010,
            },
          ],
        }),
      ),
      container,
    );

    const panel = container.querySelector(".chat-thought-history");
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("Thought Stream History");
    expect(panel?.textContent).toContain("final");
    expect(panel?.textContent).toContain("Goal -> Choice");
    expect(panel?.textContent).toContain("2 steps");
  });

  it("restores thought trace button for assistant messages from history cache", () => {
    const container = document.createElement("div");
    const onOpenSidebar = vi.fn();
    render(
      renderChat(
        createProps({
          onOpenSidebar,
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "Recovered trace message" }],
              timestamp: 9_001,
            },
          ],
          thoughtHistory: [
            {
              trace: {
                version: 1,
                runId: "run-trace-restore",
                sessionKey: "main",
                capturedAt: 9_000,
                stepCount: 1,
                steps: [
                  {
                    seq: 1,
                    ts: 9_000,
                    label: "Goal",
                    stream: "reasoning",
                    summary: "Goal recognized",
                  },
                ],
              },
              endedState: "final",
              endedAt: 9_002,
              messageTimestamp: 9_001,
            },
          ],
        }),
      ),
      container,
    );

    const traceButton = container.querySelector(".chat-trace-btn") as HTMLButtonElement | null;
    expect(traceButton).not.toBeNull();
    traceButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onOpenSidebar).toHaveBeenCalledTimes(1);
    expect(onOpenSidebar.mock.calls[0]?.[0]).toContain("Thought Trace");
    expect(onOpenSidebar.mock.calls[0]?.[0]).toContain("run-trace-restore");
  });
});
