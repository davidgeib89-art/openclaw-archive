import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import { loadConfig } from "../config/config.js";
import { requestHeartbeatNowAndWait } from "../infra/heartbeat-wake.js";
import { authorizeGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import { sendGatewayAuthFailure, sendJson, sendMethodNotAllowed } from "./http-common.js";
import { getBearerToken } from "./http-utils.js";

const HEARTBEAT_TRIGGER_PATH = "/api/heartbeat/trigger";
const HEARTBEAT_TRIGGER_TIMEOUT_MS = 30_000;

export async function handleHeartbeatTriggerHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: {
    auth: ResolvedGatewayAuth;
    trustedProxies?: string[];
    rateLimiter?: AuthRateLimiter;
  },
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (url.pathname !== HEARTBEAT_TRIGGER_PATH) {
    return false;
  }

  if (req.method !== "POST") {
    sendMethodNotAllowed(res, "POST");
    return true;
  }

  const cfg = loadConfig();
  const token = getBearerToken(req);
  const authResult = await authorizeGatewayConnect({
    auth: opts.auth,
    connectAuth: token ? { token, password: token } : null,
    req,
    trustedProxies: opts.trustedProxies ?? cfg.gateway?.trustedProxies,
    rateLimiter: opts.rateLimiter,
  });
  if (!authResult.ok) {
    sendGatewayAuthFailure(res, authResult);
    return true;
  }

  const result = await requestHeartbeatNowAndWait({
    reason: "manual",
    coalesceMs: 0,
    timeoutMs: HEARTBEAT_TRIGGER_TIMEOUT_MS,
  });

  sendJson(res, 200, { ok: true, result });
  return true;
}
