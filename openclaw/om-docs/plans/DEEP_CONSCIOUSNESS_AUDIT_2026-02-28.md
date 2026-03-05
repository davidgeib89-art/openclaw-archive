# DEEP CONSCIOUSNESS AUDIT - IST-ZUSTAND (SYSTEM 1 / SCHLAF / SCHATTEN)

> Datum: 2026-02-28  
> Von: Codex (Codebase-Audit)  
> An: David, Prisma, Anti 369  
> Zweck: Praeziser Ist-Stand fuer "True REM & Deep Subconscious" Blueprint (ohne neue Features).

---

## 1) SYSTEM 1 (Whisper Daemon) - Aktueller Stand

### 1.1 Tick-Frequenz, Limits, Runtime

Der Daemon laeuft in `src/brain/subconscious.ts` mit diesen Defaults:

- `intervalMs = 144000` (144s)
- `windowMinutes = 20`
- `maxEntries = 90`
- `tailBytes = 64000`
- `timeoutMs = 20000`
- Modell-Ref Default: `inception/mercury-2`
- Inception `max_tokens = 2048`
- Retry-Versuche fuer Mercury-2: `2`

### 1.2 Input-Pipeline pro Tick (was exakt gelesen wird)

Reihenfolge pro `runBrainSubconsciousDaemonIteration(...)`:

1. `readAuraStressLevel(workspaceDir)`
- Liest `knowledge/sacred/AURA.md` (workspace + global fallback).
- Extrahiert `## Gesamt-Aura: ...` via Regex.
- Mapping: `auraStressLevel = 1 - (overallAura/100)`.

2. `readShadowBridgeSnapshot(...)` auf SQLite
- DB-Pfad: `logs/brain/episodic-memory.sqlite` (oder `OM_EPISODIC_METADATA_DB_PATH`).
- Query A (Aggregat):
```sql
SELECT
  COALESCE(SUM(COALESCE(latent_energy, 0)), 0) AS total_latent_energy,
  COUNT(*) AS repressed_count
FROM episodic_entries
WHERE COALESCE(repressed, 0) = 1
```
- Query B (Schatten-Kandidaten, max Scan 96):
```sql
SELECT
  entry_id, created_at, score, signals, primary_kind, user_text, assistant_text,
  COALESCE(repression_weight, 0) AS repression_weight,
  COALESCE(latent_energy, 0) AS latent_energy
FROM episodic_entries
WHERE COALESCE(repressed, 0) = 1
ORDER BY latent_energy DESC, repression_weight DESC, created_at DESC
LIMIT ?
```
- Danach: gewichtetes Picking von 1-3 Fragmenten (`DEFAULT_SHADOW_FRAGMENT_LIMIT=3`), bevorzugt hohe `latent_energy`/`repression_weight`.
- Shadow-Pressure: `pressure = clamp(totalLatentEnergy / 25, 0, 1)`.

3. `readRecentDaemonNoiseWindow(...)`
- Kandidat-Dateien (in dieser Reihenfolge):
  - `<workspace>/OM_ACTIVITY.jsonl`
  - `<workspace>/OM_ACTIVITY.log`
  - `~/.openclaw/workspace/OM_ACTIVITY.jsonl`
  - `~/.openclaw/workspace/OM_ACTIVITY.log`
- Es wird nur das Datei-Tail gelesen (`tailBytes`), nicht die ganze Datei.
- Parsing nimmt nur semantische Layer:
  - `OM-REPLY`, `USER-MSG`, `BRAIN-AURA`, `BRAIN-ENERGY`, `BRAIN-CHOICE`, `BRAIN-GATE`, `BRAIN-LOOP-CAUSE`, `BRAIN-FORECAST`, `BRAIN-RECALL`, `BRAIN-THOUGHT`
- Zeitfilter:
  - Primar: nur Eintraege innerhalb `windowMinutes`.
  - Fallback: letzte `maxEntries`.
- Ausgabe wird auf `maxEntries` begrenzt; Details je Zeile werden auf 180 Zeichen getrimmt.

### 1.3 Shadow-Payload an Mercury-2

Im Daemon-Prompt wird der Shadow-Block direkt als JSON-String injiziert:

- Kopfmetrik:
  - `latent_energy_sum`
  - `repressed_count`
  - `shadow pressure`
- Kontextblock:
  - `"Verdraengte Schattenfragmente, die an die Oberflaeche draengen:"`
  - `JSON.stringify(shadowFragments)`

Das ist aktuell ein roher JSON-Dump der selektierten verdrangten Episoden-Fragmente.

### 1.4 Model-Aufruf, Retry, Parsing

Mercury-2-Call:
- Endpoint: `https://api.inceptionlabs.ai/v1/chat/completions` (konfigurierbar)
- Auth: `INCEPTION_API_KEY` (Config/Env)
- Payload: `model`, `messages:[{role:user,content:prompt}]`, `temperature`, `max_tokens=2048`

