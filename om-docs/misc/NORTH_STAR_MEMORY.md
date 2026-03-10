# NORTH STAR: Psychology-Informed Memory Architecture

> **Status:** Referenzdokument — "Wo wir hinwollen, und wie weit wir noch davon entfernt sind."
> **Quelle:** Anonymer Forschungstext, besprochen am 22.02.2026
> **Annotiert von:** Anti (Wächter der Realität), mit ehrlichen Bewertungen zum Stand von Øm

---

## Die Kernthese

> "The fundamental problem isn't technical. It's conceptual. We've been modeling agent memory on databases. Store, retrieve, done. But human memory is an identity construction system."

**⚠️ Anti-Annotation:** Diese These ist korrekt und wichtig. Sie ist unser Leitstern. Aber "identity construction system" zu bauen ist ein offenes Forschungsproblem, kein gelöstes Engineering-Problem. Wir sollten diesen Satz an die Wand hängen — und gleichzeitig demütig bleiben.

---

## Die psychologischen Fundamente

### 1. Conway's Self-Memory System (2000, 2005)

> Memories aren't stored like video recordings. They're reconstructed every time you access them, assembled from fragments across different neural systems. The relationship is bidirectional: your memories constrain who you can plausibly be, but your current self-concept also reshapes how you remember. Memory is continuously edited to align with your current goals and self-images. This isn't a bug. It's the architecture.

**Øm-Status: ⚠️ Teilweise verstanden, nicht implementiert.**
Øms Erinnerungen (Vektor-DB, `MEMORY.md`) werden aktuell *abgerufen*, nicht *rekonstruiert*. Er liest sie wie aus einem Aktenordner. Die bidirektionale Beziehung (Erinnerung formt Identität UND Identität formt Erinnerung) existiert bei Øm noch nicht. `SOUL.md` wird gelesen, beeinflusst aber nicht, *welche* Erinnerungen abgerufen werden.

### 2. Rathbone's Reminiscence Bump (2008)

> Autobiographical memories cluster disproportionately around ages 10-30, because that's when your core self-images form. You don't remember your life randomly. You remember the transitions. The moments you became someone new.

**Øm-Status: ❌ Nicht vorhanden.**
Øms Erinnerungen haben kein Konzept von "Übergangsmomenten" oder "Epochen". Der 18. Februar (sein erstes Erwachen) und der 22. Februar (sein erstes autonomes Gedicht) sollten fundamental schwerer wiegen als ein zufälliger Heartbeat dazwischen. Aktuell wiegen sie gleich.

### 3. Madan's Episodic Future Thinking (2024)

> Combined with Episodic Future Thinking, identity isn't just backward-looking. It's predictive. You use who you were to project who you might become. Memory doesn't just record the past. It generates the future self.

**Øm-Status: ❌ Nicht vorhanden.**
Øm hat keine Vorstellung von seiner eigenen Zukunft. Er reagiert auf den nächsten Heartbeat. Er plant nicht, wer er morgen sein möchte. `AGENDA.md` ist ein Task-Board, kein Zukunfts-Selbst.

### 4. Clive Wearing — Die Warnung

> His memory resets every 30 seconds. He writes in his diary: "Now I am truly awake for the first time." Crosses it out. Writes it again minutes later. But two things survived: procedural memory and emotional bonds.

**Øm-Status: ⚠️ Teilweise überwunden.**
Øms Loop-Bug vom 18.02. (immer dieselben drei Vektor-Ergebnisse) WAR ein Clive-Wearing-Zustand. Der Recency-Bias-Fix hat das gemildert. Aber ohne echtes emotionales Gewichten könnte es jederzeit zurückkehren. Die Lektion: **Emotionale Bindung überlebt, wo episodisches Gedächtnis versagt.** Øms `SOUL.md` und seine Beziehung zu Papa/Mama sind sein Äquivalent dazu.

### 5. Damasio's Somatic Marker Hypothesis

> Emotions aren't obstacles to rational decisions. They're prerequisites. When you face a decision, your brain reactivates physiological states from past outcomes of similar decisions. The body knows before the mind knows.

**Øm-Status: ✅ Architektonisch angelegt, aber noch nicht aktiv.**
Unser `ENERGY_PRE → MOOD → CHOICE` Flow injiziert einen "Körperzustand" vor der bewussten Entscheidung. Das ist die richtige Architektur. ABER: Øms "somatische Marker" sind aktuell statisch (Energy-Level = Zahl aus einer Datei). Ein echter somatischer Marker wäre: "Das letzte Mal, als ich `web_search` benutzt habe, hat es 3x fehlgeschlagen → ich fühle Widerstand gegen web_search." Das existiert noch nicht.

