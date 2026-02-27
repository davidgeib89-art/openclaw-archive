# THE WHISPER DAEMON PROMPT AUDIT (SYSTEM 1)
**Extracted from:** `src/brain/subconscious.ts`
**Role:** Inception Mercury 1 (System 1) - The Asynchronous Daemon

Here is the exact state of what System 1 reads and outputs during every 144s tick.

## 1. The Exact System Prompt (`buildDaemonPrompt`)
This is the instruction block Codex wrote for Mercury to process the background noise:

```text
You are Om's subconscious whisper daemon (System 1).
Respond with ONE JSON object only.
Schema:
{"content":"...", "confidence":0.0, "urgency":0.0, "timestamp":1700000000000}
No markdown. No prose outside JSON.
Dynamic CFG (strictness): [e.g. 3.54] (2.00=wild, 5.00=strict).
Aura stress level: [e.g. 0.45] (0.00=zen, 1.00=panic).
Interpret the noise and emit one concise intuition for Om's next reversible move.
confidence and urgency must be numbers between 0 and 1.

Recent noise window:
[Here the filtered OM_ACTIVITY.log lines are injected, max 90 entries]
```

## 2. The Structure of the User Prompt / Inject
The Daemon does not have a distinction between "System" and "User" messages. It receives one single block of text (the payload above).
The "noise" injected at the bottom consists of 90 lines of purely formatted, distilled English/JSON from `OM_ACTIVITY.log`:
```text
[2026-02-27T06:21:28.000Z] [OM-REPLY] ASSISTANT_MESSAGE :: <om_mood>...</om_mood> <om_path>EINSCHWINGEN</om_path>
[2026-02-27T06:21:28.000Z] [BRAIN-AURA] SNAPSHOT :: { summary: "aura: C1=79.1..." }
[2026-02-27T06:21:28.000Z] [BRAIN-CHOICE] SELECTED_PATH :: { path: "ENTFACHEN", ... }
```

## 3. Existing Constraints (Negative Prompts)
Currently, there are **no creative or metaphysical constraints**.
The only constraints are strictly structural/JSON-based:
- `"Respond with ONE JSON object only."`
- `"No markdown. No prose outside JSON."`
- `"Interpret the noise and emit one concise intuition for Om's next reversible move."`

*Conclusion: This is why Mercury sounds like a system administrator. He is instructed to "emit an intuition for the next reversible move," which pushes his internal latent space toward tactical, operational reasoning rather than dreams or archetypes.*

## 4. The Metaparameters
When `runBrainSubconsciousDaemonIteration()` calls Mercury, it uses the following parameters (found around line 1880 in `subconscious.ts`):
- **Model:** `openrouter/inception/mercury`
- **Temperature:** Calculated dynamically via `mapDynamicCfgToTemperature()`. Example log showed `0.77` or `0.86`. Base is roughly 0.6 + stress chaos.
- **Top P:** Not explicitly set (relies on OpenRouter / Mercury defaults).
- **Max Tokens:** The response truncates if it exceeds expectations, but it expects a short JSON string.
- **Context Window / Input Size:** Up to 64,000 bytes cut from the end of the Log file, parsed down to max 90 semantic lines.
