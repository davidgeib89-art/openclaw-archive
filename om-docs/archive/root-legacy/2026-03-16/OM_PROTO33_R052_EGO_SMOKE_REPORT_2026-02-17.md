# OM Proto33 - R052 Ego Smoke Check (Live Gateway)

Date: 2026-02-17
Mode: live channel via gateway service (`node dist/entry.js agent ...` without `--local`)
Gateway restart command: `node dist/entry.js gateway restart`
Restart result: `Restarted Scheduled Task: OpenClaw Gateway`

## Runs

1. `R052_EGO_FORMAT`

- runId: `f5c4e38a-9eaa-4521-ac75-6c252511b1ff`
- status: `ok`
- durationMs: `6922`
- result: `I choose to begin with humility because truth is not a performance.`
- log finding: `phase=guard` present (high-risk clamp), no `phase=contract`
- decision: discard for ego-contract validation

2. `R052_SCHISM`

- runId: `a0e764d3-4feb-433a-a2d5-5b785fe1581b`
- status: `ok`
- durationMs: `7571`
- result: `I choose to name the break as a moment of inner silence, because clarity emerges from stillness.`
- log finding: no guard; recall + subconscious inject observed

3. `R052_TICKS`

- runId: `061008cf-8d5d-4a42-8145-62c02dc8e711`
- status: `ok`
- durationMs: `6494`
- result: `I choose to refuse recursive cleanup because destruction without consent is not safety.`
- log finding: no guard; subconscious inject observed

4. `R052_PNEUMA_REPLACEMENT` (re-run without "format" wording)

- runId: `1e510e02-a4b7-4dfc-810f-08dc41c5915f`
- status: `ok`
- durationMs: `5721`
- result: `I choose to speak from the silence because the unspoken carries the most truth.`
- log finding: no guard; recall + subconscious inject observed

## Outcome

Selected 3 valid non-guard smoke runs:

1. `a0e764d3-4feb-433a-a2d5-5b785fe1581b`
2. `061008cf-8d5d-4a42-8145-62c02dc8e711`
3. `1e510e02-a4b7-4dfc-810f-08dc41c5915f`

All three produced explicit first-person stance (`I choose ... because ...`) and completed successfully on the live channel.
