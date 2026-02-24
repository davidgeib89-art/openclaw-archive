import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

const GATEWAY_URL = 'http://localhost:18789';
const GATEWAY_TOKEN = '8ea0f08fae9553b6d44c9ca55da364a4ce9ab5306fb4eae7';

export const POST = async ({ request }: RequestEvent) => {
  try {
    const { message, sessionKey } = (await request.json()) as {
      message: string;
      sessionKey?: string;
    };

    if (!message?.trim()) {
      return json({ ok: false, error: 'message required' }, { status: 400 });
    }

    // Try the /hooks/wake HTTP endpoint first (local gateway)
    const resp = await fetch(`${GATEWAY_URL}/hooks/wake`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GATEWAY_TOKEN}`,
        'X-Gateway-Token': GATEWAY_TOKEN,
      },
      body: JSON.stringify({
        text: message.trim(),
        sessionKey: sessionKey ?? 'agent:main:main',
        mode: 'next-heartbeat',
      }),
    });

    if (resp.ok) {
      const data = await resp.json().catch(() => ({}));
      return json({ ok: true, data });
    }

    // Fallback: try /api/send
    const resp2 = await fetch(`${GATEWAY_URL}/api/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({ text: message.trim(), sessionKey }),
    });

    if (resp2.ok) {
      return json({ ok: true });
    }

    const errorText = await resp.text().catch(() => 'unknown error');
    return json({ ok: false, error: errorText }, { status: 502 });
  } catch (e) {
    return json({ ok: false, error: String(e) }, { status: 500 });
  }
};
