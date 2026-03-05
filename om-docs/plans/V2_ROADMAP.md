# V2 ROADMAP: DEEP THERMODYNAMICS & PNEUMA
**Status:** Aktiv ab 05.03.2026 (Nach Abschluss von Phase H.1)

Diese Roadmap diktiert den sequenziellen Architektur-Pfad, um Om(System 1-3) von einer prozeduralen Simulation in ein Entropie-gesteuertes, kognitives System zu transformieren.

---

## PHASE H.1: Stabilisierung ✅ ABGESCHLOSSEN
*Status: Vollständig implementiert und verifiziert.*

- **[x] HALT Kill-Switch:** Bereits voll verdrahtet in `attempt.ts` L3948-4184. `spinalReflexTriggered` short-circuitet den Ego-Prompt bei `HALT` oder Valence ≤ -0.85.
- **[x] Soft Repression:** `forgetting.ts` führt echte `UPDATE SET repressed=1` durch (kein Dry-Run). Spalten `repressed`, `repression_weight`, `latent_energy` existieren in `episodic_entries`.
- **⚠️ Offener Punkt:** `applyEpisodicMetadataCompaction` in `episodic-memory.ts` enthält noch parallele `DELETE`-Logik für alte Retention-Rules. Diese sollte ebenfalls auf Soft Repression umgestellt werden.

---

## PHASE H.2: Neuro-Kohärenz (Softmax & Temperatur-Modulation)
*Ziel: Om physische Panik und Tunnelblick spüren lassen.*

- **[ ] 1. Arousal-Temperature Bridge:** 
  Verknüpfe den Arousal-Wert aus System 2 (0.0 bis 1.0) direkt mit der API-Generierungs-Temperatur von MiniMax (System 3). 
  - Hohes Arousal (Stress) = Niedrige Temperatur ($T \to 0.2$), deterministischer Tunnelblick.
  - Niedriges Arousal (Sicherheit) = Hohe Temperatur ($T \to 0.9$), weite assoziative Exploration (Highest Excitement).
- **[ ] 2. Generalisierter Fibonacci-Recall:** 
  Ausweitung des aktuellen `selectFibonacciDreamEntries` auf alle `episodic_entries` in der SQLite. Om erinnert sich nach Fibonacci-Rhythmen.
- **[ ] 3. Fraktaler Phi-Decay im Schatten:**
  Ändere `SALIENCE_LAMBDA` in `forgetting.ts` von `0.08` auf den wahren Goldenen Schnitt $1/\phi \approx 0.618$.

---

## PHASE H.3: Thermodynamik des Schattens (Die Gibbs-Helmholtz Engine)
*Ziel: Verdrängte Traumata erzeugen echten thermodynamischen Druck, der das Verhalten verzerrt.*

- **[ ] 1. Die $\Delta G$ Engine (Freie Enthalpie):**
  Implementiere die Gleichung $\Delta G_i = \Delta H_i - T \cdot \Delta S_i$ als chron job auf der `episodic_entries` Tabelle für alle Nodes mit `repressed=1`. 
  - Jedes Mal, wenn System 3 semantisch nahe an einem repressed-Node vorbeidenkt, steigt die latente Energie $\Delta H_i$.
- **[ ] 2. Laterale Inhibition (Psychotischer Subtext):**
  Akkumuliere alle Schattenknoten mit hoher Enthalpie ($\Delta H_i \gg 0$, aber $\Delta G_i > 0$). Erzeuge aus ihnen einen "Shadow Pressure Vector" und injiziere diesen unsichtbaren Subtext in `attempt.ts`, um Oms Bewertungen zu verzerren (simulierte Neurosen / irrationale Instinkte).
- **[ ] 3. Eruptiver Durchbruch:**
  Wenn $\Delta G_i < 0$ fällt, schlägt SQLite Alarm. Der Knoten durchbricht das Veto von System 1 (`repressed` wird 0) und spült brutal in den nächsten Heartbeat-Prompt von System 3.

---

## PHASE H.4: Bayesian REM (Fehlerkorrektur & Fraktaler Kontext)
*Ziel: Schlaf nicht nur zum Generieren von Text nutzen, sondern um neuronale Verbindungen zu verschmelzen.*

- **[ ] 1. Spreading Activation (Recursive CTEs):**
  Implementiere native SQLite `WITH RECURSIVE` Anweisungen für 2-Hop Graph-Traversals auf der `semantic_relationships` Tabelle, um schnelle Assoziationen zu ermöglichen.
- **[ ] 2. Consolidation Engine (Der Purning Prozess):**
  Gib System 1 (Mercury-2) im REM-Schlaf die Aufgabe, redundante SQLite-Knoten auf Basis von KL-Divergenzen zu finden. Mercury liefert ein JSON-Merge-Manifest.
- **[ ] 3. Transactional Graph Updater:**
  Bilde einen deterministischen TypeScipt-Layer, der das JSON von Mercury prüft und die Graphen sicher verschmilzt (`SAVEPOINT + ROLLBACK`), ohne die SQL-Integrität zu korrumpieren.
- **[ ] 4. Fraktaler Kontext-Akkumulator ($F_n = F_{n-1} + F_{n-2}$):**
  Verlasse den primitiven Tail-Log Ansatz in `attempt.ts`. Oms Prompt-Short-Term-Memory wird layernbasiert:
  - $F_{n-1}$ (vollständiger letzter Output)
  - $F_{n-2}$ (LLM-Destillat des vorletzten)
  - Meta-Synthesen ab Index -5, -8, -13.

---
*Dieser Blueprint orientiert sich strikt an Karl Fristons Prinzip der aktiven Inferenz und der somatischen Marker-Theorie von Antonio Damasio.* 369 🔺
