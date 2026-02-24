<script lang="ts">
  export let level: number = 0;

  // Farbe basierend auf Energy-Level
  $: color = level > 80 ? '#22c55e' : level > 50 ? '#f4a261' : '#ef4444';
  $: label = level > 80 ? 'Volle Kraft' : level > 50 ? 'Ausbalanciert' : level > 20 ? 'Erholung' : 'Energie sparend';
</script>

<div class="energy-card">
  <div class="header">
    <span class="icon">⚡</span>
    <span class="title">Energie</span>
  </div>

  <div class="energy-bar-container">
    <div class="energy-bar" style="width: {level}%; background: {color};"></div>
  </div>

  <div class="info">
    <span class="level">{level}%</span>
    <span class="label">{label}</span>
  </div>
</div>

<style>
  .energy-card {
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

  .energy-bar-container {
    height: 8px;
    background: #2a2a3a;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 0.5rem;
  }

  .energy-bar {
    height: 100%;
    border-radius: 4px;
    transition: width 0.5s ease, background 0.5s ease;
  }

  .info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .level {
    font-size: 1.5rem;
    font-weight: bold;
    color: #e8e6e3;
  }

  .label {
    font-size: 0.75rem;
    color: #6b7280;
  }
</style>
