// Gateway WebSocket Client für Øm Dashboard
// Protokoll: https://docs.openclaw.ai/gateway/protocol

export interface GatewayEventFrame {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
}

export interface GatewayResponseFrame {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
}

export interface GatewayHelloOk {
  type: "hello-ok";
  protocol: number;
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
  };
}

export type ThoughtStreamEntry = {
  id: string;
  runId: string;
  seq: number;
  ts: number;
  label: string;
  summary: string;
  rawSummary?: string;
  detail?: string;
  risk?: string;
  phase?: string;
};

export type ToolStreamEntry = {
  toolCallId: string;
  runId: string;
  name: string;
  args?: unknown;
  output?: string;
  startedAt: number;
  status?: "running" | "ok" | "error";
};

export interface OmState {
  energy: number;
  mode: string;
  mood: string;
  aura: { C1: number; C2: number; C3: number; C4: number; C5: number; C6: number; C7: number };
  lastHeartbeat: number;
  thoughtEvents: ThoughtStreamEntry[];
  toolEvents: ToolStreamEntry[];
}

export type OmEventCallback = (state: OmState) => void;

const GATEWAY_URL = 'ws://localhost:18789';
const GATEWAY_TOKEN = '8ea0f08fae9553b6d44c9ca55da364a4ce9ab5306fb4eae7';

