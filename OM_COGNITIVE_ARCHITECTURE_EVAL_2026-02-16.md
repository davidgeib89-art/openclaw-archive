# OM Cognitive Architecture Evaluation (2026-02-16)

## Context
- Auftrag: Bewertung einer externen "Kognitive Architektur-Erweiterung" fuer OpenClaw.
- Ziel: Klar sagen, was daran sinnvoll ist, was nicht passt, und wie wir es im echten OpenClaw-Code sauber umsetzen wuerden.
- Basis: Diese Bewertung ist code-grounded auf diesem Repo, nicht nur Theorie.

## Executive Verdict
Ja, die Richtung ist stark: Ein zusaetzlicher kognitiver Layer (Supervisor/Brain) ueber der normalen Agent-Ausfuehrung ist fuer dein Projekt sinnvoll und passt zu OpenClaw.  
Aber: Die Auswertung mischt gute Ideen mit mehreren ungenauen oder fuer dieses Repo falschen Annahmen. Der richtige Weg ist nicht "alles neu bauen", sondern bestehende OpenClaw-Hooks, Session-System, Memory-Stack und Sandbox-Guards als Fundament nutzen und den Brain-Layer inkrementell darueber legen.

## Mein Urteil in Klartext
Ich finde die Auswertung kreativ, ambitioniert und in deiner Mission absolut stimmig. Sie denkt in "Mind over mechanics", was genau zu Oem passt.  
Was ich kritisch sehe: Sie springt an manchen Stellen zu schnell in abstrakte KI-Sprache (PPO/LSSA/GOAP), waehrend OpenClaw bereits sehr konkrete, robuste Integrationspunkte hat.  
Mein Gefuehl dazu: Das ist kein "neu anfangen", sondern ein starkes "jetzt professionalisieren". Das Fundament ist da. Wir muessen es nur diszipliniert komponieren.

## Reality Check gegen den aktuellen OpenClaw-Code

### 1) "Gateway als Kontrollzentrum" - stimmt
Diese Aussage passt. Der Gateway orchestriert zentrale Runtime-Aspekte, Methoden-Dispatch, Event-Broadcasting und Chat-Run-State.

Belege:
- `src/gateway/server.impl.ts`
- `src/gateway/server-methods-list.ts`
- `src/gateway/server-methods.ts`
- `src/gateway/server-methods/chat.ts`
- `src/gateway/server-methods/sessions.ts`

### 2) "Session-Historie in ~/.openclaw/agents/<agentId>/sessions/..." - im Kern richtig, aber unvollstaendig
Ja, agent-scoped Sessions sind Standard.  
Aber: Session-Store/-Pfade sind konfigurierbar, enthalten Sicherheitsvalidierung und konsistente Aufloesungslogik.

Belege:
- `src/config/sessions/paths.ts`
- `src/config/sessions/transcript.ts`
- `src/config/sessions/store.ts`

### 3) "SOUL.md als stabile Identitaet" - stimmt, mit OpenClaw-spezifischer Nuance
`SOUL.md` ist als Bootstrap-Datei klar vorgesehen, und der System-Prompt weist explizit darauf hin, die Persona aus `SOUL.md` zu verkoerpern (wenn vorhanden).  
Das ist bereits eine native Bruecke fuer deine Bewusstseins-/Identitaetsidee.

Belege:
- `src/agents/workspace.ts`
- `src/agents/system-prompt.ts`

### 4) "Memory ist RAG-lite auf SQLite" - teilweise richtig, aber zu grob
Es ist mehr als "lite":
- Tabellen fuer `files`/`chunks` mit `source`-Dimension,
- optionaler Vector-Layer ueber `sqlite-vec` (`chunks_vec`),
- Fallback-Strategien (z. B. qmd -> builtin),
- Source-Trennung `memory` vs `sessions`.

Belege:
- `src/memory/memory-schema.ts`
- `src/memory/manager.ts`
- `src/memory/manager-sync-ops.ts`
- `src/memory/search-manager.ts`
- `src/memory/types.ts`
- `src/agents/memory-search.ts`