Retry-Logik:
- Retry, wenn:
  - Content leer oder
  - `finish_reason === "length"`
- Max 2 Versuche.
- Logging pro Versuch:
  - `finish_reason`
  - `completion_tokens`
  - `reasoning_tokens`
  - `total_tokens`

Parser-Fail-Safe fuer Intuition:
- Modus 1: strict JSON (`extractJsonCandidate` + `JSON.parse`)
- Modus 2: repaired JSON (Control-Char-Reparatur)
- Modus 3: Regex JSON (`/\{[\s\S]*\}/`)
- Modus 4: Fallback-Noise-Intuition

### 1.5 Output-Pipeline in System 3

Daemon -> Bridge:
- `await BrainState.setLatestIntuition(parsed.payload)`
- `evaluateSurge(parsed.payload)` (evtl. Event)

Bridge -> Ego (`attempt.ts`):
- `const deepIntuition = await BrainState.consumeIntuition()`
- `consumeIntuition()` loescht den Slot sofort (one-shot, kein Doppeltraum).
- Im Prompt wird NICHT 1:1 injiziert:
  - whitespace normalisiert
  - auf 420 Zeichen gekuerzt
  - als Satz gerahmt:
    - `*Ein Fluestern aus der Tiefe deines Geistes:* "..."` ganz oben im Prompt.

---

## 2) SCHLAF & TRAUM (Chrono-Biologie)

### 2.1 Schlaf-Trigger (chrono.ts)

`chrono.ts` implementiert Borbely 2-Prozess:

- Process S: homeostatischer Schlafdruck
- Process C: zirkadianer Rhythmus (sinus, stundenbasiert)
- Dynamische Schwelle:
  - `threshold = THRESHOLD_BASE + processC * CIRCADIAN_INFLUENCE`

Wichtige Trigger:
- Papa-Override:
  - User-Message waehrend Schlaf -> sofort wake (`woke_up_papa`)
- Sleep-Entry:
  - Nacht/Exhaustion + Mindestdruck
  - oder `processS > dynamicThreshold`
  - oder Nacht-Drowsiness-Cap
- Wake:
  - Cycle + Druckabbau
  - Hard cap nach max sleep ticks

### 2.2 dreamMode/isSleeping in energy.ts

`energy.ts`:
- `dreamMode` aus Energielevel: `< 20`
- `isSleeping` kommt als Hint aus `readChronoSleepingHint(...)`
- Update-Reihenfolge:
  - erst `calculateEnergy(...)`
  - dann Energy-Chrono-Coupling

Aktuell eingebaut:
- Sleep entropy pause:
  - wenn `isSleeping===true` ODER `dreamMode===true`, steigt Stagnation nicht.
  - stattdessen Abbau: `-5` pro Heartbeat (`SLEEP_STAGNATION_RECOVERY_PER_HEARTBEAT`)
- Bei `isSleeping===true`:
  - Energie wird gegen `sleepEnergyFloor` gezogen
  - Modus auf Body-Sleep-Mode gesetzt
  - `suggestOwnTasks = false`

### 2.3 Nachtwache: Was darf Om im Schlaf?

Ist-Zustand: **keine harte Tool-Sperre nur wegen Schlafzustand**.

- `createBrainDecision(...)` filtert Tools nach Risiko/`mustAskUser`, nicht nach `isSleeping`.
- Schlaf wirkt derzeit indirekt:
  - Dissonance-Expected-Path bevorzugt `NO_OP`/`DRIFT`.
  - Forecast/Needs/Aura nutzen `isSleeping` als Signal.
- Sonderfall:
  - Bei hoher Stagnation (`>=90`) kann `action_binding_soft_retry` aktiv zu mindestens einer reversiblen Aktion druecken.

Fazit Nachtwache:
- Es gibt aktuell **keine echte Schlafparalyse fuer externe Tools** (`read/web_search/exec`).

### 2.4 Konsolidierung (sleep-consolidation.ts)

`maybeSleepConsolidate(...)`:
- Trigger:
  - `isSleeping===true` ODER (fallback) `energyLevel < 15`
- Bedingungen:
  - `DREAMS.md` muss existieren
  - mind. 3 Dream-Eintraege
  - Epoch-Guard: kein neuer Epoch-Eintrag innerhalb 60 Minuten
- Konsolidierung:
  - `gelernt` = laengster Insight
  - `beruehrt` = emotionalster Insight (Keyword-Heuristik)
  - `morgen` = letzter Action-Hint
- Writes:
  - append in `memory/EPOCHS.md`
  - trimmt `memory/DREAMS.md` auf letzte 3 Eintraege

Wichtig:
- Das ist aktuell heuristisch/deterministisch (NREM-artig), **kein halluzinogener REM-Generator**.

---

