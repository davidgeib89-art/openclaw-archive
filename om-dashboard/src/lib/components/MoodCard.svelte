<script lang="ts">
  export let mood: string = '';
  export let mode: string = 'initiative';

  // Emoji basierend auf Modus
  const modeEmojis: Record<string, string> = {
    'initiative': '🎯',
    'dream': '🌙',
    'balanced': '⚖️',
    'sleeping': '💤'
  };

  const modeLabels: Record<string, string> = {
    'initiative': 'Aktiv & Handelnd',
    'dream': 'Träumend',
    'balanced': 'Ausbalanciert',
    'sleeping': 'Schlafend'
  };

  $: emoji = modeEmojis[mode] || '🧠';
  $: modeLabel = modeLabels[mode] || mode;
</script>

<div class="mood-card">
  <div class="header">
    <span class="icon">{emoji}</span>
    <span class="title">Zustand</span>
  </div>

  <div class="mood-text">
    {#if mood}
      {mood}
    {:else}
      <span class="placeholder">Wird geladen...</span>
    {/if}
  </div>

  <div class="mode-indicator">
    <span class="mode-badge">{modeLabel}</span>
  </div>
</div>

<style>
  .mood-card {
    background: #1a1a2a;
    border-radius: 1rem;
    padding: 1rem;
    border: 1px solid #2a2a3a;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .icon {
    font-size: 1.25rem;
  }

  .title {
    font-size: 0.875rem;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .mood-text {
    font-size: 0.9rem;
    color: #e8e6e3;
    line-height: 1.5;
    margin-bottom: 0.75rem;
    min-height: 3rem;
  }

  .placeholder {
    color: #4b5563;
    font-style: italic;
  }

  .mode-indicator {
    display: flex;
    justify-content: flex-end;
  }

  .mode-badge {
    background: #2a2a3a;
    padding: 0.25rem 0.75rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    color: #b8a9c9;
  }
</style>