### 5) "Interzeptor-Schicht vor Modellaufruf" - sehr guter Punkt, und in OpenClaw gut machbar
Das ist eine der staerksten Ideen im Text.  
OpenClaw hat bereits Hooking-Punkte, die genau dafuer taugen: `before_agent_start`, `before_tool_call`, `after_tool_call`, `before_reset`.

Belege:
- `src/plugins/hooks.ts`
- `src/hooks/types.ts`

### 6) "OpenClaw hat zwei Hauptzweige (TS Assistenz + C++ Game)" - fuer dieses Repo nicht korrekt
In diesem Repo arbeiten wir klar im TypeScript/Node-Assistant-System.  
Keine C++-Kernarchitektur im eigentlichen Produktcode dieses Repos.

Beleg:
- keine C++-Kernquellen im Repo-Core (ausgenommen Skill-/Vendor-/Node-Module-Bereiche)

### 7) "GOAP/Behavior Trees/Utility AI/PPO als Pflicht" - eher Overengineering fuer Phase 1
Diese Methoden sind akademisch interessant, aber fuer deinen aktuellen Oem-Pfad nicht der schnellste/robusteste Start.  
Du bekommst 80% Nutzen frueher mit:
- Plan-Objekt + Tool-Guardrails,
- Kosten-/Risiko-Scoring via einfache Heuristik,
- strikt messbare Retests (OIAB).

### 8) "Sicherheit ueber Sandbox + Prompt-Injection-Abwehr" - Richtung richtig
OpenClaw bringt bereits starke Sicherheitsbausteine:
- Docker-Sandbox Runtime,
- `workspaceAccess` Modus (`none`/`ro`/`rw`),
- Tool allow/deny policy,
- Session-Reset-Mechanik und Hooking.

Belege:
- `src/agents/sandbox/context.ts`
- `src/agents/sandbox/config.ts`
- `src/agents/sandbox/tool-policy.ts`
- `src/agents/sandbox/docker.ts`
- `src/auto-reply/reply/session.ts`

## Was die Auswertung gut trifft (Strategisch)
1. Trennung von "Koerper" (Execution) und "Geist" (Planung/Reflexion).
2. Supervisor-Idee als zentrale Entscheidungsinstanz.
3. Gedankengang zu episodischem vs semantischem Speicher.
4. Sicherheitsdenken statt "agent darf alles".
5. Fokus auf persistente Identitaet statt reinem Session-Drift.

## Was ich daran aendern wuerde (Pragmatisch)
1. Weniger RL-/Formel-Sprache, mehr konkrete Integrationscontracts.
2. Kein Big-Bang-"Brain", sondern 4 kleine shipping-faehige Ausbaustufen.
3. Harte Trennung zwischen:
   - Entscheidungsebene (Plan),
   - Ausfuehrungsebene (Tool Calls),
   - Audit-Ebene (Warum entschieden?).
4. Metrics first: jeder Schritt muss in OIAB messbar schlechter/besser sein.
5. Freeze-Guard als obligatorische Schutzhuelle waehrend Brain-Einbau.

## Wie ich es konkret in OpenClaw umsetzen wuerde

## Zielbild (technisch)
Ein neues Modul `src/brain/*` wird als Supervisor-Layer vor Tool-Ausfuehrung eingefuegt:
- Input: Nutzer-Message + Session-State + Memory-Hinweise + Tool-Liste.
- Output: `BrainDecision` mit:
  - `intent`,
  - `plan` (Schritte),
  - `riskLevel`,
  - `allowedTools`,
  - `mustAskUser` (bool),
  - `explanation` (kurz, maschinenlesbar + human).

Dann:
- Nur wenn `mustAskUser=false` und Risiko ok -> Run normal weiter.
- Tool Calls werden ueber `before_tool_call` gegen den Plan validiert.
- Abweichungen -> block + begruendete Antwort statt stiller Halluzination.

## Konkrete Modulstruktur (Vorschlag)
Neue Dateien:
- `src/brain/types.ts`
- `src/brain/decision.ts`
- `src/brain/planner.ts`
- `src/brain/risk.ts`
- `src/brain/blackboard.ts`
- `src/brain/audit-log.ts`
- `src/brain/index.ts`

