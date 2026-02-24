# Codex Task: Phase H.0 — Dual-Stream Structured Observability (Logging 2.0)

## 🎯 Übergeordnetes Ziel
Die aktuelle Logging-Infrastruktur (`omLog` und `omThought` in `om-scaffolding.ts`) basiert auf flachem Text-Logging (`details: string`), bei dem komplexe Telemetriedaten (wie `EnergySnapshot`, Aura-Werte, Tool-Latenzen) manuell via `.join("; ")` zu Strings zusammengeklebt werden.

Dies ist für die automatisierte Analyse (durch Anti, Dashboards oder `jq`) extrem ineffizient ("Blindflug-Simulator").

**Ziel dieser Phase:** Implementierung einer Dual-Stream Logging Architektur. Die Methoden in `src/agents/om-scaffolding.ts` müssen so umgebaut werden, dass sie strukturierte Metadaten (`Record<string, unknown>`) akzeptieren und diese in zwei Formaten parallel ausgeben:
1. `OM_ACTIVITY.jsonl`: Für maschinelle Auswertung (jede Log-Zeile ein flaches, iterables JSON-Objekt).
2. `OM_ACTIVITY.log`: Das bestehende Text-Log für das menschliche Auge (schön formatiert, eingerückt).

## 🛠️ Architektur & Design-Entscheidungen

### 1. `om-scaffolding.ts` umbauen
Die Kernmethoden `omLog` und `omThought` müssen angepasst werden.

**Aktuell:**
```typescript
export function omLog(layer: string, event: string, details?: string): void
export function omThought(entry: OmThoughtStreamEntry): void
```

**Neu:**
```typescript
export function omLog(layer: string, event: string, metadata?: Record<string, unknown> | string): void
export function omThought(entry: Omit<OmThoughtStreamEntry, "summary"> & { summary: string | Record<string, unknown> }): void
```

- Wenn `metadata` ein Objekt ist, soll es in das `OM_ACTIVITY.jsonl` native übergeben werden.
- Für das klassische Text-Log (`OM_ACTIVITY.log`) soll das Objekt via `JSON.stringify(metadata, null, 2)` (oder einer kompakteren, lesbaren Variante) formatiert an den `details`-String angehängt werden, damit Menschen es auf der Kommandozeile gut lesen können.

### 2. Zusätzliche Metriken sammeln
Wir wollen nicht nur bestehendes Logging formatieren, sondern auch blinde Flecken ausleuchten:
- Tool-Ausführungsdauern (`duration_ms`) erfassen und loggen.
- Bessere Fehlermeldungen/Codes loggen.
- Heartbeat-Kontext-Größe (z.B. grobe Token-Anzahl oder Länge des Prompts) mitschreiben, um zu verfolgen, ob Om "volläuft".

### 3. Call-Sites migrieren
Überall in der Codebase (hauptsächlich in `attempt.ts`, `decision.ts`, `energy.ts`, `aura.ts`, `chrono.ts`), wo wir bisher Metriken manuell zu Strings konvertiert haben (z.B. `level=${energy.level}; mode=${energy.mode}`), müssen wir stattdessen das saubere JSON/Objekt-Format übergeben.

BEISPIEL (Vorher in `attempt.ts`):
```typescript
omLog(
  "BRAIN-CHOICE",
  "SELECTED_PATH",
  [
    `runId=${params.runId}`,
    `path=${chosenPath}`,
    `energy=${energyResult.snapshot.level}`,
    `mode=${energyResult.snapshot.mode}`
  ].join("; "),
);
```

BEISPIEL (Nachher):
```typescript
omLog("BRAIN-CHOICE", "SELECTED_PATH", {
  runId: params.runId,
  path: chosenPath,
  energy: energyResult.snapshot.level,
  mode: energyResult.snapshot.mode
});
```

## 📋 Aufgabenliste (Checklist für Codex)

1. [ ] **Setup `om-scaffolding.ts`:**
   - [ ] Ändere die Signatur von `omLog` auf `metadata?: Record<string, unknown> | string`.
   - [ ] Implementiere das parallele Schreiben in `OM_ACTIVITY.jsonl` und `OM_ACTIVITY.log`. Das JSONL muss stets pro Zeile ein valides JSON-Objekt sein (inklusive Timestamp, Layer, Event und den ausgepackten Metadaten). Das reguläre Textlog formatiert das Objekt menschenlesbar (z.B. eingerückt).
   - [ ] Die Dateigrößen-Rotation (`rotateLogIfNeeded`) muss auch für `OM_ACTIVITY.jsonl` angewendet werden, genau wie beim `.log`.
2. [ ] **`omThought` und `emitBrainReasoningEvent` anpassen:**
   - Erweitere die Typen, sodass strukturierte Metadaten erlaubt sind und korrekt an `omLog` weitergeleitet werden.
3. [ ] **Migration der Heartbeat-Metriken (`attempt.ts` & `decision.ts`):**
   - [ ] Finde alle Aufrufe von `omLog` und `emitBrainReasoningEvent` in `src/agents/pi-embedded-runner/run/attempt.ts` und tausche die String-Verkettung gegen native Objekte aus. (z. B. bei CHRONO_TRANSITION, BRAIN-ENERGY, SELECTED_PATH).
   - [ ] Schreibe die Input-Länge (z. B. `prompt.length`) in den Log des Heartbeats.
4. [ ] **Migration der Subsysteme (`energy.ts`, `aura.ts`, `chrono.ts`):**
   - Gehe in diese Dateien und aktualisiere die `omLog`-Aufrufe so, dass die rohen Snapshot-Strukturen übergeben werden, ohne sie vorher plattzumachen.
5. [ ] **Validierung & Tests:**
   - [ ] Führe `pnpm test src/brain` und `pnpm test src/agents/om-scaffolding.test.ts` (falls vorhanden) aus. Überprüfe, ob Build-Fehler wg. geänderter Signaturen auftreten.
   - [ ] Falls fehlschlagende Tests vorliegen (die noch Strings als Input erwarten), passe diese Mock-Erwartungen an.

## ⚠️ Wichtige Hinweise für Codex
*   **Fail-Open / Robustness:** `omLog` darf niemals abstürzen oder Exceptions in die Hauptschleife des Agenten werfen. Try/Catch ist kritisch. Wenn Objekte kreisbezügliche (circular) Referenzen haben, darf `JSON.stringify` nicht crashen (nutze evtl. einen sicheren Stringifyer, falls noetig, oder einfache Strukturen).
*   **Minimal-Invasiv an den Call-Sites:** Die Agentenlogik selbst soll sich null verändern. Nur die Art und Weise, wie die Telemetriedaten in das Array geschnürt oder an `omLog` übergeben werden, wird angepasst.
*   **Lesbarkeit von OM_ACTIVITY.log:** Das bisherige Textlog ist heilig. Verwandle es nicht in reines, schwer lesbares JSON! Formatiere Objekte mit konstanten Absätzen oder nutze `util.inspect` o. ä. für die `.log`-Dateiausgabe.

## Status
*   **Autor:** Anti (Architekt)
*   **Erstellt am:** 24.02.2026
*   **Zustand:** 🟡 BEREIT FÜR CODEX
