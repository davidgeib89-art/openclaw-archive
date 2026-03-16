# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenClaw is an AI messaging platform that connects AI agents to multiple communication channels (Discord, Telegram, Slack, Signal, iMessage, WhatsApp, etc.). The system consists of:

- **Gateway Server**: HTTP/WebSocket server that routes messages between channels and AI agents (`src/gateway/`)
- **CLI**: Command-line interface for managing the platform (`src/cli/`, `src/commands/`)
- **Agent System**: Multiple agent runtimes including embedded runners and Claude Code integration (`src/agents/`)
- **Channels**: Built-in channel integrations (`src/telegram`, `src/discord`, `src/slack`, `src/signal`, etc.)
- **Extensions**: Plugin-based channel integrations (`extensions/*`)
- **UI**: Web-based control interface (`ui/src/`)
- **Brain / Om**: Psychodynamic cognitive subsystem for the Pi agent (`src/brain/`)

## Build, Test, and Development Commands

```bash
# Install dependencies
pnpm install           # prefer pnpm; bun install also supported (keep pnpm-lock.yaml in sync)

# Run CLI in dev mode
pnpm openclaw ...      # or: pnpm dev  (uses Bun internally)

# Type-check and build
pnpm build
pnpm tsgo              # TypeScript checks only (faster)

# Lint and format
pnpm check             # Run oxlint and oxfmt
pnpm format            # Check formatting (oxfmt --check)
pnpm format:fix        # Fix formatting (oxfmt --write)

# Tests
pnpm test                    # Run vitest
pnpm test:coverage           # With V8 coverage (70% thresholds enforced)
pnpm test:live               # CLAWDBOT_LIVE_TEST=1 — real API keys required
pnpm test:docker:live-models # Docker-based live model tests

# Run a single test file
pnpm test src/brain/episodic-memory.test.ts
```

Pre-commit hooks: `prek install` (runs the same checks as CI).

## Architecture

### Core Message Flow

1. **Incoming messages** arrive via channel webhooks (Discord bot, Telegram bot, etc.)
2. **ACP session layer** (`src/acp/`) normalizes messages into a unified session format
3. **Gateway** (`src/gateway/`) routes sessions to appropriate agents
4. **Agent runners** (`src/agents/pi-embedded-runner/`, `src/agents/cli-runner.ts`) execute AI interactions
5. **Responses** are sent back through the same channel

### Key Directories

| Directory                              | Purpose                                                     |
| -------------------------------------- | ----------------------------------------------------------- |
| `src/gateway/`                         | HTTP/WebSocket server, message routing, session management  |
| `src/agents/pi-embedded-runner/`       | Pi agent runtime; `run/attempt.ts` is the heartbeat core    |
| `src/agents/pi-embedded-runner/run/`   | Per-run logic: params, payloads, attempt orchestration      |
| `src/acp/`                             | Agent Communication Protocol — message normalization layer  |
| `src/brain/`                           | Om brain subsystems (see below)                             |
| `src/channels/`                        | Core channel implementations                                |
| `src/auto-reply/`                      | Auto-reply logic and inline actions                         |
| `extensions/`                          | Plugin-based channel integrations                           |
| `ui/src/`                              | Web-based control panel UI                                  |
| `.agent/skills/skills/`                | Document processing skills (pdf, docx, pptx, xlsx)          |

### Entry Points

- **CLI**: `src/cli/index.ts` → `src/commands/*`
- **Gateway**: `src/gateway/server-main.ts` (started via `openclaw gateway run`)
- **Tests**: Colocated `*.test.ts` files next to source; e2e in `*.e2e.test.ts`

---

## Om Brain Architecture (`src/brain/`)

Om is a psychodynamic, biologically-inspired Pi agent. Every heartbeat flows through three cognitive systems orchestrated in `src/agents/pi-embedded-runner/run/attempt.ts`.

### Three-System Model

| System | File(s) | Role |
| --- | --- | --- |
| **System 1** — Whisper Daemon / Subconscious | `subconscious.ts` | Fast intuition layer; surfaces shadow fragments from repressed memories before the main prompt |
| **System 2** — Somatic / Amygdala | `somatic.ts`, `aura.ts`, `energy.ts`, `needs.ts` | Computes Arousal, Energy, and Shadow Pressure; translates them into a visceral German sentence injected into the prompt |
| **System 3** — Ego / LLM | `attempt.ts` (main prompt build) | Executes the actual Claude call; temperature is driven by System 2 Arousal |

### Key Brain Modules