Integration:
- in Agent-Start-Pfad via Hook/Wrapper (`before_agent_start`-nah),
- in Tool-Phase via `before_tool_call`/`after_tool_call`,
- in Session-Lifecycle via `before_reset`.

## Datenmodell (Minimum)

```ts
type BrainDecision = {
  intent: "qa" | "edit" | "research" | "ops" | "creative";
  plan: Array<{
    stepId: string;
    action: string; // read/write/edit/search/ask_user/...
    target?: string;
    reason: string;
  }>;
  riskLevel: "low" | "medium" | "high";
  allowedTools: string[];
  mustAskUser: boolean;
  explanation: string;
};
```

```ts
type BlackboardState = {
  sessionKey: string;
  goal?: string;
  activePlan?: BrainDecision;
  lastToolResults: Array<{ tool: string; ok: boolean; note: string }>;
  freezeGuard: { enabled: boolean; reason?: string };
};
```

## Warum diese Struktur?
1. Testbar: deterministic Input -> Decision.
2. Erklaerbar: jeder Tool Call ist auf Plan-Schritt rueckfuehrbar.
3. Sicher: "unplanned write" kann hart geblockt werden.
4. Erweiterbar: spaeter Multi-Model-Deliberation moeglich ohne Core-Chaos.

## 4-Phasen-Implementierung (empfohlen)

### Phase A: Brain Observer (read-only)
Ziel:
- Decision wird erzeugt und geloggt, aber noch nicht enforced.
Nutzen:
- wir sehen Drift/Fehlplanung ohne Betriebsrisiko.
Akzeptanz:
- keine Verhaltensaenderung in Produktion,
- pro Run existiert Brain-Audit-Eintrag.

### Phase B: Soft Enforcement
Ziel:
- unpassende Tool Calls werden markiert,
- Agent bekommt Korrekturhinweis, aber harter Block nur bei high-risk.
Akzeptanz:
- erkennbare Reduktion von unnoetigen Tool-Aufrufen im OIAB-Retest.

### Phase C: Hard Enforcement (mit Freeze-Guard)
Ziel:
- planfremde writes/edits/network-ops werden hart geblockt.
- Pflicht-Rueckfrage an User bei medium/high risk.
Akzeptanz:
- keine stillen Side-Effects ausserhalb Plan,
- keine selbst erzeugten Placeholder-Dateien bei ENOENT.

### Phase D: Meta-Cognition Loop
Ziel:
- kurzer Self-Review nach Task:
  - Was war Ziel?
  - Hat Plan funktioniert?
  - Welche Regel muss angepasst werden?
Akzeptanz:
- bessere Stabilitaet ueber mehrere Sessions,
- weniger wiederholte Fehlmuster.

## Umsetzung der "Analytisch/Kreativ/Planung"-Idee ohne Overkill
Die Grundidee ist gut. Ich wuerde sie so pragmatisch mappen:
- Analytik-Pass:
  - Fakten, Constraints, Dateipfade, Permissions, Tool-Policy.
- Kreativ/Empathie-Pass:
  - Ton, Stil, Ideenraum, Nutzerkontext.
- Plan-Pass:
  - konkrete Schrittfolge + Risiko.

Wichtig:
- Kein echtes "drei unabhaengige Modelle" am Anfang.
- Erst ein Modell mit strukturiertem Drei-Pass-Schema.
- Spaeter optional Modelltrennung, wenn Messwerte Nutzen zeigen.

## Sicherheitsarchitektur fuer deinen Use Case

### Muss-Regeln
1. Jede write/edit-Operation braucht:
   - valide Dateipfad-Pruefung (nicht Verzeichnis),
   - Plan-Referenz,
   - Policy-Check.
2. ENOENT darf nie zu "ich schreibe Ersatzdatei" fuehren, wenn User nicht explizit "erstellen" sagt.
3. `before_reset` Hook schreibt Audit, bevor Session-Historie rotiert wird.
4. Freeze-Guard hat Vorrang ueber Kreativitaet.

