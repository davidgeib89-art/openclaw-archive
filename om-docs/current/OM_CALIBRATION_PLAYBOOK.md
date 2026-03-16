# Om Calibration Playbook (30-50 Beats)

Last updated: 2026-03-16

## Objective

Use live telemetry from a clean restart window to decide whether H.3 and Trinity settings should stay, be tuned, or be hardened.

## Required inputs

Primary:

- `.openclaw/workspace/OM_TELEMETRY.jsonl`
- `.openclaw/workspace/OM_TRACE.jsonl`

Secondary:

- `.openclaw/workspace/logs/brain/thought-stream.jsonl`
- `.openclaw/workspace/logs/brain/decision-*.jsonl`
- `.openclaw/workspace/logs/brain/subconscious-*.jsonl`

## Metrics to extract

Per heartbeat window:

- heartbeat count and interval spread
- Gibbs evaluatedCount, distortionCount, eruptionCandidate rate
- top-node Delta G / Delta H / Delta S trajectories
- transition counters (stable->distortion, distortion->eruption, eruption->distortion, distortion->stable)
- Trinity score and mismatch class distribution
- tool failure rate and recurring error families

## Decision gates

1. Stable baseline

- distortion present but not constant
- eruptions occasional, not every beat
- transition graph shows both escalation and recovery

2. Leak baseline

- distortion or flashback appears nearly every beat
- low transition diversity
- low decay after flashback

Action: raise thresholds and/or add cooldown.

3. Rigid baseline

- almost no distortion over full window
- low responsiveness to meaningful pressure

Action: lower thresholds slightly.

## Recommended tuning order

1. Distortion threshold
2. Eruption threshold
3. Post-flashback cooldown
4. Hysteresis band

Tune one axis at a time.

## Reporting template

- verdict: stable / leak / rigid
- evidence: key counts and ratios
- interpretation: why this pattern appears
- action: exact parameter change proposal
- expected effect in next 30 beats

## Constraints

- no tuning without telemetry evidence
- no multi-parameter jump in one cycle
- preserve fail-open and defibrillator semantics
