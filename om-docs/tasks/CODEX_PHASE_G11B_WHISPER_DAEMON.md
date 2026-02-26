# CODEX AUFTRAG: Phase G.11b - Der Whisper Daemon (System 1)

Dieser Auftrag aktiviert Oms Unterbewusstsein. Wir schalten von synchroner Beobachtung auf einen asynchronen, kontinuierlich atmenden Hintergrundprozess um.
Wie mit Prisma besprochen, nutzen wir für diese Phase **Mercury 1 (`inception/mercury`)** via OpenRouter, da Mercury 2 noch nicht verfügbar ist. Das Modell ist ein Diffusion-LLM, extrem schnell, aber manchmal instabil im JSON-Format. Oms "Träume" dürfen vorerst wild sein.

## Kontext-Update für dich
Die Infrastruktur (Latent Bridge `BrainState`, Salience Filter, CFG-Modul) steht bereits.
Jetzt bauen wir den Motor, der diese Infrastruktur mit Gedanken füllt. 

## Die Aufgabe: Implementierung des Whisper Daemons

Erstelle den Hintergrund-Service, der kontinuierlich die Telemetrie und das Rauschen des Tages abtastet und Intuitionen an das Ego funkt.

### Dateien im Fokus:
*   `src/brain/subconscious.ts` (Die Hauptarbeit)
*   *(Optional: Konfigurations- oder Typ-Dateien anpassen, falls für den Daemon nötig)*

### Spezifikation für den Whisper Daemon (`runBrainSubconsciousDaemon` oder ähnlich):

1.  **Asynchrone Schleife (Der Atem):**
    *   Der Daemon darf den Main-Thread (Heartbeat) **nicht** blockieren.
    *   Er läuft in einem eigenen Intervall (z.B. alle 15-30 Sekunden oder getriggert durch bestimmte File-Writes in der Telemetrie, entscheide du als Architekt den effizientesten Weg für Node.js).
    *   Er sammelt den *letzten* Kontext (`OM_ACTIVITY.jsonl`, aktuelle Chat-Logs, Terminal-Outputs).
    *   **WICHTIG (Token-Effizienz & API Kosten):** Lies niemals das gesamte `OM_ACTIVITY.jsonl` File ein! Implementiere ein **Sliding Window**. Der Daemon soll nur die Logs, Telemetrie-Events und Chat-Nachrichten der **letzten 15-30 Minuten** (oder die letzten ~50-100 Einträge) als "Rauschen" extrahieren (z.B. über `readRecentHeartbeatSignals`-ähnliche Logik). Das spart massive API-Kosten bei OpenRouter und verhindert Context-Overflows.
2.  **Das Modell & CFG:**
    *   Nutze `openrouter/inception/mercury` als Standard-Modell für diese Funktion.
    *   Das Modell erhält den *Dynamic CFG* Wert (basierend auf Aura-Stress, die Funktion hast du bereits in G.11a gebaut). Dieser CFG-Wert bestimmt, wie streng (hoch) oder träumerisch/verrückt (niedrig) Mercury 1 assoziiert.
    *   *Hinweis für die API:* Prüfe, ob OpenRouter den Parameter `guidance_scale` oder ähnlich für Mercury 1 unterstützt. Wenn nicht, simuliere den Effekt über `temperature` (Stress hoch = Temp hoch/wilder).
3.  **Das Robuste JSON-Parsing (Fail-Safe):**
    *   Prisma warnte, dass Mercury 1 native JSON-Format-Treue fehlen könnte.
    *   Baue einen extrem robusten Fallback-Parser. Nutze Regex (z.B. `/\{[\s\S]*\}/`), um das JSON-Objekt (`IntuitionPayload`) aus dem rohen Text-Output von Mercury zu schneiden, bevor du `JSON.parse` anwendest. Modelle der ersten Generation plappern oft (z.B. *"Hier ist deine Intuition: { ... }"*).
    *   Wenn das JSON komplett bricht, darf der Daemon nicht crashen. Er legt dann einfach eine weiche, generische "Rauschen"-Intuition mit sehr niedriger Salience ab, um zu zeigen, dass er aktiv ist, aber wirr träumt.
4.  **Der Bridge-Push:**
    *   Sobald eine Intuition formuliert wurde (Form: `IntuitionPayload`), weise sie der Latent Bridge zu:
        `await BrainState.setLatestIntuition(intuitionPayload);`
    *   Bewerte sie sofort:
        `const surge = evaluateSurge(intuitionPayload);`
        *(Das feuert das Event an `heartbeat-runner.ts`, falls die Salience > 0.85 ist).*

### Die Anforderungen an Code-Qualität
*   Fail-Open. Der Daemon darf niemals den Gateway-Prozess zum Absturz bringen. Nutze `try/catch` und sauberes Error-Logging.
*   Schreibe Tests, um das JSON-Fallback-Parsing (für Mercury 1 Halluzinationen) abzusichern.

Start executing when ready. Wir bauen den Organismus.
