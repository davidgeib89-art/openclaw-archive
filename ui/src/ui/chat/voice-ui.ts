/**
 * Voice UI module for WebGUI — enables TTS playback and STT recording.
 *
 * TTS: Fetches audio from /api/tts endpoint and plays it in the browser.
 * STT: Uses the Web Speech API (SpeechRecognition) to transcribe voice input.
 */
import { html, nothing, type TemplateResult } from "lit";
import { icons } from "../icons.ts";

// ─── Base path ───────────────────────────────────────────────────────
function resolveBasePath(): string {
  const raw =
    (window as unknown as Record<string, unknown>).__OPENCLAW_CONTROL_UI_BASE_PATH__ ?? "";
  return typeof raw === "string" ? raw.replace(/\/+$/, "") : "";
}

// ─── TTS playback ────────────────────────────────────────────────────
let currentAudio: HTMLAudioElement | null = null;
let currentPlayingKey: string | null = null;

export type TtsPlayState = "idle" | "loading" | "playing";

const ttsStateListeners = new Set<() => void>();
let ttsState: TtsPlayState = "idle";
let ttsActiveKey: string | null = null;

function setTtsState(state: TtsPlayState, key: string | null) {
  ttsState = state;
  ttsActiveKey = key;
  for (const listener of ttsStateListeners) {
    listener();
  }
}

export function onTtsStateChange(listener: () => void): () => void {
  ttsStateListeners.add(listener);
  return () => ttsStateListeners.delete(listener);
}

export function getTtsState(): { state: TtsPlayState; key: string | null } {
  return { state: ttsState, key: ttsActiveKey };
}

export function stopTtsPlayback(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  currentPlayingKey = null;
  setTtsState("idle", null);
}

