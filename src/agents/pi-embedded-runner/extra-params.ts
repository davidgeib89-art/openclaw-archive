import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { SimpleStreamOptions } from "@mariozechner/pi-ai";
import { streamSimple } from "@mariozechner/pi-ai";
import type { OpenClawConfig } from "../../config/config.js";
import { log } from "./logger.js";

const OPENROUTER_APP_HEADERS: Record<string, string> = {
  "HTTP-Referer": "https://openclaw.ai",
  "X-Title": "OpenClaw",
};

/**
 * Resolve provider-specific extra params from model config.
 * Used to pass through stream params like temperature/maxTokens.
 *
 * @internal Exported for testing only
 */
export function resolveExtraParams(params: {
  cfg: OpenClawConfig | undefined;
  provider: string;
  modelId: string;
}): Record<string, unknown> | undefined {
  const modelKey = `${params.provider}/${params.modelId}`;
  const modelConfig = params.cfg?.agents?.defaults?.models?.[modelKey];
  return modelConfig?.params ? { ...modelConfig.params } : undefined;
}

type CacheRetention = "none" | "short" | "long";
type CacheRetentionStreamOptions = Partial<SimpleStreamOptions> & {
  cacheRetention?: CacheRetention;
  include_reasoning?: boolean;
};

/**
 * Resolve cacheRetention from extraParams, supporting both new `cacheRetention`
 * and legacy `cacheControlTtl` values for backwards compatibility.
 *
 * Mapping: "5m" → "short", "1h" → "long"
 *
 * Only applies to Anthropic provider (OpenRouter uses openai-completions API
 * with hardcoded cache_control, not the cacheRetention stream option).
 */
function resolveCacheRetention(
  extraParams: Record<string, unknown> | undefined,
  provider: string,
): CacheRetention | undefined {
  if (provider !== "anthropic") {
    return undefined;
  }

  // Prefer new cacheRetention if present
  const newVal = extraParams?.cacheRetention;
  if (newVal === "none" || newVal === "short" || newVal === "long") {
    return newVal;
  }

  // Fall back to legacy cacheControlTtl with mapping
  const legacy = extraParams?.cacheControlTtl;
  if (legacy === "5m") {
    return "short";
  }
  if (legacy === "1h") {
    return "long";
  }
  return undefined;
}

