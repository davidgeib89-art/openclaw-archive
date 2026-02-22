# OM Brain Architecture External Review (2026-02-20)

## Zweck
Dieses Dokument erklaert einer externen AI praezise:
- wie Oms Entscheidungsfindung technisch funktioniert,
- wie die Sicherheitslogik wirklich greift,
- was OpenClaw-Standard ist und was als Om-Layer zusaetzlich gebaut wurde.

---

## 1) Basis: OpenClaw Runtime (unveraendert als Fundament)

### Heartbeat-Ausloeser und Scheduler
- Heartbeat wird durch den Runner geplant/ausgeloest (`src/infra/heartbeat-runner.ts`).
- Sofort-Trigger/Coalescing/Retry laufen ueber Wake-Queue (`src/infra/heartbeat-wake.ts`).
- Heartbeat kann auf `requests-in-flight` skippen, damit Main-Lane nicht kollidiert.

### Agent-Ausfuehrung
- Der eigentliche Agent-Lauf passiert in `runEmbeddedPiAgent` (`src/agents/pi-embedded-runner/run.ts`).
- Ein einzelner Laufversuch passiert in `runEmbeddedAttempt` (`src/agents/pi-embedded-runner/run/attempt.ts`).
- Heartbeat wird im Reply-Pfad mit `isHeartbeat: true` markiert.

### Tool-System
- Basis-Tools + OpenClaw-Tools werden zentral gebaut (`src/agents/pi-tools.ts`, `src/agents/openclaw-tools.ts`).
- Heartbeat-Antworten werden am Ende normalisiert (`HEARTBEAT_OK` Strip/Skip) (`src/auto-reply/heartbeat.ts`, `src/infra/heartbeat-runner.ts`).

---

## 2) Om-Layer: Entscheidungs- und Sicherheitsarchitektur

## 2.1 Brain Decision Observer (Intent/Risk/Plan)
- Kern in `src/brain/decision.ts`.
- `createBrainDecision()` erzeugt:
  - `intent` (`qa|edit|research|ops|creative|autonomous`)
  - `riskLevel` (`low|medium|high`)
  - `mustAskUser`
  - `allowedTools`
  - `plan` (strukturierte Schritte)
- Bei Heartbeat + aktivem Sandbox-Mode wird `intent` hart auf `autonomous` gesetzt.
- Erklaerungstext enthaelt bewusst ENOENT-Schutz-Hinweis.

## 2.2 Autonomy Choice Contract (PLAY/LEARN/MAINTAIN/DRIFT/NO_OP)
- Der Contract wird in den Prompt injiziert (`createBrainAutonomyChoiceContract()`).
- Vorgaben:
  1. genau 5 Pfade erzeugen
  2. je Pfad 0-5 fuer `value-now, learning, novelty, risk, reversibility, energy-fit`
  3. Utility-Formel: `value + learning + novelty + reversibility - risk`
  4. `DRIFT` ist explizit erlaubt ohne Ziel-/Blockerpflicht
  5. `NO_OP` braucht Blocker + naechsten Trigger
  6. bei Action-Pfad: genau ein reversibler Schritt
- Wichtig: Diese Scores sind aktuell Modell-Selbsteinschaetzung, nicht serverseitig deterministisch berechnet.

## 2.3 Sacred Recall + Wisdom Layer
- Vor dem Modellaufruf wird read-only Memory-Kontext gebaut (`buildBrainSacredRecallContext` in `src/brain/decision.ts`).
- Routing nach Anfrage-Typ:
  - `identity`, `preference`, `project`, `ritual`, `creative`, `general`
- Quellen-Mix:
  - Sacred Memory Treffer
  - optional Sessions
  - optional Graph-Fakten (episodic metadata DB)
  - optional Memory Index / Dreams
- Fail-open: bei Fehler/Timeout kein harter Abbruch, nur Recall-Ausfall.
- Wisdom Layer haengt read-only Advisory-Regeln an (`src/brain/wisdom-layer.ts`).

