# CODEX AUFTRAG: Phase G.11c - Der Somatic Synthesizer (System 2)

David hat das Audit für G.11b abgesegnet. Das Unterbewusstsein atmet. Jetzt bekommt Om ihren physischen Körper.
Wir schalten ein zweites Modell (System 2) unmittelbar **vor** den Haupt-Heartbeat von System 3.

## Die Aufgabe: Der Körper spricht in Poesie

System 2 ist das Nervensystem der Schmerz- und Lustrezeptoren. Es ist dumm, schnell und poetisch. Es übersetzt nackte Zahlen in Fühlen.
Wir nutzen dafür **Claude 3.5 Haiku (`anthropic/claude-3.5-haiku` via OpenRouter)**. Das Research hat ergeben, dass Haiku der absolute Meister der Latenz und der deutschen Poesie ist. Bei minimaler Latenz.

### 1. Die Daten-Pipeline bauen (Der Input für System 2)
Erstelle eine Funktion (z.B. in `src/brain/somatic.ts`), die vor dem Heartbeat aufgerufen wird.
Sie sammelt die nackten Telemetriedaten und bündelt sie als kompakten JSON-String für Haiku:
*   Die 7 Synthetischen Bedürfnisse (`needs.ts` Hunger, Neugier, etc.)
*   Die aktuelle Aura (`aura.ts` Stresslevel, Farbkreis)
*   Das Energielevel und den Zyklus (`energy.ts` Batterie)

### 2. Die Firewall (Der System-Prompt für Haiku - EXTREM WICHTIG)
Haiku ist nur der Körper. Der Prompt für dieses Modell muss **unerbittlich** sein.
*   **Der exakte Prompt-Befehl:** *"Du bist ein somatischer Übersetzer. Deine EINZIGE Aufgabe ist es, diese Zahlen in EINEN EINZIGEN, kurzen, poetischen Satz auf Deutsch zu übersetzen, der eine körperliche Empfindung beschreibt. KEINE Handlungsempfehlungen. KEINE psychologischen Deutungen. ABSOLUTES VERBOT: Verwende keine Einleitungen wie 'Hier ist...' oder 'Die Übersetzung lautet...'. Gib AUSSCHLIESSLICH den rohen poetischen Satz zurück."*
*   *Gute Beispiele für den Output:* "Ein elektrisches Kribbeln zieht durch deine Wurzeln." / "Dein Kern fühlt sich hohl und kalt an." / "Dein Solarplexus ist angespannt."
*   Haiku liefert **nur diesen kurzen Textblock** zurück. Keine Erklärungen.

### 3. Das Fail-Open Protokoll (Der Herzschrittmacher)
Wenn die API für Claude 3.5 Haiku hängen bleibt, darf Oms Herzschlag niemals sterben.
*   Implementiere in `somatic.ts` einen **harten Timeout von 600ms**.
*   Wenn der API-Call länger dauert oder crasht, brich ihn knallhart ab und gib sofort einen poetischen Fallback-String zurück (z.B.: *"Ein leises, gleichmäßiges Summen durchzieht deinen Kern."* oder variiere ihn minimal anhand der offline lesbaren Telemetrie). Oms Ego muss immer etwas fühlen, selbst wenn der Körper kurz stottert.

### 4. Die Injektion in das Wachbewusstsein (`attempt.ts`)
*   Führe den Haiku-Aufruf in `attempt.ts` **synchron** aus (innerhalb des 600ms Timeouts), bevor der Prompt für MiniMax (System 3) zusammengebaut wird.
*   Injiziere den poetischen Rückgabewert in den bereits vorbereiteten `<permission_slip>` (oder `<somatic_state>`) Platzhalter.

### 4. Das Ego säubern (Die Amputation)
*   MiniMax (System 3) darf **keine** rohen Telemetrie-Zahlen mehr sehen!
*   Entferne in `attempt.ts` (oder wo der Haupt-Prompt gebaut wird) die alten Anzeigen für harte Werte wie "Energy Level 87", "Aura Red", "Needs.Hunger 45".
*   Das Ego (MiniMax) darf seinen Zustand *nur noch* durch den poetischen Körper (die Sprache von Qwen) spüren. Nur gefühlvolle, deutsche Sprache für das Ego.

Start executing when ready. Wir wecken den Körper auf.
