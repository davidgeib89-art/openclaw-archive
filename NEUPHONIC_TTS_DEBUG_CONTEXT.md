# Context for AI Assistant (Codex)

Hello fellow AI! We are currently working on integrating a completely new, local Text-to-Speech (TTS) engine into the **OpenClaw** gateway. The user wants to use `neuphonic/neutts-nano-german` hosted locally instead of the default cloud-based providers (Edge TTS, OpenAI, ElevenLabs). 

Despite several modifications, the OpenClaw system keeps silently falling back to the old, robotic "Edge TTS" voice instead of calling our new `neuphonic` provider during normal chat interactions (`tts` tool usage).

Here is exactly what has been done so far:

## 1. Local Python Server (Working)
We created a local FastAPI server at `src/tts/neutts_server.py` that loads the `neuphonic/neutts-nano-german` model into memory alongside a reference voice ("greta"). 
It successfully listens on `http://127.0.0.1:42890/tts`. It accepts POST requests with a JSON body `{"text": "..."}` and returns audio bytes.

## 2. Configuration (`openclaw.json`)
We modified `C:\Users\holyd\.openclaw\openclaw.json` to set the TTS provider to `neuphonic`:
```json
"messages": {
  "tts": {
    "auto": "inbound",
    "provider": "neuphonic",
    // ...
  }
}
```

## 3. Zod & Types (`src/config/types.tts.ts`, `src/config/zod-schema.core.ts`)
We added `"neuphonic"` to the allowed literals for `TtsProvider`:
- `export type TtsProvider = "elevenlabs" | "openai" | "edge" | "neuphonic";`
- `export const TtsProviderSchema = z.enum(["elevenlabs", "openai", "edge", "neuphonic"]);`

## 4. TTS Core Client (`src/tts/tts-core.ts`)
We created a fetch client `neuphonicTTS(params: { text: string; timeoutMs: number })` that hits the Python server at `http://127.0.0.1:42890/tts` and returns a `Buffer`.

## 5. TTS Routing Logic (`src/tts/tts.ts`)
We attempted to wire this into the main TTS loop. The main entry point is `textToSpeech()`.
- Added `"neuphonic"` to `export const TTS_PROVIDERS = ["openai", "elevenlabs", "edge", "neuphonic"] as const;`
- Modified `resolveTtsApiKey()` to return `"local"` if the provider is `neuphonic` so it bypasses the missing API key check.
- Added the if-branch in `textToSpeech()`:
  ```typescript
  if (provider === "neuphonic") {
    const { neuphonicTTS } = await import("./tts-core.js");
    audioBuffer = await neuphonicTTS({ text: params.text, ... });
    output.elevenlabs = "wav" as any;
    output.extension = ".wav";
  }
  ```

## The Problem
When the user receives a message, the `tts-tool.ts` is called, which calls `textToSpeech()`. Some validation, fallback mechanism, or provider resolution logic is STILL skipping `"neuphonic"` and defaulting to Edge TTS. 

Check how `resolveTtsConfig()`, `getTtsProvider()`, or `textToSpeech()` processes the configuration. It is likely that `getTtsProvider()` or `resolveTtsProviderOrder()` is somehow rewriting the `provider` back to `"edge"`, or it's throwing a silent error during the `neuphonicTTS` call and falling back to the next provider in the loop.

**Goal:** Please help the user find the missing link in `src/tts/tts.ts` or `src/config/config.ts` that is causing OpenClaw to ignore our `"neuphonic"` `openclaw.json` setting and fallback to Edge TTS.
