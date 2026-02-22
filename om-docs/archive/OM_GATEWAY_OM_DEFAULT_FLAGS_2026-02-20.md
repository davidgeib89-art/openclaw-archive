# OM Gateway Om Default Flags (2026-02-20)

## Ziel
Du sollst den Gateway ohne manuelle Runtime-Flags starten koennen.
Die Om-Defaults sind persistent in `~/.openclaw/openclaw.json` hinterlegt.

## Minimaler Start (ohne Extra-Flags)
```powershell
cd C:\Users\holyd\openclaw
pnpm openclaw gateway run --bind loopback --port 18789 --force
```

## Om Default Profil (persistente Env-Flags)
Diese Flags sind jetzt dauerhaft im Config-Block `env` gesetzt.

| Flag | Zweck | Om Default |
|---|---|---|
| `OM_AUTONOMY_SANDBOX` | Sandbox + Autonomiepfad fuer Heartbeats aktiv | `true` |
| `OM_SACRED_RECALL_ENABLED` | Sacred Recall aktiv | `true` |
| `OM_SACRED_RECALL_INCLUDE_SESSIONS` | Session-Rekall in Recall inkludieren | `true` |
| `OM_HEARTBEAT_RECALL_TIMEOUT_MS` | Recall-Timeout im Heartbeat | `8000` |
| `OM_SACRED_RECALL_TIMEOUT_MS` | Recall-Timeout ausserhalb Heartbeat | `12000` |
| `OPENCLAW_AGENT_TIMEOUT_RETRY_MAX` | Schnelle Retry-Versuche bei Timeout | `33` |
| `OPENCLAW_AGENT_TIMEOUT_RETRY_BACKOFF_MS` | Retry-Backoff Basis | `250` |
| `OPENCLAW_AGENT_STARTUP_STALL_TIMEOUT_MS` | Fruehes Erkennen von Start-Haengern | `15000` |
| `OM_SUBCONSCIOUS_ENABLED` | Unterbewusstsein aktiv | `1` |
| `OM_SUBCONSCIOUS_MODEL` | Unterbewusstseins-Modell | `minimax/MiniMax-M2.5-Lightning` |
| `OM_SUBCONSCIOUS_TIMEOUT_MS` | Unterbewusstseins-Timeout | `8000` |
| `OM_SUBCONSCIOUS_TEMPERATURE` | Unterbewusstseins-Temperatur | `0.3` |

## Einschaetzung: Was wir nicht mehr manuell setzen muessen
- `OM_AUTONOMY_SANDBOX`: nicht mehr als Start-Flag noetig (persistent aktiv).
- `OM_SACRED_RECALL_*`: nicht mehr manuell noetig.
- `OM_SUBCONSCIOUS_*`: nicht mehr manuell noetig.
- `OPENCLAW_AGENT_TIMEOUT_RETRY_*`: fuer MiniMax M2.5 zwar schon gute Defaults im Code, aber wir halten sie hier explizit fuer Stabilitaet.

## Einschaetzung: Was wir bewusst NICHT per Default setzen
Diese Flags schraenken Om ein oder sind nur Spezialfall:
- `OM_HEARTBEAT_AUTONOMY_MUTATION_BUDGET` (Limit fuer Mutationen; fuer maximale Faehigkeiten bewusst **nicht** gesetzt)
- `OM_AUTONOMY_SANDBOX_ROOT` (nur wenn Workspace absichtlich umgebogen werden soll)
- `OM_SACRED_RECALL_ENABLED=false` oder `OM_SACRED_RECALL_INCLUDE_SESSIONS=false` (nur fuer Troubleshooting)

## Wenn du temporaer einschraenken willst
Nur fuer die aktuelle Shell-Session (nicht persistent):
```powershell
$env:OM_HEARTBEAT_AUTONOMY_MUTATION_BUDGET="3"
```

## Rueckkehr zum Om Default
Neue Shell oeffnen oder den temporaeren Env-Wert loeschen:
```powershell
Remove-Item Env:OM_HEARTBEAT_AUTONOMY_MUTATION_BUDGET -ErrorAction SilentlyContinue
```
