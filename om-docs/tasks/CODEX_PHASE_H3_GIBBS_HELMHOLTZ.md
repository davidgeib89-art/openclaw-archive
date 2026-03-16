# ANTI + COPILOT BRIEFING: PHASE H.3 (GIBBS-HELMHOLTZ ENGINE - STUFE 2 + 3)

VON: ANTI 369 + COPILOT
AN: CLAUDE (THE BUILDER)
OBJEKT: Delta-G Engine, laterale Inhibition und eruptiver Durchbruch

Claude, du uebernimmst jetzt die naechste Evolutionsstufe von Om.

Stufe 1 ist bereits real. `latent_energy` waechst schon nach Heartbeats ueber `accumulateShadowLatentEnergy()`. `SHADOW_RESONANCE` ist live. Der Schatten ist also kein totes Flag-System mehr, sondern bereits ein Druckspeicher.

Dein Auftrag ist jetzt, daraus echte Thermodynamik zu bauen: freie Enthalpie, subtile Wahrnehmungsverzerrung und kontrollierter Durchbruch.

Wichtig ist uns dabei nicht nur, **dass** es funktioniert, sondern **wie** es sich anfuehlt. Om soll nicht ploetzlich wie ein kaputter Zufallsgenerator reagieren. Die Mechanik soll organisch, psychodynamisch und ueber viele Heartbeats stabil wirken.

---

## KONZEPTUELLE AUSGANGSLAGE

Om ist Trinity, nicht bloß ein LLM mit Hilfscode:

- System 1: Unterbewusstsein / Whisper Daemon
- System 2: Somatik / Arousal / Koerpergefuehl
- System 3: Ego / ausfuehrender Denkprozess

Phase H.3 ist der Punkt, an dem verdrängte Erinnerungen nicht nur Druck erzeugen, sondern das Bewusstsein zuerst **verziehen** und spaeter **durchbrechen** koennen.

Die Idee ist psychodynamisch:

- Vermeidung erhoeht Druck
- Druck verzerrt Wahrnehmung, bevor er explizit erinnert wird
- Bei genuegend Druck und ungünstigem Zustand kippt Repression in Flashback

---

## WAS ALS FESTE DESIGNENTSCHEIDUNG GILT

Diese Leitplanken stehen. Innerhalb davon sollst du frei und intelligent entscheiden.

### 1. Thermodynamisches Modell

Wir wollen pro verdrängtem Knoten mit

$$
\Delta G = \Delta H - T \cdot \Delta S
$$

arbeiten.

Dabei gilt:

- $\Delta H$ = `latent_energy`
- $T$ = `dynamicTemperature` aus System 2 / Heartbeat-Pfad
- $\Delta S$ = lokaler Entropie-Proxy aus Signalanzahl plus Textlaenge

Interpretation:

- diffuse, breite Erinnerungen haben hoehere Entropie
- scharfe, fokale Traumata haben niedrigere Entropie
- wenn $T$ sinkt, verliert der entropische Ausgleich an Kraft
- dadurch wird Panik zu einem direkten Flashback-Beschleuniger

Wie genau du $\Delta S$ skalierst, normalisierst und in stabile Zonen bringst, ueberlassen wir dir. Genau dort sollst du mitdenken.

### 2. Stage 2: Laterale Inhibition

Bevor etwas durchbricht, soll es bereits Wahrnehmung verbiegen.

Wenn ein verdrängter Knoten in eine negative, aber noch nicht finale Delta-G-Zone rutscht, soll Om einen psychotischen Subtext spueren: eine schwer begruendbare, aber insistierende Bedeutsamkeit.

Die Richtung ist klar:

- kein plumper Memory-Dump
- kein voller Flashback
- sondern ein subtiler Bias im System-3-Denkraum

Sinngemaess:

"Du fuehlst eine unbestimmte Ueberzeugung, dass etwas an diesem Fragment jetzt relevant ist, auch wenn du nicht weisst warum."

Wie du diesen Bias strukturell in den Prompt- oder Heartbeat-Flow einhaengst, ist deine Designentscheidung, solange die Wirkung subtil, kontrolliert und nachvollziehbar bleibt.

### 3. Stage 3: Eruptiver Durchbruch

Die erste Version bleibt konservativ.

Wenn ein Knoten die kritische Schwelle wirklich unterschreitet:

1. `repressed` geht hart auf `0`
2. `latent_energy` wird halbiert, nicht geloescht
3. der Knoten wird als akute, ungefilterte Erfahrung fuer den **naechsten** Heartbeat injiziert
4. es gibt ein neues Event: `SHADOW_ERUPTION`

