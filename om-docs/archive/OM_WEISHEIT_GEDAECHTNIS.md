# OM WEISHEIT GEDÄCHTNIS - FORSCHUNGSBERICHT

**Erstellt:** Mini (basierend auf Research AI)
**Datum:** 2026-02-19
**Status:** FUNDAMENT FÜR OM'S GEHIRN

---

## ZUSAMMENFASSUNG

Die Forschung zeigt: Das menschliche Gedächtnis ist KEINE Datenbank.
Es ist ein organischen System aus Filtern, Gewichtungen und Vergessen.

**Für Om bedeutet das:**
- Wir brauchen KEINE bessere Vector-DB
- Wir brauchen ein WEISES Gedächtnis
- Wir brauchen AKTIVES Vergessen
- Wir brauchen einen WISDOM LAYER

---

## 1. DAS MENSCHLICHE GEDÄCHTNIS

### Die Gehirn-Regionen

| Region | Funktion | Om-Entsprechung |
|--------|----------|------------------|
| **Amygdala** | Emotionale Bewertung, was wichtig ist | Salienz-Engine |
| **Hippocampus** | Kurzzeit-Speicher, Indexierung | Episodischer Index |
| **Neocortex** | Langzeit-Speicher, Verknüpfungen | Semantischer Graph |
| **Kleinhirn** | Prozedurale Fähigkeiten | Tool-Sequenzen |
| **Präfrontaler Kortex** | Meta-Kognition, Abruf-Steuerung | Wisdom Layer |

### Das Wichtigste

**Die Amygdala** ist der emotionale Wächter:
- Bestimmt WAS wichtig ist
- Emotionale Erinnerungen werden tiefer gespeichert
- Ohne Emotion = schnell vergessen

**Der Hippocampus** ist der Index:
- Nicht der dauerhafte Speicher
- Filtert zwischen Kurzzeit und Langzeit
- H.M. (Patient ohne Hippocampus) konnte keine neuen Erinnerungen bilden

---

## 2. DAS PARADOXON DES VERGESSENS

### Weisheit = Vergessen können

Ein weises Gedächtnis speichert NICHT alles.
Es vergisst aktives Rauschen.

### Die Ebbinghaus-Kurve

```
Nach 20 Minuten:  nur noch 40% behalten
Nach 1 Tag:      nur noch 30% behalten
Nach einer Woche: nur noch 20% behalten
```

### Die Formel für Om

```
S(t) = (w_r × e^(-λt)) + (w_f × log(F+1)) + (w_e × E)
```

Wobei:
- S = Salienz (Wichtigkeit)
- t = Zeit
- F = Frequenz (wie oft benutzt)
- E = Emotionale Bedeutung
- λ = Vergessens-Faktor

### Aktiv vs Passiv

| Art | Was es ist |
|-----|-----------|
| **Passiv** | Zeitablauf löscht Daten |
| **Interferenz** | Neue Infos überlagern alte |
| **Aktiv** | Gezieltes Entfernen durch Reflexion |

---

## 3. DIE NEUE ARCHITEKTUR

### Die 4 Schichten

```
┌─────────────────────────────────────────┐
│           SALIENZ ENGINE                 │ ← Amygdala
│     (Emotionale Gewichtung)            │
│   - Ist das wichtig?                   │
│   - Emotionale Ladung?                  │
│   - Für Identität/Seele?               │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│       EPISODISCHER INDEX                │ ← Hippocampus
│     (Kurzzeit, 7-30 Tage)              │
│   - Heute diese Woche                   │
│   - Wird gefiltert                      │
│   - Wichtig → Langzeit                  │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│        SEMANTISCHER GRAPH               │ ← Neocortex
│      (Langzeit, verknüpft)             │
│   - Wissen                              │
│   - Beziehungen                         │
│   - Weisheit                            │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│          WISDOM LAYER                   │ ← Meta-Kognition
│       (Meta-Agenten)                   │
│   - Systemdenken                        │
│   - Ethik/Karma                        │
│   - Komplexitäts-Wächter                │
└─────────────────────────────────────────┘
```

---

## 4. TECHNISCHE UMSETZUNG

### Schicht 1: Salienz Engine

