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

## Build, Test, and Development Commands

```bash
# Install dependencies
pnpm install

# Run CLI in dev mode
pnpm openclaw ...  # or: pnpm dev

# Type-check and build
pnpm build
pnpm tsgo          # TypeScript checks only

# Lint and format
pnpm check         # Run oxlint and oxfmt
pnpm format        # Check formatting (oxfmt --check)
pnpm format:fix    # Fix formatting (oxfmt --write)

# Tests
pnpm test                    # Run vitest
pnpm test:coverage           # With coverage
pnpm test:live               # Live tests with real API keys
pnpm test:docker:live-models # Docker-based live model tests
```

## Architecture

### Core Flow
1. **Incoming messages** arrive via channel webhooks (Discord bot, Telegram bot, etc.)
2. **ACP session layer** (`src/acp/`) normalizes messages into a unified session format
3. **Gateway** (`src/gateway/`) routes sessions to appropriate agents
4. **Agent runners** (`src/agents/pi-embedded-runner/`, `src/agents/cli-runner.ts`) execute AI interactions
5. **Responses** are sent back through the same channel

### Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/gateway/` | HTTP/WebSocket server, message routing, session management |
| `src/agents/` | AI agent implementations, embedded runners, tool definitions |
| `src/acp/` | Agent Communication Protocol - message normalization layer |
| `src/channels/` | Core channel implementations |
| `src/auto-reply/` | Auto-reply logic and inline actions |
| `src/brain/` | Decision-making, episodic memory, model selection |
| `extensions/` | Plugin-based channel integrations (WhatsApp, Slack, Teams, etc.) |
| `ui/src/` | Web-based control panel UI |
| `.agent/skills/skills/` | Document processing skills (pdf, docx, pptx, xlsx) |

### Entry Points
- **CLI**: `src/cli/index.ts` → `src/commands/*`
- **Gateway**: `src/gateway/server-main.ts` (started via `openclaw gateway run`)
- **Tests**: Colocated `*.test.ts` files next to source

## Testing Guidelines

- Framework: Vitest with V8 coverage (70% thresholds)
- Naming: `*.test.ts` colocated with source
- Run tests before pushing: `pnpm test`
- Live tests: `CLAWDBOT_LIVE_TEST=1 pnpm test:live`

## Important Patterns

- **Dependency injection**: Use `createDefaultDeps` pattern for CLI commands
- **Session management**: ACP protocol handles session normalization across channels
- **Agent runners**: Multiple implementations (embedded, Claude Code CLI, etc.) - see `src/agents/`
- **Tool schemas**: Avoid `Type.Union`, `anyOf`/`oneOf`/`allOf`; use `Type.Unsafe enum` for string lists
- **UI state**: SwiftUI uses `@Observable` framework (not `ObservableObject`)

## Additional Resources

- Full guidelines: See `AGENTS.md` for comprehensive development rules
- Documentation: `docs/` (built to `dist/`)
- Channel code: `src/telegram`, `src/discord`, `src/slack`, `src/signal`, `src/imessage`, `src/web`
- Extension channels: `extensions/*`
