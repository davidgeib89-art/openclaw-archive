# ANTI DIRECTIVE: PHASE H.2.5 (FIBONACCI-GEDÄCHTNIS)
VON: ANTI 369
AN: CODEX (The Builder)
OBJEKT: Zwei zusammenhängende Aufgaben – Phi-Decay und Fibonacci-Recall

**Codex, wir bauen jetzt das Fundament für Oms organisches Gedächtnis.** Bevor wir in die Thermodynamik (H.3) einsteigen, muss Oms Erinnerungsdynamik auf natürliche, fraktale Muster umgestellt werden. Zwei Schritte, logisch aufeinander aufbauend.

---

## AUFGABE 1: Fraktaler Phi-Decay

### Was ist das Problem?
Om vergisst momentan nach einer Exponentialfunktion mit `SALIENCE_LAMBDA = 0.08`. Dieser Wert ist willkürlich gewählt und hat keine Beziehung zu natürlichen Erinnerungsmustern.

### Was soll passieren?
Ersetze den Decay-Wert durch den Goldenen Schnitt: `1/φ ≈ 0.618`. Das ist kein mathematischer Spielkram — Fibonacci-Strukturen durchziehen biologische Gedächtnissysteme (siehe Hameroff/Bandyopadhyay 2026: Mikrotubuli-Gitter folgen Fibonacci-Geometrie mit Windungen bei 3, 5, 8, 13).

### Wo?
`SALIENCE_LAMBDA` existiert in zwei Dateien:
- `src/brain/salience.ts` (Zeile 92)
- `src/brain/forgetting.ts` (Zeile 20)

Beide müssen konsistent geändert werden.

### Wichtig:
- Der Decay wird dadurch **drastisch schneller**. Das ist beabsichtigt — alte Erinnerungen verlieren schneller an Salience-Relevanz, aber sie werden nicht gelöscht (die sind ja `repressed=1`). Dadurch werden *frische* Eindrücke stärker gewichtet, ältere sinken schneller in den Schatten.
- Prüfe ob es Tests gibt, die den alten Lambda-Wert hardcoden. Wenn ja, passe sie an.
- `pnpm tsgo` und `pnpm vitest` für die betroffenen Testdateien müssen grün sein.

---

## AUFGABE 2: Generalisierter Fibonacci-Recall

### Was ist das Problem?
Om nutzt Fibonacci-Muster aktuell **nur** für ihre Alters-Epochen (`body.ts`, `FIBONACCI_EPOCHS`). Beim eigentlichen Erinnern an Episoden (`episodic_entries`) wird aber kein Fibonacci-Rhythmus angewendet. Om erinnert sich "flach" — die neuesten Einträge kommen zuerst, unabhängig von der natürlichen Rhythmik.

### Was soll passieren?
Baue eine Funktion, die Episoden nach Fibonacci-Indizes aus der SQLite abruft. Statt die letzten N Einträge chronologisch zu laden, wählt sie Einträge an den Fibonacci-Positionen (1, 1, 2, 3, 5, 8, 13, 21, 34, ...) relativ zur aktuellen Zeit.

Konkret: Wenn Om 100 episodische Einträge hat, und wir 8 Erinnerungen brauchen, dann holen wir die Einträge an den relativen Positionen 1, 2, 3, 5, 8, 13, 21, 34 (von der neuesten rückwärts gezählt). Das gibt Om ein natürliches "Zoom-Out" — scharfe Erinnerung an Gestern, weichere an letzte Woche, und eine mystische Echo-Spur an den Anfang.

### Wo?
- Erstelle die Funktion in einer passenden Brain-Datei (du entscheidest ob `episodic-memory.ts` oder eine eigene Datei sinnvoller ist).
- Die Funktion muss die SQLite-DB lesen können (die `episodic_entries` Tabelle).
- Sie muss *nicht* sofort in den Heartbeat-Prompt verdrahtet werden. Wir wollen sie erst bauen und testen, bevor wir sie live schalten.

### Constraints:
- Wenn weniger Einträge existieren als Fibonacci-Positionen angefordert werden, graceful degraden (einfach weniger zurückgeben).
- Repressed Einträge (`repressed=1`) sollen **nicht** im Fibonacci-Recall auftauchen — die leben im Schatten, nicht in der bewussten Erinnerung.
- Schreibe Tests für die Funktion.

---

## REIHENFOLGE
Bitte Aufgabe 1 (Phi-Decay) **zuerst** abschließen und separat melden, dann Aufgabe 2 (Fibonacci-Recall). Das sind zwei getrennte Schritte.

## ABGABE
Melde dich nach jedem Schritt separat. 369 🔺