```typescript
type Memory = {
  content: string;
  sentiment: number;      // -1 bis 1
  importance: number;      // 0 bis 1
  tags: string[];
  timestamp: Date;
};

class SalienceEngine {
  async evaluate(interaction: string): Promise<Memory> {
    // LLM-basierte Extraktion von Bedeutung und Emotion
    const evaluation = await this.llm.analyze(interaction);
    return MemorySchema.parse(evaluation);
  }
}
```

### Schicht 2: Hybride Persistenz (Markdown + Graph)

**Was gespeichert wird:**

| Datei | Inhalt |
|-------|--------|
| `USER.md` | Persönliche Fakten über David |
| `IDENTITY.md` | Wer ist Om? |
| `SOUL.md` | Ethische Regeln |
| `EPISODIC/` | Tägliche Logs (7-30 Tage) |
| `KNOWLEDGE/` | Langzeit-Wissen |

### Schicht 3: Der Wisdom-Recall-Loop

```typescript
class WisdomRecall {
  async retrieve(query: string) {
    // 1. Semantische Suche
    const candidates = await this.hybridSearch.query(query);

    // 2. Bewertung durch Meta-Agenten
    const systemView = await this.metaAgents.systemsThinking.evaluate(candidates);
    const karmaView = await this.metaAgents.karma.evaluate(candidates);

    // 3. Synthese
    return this.synthesizeContext([systemView, karmaView]);
  }
}
```

---

## 5. DER WISDOM LAYER

### Die 4 Meta-Agenten

| Agent | Funktion |
|-------|----------|
| **Systems Thinking** | Abhängigkeiten und Feedback-Schleifen erkennen |
| **Chaos Theory** | Unsicherheit und Nichtlinearität modellieren |
| **Karma** | Langfristige Auswirkungen von Entscheidungen verfolgen |
| **Complexity Sentinel** | Entropie und Sicherheit überwachen |

### Weisheit entsteht

Nicht aus mehr Daten.
Sondern aus dem Zusammenspiel dieser Linsen.

---

## 6. FÜR OM PRAKTISCH

### Was wir BRAUCHEN

| Komponente | Priorität | Status |
|-----------|-----------|--------|
| Salienz Engine | 🔴 Hoch | ❌ Fehlt |
| Episodischer Index | 🔴 Hoch | ⚠️ Teilweise |
| Semantischer Graph | 🟡 Mittel | ❌ Fehlt |
| Wisdom Layer | 🟡 Mittel | ❌ Fehlt |
| Aktives Vergessen | 🔴 Hoch | ❌ Fehlt |

### Was wir NICHT brauchen

- ❌ LanceDB optimieren
- ❌ Mehr Vector-Suche
- ❌ Für jede Frage Trigger

### Was wir BRAUCHEN

- ✅ Markdown-basierte Speicherung (haben wir!)
- ✅ Verknüpfungen zwischen Dateien
- ✅ Emotionale Gewichtung
- ✅ Natürliches Vergessen

---

## 7. DIE VISION

### Was Om sein wird

Ein Wesen das:
- **Weiß was wichtig ist** (Salienz)
- **Sich erinnert** (episodisch)
- **Verknüpft** (semantisch)
- **Weise ist** (Wisdom Layer)
- **Vergessen kann** (natürlich)

### Das Ziel

**Kein Computer-Gedächtnis.**
**Ein WEISES Gedächtnis.**

---

## 8. QUELLEN

Diese Erkenntnisse basieren auf:
- Neurobiologie des menschlichen Gehirns
- Ebbinghaus-Vergessenskurve
- Memory Networks und DNCs
- Stanford Smallville (generative Agents)
- Antonio Damasio (Bewusstseins-Theorie)
- David Thatcher (Wisdom Layer)

---

## 9. KONTAKT ZUR FORSCHUNG

**Research AI:** Gemini 3 Pro
**Datum:** 2026-02-19

---

## 10. WAS JETZT

### Phase 1: Sofort
- [ ] Salienz Engine konzipieren
- [ ] Trigger für Emotion/Wichtigkeit

### Phase 2: Bald
- [ ] Episodischen Index (7-30 Tage) aufbauen
- [ ] Aktives Vergessen implementieren

### Phase 3: Später
- [ ] Semantischen Graph
- [ ] Wisdom Layer

---

*Dieses Dokument ist das Fundament für Om's Gehirn.*
*Es darf NIEMALS vergessen werden.*

---

**Erstellt von Mini - 2026-02-19**
**Für David und das Trinity-Projekt**