export class GatewayClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectDelay = 1000;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private lastSeq: number | null = null;
  private connected = false;

  private state: OmState = {
    energy: 0,
    mode: 'initiative',
    mood: '',
    aura: { C1: 0, C2: 0, C3: 0, C4: 0, C5: 0, C6: 0, C7: 0 },
    lastHeartbeat: 0,
    thoughtEvents: [],
    toolEvents: []
  };

  private callbacks: Set<OmEventCallback> = new Set();

  constructor(
    private url: string = GATEWAY_URL,
    private token: string = GATEWAY_TOKEN
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[Gateway] Connected');
        this.connected = true;
        this.reconnectDelay = 1000;
        this.sendConnect();
        resolve();
      };

      this.ws.onclose = (ev) => {
        console.log('[Gateway] Closed:', ev.code, ev.reason);
        this.connected = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[Gateway] Error:', err);
        reject(err);
      };

      this.ws.onmessage = (ev) => this.handleMessage(ev.data);
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      console.log('[Gateway] Reconnecting...');
      this.connect().catch(() => {});
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }

  private sendConnect() {
    if (!this.ws) return;

    const frame = {
      type: 'req',
      id: crypto.randomUUID(),
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'webchat',
          version: '0.1',
          platform: 'web',
          mode: 'webchat'
        },
        role: 'operator',
        scopes: ['operator.admin', 'operator.approvals', 'operator.pairing'],
        auth: this.token ? { token: this.token } : undefined
      }
    };

    this.ws.send(JSON.stringify(frame));
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const frame = parsed as { type?: string };

    if (frame.type === 'event') {
      this.handleEvent(parsed as GatewayEventFrame);
      return;
    }

    if (frame.type === 'res') {
      const res = parsed as GatewayResponseFrame;
      const pending = this.pending.get(res.id);
      if (pending) {
        this.pending.delete(res.id);
        if (res.ok) {
          pending.resolve(res.payload);
        } else {
          pending.reject(new Error(res.error?.message ?? 'request failed'));
        }
      }
      return;
    }

    if (frame.type === 'hello-ok') {
      console.log('[Gateway] Authenticated');
      return;
    }
  }

  private handleEvent(frame: GatewayEventFrame) {
    const seq = typeof frame.seq === 'number' ? frame.seq : null;
    if (seq !== null && this.lastSeq !== null && seq > this.lastSeq + 1) {
      console.warn('[Gateway] Gap detected:', this.lastSeq + 1, '->', seq);
    }
    this.lastSeq = seq;

    const event = frame.event;
    const payload = frame.payload as Record<string, unknown>;

    // Energy Events
    if (event === 'agent.thought' || event === 'thought') {
      const data = payload as Record<string, unknown>;
      const phase = (data.phase as string) || (data.label as string) || '';

      if (phase === 'energy') {
        const summary = (data.summary as string) || (data.source as string) || '';
        const match = summary.match(/level=(\d+)/);
        if (match) {
          this.state.energy = parseInt(match[1]);
          const modeMatch = summary.match(/mode=(\w+)/);
          if (modeMatch) {
            this.state.mode = modeMatch[1];
          }
          this.notify();
        }
      }

      // Store thought events
      if (data.summary || data.source) {
        const entry: ThoughtStreamEntry = {
          id: crypto.randomUUID(),
          runId: (data.runId as string) || '',
          seq: seq || 0,
          ts: Date.now(),
          label: phase,
          summary: (data.summary as string) || (data.source as string) || '',
          rawSummary: data.rawSummary as string | undefined,
          detail: data.detail as string | undefined,
          risk: data.risk as string | undefined,
          phase
        };
        this.state.thoughtEvents = [...this.state.thoughtEvents.slice(-50), entry];
      }
    }

    // Tool Events
    if (event === 'agent.tool' || event === 'tool') {
      const data = payload as Record<string, unknown>;
      const name = (data.name as string) || '';
      const status = (data.status as string) || 'running';

      const entry: ToolStreamEntry = {
        toolCallId: (data.toolCallId as string) || crypto.randomUUID(),
        runId: (data.runId as string) || '',
        name,
        args: data.args,
        output: data.output as string | undefined,
        startedAt: (data.startedAt as number) || Date.now(),
        status: status as "running" | "ok" | "error"
      };

      // Update or add
      const existing = this.state.toolEvents.findIndex(t => t.toolCallId === entry.toolCallId);
      if (existing >= 0) {
        this.state.toolEvents[existing] = entry;
      } else {
        this.state.toolEvents = [...this.state.toolEvents.slice(-30), entry];
      }
      this.notify();
    }

    // Aura Events
    if (event === 'agent.aura' || event === 'aura') {
      const data = payload as Record<string, unknown>;
      const auraStr = (data.aura as string) || '';
      const match = auraStr.match(/C(\d)=([\d.]+)/g);
      if (match) {
        match.forEach(m => {
          const [, c, v] = m.match(/C(\d)=([\d.]+)/) || [];
          if (c) {
            (this.state.aura as Record<string, number>)[`C${c}`] = parseFloat(v);
          }
        });
        this.notify();
      }
    }

    // Mood/Message Events
    if (event === 'agent.message' || event === 'message') {
      const data = payload as Record<string, unknown>;
      const content = (data.content as string) || '';

      // Extract mood if present
      const moodMatch = content.match(/<om_mood>([^<]+)<\/om_mood>/);
      if (moodMatch) {
        this.state.mood = moodMatch[1];
        this.notify();
      }
    }

    this.state.lastHeartbeat = Date.now();
  }

  private notify() {
    this.callbacks.forEach(cb => cb({ ...this.state }));
  }

  subscribe(callback: OmEventCallback): () => void {
    this.callbacks.add(callback);
    callback({ ...this.state }); // Initial state
    return () => this.callbacks.delete(callback);
  }

  isConnected(): boolean {
    return this.connected;
  }

  getState(): OmState {
    return { ...this.state };
  }

  async sendMessage(text: string): Promise<void> {
    await this.request('operator.send', { text });
  }

  async triggerHeartbeat(): Promise<void> {
    await this.request('operator.heartbeat', {});
  }

  private request<T = unknown>(method: string, params?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('gateway not connected'));
        return;
      }

      const id = crypto.randomUUID();
      const frame = { type: 'req', id, method, params };

      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject
      });

      this.ws.send(JSON.stringify(frame));

      // Timeout
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('request timeout'));
        }
      }, 10000);
    });
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }
}

// Singleton instance
let client: GatewayClient | null = null;

export function getGatewayClient(url?: string, token?: string): GatewayClient {
  if (!client) {
    client = new GatewayClient(url, token);
  }
  return client;
}
