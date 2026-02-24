<script lang="ts">
  import { sessions, currentSessionKey, gatewayConnected } from '$lib/stores';
  import { getGatewayClient } from '$lib/gateway';
  import { onMount, onDestroy } from 'svelte';

  let loading = false;
  let authCheckInterval: ReturnType<typeof setInterval> | null = null;
  let sessionsLoaded = false;

  // Polling for authentication
  $: if ($gatewayConnected && !sessionsLoaded) {
    startAuthPolling();
  }

  function startAuthPolling() {
    if (authCheckInterval) return;

    console.log('[Sessions] Starting auth polling...');
    authCheckInterval = setInterval(() => {
      const client = getGatewayClient();
      if (client.isAuthenticated()) {
        console.log('[Sessions] Authenticated, loading...');
        stopAuthPolling();
        loadSessions();
      } else {
        console.log('[Sessions] Waiting for authentication...');
      }
    }, 1000);
  }

  function stopAuthPolling() {
    if (authCheckInterval) {
      clearInterval(authCheckInterval);
      authCheckInterval = null;
    }
  }

  onDestroy(() => {
    stopAuthPolling();
  });

  async function loadSessions() {
    if (loading) return;
    loading = true;
    sessionsLoaded = true;
    try {
      const client = getGatewayClient();
      console.log('[Sessions] Loading...');
      const result = await client.listSessions();
      console.log('[Sessions] Result:', result);
      sessions.set(result.sessions);

      // Aktuelle Session finden
      if (result.sessions.length > 0 && !$currentSessionKey) {
        // Versuchen die "main" Session zu finden
        const mainSession = result.sessions.find(s => s.key.includes('main') || s.key.includes('agent:main'));
        if (mainSession) {
          currentSessionKey.set(mainSession.key);
        } else {
          currentSessionKey.set(result.sessions[0].key);
        }
      }
    } catch (e) {
      console.error('[Sessions] Load error:', e);
    } finally {
      loading = false;
    }
  }

  async function handleSessionChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const newKey = select.value;

    if (newKey && newKey !== $currentSessionKey) {
      try {
        const client = getGatewayClient();
        await client.switchSession(newKey);
        currentSessionKey.set(newKey);
      } catch (e) {
        console.error('[Sessions] Switch error:', e);
      }
    }
  }

  async function handleNewSession() {
    try {
      const client = getGatewayClient();
      await client.createSession();
      await loadSessions();
    } catch (e) {
      console.error('[Sessions] Create error:', e);
    }
  }

  // Formatieren des Session-Namens
  function formatSessionName(session: GatewaySessionRow): string {
    if (session.displayName) return session.displayName;
    if (session.label) return session.label;
    if (session.subject) return session.subject;
    if (session.surface) return session.surface;
    return session.key.split(':').pop() || session.key;
  }

  function formatTime(timestamp: number | null): string {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="session-selector">
  <div class="header">
    <span class="label">Session</span>
    <button class="new-btn" on:click={handleNewSession} title="Neue Session">
      +
    </button>
  </div>

  {#if loading && $sessions.length === 0}
    <div class="loading">Lade Sessions...</div>
  {:else}
    <select
      value={$currentSessionKey}
      on:change={handleSessionChange}
      class="session-dropdown"
    >
      {#each $sessions as session (session.key)}
        <option value={session.key}>
          {formatSessionName(session)} ({formatTime(session.updatedAt)})
        </option>
      {/each}
    </select>
  {/if}
</div>

<style>
  .session-selector {
    background: #1a1a2a;
    border-radius: 0.75rem;
    padding: 0.75rem;
    border: 1px solid #2a2a3a;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .label {
    font-size: 0.75rem;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .new-btn {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 0.375rem;
    background: #2a2a3a;
    color: #7c9885;
    font-size:    cursor: pointer 1rem;
;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .new-btn:hover {
    background: #3a3a4a;
  }

  .session-dropdown {
    width: 100%;
    padding: 0.5rem;
    background: #2a2a3a;
    border: 1px solid #3a3a4a;
    border-radius: 0.5rem;
    color: #e8e6e3;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .session-dropdown:focus {
    outline: none;
    border-color: #7c9885;
  }

  .loading {
    color: #6b7280;
    font-size: 0.75rem;
    text-align: center;
    padding: 0.5rem;
  }
</style>
