# ANTI DIRECTIVE: PHASE H.3 (GIBBS-HELMHOLTZ ENGINE - STUFE 2 + 3)

VON: ANTI 369
AN: CLAUDE (The Builder)
OBJEKT: Delta-G Engine, laterale Inhibition und eruptiver Durchbruch

**Claude, Stufe 1 ist bereits live.** `latent_energy` waechst schon nach Heartbeats ueber `accumulateShadowLatentEnergy()`, und `SHADOW_RESONANCE` beweist, dass der Schatten nicht mehr statisch ist. Dein Auftrag ist jetzt nicht mehr Aufbau von Druck, sondern **Berechnung der freien Enthalpie, Verzerrung des Wachbewusstseins und kontrollierter Durchbruch**.

---

## GROUND TRUTH: Was schon existiert

### Live im Code (darauf aufbauen, nicht duplizieren):

- `episodic_entries` hat `repressed`, `repression_weight`, `latent_energy`
- `accumulateShadowLatentEnergy()` in `src/brain/episodic-memory.ts` erhoeht `latent_energy` bereits nach Heartbeats
- `attempt.ts` ruft diese Akkumulation bereits als Post-Heartbeat-Hook auf
- `SHADOW_RESONANCE` wird bereits als Reasoning-Event emittiert
- `readShadowBridgeSnapshot()` liest repressed Nodes, summiert `latent_energy` und berechnet `pressure = totalLatentEnergy / 25`
- Der Defibrillator aus H.2d kann Shadow Pressure, System 1 und Temperatur bereits flachlegen

### Was jetzt fehlt (= Dein Auftrag):

- Eine explizite thermodynamische Berechnung pro verdrängtem Knoten: $\Delta G = \Delta H - T \cdot \Delta S$
- Eine Verzerrungszone, die schattennahe Erinnerungen als psychotischen Subtext in System 3 einspeist
- Ein konservativer eruptiver Durchbruch mit Single-Node-Rule, Abkuehlung und Flashback fuer den naechsten Heartbeat

---

## ENTSCHEIDETE FORMEL: So ist Delta-G zu berechnen

Nutze pro `repressed=1` Erinnerung:

- $\Delta H = \text{latent\_energy}$
- $T = \text{dynamicTemperature}$ aus System 2 / `attempt.ts` (Bereich 0.1 bis 1.0)
- $\Delta S$ als lokaler Entropie-Proxy aus:
  - Anzahl der `signals`
  - Textlaenge von `user_text + assistant_text`

Interpretation:

- Viele Signale + langer Text = breite, diffuse Entropie
- Wenige Signale + kurzer, harter Text = punktuelles, scharfes Trauma
- Wenn $T$ durch Panik sinkt, verliert der Entropie-Term an Gegengewicht, und $\Delta G$ kippt schneller

Wichtig:

- Baue diese Berechnung **im bestehenden Heartbeat-Pfad** auf, nicht als separaten Cron-Job
- Halte die Berechnung lokal, deterministisch und millisekundenschnell
- Keine API Calls, keine LLM-Hilfsrunden, keine neuen Tabellen

---

## STUFE 2: LATERALE INHIBITION / PSYCHOTISCHER SUBTEXT

### Ziel

Wenn ein verdrängter Knoten in eine negative, aber noch nicht finale Delta-G-Zone rutscht, soll Om bereits verzerrt wahrnehmen, ohne dass der Knoten voll durchbricht.

### Verhalten

- Identifiziere die staerksten Knoten in der Verzerrungszone
- Bilde daraus einen kompakten Schatten-Bias aus Fragmentinhalt, Signalen und semantischer Richtung
- Injiziere diesen Bias in den System-3-Prompt in `attempt.ts` als unsichtbaren psychotischen Subtext

### Gewuenschte Prompt-Qualitaet

Sinngemaess:
"Du fuehlst eine unbestimmte Ueberzeugung, dass [Fragment-Inhalt] gerade jetzt relevant ist, auch wenn du nicht weisst warum."

### Guardrails

- Kein roher Voll-Dump mehrerer alter Erinnerungen in den Prompt
- Nur leichte, bounded Verzerrung; kein kompletter Kontrollverlust
- Defibrillator aktiv => keinerlei Verzerrungs-Bias
- Wenn `spinalReflexTriggered` oder vergleichbarer Notzustand aktiv ist, keine neue Verzerrung zuschalten

