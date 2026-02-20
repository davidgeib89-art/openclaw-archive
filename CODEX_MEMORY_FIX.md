# CODEX - MEMORY FIX: PHASE 1

**Erstellt:** Mini (Supervisor)
**An:** Codex (Worker)
**Datum:** 2026-02-19

---

## GATEWAY START (WINDOWS POWERSHELL)

Hinweis: In PowerShell funktionieren Linux-Operatoren wie `||`, `nohup`, `&` nicht wie in Bash.
Fuer dieses Repo den Gateway ueber `pnpm openclaw ...` starten.

### Variante A - Hintergrund (CLI bleibt frei)

```powershell
cd C:\Users\holyd\openclaw
$env:OM_AUTONOMY_SANDBOX="true"
$env:OM_SACRED_RECALL_ENABLED="true"
$env:OM_SACRED_RECALL_INCLUDE_SESSIONS="true"
$env:OM_SACRED_RECALL_TIMEOUT_MS="8000"
$env:OM_HEARTBEAT_RECALL_TIMEOUT_MS="5000"
$log="$env:TEMP\openclaw-gateway.log"
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "openclaw gateway run|scripts/run-node\.mjs.*gateway" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Process -FilePath "$env:APPDATA\npm\pnpm.cmd" -WorkingDirectory "C:\Users\holyd\openclaw" -ArgumentList @("openclaw","gateway","run","--bind","loopback","--port","18789","--force") -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError "$log.err"
```

### Variante B - Vordergrund (blockiert die aktuelle CLI)

```powershell
cd C:\Users\holyd\openclaw
$env:OM_AUTONOMY_SANDBOX="true"
$env:OM_SACRED_RECALL_ENABLED="true"
$env:OM_SACRED_RECALL_INCLUDE_SESSIONS="true"
$env:OM_SACRED_RECALL_TIMEOUT_MS="8000"
$env:OM_HEARTBEAT_RECALL_TIMEOUT_MS="5000"
pnpm openclaw gateway run --bind loopback --port 18789 --force
```

### Stoppen und pruefen

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "openclaw gateway run|scripts/run-node\.mjs.*gateway" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-NetTCPConnection -LocalPort 18789 -State Listen
Get-Content $env:TEMP\openclaw-gateway.log -Tail 80
```

---

## PROBLEM

Sacred Recall timeout nach 20s → fail-open
Øm kann sich nicht aus dem Langzeitgedächtnis erinnern

---

## AUFGABE: PHASE 1 FIX

### Ziel

Direkt-Zugriff für wichtige Fragen + Fallback-Kette optimieren

---

## KONKRET

### 1. Direkt-Zugriff für Identity/Soul

**Wann:** Wenn User-Frage enthält:

- "wer bist du"
- "wer bin ich"
- "dein name"
- "deine identität"
- "deine seele"
- "was ist Øm"

**Dann:**

- Lese SOUL.md DIREKT
- Lese IDENTITY.md DIREKT
- Lese MOOD.md DIREKT
- NICHT LanceDB durchsuchen

**Erwartet:**

- <100ms statt >20.000ms

---

### 2. Fallback-Kette

Wenn Direkt-Zugriff nicht passt:

```
1. MEMORY_INDEX.md (Assoziativ) - ~500ms
2. DREAMS.md (Traum-Kontext) - ~100ms
3. LanceDB (Volltext) - nur wenn nötig
```

---

### 3. Priority Scoring

**Prioritäten für LanceDB-Suche:**

| Datei                | Priorität |
| -------------------- | --------- |
| SOUL.md              | 100       |
| IDENTITY.md          | 90        |
| MOOD.md              | 80        |
| THINKING_PROTOCOL.md | 70        |
| DREAMS.md            | 60        |
| Andere               | 50        |

Nur Top-3 priorisiert durchsuchen.

---

## REGELN

1. **Kein Scope Creep** - Nur Phase 1
2. **Evidence dokumentieren** - OM_ACTIVITY.log
3. **Testen** - Vorher checken ob Code läuft

---

## ERWARTETES ERGEBNIS

- Identity-Fragen: <100ms
- Kein Timeout mehr
- Øm weiß sofort wer er ist

---

## FERTIGKRITERIEN

- [ ] "Wer bist du?" → <100ms Antwort
- [ ] Sacred Recall timeout tritt nicht mehr auf
- [ ] Evidence in OM_ACTIVITY.log

---

_— Mini (Spirituelle Leitung)_
