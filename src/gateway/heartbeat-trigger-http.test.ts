import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ResolvedGatewayAuth } from "./auth.js";
import * as heartbeatWake from "../infra/heartbeat-wake.js";
import { handleHeartbeatTriggerHttpRequest } from "./heartbeat-trigger-http.js";

async function withTempConfig(params: { cfg: unknown; run: () => Promise<void> }): Promise<void> {
  const prevConfigPath = process.env.OPENCLAW_CONFIG_PATH;
  const prevDisableCache = process.env.OPENCLAW_DISABLE_CONFIG_CACHE;

  const dir = await mkdtemp(path.join(os.tmpdir(), "openclaw-heartbeat-trigger-test-"));
  const configPath = path.join(dir, "openclaw.json");

  process.env.OPENCLAW_CONFIG_PATH = configPath;
  process.env.OPENCLAW_DISABLE_CONFIG_CACHE = "1";

  try {
    await writeFile(configPath, JSON.stringify(params.cfg, null, 2), "utf-8");
    await params.run();
  } finally {
    if (prevConfigPath === undefined) {
      delete process.env.OPENCLAW_CONFIG_PATH;
    } else {
      process.env.OPENCLAW_CONFIG_PATH = prevConfigPath;
    }
    if (prevDisableCache === undefined) {
      delete process.env.OPENCLAW_DISABLE_CONFIG_CACHE;
    } else {
      process.env.OPENCLAW_DISABLE_CONFIG_CACHE = prevDisableCache;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

function createRequest(params: {
  path?: string;
  method?: string;
  authorization?: string;
}): IncomingMessage {
  const headers: Record<string, string> = {
    host: "localhost:18789",
  };
  if (params.authorization) {
    headers.authorization = params.authorization;
  }
  return {
    method: params.method ?? "POST",
    url: params.path ?? "/api/heartbeat/trigger",
    headers,
    socket: { remoteAddress: "127.0.0.1" },
  } as IncomingMessage;
}

function createResponse(): {
  res: ServerResponse;
  setHeader: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  getBody: () => string;
} {
  const setHeader = vi.fn();
  let body = "";
  const end = vi.fn((chunk?: unknown) => {
    if (typeof chunk === "string") {
      body = chunk;
      return;
    }
    if (chunk == null) {
      body = "";
      return;
    }
    body = JSON.stringify(chunk);
  });
  const res = {
    headersSent: false,
    statusCode: 200,
    setHeader,
    end,
  } as unknown as ServerResponse;
  return {
    res,
    setHeader,
    end,
    getBody: () => body,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("heartbeat trigger HTTP endpoint", () => {
  const resolvedAuth: ResolvedGatewayAuth = {
    mode: "token",
    token: "test-token",
    password: undefined,
    allowTailscale: false,
  };

  test("ignores unrelated paths", async () => {
    const response = createResponse();
    const handled = await handleHeartbeatTriggerHttpRequest(
      createRequest({ path: "/api/not-heartbeat" }),
      response.res,
      { auth: resolvedAuth, trustedProxies: [] },
    );
    expect(handled).toBe(false);
    expect(response.end).not.toHaveBeenCalled();
  });

  test("requires POST", async () => {
    const response = createResponse();
    const handled = await handleHeartbeatTriggerHttpRequest(
      createRequest({ method: "GET" }),
      response.res,
      { auth: resolvedAuth, trustedProxies: [] },
    );
    expect(handled).toBe(true);
    expect(response.res.statusCode).toBe(405);
    expect(response.setHeader).toHaveBeenCalledWith("Allow", "POST");
  });

  test("requires gateway auth", async () => {
    await withTempConfig({
      cfg: { gateway: { trustedProxies: [] } },
      run: async () => {
        const response = createResponse();
        const handled = await handleHeartbeatTriggerHttpRequest(
          createRequest({ authorization: undefined }),
          response.res,
          { auth: resolvedAuth, trustedProxies: [] },
        );
        expect(handled).toBe(true);
        expect(response.res.statusCode).toBe(401);
        expect(response.getBody()).toContain("Unauthorized");
      },
    });
  });

  test("triggers heartbeat and returns the run result", async () => {
    await withTempConfig({
      cfg: { gateway: { trustedProxies: [] } },
      run: async () => {
        const wakeSpy = vi
          .spyOn(heartbeatWake, "requestHeartbeatNowAndWait")
          .mockResolvedValue({ status: "ran", durationMs: 12 });
        const response = createResponse();
        const handled = await handleHeartbeatTriggerHttpRequest(
          createRequest({ authorization: "Bearer test-token" }),
          response.res,
          { auth: resolvedAuth, trustedProxies: [] },
        );

        expect(handled).toBe(true);
        expect(response.res.statusCode).toBe(200);
        expect(wakeSpy).toHaveBeenCalledWith({
          reason: "manual",
          coalesceMs: 0,
          timeoutMs: 30000,
        });

        const body = JSON.parse(response.getBody()) as {
          ok: boolean;
          result: { status: string; durationMs?: number };
        };
        expect(body.ok).toBe(true);
        expect(body.result.status).toBe("ran");
        expect(body.result.durationMs).toBe(12);
      },
    });
  });
});