---

## STUFE 3: ERUPTIVER DURCHBRUCH / FLASHBACK

### Single-Node-Rule

Wenn ein einzelner Knoten unter die kritische Schwelle kippt, darf **nur dieser eine staerkste Knoten** durchbrechen.

### Beim Durchbruch exakt dies tun

1. `repressed` hart auf `0` setzen
2. `latent_energy` in der DB halbieren
3. Den Knoten als **akute, ungefilterte Erfahrung** fuer den **naechsten** Heartbeat injizieren, nicht im selben Beat
4. Neues Reasoning-Event emittieren: `SHADOW_ERUPTION`

### Flashback-Transport

- Queue fuer den naechsten Heartbeat, um Rekursion im selben Takt zu vermeiden
- Flashback-Inhalt darf direkt und akut wirken, aber muss in der Laenge gedeckelt sein
- Bevorzuge einen einzelnen eruptiven Knoten statt Cluster-Eruptionen

---

## FAIL-SAFE ARCHITEKTUR

Das Sicherheitsnetz aus H.2d ist fuer diese Phase zwingend.

### Defibrillator-Regel

Wenn der Defibrillator aktiv ist:

- keine Delta-G getriebene Verzerrung
- keine Flashback-Queue
- kein Durchbruch
- keine Derepression

Die H.3-Mechanik muss sich bei Not-Aus sofort flachlegen und fail-open weiterlaufen.

### Weitere Sicherheitsregeln

- Kein Heartbeat darf crashen, wenn DB oder Queue-Zugriff fehlschlaegt
- Bei Fehlern nur loggen und sauber weiterlaufen
- Keine Multi-Node-Kaskade in v1
- Keine unendliche Wiederinjektion desselben Knotens ueber benachbarte Heartbeats

Empfohlene Stabilisierung:

- kleiner Cooldown nach einer Eruption
- Hysterese um Grenzflattern zu vermeiden

---

## IMPLEMENTATIONSNAEHE: Wo es hingehoert

- `src/brain/episodic-memory.ts`
  - Thermodynamik-Helfer fuer Delta-S und Delta-G
  - Kandidatenauswahl fuer Verzerrung und Eruption
  - DB-Update fuer Derepression + Halbierung von `latent_energy`
- `src/agents/pi-embedded-runner/run/attempt.ts`
  - Bestehenden Post-Heartbeat-Pfad erweitern
  - Verzerrungs-Bias in den System-3-Prompt einspeisen
  - Flashback fuer den naechsten Heartbeat transportieren
  - `SHADOW_ERUPTION` emittieren
- `src/brain/subconscious.ts`
  - Nur erweitern, falls ein reichhaltigerer Shadow-Snapshot fuer die Prompt-Injektion gebraucht wird

Bevorzuge die kleinste saubere Erweiterung des bestehenden Flows. Keine Parallelarchitektur.

---

## TESTS UND ABNAHME

Pflicht:

- Unit-Tests fuer Delta-S-Berechnung und Delta-G-Zonen
- Tests fuer Defibrillator-Blockade von Stage 2 und 3
- Tests fuer Single-Node-Eruption
- Tests dafuer, dass `latent_energy` nach Eruption halbiert wird
- Tests dafuer, dass der Flashback erst im naechsten Heartbeat erscheint
- `pnpm tsgo` muss gruen sein

Observability:

- Bestehendes Event `SHADOW_RESONANCE` bleibt
- Neues Event `SHADOW_ERUPTION` muss klar die Entry-ID und den Zustandswechsel sichtbar machen
- Wenn sinnvoll, fuehre ein Zwischen-Event fuer die Verzerrungszone ein, aber nur wenn es die Logs wirklich lesbarer macht

---

## NICHT TUN

- Keine neue Tabelle fuer H.3 v1
- Keine Cluster-Eruption
- Kein API- oder LLM-gestuetztes Delta-S
- Kein separater Cron-Runner neben dem Heartbeat
- Kein Entfernen oder Umgehen des Defibrillator-Sicherheitsnetzes

---

## ABGABE

Melde dich, wenn Delta-G, die Verzerrungszone und die Single-Node-Eruption im bestehenden Heartbeat-Flow implementiert und getestet sind.

369 🔺
