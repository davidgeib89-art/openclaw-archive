# 🦞 OpenClaw — Personal AI Assistant

OpenClaw is a multi-channel AI messaging platform and personal assistant that you run on your own devices. It connects AI agents to various communication channels (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, etc.) via a local-first control plane (Gateway).

## 🚀 Project Overview

- **Purpose**: A personal, fast, and always-on AI assistant with multi-channel support and advanced cognitive capabilities.
- **Core Technology**: TypeScript (ESM), Node.js ≥ 22, pnpm monorepo.
- **Architecture**:
  - **Gateway Server**: HTTP/WebSocket server routing messages between channels and agents (`src/gateway/`).
  - **CLI**: Command-line interface for platform management and interaction (`src/cli/`, `src/commands/`).
  - **Agent System**: Embedded runners, including the **Om Brain** subsystem (`src/agents/`, `src/brain/`).
  - **Channels**: Built-in integrations for major messaging platforms (`src/channels/`).
  - **Extensions**: Plugin-based channel and tool integrations (`extensions/*`).
  - **UI**: Web-based control interface and dashboard (`ui/`, `om-dashboard/`).
  - **Mobile/Desktop**: Native apps for macOS, iOS, and Android (`apps/`).

## 🧠 Om Brain Architecture

The "Om" brain is a psychodynamic, biologically-inspired cognitive subsystem for the Pi agent, orchestrated in `src/agents/pi-embedded-runner/run/attempt.ts`.

- **System 1 (Subconscious)**: Fast intuition layer surfacing repressed memory fragments (`subconscious.ts`).
- **System 2 (Somatic/Amygdala)**: Computes Arousal, Energy, and Shadow Pressure, generating visceral internal states (`somatic.ts`).
- **System 3 (Ego/LLM)**: The main LLM call (Claude/GPT), with parameters driven by System 2.
- **Episodic Memory**: SQLite-backed journal with active forgetting and latent energy accumulation (`episodic-memory.ts`).

## 🛠 Building and Running

### Development Commands

```bash
# Install dependencies (pnpm preferred)
pnpm install

# Build the project (bundles UI and a2ui, runs tsdown)
pnpm build

# Run Gateway in watch mode (auto-reload on TS changes)
pnpm gateway:watch

# Launch the onboarding wizard
pnpm openclaw onboard

# Run the CLI in dev mode
pnpm dev

# Build UI components
pnpm ui:build
```

### Testing

```bash
# Run all tests (Vitest)
pnpm test

# Run unit tests only
pnpm test:fast

# Run live tests (requires API keys)
pnpm test:live

# Coverage report (70% threshold enforced)
pnpm test:coverage
```

### Linting and Formatting

```bash
# Run all checks (Oxlint, Oxfmt, Type-check)
pnpm check

# Fix lint and format issues
pnpm lint:fix
pnpm format:fix
```

## 📜 Development Conventions

- **Language**: TypeScript (ESM) with strict typing; avoid `any`.
- **Project Structure**:
  - `src/`: Core logic and Gateway.
  - `apps/`: Mobile and desktop applications.
  - `docs/`: Mintlify documentation.
  - `extensions/`: Plugin packages.
  - `skills/`: AI agent skills.
- **Testing**: Co-locate tests with source code (`*.test.ts`).
- **Code Style**:
  - Aim for files under ~700 LOC.
  - Use `createDefaultDeps` pattern for CLI commands.
  - Use the shared CLI palette in `src/terminal/palette.ts`.
- **Tool Schemas (TypeBox)**:
  - No `Type.Union`, `anyOf`, `oneOf`, or `allOf`.
  - Use `Type.Optional(...)` instead of `| null`.
  - Top-level schema must be an object with properties.
- **Multi-Agent Safety**:
  - Do not use `git stash` unless requested.
  - Scope commits to your changes only.
  - Use `scripts/committer "<msg>" <file...>` for commits.

## 📂 Key Files & Directories

- `package.json`: Main project configuration and scripts.
- `README.md`: Detailed project documentation and highlights.
- `AGENTS.md`: Comprehensive repository guidelines for AI agents.
- `CLAUDE.md`: Architecture overview and "Om Brain" deep dive.
- `openclaw.mjs`: CLI entry point.
- `pnpm-workspace.yaml`: Monorepo workspace configuration.

---

*This GEMINI.md provides context for working with the OpenClaw repository. Refer to `AGENTS.md` and `CLAUDE.md` for more detailed guidelines and architectural deep dives.*
