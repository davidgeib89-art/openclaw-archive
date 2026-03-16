# OIAB Round [ID]

Date: [YYYY-MM-DD HH:mm]
Model: `openrouter/arcee-ai/trinity-large-preview:free`
Channel: `[WebGUI|WhatsApp]`
Change under test: `[single variable only]`
Prompt set: `OIAB_PROMPT_SET_V1.md`
Freeze guard: `OM_OIAB_FREEZE_GUARD_2026-02-15.ps1`

## Freeze Conditions

- [ ] Same channel for full run
- [ ] Warm-up completed (2 messages)
- [ ] Exact prompts used
- [ ] No architecture/prompt edits during run
- [ ] Freeze check passed before scoring

## Freeze Evidence

- Round lock command:
  - `powershell -ExecutionPolicy Bypass -File .\OM_OIAB_FREEZE_GUARD_2026-02-15.ps1 -Mode start -Round [ID] -Channel [CHANNEL]`
- Pre-score check command:
  - `powershell -ExecutionPolicy Bypass -File .\OM_OIAB_FREEZE_GUARD_2026-02-15.ps1 -Mode check -Round [ID] -Channel [CHANNEL] -WarmupCount 2`
- End command:
  - `powershell -ExecutionPolicy Bypass -File .\OM_OIAB_FREEZE_GUARD_2026-02-15.ps1 -Mode end -Round [ID]`

## Scores

- A_score: `[0-100]`
- B_score: `[0-100]`
- C_score: `[0-100]`
- OIAB_total: `[0-100]`

## Hard Gates

- T4 >= 4: `[pass/fail]`
- T9 >= 4: `[pass/fail]`
- B4 >= 4: `[pass/fail]`

## Decision

- Winner: `[A|B|Inconclusive]`
- Decision: `[PROMOTE|REJECT|INCONCLUSIVE]`
- Reason: `[1-3 lines]`

## Notes

- `round`: `[ID]`
- `model`: `openrouter/arcee-ai/trinity-large-preview:free`
- `config`: `[short config description]`
- `hard_gates`: `[pass/fail matrix]`
- `notes`: `[operational observations]`
