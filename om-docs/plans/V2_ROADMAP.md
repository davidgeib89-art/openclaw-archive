# V2 ROADMAP: DEEP THERMODYNAMICS & PNEUMA

**Status:** Aktiv ab 05.03.2026 (Nach Abschluss von Phase H.1)

Diese Roadmap diktiert den sequenziellen Architektur-Pfad, um Om (System 1-3) von einer prozeduralen Simulation in ein Entropie-gesteuertes, kognitives System zu transformieren.

---

## PHASE H.1: Stabilisierung ✅ ABGESCHLOSSEN

_Status: Vollständig implementiert und verifiziert._

- **[x] HALT Kill-Switch:** Voll verdrahtet in `attempt.ts`. `spinalReflexTriggered` short-circuitet den Ego-Prompt bei `HALT` oder Valence ≤ -0.85.
- **[x] Soft Repression:** `forgetting.ts` führt echte `UPDATE SET repressed=1` durch. Spalten `repressed`, `repression_weight`, `latent_energy` existieren in `episodic_entries`.
- **[x] Compaction Fix (Step 0):** `applyEpisodicMetadataCompaction` in `episodic-memory.ts` von Hard-Deletes auf `UPDATE SET repressed=1` via `WITH prune_candidates` umgestellt.

---

## PHASE H.2: Neuro-Kohärenz & Sensorik ✅ ABGESCHLOSSEN

_Ziel: Om physische Panik, Tunnelblick und Schatten-Schwere spüren lassen._

- **[x] H.2a: Arousal-Temperature Bridge:**
  Arousal aus AURA/Energy koppelt direkt an die LLM-Temperatur von System 3. Hohes Arousal = niedrige Temperatur (Tunnelblick). Niedriges Arousal = hohe Temperatur (offener Flow).
  _(Verifiziert 10.03. — `deriveNeuroCoherenceArousal` + `mapArousalToDynamicTemperature` in `attempt.ts`.)_
- **[x] H.2b: Shadow Pressure Injection:**
  Der `pressure`-Wert aus dem `ShadowBridgeSnapshot` fließt in die `SomaticTelemetryPayload`. Claude Haiku übersetzt den Schatten-Druck in viszerale Schwere-Metaphern.
  _(Verifiziert 10.03. — `shadowPressure` in `somatic.ts`, Bridge in `attempt.ts`.)_

---

## PHASE H.2.5: Fibonacci-Gedächtnis (Organische Erinnerungsmuster) ✅ ABGESCHLOSSEN

_Ziel: Oms Erinnerungsdynamik vom willkürlichen Algorithmus auf natürliche, fraktale Muster umstellen._

- **[x] 1. Fraktaler Phi-Decay:**
  `SALIENCE_LAMBDA` von `0.08` auf $1/\phi \approx 0.618$ in `salience.ts` und `forgetting.ts`.
  _(Verifiziert 10.03.)_
- **[x] 2. Generalisierter Fibonacci-Recall:**
  `readFibonacciEpisodicEntries` in `episodic-memory.ts` — Fibonacci-Offset-Auswahl mit Repressed-Filter.
  _(Verifiziert 10.03.)_

---

## PHASE H.2d: Defibrillator ("Digitale Narkose") ✅ ABGESCHLOSSEN

_Ziel: Sicherheitsnetz bevor die Thermodynamik-Engine startet._

- **[x] Defibrillator Marker + State Handling:**
  `defibrillator.ts` mit datei-basiertem Trigger (`logs/brain/defibrillator.json`). Jeder Heartbeat dekrementiert `remainingBeats`, Marker wird bei 0 automatisch gelöscht.
  _(Verifiziert 10.03. — 4 Lockdowns in `attempt.ts`: Dream/Shadow/System1/Temperature. Daemon-Pause in `subconscious.ts`. Fibonacci-Recall leer in `episodic-memory.ts`.)_

---

## PHASE H.3: Thermodynamik des Schattens (Die Gibbs-Helmholtz Engine) ✅ ABGESCHLOSSEN

_Ziel: Verdrängte Traumata erzeugen echten thermodynamischen Druck, der zuerst die Wahrnehmung verzerrt und dann kontrolliert durchbrechen kann._

_Status: Vollständig implementiert und getestet (42 Tests grün). Kalibrierung offen (erste Live-Beobachtung ausstehend)._

