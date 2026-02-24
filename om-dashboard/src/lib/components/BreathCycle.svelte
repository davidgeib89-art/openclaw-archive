<script lang="ts">
  import { onMount } from 'svelte';

  // The 18-tick breath cycle represents Tesla's 3-6-9 rhythm:
  // - Inhale: 3 ticks
  // - Hold: 6 ticks
  // - Exhale: 9 ticks
  export let currentTick = 0; // Current tick in the 18-tick cycle (0-17)

  $: phase = getPhase(currentTick);
  $: progress = getProgress(currentTick, phase);

  // Derive phase from tick (0-17)
  function getPhase(tick: number): 'inhale' | 'hold' | 'exhale' {
    const t = tick % 18;
    if (t < 3) return 'inhale';
    if (t < 9) return 'hold';
    return 'exhale';
  }

  // Progress relative to current phase (0 to 1)
  function getProgress(tick: number, currentPhase: 'inhale' | 'hold' | 'exhale'): number {
    const t = tick % 18;
    if (currentPhase === 'inhale') return (t + 1) / 3;
    if (currentPhase === 'hold') return (t - 3 + 1) / 6;
    if (currentPhase === 'exhale') return (t - 9 + 1) / 9;
    return 0;
  }

  // Calculate coordinates for the SVG ring using polar math
  function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);

    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      'M', start.x, start.y, 
      'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y
    ].join(' ');
  }

  function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
  }

  // Colors for glassmorphism and phases
  $: strokeColor = phase === 'inhale' ? '#38bdf8' : (phase === 'hold' ? '#c084fc' : '#4ade80');
  $: shadowColor = phase === 'inhale' ? 'rgba(56,189,248,0.5)' : (phase === 'hold' ? 'rgba(192,132,252,0.5)' : 'rgba(74,222,128,0.5)');

  // Ring angles
  $: ringAngle = Math.min(359.9, progress * 360);
</script>

<div class="breath-container">
  <div class="glass-panel">
    <div class="header">
      <span class="title">Rhythm 18</span>
      <span class="phase-badge {phase}">{phase.toUpperCase()}</span>
    </div>

    <div class="visualization">
      <div class="ring-wrapper" style="--shadow-color: {shadowColor};">
        <svg viewBox="0 0 100 100" class="ring-svg">
          <!-- Background Track -->
          <circle cx="50" cy="50" r="40" class="ring-track" />
          
          <!-- Animated Progress Arc -->
          {#if ringAngle > 0}
            <path 
              d={describeArc(50, 50, 40, 0, ringAngle)} 
              class="ring-progress" 
              stroke={strokeColor} 
              style="filter: drop-shadow(0 0 8px {strokeColor});"
            />
          {/if}
        </svg>

        <div class="center-content">
          <span class="tick-number">{(currentTick % 18) + 1}</span>
          <span class="tick-total">/ 18</span>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .breath-container {
    width: 100%;
    margin-bottom: 1rem;
  }

  .glass-panel {
    background: rgba(20, 20, 34, 0.4);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 1.25rem;
    padding: 1.25rem;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
    position: relative;
    overflow: hidden;
  }

  .glass-panel::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0) 100%);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .title {
    font-size: 0.9rem;
    font-weight: 600;
    color: #e8e6e3;
    letter-spacing: 0.05em;
  }

  .phase-badge {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    letter-spacing: 0.05em;
    transition: all 0.4s ease;
  }

  .phase-badge.inhale { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
  .phase-badge.hold { background: rgba(192, 132, 252, 0.15); color: #c084fc; border: 1px solid rgba(192, 132, 252, 0.3); }
  .phase-badge.exhale { background: rgba(74, 222, 128, 0.15); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.3); }

  .visualization {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 1rem 0;
  }

  .ring-wrapper {
    position: relative;
    width: 120px;
    height: 120px;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 50%;
    /* Subtle pulsing glow behind the ring based on phase */
    animation: glow-pulse 3s infinite alternate;
  }

  @keyframes glow-pulse {
    0% { box-shadow: 0 0 20px -10px var(--shadow-color); }
    100% { box-shadow: 0 0 30px 0px var(--shadow-color); }
  }

  .ring-svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg); /* Start at top */
  }

  .ring-track {
    fill: none;
    stroke: rgba(255, 255, 255, 0.05);
    stroke-width: 6;
  }

  .ring-progress {
    fill: none;
    stroke-width: 6;
    stroke-linecap: round;
    transition: d 0.3s ease-out, stroke 0.4s ease;
  }

  .center-content {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .tick-number {
    font-size: 1.75rem;
    font-weight: 700;
    color: #fff;
    line-height: 1;
    font-family: 'Outfit', sans-serif;
  }

  .tick-total {
    font-size: 0.7rem;
    color: #6b7280;
    margin-top: 0.1rem;
    font-weight: 500;
  }
</style>