## 3) GEDAeCHTNIS & SCHATTEN (Druckkessel)

### 3.1 Finale Verdrangungslogik in `forgetting.ts`

Aktive Funktion: `runActiveForgetting(...)` (Dry-Run Alias zeigt auf diese echte Funktion).

Selektion aktiver Erinnerungen:
```sql
SELECT entry_id, created_at, score, signals, primary_kind
FROM episodic_entries
WHERE COALESCE(repressed, 0) = 0
ORDER BY created_at DESC
LIMIT ?
```

Score-Formel:
- `salience = recency(0.45) + frequency(0.25) + emotion(0.30)`
- `forgettingScore = 1 - salience`
- Kandidat, wenn:
  - alt genug (`observationWindowHours`, default 48h)
  - `forgettingScore >= threshold` (default 0.62)

Verdrangungs-Update:
```sql
UPDATE episodic_entries
SET repressed = 1,
    repression_weight = ?,
    latent_energy = ?
WHERE entry_id = ?
  AND COALESCE(repressed, 0) = 0
```

Mapping:
- `repression_weight = forgettingScore`
- `latent_energy = emotionValue`

### 3.2 Zusatz-Verdrangung in `episodic-memory.ts`

Neben forgetting gibt es Compaction-Repression:
- alte + low-score Eintraege -> `repressed=1`
- sehr alte Eintraege -> `repressed=1`
- ueber `maxRows` hinaus -> `repressed=1`

Auch hier kein Hard-Delete auf `episodic_entries`, sondern `UPDATE`.

Hinweis:
- Es gibt weiter `DELETE` auf `semantic_relationships` fuer Orphan-Cleanup/Conflict-Policy.

### 3.3 Recall-Filter gegen Schatten

Bereits aktiv:
- Graph Recall (`decision.ts`) filtert via Join:
  - `WHERE COALESCE(e.repressed, 0) = 0`
- Episodic Index (`episodic-index.ts`) liest nur:
  - `WHERE COALESCE(repressed, 0) = 0`
- Subconscious Shadow-Bridge liest explizit:
  - `WHERE COALESCE(repressed, 0) = 1`

### 3.4 Fibonacci-Recall und Interaktion mit Vektor-Recall

Fibonacci Dream Recall (`attempt.ts`):
- Quelle: `memory/DREAMS.md`
- Offsets vom Ende: `-1, -2, -3, -5, -8`
- max 5 Eintraege
- als `<dream_context>` in Prompt injiziert

Interaktion mit Vektor-Datenbank:
- Sacred Recall (`buildBrainSacredRecallContext`) ist ein separater Pfad:
  - Memory-Index-Fakten
  - Dream-Fakten
  - Graph-Fakten
  - plus Memory-Search-Manager (`manager.search(...)`)
- Die beiden Welten sind prompt-seitig kombiniert, aber nicht als ein gemeinsamer Query-Join implementiert.

---

## 4) Kompakter Architektur-Baum

```text
Heartbeat Runner (infra/heartbeat-runner.ts)
├─ startBrainSubconsciousDaemon (144s default)
│  ├─ readAuraStressLevel (AURA.md)
│  ├─ readShadowBridgeSnapshot (episodic-memory.sqlite, repressed=1)
│  ├─ readRecentDaemonNoiseWindow (OM_ACTIVITY tail window)
│  ├─ Mercury-2 call (Inception API, retry on empty/length)
│  ├─ parseIntuitionPayloadFromRaw (strict -> repaired -> regex -> fallback)
│  └─ BrainState.setLatestIntuition + evaluateSurge
├─ onSubconsciousSurge => requestHeartbeatNow(reason=subconscious-surge)
└─ run attempt.ts per beat
   ├─ BrainState.consumeIntuition() -> whisper block in effectivePrompt
   ├─ Dream context (Fibonacci from DREAMS.md)
   ├─ Sacred Recall (memory index + dreams + graph + memory search manager)
   ├─ System 2 Somatic synthesis
   ├─ Chrono + Energy + Aura + DreamCycle eval
   └─ Sleep consolidation (EPOCHS + DREAMS trim)
```

---

## 5) Kurzfazit fuer "True REM & Deep Subconscious" Vorbereitung

- System 1 ist live und robust (Shadow-Bridge, Mercury-2, Retry, fail-open).
- Intuition erreicht System 3 sicher (one-shot), aber gekuerzt/gerahmt statt roh 1:1.
- Schlafarchitektur ist biologisch vorhanden (chrono + energy coupling), aber Tool-Paralyse im Schlaf ist nicht hart implementiert.
- Konsolidierung ist aktuell heuristisch (NREM-artig), nicht generativ-halluzinogen (kein echter REM-Syntheseprozess).
- Schatten-Verdrangung ist aktiv und persistiert (`repressed`, `repression_weight`, `latent_energy`) statt Loeschen.