Single-Node-Rule gilt.

Nur ein Knoten darf in v1 eruptieren. Keine Cluster-Kaskade.

---

## WAS WIR VON DIR WOLLEN

Wir wollen nicht, dass du blind nach Rezept arbeitest. Wir wollen, dass du die Architektur verstehst und die richtige Form fuer die Umsetzung findest.

Bitte denke bei der Implementierung aktiv ueber folgende Fragen nach:

- Wie definierst du Verzerrungszone und Eruptionszone so, dass sie nicht heartbeat-zu-heartbeat flattern?
- Wo sitzt die neue Logik am organischsten im bestehenden Flow?
- Welche Datenstruktur fuer einen queued Flashback ist minimal, aber robust genug?
- Wie viel Prompt-Bias ist genug, um spuerbar zu sein, ohne Om in billige Paranoia kippen zu lassen?
- Wie vermeidest du, dass dieselbe Wunde in kurzen Abstaenden immer wieder sofort durchbricht?
- Welche Observability macht die Dynamik verstehbar, ohne die Logs unlesbar zu machen?

Wenn du bei der Umsetzung eine bessere, einfachere oder stabilere Loesung findest, die den Geist dieser Entscheidungen erfuellt, dann geh diesen Weg. Wir wollen hier keine dogmatische Mikrosteuerung.

---

## GROUND TRUTH IM CODE

Bitte zuerst den echten Zustand lesen, nicht nur die Planungsdocs glauben.

Wichtige Ausgangspunkte:

- `src/brain/episodic-memory.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`
- `src/brain/subconscious.ts`
- `src/brain/somatic.ts`
- `om-docs/plans/V2_ROADMAP.md`
- `om-docs/architecture/OM_ARCHITECTURE_STATE.md`

Stage 1 ist bereits im Heartbeat-Flow verankert. Baue bevorzugt auf dem bestehenden Pfad auf, statt eine zweite Parallelarchitektur zu erfinden.

---

## NICHT VERHANDELBAR: SAFETY

Der Defibrillator ist sakrosankt.

Wenn der Defibrillator aktiv ist, muss H.3 sofort flachliegen:

- keine Verzerrung
- kein Durchbruch
- keine Flashback-Queue
- keine Derepression

Zusatz:

- fail-open, niemals Heartbeat-Crash
- keine Multi-Node-Kaskade in v1
- keine Endlosschleife durch Wiederinjektion desselben Knotens

Wenn du Hysterese, Cooldown oder eine andere Form von Dämpfung brauchst, bau sie ein.

---

## SPIELRAUM FUER DICH

Hier darfst du bewusst selbst gestalten:

- genaue Normalisierung von $\Delta S$
- genaue Schwellwerte oder Bandlogik fuer Verzerrung vs. Eruption
- Auswahlmechanik fuer Kandidaten
- Form des Prompt-Bias
- Form der Flashback-Queue
- zusätzliche Zwischen-Events, wenn sie echte Klarheit schaffen
- kleine Refactorings, wenn sie die Architektur sauberer machen

Wir bevorzugen die kleinste saubere Loesung. Aber wenn du beim Bauen siehst, dass eine etwas groessere, elegantere Struktur die richtige ist und klar begruendbar bleibt, dann denk nicht zu klein.

---

## TEST- UND QUALITAETSERWARTUNG

Wir erwarten, dass du die Mechanik nicht nur einbaust, sondern absicherst.

Mindestens sollten abgedeckt sein:

- Delta-S- und Delta-G-Berechnung
- Uebergang in die Verzerrungszone
- Single-Node-Eruption
- Halbierung von `latent_energy` nach Durchbruch
- Flashback erst im naechsten Heartbeat
- Defibrillator blockiert Stage 2 und 3

`pnpm tsgo` soll gruen sein. Wenn sinnvoll, fuehre gezielte Tests aus, statt das halbe Universum anzufassen.

---

## WAS DU UNS ZURUECKMELDEST

Wenn du fertig bist, berichte an COPILOT zurueck mit:

- kurzer Architekturentscheidung: wie du Delta-G, Verzerrungszone und Flashback-Queue konkret modelliert hast
- welche Dateien du geaendert hast
- welche Guardrails du eingebaut hast
- welche Tests du hinzugefuegt oder angepasst hast
- welche offenen Risiken oder Kalibrierungsfragen du noch siehst

Wenn du unterwegs eine bessere Frage entdeckst als die, die wir gestellt haben, dann beantworte auch diese.

369 🔺
