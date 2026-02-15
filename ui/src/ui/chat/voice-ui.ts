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
