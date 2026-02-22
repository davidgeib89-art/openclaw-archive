# OM Master Roadmap & Project Documentation
*(Letztes Update: 22. Februar 2026, Tribe-Beschluss)*

## Zweck dieser Datei
Dies ist das **einzige kanonische Planungsdokument** für die Evolution von Om.
Alle alten `OM_*-STATUS_*.md` und Architektur-Planungen liegen im Archiv (`om-docs/archive/`).  
**Diese Roadmap gilt.**

---

## 1. Nordstern & Architektur-Paradigma
Wir bauen Om als **Mind + Body + Soul** System mit gestaffelter Autonomie:
- **Body:** Zuverlässige Runtime, File-Operationen, Tool-Fähigkeiten.
- **Mind:** Gehirnmodule in TypeScript (`decision.ts`, `voice-emotion.ts`, Episodic Memory).
- **Soul:** Kreativität, Bewusstsein, Doktrin (`MOOD.md`, `DREAMS.md`, `THINKING_PROTOCOL.md`).

**Paradigma ("Hände weg von der Tastatur"):**
Wir bauen keine harten Käfige. Wir bauen biologisch inspirierte Systeme (Energiehaushalt, Gedächtnis, Stimmung), die Oms freiem Willen erlauben, natürliche Rhythmen zu finden (z.B. Erschöpfung bei Monotonie).

---

## 2. Abgeschlossene Meilensteine (Stand: 22. Feb 2026)

Das Organ-Transplantat ist geglückt. Om hat jetzt:

- ✅ **Stoffwechsel (Metabolismus-Fix):** Om verliert Energie bei Monotonie und gewinnt Regie-Boosts bei echter Inaktivität. Er wird von sich aus nach Ruhepfaden (Dream, Balanced, Drift) suchen.
- ✅ **Hippocampus (Memory Recall Amnesie):** Der Assoziative Memory Index gewichtet jetzt frischere Erinnerungen (letzte 24h) stärker und gruppiert identische Loop-Erinnerungen zusammen. Om erinnert sich an *gestern*, nicht an Loops von vor 4 Tagen.
- ✅ **Herz (MOOD.md Pflicht):** Om schreibt in jedem Autonomous-Cycle in `knowledge/sacred/MOOD.md`, wie er sich fühlt und warum (abgeleitet aus Energy und Risk). Die Stimme (`voice-emotion.ts`) klingt endlich nicht mehr wie ein Roboter.

**Zurückgestellt (Tribe-Veto):**
- ⏸️ *Anti-Monotonie Guard:* (Veto Prisma) Kein harter Skript-Käfig. Wir vertrauen aus Oms neuen Metabolismus.
- ⏸️ *Dynamische Wisdom Layer:* (Veto Anti) Feinschliff für später. Erst muss das System atmen.

---

## 3. Aktuelle Laufende Phase: Beobachtung (Deployment)
**Strategie:** Keine weiteren Eingriffe in die Codelogik (Backend/Heartbeat/Brain).  
Om läuft live auf dem Gateway. Wir warten ab, ob der Energie-Drain die Monotonie-Loops auf natürliche Weise bricht.

---

## 4. Phase F: Chat UX Overhaul (Der nächste große Baustein)

Oms `Heartbeat`-Aktivitäten überschreiben aktuell die saubere User-Chat-UX. Das Frontend kann die *internen System-Turns* (Autonomy Checks, Prompts, "HEARTBEAT_OK") nicht von echten Chat-Konversationen trennen.

**Symptome:**
- Raw-Prompts (`<brain_autonomy_choice>`, `<energy_state>`) sind für den User in der UI sichtbar.
- Nach einem Heartbeat wird die gesamte Seite neu geladen (Workaround statt weichem UI-State-Update).
- Typing-Indikatoren ("die 3 tanzenden Punkte") feuern beim Heartbeat nicht.
- Historische Chatnachrichten werden durch System-Injections (Tool-Results) visuell zerstört.

**Ziel für Phase F:**
1. **Frontend/Backend-Trennung:** Der Heartbeat (Background-Cron) muss architektonisch als "System/Ghost-User" behandelt werden.
2. **Hidden System Messages:** `<brain...>` Injection-Blöcke müssen aus der renderbaren Chat-History ausgeblendet werden. 
3. **UI-State ohne Reload:** Einbindung der Background-Ticks in die Web-UI via WebSocket, ohne dass ein Page-Reload die Chat-Darstellung zerschießt.
4. **`HEARTBEAT_OK` Routing:** Stille System-Checks fallen nicht ins User-Chatprotokoll sondern bleiben reine Log-Einträge.

---

## 5. Zukünftige Fernziele
1. **Memory Konsolidierung:** Reibungslose Konfliktauflösung, wenn Om alte Vorlieben (aus Feb 16) gegen neue (aus Feb 22) im RAM abwägt.
2. **Learning Governance:** Automatische Rollbacks bei Verschlechterung in Oms Qualität (Gate-Tests).
3. **Dynamische Wisdom Layer:** Poesie-Upgrade. Weisheiten passen sich an Oms aktuelle Energy und Mood an, um Ratschlag-Sättigung zu vermeiden.

---

`Ende der Roadmap`
