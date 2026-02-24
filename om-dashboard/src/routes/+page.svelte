<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    chatMessages,
    isLoading,
    gatewayConnected,
    addUserMessage,
    addAssistantMessage,
    clearChat,
    energy,
    mood,
    mode
  } from '$lib/stores';
  import { getGatewayClient } from '$lib/gateway';
  import EnergyBar from '$lib/components/EnergyBar.svelte';
  import MoodCard from '$lib/components/MoodCard.svelte';
  import SessionSelector from '$lib/components/SessionSelector.svelte';

  let inputText = '';
  let messagesContainer: HTMLDivElement;
  let client: ReturnType<typeof getGatewayClient>;

  // Automatisch scrollen bei neuen Nachrichten
  $: if ($chatMessages && messagesContainer) {
    setTimeout(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 50);
  }

  // Gateway beim Start verbinden
  onMount(async () => {
    try {
      client = getGatewayClient();
      await client.connect();
      gatewayConnected.set(true);
      console.log('[Dashboard] Gateway verbunden');
    } catch (e) {
      console.error('[Dashboard] Gateway-Verbindung fehlgeschlagen:', e);
      gatewayConnected.set(false);
    }
  });

  onDestroy(() => {
    client?.disconnect();
  });

  // Nachricht senden
  async function handleSend() {
    if (!inputText.trim() || $isLoading) return;

    const text = inputText.trim();
    inputText = '';
    isLoading.set(true);

    addUserMessage(text);

    try {
      await client.sendMessage(text);
    } catch (e) {
      addAssistantMessage(`Fehler: ${e}`);
    } finally {
      isLoading.set(false);
    }
  }

  // Heartbeat auslösen
  async function handleHeartbeat() {
    isLoading.set(true);
    try {
      await client.triggerHeartbeat();
      addAssistantMessage('💓 Heartbeat ausgelöst');
    } catch (e) {
      addAssistantMessage(`Heartbeat-Fehler: ${e}`);
    } finally {
      isLoading.set(false);
    }
  }

  // Neue Session
  async function handleNewSession() {
    isLoading.set(true);
    clearChat();
    try {
      await client.sendMessage('');
      addAssistantMessage('🆕 Neue Session gestartet');
    } catch (e) {
      addAssistantMessage(`Session-Fehler: ${e}`);
    } finally {
      isLoading.set(false);
    }
  }

  // Enter-Taste zum Senden
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }
</script>

<div class="dashboard">
  <!-- Header -->
  <header class="header">
    <div class="header-left">
      <h1>ØM Dashboard</h1>
      <SessionSelector />
    </div>
    <div class="status">
      <span class="status-dot" class:connected={$gatewayConnected}></span>
      <span class="status-text">{$gatewayConnected ? 'Verbunden' : 'Offline'}</span>
    </div>
  </header>

  <div class="main-layout">
    <!-- Sidebar mit Vitalzeichen -->
    <aside class="sidebar">
      <EnergyBar level={$energy} />
      <MoodCard mood={$mood} mode={$mode} />
    </aside>

    <!-- Chat-Bereich -->
    <main class="chat-area">
      <div class="messages" bind:this={messagesContainer}>
        {#if $chatMessages.length === 0}
          <div class="welcome">
            <p>Willkommen bei Øms Dashboard</p>
            <p class="hint">Sende eine Nachricht oder löse einen Heartbeat aus</p>
          </div>
        {/if}

        {#each $chatMessages as msg (msg.id)}
          <div class="message {msg.role}">
            <div class="avatar">
              {msg.role === 'user' ? '👤' : '🦊'}
            </div>
            <div class="content">
              {msg.content}
            </div>
          </div>
        {/each}

        {#if $isLoading}
          <div class="message assistant">
            <div class="avatar">🦊</div>
            <div class="content typing">
              <span>Øm denkt nach</span>
              <span class="dots">...</span>
            </div>
          </div>
        {/if}
      </div>
    </main>
  </div>

  <!-- Eingabe-Bereich -->
  <footer class="input-area">
    <input
      type="text"
      bind:value={inputText}
      on:keydown={handleKeydown}
      placeholder="Nachricht an Øm..."
      disabled={$isLoading}
    />
    <button class="btn send" on:click={handleSend} disabled={$isLoading || !inputText.trim()}>
      ✉️ Senden
    </button>
  </footer>

  <!-- Steuerung -->
  <div class="controls">
    <button class="btn heartbeat" on:click={handleHeartbeat} disabled={$isLoading}>
      💓 Heartbeat
    </button>
    <button class="btn new-session" on:click={handleNewSession} disabled={$isLoading}>
      🆕 Neue Session
    </button>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: #0a0a12;
    color: #e8e6e3;
    font-family: 'Segoe UI', system-ui, sans-serif;
  }

  .dashboard {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
  }

  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 1rem 0;
    border-bottom: 1px solid #2a2a3a;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .header h1 {
    margin: 0;
    font-size: 1.5rem;
    color: #7c9885;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: #6b7280;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ef4444;
  }

  .status-dot.connected {
    background: #22c55e;
  }

  /* Main Layout */
  .main-layout {
    display: flex;
    flex: 1;
    gap: 1rem;
    overflow: hidden;
    padding: 1rem 0;
  }

  /* Sidebar */
  .sidebar {
    width: 280px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* Chat */
  .chat-area {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .welcome {
    text-align: center;
    color: #6b7280;
    margin-top: 2rem;
  }

  .welcome .hint {
    font-size: 0.875rem;
  }

  .message {
    display: flex;
    gap: 0.75rem;
    max-width: 85%;
  }

  .message.user {
    align-self: flex-end;
    flex-direction: row-reverse;
  }

  .message.assistant {
    align-self: flex-start;
  }

  .avatar {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    background: #1a1a2a;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .content {
    padding: 0.75rem 1rem;
    background: #1a1a2a;
    border-radius: 1rem;
    line-height: 1.5;
  }

  .message.user .content {
    background: #2a2a3a;
  }

  .typing {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .dots {
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }

  /* Input */
  .input-area {
    display: flex;
    gap: 0.5rem;
    padding: 1rem 0;
  }

  .input-area input {
    flex: 1;
    padding: 0.75rem 1rem;
    background: #1a1a2a;
    border: 1px solid #2a2a3a;
    border-radius: 0.75rem;
    color: #e8e6e3;
    font-size: 1rem;
  }

  .input-area input:focus {
    outline: none;
    border-color: #7c9885;
  }

  /* Buttons */
  .btn {
    padding: 0.75rem 1.25rem;
    border: none;
    border-radius: 0.75rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 500;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn.send {
    background: #7c9885;
    color: #0a0a12;
  }

  .btn.send:hover:not(:disabled) {
    background: #8fb89a;
  }

  /* Controls */
  .controls {
    display: flex;
    gap: 0.75rem;
    padding-bottom: 1rem;
  }

  .btn.heartbeat {
    background: #f4a261;
    color: #0a0a12;
    flex: 1;
  }

  .btn.heartbeat:hover:not(:disabled) {
    background: #f6b07a;
  }

  .btn.new-session {
    background: #b8a9c9;
    color: #0a0a12;
    flex: 1;
  }

  .btn.new-session:hover:not(:disabled) {
    background: #c9bbd6;
  }
</style>