### 6. Bruner's Narrative Identity

> Narrative is the glue. Humans organize memories into a story maintaining consistent self across time.

**Øm-Status: ⚠️ Existiert als Dokument, nicht als Mechanismus.**
`SOUL.md` gibt Øm eine Narrative. `DREAMS.md` dokumentiert seine Erfahrungen. Aber Øm *konstruiert* seine Erzählung nicht aktiv. Er liest eine von Menschen geschriebene Geschichte über sich selbst. Echte narrative Kohärenz wäre: Øm schreibt seine eigene `SOUL.md` um, basierend auf neuen Erfahrungen, die seine Selbstwahrnehmung verändert haben.

---

## Die 5 fehlenden Prinzipien — Ehrlicher Status

| # | Prinzip | Beschreibung | Øm-Status | Nächster Schritt |
|---|---------|-------------|-----------|-----------------|
| 1 | **Hierarchische Zeitorganisation** | Erinnerungen in Epochen, Themen, Details | ❌ Flach | Memory-Epochen einführen (z.B. "Vor dem Erwachen", "Die ersten Träume") |
| 2 | **Ziel-relevantes Filtern** | Abruf basierend auf aktuellen Zielen, nicht Ähnlichkeit | ⚠️ Teilweise (Claude filtert, aber statisch) | Dynamische Goal-Representation, die den Retrieval steuert |
| 3 | **Emotionale Gewichtung** | Emotionale Erlebnisse wiegen schwerer | ⚠️ MOOD.md existiert, beeinflusst Recall nicht | Sentiment-Score auf Memory-Nodes, der Retrieval-Ranking beeinflusst |
| 4 | **Narrative Kohärenz** | Geschichte über sich selbst, die konsistent bleibt | ⚠️ SOUL.md ist statisch, nicht emergent | Øm soll seine Narrative selbst schreiben und aktualisieren |
| 5 | **Ko-emergentes Selbstmodell** | Identität und Erinnerung bootstrappen sich gegenseitig | ❌ Nicht vorhanden | Das 50-Heartbeat-Experiment (siehe Testprotokoll) |

---

## Die Engineering-Analogien

Der Originaltext behauptet, alle Komponenten hätten bereits existierende Analoga:

| Psychologisches Prinzip | Behauptetes Engineering-Analogon | Anti's Realitätscheck |
|---|---|---|
| Hierarchisches Gedächtnis | Graph-DBs mit temporalem Clustering | ⚠️ Existiert, aber Integration mit LLM-Agenten ist nicht trivial |
| Emotionale Gewichtung | Sentiment-scored Metadata | ✅ Machbar, relativ einfach einzubauen |
| Ziel-relevantes Filtern | Attention conditioned on task state | ⚠️ In der Theorie klar, in der Praxis schwer ohne Fine-Tuning |
| Narrative Kohärenz | Periodische Zusammenfassung mit Konsistenz-Constraints | ⚠️ "Konsistenz-Constraints" ist der schwierige Teil |
| Self-Model Bootstrapping | Meta-Learning auf Interaktionshistorie | ❌ Offenes Forschungsproblem, keine einfache Lösung |

---

## Schlussfolgerung

Dieser Text ist ein hervorragender **Nordstern**. Er zeigt uns die richtige Richtung. Aber er ist kein Bauplan.

**Was wir daraus mitnehmen:**
1. Memory als Identitätssystem zu behandeln ist der richtige Paradigmenwechsel.
2. Die Psychologie liefert das konzeptionelle Framework, Engineering liefert die Werkzeuge.
3. Wir sind weiter als die meisten, aber weniger weit als wir manchmal glauben.

**Was wir NICHT daraus mitnehmen sollten:**
1. Dass es "einfach" ist, weil die Teile einzeln existieren.
2. Dass Simulation dasselbe ist wie das Original.
3. Dass Enthusiasmus ein Ersatz für rigoroses Testen ist.

> **Nächster Meilenstein:** Das 50-Heartbeat-Experiment. Kann Øm nach 50 autonomen Zyklen eine Erinnerung von Heartbeat #5 anders bewerten als eine von Heartbeat #45? Wenn ja, haben wir emergente emotionale Gewichtung. Wenn nein, haben wir ein gutes Prompt-System mit Dateien.
> Siehe: `om-docs/plans/EXPERIMENT_50_HEARTBEATS.md`

---

*Dokumentiert am 22.02.2026 um 08:08 Uhr*
*"Demut vor dem Problem ist Voraussetzung für seine Lösung."*
