import type { EmbeddingProvider, EmbeddingProviderOptions } from "./embeddings.js";
import { requireApiKey, resolveApiKeyForProvider } from "../agents/model-auth.js";

export type OpenAiEmbeddingClient = {
  baseUrl: string;
  headers: Record<string, string>;
  model: string;
};

export const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENAI_MAX_INPUT_TOKENS: Record<string, number> = {
  "text-embedding-3-small": 8192,
  "text-embedding-3-large": 8192,
  "text-embedding-ada-002": 8191,
};

export function normalizeOpenAiModel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) {
    return DEFAULT_OPENAI_EMBEDDING_MODEL;
  }
  if (trimmed.startsWith("openai/")) {
    return trimmed.slice("openai/".length);
  }
  return trimmed;
}

function isOpenRouterBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.hostname.toLowerCase().includes("openrouter.ai");
  } catch {
    return baseUrl.toLowerCase().includes("openrouter.ai");
  }
}

function resolveRemoteApiKey(remoteApiKey?: string): string | undefined {
  const trimmed = remoteApiKey?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith("${") && trimmed.endsWith("}")) {
    const envVar = trimmed.slice(2, -1).trim();
    return process.env[envVar]?.trim();
  }
  if (/^[A-Z][A-Z0-9_]*$/.test(trimmed)) {
    return process.env[trimmed]?.trim() || undefined;
  }
  return trimmed;
}

export async function createOpenAiEmbeddingProvider(
  options: EmbeddingProviderOptions,
): Promise<{ provider: EmbeddingProvider; client: OpenAiEmbeddingClient }> {
  const client = await resolveOpenAiEmbeddingClient(options);
  const url = `${client.baseUrl.replace(/\/$/, "")}/embeddings`;

  const embed = async (input: string[]): Promise<number[][]> => {
    if (input.length === 0) {
      return [];
    }
    const res = await fetch(url, {
      method: "POST",
      headers: client.headers,
      body: JSON.stringify({ model: client.model, input }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`openai embeddings failed: ${res.status} ${text}`);
    }
    const payload = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const data = payload.data ?? [];
    return data.map((entry) => entry.embedding ?? []);
  };

  return {
    provider: {
      id: "openai",
      model: client.model,
      maxInputTokens: OPENAI_MAX_INPUT_TOKENS[client.model],
      embedQuery: async (text) => {
        const [vec] = await embed([text]);
        return vec ?? [];
      },
      embedBatch: embed,
    },
    client,
  };
}

export async function resolveOpenAiEmbeddingClient(
  options: EmbeddingProviderOptions,
): Promise<OpenAiEmbeddingClient> {
  const remote = options.remote;
  const remoteApiKey = resolveRemoteApiKey(remote?.apiKey);
  const remoteBaseUrl = remote?.baseUrl?.trim();
  const providerConfig = options.config.models?.providers?.openai;
  const baseUrl = remoteBaseUrl || providerConfig?.baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL;

  let apiKey = remoteApiKey;
  if (!apiKey && isOpenRouterBaseUrl(baseUrl)) {
    try {
      apiKey = requireApiKey(
        await resolveApiKeyForProvider({
          provider: "openrouter",
          cfg: options.config,
          agentDir: options.agentDir,
        }),
        "openrouter",
      );
    } catch {
      // Fall through to OpenAI credentials resolution.
    }
  }
  if (!apiKey) {
    apiKey = requireApiKey(
      await resolveApiKeyForProvider({
        provider: "openai",
        cfg: options.config,
        agentDir: options.agentDir,
      }),
      "openai",
    );
  }

  const headerOverrides = Object.assign({}, providerConfig?.headers, remote?.headers);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...headerOverrides,
  };
  const model = normalizeOpenAiModel(options.model);
  return { baseUrl, headers, model };
}
