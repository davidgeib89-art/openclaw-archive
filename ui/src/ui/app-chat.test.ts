import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetChatSession } from "./app-chat.ts";

type RequestFn = ReturnType<typeof vi.fn>;

function createHost(request: RequestFn) {
  return {
    connected: true,
    client: { request },
    lastError: null as string | null,
    chatMessage: "draft",
    chatAttachments: [],
    chatQueue: [{ id: "q1", text: "queued", createdAt: Date.now() }],
    chatRunId: "run-1",
    chatSending: true,
    chatLoading: false,
    chatMessages: [{ role: "user", content: [{ type: "text", text: "old" }] }],
    chatToolMessages: [{ role: "tool", content: [{ type: "text", text: "old-tool" }] }],
    chatThinkingLevel: null as string | null,
    chatStream: "streaming",
    chatStreamStartedAt: Date.now(),
    sessionKey: "main",
    basePath: "",
    hello: null,
    chatAvatarUrl: null as string | null,
    refreshSessionsAfterChat: new Set<string>(),
    settings: {
      gatewayUrl: "ws://127.0.0.1:18789",
      token: "",
      sessionKey: "main",
      lastActiveSessionKey: "main",
      theme: "system",
      chatFocusMode: false,
      chatShowThinking: true,
      splitRatio: 0.6,
      navCollapsed: false,
      navGroupsCollapsed: {},
    },
    theme: "system" as const,
    themeResolved: "dark" as const,
    applySessionKey: "main",
  } as unknown as Parameters<typeof resetChatSession>[0] & {
    client: { request: RequestFn };
    lastError: string | null;
    chatMessages: unknown[];
    chatToolMessages: unknown[];
    settings: { lastActiveSessionKey: string };
  };
}

describe("resetChatSession", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resets the active session via sessions.reset and reloads chat history", async () => {
    const request = vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method === "sessions.reset") {
        expect(params).toEqual({ key: "main" });
        return { ok: true, key: "agent:main:main" };
      }
      if (method === "chat.history") {
        expect(params).toEqual({ sessionKey: "agent:main:main", limit: 200 });
        return {
          messages: [{ role: "assistant", content: [{ type: "text", text: "fresh" }] }],
          thinkingLevel: "off",
        };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const host = createHost(request);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch,
    );

    const ok = await resetChatSession(host);

    expect(ok).toBe(true);
    expect(request).toHaveBeenCalledWith("sessions.reset", { key: "main" });
    expect(request).toHaveBeenCalledWith("chat.history", {
      sessionKey: "agent:main:main",
      limit: 200,
    });
    expect(host.sessionKey).toBe("agent:main:main");
    expect(host.chatRunId).toBeNull();
    expect(host.chatSending).toBe(false);
    expect(host.chatStream).toBeNull();
    expect(host.chatStreamStartedAt).toBeNull();
    expect(host.chatQueue).toEqual([]);
    expect(host.chatMessages).toEqual([
      {
        role: "assistant",
        content: [{ type: "text", text: "fresh" }],
      },
    ]);
    expect(host.chatToolMessages).toEqual([]);
    expect(host.settings.lastActiveSessionKey).toBe("agent:main:main");
    expect(host.lastError).toBeNull();
  });

  it("surfaces reset errors and keeps existing chat state", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "sessions.reset") {
        throw new Error("reset failed");
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const host = createHost(request);
    const originalMessages = host.chatMessages;
    const originalQueue = host.chatQueue;

    const ok = await resetChatSession(host);

    expect(ok).toBe(false);
    expect(host.lastError).toContain("reset failed");
    expect(host.chatMessages).toBe(originalMessages);
    expect(host.chatQueue).toBe(originalQueue);
  });
});