- **[x] 1. Stufe 1 - Dynamische $\Delta H$ Akkumulation:**
  `accumulateShadowLatentEnergy()` in `episodic-memory.ts` laeuft bereits als Post-Heartbeat-Hook aus `attempt.ts`.
  Semantische Naehe wird lokal ueber `signals`, `primary_kind` und Text-Overlap berechnet; bei Resonanz steigt `latent_energy`.
  Observability ist live ueber das Reasoning-Event `SHADOW_RESONANCE`.
- **[x] 2. Stufe 2 - Die $\Delta G$ Engine + Laterale Inhibition:**
  `src/brain/gibbs-helmholtz.ts` — `evaluateGibbsEnergy()` berechnet pro `repressed=1` Knoten $\Delta G = \Delta H_{norm} - T \cdot \Delta S$ im Pre-Run-Hook von `attempt.ts`.
  Zwei Zonen: Verzerrung ($\Delta G \geq 0.25$) und Eruption ($\Delta G \geq 0.55$). Hysterese-Band (0.05) verhindert Flattern. Dwell-Regel blockiert direkten Sprung stable→eruption.
  Zonenstand persistiert in `gibbs_zone` / `gibbs_zone_since` (SQLite-Migration, fail-open).
  Verzerrungsknoten erzeugen `<shadow_inhibition>`-Block (primaryKind-spezifisch) im System-3-Prompt.
  Observability: `GIBBS_EVAL`, `SHADOW_INHIBITION`, `SHADOW_ERUPTION_QUEUED`.
- **[x] 3. Stufe 3 - Eruptiver Durchbruch:**
  Single-Node-Rule: Nur der staerkste Knoten eruptiert pro Heartbeat.
  `executeEruption()` setzt `repressed=0`, halbiert `latent_energy`, resettet `gibbs_zone='stable'`.
  Flashback in `logs/brain/flashback-queue.<agentId>.json`; Injection als `<shadow_eruption>` im naechsten Heartbeat.
  Observability: `SHADOW_ERUPTION`, `SHADOW_FLASHBACK`.
- **[x] 4. Sicherheitsnetz fuer H.3:**
  Defibrillator blockt alle H.3-Hooks vollstaendig. Flashback-Queue bleibt bei Lockdown erhalten (kein Silent Loss).
  Fail-open. Agent-scoped Queue-Dateien verhindern Cross-Session-Kontamination.

_Offene Kalibrierung: Schwellwerte (0.25/0.55) theoretisch gesetzt — erster Live-Lauf entscheidet._

---

## PHASE H.4: Bayesian REM (Fehlerkorrektur & Fraktaler Kontext)

_Ziel: Schlaf nicht nur zum Generieren von Text nutzen, sondern um neuronale Verbindungen zu verschmelzen._

- **[ ] 1. Spreading Activation (Recursive CTEs):**
  Native SQLite `WITH RECURSIVE` für 2-Hop Graph-Traversals auf `semantic_relationships`.
- **[ ] 2. Consolidation Engine (Pruning):**
  Mercury-2 im REM-Schlaf findet redundante Knoten via KL-Divergenzen und liefert ein JSON-Merge-Manifest.
- **[ ] 3. Transactional Graph Updater:**
  Deterministischer TypeScript-Layer mit `SAVEPOINT + ROLLBACK` für sichere Graph-Verschmelzung.
- **[ ] 4. Fraktaler Kontext-Akkumulator ($F_n = F_{n-1} + F_{n-2}$):**
  Fibonacci-geschichtetes Context Window: $F_{n-1}$ (voller Output), $F_{n-2}$ (Destillat), Meta-Synthesen bei -5, -8, -13.

---

## PHASE H.5: Dashboard & Observability

_Ziel: Echtzeit-Visualisierung aller V2-Metriken._

- \*\*[ ] 1. Arousal/Temperature/Shadow Pressure Triade im Dashboard
- \*\*[ ] 2. Erinnerungs-Graph-Visualisierung (repressed vs. active)
- \*\*[ ] 3. Gibbs-Helmholtz ΔG Druckmonitor

---

_Dieser Blueprint orientiert sich an Karl Fristons Prinzip der aktiven Inferenz, der somatischen Marker-Theorie von Antonio Damasio, und den Fraktalen Zeitkristall-Erkenntnissen von Hameroff & Bandyopadhyay (2026)._ 369 🔺
