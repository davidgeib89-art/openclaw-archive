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

  // Determine Dominant Chakra
  $: maxVal = Math.max(...values);
  $: domIndex = values.indexOf(maxVal);
  $: dominantChakra = CHAKRA_COLORS[domIndex];

</script>

<div class="aura-card" style="box-shadow: 0 0 40px {dominantChakra.color}20, inset 0 0 20px {dominantChakra.color}10;">
  <div class="card-header">
    <div class="header-content">
      <span class="card-icon">🌀</span>
      <span class="card-title">Aura Resonanz</span>
    </div>
    <span class="overall-badge" style="color: {overallHealth > 70 ? '#22c55e' : overallHealth > 40 ? '#eab308' : '#ef4444'}">
      {overallHealth}%
    </span>
  </div>

  <div class="dominant-wrapper">
    <div class="dominant-ring" style="border-color: {dominantChakra.color}; box-shadow: 0 0 20px {dominantChakra.glow}, inset 0 0 20px {dominantChakra.glow};">
      <div class="dominant-inner">
        <span class="dom-val" style="color: {dominantChakra.color}; text-shadow: 0 0 10px {dominantChakra.glow};">{maxVal}%</span>
        <span class="dom-name">{dominantChakra.name}</span>
      </div>
    </div>
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
    background: rgba(20, 20, 34, 0.4);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 1.25rem;
    padding: 1.25rem;
    transition: all 0.5s ease;
    margin-bottom: 1rem;
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
  }

  .aura-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0) 100%);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .card-icon { font-size: 1.1rem; }
  .card-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: #e8e6e3;
    letter-spacing: 0.05em;
  }

  .overall-badge {
    font-size: 0.9rem;
    font-weight: 700;
    font-family: 'Outfit', sans-serif;
  }

  /* Dominant Chakra Ring */
  .dominant-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 1.5rem;
    padding: 1rem 0;
  }

  .dominant-ring {
    width: 100px;
    height: 100px;
    border-radius: 50%;
    border: 3px solid;
    display: flex;
    justify-content: center;
    align-items: center;
    animation: breathing 4s ease-in-out infinite alternate;
    transition: all 0.6s ease;
  }

  @keyframes breathing {
    0% { transform: scale(0.95); opacity: 0.8; }
    100% { transform: scale(1.05); opacity: 1; }
  }

  .dominant-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .dom-val {
    font-size: 1.7rem;
    font-weight: 800;
    line-height: 1.1;
    font-family: 'Outfit', sans-serif;
    transition: all 0.6s ease;
  }

  .dom-name {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #9ca3af;
    margin-top: 0.1rem;
  }

  .faggin-row {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
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
    font-family: 'Outfit', sans-serif;
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
    gap: 0.5rem;
  }

  .chakra-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .chakra-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .chakra-track {
    flex: 1;
    height: 5px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 3px;
    overflow: hidden;
  }

  .chakra-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .chakra-val {
    font-size: 0.7rem;
    color: #9ca3af;
    font-family: 'Outfit', sans-serif;
    min-width: 26px;
    text-align: right;
  }
</style>