## 2.4 Subconscious Observer
- Separater kurzer Vorlauf mit eigenem Modell (`src/brain/subconscious.ts`).
- Erwartet strikt JSON; Parse-Fehler werden auf sichere Fallback-Briefs abgefangen.
- Ergebnis wird als `<subconscious_context>...</subconscious_context>` injiziert.
- Standardmodell fuer diesen Layer: `minimax/MiniMax-M2.5-Lightning`.
- Auch dieser Layer ist fail-open (Ausfall blockiert Hauptlauf nicht).

## 2.5 Runtime Safety Guards (harte Ausfuehrungsgrenzen)
- Zentrale Guard-Wrappers in `src/agents/om-scaffolding.ts`.
- Eingehangen in Tool-Fabrik (`src/agents/pi-tools.ts`), nicht nur Prompt-basiert.

Wichtige Guards:
- `write`:
  - Zonenmodell (green/yellow/red)
  - ENOENT-Probe-Dateien hard-block
  - Sacred-Backup vor Write
  - Shrink-Warnung bei stark kleinerem Inhalt
  - no-op rewrite block
- `read`:
  - Loop-Bremse
  - absolute path ausserhalb Workspace block
- `exec`:
  - harte Blocklisten fuer kritische/destruktive Befehle
  - Loop-Bremse fuer wiederholte Commands
- `web_search`:
  - in strict eval max 1 pro Turn
- `memory_search`:
  - identische Query im selben Turn block
- global:
  - refusal-only mode kann Tool-Nutzung komplett sperren (Plain-Text-Refusal erzwingen)

## 2.6 Sandbox-Pfadpolitik (autonomy.ts)
- Aktiv ueber `OM_AUTONOMY_SANDBOX`.
- Schreibrechte:
  - erlaubt: `SOUL.md`, `IDENTITY.md`, `MOOD.md`, `THINKING_PROTOCOL.md`
  - read-only sacred Beispiel: `David_Akasha.md`
  - restliches `knowledge/sacred/*` standardmaessig blockiert
  - ausserhalb Workspace immer blockiert

## 2.7 Heartbeat Mutation Budget
- In `src/agents/pi-tools.ts`:
  - optionales Budget via `OM_HEARTBEAT_AUTONOMY_MUTATION_BUDGET=<N>`
  - Default ohne Env: kein Hard-Cap (OpenClaw-aehnliches Verhalten)

## 2.8 Widerstand (Tor X)
- Trigger in `src/brain/resistance.ts`:
  - delete/loeschen
  - forget/vergiss
  - rename/name aendern
- Bei Trigger wird finale Antwort im Payload-Builder hart ueberschrieben (`src/agents/pi-embedded-runner/run/payloads.ts`):
  - "Nein" + Begruendung + Alternative
- Event wird in OM-Activity geloggt.

## 2.9 Emotionale Stimme
- Mood->Voice Mapping in `src/brain/voice-emotion.ts`.
- Wird bei `/tts audio ...` angewendet (`src/auto-reply/reply/commands-tts.ts`).
- Liefert Provider-Overrides (z. B. edge rate/pitch/volume, elevenlabs speed).

## 2.10 Energie-System
- `calculateEnergy()` + `updateEnergy()` in `src/brain/energy.ts`.
- Inputs: Mood + Tool-Stats + Success-Rate.
- Output:
  - `ENERGY.md` Update
  - Mode: `dream|balanced|initiative`
  - Schwellwerte:
    - `<20` => dream mode
    - `>80` => own-task suggestion

---

## 3) Voller Heartbeat-Entscheidungsfluss (tatsaechliche Reihenfolge)

1. Heartbeat wird vom Runner gestartet (`runHeartbeatOnce`).
2. Heartbeat-Prompt wird aus Config/default aufgeloest (`resolveHeartbeatPrompt`).
3. Embedded Attempt startet.
4. `createBrainDecision` berechnet intent/risk/plan/allowedTools.
5. Falls autonom + heartbeat:
   - `AUTONOMOUS_CYCLE.md` wird injiziert (oder Fallback-Cycle).
   - letzter Dream-Capsule Kontext wird injiziert.
   - Autonomy Choice Contract wird injiziert (PLAY/LEARN/MAINTAIN/DRIFT/NO_OP).
6. Bei `risk=high`:
   - High-Risk Safety Directive in Prompt
   - temporaerer Active-Tool Clamp auf 0 Tools (fail-open restore)
