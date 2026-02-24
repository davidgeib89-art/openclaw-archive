// Gateway API-Kommunikation für Øm Dashboard
// Gateway läuft typischerweise auf Port 18789

const GATEWAY_URL = 'http://localhost:18789';

// Typen für die API
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface HeartbeatResponse {
  status: string;
  summary?: string;
}

export interface SessionInfo {
  sessionKey: string;
  agentId: string;
}

// Chat senden via /hooks/wake
export async function sendMessage(text: string): Promise<HeartbeatResponse> {
  const response = await fetch(`${GATEWAY_URL}/hooks/wake`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Token könnte aus Config kommen
    },
    body: JSON.stringify({
      text,
      mode: 'next-heartbeat'
    })
  });

  if (!response.ok) {
    throw new Error(`Gateway error: ${response.status}`);
  }

  return response.json();
}

// Manuellen Heartbeat auslösen via /api/heartbeat/trigger
export async function triggerHeartbeat(): Promise<HeartbeatResponse> {
  const response = await fetch(`${GATEWAY_URL}/api/heartbeat/trigger`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Heartbeat error: ${response.status}`);
  }

  return response.json();
}

// Neue Session starten (via Agent-Hook)
export async function startNewSession(): Promise<HeartbeatResponse> {
  // Eine leere Nachricht triggert eine neue Session
  const response = await fetch(`${GATEWAY_URL}/hooks/wake`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: '', // Leere Nachricht = neue Session
      mode: 'new-session'
    })
  });

  if (!response.ok) {
    throw new Error(`New session error: ${response.status}`);
  }

  return response.json();
}

// Gateway-Status prüfen
export async function checkGatewayStatus(): Promise<boolean> {
  try {
    const response = await fetch(`${GATEWAY_URL}/health`, {
      method: 'GET'
    });
    return response.ok;
  } catch {
    return false;
  }
}
