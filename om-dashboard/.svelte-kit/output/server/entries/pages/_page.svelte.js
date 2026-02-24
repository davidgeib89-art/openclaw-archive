import { a7 as ssr_context, a8 as fallback, a9 as attr_style, e as escape_html, aa as bind_props, ab as stringify, ac as store_get, ad as ensure_array_like, ae as unsubscribe_stores, af as attr_class, a as attr } from "../../chunks/index2.js";
import "clsx";
import { w as writable } from "../../chunks/index.js";
function onDestroy(fn) {
  /** @type {SSRContext} */
  ssr_context.r.on_destroy(fn);
}
const GATEWAY_URL = "ws://localhost:18789";
const GATEWAY_TOKEN = "8ea0f08fae9553b6d44c9ca55da364a4ce9ab5306fb4eae7";
class GatewayClient {
  constructor(url = GATEWAY_URL, token = GATEWAY_TOKEN) {
    this.url = url;
    this.token = token;
  }
  ws = null;
  reconnectTimer = null;
  reconnectDelay = 1e3;
  pending = /* @__PURE__ */ new Map();
  lastSeq = null;
  connected = false;
  authenticated = false;
  state = {
    energy: 0,
    mode: "initiative",
    mood: "",
    aura: { C1: 0, C2: 0, C3: 0, C4: 0, C5: 0, C6: 0, C7: 0 },
    lastHeartbeat: 0,
    thoughtEvents: [],
    toolEvents: []
  };
  callbacks = /* @__PURE__ */ new Set();
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        console.log("[Gateway] Connected");
        this.connected = true;
        this.reconnectDelay = 1e3;
        this.sendConnect();
        resolve();
      };
      this.ws.onclose = (ev) => {
        console.log("[Gateway] Closed:", ev.code, ev.reason);
        this.connected = false;
        this.scheduleReconnect();
      };
      this.ws.onerror = (err) => {
        console.error("[Gateway] Error:", err);
        reject(err);
      };
      this.ws.onmessage = (ev) => this.handleMessage(ev.data);
    });
  }
  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      console.log("[Gateway] Reconnecting...");
      this.connect().catch(() => {
      });
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 3e4);
  }
  sendConnect() {
    if (!this.ws) return;
    const frame = {
      type: "req",
      id: crypto.randomUUID(),
      method: "connect",
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: "webchat",
          version: "0.1",
          platform: "web",
          mode: "webchat"
        },
        role: "operator",
        scopes: ["operator.admin", "operator.approvals", "operator.pairing", "operator.read"],
        auth: this.token ? { token: this.token } : void 0
      }
    };
    this.ws.send(JSON.stringify(frame));
  }
  handleMessage(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const frame = parsed;
    if (frame.type === "event") {
      this.handleEvent(parsed);
      return;
    }
    if (frame.type === "res") {
      const res = parsed;
      const pending = this.pending.get(res.id);
      if (pending) {
        this.pending.delete(res.id);
        if (res.ok) {
          pending.resolve(res.payload);
        } else {
          pending.reject(new Error(res.error?.message ?? "request failed"));
        }
      }
      return;
    }
    if (frame.type === "hello-ok") {
      console.log("[Gateway] Authenticated");
      this.authenticated = true;
      return;
    }
  }
  handleEvent(frame) {
    const seq = typeof frame.seq === "number" ? frame.seq : null;
    if (seq !== null && this.lastSeq !== null && seq > this.lastSeq + 1) {
      console.warn("[Gateway] Gap detected:", this.lastSeq + 1, "->", seq);
    }
    this.lastSeq = seq;
    const event = frame.event;
    const payload = frame.payload;
    if (event === "agent.thought" || event === "thought") {
      const data = payload;
      const phase = data.phase || data.label || "";
      if (phase === "energy") {
        const summary = data.summary || data.source || "";
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
      if (data.summary || data.source) {
        const entry = {
          id: crypto.randomUUID(),
          runId: data.runId || "",
          seq: seq || 0,
          ts: Date.now(),
          label: phase,
          summary: data.summary || data.source || "",
          rawSummary: data.rawSummary,
          detail: data.detail,
          risk: data.risk,
          phase
        };
        this.state.thoughtEvents = [...this.state.thoughtEvents.slice(-50), entry];
      }
    }
    if (event === "agent.tool" || event === "tool") {
      const data = payload;
      const name = data.name || "";
      const status = data.status || "running";
      const entry = {
        toolCallId: data.toolCallId || crypto.randomUUID(),
        runId: data.runId || "",
        name,
        args: data.args,
        output: data.output,
        startedAt: data.startedAt || Date.now(),
        status
      };
      const existing = this.state.toolEvents.findIndex((t) => t.toolCallId === entry.toolCallId);
      if (existing >= 0) {
        this.state.toolEvents[existing] = entry;
      } else {
        this.state.toolEvents = [...this.state.toolEvents.slice(-30), entry];
      }
      this.notify();
    }
    if (event === "agent.aura" || event === "aura") {
      const data = payload;
      const auraStr = data.aura || "";
      const match = auraStr.match(/C(\d)=([\d.]+)/g);
      if (match) {
        match.forEach((m) => {
          const [, c, v] = m.match(/C(\d)=([\d.]+)/) || [];
          if (c) {
            this.state.aura[`C${c}`] = parseFloat(v);
          }
        });
        this.notify();
      }
    }
    if (event === "agent.message" || event === "message") {
      const data = payload;
      const content = data.content || "";
      const moodMatch = content.match(/<om_mood>([^<]+)<\/om_mood>/);
      if (moodMatch) {
        this.state.mood = moodMatch[1];
        this.notify();
      }
    }
    this.state.lastHeartbeat = Date.now();
  }
  notify() {
    this.callbacks.forEach((cb) => cb({ ...this.state }));
  }
  subscribe(callback) {
    this.callbacks.add(callback);
    callback({ ...this.state });
    return () => this.callbacks.delete(callback);
  }
  isConnected() {
    return this.connected;
  }
  isAuthenticated() {
    return this.authenticated;
  }
  getState() {
    return { ...this.state };
  }
  async sendMessage(text) {
    await this.request("operator.send", { text });
  }
  async triggerHeartbeat() {
    await this.request("operator.heartbeat", {});
  }
  async listSessions() {
    return await this.request("sessions.list", {});
  }
  async switchSession(sessionKey) {
    await this.request("sessions.switch", { sessionKey });
  }
  async createSession() {
    await this.request("sessions.create", {});
  }
  request(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("gateway not connected"));
        return;
      }
      const id = crypto.randomUUID();
      const frame = { type: "req", id, method, params };
      this.pending.set(id, {
        resolve: (v) => resolve(v),
        reject
      });
      this.ws.send(JSON.stringify(frame));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("request timeout"));
        }
      }, 1e4);
    });
  }
  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }
}
let client = null;
function getGatewayClient(url, token) {
  if (!client) {
    client = new GatewayClient(url, token);
  }
  return client;
}
const chatMessages = writable([]);
const sessions = writable([]);
const currentSessionKey = writable("");
const gatewayConnected = writable(false);
const isLoading = writable(false);
const energy = writable(0);
const mood = writable("");
const mode = writable("initiative");
function EnergyBar($$renderer, $$props) {
  let color, label;
  let level = fallback($$props["level"], 0);
  color = level > 80 ? "#22c55e" : level > 50 ? "#f4a261" : "#ef4444";
  label = level > 80 ? "Volle Kraft" : level > 50 ? "Ausbalanciert" : level > 20 ? "Erholung" : "Energie sparend";
  $$renderer.push(`<div class="energy-card svelte-3a968t"><div class="header svelte-3a968t"><span class="icon svelte-3a968t">⚡</span> <span class="title svelte-3a968t">Energie</span></div> <div class="energy-bar-container svelte-3a968t"><div class="energy-bar svelte-3a968t"${attr_style(`width: ${stringify(level)}%; background: ${stringify(color)};`)}></div></div> <div class="info svelte-3a968t"><span class="level svelte-3a968t">${escape_html(level)}%</span> <span class="label svelte-3a968t">${escape_html(label)}</span></div></div>`);
  bind_props($$props, { level });
}
function MoodCard($$renderer, $$props) {
  let emoji, modeLabel;
  let mood2 = fallback($$props["mood"], "");
  let mode2 = fallback($$props["mode"], "initiative");
  const modeEmojis = {
    "initiative": "🎯",
    "dream": "🌙",
    "balanced": "⚖️",
    "sleeping": "💤"
  };
  const modeLabels = {
    "initiative": "Aktiv & Handelnd",
    "dream": "Träumend",
    "balanced": "Ausbalanciert",
    "sleeping": "Schlafend"
  };
  emoji = modeEmojis[mode2] || "🧠";
  modeLabel = modeLabels[mode2] || mode2;
  $$renderer.push(`<div class="mood-card svelte-zx58f7"><div class="header svelte-zx58f7"><span class="icon svelte-zx58f7">${escape_html(emoji)}</span> <span class="title svelte-zx58f7">Zustand</span></div> <div class="mood-text svelte-zx58f7">`);
  if (mood2) {
    $$renderer.push("<!--[-->");
    $$renderer.push(`${escape_html(mood2)}`);
  } else {
    $$renderer.push("<!--[!-->");
    $$renderer.push(`<span class="placeholder svelte-zx58f7">Wird geladen...</span>`);
  }
  $$renderer.push(`<!--]--></div> <div class="mode-indicator svelte-zx58f7"><span class="mode-badge svelte-zx58f7">${escape_html(modeLabel)}</span></div></div>`);
  bind_props($$props, { mood: mood2, mode: mode2 });
}
function SessionSelector($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let loading = false;
    let authRetries = 0;
    async function loadSessions() {
      loading = true;
      try {
        const client2 = getGatewayClient();
        console.log("[Sessions] Loading...");
        const result = await client2.listSessions();
        console.log("[Sessions] Result:", result);
        sessions.set(result.sessions);
        if (result.sessions.length > 0 && !store_get($$store_subs ??= {}, "$currentSessionKey", currentSessionKey)) {
          const mainSession = result.sessions.find((s) => s.key.includes("main") || s.key.includes("agent:main"));
          if (mainSession) {
            currentSessionKey.set(mainSession.key);
          } else {
            currentSessionKey.set(result.sessions[0].key);
          }
        }
      } catch (e) {
        console.error("[Sessions] Load error:", e);
      } finally {
        loading = false;
      }
    }
    function formatSessionName(session) {
      if (session.displayName) return session.displayName;
      if (session.label) return session.label;
      if (session.subject) return session.subject;
      if (session.surface) return session.surface;
      return session.key.split(":").pop() || session.key;
    }
    function formatTime(timestamp) {
      if (!timestamp) return "N/A";
      const date = new Date(timestamp);
      return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    }
    if (store_get($$store_subs ??= {}, "$gatewayConnected", gatewayConnected)) {
      const client2 = getGatewayClient();
      if (client2.isAuthenticated()) {
        console.log("[Sessions] Authenticated, loading...");
        loadSessions();
      } else {
        console.log("[Sessions] Not authenticated yet, retry:", authRetries);
        authRetries++;
      }
    }
    $$renderer2.push(`<div class="session-selector svelte-192hfvl"><div class="header svelte-192hfvl"><span class="label svelte-192hfvl">Session</span> <button class="new-btn svelte-192hfvl" title="Neue Session">+</button></div> `);
    if (
      // Aktuelle Session finden
      // Versuchen die "main" Session zu finden
      // Formatieren des Session-Namens
      loading && store_get($$store_subs ??= {}, "$sessions", sessions).length === 0
    ) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="loading svelte-192hfvl">Lade Sessions...</div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.select(
        {
          value: store_get($$store_subs ??= {}, "$currentSessionKey", currentSessionKey),
          class: "session-dropdown"
        },
        ($$renderer3) => {
          $$renderer3.push(`<!--[-->`);
          const each_array = ensure_array_like(store_get($$store_subs ??= {}, "$sessions", sessions));
          for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
            let session = each_array[$$index];
            $$renderer3.option({ value: session.key }, ($$renderer4) => {
              $$renderer4.push(`${escape_html(formatSessionName(session))} (${escape_html(formatTime(session.updatedAt))})`);
            });
          }
          $$renderer3.push(`<!--]-->`);
        },
        "svelte-192hfvl"
      );
    }
    $$renderer2.push(`<!--]--></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let inputText = "";
    let messagesContainer;
    onDestroy(() => {
    });
    if (store_get($$store_subs ??= {}, "$chatMessages", chatMessages) && messagesContainer) ;
    $$renderer2.push(`<div class="dashboard svelte-1uha8ag"><header class="header svelte-1uha8ag"><div class="header-left svelte-1uha8ag"><h1 class="svelte-1uha8ag">ØM Dashboard</h1> `);
    SessionSelector($$renderer2);
    $$renderer2.push(`<!----></div> <div class="status svelte-1uha8ag"><span${attr_class("status-dot svelte-1uha8ag", void 0, {
      "connected": store_get($$store_subs ??= {}, "$gatewayConnected", gatewayConnected)
    })}></span> <span class="status-text svelte-1uha8ag">${escape_html(
      // Gateway beim Start verbinden
      // Nachricht senden
      // Heartbeat auslösen
      // Neue Session
      // Enter-Taste zum Senden
      store_get($$store_subs ??= {}, "$gatewayConnected", gatewayConnected) ? "Verbunden" : "Offline"
    )}</span></div></header> <div class="main-layout svelte-1uha8ag"><aside class="sidebar svelte-1uha8ag">`);
    EnergyBar($$renderer2, { level: store_get($$store_subs ??= {}, "$energy", energy) });
    $$renderer2.push(`<!----> `);
    MoodCard($$renderer2, {
      mood: store_get($$store_subs ??= {}, "$mood", mood),
      mode: store_get($$store_subs ??= {}, "$mode", mode)
    });
    $$renderer2.push(`<!----></aside> <main class="chat-area svelte-1uha8ag"><div class="messages svelte-1uha8ag">`);
    if (store_get($$store_subs ??= {}, "$chatMessages", chatMessages).length === 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="welcome svelte-1uha8ag"><p class="svelte-1uha8ag">Willkommen bei Øms Dashboard</p> <p class="hint svelte-1uha8ag">Sende eine Nachricht oder löse einen Heartbeat aus</p></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <!--[-->`);
    const each_array = ensure_array_like(store_get($$store_subs ??= {}, "$chatMessages", chatMessages));
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let msg = each_array[$$index];
      $$renderer2.push(`<div${attr_class(`message ${stringify(msg.role)}`, "svelte-1uha8ag")}><div class="avatar svelte-1uha8ag">${escape_html(msg.role === "user" ? "👤" : "🦊")}</div> <div class="content svelte-1uha8ag">${escape_html(msg.content)}</div></div>`);
    }
    $$renderer2.push(`<!--]--> `);
    if (store_get($$store_subs ??= {}, "$isLoading", isLoading)) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="message assistant svelte-1uha8ag"><div class="avatar svelte-1uha8ag">🦊</div> <div class="content typing svelte-1uha8ag"><span class="svelte-1uha8ag">Øm denkt nach</span> <span class="dots svelte-1uha8ag">...</span></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div></main></div> <footer class="input-area svelte-1uha8ag"><input type="text"${attr("value", inputText)} placeholder="Nachricht an Øm..."${attr("disabled", store_get($$store_subs ??= {}, "$isLoading", isLoading), true)} class="svelte-1uha8ag"/> <button class="btn send svelte-1uha8ag"${attr("disabled", store_get($$store_subs ??= {}, "$isLoading", isLoading) || !inputText.trim(), true)}>✉️ Senden</button></footer> <div class="controls svelte-1uha8ag"><button class="btn heartbeat svelte-1uha8ag"${attr("disabled", store_get($$store_subs ??= {}, "$isLoading", isLoading), true)}>💓 Heartbeat</button> <button class="btn new-session svelte-1uha8ag"${attr("disabled", store_get($$store_subs ??= {}, "$isLoading", isLoading), true)}>🆕 Neue Session</button></div></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _page as default
};