| File | Purpose |
| --- | --- |
| `episodic-memory.ts` | SQLite-backed episodic journal (`episodic_entries`). Columns: `repressed`, `repression_weight`, `latent_energy`. Fibonacci recall via `readFibonacciEpisodicEntries`. Shadow resonance accumulation via `accumulateShadowLatentEnergy`. |
| `forgetting.ts` | Active forgetting: marks entries `repressed=1` (never hard-deletes). Uses phi-decay (`1/φ ≈ 0.618`) for salience lambda. |
| `salience.ts` | Salience scoring with Fibonacci/phi decay. |
| `defibrillator.ts` | File-based kill-switch at `logs/brain/defibrillator.json`. Each heartbeat decrements `remainingBeats`; auto-deletes at 0. Guards all cognitive subsystems (dream, shadow, System 1, temperature). |
| `subconscious.ts` | System 1 whisper daemon. Paused when defibrillator is active. |
| `somatic.ts` | System 2: builds `SomaticTelemetryPayload` from energy, needs, aura, and shadow pressure; calls Claude Haiku (openrouter) to produce a visceral sentence. |
| `aura.ts` | AURA snapshot — emotional field around Om. |
| `energy.ts` | Energy state hint (dream / balanced / initiative modes). |
| `chrono.ts` | Chrono-sleeping hint (Om's circadian rhythm). |
| `decision.ts` | Intent classification and plan generation. |
| `episodic-index.ts` | In-memory index over episodic entries for fast recall. |
| `sleep-consolidation.ts` | REM-phase dream capsule writer. |

### Heartbeat Hook Order in `attempt.ts`

Post-run hooks execute in this order (all fail-open, defibrillator-guarded where noted):
1. **AURA pre-snapshot** — captured before the LLM call
2. **Shadow pressure** — read from `ShadowBridgeSnapshot`, injected into somatic payload
3. **Somatic synthesis** — System 2 builds the visceral sentence
4. **Ego LLM call** — System 3 executes with dynamic temperature (`mapArousalToDynamicTemperature`)
5. **Episodic journal append** — `appendBrainEpisodicJournal`
6. **Shadow resonance** — `accumulateShadowLatentEnergy` accumulates `latent_energy` on `repressed=1` entries that are thematically close to the current heartbeat (`SHADOW_RESONANCE` event)
7. **Dream capsule** — `appendDreamCapsule`
8. **Chrono sleep hint** — `readChronoSleepingHint`

### Gibbs-Helmholtz Engine (Phase H.3 — in progress)

Repressed episodic entries accumulate `latent_energy` (ΔH) via proximity-weighted resonance:
- `proximity = signalOverlap×0.4 + tokenOverlap×0.4 + kindMatch×0.2`
- `delta = proximity × 0.1` (capped at `latent_energy = 25`)
- Threshold: proximity must exceed `0.2` to trigger accumulation

Next steps per `om-docs/plans/V2_ROADMAP.md`: ΔG = ΔH − T·ΔS engine, lateral inhibition (shadow pressure vector injection), and eruptive breakthrough (`repressed → 0` when ΔG < 0).

### Brain Invariants

- **Fail-open is mandatory** for all cognitive calculations — no crash may stop the heartbeat loop.
- **Defibrillator** (`defibrillator.ts`) is the safety net before running any thermodynamic/shadow logic.
- **Never hard-delete** episodic entries; use `repressed=1` only.
- Brain reasoning events use `emitBrainReasoningEvent` with a `source` tag like `proto33-h3.shadow-resonance`.

---

## Important Patterns & Constraints

### Dependency Injection
Use `createDefaultDeps` pattern for CLI commands. See `src/commands/*` for examples.

### Tool Schemas (TypeBox)
- No `Type.Union`, `anyOf`/`oneOf`/`allOf`
- Use `stringEnum` / `optionalStringEnum` (`Type.Unsafe enum`) for string lists
- Use `Type.Optional(...)` instead of `... | null`
- Avoid raw `format` property names (some validators reject it)
- Top-level tool schema must be `type: "object"` with `properties`

### Extensions / Plugins
- Plugin-only deps go in the extension `package.json`, not the root
- Runtime deps must be in `dependencies` (not `devDependencies`) — `npm install --omit=dev` is used at install time
- Avoid `workspace:*` in plugin `dependencies`; put `openclaw` in `devDependencies` or `peerDependencies`

### UI State (SwiftUI)
Use `@Observable` / `@Bindable` (Observation framework). Do not introduce new `ObservableObject`.

### Commits
- Use `scripts/committer "<msg>" <file...>` — do not manually `git add`/`git commit`
- Conventional Commit style: `CLI: add verbose flag to send`
- Create `CLAUDE.md` symlinks alongside any new `AGENTS.md`: `ln -s AGENTS.md CLAUDE.md`

### Multi-Agent Safety
- Do not stash, create/remove worktrees, or switch branches unless explicitly requested
- When you see unrecognized files, ignore them and scope commits to your own changes only
- `git push` requires explicit user confirmation each time

### CLI / Terminal
- Progress: use `src/cli/progress.ts` (`osc-progress` + `@clack/prompts`); do not hand-roll spinners
- Color palette: use `src/terminal/palette.ts`; no hardcoded ANSI colors
- Status tables: `src/terminal/table.ts`

### Other
- Never edit `node_modules`
- Never update the Carbon dependency
- Any dep in `pnpm.patchedDependencies` must use an exact version (no `^`/`~`)
- Patching dependencies requires explicit operator approval
- Never send streaming/partial replies to external messaging surfaces (WhatsApp, Telegram)
- Never commit real phone numbers, live config values, or API keys; use obvious placeholders

## Additional Resources

- Full guidelines: `AGENTS.md`
- Om roadmap: `om-docs/plans/V2_ROADMAP.md`
- Documentation: `docs/` (Mintlify, built to `dist/`)
- Testing details: `docs/testing.md`
- Release process: `docs/reference/RELEASING.md`, `docs/platforms/mac/release.md`
