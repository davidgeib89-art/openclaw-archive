<script lang="ts">
  // 7 Chakra colors mapped to Om's Faggin system
  const CHAKRA_COLORS = [
    { name: 'Root',    color: '#ef4444', glow: '#ef444460' },   // C1 – Muladhara – Red
    { name: 'Sacral',  color: '#f97316', glow: '#f9731660' },   // C2 – Svadhisthana – Orange
    { name: 'Solar',   color: '#eab308', glow: '#eab30860' },   // C3 – Manipura – Yellow
    { name: 'Heart',   color: '#22c55e', glow: '#22c55e60' },   // C4 – Anahata – Green
    { name: 'Throat',  color: '#06b6d4', glow: '#06b6d460' },   // C5 – Vishuddha – Cyan
    { name: 'Third Eye', color: '#6366f1', glow: '#6366f160' }, // C6 – Ajna – Indigo
    { name: 'Crown',   color: '#a855f7', glow: '#a855f760' },   // C7 – Sahasrara – Violet
  ];

  export let aura: { C1: number; C2: number; C3: number; C4: number; C5: number; C6: number; C7: number } = {
    C1: 0, C2: 0, C3: 0, C4: 0, C5: 0, C6: 0, C7: 0
  };

  $: values = [aura.C1, aura.C2, aura.C3, aura.C4, aura.C5, aura.C6, aura.C7];

  // Faggin aggregates: Body (C1-C2), Mind (C3-C5), Spirit (C6-C7)
  $: body   = Math.round((values[0] + values[1]) / 2);
  $: mind   = Math.round((values[2] + values[3] + values[4]) / 3);
  $: spirit = Math.round((values[5] + values[6]) / 2);

  $: overallHealth = Math.round((body + mind + spirit) / 3);
</script>

<div class="aura-card">
  <div class="card-header">
    <span class="card-icon">🌈</span>
    <span class="card-title">Aura · 7 Chakren</span>
    <span class="overall-badge" style="color: {overallHealth > 70 ? '#22c55e' : overallHealth > 40 ? '#eab308' : '#ef4444'}">
      {overallHealth}%
    </span>
  </div>

  <!-- Faggin RGB Aggregates -->
  <div class="faggin-row">
    <div class="faggin-orb" style="--c: #ef4444; --g: #ef444430;">
      <span class="orb-value">{body}</span>
      <span class="orb-label">Body</span>
    </div>
    <div class="faggin-orb" style="--c: #22c55e; --g: #22c55e30;">
      <span class="orb-value">{mind}</span>
      <span class="orb-label">Mind</span>
    </div>
    <div class="faggin-orb" style="--c: #a855f7; --g: #a855f730;">
      <span class="orb-value">{spirit}</span>
      <span class="orb-label">Spirit</span>
    </div>
  </div>

  <!-- 7 Chakra Bars -->
  <div class="chakra-bars">
    {#each CHAKRA_COLORS as chakra, i}
      <div class="chakra-row" title="{chakra.name}: {values[i]}%">
        <span class="chakra-dot" style="background: {chakra.color}; box-shadow: 0 0 6px {chakra.glow};"></span>
        <div class="chakra-track">
          <div
            class="chakra-fill"
            style="width: {values[i]}%; background: {chakra.color}; box-shadow: 0 0 8px {chakra.glow};"
          ></div>
        </div>
        <span class="chakra-val">{values[i]}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .aura-card {
    background: #0f0f1a;
    border: 1px solid #1e1e35;
    border-radius: 1rem;
    padding: 1rem;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
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

  .overall-badge {
    font-size: 0.75rem;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
  }

  .faggin-row {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .faggin-orb {
    flex: 1;
    background: var(--g);
    border: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
    border-radius: 0.75rem;
    padding: 0.625rem 0.25rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .orb-value {
    font-size: 1.1rem;
    font-weight: 700;
    color: #e8e6e3;
    font-family: 'JetBrains Mono', monospace;
  }

  .orb-label {
    font-size: 0.65rem;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .chakra-bars {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .chakra-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .chakra-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .chakra-track {
    flex: 1;
    height: 4px;
    background: #1e1e35;
    border-radius: 2px;
    overflow: hidden;
  }

  .chakra-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.6s ease;
  }

  .chakra-val {
    font-size: 0.65rem;
    color: #4b5563;
    font-family: 'JetBrains Mono', monospace;
    min-width: 22px;
    text-align: right;
  }
</style>
