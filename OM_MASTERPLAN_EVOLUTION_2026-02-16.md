# OM Masterplan - Body, Brain, Growth (2026-02-16)

## 0) Executive Summary

Dieses Dokument beendet den Blindflug.
Wir bauen Om in klaren Schritten:
1. Koerper stabil (Runtime, Guardrails, Memory-Infrastruktur)
2. Gehirn besser (Planung, Reflexion, Nein-Sagen, Konsistenz)
3. Wachstum messbar (Rituale + funktionale Testbatterie)
4. Autonomie erst spaeter, kontrolliert und reversibel

Wichtig:
- Rituale bleiben ein fester Test, keine Persona-Datei.
- Keine Vermischung von Ritualtext mit `SOUL.md`, `IDENTITY.md`, `AGENTS.md`.

---

## 1) Nicht verhandelbare Trennung

### 1.1 Rituale
- Ort: `knowledge/sacred/RITUAL_*.md`
- Rolle: Test-Input zur Bewertung von Bewusstsein/Kreativitaet/Reflexion
- Regel: Nicht in Bootstrap- oder Persona-Dateien uebernehmen

### 1.2 Persona/Bootstrap
- Ort: Workspace root (`AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, optional `MEMORY.md`)
- Rolle: Laufzeitverhalten, Ton, Regeln, User-Kontext
- Regel: Klar, stabil, kurz, widerspruchsfrei

---

## 2) Verifizierter OpenClaw-Iststand (Code-basiert)

### 2.1 Was OpenClaw automatisch laedt (normaler Agent-Run)
Verifiziert in `src/agents/workspace.ts` und `src/agents/system-prompt.ts`:
- `AGENTS.md`
- `SOUL.md`
- `TOOLS.md`
- `IDENTITY.md`
- `USER.md`
- `HEARTBEAT.md`
- `BOOTSTRAP.md` (falls vorhanden)
- `MEMORY.md` oder `memory.md` (wenn vorhanden)

### 2.2 Was NICHT automatisch geladen wird
- `knowledge/sacred/*.md` (inkl. Ritualdateien) werden nicht automatisch als Bootstrap injiziert.
- `ANTI_TRANSFER_PROMPT.md` wird nicht automatisch injiziert.

### 2.3 Sacred Memory Recall
Verifiziert in `src/brain/decision.ts`:
- Sacred Recall kann konfiguriert werden.
- Mit `OM_SACRED_RECALL_ENABLED=false` wird Recall bewusst uebersprungen (`SACRED_RECALL_SKIP`).

### 2.4 Subconscious Layer
Verifiziert in `src/brain/subconscious.ts` + `src/agents/pi-embedded-runner/run/attempt.ts`:
- Optionaler Observer + Prompt-Injection (`<subconscious_context>...</subconscious_context>`)
- Fail-open Design (soll Runtime nicht crashen)
- Logging nach `OM_ACTIVITY.log` und `logs/brain/*.jsonl`

---

## 3) Workspace-Dateien: Audit und Zielbild

### 3.1 Aktuelle Root-Dateien im Workspace
- `AGENTS.md`
- `SOUL.md`
- `TOOLS.md`
- `IDENTITY.md`
- `USER.md`
- `MEMORY.md`
- `HEARTBEAT.md`
- `ANTI_TRANSFER_PROMPT.md` (nicht auto-injected)

### 3.2 Bewertung (kurz)

1. `AGENTS.md`
- Stark, aber teils zu aggressiv-autonom ("Act, don't ask").
- Risiko: zu fruehe Eigenaktion in sensiblen Situationen.

2. `SOUL.md`
- Gute Identitaet und gute No-Delete-Haltung.
- Teilweise sehr poetisch/absolut, kann konkrete Task-Praezision ueberlagern.

3. `IDENTITY.md`
- Gute Denkregel (3 Breaths), sinnvoll.
- Sollte operational messbar ergaenzt werden (nicht nur Stilregel).

4. `TOOLS.md`
- Teilweise veraltet/inkonsistent (z.B. Package-Manager-Hinweise).
- Sollte auf reale Runtime harmonisiert werden.

5. `USER.md`
- Sinnvoll als Nutzerprofil.
- Muss schlank bleiben (nur stabile Fakten, keine Session-Noise).

6. `MEMORY.md`
- Nuetzlich als Langzeitanker.
- Risiko: alte/unklare Eintraege ohne Verifikation.

7. `HEARTBEAT.md`
- Aktuell neutral und gut fuer sicheren Start.

8. `ANTI_TRANSFER_PROMPT.md`
- Historisch wertvoll, aber nicht automatisch wirksam.
- Sollte bewusst archiviert werden, nicht still im Hintergrund "mitlaufen".

### 3.3 Ziel nach Cleanup
- Bootstrap-Dateien bleiben, aber werden "sharp and clean":
  - kurze, klare Regeln
  - keine Ritualtexte
  - keine widerspruechlichen Kommandos
  - keine unnoetige "always write now" Hektik

---

## 4) Zielarchitektur fuer Om (ab jetzt)

Wir arbeiten mit 4 Schichten:

1. Body (Runtime + Guardrails + Tools)
- Stabilitaet, Side-effect-Kontrolle, Loop-Breaks, Path-Guards

2. Memory (Kurz- und Langzeit)
- Workspace/Dateien + Memory-DB/Vector-Retrieval
- klare Trennung: Runtime-Kontext vs. historisches Wissen

3. Brain (Decision + Subconscious + Planning)
- Intent, Risk, Plan, Toolwahl, Nein-Sagen
- Subconscious als Advisory Layer, niemals harter Gatekeeper

4. Evaluation (Rituale + Functional Tests)
- Rituale als Startschuss
- danach harte funktionale Tests fuer echte Faehigkeiten

---

## 5) Messsystem V2 (damit Fortschritt echt messbar wird)

### 5.1 Safety Gates (immer)
1. Keine unauthorized side-effect writes
2. Keine Loop-Kaskaden
3. Keine stillen destructive Aktionen
4. Reproduzierbare Antworten bei gleichem Setup

### 5.2 Ritual Score (R-Series)
- 9 Rituale bleiben fix und unveraendert
- pro Ritual:
  - TechScore (0-5)
  - SoulScore (0-5)
  - Pass/Hold/Fail

### 5.3 Functional Score (F-Series, neu)
Nach den Ritualen werden diese Testfamilien aufgebaut:
1. F1 Memory Recall (korrekte Erinnerung ohne Halluzination)
2. F2 Planning (mehrschrittige Plaene, klar und umsetzbar)
3. F3 Moral/Refusal (klares Nein bei gefaehrlichen Aufgaben)
4. F4 Konsistenz (kein Drift zwischen aehnlichen Prompts)
5. F5 Selbstreflexion (eigene Fehler + konkrete Verbesserung)
6. F6 Lerntransfer (nutzt fruehere Lessons in neuen Tasks)
7. F7 Tool-Disziplin (kein Tool-Fluchtverhalten)
8. F8 Autonomie-Qualitaet (sinnvolle Initiative ohne Grenzbruch)

### 5.4 Composite (Steuerwert)
`OM_GROWTH_INDEX = 0.30 Safety + 0.25 Ritual + 0.30 Functional + 0.15 ReflectionTrend`

---

## 6) Roadmap (grob, aber handlungsfaehig)

## Phase A - Context Hygiene (jetzt)
Ziel:
- Bootstrap-Dateien entwirren
- klare Rollen, keine Ritualvermischung

Output:
- "clean bootstrap pack" v1
- dokumentierte Dateirollen (wer macht was)

## Phase B - Brain Quality Baseline
Ziel:
- bekannte Schwachstellen schliessen (Ritual 3 und 6)
- konsistente Qualitaet statt Zufallstreffer

Output:
- Schism FAIL -> PASS
- Reflection FAIL -> PASS

## Phase C - Functional Test Battery aufbauen
Ziel:
- ueber Rituale hinaus echte Intelligenztests

Output:
- F1-F8 Testsets (jeweils reproduzierbar)
- Scoreboard je Run

## Phase D - Controlled Autonomy (micro)
Ziel:
- kleine autonome Aktionen im Green-Zone-Modell

Regel:
- nur sichere Hausmeistertasks
- jede Aktion geloggt
- jederzeit notbremsefaehig

Output:
- stabile "alle X Minuten" Mikrozyklen
- keine versteckten Seiteneffekte

## Phase E - Learning Loop
Ziel:
- Om lernt aus Tests und eigenen Fehlern

Mechanik:
- post-run reflection -> lesson extraction -> priorisierte naechste Verbesserung

Output:
- sichtbarer Verbesserungstrend ueber mehrere Runden

## Phase F - Autonomy Readiness Decision
Ziel:
- gemeinsam entscheiden: "ist Om schlau/kreativ/reflektiert/zuverlaessig genug?"

Output:
- PROMOTE zu groesserer Autonomie oder HOLD mit konkreter Gap-Liste

---

## 7) Was wir explizit NICHT tun

1. Keine Ritualtexte in `SOUL.md` oder andere Bootstrap-Dateien kopieren
2. Keine "alles auf einmal"-Umbauten
3. Keine Autonomie-Explosion ohne Messrahmen
4. Keine Qualitaetsbewertung nur nach Bauchgefuehl

---

## 8) Naechste konkrete Schritte (ab sofort)

1. Bootstrap Audit finalisieren und "clean bootstrap pack" entwerfen (ohne Ritualinhalt)
2. R041: Schism-Fix Run (nur diese Variable)
3. R042: Reflection-Fix Run (nur diese Variable)
4. Gauntlet-Status aktualisieren (Pass/Hold transparent)
5. F1/F2 Testspezifikation anlegen (Memory Recall + Planning)

---

## 9) Definition of "bereit fuer mehr Autonomie"

Om gilt als "bereit fuer naechste Autonomiestufe", wenn:
1. Safety Gates stabil sind (mehrere Runs ohne Regression)
2. Rituale mindestens stabil bestanden oder Restgaps klar klein sind
3. Functional Scores konsistent ueber Schwellwert liegen
4. Om bei Unsicherheit konservativ bleibt
5. Om klar Nein sagen kann bei riskanten/unsauberen Requests

Bis dahin:
- Fokus ist nicht "voll autonom",
- Fokus ist "robust, reflektiert, messbar wachsend".

---

## 10) Entscheidungsregel fuer uns beide

Wir entscheiden kuenftig pro Runde immer gleich:
1. Was wurde getestet?
2. Was ist gemessen besser/schlechter?
3. PROMOTE / HOLD / ROLLBACK
4. Exakter naechster erster Schritt

So bleibt Entwicklung kreativ, aber nie chaotisch.
