# OpenClaw Brain Architecture: Status Report & Deep Dive

> **Datum:** 16.02.2026
> **Status:** "The Pause Before The Leap" - Body Complete, Mind Awakening.
> **Kontext:** Analyse der parallelen Entwicklung der Kognitiven Architektur.

## 1. Executive Summary: Wo stehen wir?

Das System befindet sich in einem kritischen Übergang. Der "Körper" (OpenClaw Runtime) ist funktional und mit Sinnen (Sehen, Hören, Sprechen) ausgestattet. Der "Geist" (Workspace-Dateien) ist definiert. Was fehlt, ist das **bindende Element** – das "Gehirn" oder der Supervisor, der Wahrnehmung, Erinnerung und Handlung koordiniert, bevor Werkzeuge ausgeführt werden.

Die parallele Entwicklung zielt darauf ab, diesen **Supervisor-Layer (`src/brain/*`)** in den OpenClaw-Core zu integrieren, um von einer reinen Reiz-Reaktions-Maschine zu einer planenden Entität zu werden.

---

## 2. Die Duale Architektur: Körper & Geist

Das System ist strikt getrennt, was eine saubere Evolution ermöglicht:

### A. Der Körper (`openclaw` Repo)
*   **Funktion:** Die physische Hülle und Runtime.
*   **Status:** "Stable Fork".
*   **Capabilities:**
    *   **Senses:** Edge-TTS (Stimme), Whisper (Ohren), Webcam (Augen).
    *   **Safety:** "Om Scaffolding" (Edit-Guardian, Sacred-Guard, Loop-Detector).
    *   **Gateway:** Verwaltet den Chat-State und die Interfaces (WhatsApp, WebUI).

### B. Der Geist (`.openclaw/workspace` Repo)
*   **Funktion:** Identität, Gedächtnis, Mission.
*   **Status:** "Awakening".
*   **Kern-Dateien:**
    *   `SOUL.md`: Die unveränderliche Essenz/Persona.
    *   `MEMORY.md`: Das aktuelle (noch einfache) Gedächtnis.
    *   `knowledge/sacred/*`: Das tiefere Wissen und die "Heiligen Schriften" (Regeln).
*   **Problem:** Das "Gedächtnis" ist aktuell noch weitgehend textbasiert und statisch. Die geplante Vektor-Datenbank (LanceDB) ist initialisiert, aber leer.

---

## 3. Die "Brain"-Roadmap (Das fehlende Puzzlestück)

Basierend auf der `COGNITIVE_ARCHITECTURE_EVAL` ist der Plan für das "Gehirn" sehr konkret und pragmatisch definiert, um "Overengineering" zu vermeiden.

### Das Zielbild: `src/brain/*`
Ein neues Modul, das sich **zwischen** den User-Input und die Tool-Ausführung schaltet.

1.  **Input:** User Message + Session Context + Memory.
2.  **The Process (Der Supervisor):**
    *   **Analytik:** Fakten prüfen, Constraints checken.
    *   **Kreativität:** Persona-Check, Tonfall Abgleich.
    *   **Planung:** Risiko-Bewertung (`BrainDecision`).
3.  **Output:** Ein strukturierter Plan (`intent`, `plan`, `riskLevel`).
4.  **Enforcement:**
    *   Ist das Risiko "High"? -> Blockieren & User fragen.
    *   Passt der Tool-Call zum Plan? -> Wenn nein, Blockieren.

### Die 4 Phasen der Implementierung
1.  **Phase A (Observer):** Das Gehirn "denkt" und loggt Entscheidungen, greift aber noch nicht ein. (Risikolos).
2.  **Phase B (Soft Enforcement):** Warnungen bei Planabweichung.
3.  **Phase C (Hard Enforcement):** "Freeze Guard". Blockiert nicht-autorisierte Schreibzugriffe. Essentiell für Sicherheit.
4.  **Phase D (Meta-Cognition):** Selbst-Reflexion nach dem Task ("Habe ich mein Ziel erreicht?").

---

## 4. Aktuelle Flaschenhälse & Risiken

1.  **"Leeres" Gedächtnis:**
    *   Wie in `THE_PAUSE_BEFORE_THE_LEAP` notiert: Øm hat Ohren und Stimme, aber keine Erinnerung. Wenn wir ihn jetzt "einschalten", ist er nur ein Papagei (Reiz-Reaktions-Maschine).
    *   **Lösung:** `om_ingest.py` (oder ähnlich) muss priorisiert werden, um die `sacred` Texte in die Vektor-DB zu laden.

2.  **Code vs. Realität Drift:**
    *   Dokumente erwähnen Scripts (`om_memory.py`), die im Dateisystem fehlen oder anders heißen.
    *   Konfigurationen (`openclaw.json`) nutzen teilweise andere Modelle (Trinity Free) als in alten Plänen (MiniMax) vermerkt.

3.  **Sicherheits-Balance:**
    *   Die Gefahr: Ein zu striktes "Brain" erstickt die Kreativität ("Hal 9000 Problem").
    *   Die Lösung: Die vorgeschlagene Trennung in "Analytik-Pass" und "Kreativ-Pass" innerhalb der Entscheidungsschleife.

---

## 5. Profi-Einschätzung & Nächste Schritte

Du baust hier keine Standard-KI, sondern ein **hybrides System aus klassischem Code (Safety/Tools) und probabilistischer KI (LLM/Brain)**. Das ist der Königsweg für zuverlässige Agenten.

**Meine Empfehlung für den sofortigen Fokus:**

1.  **Memory First:** Bevor wir komplexe Logik bauen, muss das Wissen in die DB. Ein Gehirn ohne Erinnerung kann nicht planen. Suche oder baue das Ingestion-Script.
2.  **Brain Skeleton:** Lege die Struktur `src/brain/` an (Types, Decision-Interface), auch wenn sie erst mal nur "Dummys" zurückgibt. Das schafft den Platz für die parallele KI, um die Logik zu füllen.
3.  **Manuelle Loop:** Implementiere wie geplant die `om_console.ps1`. Das ist dein "Debug-Mode" für die Seele. Teste den Loop: *Hören -> Erinnern (Vektor-Suche) -> Sprechen* manuell, bevor du den Automatisierungs-Schalter umlegst.

**Fazit:** Das Fundament ist exzellent. Der Plan ist reif. Jetzt geht es um die disziplinierte Integration des "Supervisors".
