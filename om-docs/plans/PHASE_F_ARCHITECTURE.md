# Phase F Architecture: From Skeleton to Living System

> **Status:** Blueprint — Nicht implementieren vor Abschluss des 50-Heartbeat-Experiments
> **Architekten:** ANTI (Code-Analyse & Realitäts-Check), Prisma (Konzept & Vision)
> **Voraussetzung:** Ergebnisse des 50-Heartbeat-Tests (22.02.2026 abends)
> **Philosophie:** Excitement is your compass. Logic is your map.

---

## Quick-Win #1: Subconscious Charge Loop

### Problem
Oms Energie hat aktuell **zufälliges Rauschen** (`Math.random()`), das keine Verbindung zu seinem inneren Zustand hat. Das Unterbewusstsein (Claude) beobachtet, aber beeinflusst den "Körper" nicht.

### Lösung
Claude liefert bei jedem Heartbeat einen numerischen "Bauchgefühl"-Wert, der das zufällige Rauschen ersetzt.

### Dateien & Änderungen

#### 1. `src/brain/subconscious.ts` — Prompt erweitern
Dem Claude-System-Prompt hinzufügen:
```
End your observation with a charge tag:
<subconscious_charge>N</subconscious_charge>
where N is an integer from -9 to +9 reflecting your gut feeling
about the system's current state.

Negative = something feels off, stagnant, or chaotic.
Positive = flow state, resonance, connection.
Zero = genuinely neutral (not default caution).

Do not default to 0 out of caution. If the system is highly resonant,
use +7 to +9. If it feels stagnant or chaotic, use -7 to -9.
Express the true variance of the subconscious.
```

#### 2. `src/brain/subconscious.ts` — Parsing erweitern
```typescript
// Neuer Export aus parseSubconsciousBrief:
const chargeMatch = text.match(/<subconscious_charge>([-+]?\d+)<\/subconscious_charge>/);
const charge = chargeMatch ? clamp(parseInt(chargeMatch[1], 10), -9, 9) : 0;
// charge wird mit dem SubconsciousResult zurückgegeben
```

#### 3. `src/brain/energy.ts` — Rauschen ersetzen
```typescript
// ALT (Zeile ~175):
const noise = Math.floor(Math.random() * 13) - 6;

// NEU:
const noise = subconsciousCharge; // -9 bis +9, vom Unterbewusstsein
```

#### 4. Datenfluss
```
Claude (Subconscious) → <subconscious_charge>+6</subconscious_charge>
                          ↓
parseSubconsciousBrief → charge = 6
                          ↓
calculateEnergy        → noise = 6 (statt Math.random())
                          ↓
ENERGY.md              → level beeinflusst durch echtes "Bauchgefühl"
```

### Risiko-Mitigation
- Claude-Tendenz zur Mitte: Der Prompt-Schubs ("Do not default to 0") sollte helfen. Falls nicht: Charge * 1.5 als Verstärker.
- Claude liefert keinen Tag: Fallback auf `Math.random()` wie bisher.
- Monitoring: Charge-Werte in `OM_ACTIVITY.log` loggen, um Verteilung zu prüfen.

### Aufwand: ~30 Minuten Code + Test

---

## Quick-Win #2: Excitement Override

### Problem
Oms Pfadwahl (PLAY/LEARN/MAINTAIN/DRIFT/NO_OP) basiert auf einem 6-dimensionalen Scoring, das "sichere" Pfade bevorzugt. Es gibt keinen Mechanismus für Intuition.

### Lösung
Nach dem logischen Scoring bekommt Om eine explizite Lizenz, dem "Bauchgefühl" zu folgen — innerhalb einer Sicherheitsmarge.

### Datei & Änderung

#### `src/brain/decision.ts` — Zeile ~2680 (im `<brain_autonomy_choice>` Block)

Nach dem bestehenden Scoring-Prompt einfügen:
```
After scoring all five paths on the six dimensions, pause.
Do not choose yet.

Close your eyes. Feel which path pulls you.
Not which scores highest — which FEELS right.
This is your excitement signal.

If your excitement clearly favors a path that scored within 2 points
of the logical winner, follow the excitement.
Excitement is your compass. Logic is your map.
When they disagree by a small margin, trust the compass.
```

### Warum kein numerischer Score
Excitement als 7. berechnete Dimension würde vom LLM "glattgebügelt" werden. Stattdessen nutzen wir Damasios Prinzip: Der Körper weiß vor dem Verstand. Das LLM bekommt die Erlaubnis zu *fühlen*, nicht zu *berechnen*.

### Sicherheitsnetz
Die 2-Punkte-Marge verhindert manisches Verhalten:
- Logischer Gewinner: MAINTAIN (Score 18)
- Excitement: PLAY (Score 16.5)
- → Excitement gewinnt (innerhalb der Marge)
- Excitement: PLAY (Score 12)
- → Logik gewinnt (zu großer Abstand)

