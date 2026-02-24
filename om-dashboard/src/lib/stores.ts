// State Management für Øm Dashboard
import { writable, derived } from 'svelte/store';
import { getGatewayClient, type OmState, type GatewaySessionRow } from './gateway';

// Chat-Verlauf
export interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export const chatMessages = writable<ChatEntry[]>([]);

// Sessions
export const sessions = writable<GatewaySessionRow[]>([]);
export const currentSessionKey = writable<string>('');

// Gateway Status
export const gatewayConnected = writable<boolean>(false);
export const gatewayAuthenticated = writable<boolean>(false);

// Lade-Zustand
export const isLoading = writable<boolean>(false);

// Energy-Level
export const energy = writable<number>(0);

// Mood
export const mood = writable<string>('');

// Mode
export const mode = writable<string>('initiative');

// Aura
export const aura = writable<{
  C1: number; C2: number; C3: number; C4: number; C5: number; C6: number; C7: number;
}>({ C1: 0, C2: 0, C3: 0, C4: 0, C5: 0, C6: 0, C7: 0 });

// Thought Events
export const thoughtEvents = writable<Array<{
  id: string; label: string; summary: string; ts: number;
}>>([]);

// Tool Events
export const toolEvents = writable<Array<{
  toolCallId: string; name: string; status: string; startedAt: number;
}>>([]);

// Helper: Nachricht hinzufügen
export function addUserMessage(content: string) {
  chatMessages.update(msgs => [
    ...msgs,
    {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now()
    }
  ]);
}

export function addAssistantMessage(content: string) {
  chatMessages.update(msgs => [
    ...msgs,
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content,
      timestamp: Date.now()
    }
  ]);
}

// Chat leeren
export function clearChat() {
  chatMessages.set([]);
}

// Gateway verbinden und Stores updaten
export function connectToGateway() {
  const client = getGatewayClient();

  client.subscribe((state: OmState) => {
    // Update stores
    gatewayConnected.set(client.isConnected());
    energy.set(state.energy);
    mood.set(state.mood);
    mode.set(state.mode);
    aura.set(state.aura);

    thoughtEvents.set(state.thoughtEvents.slice(-10).map(t => ({
      id: t.id,
      label: t.label,
      summary: t.summary,
      ts: t.ts
    })));

    toolEvents.set(state.toolEvents.slice(-10).map(t => ({
      toolCallId: t.toolCallId,
      name: t.name,
      status: t.status || 'running',
      startedAt: t.startedAt
    })));
  });

  return client.connect();
}
