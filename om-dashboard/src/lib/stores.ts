// State Management für Øm Dashboard
import { writable } from 'svelte/store';

// Chat-Verlauf
export interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export const chatMessages = writable<ChatEntry[]>([]);

// Gateway Status
export const gatewayConnected = writable<boolean>(false);

// Lade-Zustand
export const isLoading = writable<boolean>(false);

// Energy-Level (wird später von Gateway geholt)
export const energy = writable<number>(0);

// Mood (wird später von Gateway geholt)
export const mood = writable<string>('');

// Aktueller Modus (initiative, dream, balanced)
export const mode = writable<string>('initiative');

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
