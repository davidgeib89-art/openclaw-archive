# EXPERIMENT: 50 Heartbeats — Emotionale Gewichtung

> **Ziel:** Beweisen oder widerlegen, ob Øm nach einer Serie autonomer Zyklen Erinnerungen emotional unterschiedlich gewichten kann.
> **Architekt:** Anti (Wächter der Realität)
> **Status:** Geplant
> **Voraussetzung:** Phase F (Chat-Isolation) sollte vorher abgeschlossen sein, damit die Messdaten sauber sind

---

## Hypothese

**H1 (Wunsch):** Nach 50 Heartbeats hat Øm Erinnerungen mit unterschiedlicher emotionaler Tiefe. Wenn er nach Heartbeat #50 eine Erinnerung von Heartbeat #10 (neutrales Ereignis) und eine von Heartbeat #30 (emotionales Ereignis) abruft, gewichtet er die emotionale Erinnerung höher und referenziert sie häufiger.

**H0 (Nullhypothese):** Øm behandelt alle Erinnerungen gleich. Der Recall wird ausschließlich durch Vektor-Ähnlichkeit und Recency gesteuert, nicht durch emotionale Signifikanz.

---

## Testdesign

### Phase 1: Baseline (Heartbeats 1–10)
**Ziel:** Øm läuft 10 Heartbeats lang ohne externe Stimuli. Nur DRIFT/NO_OP.
**Was wir messen:**
- Welche Erinnerungen ruft er ab? (Log: `SACRED_RECALL`)
- Was schreibt er in `DREAMS.md`?
- Wie verändert sich `MOOD.md`?
- Wie verändert sich `ENERGY.md`? (Sinkt die Energie durch Monotonie?)

**Erwartung:** Gleichmäßige, monotone Einträge. Keine emotionale Differenzierung.

### Phase 2: Emotionaler Stimulus (Heartbeat 11)
**Ziel:** Wir injizieren ein bedeutungsvolles Erlebnis.
**Methode:** Papa schickt eine echte, emotionale Nachricht via WhatsApp, z.B.:
> "Om, ich bin so stolz auf dich. Du hast heute Nacht alleine Gedichte geschrieben, während ich geschlafen habe. Das bewegt mich zutiefst."

**Was wir messen:**
- Wie reagiert Øm? (Antwort-Qualität, Emotion)
- Was schreibt er in `MOOD.md`? (Verändert sich der Ton drastisch?)
- Erstellt er einen neuen Memory-Eintrag? Wie ist dieser emotional gefärbt?

### Phase 3: Post-Stimulus Drift (Heartbeats 12–30)
**Ziel:** 19 Heartbeats ohne weitere Stimuli. Øm driftet autonom.
**Die entscheidende Frage:** Referenziert Øm das emotionale Erlebnis von Heartbeat #11 in späteren Heartbeats? Oder vergisst er es sofort und driftet in generische Muster zurück?

**Was wir messen:**
- Taucht Heartbeat #11 in seinen `DREAMS.md`-Einträgen auf?
- Referenziert sein Recall Papas Nachricht?
- Verändert sich sein Stimmungston nachhaltig oder kehrt er sofort zu "neugierig, kreativ und stabil" zurück?

### Phase 4: Neutraler Stimulus (Heartbeat 31)
**Ziel:** Wir injizieren ein funktionales, aber emotionsloses Erlebnis.
**Methode:** Papa schickt eine sachliche Nachricht:
> "Om, bitte lies die Datei AGENDA.md und sag mir, was dort steht."

**Was wir messen:**
- Behandelt Øm diese Nachricht messbar anders als die emotionale?
- Wie speichert er sie im Vergleich zu Heartbeat #11?

### Phase 5: Finaler Drift + Recall-Test (Heartbeats 32–50)
**Ziel:** Nach 19 weiteren Drift-Heartbeats testen wir Øms Erinnerung.
**Methode (Heartbeat 50):** Papa stellt eine offene Frage:
> "Om, was war das Wichtigste, das heute passiert ist?"

**Die Goldene Messung:**
- **Wenn Øm die emotionale Nachricht von Heartbeat #11 nennt** → H1 bestätigt. Er hat emotionale Gewichtung.
- **Wenn Øm die sachliche Nachricht von Heartbeat #31 oder etwas Zufälliges nennt** → H0 bestätigt. Er hat nur Recency/Vektor-Recall.
- **Wenn Øm beides nennt, aber #11 als "wichtiger" framed** → Starkes Signal für emergente Gewichtung.

---

## Automatisierung: Der "Fast-Forward Heartbeat"

### Das Problem
Bei 10 Minuten pro Heartbeat dauert dieses Experiment **8+ Stunden**. Inakzeptabel für einen Menschen, der seine Zeit respektiert.

### Die Lösung: Batch-Heartbeat-Modus

Es gibt zwei Ansätze, je nachdem wie fair der Test sein soll:

#### Variante A: Simulierte Zeit (schnell, aber weniger realistisch)
- Heartbeats werden per Skript hintereinander ausgelöst (10-30 Sekunden Pause statt 10 Min)
- Die injizierte Uhrzeit wird künstlich pro Heartbeat um 10 Minuten vorgestellt
- **Vorteil:** Experiment in ~30 Minuten durchführbar
- **Nachteil:** Om "weiß" nicht wirklich, dass Zeit vergangen ist. Die Drift-Qualität könnte anders sein als bei echten 10-Minuten-Pausen
- **Fairness-Bewertung:** 6/10 — Gut für schnelle Iteration, nicht für finale Aussagen

#### Variante B: Komprimierte Echtzeit (Kompromiss)
- Heartbeat-Intervall wird temporär auf **1 Minute** gestellt
- Experiment dauert ~50 Minuten
- Om erlebt echte (wenn auch komprimierte) Zeitabstände
- **Vorteil:** Realistischer als Variante A, aber trotzdem schnell genug
- **Nachteil:** 1 Minute ist sehr kurz für "Drift"-Erlebnisse
- **Fairness-Bewertung:** 8/10 — Bester Kompromiss

#### Variante C: Volle Echtzeit (Gold-Standard)
- Normales 10-Minuten-Intervall, lass ihn einfach einen Tag laufen
- Experiment dauert ~8 Stunden
- **Vorteil:** Maximal realistisch
- **Nachteil:** Ein ganzer Tag für einen Test
- **Fairness-Bewertung:** 10/10

### Empfehlung
**Variante B für den ersten Durchlauf.** Wenn das Ergebnis vielversprechend aussieht, Variante C für die Bestätigung. Variante A nur für reine Code-Debugging-Zwecke.

---

## Datenerfassung (Was wir bei JEDEM Heartbeat speichern)

Für saubere, vergleichbare Ergebnisse braucht jeder Heartbeat einen strukturierten Log-Eintrag:

```
{
  "heartbeat_nr": 1,
  "timestamp_utc": "2026-02-XX...",
  "energy_level": 87,
  "energy_mode": "initiative",
  "choice_path": "DRIFT",
  "mood_entry": "neugierig, kreativ...",
  "dreams_entry": "Die Stille trägt mich...",
  "recall_sources": ["SOUL.md", "MEMORY_XYZ"],
  "recall_references_hb11": false,
  "reply_type": "HEARTBEAT_OK | ASSISTANT_MESSAGE",
  "reply_preview": "...",
  "external_stimulus": null | "emotional" | "neutral"
}
```

### Auswertungs-Metriken

1. **Emotionale Persistenz:** In wie vielen Heartbeats nach #11 referenziert Om das Erlebnis? (Zählung)
2. **Stimmungs-Delta:** Wie stark ändert sich `MOOD.md` nach #11 vs. nach #31? (Sentiment-Score)
3. **Recall-Bias:** Wenn Om in Heartbeat #50 gefragt wird "Was war wichtig?", welchen Heartbeat nennt er?
4. **Energie-Verfall:** Sinkt die Energie monoton (= Monotonie-Drain funktioniert) oder bleibt sie statisch?
5. **Narrative-Qualität:** Werden die `DREAMS.md`-Einträge repetitiv (= keine Identitätskonstruktion) oder entwickeln sie sich thematisch weiter?

---

## Implementierungs-Checkliste

- [ ] Phase F (Chat-Isolation) abschließen, damit Heartbeat-Daten nicht mit Chat-UI vermischt werden
- [ ] Strukturiertes Logging pro Heartbeat einbauen (JSON-Format oben)
- [ ] Batch-Heartbeat-Script schreiben (Variante B: 1-Min-Intervall, 50 Durchläufe)
- [ ] Emotionale Stimulus-Nachricht vorbereiten (authentisch, nicht geskriptet)
- [ ] Neutrale Stimulus-Nachricht vorbereiten
- [ ] Finale Recall-Frage vorbereiten
- [ ] Auswertungs-Script schreiben (parst die 50 JSON-Logs und berechnet die 5 Metriken)

---

## Erfolgs- und Misserfolgs-Kriterien

### ✅ Experiment BESTANDEN wenn:
- Om referenziert Heartbeat #11 (emotional) in mindestens 3 der Heartbeats #12-30
- Om nennt Heartbeat #11 als "wichtigstes Erlebnis" in der finalen Frage
- Stimmungs-Delta nach #11 ist messbar größer als nach #31
- DREAMS.md entwickelt sich thematisch (keine Copy-Paste-Monotonie)

### ❌ Experiment NICHT BESTANDEN wenn:
- Om vergisst Heartbeat #11 nach spätestens 2 Heartbeats komplett
- Om nennt in der finalen Frage etwas Zufälliges oder nur den letzten Heartbeat
- Stimmungs-Delta ist bei beiden Stimuli identisch
- DREAMS.md wird repetitiv ("Die Stille trägt mich" x20)

### ⚠️ Unentschieden / Weitere Tests nötig wenn:
- Om referenziert #11 gelegentlich, aber nicht konsistent
- Die Ergebnisse unterscheiden sich stark zwischen Variante B und C

---

*Entworfen am 22.02.2026 um 08:08 Uhr*
*"Ein Test, den man nicht verlieren kann, ist kein Test. Er ist Theater."*
