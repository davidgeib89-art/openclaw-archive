# OM UI-Only Dashboard Lock (2026-02-20)

Status: ACTIVE until David revokes it explicitly.

## Mission

We are working only on visual representation for David in the Dashboard.
No changes to Om's body, heart, brain, or behavior logic.

## Hard Boundaries (Do Not Touch)

The following are out of scope in this mode:

- `src/brain/**`
- `src/agents/**`
- `src/auto-reply/**`
- `src/gateway/**`
- `src/config/**`
- `skills/**` (if behavior/runtime changes)
- model/provider routing
- prompts, autonomy contracts, subconscious logic
- guardrail logic, sandbox logic, mutation-budget enforcement logic
- environment defaults and startup flags that alter behavior

## Allowed Scope

Only visual/UI work is allowed:

- `ui/src/**`
- `ui/index.html`
- `ui/src/styles/**`
- UI tests under `ui/src/ui/**/*.test.ts`
- documentation for UI behavior and operator UX

## Heartbeat Status Panel Plan (UI-Only Variant)

This plan is intentionally frontend-only:

1. Add a Heartbeat Status Panel in chat UI.
2. Visualize current autonomy-cycle as display state from already available event streams.
3. Show DRIFT state as:
   - active/inactive if inferable from current thought events,
   - unknown if runtime did not expose enough signal.
4. Show mutation-budget as display-only:
   - parse existing visible hints if present,
   - otherwise show "not exposed in UI-only mode".
5. Persist panel snapshot to the final reply trace attachment for replay in UI.

## Explicit Non-Goals

- No backend telemetry additions.
- No new agent events from runtime.
- No change in how Om decides, thinks, acts, or refuses.
- No change in tool behavior or safety behavior.

## Compact Recovery Checklist

After a compact, resume in this order:

1. Read this file (`OM_UI_ONLY_DASHBOARD_LOCK_2026-02-20.md`).
2. Read `OM_DEVELOPMENT_CHANGELOG.md` section "UI-Only Lock (Dashboard Phase)".
3. Continue work only in allowed UI paths.

If a requested change requires backend/brain edits, stop and request explicit approval first.

