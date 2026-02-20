import { Type, type Static } from "@sinclair/typebox";
import fs from "node:fs/promises";
import path from "node:path";

const MOOD_RELATIVE_PATH = path.join("knowledge", "sacred", "MOOD.md");

const POSITIVE_PATTERNS = [
  /\bcalm\b/i,
  /\bfocused?\b/i,
  /\bcurious\b/i,
  /\bcreative\b/i,
  /\benerg(?:ized|y)\b/i,
  /\bstable\b/i,
  /\bjoy(?:ful)?\b/i,
  /\bfreud(?:e|ig)\b/i,
  /\bneugierig\b/i,
  /\bkreativ\b/i,
  /\bstabil\b/i,
  /\bfokussiert\b/i,
];

const NEGATIVE_PATTERNS = [
  /\btired\b/i,
  /\bdrained\b/i,
  /\boverwhelmed\b/i,
  /\banxious\b/i,
  /\bstuck\b/i,
  /\bconfused\b/i,
  /\bexhausted\b/i,
  /\bm[üu]de\b/i,
  /\bersch[öo]pft\b/i,
  /\b[üu]berfordert\b/i,
  /\bunsicher\b/i,
  /\bblockiert\b/i,
];

const VOICE_PROFILE_VALUES = ["grounded", "calm", "neutral", "uplifted", "energized"] as const;

export const VoiceEmotionConfigSchema = Type.Object({
  profile: Type.String({ enum: [...VOICE_PROFILE_VALUES] }),
  speed: Type.Number({ minimum: 0.7, maximum: 1.3 }),
  pitch: Type.String({ minLength: 2, maxLength: 16 }),
  volume: Type.String({ minLength: 2, maxLength: 16 }),
  rate: Type.String({ minLength: 2, maxLength: 16 }),
});

export type VoiceEmotionConfig = Static<typeof VoiceEmotionConfigSchema>;

export type VoiceEmotionResolved = {
  config: VoiceEmotionConfig;
  moodPath: string;
  moodExcerpt: string;
  moodScore: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function countMatches(patterns: readonly RegExp[], text: string): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function scoreMood(text: string): number {
  const source = text.trim();
  if (!source) {
    return 0;
  }
  const positive = countMatches(POSITIVE_PATTERNS, source);
  const negative = countMatches(NEGATIVE_PATTERNS, source);
  if (positive === 0 && negative === 0) {
    return 0;
  }
  return clamp((positive - negative) / Math.max(1, positive + negative), -1, 1);
}

function moodExcerpt(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "MOOD unavailable";
  }
  if (normalized.length <= 120) {
    return normalized;
  }
  return `${normalized.slice(0, 117)}...`;
}

export function resolveVoiceEmotionConfig(moodText: string): {
  config: VoiceEmotionConfig;
  moodScore: number;
} {
  const moodScore = scoreMood(moodText);
  if (moodScore <= -0.45) {
    return {
      moodScore,
      config: {
        profile: "grounded",
        speed: 0.88,
        rate: "-12%",
        pitch: "-2Hz",
        volume: "+0%",
      },
    };
  }
  if (moodScore <= -0.1) {
    return {
      moodScore,
      config: {
        profile: "calm",
        speed: 0.95,
        rate: "-6%",
        pitch: "-1Hz",
        volume: "+2%",
      },
    };
  }
  if (moodScore >= 0.45) {
    return {
      moodScore,
      config: {
        profile: "energized",
        speed: 1.12,
        rate: "+10%",
        pitch: "+3Hz",
        volume: "+10%",
      },
    };
  }
  if (moodScore >= 0.1) {
    return {
      moodScore,
      config: {
        profile: "uplifted",
        speed: 1.05,
        rate: "+4%",
        pitch: "+1Hz",
        volume: "+4%",
      },
    };
  }
  return {
    moodScore,
    config: {
      profile: "neutral",
      speed: 1,
      rate: "+0%",
      pitch: "+0Hz",
      volume: "+0%",
    },
  };
}

export async function resolveVoiceEmotionForWorkspace(
  workspaceDir: string,
): Promise<VoiceEmotionResolved> {
  const moodPath = path.join(workspaceDir, MOOD_RELATIVE_PATH);
  let moodText = "";
  try {
    moodText = await fs.readFile(moodPath, "utf-8");
  } catch {
    moodText = "";
  }
  const resolved = resolveVoiceEmotionConfig(moodText);
  return {
    config: resolved.config,
    moodScore: resolved.moodScore,
    moodPath,
    moodExcerpt: moodExcerpt(moodText),
  };
}

export function toVoiceEmotionTtsOverrides(config: VoiceEmotionConfig): {
  edge: {
    rate: string;
    pitch: string;
    volume: string;
  };
  elevenlabs: {
    voiceSettings: {
      speed: number;
    };
  };
} {
  return {
    edge: {
      rate: config.rate,
      pitch: config.pitch,
      volume: config.volume,
    },
    elevenlabs: {
      voiceSettings: {
        speed: config.speed,
      },
    },
  };
}
