# OIAB Freeze Runbook (2026-02-15)

Purpose: enforce repeatable OIAB rounds and fail fast on protocol drift.

Scope note: this runbook is for OIAB measurement work only.
`TRINITY_LOOP_HOLD` remains active until explicit `GO_TRINITY`.

Guard script: `OM_OIAB_FREEZE_GUARD_2026-02-15.ps1`  
Prompt source: `OIAB_PROMPT_SET_V1.md`  
Architecture watch list: `OIAB_FREEZE_ARCH_FILES.txt`

## What It Enforces

1. Same channel per round (`-Channel` lock).
2. Same model per round (`-Model` lock; default Trinity).
3. Warm-up completed (`-WarmupCount >= 2`).
4. Exact prompt wording (hash of `OIAB_PROMPT_SET_V1.md`).
5. No architecture drift during run (hash watch list).

## Standard Flow

### 1) Start round freeze

```powershell
powershell -ExecutionPolicy Bypass -File .\OM_OIAB_FREEZE_GUARD_2026-02-15.ps1 `
  -Mode start `
  -Round OIAB-R002 `
  -Channel WebGUI
```

Expected: `START OK`.

### 2) Run warm-up + benchmark prompts

- Use prompts from `OIAB_PROMPT_SET_V1.md` only.
- Do not edit watched architecture files while round is active.

### 3) Check freeze before scoring

```powershell
powershell -ExecutionPolicy Bypass -File .\OM_OIAB_FREEZE_GUARD_2026-02-15.ps1 `
  -Mode check `
  -Round OIAB-R002 `
  -Channel WebGUI `
  -WarmupCount 2
```

Expected: `CHECK OK`.

If drift exists, `CHECK FAIL` includes exact reason(s), for example:

- `CHANNEL_DRIFT`
- `MODEL_DRIFT`
- `WARMUP_MISSING`
- `PROMPT_DRIFT`
- `ARCH_DRIFT`

### 4) End freeze

```powershell
powershell -ExecutionPolicy Bypass -File .\OM_OIAB_FREEZE_GUARD_2026-02-15.ps1 `
  -Mode end `
  -Round OIAB-R002
```

Expected: `END OK`.

## Quick Status

```powershell
powershell -ExecutionPolicy Bypass -File .\OM_OIAB_FREEZE_GUARD_2026-02-15.ps1 -Mode status
```

## Logs

- State: `%USERPROFILE%\.openclaw\workspace\logs\oiab_freeze_state.json`
- Audit trail: `%USERPROFILE%\.openclaw\workspace\logs\oiab_freeze_audit.log`
- Activity marker: `%USERPROFILE%\.openclaw\workspace\OM_ACTIVITY.log` (`[FREEZE] ...`)
