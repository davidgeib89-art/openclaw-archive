<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import {
    chatMessages, isLoading, gatewayConnected,
    energy, mood, mode, path, aura, energyHistory, lastHeartbeat,
    sessions, currentSession, sessionsLoaded,
    addUserMessage, addAssistantMessage, clearChat,
    loadSessions, loadHistory, connectToGateway,
    type SessionRow, type ChatEntry,
  } from '$lib/stores';
  import { getGatewayClient } from '$lib/gateway';
  import EnergyBar from '$lib/components/EnergyBar.svelte';
  import MoodCard from '$lib/components/MoodCard.svelte';
  import AuraOrb from '$lib/components/AuraOrb.svelte';

  let inputText = '';
  let messagesEl: HTMLDivElement;
  let historyLoadTriggered = false; // Replaces historyLoaded
  let sessionDropdownOpen = false;

  // ─── Scroll to bottom on new messages ────────────────────────────────────
  $: if ($chatMessages.length && messagesEl) {
    tick().then(() => {
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  // ─── Load history when session changes ───────────────────────────────────
  // Removed reactive auto-load of history on session change.
  // History is now loaded manually via button click.

  async function loadHistoryManually() {
    if (!$currentSession?.sessionId) return;
    historyLoadTriggered = true;
    isLoading.set(true);
    clearChat();
    const msgs = await loadHistory($currentSession.sessionId);
    if (msgs.length > 0) chatMessages.set(msgs);
    isLoading.set(false);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  onMount(async () => {
    // Load sessions from disk (lightweight — only reads sessions.json metadata)
    await loadSessions();

    // Connect gateway for live events (non-blocking)
    connectToGateway().then(() => {
      gatewayConnected.set(true);
    }).catch(() => {
      // offline is fine, disk-based features still work
    });
  });

  onDestroy(() => {
    getGatewayClient()?.disconnect();
  });

  // ─── Send message ─────────────────────────────────────────────────────────
  async function handleSend() {
    if (!inputText.trim() || $isLoading) return;
    const text = inputText.trim();
    inputText = '';
    isLoading.set(true);
    addUserMessage(text);

    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionKey: $currentSession?.key ?? 'agent:main:main',
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        addAssistantMessage(`⚠️ Fehler: ${data.error ?? 'Unbekannt'}`);
      }
    } catch (e) {
      addAssistantMessage(`⚠️ Netzwerkfehler: ${e}`);
    } finally {
      isLoading.set(false);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ─── Session switcher ─────────────────────────────────────────────────────
  async function selectSession(s: SessionRow) {
    currentSession.set(s);
    sessionDropdownOpen = false;
  }

  function formatTime(ts: number | null): string {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(ts: number | null): string {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return `Heute ${formatTime(ts)}`;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + formatTime(ts);
  }

  function sessionIcon(s: SessionRow): string {
    if (s.channel === 'whatsapp') return '📱';
    if (s.key.includes('main:main')) return '🦊';
    return '💬';
  }

  // Close dropdown on outside click
  function handleDocClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.session-switcher')) {
      sessionDropdownOpen = false;
    }
  }
</script>

<svelte:document on:click={handleDocClick} />

<div class="app">
  <!-- ── Header ─────────────────────────────────────────────────────────── -->
  <header class="header">
    <div class="header-left">
      <div class="logo">
        <span class="logo-icon">🦊</span>
        <span class="logo-text">Øm Dashboard</span>
      </div>

      <!-- Session switcher -->
      <div class="session-switcher">
        <button
          class="session-btn"
          id="session-switcher-btn"
          on:click={() => (sessionDropdownOpen = !sessionDropdownOpen)}
        >
          <span class="session-icon">{$currentSession ? sessionIcon($currentSession) : '💬'}</span>
          <span class="session-name">
            {$currentSession?.displayName ?? ($sessionsLoaded ? 'Session wählen' : 'Lade…')}
          </span>
          <span class="session-chevron" class:open={sessionDropdownOpen}>▾</span>
        </button>

        {#if sessionDropdownOpen && $sessions.length > 0}
          <div class="session-dropdown" role="listbox" aria-label="Session wählen">
            {#each $sessions as s (s.key)}
              <button
                class="session-option"
                class:active={s.key === $currentSession?.key}
                role="option"
                aria-selected={s.key === $currentSession?.key}
                on:click={() => selectSession(s)}
              >
                <span class="option-icon">{sessionIcon(s)}</span>
                <span class="option-info">
                  <span class="option-name">{s.displayName}</span>
                  {#if s.updatedAt}
                    <span class="option-time">{formatDate(s.updatedAt)}</span>
                  {/if}
                </span>
                {#if s.key === $currentSession?.key}
                  <span class="option-check">✓</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div class="header-right">
      <div class="conn-indicator" class:connected={$gatewayConnected} title={$gatewayConnected ? 'Gateway verbunden' : 'Gateway offline'}>
        <span class="conn-dot"></span>
        <span class="conn-text">{$gatewayConnected ? 'Live' : 'Offline'}</span>
      </div>
    </div>
  </header>

  <!-- ── Main Layout ────────────────────────────────────────────────────── -->
  <div class="main">
    <!-- Sidebar: Om's Vitals -->
    <aside class="sidebar">
      <EnergyBar level={$energy} mode={$mode} history={$energyHistory} />
      <MoodCard mood={$mood} path={$path} lastHeartbeat={$lastHeartbeat} />
      <AuraOrb aura={$aura} />
    </aside>

    <!-- Chat Area -->
    <section class="chat-section">
      <div class="messages" bind:this={messagesEl}>
        {#if $chatMessages.length === 0}
          <div class="welcome">
            <div class="welcome-icon">🦊</div>
            {#if $currentSession}
              <p class="welcome-title">{$currentSession.displayName}</p>
              {#if !historyLoadTriggered}
                <button class="load-hist-btn" id="load-history-btn" on:click={loadHistoryManually}>
                  📜 Verlauf laden
                </button>
              {:else}
                <p class="welcome-sub">Lade Verlauf…</p>
              {/if}
            {:else}
              <p class="welcome-title">Øm schläft… oder denkt.</p>
              <p class="welcome-sub">Wähle eine Session oben</p>
            {/if}
          </div>
        {/if}

        {#each $chatMessages as msg (msg.id)}
          <div class="msg msg-{msg.role}">
            <div class="msg-avatar">
              {msg.role === 'user' ? '👤' : '🦊'}
            </div>
            <div class="msg-bubble">
              <div class="msg-content">{msg.content.length > 800 ? msg.content.slice(0, 800) + '…' : msg.content}</div>
              <div class="msg-time">{formatTime(msg.timestamp)}</div>
            </div>
          </div>
        {/each}

        {#if $isLoading}
          <div class="msg msg-assistant">
            <div class="msg-avatar">🦊</div>
            <div class="msg-bubble typing-bubble">
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
            </div>
          </div>
        {/if}
      </div>

      <!-- Input -->
      <div class="input-row">
        <textarea
          id="chat-input"
          bind:value={inputText}
          on:keydown={handleKeydown}
          placeholder="Nachricht an Øm… (Enter zum Senden)"
          disabled={$isLoading}
          rows="1"
        ></textarea>
        <button
          id="send-btn"
          class="send-btn"
          on:click={handleSend}
          disabled={$isLoading || !inputText.trim()}
        >
          ↑
        </button>
      </div>
    </section>
  </div>
</div>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }

  :global(body) {
    background: #07070f;
    color: #e8e6e3;
    font-family: 'Outfit', system-ui, sans-serif;
    height: 100vh;
    overflow: hidden;
  }

  /* ── App Layout ────────────────────────────────────────────────────── */
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-width: 1440px;
    margin: 0 auto;
    padding: 0 1rem;
  }

  /* ── Header ─────────────────────────────────────────────────────────── */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.875rem 0;
    border-bottom: 1px solid #1e1e35;
    flex-shrink: 0;
    gap: 1rem;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    flex: 1;
    min-width: 0;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .logo-icon { font-size: 1.25rem; }
  .logo-text {
    font-size: 1rem;
    font-weight: 600;
    color: #a5b4fc;
    letter-spacing: 0.02em;
  }

  /* Session switcher */
  .session-switcher {
    position: relative;
    min-width: 0;
    flex: 1;
    max-width: 320px;
  }

  .session-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.4rem 0.75rem;
    background: #0f0f1a;
    border: 1px solid #1e1e35;
    border-radius: 0.625rem;
    color: #e8e6e3;
    font-family: inherit;
    font-size: 0.875rem;
    cursor: pointer;
    transition: border-color 0.2s;
    text-align: left;
  }

  .session-btn:hover { border-color: #6366f150; }

  .session-icon { font-size: 0.875rem; flex-shrink: 0; }
  .session-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #c4b5fd;
    font-weight: 500;
  }

  .session-chevron {
    color: #6b7280;
    font-size: 0.75rem;
    transition: transform 0.2s;
    flex-shrink: 0;
  }
  .session-chevron.open { transform: rotate(180deg); }

  .session-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: #0f0f1a;
    border: 1px solid #1e1e35;
    border-radius: 0.75rem;
    overflow: hidden;
    z-index: 100;
    max-height: 300px;
    overflow-y: auto;
    box-shadow: 0 8px 32px #00000060;
  }

  .session-option {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.625rem 0.875rem;
    border: none;
    background: transparent;
    color: #e8e6e3;
    font-family: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .session-option:hover { background: #141422; }
  .session-option.active { background: #1a1a2e; }

  .option-icon { font-size: 0.875rem; flex-shrink: 0; }
  .option-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }
  .option-name {
    color: #e8e6e3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .option-time {
    font-size: 0.65rem;
    color: #4b5563;
    font-family: 'JetBrains Mono', monospace;
  }
  .option-check { color: #6366f1; font-size: 0.75rem; }

  /* Connection indicator */
  .conn-indicator {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.3rem 0.75rem;
    border-radius: 999px;
    background: #0f0f1a;
    border: 1px solid #1e1e35;
  }

  .conn-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #374151;
    transition: background 0.3s, box-shadow 0.3s;
  }
  .conn-indicator.connected .conn-dot {
    background: #22c55e;
    box-shadow: 0 0 8px #22c55e80;
    animation: pulse-dot 2s ease-in-out infinite;
  }

  .conn-text {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
  }
  .conn-indicator.connected .conn-text { color: #22c55e; }

  @keyframes pulse-dot {
    0%, 100% { box-shadow: 0 0 8px #22c55e80; }
    50% { box-shadow: 0 0 14px #22c55eb0; }
  }

  /* ── Main ────────────────────────────────────────────────────────────── */
  .main {
    display: flex;
    flex: 1;
    gap: 1rem;
    overflow: hidden;
    padding: 1rem 0;
    min-height: 0;
  }

  /* ── Sidebar ─────────────────────────────────────────────────────────── */
  .sidebar {
    width: 270px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #1e1e35 transparent;
  }

  /* ── Chat ────────────────────────────────────────────────────────────── */
  .chat-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: #0a0a12;
    border: 1px solid #1e1e35;
    border-radius: 1rem;
    overflow: hidden;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    scrollbar-width: thin;
    scrollbar-color: #1e1e35 transparent;
  }

  /* Welcome / loading states */
  .welcome {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    color: #374151;
    text-align: center;
    padding: 3rem;
  }
  .welcome-icon { font-size: 3rem; opacity: 0.3; }
  .welcome-title { font-size: 1rem; font-weight: 500; color: #4b5563; }
  .welcome-sub { font-size: 0.8rem; color: #374151; }

  .load-hist-btn {
    margin-top: 0.5rem;
    padding: 0.6rem 1.25rem;
    background: #6366f1;
    border: none;
    border-radius: 0.75rem;
    color: #fff;
    font-family: 'Outfit', sans-serif;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
  }
  .load-hist-btn:hover { background: #818cf8; }
  .load-hist-btn:active { transform: scale(0.97); }


  .loading-msg {
    text-align: center;
    color: #4b5563;
    font-size: 0.875rem;
    padding: 2rem;
  }

  .spin {
    display: inline-block;
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Message bubbles */
  .msg {
    display: flex;
    gap: 0.75rem;
    max-width: 80%;
    animation: fadeIn 0.2s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .msg-user {
    align-self: flex-end;
    flex-direction: row-reverse;
  }
  .msg-assistant { align-self: flex-start; }

  .msg-avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #141422;
    border: 1px solid #1e1e35;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .msg-bubble {
    padding: 0.625rem 0.875rem;
    border-radius: 1rem;
    background: #141422;
    border: 1px solid #1e1e35;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .msg-user .msg-bubble {
    background: #1a1a2e;
    border-color: #6366f140;
  }

  .msg-content {
    font-size: 0.875rem;
    line-height: 1.6;
    color: #e8e6e3;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .msg-time {
    font-size: 0.625rem;
    color: #374151;
    font-family: 'JetBrains Mono', monospace;
    text-align: right;
  }

  /* Typing indicator */
  .typing-bubble {
    flex-direction: row;
    align-items: center;
    gap: 0.3rem;
    padding: 0.75rem 1rem;
  }

  .typing-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #6366f1;
    animation: typing 1.4s ease-in-out infinite;
  }
  .typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .typing-dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes typing {
    0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
    30% { opacity: 1; transform: translateY(-4px); }
  }

  /* ── Input ───────────────────────────────────────────────────────────── */
  .input-row {
    display: flex;
    gap: 0.5rem;
    padding: 0.875rem;
    border-top: 1px solid #1e1e35;
    background: #0a0a12;
  }

  textarea {
    flex: 1;
    padding: 0.625rem 0.875rem;
    background: #0f0f1a;
    border: 1px solid #1e1e35;
    border-radius: 0.75rem;
    color: #e8e6e3;
    font-family: 'Outfit', sans-serif;
    font-size: 0.875rem;
    resize: none;
    outline: none;
    transition: border-color 0.2s;
    line-height: 1.5;
    max-height: 120px;
    overflow-y: auto;
  }

  textarea:focus { border-color: #6366f150; }
  textarea:disabled { opacity: 0.4; cursor: not-allowed; }
  textarea::placeholder { color: #374151; }

  .send-btn {
    width: 40px;
    height: 40px;
    border-radius: 0.75rem;
    border: none;
    background: #6366f1;
    color: #fff;
    font-size: 1.1rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s, opacity 0.2s;
    flex-shrink: 0;
    align-self: flex-end;
  }

  .send-btn:hover:not(:disabled) { background: #818cf8; }
  .send-btn:active:not(:disabled) { transform: scale(0.95); }
  .send-btn:disabled { opacity: 0.35; cursor: not-allowed; }
</style>