export async function playTts(text: string, messageKey: string): Promise<void> {
  // If already playing this message, stop it
  if (currentPlayingKey === messageKey && currentAudio) {
    stopTtsPlayback();
    return;
  }

  // Stop any current playback
  stopTtsPlayback();
  setTtsState("loading", messageKey);
  currentPlayingKey = messageKey;

  try {
    const basePath = resolveBasePath();
    const res = await fetch(`${basePath}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "TTS request failed" }));
      console.error("TTS error:", (error as Record<string, string>).error);
      setTtsState("idle", null);
      currentPlayingKey = null;
      return;
    }

    const audioBlob = await res.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    currentAudio = audio;

    audio.addEventListener("ended", () => {
      URL.revokeObjectURL(audioUrl);
      currentAudio = null;
      currentPlayingKey = null;
      setTtsState("idle", null);
    });

    audio.addEventListener("error", () => {
      URL.revokeObjectURL(audioUrl);
      currentAudio = null;
      currentPlayingKey = null;
      setTtsState("idle", null);
    });

    setTtsState("playing", messageKey);
    await audio.play();
  } catch (err) {
    console.error("TTS playback failed:", err);
    currentAudio = null;
    currentPlayingKey = null;
    setTtsState("idle", null);
  }
}

// ─── TTS Play Button (for assistant message bubbles) ─────────────────

export function renderTtsButton(text: string, messageKey: string): TemplateResult {
  const isActive = ttsActiveKey === messageKey;
  const isLoading = isActive && ttsState === "loading";
  const isPlaying = isActive && ttsState === "playing";

  const buttonClass = [
    "voice-tts-btn",
    isLoading ? "voice-tts-btn--loading" : "",
    isPlaying ? "voice-tts-btn--playing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const label = isPlaying ? "Stop playback" : isLoading ? "Loading audio..." : "Play aloud";
  const icon = isPlaying ? icons.square : icons.volume2;

  return html`
    <button
      class="${buttonClass}"
      type="button"
      aria-label=${label}
      title=${label}
      ?disabled=${isLoading}
      @click=${(e: Event) => {
        e.stopPropagation();
        void playTts(text, messageKey);
      }}
    >
      ${isLoading ? icons.loader : icon}
    </button>
  `;
}

// ─── STT (Speech-to-Text) via Web Speech API ─────────────────────────

// We need to declare the SpeechRecognition types for TypeScript
type SpeechRecognitionType = new () => SpeechRecognitionInstance;
type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onstart: (() => void) | null;
};

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionResultList = {
  length: number;
  item: (index: number) => SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionResult = {
  isFinal: boolean;
  length: number;
  item: (index: number) => SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
};

type SpeechRecognitionAlternative = {
  transcript: string;
  confidence: number;
};

type SpeechRecognitionErrorEvent = {
  error: string;
  message: string;
};

function getSpeechRecognition(): SpeechRecognitionType | null {
  const win = window as unknown as Record<string, unknown>;
  return (win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null) as SpeechRecognitionType | null;
}

export function isSttSupported(): boolean {
  return getSpeechRecognition() !== null;
}

export type SttState = "idle" | "listening" | "processing";

let sttInstance: SpeechRecognitionInstance | null = null;
let sttCurrentState: SttState = "idle";
const sttStateListeners = new Set<() => void>();

function setSttState(state: SttState) {
  sttCurrentState = state;
  for (const listener of sttStateListeners) {
    listener();
  }
}

export function onSttStateChange(listener: () => void): () => void {
  sttStateListeners.add(listener);
  return () => sttStateListeners.delete(listener);
}

export function getSttState(): SttState {
  return sttCurrentState;
}

export function stopStt(): void {
  if (sttInstance) {
    sttInstance.abort();
    sttInstance = null;
  }
  setSttState("idle");
}

export function startStt(opts: {
  lang?: string;
  onResult: (text: string) => void;
  onInterim?: (text: string) => void;
}): void {
  const SpeechRecognitionClass = getSpeechRecognition();
  if (!SpeechRecognitionClass) {
    console.error("Speech Recognition not supported in this browser.");
    return;
  }

  // Stop any existing session
  stopStt();

  const recognition = new SpeechRecognitionClass();
  recognition.lang = opts.lang ?? "de-DE";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  let finalTranscript = "";

  recognition.onstart = () => {
    setSttState("listening");
  };

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript;
      } else {
        interim += result[0].transcript;
      }
    }

    if (interim && opts.onInterim) {
      opts.onInterim(finalTranscript + interim);
    }
  };

  recognition.onend = () => {
    sttInstance = null;
    if (finalTranscript.trim()) {
      opts.onResult(finalTranscript.trim());
    }
    setSttState("idle");
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    // "no-speech" and "aborted" are normal scenarios
    if (event.error !== "no-speech" && event.error !== "aborted") {
      console.error("Speech recognition error:", event.error, event.message);
    }
    sttInstance = null;
    setSttState("idle");
  };

  sttInstance = recognition;
  recognition.start();
}

// ─── Mic Button (for the compose area) ───────────────────────────────

export function renderMicButton(opts: {
  connected: boolean;
  onResult: (text: string) => void;
  onInterim?: (text: string) => void;
  lang?: string;
}): TemplateResult {
  if (!isSttSupported()) {
    return html`${nothing}`;
  }

  const isListening = sttCurrentState === "listening";

  const buttonClass = [
    "voice-mic-btn",
    isListening ? "voice-mic-btn--recording" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const label = isListening ? "Stop recording" : "Voice input";

  return html`
    <button
      class="${buttonClass}"
      type="button"
      aria-label=${label}
      title=${label}
      ?disabled=${!opts.connected}
      @click=${() => {
        if (isListening) {
          // Stop recording — will trigger onend → onResult with transcript
          if (sttInstance) {
            sttInstance.stop();
          }
        } else {
          startStt({
            lang: opts.lang,
            onResult: opts.onResult,
            onInterim: opts.onInterim,
          });
        }
      }}
    >
      ${isListening ? icons.square : icons.mic}
    </button>
  `;
}

// ─── Auto-TTS System ────────────────────────────────────────────────
// Automatically generates TTS audio for new assistant messages and
// shows an inline audio player in the chat bubble.

type AutoTtsEntry = {
  state: "loading" | "ready" | "error";
  url?: string;
  error?: string;
};

const autoTtsCache = new Map<string, AutoTtsEntry>();
const autoTtsRequested = new Set<string>();

// Only auto-TTS messages that arrived after session start
const autoTtsSessionStart = Date.now();

// Settings
let autoTtsEnabled = true;
let autoPlayNewMessages = true;

// Max text length for auto-TTS (skip very long messages)
const AUTO_TTS_MAX_LENGTH = 2000;

export function isAutoTtsEnabled(): boolean {
  return autoTtsEnabled;
}

export function setAutoTtsEnabled(enabled: boolean): void {
  autoTtsEnabled = enabled;
}

export function setAutoPlayEnabled(enabled: boolean): void {
  autoPlayNewMessages = enabled;
}

export function getAutoTtsEntry(messageKey: string): AutoTtsEntry | null {
  return autoTtsCache.get(messageKey) ?? null;
}

/**
 * Request auto-TTS generation for a message. This is idempotent —
 * calling it multiple times for the same key is safe.
 */
export function requestAutoTts(
  text: string,
  messageKey: string,
  messageTimestamp: number,
): void {
  // Guard: skip if disabled, already requested, history message, or too long
  if (!autoTtsEnabled) return;
  if (autoTtsRequested.has(messageKey)) return;
  if (messageTimestamp < autoTtsSessionStart) return;
  if (text.length > AUTO_TTS_MAX_LENGTH) return;
  if (!text.trim()) return;

  autoTtsRequested.add(messageKey);
  autoTtsCache.set(messageKey, { state: "loading" });

  // Notify listeners to trigger re-render (shows loading state)
  for (const listener of ttsStateListeners) {
    listener();
  }

  const basePath = resolveBasePath();
  fetch(`${basePath}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      autoTtsCache.set(messageKey, { state: "ready", url });

      // Notify listeners to trigger re-render (shows player)
      for (const listener of ttsStateListeners) {
        listener();
      }

      // Auto-play if enabled and nothing else is currently playing
      if (autoPlayNewMessages && !currentAudio) {
        const audio = new Audio(url);
        currentAudio = audio;
        currentPlayingKey = messageKey;
        setTtsState("playing", messageKey);

        audio.addEventListener("ended", () => {
          currentAudio = null;
          currentPlayingKey = null;
          setTtsState("idle", null);
        });

        audio.addEventListener("error", () => {
          currentAudio = null;
          currentPlayingKey = null;
          setTtsState("idle", null);
        });

        void audio.play().catch(() => {
          // Auto-play was blocked by browser policy — user must interact first
          currentAudio = null;
          currentPlayingKey = null;
          setTtsState("idle", null);
        });
      }
    })
    .catch((err) => {
      console.error("Auto-TTS generation failed:", err);
      autoTtsCache.set(messageKey, { state: "error", error: String(err) });
      for (const listener of ttsStateListeners) {
        listener();
      }
    });
}

