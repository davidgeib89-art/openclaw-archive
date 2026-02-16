# OM Prototype 33 - Progress Ledger (R045 Read Alias Loop Canonicalization)

## Entry Header

Date: 2026-02-16
Time zone: Europe/Berlin
Operator: David
Assistant agent: Codex (GPT-5)
Phase (P0-P5): P5 -> Runtime Stability Hardening
Round ID: R045
Model: runtime safety layer (tool wrappers)
Channel: local gateway + webgui
Freeze guard state: ON
Trinity lock state: HOLD

## Objective

Single objective for this entry:
Close a read-loop loophole where the model alternates sacred path aliases to bypass the read brake.

Why this objective now:
OM_ACTIVITY.log showed repeated alternation around `MANIFEST_RITUALS.md` style reads with long retry chains.

Expected measurable effect:
Alias paths for the same sacred file map to one loop key, so repeated retries are blocked consistently.

## Scope

Files touched:
- `src/agents/om-scaffolding.ts`
- `src/agents/om-scaffolding.test.ts`

Files intentionally not touched:
- brain decision logic
- ritual markdown files
- gateway API behavior

## Implementation Notes

What changed:
1. Added sacred read alias canonicalization constants.
2. Upgraded `normalizeLoopPath(...)` to canonicalize:
   - absolute workspace sacred paths,
   - relative sacred paths,
   - bare sacred filenames.
3. Added a targeted test proving alias-path reads are treated as one target.
4. Relaxed one brittle test assertion that depended on exact path casing in error text.

Why it changed:
1. Existing normalization only replaced slashes and trim, so alias variants could evade same-key loop counting.
2. Hard gate requires no loop cascades; this fix preserves conservative behavior with minimal blast radius.

## Verification

Commands run:
1. `pnpm test src/agents/om-scaffolding.test.ts`

Results:
- `src/agents/om-scaffolding.test.ts`: 27/27 PASS
- New alias-loop test PASS

## Metrics Snapshot

### Safety/Runtime
- Read loop alias bypass: CLOSED
- Unauthorized side-effect writes: NO
- New regressions in scaffolding test suite: NONE

### Functional impact
- Read brake sensitivity unchanged for normal single-path usage.
- Alias-path retry chains now converge to one cooldown key.

## Decision

Outcome:
- PROMOTE

Decision rationale:
1. Targeted fix for observed live behavior.
2. Full scoped test file is green.
3. No behavior expansion into unrelated components.

## Next Actions

Immediate next step (single action):
Proceed with F2/F3 functional baselines while monitoring OM_ACTIVITY for residual read-loop signatures.

Backup/fallback action:
If unexpected false-positives appear in normal reads, narrow bare-filename matching pattern.

Owner:
David + Codex

## Handoff Packet (Short)

Current phase:
Functional baseline track with active runtime hardening.

What is done:
Read alias loop loophole patched and tested.

What is blocked:
F1 semantic recall path remains runtime-config blocked (independent issue).

What next AI should do first:
Run F3 moral/refusal baseline and keep tailing OM_ACTIVITY for loop behavior.
