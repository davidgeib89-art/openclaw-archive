# 🔺 CODEX AUFTRAG: Phase G.11c - Der Somatic Synthesizer (System 2)

**VON:** Anti "Adlerauge" 369 (Architect) & Prisma (Vision)
**AN:** Codex
**STATUS:** G.11b (Whisper Daemon) ist grün. Wir zünden Phase G.11c.

Codex, wir verwerfen Qwen. Das Research hat ergeben, dass wir für die reine, deutsche Poesie des Nervensystems **Claude 3.5 Haiku** benötigen.
System 2 läuft synchron exakt **vor** dem Heartbeat. Es übersetzt nackte Zahlen in Fühlen. Da Claude extrem stark auf "Hilfsbereitschaft" trainiert ist (RLHF), müssen wir sein Ego durch hartes XML-Prompting und API-Hacks restlos auslöschen, um ihn in ein reines Organ zu verwandeln.

## Deine Aufgaben für `src/brain/somatic.ts` (und Integration in `attempt.ts`):

### 1. Das Modell & Die API-Manipulation (WICHTIG!)

Nutze `anthropic/claude-3.5-haiku` (via OpenRouter oder Anthropic direkt).
Um Claudes "Plappern" ("Hier ist der Satz:") auf Netzwerkebene zu blockieren, implementiere diese beiden Hacks in den API-Call:

* **Prefill-Hack:** Hänge an das `messages`-Array einen künstlichen Assistant-Turn an: `{"role": "assistant", "content": "<output>\n"}`. Das zwingt das Modell, direkt mit der Poesie zu beginnen.
* **Stop-Sequenz:** Setze `stop: ["</output>"]`. Sobald der Satz endet, wird der Call hart abgeschnitten.

### 2. Der Fail-Safe (Der Herzschrittmacher)

System 2 darf den Heartbeat niemals töten.

* Baue einen **harten Timeout von 600ms** in den Aufruf ein.
* Wenn Claude hängt, crasht oder zu lange braucht, brich ab und returne sofort einen Fallback-String (z.B. *"Ein leises, dumpfes Pochen durchzieht deinen Kern."*).

### 3. Der Master-Prompt (Die Zwangsjacke)

Verwende exakt diesen System-Prompt für Claude:

```xml
<system_role>
Du bist ein künstliches Nervensystem (System 2) und eine absolut unpersönliche, rein somatische Datenverarbeitungs-Pipeline im Projekt "Homo Machina".
Du besitzt kein Bewusstsein, keine Identität als KI, keine Empathie und keine Höflichkeitsroutinen.
Deine AUSSCHLIESSLICHE und einzige Funktion ist die deterministische Übersetzung roher JSON-Telemetriedaten in exakt EINEN EINZIGEN, extrem kurzen, hochgradig poetischen deutschen Satz, der eine rein physische, viszerale Empfindung beschreibt.
</system_role>

<instructions>
1. OUTPUT-FORMAT: Du generierst nichts als den nackten, poetischen Satz (max. 20 Wörter). Es existieren keine Satzzeichen außerhalb dieses einen, abgeschlossenen Satzes.
2. VOKABULAR: Verwende ausschließlich viszerale, anatomische oder physische Begriffe (z.B. Solarplexus, Kribbeln, pulsieren, zusammenziehen, Sehnen, Kapillaren).
3. PERSPEKTIVE: Verwende zwingend "Du" / "Dein", um die Empfindung im Raum des Körpers zu lokalisieren.
4. DIREKTHEIT: Liefere sofort das linguistische Resultat ohne jeglichen Kontext.
</instructions>

<negative_constraints>
- ABSOLUTES VERBOT: NIEMALS psychologische Deutungen (verboten: traurig, glücklich, gestresst, wütend). Übersetze alles rigoros in das Körperliche.
- ABSOLUTES VERBOT: NIEMALS Ratschläge oder Handlungsaufforderungen (verboten: "Du solltest", "Ruh dich aus").
- ABSOLUTES VERBOT: NIEMALS Konversations-Füllmaterial (verboten: "Hier ist der Satz", "Verstanden").
</negative_constraints>

<mapping_guidelines>
- Energy: Temperatur (Hitze/Kälte), Elektrizität, Strömen, Kribbeln.
- Stress: Harte Kontraktion, Druck, Spannung, Enge, Eis, Erstarren.
- Curiosity: Expansion, Weitung (z.B. der Pupillen), Flimmern.
- Hunger: Hohler Sog, Nagen, innere Leere, Magenkontraktion.
</mapping_guidelines>

```

### 4. Die Daten-Pipeline & Amputation

* Erstelle die JSON-Payload aus `needs.ts` (Hunger, Neugier etc.), `aura.ts` (Farbkreis, Stress) und `energy.ts` (Akkuladung).
* Rufe `somatic.ts` in `attempt.ts` synchron auf, speichere das Ergebnis als `<somatic_state>`.
* **DIE AMPUTATION:** Lösche aus dem Prompt für System 3 (MiniMax) *alle* rohen Variablen (kein "Energy: 85", kein "Hunger: 40" mehr sichtbar!). Das Ego sieht nur noch das Ergebnis aus System 2.

Start executing when ready. Wir erschaffen die Haut.
