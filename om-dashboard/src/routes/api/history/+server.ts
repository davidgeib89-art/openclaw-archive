import { json } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { RequestEvent } from '@sveltejs/kit';

const SESSIONS_DIR = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions');

interface TranscriptMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: Array<{ type: string; text?: string }> | string;
  timestamp?: number;
  type?: string;
}

function extractText(content: TranscriptMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');
  }
  return '';
}

export const GET = async ({ url }: RequestEvent) => {
  const sessionId = url.searchParams.get('sessionId');
  const limit = parseInt(url.searchParams.get('limit') ?? '100', 10);

  if (!sessionId) {
    return json({ messages: [], error: 'sessionId required' }, { status: 400 });
  }

  const filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);

  if (!fs.existsSync(filePath)) {
    return json({ messages: [], error: 'transcript not found' }, { status: 404 });
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);

    const messages: Array<{
      id: string;
      role: 'user' | 'assistant';
      text: string;
      timestamp: number;
    }> = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        // Skip header and non-message lines
        if (parsed.type !== 'message') continue;
        const role = parsed.role as string;
        if (role !== 'user' && role !== 'assistant') continue;

        const content = parsed.content as TranscriptMessage['content'];
        const text = extractText(content).trim();
        if (!text) continue;

        // Strip system prompt leaks (thinking blocks etc.)
        const cleanText = text
          .replace(/<think>[\s\S]*?<\/think>/g, '')
          .replace(/<om_mood>[\s\S]*?<\/om_mood>/g, '')
          .replace(/<om_path>[\s\S]*?<\/om_path>/g, '')
          .trim();

        if (!cleanText) continue;

        messages.push({
          id: (parsed.id as string) ?? crypto.randomUUID(),
          role: role as 'user' | 'assistant',
          text: cleanText,
          timestamp: (parsed.timestamp as number) ?? Date.now(),
        });
      } catch {
        // skip malformed lines
      }
    }

    // Return last N messages
    const sliced = messages.slice(-limit);
    return json({ messages: sliced, total: messages.length });
  } catch (e) {
    return json({ messages: [], error: String(e) }, { status: 500 });
  }
};
