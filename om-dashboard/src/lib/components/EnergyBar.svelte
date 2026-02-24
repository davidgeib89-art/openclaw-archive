<script lang="ts">
  export let level: number = 0;
  export let history: Array<{ t: number; v: number }> = [];

  $: color = level > 75 ? '#22c55e' : level > 45 ? '#eab308' : level > 20 ? '#f97316' : '#ef4444';
  $: glow  = level > 75 ? '#22c55e40' : level > 45 ? '#eab30840' : level > 20 ? '#f9731640' : '#ef444440';
  $: label = level > 75 ? 'Volle Kraft' : level > 45 ? 'Ausbalanciert' : level > 20 ? 'Erholung' : 'Schlaftief';

  const MODE_LABELS: Record<string, string> = {
    initiative: 'Aktiv',
    dream:      'Träumend',
    balanced:   'Balanciert',
    sleeping:   'Schlafend',
  };
  export let mode: string = 'initiative';
  $: modeLabel = MODE_LABELS[mode] ?? mode;

  // Sparkline from history (last 30 values)
  $: sparkPoints = (() => {
    const pts = history.slice(-30);
    if (pts.length < 2) return '';
    const w = 220, h = 28;
    const minV = Math.min(...pts.map(p => p.v));
    const maxV = Math.max(...pts.map(p => p.v));
    const range = Math.max(maxV - minV, 1);
    return pts.map((p, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((p.v - minV) / range) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  })();
</script>

<div class="energy-card">
  <div class="card-header">
    <span class="card-icon">⚡</span>
    <span class="card-title">Energie</span>
    <span class="mode-tag" style="background: color-mix(in srgb, {color} 15%, transparent); color: {color};">
      {modeLabel}
    </span>
  </div>

  <!-- Big number -->
  <div class="level-row">
    <span class="level-number" style="color: {color}; text-shadow: 0 0 20px {glow};">{level}</span>
    <span class="level-unit">%</span>
  </div>

  <!-- Progress bar -->
  <div class="bar-track">
    <div class="bar-fill" style="width: {level}%; background: {color}; box-shadow: 0 0 12px {glow};"></div>
  </div>

  <!-- Sparkline -->
  {#if sparkPoints}
    <div class="sparkline-wrap">
      <svg viewBox="0 0 220 28" width="100%" height="28" preserveAspectRatio="none">
        <path d={sparkPoints} fill="none" stroke={color} stroke-width="1.5" opacity="0.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
  {/if}

  <div class="label-row">
    <span class="status-label">{label}</span>
  </div>
</div>

<style>
  .energy-card {
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

  .mode-tag {
    font-size: 0.65rem;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .level-row {
    display: flex;
    align-items: baseline;
    gap: 0.2rem;
    margin-bottom: 0.5rem;
  }

  .level-number {
    font-size: 2.25rem;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
    line-height: 1;
    transition: color 0.5s ease, text-shadow 0.5s ease;
  }

  .level-unit {
    font-size: 1rem;
    color: #6b7280;
    font-weight: 500;
  }

  .bar-track {
    height: 6px;
    background: #1e1e35;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 0.5rem;
  }

  .bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.8s ease, background 0.5s ease, box-shadow 0.5s ease;
  }

  .sparkline-wrap {
    margin-bottom: 0.4rem;
    opacity: 0.8;
  }

  .label-row {
    display: flex;
    justify-content: flex-end;
  }

  .status-label {
    font-size: 0.7rem;
    color: #4b5563;
    font-style: italic;
  }
</style>