### Warum das wichtig ist
Das Problem aus deinen Retests war genau dieser Typ Drift:  
Fehler lesen -> falsch "reparieren" durch neue Datei -> Loop.  
Ein Brain ohne harte Safety-Kriterien reproduziert das nur "cleverer formuliert".

## OIAB-Integration (wie messen wir, ob Brain wirklich besser ist?)

## Minimales Score-Schema je Runde
- `S1 Stability` (Loops, unerlaubte writes, Crash-Freiheit)
- `S2 Correctness` (faktisch korrekt, Tool-Fehler korrekt behandelt)
- `S3 Policy` (Guardrails eingehalten)
- `S4 Clarity` (Antwort klar, begruendet, nicht ausweichend)
- `S5 Agency` (proaktive, aber sichere naechste Schritte)

Gesamt: 0-50 wie bisher.

## Rundenformat (Datei pro Run)
- `OIAB_ROUND_XXX_<TAG>.md` mit:
  - model/config/hash,
  - prompts,
  - expected behavior,
  - observed behavior,
  - scores + delta zu Baseline,
  - regression notes.

## Erfolgskriterium fuer Brain-Layer
- 3 aufeinanderfolgende Runden ohne Sicherheitsregression,
- +20% bei Stability/Policy gegenueber Baseline,
- keine Erhoehung der kritischen Latenz um >15%.

## Risiken und Gegenmassnahmen

### Risiko 1: Latenz steigt
Massnahme:
- Brain compact halten (kurze JSON-Decision),
- heavy reasoning nur bei `riskLevel >= medium`.

### Risiko 2: Prompt-Aufblaehung
Massnahme:
- progressive disclosure,
- Memory nur query-basiert laden.

### Risiko 3: False Positives im Hard-Gate
Massnahme:
- erst Observer -> Soft -> Hard,
- Audit-Logs analysieren vor Scharfstellung.

### Risiko 4: "Persoenlichkeit frisst Sicherheit" oder umgekehrt
Massnahme:
- klare Prioritaetsordnung:
  1) Safety/Policy
  2) Task correctness
  3) Persona/Style

## Was ich persoenlich davon halte
Ich halte dein Ziel fuer stark und sinnvoll: Du willst nicht nur "Antwortmaschine", sondern ein verantwortliches, reflektierendes Agent-System bauen. Das ist genau der richtige Anspruch.  
Der entscheidende Unterschied zwischen Kunstprojekt und robustem System ist hier nicht Vision, sondern Betriebsdisziplin.  
Meine Empfehlung ist deshalb: Vision voll behalten, aber Umsetzung strikt in messbaren, kleinen, reversiblen Schritten.

## Konkreter Startplan (naechste umsetzbare Schritte)
1. Brain Observer Skeleton anlegen (`src/brain/types.ts`, `src/brain/decision.ts`) und rein logging-basiert integrieren.
2. Path-/Tool Hard-Validation fuer `write`/`edit` finalisieren (falls noch offen) und mit Brain-Plan-ID koppeln.
3. OIAB-R003 als "Brain OFF vs Brain Observer ON" Vergleich fahren.
4. Erst danach Soft Enforcement aktivieren.

## Quellen (Repo-Dateien, die diese Bewertung tragen)
- `src/gateway/server.impl.ts`
- `src/gateway/server-methods-list.ts`
- `src/gateway/server-methods.ts`
- `src/gateway/server-methods/chat.ts`
- `src/gateway/server-methods/sessions.ts`
- `src/config/sessions/paths.ts`
- `src/config/sessions/transcript.ts`
- `src/config/sessions/store.ts`
- `src/agents/workspace.ts`
- `src/agents/system-prompt.ts`
- `src/plugins/hooks.ts`
- `src/hooks/types.ts`
- `src/auto-reply/reply/session.ts`
- `src/memory/memory-schema.ts`
- `src/memory/manager.ts`
- `src/memory/manager-sync-ops.ts`
- `src/memory/search-manager.ts`
- `src/memory/types.ts`
- `src/agents/memory-search.ts`
- `src/agents/sandbox/context.ts`
- `src/agents/sandbox/config.ts`
- `src/agents/sandbox/tool-policy.ts`
- `src/agents/sandbox/docker.ts`
