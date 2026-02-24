// State Management für Øm Dashboard
import { writable } from 'svelte/store';
import { getGatewayClient, type OmState } from './gateway';

// ─── Chat ───────────────────────────────────────────────────────────────────
export interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  pending?: boolean;
}

export const chatMessages = writable<ChatEntry[]>([]);

export function addUserMessage(content: string): string {
  const id = crypto.randomUUID();
  chatMessages.update((msgs) => [...msgs, { id, role: 'user', content, timestamp: Date.now() }]);
  return id;
}

export function addAssistantMessage(content: string): string {
  const id = crypto.randomUUID();
  chatMessages.update((msgs) => [...msgs, { id, role: 'assistant', content, timestamp: Date.now() }]);
  return id;
}

export function clearChat() {
  chatMessages.set([]);
}

// ─── Sessions ────────────────────────────────────────────────────────────────
export interface SessionRow {
  key: string;
  sessionId: string;
  displayName: string;
  channel: string | null;
  updatedAt: number | null;
  inputTokens?: number;
  outputTokens?: number;
}

export const sessions = writable<SessionRow[]>([]);
export const currentSession = writable<SessionRow | null>(null);
export const sessionsLoaded = writable(false);

// ─── Gateway / Connection ────────────────────────────────────────────────────
export const gatewayConnected = writable(false);
export const gatewayAuthenticated = writable(false);
export const isLoading = writable(false);

// ─── Om Vitals ───────────────────────────────────────────────────────────────
export const energy = writable<number>(0);
export const mood = writable<string>('');
export const mode = writable<string>('initiative');
export const path = writable<string>('');
export const aura = writable<{
  C1: number; C2: number; C3: number; C4: number; C5: number; C6: number; C7: number;
}>({ C1: 0, C2: 0, C3: 0, C4: 0, C5: 0, C6: 0, C7: 0 });

export const energyHistory = writable<Array<{ t: number; v: number }>>([]);
export const lastHeartbeat = writable<number | null>(null);

// ─── Activity Stream ─────────────────────────────────────────────────────────
export const thoughtEvents = writable<Array<{ id: string; label: string; summary: string; ts: number }>>([]);
export const toolEvents = writable<Array<{ toolCallId: string; name: string; status: string; startedAt: number }>>([]);

// ─── API helpers ─────────────────────────────────────────────────────────────
export async function loadSessions(): Promise<void> {
  try {
    const res = await fetch('/api/sessions');
    const data = await res.json();
    sessions.set(data.sessions ?? []);
    sessionsLoaded.set(true);

    // Auto-select main session
    const list: SessionRow[] = data.sessions ?? [];
    const main = list.find((s) => s.key === 'agent:main:main') ?? list[0];
    if (main) currentSession.set(main);
  } catch (e) {
    console.error('[Sessions] Load failed:', e);
    sessionsLoaded.set(true);
  }
}

export async function loadHistory(sessionId: string): Promise<ChatEntry[]> {
  try {
    const res = await fetch(`/api/history?sessionId=${encodeURIComponent(sessionId)}&limit=30`);
    const data = await res.json();
    return (data.messages ?? []).map((m: { id: string; role: 'user' | 'assistant'; text: string; timestamp: number }, i: number) => ({
      id: m.id ?? `msg-${i}-${Date.now()}`,
      role: m.role,
      content: m.text || '',
      timestamp: m.timestamp || Date.now(),
    }));
  } catch (e) {
    console.error('[History] Load failed:', e);
    return [];
  }
}

// ─── Gateway subscription ────────────────────────────────────────────────────
export function connectToGateway() {
  const client = getGatewayClient();

  client.subscribe((state: OmState) => {
    gatewayConnected.set(client.isConnected());
    energy.update((prev) => {
      if (state.energy !== prev) {
        energyHistory.update((hist) => {
          const next = [...hist, { t: Date.now(), v: state.energy }];
          return next.slice(-60); // keep last 60 data points
        });
      }
      return state.energy;
    });
    mood.set(state.mood);
    mode.set(state.mode);
    aura.set(state.aura);

    if (state.lastHeartbeat) {
      lastHeartbeat.set(state.lastHeartbeat);
    }

    thoughtEvents.set(
      state.thoughtEvents.slice(-20).map((t) => ({
        id: t.id,
        label: t.label,
        summary: t.summary,
        ts: t.ts,
      }))
    );

    toolEvents.set(
      state.toolEvents.slice(-20).map((t) => ({
        toolCallId: t.toolCallId,
        name: t.name,
        status: t.status || 'running',
        startedAt: t.startedAt,
      }))
    );
  });

  return client.connect();
}
