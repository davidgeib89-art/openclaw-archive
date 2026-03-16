# Om Architecture (Current)

Last updated: 2026-03-16

## Stack boundary

OpenClaw is the control plane.
Om is the cognition plane running on top of it.

OpenClaw handles:

- channels and session routing
- tool execution surfaces
- gateway and app integration

Om handles:

- internal state interpretation
- memory pressure and recall dynamics
- autonomous path selection and self-regulation

## Trinity model

Om runs as a three-system loop:

1. System 1 (subconscious daemon): fast pattern pressure and latent intuitions.
2. System 2 (somatic synthesis): converts state vectors into body-like felt markers.
3. System 3 (ego actor): deliberate language and tool behavior.

## Core rhythm

- Heartbeat cycle drives the deliberate loop.
- Daemon cycle runs asynchronously for subconscious pressure updates.
- Somatic output is injected as bounded bias, not absolute control.

## Memory model

Primary long-horizon memory lives in episodic storage with repression semantics.

- active and repressed entries co-exist
- repression is not deletion
- latent energy accumulates through semantic resonance

This allows unresolved material to influence behavior without flooding direct recall.

## H.3 shadow thermodynamics (live)

The current implementation uses a Gibbs-Helmholtz-style pressure model:

- Delta H proxy from latent memory pressure
- Delta S proxy from complexity/diversity signal
- T from arousal-linked regulation bridge
- Delta G used for zone classification

Zones:

- stable
- distortion
- eruption

Safety controls:

- hysteresis bands
- dwell requirement before eruption
- single-node breakthrough per beat
- defibrillator hard disable path
- fail-open execution to protect heartbeat continuity

## Logging and observability

Current logging separation:

- operator stream: short human-readable entries
- telemetry stream: compact machine-readable events for analysis
- trace stream: richer debug context with bounded rotation

Structured telemetry now includes Gibbs evaluation records for calibration loops.

## Runtime safety

The system is designed to avoid runaway loops and preserve operation under fault:

- hard guardrails for dangerous action modes
- lockouts for emergency states
- bounded tool execution behavior
- explicit event-level observability

## Operational source files

For exact implementation, inspect:

- `src/agents/pi-embedded-runner/run/attempt.ts`
- `src/agents/om-scaffolding.ts`
- `src/brain/gibbs-helmholtz.ts`
- `src/brain/subconscious.ts`
- `src/brain/somatic.ts`
- `src/brain/episodic-memory.ts`
