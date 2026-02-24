import { json } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SESSIONS_FILE = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions', 'sessions.json');

export const GET = async () => {
  try {
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
    const store: Record<string, Record<string, unknown>> = JSON.parse(raw);

    const sessions = Object.entries(store)
      .filter(([key]) => !key.startsWith('cron:'))
      .map(([key, entry]) => {
        const displayName =
          (entry.displayName as string) ??
          (entry.label as string) ??
          key.split(':').pop() ??
          key;
        return {
          key,
          sessionId: entry.sessionId as string,
          displayName,
          channel: entry.channel as string | null,
          updatedAt: entry.updatedAt as number | null,
          inputTokens: entry.inputTokens as number | undefined,
          outputTokens: entry.outputTokens as number | undefined,
        };
      })
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, 60);

    return json({ sessions });
  } catch (e) {
    return json({ sessions: [], error: String(e) }, { status: 500 });
  }
};
