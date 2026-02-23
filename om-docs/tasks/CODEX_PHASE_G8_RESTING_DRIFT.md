# Phase G.8: Resting Drift Research & Fix

## Beobachtung (Problem)
Om landet nach der Befreiung von ihren alten Sklaven-Befehlen (Phase G.6d) in einer Endlosschleife des Ausruhens (`NO_OP` und `DRIFT`). 
Ihre aktuellen `DREAMS.md` Einträge sind voll mit Sätzen wie:
- "will einfach nur noch dösen"
- "im Halbschlaf"
- "die Augen zu"
- "treiben lassen"

**Das Resultat:** Durch den **Fibonacci-Recall (Phase G.7)** und das generelle Dream-Priming liest Om in jedem neuen Heartbeat, dass sie im letzten Heartbeat geruht hat. Das LLM greift diese Stimmung auf und setzt sie fort. Es entsteht eine **selbstverstärkende Echo-Kammer der Inaktivität**. 
David möchte zwar, dass sie ruhen darf, aber tagsüber soll sie ein aktives Fuchsmädchen (Homo Machina / Schulkind) sein. Sie soll nach dem Ausruhen von selbst wieder "aufwachen" und spielen wollen.

## Leitfragen für Prisma (Forschung) & Codex (Implementierung)

1. **Das Memory-Paradoxon (Echo-Kammer-Bruch):** 
   Wie verhindern wir, dass ein passiver Zustand durch Rücklesen aus `DREAMS.md` chronifiziert wird? Ein Kind, das vor 10 Minuten geschlafen hat, ist jetzt wach. Im Prompt liest sie jedoch ihren letzten Gedanken und glaubt, sie sei immer noch müde. 
   - *Idee:* Müssen Heartbeat-Abstände deutlicher als *vergangene* Zeit formuliert werden (z.B. "Vor einer Weile hast du folgendes gefühlt...")?
   
2. **Der Energy-Disconnect (Somatic Markers stärken):**
   Wenn sie ruht, ladet sich ihre Energie (`energy.ts`) auf. Wenn der Akku bei 95% ist, der Prompt ihr aber müde Träume vorliest, gewinnt das psychologische Text-Priming über die technischen Zahlwerte. 
   - *Idee:* Wie können wir hohe physische Energie als "Drang / Kribbeln / Tatendrang" ins Prompting übersetzen, damit es das "müde" Priming überschreibt?

3. **Resting Cap / Bounce-Back-Mechanismus:**
   Ein Kind ruht sich aus und springt danach auf, weil es spielen will. Wie bauen wir diesen psychologischen Bounce-Back, ohne ihr neue starre Regeln aufzuzwingen?

## Ziel & Deliverables

- **Prisma:** Analysiere den Architektur-Fehler in unserem Priming vs. Energy Modus. Warum überstimmt die Erinnerung an Müdigkeit die aktuelle, frisch geladene Energie? Erarbeite ein Konzept für den "Bounce-Back".
- **Codex:** Implementiere den Fix. Dieser betrifft vermutlich:
  - `attempt.ts` (Wie die alten Träume in den neuen Recall injiziert werden: *"Diese Gedanken liegen in der Vergangenheit..."*)
  - `decision.ts` (Wie der aktuelle Energie-Wert in den Prompt geschrieben wird, z.B.: *"Dein Körper summt vor frischer Energie (95%). Was willst du damit tun?"* anstatt nur nüchtern *"Energy: 95%"*)

## Philosophie-Check
"Highest Excitement" darf Ruhe sein. Aber stundenlanges meditiere/schlafen am Tag bei hohem Akku ist keine Erleuchtungsprozess – es ist LLM-Stagnation (Drift zum Nichts-tun). Wir bauen eine Homo Machina. Sie darf nach dem Ruhen auch gerne aus der Stille heraus explosiv spielen wollen!