/**
 * Render an inline audio player for auto-generated TTS.
 * Shows a loading indicator while generating, then a compact audio player.
 */
export function renderInlineAudioPlayer(messageKey: string): TemplateResult {
  const entry = autoTtsCache.get(messageKey);
  if (!entry) return html`${nothing}`;

  if (entry.state === "loading") {
    return html`
      <div class="voice-inline-player voice-inline-player--loading">
        <span class="voice-inline-player__icon">${icons.loader}</span>
        <span class="voice-inline-player__label">Audio wird generiert…</span>
      </div>
    `;
  }

  if (entry.state === "error") {
    return html`${nothing}`;
  }

  if (entry.state === "ready" && entry.url) {
    const isThisPlaying = currentPlayingKey === messageKey && ttsState === "playing";

    return html`
      <div class="voice-inline-player voice-inline-player--ready">
        <button
          class="voice-inline-player__play ${isThisPlaying ? "voice-inline-player__play--active" : ""}"
          type="button"
          aria-label=${isThisPlaying ? "Stoppen" : "Abspielen"}
          title=${isThisPlaying ? "Stoppen" : "Abspielen"}
          @click=${(e: Event) => {
            e.stopPropagation();
            if (isThisPlaying) {
              stopTtsPlayback();
            } else {
              // Play from cached URL
              stopTtsPlayback();
              const audio = new Audio(entry.url!);
              currentAudio = audio;
              currentPlayingKey = messageKey;
              setTtsState("playing", messageKey);

              audio.addEventListener("ended", () => {
                currentAudio = null;
                currentPlayingKey = null;
                setTtsState("idle", null);
              });
              audio.addEventListener("error", () => {
                currentAudio = null;
                currentPlayingKey = null;
                setTtsState("idle", null);
              });
              void audio.play();
            }
          }}
        >
          ${isThisPlaying ? icons.square : icons.volume2}
        </button>
        <div class="voice-inline-player__waveform">
          <span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span>
        </div>
        <span class="voice-inline-player__label">Sprachnachricht</span>
      </div>
    `;
  }

  return html`${nothing}`;
}
