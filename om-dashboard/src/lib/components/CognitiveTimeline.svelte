<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';
  import { thoughtEvents, toolEvents } from '../stores';

  // We combine thoughts and tools into a single chronological stream
  $: timeline = [
    ...$thoughtEvents.map(t => ({ ...t, type: 'thought' as const, sortTime: t.ts, uid: t.id })), 
    ...$toolEvents.map(t => ({ ...t, type: 'tool' as const, sortTime: t.startedAt, uid: t.toolCallId }))
  ].sort((a, b) => a.sortTime - b.sortTime);

  // Auto-scroll to bottom of timeline when new events arrive
  let container: HTMLDivElement;
  afterUpdate(() => {
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  });

  // Highlight 'Dream & Perceive' loops differently from others.
  function isDreamLoop(label: string | undefined): boolean {
    if (!label) return false;
    return label.toLowerCase().includes('dream') || label.toLowerCase().includes('perceive') || label.toLowerCase().includes('autonomous');
  }

</script>

<div class="timeline-card">
  <div class="card-header">
    <div class="header-content">
      <span class="card-icon">🧠</span>
      <span class="card-title">Cognitive Flow</span>
    </div>
    <div class="legend">
      <span class="legend-item"><span class="dot dream"></span> Dream Loop</span>
      <span class="legend-item"><span class="dot interactive"></span> Interactive</span>
    </div>
  </div>

  <div class="timeline-container" bind:this={container}>
    {#if timeline.length === 0}
      <div class="empty-state">No cognitive activity detected.</div>
    {:else}
      {#each timeline as event (event.uid)}
        <div class="timeline-item {event.type} {event.type === 'thought' && isDreamLoop(event.label) ? 'dream-node' : 'interactive-node'}">
          <div class="timeline-marker"></div>
          <div class="timeline-content">
            <div class="item-header">
              <span class="time">{new Date(event.sortTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</span>
              {#if event.type === 'thought'}
                <span class="badge {isDreamLoop(event.label) ? 'dream' : 'interactive'}">
                  {event.label}
                </span>
              {:else}
                <span class="badge tool">Tool: {event.name}</span>
              {/if}
            </div>
            
            <div class="item-body">
              {#if event.type === 'thought'}
                {event.summary}
              {:else}
                Status: {event.status}
              {/if}
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .timeline-card {
    background: rgba(20, 20, 34, 0.4);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 1.25rem;
    padding: 1.25rem;
    height: 100%;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }

  .timeline-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0) 100%);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    flex-shrink: 0;
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .card-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: #e8e6e3;
    letter-spacing: 0.05em;
  }

  .legend {
    display: flex;
    gap: 0.75rem;
    font-size: 0.7rem;
    color: #9ca3af;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .dot.dream { background: #c084fc; box-shadow: 0 0 6px #c084fc; }
  .dot.interactive { background: #38bdf8; box-shadow: 0 0 6px #38bdf8; }

  .timeline-container {
    flex: 1;
    overflow-y: auto;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  /* Custom Scrollbar for the timeline */
  .timeline-container::-webkit-scrollbar {
    width: 4px;
  }
  .timeline-container::-webkit-scrollbar-track {
    background: transparent;
  }
  .timeline-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  .empty-state {
    color: #6b7280;
    font-size: 0.85rem;
    text-align: center;
    margin-top: 2rem;
    font-style: italic;
  }

  .timeline-item {
    display: flex;
    gap: 1rem;
    padding-bottom: 1.25rem;
    position: relative;
  }

  .timeline-item:last-child {
    padding-bottom: 0;
  }

  /* Connecting Line */
  .timeline-item:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 4px; /* Center with the 9px marker */
    top: 20px;
    bottom: 0;
    width: 1px;
    background: rgba(255, 255, 255, 0.1);
  }

  .timeline-marker {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #4b5563;
    margin-top: 6px;
    position: relative;
    z-index: 2;
    flex-shrink: 0;
    border: 2px solid #141422; /* match background slightly to "cut" the line */
  }

  .dream-node .timeline-marker {
    background: #c084fc;
    box-shadow: 0 0 8px #c084fc60;
  }

  .interactive-node .timeline-marker {
    background: #38bdf8;
    box-shadow: 0 0 8px #38bdf860;
  }

  .tool .timeline-marker {
    background: #f97316;
    border-radius: 2px; /* make tool nodes look like squares instead of circles */
    box-shadow: 0 0 8px #f9731660;
  }

  .timeline-content {
    flex: 1;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.03);
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
    transition: transform 0.2s ease, background 0.2s ease;
  }

  .timeline-item:hover .timeline-content {
    background: rgba(255, 255, 255, 0.03);
    transform: translateX(2px);
  }

  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .time {
    font-size: 0.65rem;
    color: #6b7280;
    font-family: 'Outfit', sans-serif;
  }

  .badge {
    font-size: 0.6rem;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }

  .badge.dream {
    background: rgba(192, 132, 252, 0.15);
    color: #c084fc;
    border: 1px solid rgba(192, 132, 252, 0.3);
  }

  .badge.interactive {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.3);
  }

  .badge.tool {
    background: rgba(249, 115, 22, 0.15);
    color: #f97316;
    border: 1px solid rgba(249, 115, 22, 0.3);
  }

  .item-body {
    font-size: 0.8rem;
    color: #d1d5db;
    line-height: 1.4;
    word-break: break-word;
  }
</style>