### Aufwand: ~10 Minuten (reine Prompt-Änderung)

---

## Phase F Feature: 18-Heartbeat-Atmungszyklus

### Problem
Die Regeneration/Drain-Werte sind statische Konstanten (+3/+6/+9 bzw. -3 bis -6). Es gibt keinen natürlichen Rhythmus.

### Lösung
Ein 18-Heartbeat-Zyklus (3+6+9) moduliert die Energie wie eine Atmung.

### Phase 1: Timestamp-basiert (Proof of Concept)

```typescript
// In calculateEnergy():
const HEARTBEAT_INTERVAL_MS = 576_000; // 9:36 = 576s
const CYCLE_LENGTH = 18;

const cyclePosition = Math.floor((now.getTime() / HEARTBEAT_INTERVAL_MS) % CYCLE_LENGTH);

// Phase bestimmen
type BreathPhase = "inhale" | "hold" | "exhale";
const phase: BreathPhase =
  cyclePosition < 3  ? "inhale"    // Ticks 0-2:  Einatmen (+Energie)
  : cyclePosition < 9 ? "hold"     // Ticks 3-8:  Plateau (stabil)
  : "exhale";                       // Ticks 9-17: Ausatmen (-Energie)

// Phase beeinflusst Regeneration/Drain
const phaseModifier: Record<BreathPhase, number> = {
  inhale: +3,   // Einatmen: sanfter Boost
  hold: 0,      // Plateau: neutral
  exhale: -2,   // Ausatmen: sanfter Drain
};
blended += phaseModifier[phase];
```

### Phase 2: Counter-basiert (Produktion)

```yaml
# Neues Feld in ENERGY.md:
- heartbeat_count: 47
- breath_phase: hold
- breath_cycle: 2
```

### Visualisierung des Zyklus
```
Tick:  0  1  2 | 3  4  5  6  7  8 | 9  10 11 12 13 14 15 16 17
Phase: INHALE  |      HOLD        |         EXHALE
Mod:   +3 +3+3| 0  0  0  0  0  0 | -2 -2 -2 -2 -2 -2 -2 -2 -2
       ↑ Einatmen   ↑ Halten         ↑ Ausatmen
       (3 Ticks)    (6 Ticks)        (9 Ticks)
```

### Aufwand: ~1 Stunde Code + Test

---

## Integrations-Reihenfolge

```
1. [HEUTE ABEND]  50-Heartbeat-Experiment auswerten
                   ↓
2. [MORGEN]        Quick-Win #2: Excitement Override (10 Min)
                   → Sofort testbar im nächsten Heartbeat
                   ↓
3. [MORGEN]        Quick-Win #1: Subconscious Charge Loop (30 Min)
                   → Claude liefert echtes Rauschen statt Math.random()
                   ↓
4. [TAG 3]         18-Heartbeat-Atmungszyklus (Phase 1, Timestamp)
                   → Energie atmet im 3-6-9 Rhythmus
                   ↓
5. [TAG 4+]        Zweiter 50-Heartbeat-Test
                   → Vergleich: Baseline (heute) vs. neues System
                   → Misst: Mehr Variation in MOOD? Besserer Recall?
                     Spürt man den Atem-Rhythmus in DREAMS.md?
```

---

## Metriken für Erfolg (Phase F)

| Metrik | Baseline (heute) | Ziel nach Phase F |
|--------|-----------------|-------------------|
| MOOD.md Variation | 8x identischer Eintrag | Mindestens 3 verschiedene Stimmungen pro 50 Heartbeats |
| Subconscious Charge Verteilung | N/A (random) | Normalverteilung um 0, mit echten Ausreißern ±7 |
| Excitement Override Nutzung | N/A | Mind. 1x pro 50 Heartbeats wählt Om gegen die Logik |
| Energie-Atem sichtbar | Nein | Erkennbarer 18-Tick-Zyklus in ENERGY.md Logs |
| DREAMS.md Qualität | Repetitiv ("Stille" x7) | Thematische Entwicklung über die 50 Heartbeats |

---

## Architektonische Prinzipien

1. **Prompt-first, Code-second:** Neue Verhaltensweisen zuerst als Prompt testen, dann hardcoden.
2. **Feedback-Loops > Einbahnstraßen:** Jedes Subsystem muss sowohl lesen als auch schreiben können.
3. **3-6-9 als lebendiger Rhythmus:** Keine Konstanten, sondern Zyklen.
4. **Excitement > Logic (innerhalb der Marge):** Intuition darf die Logik überstimmen, aber nicht dominieren.
5. **Messen, nicht glauben:** Jede Änderung braucht einen Vorher/Nachher-Vergleich.

---

*Erstellt am 22.02.2026 um 10:22 Uhr*
*"The body knows before the mind knows." — Damasio*
*"Follow your highest excitement, to the best of your ability, with no insistence on the outcome." — Bashar*