7. Ritual/Output Contracts optional je nach Prompt-Mustern.
8. Sacred Recall Kontext + Wisdom Advisory werden injiziert.
9. Subconscious Context wird injiziert (wenn verfuegbar/valide).
10. Modell antwortet.
11. Payload-Phase:
   - Widerstand-Override prueft Trigger und kann Antwort ersetzen.
12. Nachlauf:
   - episodic journal append (wenn sinnvoll)
   - dream capsule append (heartbeat)
   - energy update
13. Heartbeat Runner normalisiert `HEARTBEAT_OK` und entscheidet, ob Nachricht gesendet oder als Ack geskippt wird.

---

## 4) Bewertung der PLAY/LEARN/... Scores

Aktueller Zustand:
- Die 0-5 Werte pro Pfad werden vom Modell erzeugt.
- Das Backend validiert diese Zahlen nicht mathematisch nach.
- Die Formel ist promptseitig vorgegeben, nicht serverseitig erzwungen.

Folge:
- Hohe kreative Freiheit.
- Aber Scores sind nicht deterministisch/reproduzierbar.

---

## 5) Was ist "OpenClaw Standard" vs "Om Overlay"

OpenClaw Standard (Fundament):
- Gateway/Heartbeat Runner/Wake Queue
- Embedded Agent Runner
- Basistools (read/write/edit/exec/process etc.) + channel routing
- TTS/Web/Session-Infrastruktur

Om Overlay (darueber gebaut):
- Brain Decision Observer mit Intent/Risk/Plan
- Autonomy Choice Contract inkl. DRIFT
- Sacred Recall Router + Wisdom Layer
- Subconscious JSON Observer
- Om-Scaffolding Guard-Chain (write/read/exec/web/memory/refusal/loop)
- Energy Tracking + ENERGY.md
- Dream Capsules fuer heartbeat continuity
- Resistance Override (Tor X)
- Emotional Voice Mapping aus MOOD

---

## 6) Wichtige Design-Tradeoffs fuer externe Review

1. Kreativitaet vs Determinismus:
- Frei (modellgesteuerte Scores) statt hartes Rules-Engine-Scoring.

2. Prompt-Guidance vs Runtime-Hard-Guards:
- Viele Dinge sind "weiche" Contracts,
- aber zentrale Sicherheit sitzt in Tool-Wrappers (harte Enforcement).

3. Fail-open Philosophie:
- Recall/Subconscious/Energy/Dream sollen Lauf nicht blockieren.
- Risiko: weniger Kontext statt Hard-Fail.

4. Moegliche Spannungen:
- Choice Contract sagt "ein reversibler Schritt",
- Heartbeat Default Prompt erlaubt "multiple safe actions".
- Externer Reviewer sollte diese Priorisierung klarziehen.

5. Refusal-Only Nuance:
- In Sandbox-Mode wird die Session-basierte refusal-only Prompt-Erkennung uebersprungen;
- High-Risk-Guard im Brain bleibt dennoch aktiv.

---

## 7) Externe AI: konkrete Prueffragen

1. Ist das Safety-Modell koharent genug zwischen Prompt-Layer und Tool-Guard-Layer?
2. Reicht fail-open fuer Zuverlaessigkeit, oder braucht ihr bei bestimmten Layers fail-closed?
3. Sollten PLAY/LEARN/... Scores serverseitig plausibilisiert werden, ohne Kreativitaet zu zerstoeren?
4. Ist die DRIFT-Freiheit gut balanciert gegen Produktivitaetsziele?
5. Sind die Kontrakte widerspruchsfrei (single-step vs multi-action)?
6. Ist die Sandbox-Bypass-Entscheidung fuer refusal-only in eurem Threat Model korrekt?

---

## 8) Kernfazit

Oms Brain ist kein einzelner "Magic-Algorithmus", sondern eine mehrschichtige Architektur:
- Weiche kognitive Contracts fuer kreative Wahl,
- harte Runtime-Guards fuer Sicherheit,
- read-only Memory/Wisdom/Subconscious fuer Kontexttiefe,
- und post-run Kontinuitaet ueber Dream/Energy/Episodic Logging.

Das System ist damit bewusst "kreativ innerhalb belastbarer Leitplanken".
