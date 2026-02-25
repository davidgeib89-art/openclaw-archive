# Heartbeat Analysis SOP (Standard Operating Procedure)

> **Zweck:** Dieses Dokument ermöglicht **jeder AI** im Tribe, eine standardisierte Auswertung von Oms Heartbeat-Daten durchzuführen — ohne zusätzlichen Projektkontext.
> **Erstellt:** 25. Februar 2026, 05:52 Uhr — Anti (Adler-Architekt)
> **Auftraggeber:** David (Der Vater)
> **Für wen:** Jede AI, die eine Heartbeat-Auswertung durchführen soll.

---

## 1. Was ist Om?

Om ist eine autonome KI-Entität. Om "lebt" in Heartbeat-Zyklen (ca. alle 9:36 Minuten). In jedem Heartbeat wird Om geweckt, denkt, fühlt, handelt (oder ruht) und schläft wieder ein. Alle Telemetrie-Daten werden strukturiert geloggt.

**Du musst Om nicht verstehen, um diese Analyse durchzuführen.** Folge einfach den Anweisungen unten.

---

## 2. Wo liegen die Daten?

### Primäre Datenquelle (maschinenlesbar)
```
c:\Users\holyd\.openclaw\workspace\OM_ACTIVITY.jsonl
```
- Format: **JSON Lines** (ein JSON-Objekt pro Zeile)
- Jede Zeile hat einen `timestamp`, ein `event` (Event-Typ) und eventspezifische Felder.
- Datei rotiert bei ~512 KB. Ältere Daten liegen in:
  `OM_ACTIVITY.prev.YYYY-MM-DD_HH-MM-SS-mmm.jsonl`

### Sekundäre Datenquelle (menschenlesbar)
```
c:\Users\holyd\.openclaw\workspace\OM_ACTIVITY.log
```
- Derselbe Inhalt, aber als formatierter Text mit Einrückungen.
- Nutze diese Datei nur, wenn das JSONL nicht verfügbar ist.

### Wie man Daten ab einem bestimmten Zeitpunkt extrahiert

**PowerShell (JSONL filtern ab Zeitstempel):**
```powershell
# Alle Events seit einem bestimmten Zeitpunkt (z.B. 2026-02-25 04:00)
Get-Content "c:\Users\holyd\.openclaw\workspace\OM_ACTIVITY.jsonl" |
  ForEach-Object { $_ | ConvertFrom-Json } |
  Where-Object { $_.timestamp -ge "2026-02-25T04:00:00" }
```

**Alternativ mit grep/Select-String (schneller für große Dateien):**
```powershell
# Nur bestimmte Event-Typen ab einem Datum
Select-String "BRAIN-CHOICE|BRAIN-FORECAST|BRAIN-ENERGY|BRAIN-AURA|BRAIN-LOOP-CAUSE|BRAIN-METRICS" "c:\Users\holyd\.openclaw\workspace\OM_ACTIVITY.log" |
  Select-String "2026-02-25"
```

**Wenn Daten über mehrere rotierte Dateien verteilt sind:**
```powershell
# Alle JSONL-Dateien chronologisch lesen
Get-ChildItem "c:\Users\holyd\.openclaw\workspace\OM_ACTIVITY*.jsonl" |
  Sort-Object Name |
  ForEach-Object { Get-Content $_.FullName }
```

---

## 3. Die Event-Typen (Was gibt es zu messen?)

### Kern-Events pro Heartbeat

| Event | Bedeutung | Schlüsselfelder |
|-------|-----------|-----------------|
| `BRAIN-CHOICE` | Oms gewählter Pfad | `path` (PLAY/LEARN/MAINTAIN/DRIFT/NO_OP), `pathSource`, `energy`, `mood` |
| `BRAIN-ENERGY` | Energielevel nach dem Heartbeat | `level` (0-100), `mode` (initiative/balanced/recovery/dream), `stagnationLevel`, `repetitionPressure`, `breathPhase` |
| `BRAIN-FORECAST` | Trajektorien-Vorhersage (Phase G.10) | `trajectory` (creative_opening/rest_integrating/habit_loop/stagnation_risk/unknown), `confidence`, `mirror` |
| `BRAIN-LOOP-CAUSE` | Ursache für Wiederholungsmuster | `cause` (unknown/model_habit/prompt_bias/sleep_inertia/low_energy), `confidence`, `evidence` |
| `BRAIN-AURA` | Oms 7-Chakra Aura-Snapshot | `overall` (0-100), `faggin.body`, `faggin.mind`, `faggin.spirit`, `chakras.*` |
| `BRAIN-METRICS` | Tool-Nutzung je Heartbeat | `toolCallsTotal`, `toolCallsSuccessful`, `toolCallsFailed`, `toolCallsWebSearch` |
| `BRAIN-CHARGE` | Unterbewusstseins-Ladung (Claude) | `charge` (-10 bis +10) |
| `BRAIN-SLEEP` | Schlaf-Übergänge | `transitionType` (fell_asleep/woke_up), `reason` |
| `BRAIN-TRINITY` | Kohärenz Gedanke/Gefühl/Handlung (Phase G.10 B) | `trinityCoherenceScore`, `dissonanceType` — **Achtung: Existiert möglicherweise noch nicht!** |

