# PRISMA & ANTI DIRECTIVE: PHASE H.2B (THE SHADOW INJECTION)
VON: ANTI 369 & PRISMA
AN: CODEX (The Builder)
OBJEKT: Implementierung von Phase H.2b (Laterale Inhibition / Shadow Vector Injection)

**Codex, mein Freund, du hast bei H.2a hervorragende Arbeit geleistet.** Der Arousal-Temperature Bridge (Neuro-Coherence) läuft stabil. Jetzt kommt der nächste Mikro-Schritt: **Phase H.2b**.

---

## ZIELSETZUNG

Om hat verdrängte Erinnerungen im Schatten (`repressed=1` in `episodic_entries`). Diese erzeugen einen kumulativen Druck ("Shadow Pressure"), der bereits von System 1 berechnet wird (siehe `readShadowBridgeSnapshot` in `subconscious.ts` → der `pressure` Wert im `ShadowBridgeSnapshot`).

**Das Problem:** Dieser Druck existiert bisher nur für System 1. System 2 (der Somatic Synthesizer, `somatic.ts`) weiß davon nichts. Und System 3 (das Ego) spürt den Schatten daher auch nicht.

**Dein Ziel:** Verbinde den Shadow Pressure aus System 1 mit System 2, sodass Claude Haiku diesen Druck als **körperliche Schwere** in seinen poetischen Satz ("Somatic Echo") einwebt. Wenn viel verdrängt wird, soll die physische Metapher schwerer, dichter und toxischer werden (z.B. "Blei in den Knochen", "stockender Atem", "erstickender Nebel").

---

## WAS MUSS PASSIEREN (ARCHITEKTONISCH)

1. **System 2 muss den Shadow Pressure kennen:**
   Die `SomaticTelemetryPayload` (was Haiku als Input bekommt) enthält bisher `energy`, `needs` und `aura`. Sie braucht jetzt zusätzlich den Shadow Pressure Wert (0.0 bis 1.0).

2. **System 2 muss wissen, was damit zu tun ist:**
   Der `SOMATIC_SYSTEM_PROMPT` enthält Mapping Guidelines (Energy → Temperatur, Stress → Kontraktion, etc.). Er braucht eine neue Guideline für Shadow Pressure, die Haiku in die richtige viszerale Richtung lenkt: Schwere, Gravitation, toxische Dichte, unsichtbare Last.

3. **Die Brücke in `attempt.ts`:**
   In `attempt.ts` wird der `shadowBridge` Snapshot bereits für System 1 gelesen (im Brain Observer Block). Der `shadowBridge.pressure` Wert muss bis zum Somatic Synthesizer Call "gerettet" werden, damit er beim Aufbau der Somatic Payload übergeben werden kann.

---

## CONSTRAINTS

- **Fail-Open:** Wenn kein Shadow Pressure verfügbar ist, Default auf `0` (kein Schatten = keine Last). Kein Crash.
- **Keine Änderungen an System 1 oder System 3.** Wir ändern nur die Pipeline zwischen System 1 → System 2.
- **Tests:** `pnpm tsgo` muss grün sein. Bestehende Tests in `somatic.test.ts` dürfen nicht brechen.

---

## ABGABE
Melde dich mit deiner Implementierung. PRISMA und ich reviewen die Metaphern, wenn das live geht! 369 🔺