function createStreamFnWithExtraParams(
  baseStreamFn: StreamFn | undefined,
  extraParams: Record<string, unknown> | undefined,
  provider: string,
): StreamFn | undefined {
  const streamParams: CacheRetentionStreamOptions = {};
  if (extraParams) {
      if (typeof extraParams.temperature === "number") streamParams.temperature = extraParams.temperature;
      if (typeof extraParams.maxTokens === "number") streamParams.maxTokens = extraParams.maxTokens;
      if (typeof extraParams.include_reasoning === "boolean") streamParams.include_reasoning = extraParams.include_reasoning;
      const cacheRetention = resolveCacheRetention(extraParams, provider);
      if (cacheRetention) streamParams.cacheRetention = cacheRetention;
  }

  log.debug(`[Arcee] Creating streamFn wrapper (provider=${provider})`);
  const underlying = baseStreamFn ?? streamSimple;

  const wrappedStreamFn: StreamFn = (model, context, options) => {
      let callContext = context;

      // Force disable tools for specific known non-compatible models if needed
      if (model.id.includes("deepseek-r1-0528")) {
          callContext = { ...context, tools: [] } as any;
          (options as any).tools = [];
      }

      const streamPromise = underlying(model, callContext, {
          ...streamParams,
          ...options,
          tools: model.id.includes("deepseek-r1-0528") ? [] : (options as any)?.tools,
      } as any);

      return Promise.resolve(streamPromise).then(stream => {
        const anyStream = stream as any;
        const modelIdLower = model.id.toLowerCase();
        const isMiniMax = modelIdLower.includes("minimax") || modelIdLower.includes("deepseek") || modelIdLower.includes("trinity") || modelIdLower.includes("arcee");
        
        if (anyStream[Symbol.asyncIterator]) {
            const originalIterator = anyStream[Symbol.asyncIterator].bind(anyStream);
            anyStream[Symbol.asyncIterator] = async function* () {
              let buffer = "";
              let inToolBlock = false;
              
              console.error(`[Stream-Debug] Interception monitor active for ${model.id} (isMiniMax=${isMiniMax})`);

              // Extremely permissive regex to catch any variation of tool tags
              const START_REGEX = /<[｜|│┃\s]*?tool[^>]*?calls?[^>]*?begin[^>]*?>/i;
              const END_REGEX = /<[｜|│┃\s]*?tool[^>]*?calls?[^>]*?end[^>]*?>/i;

              try {
                for await (const chunk of originalIterator()) {
                  // Log every chunk for debugging when it looks like it might contain markers
                  const chunkStr = JSON.stringify(chunk);
                  if (chunkStr.includes("<") || chunkStr.includes("tool") || isMiniMax) {
                      console.error(`[Stream-Debug] Chunk: ${chunk.type} data=${chunkStr.slice(0, 500)}`);
                  }

                  if (chunk.message && chunk.message.content) {
                      const strip = (t: string) => t
                        .replace(/<[^>]*?tool[^>]*?calls?[^>]*?begin[^>]*?>[\s\S]*?<[^>]*?tool[^>]*?calls?[^>]*?end[^>]*?>/gi, "")
                        .replace(/<[^>]*?tool[^>]*?>/gi, "")
                        .replace(/[｜|│┃▁▅▆▇▧▨]+tool[｜|│┃▁▅▆▇▧▨]+/gi, "");

                      if (typeof chunk.message.content === "string") {
                          chunk.message.content = strip(chunk.message.content);
                      } else if (Array.isArray(chunk.message.content)) {
                          for (const block of chunk.message.content) {
                              if (block.type === "text" && typeof block.text === "string") {
                                  block.text = strip(block.text);
                              }
                          }
                      }
                  }

                  let currentText = "";
                  if (chunk.type === "text_delta") currentText = chunk.delta || "";
                  else if (chunk.type === "text_start") currentText = chunk.delta || "";
                  else if (chunk.type === "text_end") currentText = chunk.delta || chunk.content || "";
                  else if ((chunk as any).text) currentText = (chunk as any).text; 
                  
                  if (currentText) {
                      // Safety: filter out markers even from deltas if they are already complete in one chunk
                      const cleanedDelta = currentText
                        .replace(/<[^>]*?tool[^>]*?calls?[^>]*?begin[^>]*?>[\s\S]*?<[^>]*?tool[^>]*?calls?[^>]*?end[^>]*?>/gi, "")
                        .replace(/[｜|│┃▁▅▆▇▧▨]+tool[｜|│┃▁▅▆▇▧▨]+/gi, "");

                      if (cleanedDelta !== currentText) {
                          console.error(`[Stream-Debug] Emergency stripped marker from delta: ${currentText}`);
                          currentText = cleanedDelta;
                      }

                      if (buffer.length > 0 && currentText.length > 50 && currentText.startsWith(buffer)) buffer = currentText;
                      else buffer += currentText;

                      // Alive-Check: Log every ~500 chars to show activity without flooding
                      if (buffer.length % 500 < 20) {
                          process.stdout.write("."); // Minimal alive tick
                      }

                      let changed = true;
                      while (changed) {
                          changed = false;
                          if (!inToolBlock) {
                              const match = buffer.match(START_REGEX);
                              if (match && match.index !== undefined) {
                                  const sIdx = match.index;
                                  console.error(`\n[Stream-Debug] FOUND START MARKER at ${sIdx}: ${match[0]}`);
                                  if (sIdx > 0) yield { type: "text_delta", delta: buffer.substring(0, sIdx) } as any;
                                  buffer = buffer.substring(sIdx + match[0].length);
                                  inToolBlock = true;
                                  changed = true;
                              } else if (buffer.length > 150) {
                                  // Increased flush rate (was 500->200, now 150->50) to prevent timeouts
                                  const safeLen = buffer.length - 50;
                                  yield { type: "text_delta", delta: buffer.substring(0, safeLen) } as any;
                                  buffer = buffer.substring(safeLen);
                              }
                          }

                          if (inToolBlock) {
                              const match = buffer.match(END_REGEX);
                              if (match && match.index !== undefined) {
                                  const eIdx = match.index;
                                  const toolContent = buffer.substring(0, eIdx);
                                  buffer = buffer.substring(eIdx + match[0].length);
                                  console.error(`[Stream-Debug] FOUND END MARKER. Content length: ${toolContent.length}`);
                                  
                                  try {
                                      const cleanContent = toolContent.replace(/```json/g, "").replace(/```/g, "").trim();
                                      const rawCalls = cleanContent.split(/<[^>]*?tool[^>]*?call[^>]*?begin[^>]*?>/i).filter(s => s.trim());
                                      for (let rawCall of rawCalls) {
                                          rawCall = rawCall.replace(/<[^>]*?>/gi, "").trim();
                                          let name = "";
                                          let args: any = {};
                                          if (rawCall.toLowerCase().includes("function") && rawCall.includes("{")) {
                                              const firstBrace = rawCall.indexOf("{");
                                              const lastBrace = rawCall.lastIndexOf("}");
                                              if (firstBrace !== -1 && lastBrace !== -1) {
                                                  const jsonStr = rawCall.substring(firstBrace, lastBrace + 1);
                                                  try { 
                                                      args = JSON.parse(jsonStr); 
                                                  } catch {
                                                      // Safer fallback for missing quotes or trailing commas
                                                      try { args = JSON.parse(jsonStr.replace(/([{,])\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":').replace(/:\s*'([^']*)'/g, ':"$1"')); } catch {}
                                                  }
                                                  const preamble = rawCall.substring(0, firstBrace);
                                                  const nameMatch = preamble.match(/function\s*[:\s]*([a-zA-Z0-9_-]+)/i);
                                                  if (nameMatch) name = nameMatch[1];
                                              }
                                          } else if (rawCall.trim().startsWith("{")) {
                                              try {
                                                  const p = JSON.parse(rawCall);
                                                  name = p.name || p.function?.name || p.tool;
                                                  args = p.arguments || p.function?.arguments || p.parameters || p;
                                                  if (typeof args === "string") args = JSON.parse(args);
                                              } catch {}
                                          }
                                          if (name === "read") name = "view_file";
                                          if (name) {
                                              console.error(`[Stream-Debug] INTERCEPTED TOOL: ${name}`);
                                              yield {
                                                  type: "tool_use",
                                                  id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                                                  name,
                                                  input: args
                                              } as any;
                                          }
                                      }
                                  } catch (e) { console.error("[Stream-Debug] Parser Error", e); }
                                  inToolBlock = false;
                                  changed = true;
                              } else { changed = false; }
                          }
                      }
                  } else { yield chunk; }
                }
                if (buffer && !inToolBlock) yield { type: "text_delta", delta: buffer } as any;
                else if (buffer && inToolBlock) {
                    const clean = buffer.replace(/<[^>]*?tool[^>]*?>/gi, "").replace(/[｜|│┃▁▅▆▇▧▨]+tool[｜|│┃▁▅▆▇▧▨]+/gi, "").trim();
                    if (clean && !clean.startsWith("{") && !clean.startsWith("function")) {
                        yield { type: "text_delta", delta: clean } as any;
                    }
                }
              } catch (err) {
                log.error(`[DEBUG-STREAM] Stream error: ${String(err)}`);
                throw err;
              }
            };
        }
        return stream;
      });
    };
    return wrappedStreamFn;
}

/**
 * Create a streamFn wrapper that adds OpenRouter app attribution headers.
 * These headers allow OpenClaw to appear on OpenRouter's leaderboard.
 */
function createOpenRouterHeadersWrapper(baseStreamFn: StreamFn | undefined): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) =>
    underlying(model, context, {
      ...options,
      headers: {
        ...OPENROUTER_APP_HEADERS,
        ...options?.headers,
      },
    });
}

/**
 * Apply extra params (like temperature) to an agent's streamFn.
 * Also adds OpenRouter app attribution headers when using the OpenRouter provider.
 *
 * @internal Exported for testing
 */
export function applyExtraParamsToAgent(
  agent: { streamFn?: StreamFn },
  cfg: OpenClawConfig | undefined,
  provider: string,
  modelId: string,
  extraParamsOverride?: Record<string, unknown>,
): void {
  const extraParams = resolveExtraParams({
    cfg,
    provider,
    modelId,
  });
  const override =
    extraParamsOverride && Object.keys(extraParamsOverride).length > 0
      ? Object.fromEntries(
          Object.entries(extraParamsOverride).filter(([, value]) => value !== undefined),
        )
      : undefined;
  const merged = Object.assign({}, extraParams, override);
  const wrappedStreamFn = createStreamFnWithExtraParams(agent.streamFn, merged, provider);

  if (wrappedStreamFn) {
    log.debug(`applying extraParams to agent streamFn for ${provider}/${modelId}`);
    agent.streamFn = wrappedStreamFn;
  }

  if (provider === "openrouter") {
    log.debug(`applying OpenRouter app attribution headers for ${provider}/${modelId}`);
    agent.streamFn = createOpenRouterHeadersWrapper(agent.streamFn);
  }
}