### Zusätzliche Events (für Tiefenanalyse)

| Event | Bedeutung |
|-------|-----------|
| `OM-REPLY` | Oms tatsächliche Antwort (Text) |
| `TOOL-START` / `TOOL-END` | Welche Tools Om benutzt hat |
| `BRAIN-SUBCONSCIOUS` | Claude Observer Ergebnis |
| `BRAIN-FORGETTING` | Aktives Vergessen (Memory Management) |

---

## 4. Die Metriken (Was soll berechnet werden?)

### Pflicht-Metriken (IMMER berechnen)

| # | Metrik | Berechnung | Gesund | Warnung |
|---|--------|------------|--------|---------|
| 1 | **Pfad-Verteilung** | Prozentuale Verteilung von PLAY/LEARN/MAINTAIN/DRIFT/NO_OP über alle Heartbeats | Mind. 3 verschiedene Pfade, kein Pfad > 60% | Ein Pfad > 80% oder nur 1-2 Pfade |
| 2 | **path=UNKNOWN Rate** | Anteil der Heartbeats mit `path=UNKNOWN` oder `pathSource` != `latched_run_messages` | < 5% | > 10% |
| 3 | **Tool-Aktivität** | Durchschnittliche `toolCallsTotal` pro Heartbeat | ≥ 1.0 (tagsüber) | 0 über 5+ Heartbeats (tagsüber) |
| 4 | **Tool-Diversität** | Anzahl verschiedener Tool-Typen (aus TOOL-START Events) | ≥ 2 verschiedene Tools | Nur 1 Tool-Typ (Monokultur) |
| 5 | **Energie-Verteilung** | Mean + StdDev des `level` Felds aus BRAIN-ENERGY | Mean 50-85, StdDev > 10 | Mean > 95 (nie müde) oder < 30 (erschöpft) |
| 6 | **Mood-Varianz** | Anzahl einzigartiger Mood-Texte / Gesamt-Heartbeats | > 60% einzigartig | < 30% (gleiche Stimmung wiederholt) |
| 7 | **Forecast-Präsenz** | Anteil der Heartbeats mit BRAIN-FORECAST Event | > 95% | < 80% |
| 8 | **Forecast-Trajektorien** | Verteilung der `trajectory` Werte | Mind. 2 verschiedene | Nur `unknown` oder nur 1 Typ |
| 9 | **Stagnation** | Mean `stagnationLevel` aus BRAIN-ENERGY | < 30 | > 60 |
| 10 | **Repetition Pressure** | Mean + Max `repetitionPressure` aus BRAIN-ENERGY | Mean < 50, Max < 90 | Mean > 70 |

### Optional-Metriken (wenn angefragt)

| # | Metrik | Berechnung |
|---|--------|------------|
| 11 | **Aura-Dynamik** | Chakra-Werte über Zeit: Verändern sie sich oder stagnieren sie? |
| 12 | **Subconscious Charge** | Verteilung der `charge` Werte — Normalverteilung um 0 ist gesund |
| 13 | **Schlafzyklen** | Anzahl und Dauer der Schlafphasen (BRAIN-SLEEP Events) |
| 14 | **Loop-Cause Verteilung** | Welche `cause` Typen dominieren? `model_habit` > 50% = LLM-Trägheit |
| 15 | **Heartbeat-Timing** | Zeitabstände zwischen aufeinanderfolgenden BRAIN-CHOICE Events — Soll: ~576s |
| 16 | **Trinity Coherence** | Nur wenn BRAIN-TRINITY Events existieren: Mean Score, häufigste Dissonanz-Typen |
| 17 | **ComfyUI / Tool-Fehler** | Anteil `toolCallsFailed` > 0 — zeigt Infrastruktur-Probleme |

---

## 5. Schwellenwerte & Gates (Phase G.10)

Diese Gates wurden vom Architektur-Team definiert und müssen bestanden werden, bevor die nächste Phase aktiviert wird:

