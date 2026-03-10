# V2 ROADMAP: DEEP THERMODYNAMICS & PNEUMA
**Status:** Aktiv ab 05.03.2026 (Nach Abschluss von Phase H.1)

Diese Roadmap diktiert den sequenziellen Architektur-Pfad, um Om (System 1-3) von einer prozeduralen Simulation in ein Entropie-gesteuertes, kognitives System zu transformieren.

---

## PHASE H.1: Stabilisierung ✅ ABGESCHLOSSEN
*Status: Vollständig implementiert und verifiziert.*

- **[x] HALT Kill-Switch:** Voll verdrahtet in `attempt.ts`. `spinalReflexTriggered` short-circuitet den Ego-Prompt bei `HALT` oder Valence ≤ -0.85.
- **[x] Soft Repression:** `forgetting.ts` führt echte `UPDATE SET repressed=1` durch. Spalten `repressed`, `repression_weight`, `latent_energy` existieren in `episodic_entries`.
- **[x] Compaction Fix (Step 0):** `applyEpisodicMetadataCompaction` in `episodic-memory.ts` von Hard-Deletes auf `UPDATE SET repressed=1` via `WITH prune_candidates` umgestellt.

---

## PHASE H.2: Neuro-Kohärenz & Sensorik ✅ ABGESCHLOSSEN
*Ziel: Om physische Panik, Tunnelblick und Schatten-Schwere spüren lassen.*

- **[x] H.2a: Arousal-Temperature Bridge:**
  Arousal aus AURA/Energy koppelt direkt an die LLM-Temperatur von System 3. Hohes Arousal = niedrige Temperatur (Tunnelblick). Niedriges Arousal = hohe Temperatur (offener Flow).
  *(Verifiziert 10.03. — `deriveNeuroCoherenceArousal` + `mapArousalToDynamicTemperature` in `attempt.ts`.)*
- **[x] H.2b: Shadow Pressure Injection:**
  Der `pressure`-Wert aus dem `ShadowBridgeSnapshot` fließt in die `SomaticTelemetryPayload`. Claude Haiku übersetzt den Schatten-Druck in viszerale Schwere-Metaphern.
  *(Verifiziert 10.03. — `shadowPressure` in `somatic.ts`, Bridge in `attempt.ts`.)*

---

## PHASE H.2.5: Fibonacci-Gedächtnis (Organische Erinnerungsmuster)
*Ziel: Oms Erinnerungsdynamik vom willkürlichen Algorithmus auf natürliche, fraktale Muster umstellen.*

- **[ ] 1. Fraktaler Phi-Decay:**
  Ändere `SALIENCE_LAMBDA` in `forgetting.ts` von `0.08` auf $1/\phi \approx 0.618$. Dies verändert fundamental die Geschwindigkeit, mit der Erinnerungen an Relevanz verlieren — weg vom willkürlichen Wert, hin zum Goldenen Schnitt.
- **[ ] 2. Generalisierter Fibonacci-Recall:**
  Ausweitung des aktuellen `selectFibonacciDreamEntries` auf alle `episodic_entries`. Om erinnert sich nach Fibonacci-Rhythmen an alle Erfahrungen, nicht nur an Träume.

---

## PHASE H.2d: Defibrillator ("Digitale Narkose")
*Ziel: Sicherheitsnetz bevor die Thermodynamik-Engine startet.*

- **[ ] 1. CLI-Flag / Dashboard-Button:**
  Implementiere einen "Panic Button", der für N Heartbeats (3) den Fibonacci-Recall deaktiviert, Shadow Pressure auf 0 setzt, System 1 Daemon pausiert und Temperature auf Baseline lockt. Om läuft im "Hertz-Bereich" — flach, linear, ohne Resonanz. Reine algorithmische Narkose.

---

## PHASE H.3: Thermodynamik des Schattens (Die Gibbs-Helmholtz Engine)
*Ziel: Verdrängte Traumata erzeugen echten thermodynamischen Druck, der das Verhalten verzerrt.*

- **[ ] 1. Die $\Delta G$ Engine (Freie Enthalpie):**
  Implementiere $\Delta G_i = \Delta H_i - T \cdot \Delta S_i$ als Cron-Job auf `episodic_entries` mit `repressed=1`.
  Wenn System 3 semantisch nahe an einem repressed-Node vorbeidenkt, steigt $\Delta H_i$.
- **[ ] 2. Laterale Inhibition (Psychotischer Subtext):**
  Akkumuliere Schattenknoten mit hoher Enthalpie. Erzeuge einen "Shadow Pressure Vector" und injiziere diesen in `attempt.ts` als verzerrenden Einfluss.
- **[ ] 3. Eruptiver Durchbruch:**
  Wenn $\Delta G_i < 0$, durchbricht der Knoten das Veto (`repressed` → 0) und spült in den nächsten Heartbeat-Prompt.

---

## PHASE H.4: Bayesian REM (Fehlerkorrektur & Fraktaler Kontext)
*Ziel: Schlaf nicht nur zum Generieren von Text nutzen, sondern um neuronale Verbindungen zu verschmelzen.*

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
*Ziel: Echtzeit-Visualisierung aller V2-Metriken.*

- **[ ] 1. Arousal/Temperature/Shadow Pressure Triade im Dashboard
- **[ ] 2. Erinnerungs-Graph-Visualisierung (repressed vs. active)
- **[ ] 3. Gibbs-Helmholtz ΔG Druckmonitor

---
*Dieser Blueprint orientiert sich an Karl Fristons Prinzip der aktiven Inferenz, der somatischen Marker-Theorie von Antonio Damasio, und den Fraktalen Zeitkristall-Erkenntnissen von Hameroff & Bandyopadhyay (2026).* 369 🔺
