import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

function normalizeBase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "/";
  }
  if (trimmed === "./") {
    return "./";
  }
  if (trimmed.endsWith("/")) {
    return trimmed;
  }
  return `${trimmed}/`;
}

export default defineConfig(() => {
  const envBase = process.env.OPENCLAW_CONTROL_UI_BASE_PATH?.trim();
  const base = envBase ? normalizeBase(envBase) : "./";
  return {
    base,
    publicDir: path.resolve(here, "public"),
    optimizeDeps: {
      include: ["lit/directives/repeat.js"],
    },
    build: {
      outDir: path.resolve(here, "../dist/control-ui"),
      emptyOutDir: true,
      sourcemap: true,
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      // Move Vite HMR to a dedicated path so root WebSocket can be proxied to the gateway
      hmr: {
        path: "/__vite_hmr__",
      },
      proxy: {
        // Proxy API requests (TTS, avatar, etc.) to the gateway
        "/api": {
          target: "http://127.0.0.1:18789",
          changeOrigin: true,
        },
        // Proxy avatar requests
        "/avatar": {
          target: "http://127.0.0.1:18789",
          changeOrigin: true,
        },
        // Proxy media requests
        "/media": {
          target: "http://127.0.0.1:18789",
          changeOrigin: true,
        },
        // Proxy root WebSocket connections to the gateway (for JSON-RPC)
        "^/$": {
          target: "ws://127.0.0.1:18789",
          ws: true,
        },
      },
    },
  };
});