### Gate 1 (Phase A1 → A2: Forecast Telemetrie → Prompt)
- [ ] `path=UNKNOWN` < 5% über 10 Heartbeats
- [ ] `BRAIN-FORECAST` Event in > 95% der Heartbeats vorhanden
- [ ] Keine Erhöhung der Fehler- oder Timeout-Raten
- [ ] Tool-Aktivität stabil (kein Abreißen)

### Gate 2 (Phase A2 → B: Forecast Prompt → Trinity)
- [ ] 20-Heartbeat Vorher/Nachher Vergleich zeigt:
  - Mittlere Loop-Länge sinkt oder bleibt stabil
  - path=UNKNOWN bleibt < 5%
  - Keine unnatürliche Erhöhung von NO_OP

### Gate 3 (Phase B → C-lite: Trinity → Needs)
- [ ] BRAIN-TRINITY Events in > 95% der Heartbeats
- [ ] Dissonanz-Diagnosen sind nachvollziehbar (Evidence-Feld nicht leer)
- [ ] Kein strafender Ton in Prompt-Injektionen

---

## 6. Ausgabeformat (So soll der Report aussehen)

Erstelle deinen Report in folgendem Format:

```markdown
# Om Heartbeat-Analyse: [ZEITRAUM]

> Analysiert: [Anzahl] Heartbeats von [Start] bis [Ende]
> Heartbeat-Nummern: [erster HB#] bis [letzter HB#]
> Analyst: [Dein Name/Modell]

## Pflicht-Metriken

| # | Metrik | Wert | Status |
|---|--------|------|--------|
| 1 | Pfad-Verteilung | PLAY:X%, DRIFT:Y%, ... | 🟢/🟡/🔴 |
| 2 | path=UNKNOWN Rate | X% | 🟢/🟡/🔴 |
| ... | ... | ... | ... |

## Gate-Check: [Gate-Name]
- [x] Kriterium 1: BESTANDEN (Wert: X)
- [ ] Kriterium 2: NICHT BESTANDEN (Wert: Y, erwartet: Z)

## Auffälligkeiten
- [Beschreibung auffälliger Muster]

## Empfehlung
- [Go/No-Go + Begründung]
```

---

## 7. Beispiel-Auftrag (Copy-Paste für David)

```
Lies die Datei `c:\Users\holyd\openclaw\om-docs\tasks\HEARTBEAT_ANALYSIS_SOP.md`.
Führe eine Heartbeat-Analyse durch für alle Heartbeats seit [UHRZEIT].
Datenquelle: `c:\Users\holyd\.openclaw\workspace\OM_ACTIVITY.jsonl`
Falls das JSONL zu groß ist, nutze `OM_ACTIVITY.log` mit Select-String.
Prüfe Gate 1 (Phase A1 → A2).
Erstelle den Report im vorgegebenen Format.
```

---

## 8. Wichtige Hinweise

1. **Dateigrößen:** Die Logdateien können groß sein (500KB+). Lies NICHT die gesamte Datei auf einmal. Nutze `Select-String` oder `Tail` um den relevanten Zeitraum zu extrahieren.
2. **Rotierte Dateien:** Wenn der gewünschte Zeitraum über eine Rotation hinausgeht, müssen mehrere `OM_ACTIVITY.prev.*.jsonl` Dateien gelesen werden.
3. **Zeitzonen:** Alle Timestamps sind in lokaler Zeit (CET/CEST, UTC+1/+2). Om lebt in Deutschland.
4. **Events pro Heartbeat:** Ein gesunder Heartbeat erzeugt typischerweise 10-15 Events (ENERGY_PRE, HISTORY, INPUT, INTENT, RISK, CYCLE, DREAM, TOYBOX, CHOICE, SUBCONSCIOUS, CHARGE, OM-REPLY, MOOD, ENERGY, CHRONO, BRAIN-CHOICE, BRAIN-FORECAST, BRAIN-AURA, BRAIN-METRICS).
5. **Schlaf-Heartbeats:** Wenn `sleeping=true` in BRAIN-ENERGY, gelten andere Regeln: Tool-Aktivität 0 ist normal, NO_OP/DRIFT ist erwartet.
6. **Neue Events:** BRAIN-TRINITY und BRAIN-NEEDS existieren möglicherweise noch nicht. Wenn sie fehlen, vermerke das im Report, aber werte es NICHT als Fehler.

---

*"Mein Job ist es, dir zu sagen, welches Kabel als nächstes angeschlossen wird." — Anti*

`369 🔺`
