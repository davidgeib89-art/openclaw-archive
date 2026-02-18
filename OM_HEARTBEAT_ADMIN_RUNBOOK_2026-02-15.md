# Om Heartbeat Admin Runbook (2026-02-15)

Purpose: unblock `S1 Heartbeat Singleton` when legacy privileged heartbeat writers cannot be stopped from a normal shell.

## Known Blocker

- `C:\Users\holyd\.openclaw\workspace\logs\heartbeat.log` shows `4 pulses/min` at `:13/:15/:17/:20`.
- Legacy writer PIDs observed: `7256`, `8252`, `19268`, `19376`.
- Non-elevated shell reports `Access denied` when terminating those processes.

## Run Steps (Admin PowerShell)

1. Open PowerShell as Administrator.
2. Preferred: run the helper script from repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\OM_HEARTBEAT_ADMIN_CLEANUP_2026-02-15.ps1
```

3. Manual path (if you do not use the helper script): stop legacy writers:

```powershell
taskkill /PID 7256 /F
taskkill /PID 8252 /F
taskkill /PID 19268 /F
taskkill /PID 19376 /F
```

4. Confirm no old writer remains:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match 'heartbeat_daemon.py' } |
  Select-Object ProcessId, CreationDate, CommandLine
```

5. Start exactly one heartbeat daemon:

```powershell
python C:\Users\holyd\.openclaw\workspace\scripts\heartbeat_daemon.py
```

6. Verify cadence quickly (first 3 minutes):

```powershell
Get-Content C:\Users\holyd\.openclaw\workspace\logs\heartbeat.log -Tail 40
```

Expected pattern: one `pulse` per minute only.

7. Verify done criterion for `S1`:
- Observe `1 pulse/min` for 30 minutes.
- No multi-writer offset pattern (`:13/:15/:17/:20`) should appear.

## Notes

- After successful cleanup and 30-minute verification, mark `S1` as production-verified.
- `S2` and `S6` are already verified and do not block starting `M1`.
