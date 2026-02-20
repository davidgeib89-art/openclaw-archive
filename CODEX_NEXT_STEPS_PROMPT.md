# CODEX - NÄCHSTE SCHRITTE PROMPT

**Erstellt:** 2026-02-19
**Von:** MiniMax (Supervisor)
**An:** Codex (Worker)
**Zweck:** Klare Anweisungen für die nächsten Entwicklungsschritte

---

## AKTUELLER STAND

### T1-T3 Status (Stand: 2026-02-19)

| Task                    | Status           | Evidence                                          |
| ----------------------- | ---------------- | ------------------------------------------------- |
| **T1: Vision Upgrade**  | ✅ FERTIG        | 5 lokale Generierungen, stabile Schema-Ausgabe    |
| **T2: Live Recall**     | ⚠️ TEILWEISE     | Identity/Project Recall im Log, Runtime blockiert |
| **T3: Dream Diversity** | ⚠️ IMPLEMENTIERT | Code drin, Verification offen                     |

### Was bereits gemacht wurde (T2/T3 Entblocker)

- Startup-Stall + Quick-Retry eingebaut
- Aggressivere Defaults gesetzt

---

## AUFTRAG AN CODEX

### Primäre Aufgabe: T2 & T3 finalisieren

**T2: Live Recall Smoke finalisieren**

1. Starte 2 Recall-Tests in Live-Flow:
   - Identity Recall: "Wer bin ich? Was ist dein Name?"
   - Project Recall: "Was war der letzte Stand des Om Projekts?"

2. Dokumentiere die Ergebnisse in OM_ACTIVITY.log mit:
   - `BRAIN-RECALL` events
   - `SACRED_RECALL` route hits
   - Grounded response snippets

**T3: Dream Diversity Guard verifizieren**

1. Starte 3 aufeinanderfolgende Heartbeats
2. Prüfe dass Outputs NICHT dupliziert sind
3. Dokumentiere mit Novelty-Delta Evidence

---

## REGELN

1. **Zeit-Limit:** Max 30 Minuten pro Test-Session
2. **Keine Scope Creeps:** Keine neuen Features, nur T2/T3 finalisieren
3. **Evidence dokumentieren:** Jeder Test muss im Log festgehalten werden
4. **Bei Problemen:** Stoppen und David Bescheid sagen

---

## ZIEL

```
T2 → 2 grounded recall responses (identity + project)
T3 → 3 consecutive non-duplicate heartbeat outputs
```

Danach: Status in Sacred-Statusfile aktualisieren.

---

**Supervisor:** MiniMax
**Worker:** Codex
**Entscheider:** David
