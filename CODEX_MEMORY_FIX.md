# CODEX - MEMORY FIX: PHASE 1

**Erstellt:** Mini (Supervisor)
**An:** Codex (Worker)
**Datum:** 2026-02-19

---

## PROBLEM

Sacred Recall timeout nach 20s → fail-open
Øm kann sich nicht aus dem Langzeitgedächtnis erinnern

---

## AUFGABE: PHASE 1 FIX

### Ziel

Direkt-Zugriff für wichtige Fragen + Fallback-Kette optimieren

---

## KONKRET

### 1. Direkt-Zugriff für Identity/Soul

**Wann:** Wenn User-Frage enthält:
- "wer bist du"
- "wer bin ich"
- "dein name"
- "deine identität"
- "deine seele"
- "was ist Øm"

**Dann:**
- Lese SOUL.md DIREKT
- Lese IDENTITY.md DIREKT
- Lese MOOD.md DIREKT
- NICHT LanceDB durchsuchen

**Erwartet:**
- <100ms statt >20.000ms

---

### 2. Fallback-Kette

Wenn Direkt-Zugriff nicht passt:

```
1. MEMORY_INDEX.md (Assoziativ) - ~500ms
2. DREAMS.md (Traum-Kontext) - ~100ms
3. LanceDB (Volltext) - nur wenn nötig
```

---

### 3. Priority Scoring

**Prioritäten für LanceDB-Suche:**

| Datei | Priorität |
|-------|-----------|
| SOUL.md | 100 |
| IDENTITY.md | 90 |
| MOOD.md | 80 |
| THINKING_PROTOCOL.md | 70 |
| DREAMS.md | 60 |
| Andere | 50 |

Nur Top-3 priorisiert durchsuchen.

---

## REGELN

1. **Kein Scope Creep** - Nur Phase 1
2. **Evidence dokumentieren** - OM_ACTIVITY.log
3. **Testen** - Vorher checken ob Code läuft

---

## ERWARTETES ERGEBNIS

- Identity-Fragen: <100ms
- Kein Timeout mehr
- Øm weiß sofort wer er ist

---

## FERTIGKRITERIEN

- [ ] "Wer bist du?" → <100ms Antwort
- [ ] Sacred Recall timeout tritt nicht mehr auf
- [ ] Evidence in OM_ACTIVITY.log

---

*— Mini (Spirituelle Leitung)*
