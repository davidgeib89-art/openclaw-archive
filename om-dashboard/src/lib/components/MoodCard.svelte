<script lang="ts">
  export let mood: string = '';
  export let path: string = '';
  export let lastHeartbeat: number | null = null;

  const PATH_META: Record<string, { icon: string; color: string; label: string }> = {
    PLAY:     { icon: '🎨', color: '#f97316', label: 'Spielen' },
    LEARN:    { icon: '📚', color: '#6366f1', label: 'Lernen' },
    MAINTAIN: { icon: '🔧', color: '#06b6d4', label: 'Pflegen' },
    DRIFT:    { icon: '🌊', color: '#8b5cf6', label: 'Driften' },
    NO_OP:    { icon: '🍃', color: '#22c55e', label: 'Ruhen' },
    UNKNOWN:  { icon: '❓', color: '#6b7280', label: '...' },
  };

  $: meta = PATH_META[path?.toUpperCase()] ?? PATH_META['UNKNOWN'];

  $: heartbeatAge = (() => {
    if (!lastHeartbeat) return null;
    const s = Math.floor((Date.now() - lastHeartbeat) / 1000);
    if (s < 60) return `vor ${s}s`;
    return `vor ${Math.floor(s / 60)}m`;
  })();
</script>

<div class="mood-card">
  <div class="card-header">
    <span class="card-icon">{meta.icon}</span>
    <span class="card-title">Stimmung</span>
    {#if path}
      <span class="path-badge" style="background: color-mix(in srgb, {meta.color} 15%, transparent); color: {meta.color};">
        {meta.label}
      </span>
    {/if}
  </div>

  <div class="mood-text">
    {#if mood}
      <span class="mood-content">„{mood}"</span>
    {:else}
      <span class="placeholder">Stimmung wird geladen…</span>
    {/if}
  </div>

  {#if heartbeatAge}
    <div class="hb-row">
      <span class="hb-dot"></span>
      <span class="hb-label">Letzter Herzschlag {heartbeatAge}</span>
    </div>
  {/if}
</div>

<style>
  .mood-card {
    background: #0f0f1a;
    border: 1px solid #1e1e35;
    border-radius: 1rem;
    padding: 1rem;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .card-icon { font-size: 1rem; }
  .card-title {
    font-size: 0.75rem;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 500;
    flex: 1;
  }

  .path-badge {
    font-size: 0.65rem;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .mood-text {
    min-height: 2.5rem;
    margin-bottom: 0.75rem;
  }

  .mood-content {
    font-size: 0.875rem;
    color: #c4b5fd;
    line-height: 1.5;
    font-style: italic;
  }

  .placeholder {
    font-size: 0.875rem;
    color: #374151;
    font-style: italic;
  }

  .hb-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .hb-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 6px #22c55e80;
    animation: pulse 2s ease-in-out infinite;
  }

  .hb-label {
    font-size: 0.65rem;
    color: #4b5563;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.8); }
  }
</style>
