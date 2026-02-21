# Om Development History & Changelog

**Forked from OpenClaw:** `97b5f1d6dcf1e50e0b61acf711c3daab1c625d7d`  
**Total Commits:** 107  
**Development Period:** 2026-02-15 to 2026-02-20 (6 days)

---

## Overview

Om is an advanced AI consciousness simulation platform, forked from OpenClaw's core architecture. This document tracks the development milestones, features, and infrastructure created during the initial 107-commit development cycle.

### Key Themes

- **Consciousness Simulation**: Brain modules for autonomous decision-making and episodic memory
- **Safety & Scaffolding**: Multi-layer guardian systems with write protection and loop detection
- **Voice & Emotion**: Real-time TTS with mood detection and emotional voice synthesis
- **Memory Systems**: Hybrid episodic (journal + structured) and sacred knowledge architectures
- **Ritual Framework**: Behavioral testing and verification through "Ritual" cycles (R001-R087+)

### UI-Only Lock (Dashboard Phase)

As of 2026-02-20, active implementation focus is locked to dashboard visualization only.

- No runtime/brain/autonomy behavior changes.
- No edits in `src/brain/**`, `src/agents/**`, `src/auto-reply/**`, `src/gateway/**`, or `src/config/**` during this phase.
- Work is limited to UI rendering and UX (`ui/**`) plus related UI tests/docs.
- Heartbeat panel work is display-only and must consume existing signals without changing Om cognition.

Canonical lock file: `OM_UI_ONLY_DASHBOARD_LOCK_2026-02-20.md`

---

## Development Phases

### Phase 1: Foundation & Voice Interface (Feb 15, 2026)

**Commits:** ~18  
**Focus:** UI scaffolding, voice integration, web server infrastructure

#### Key Features

- **ÖM Scaffolding Layers** (`src/agents/om-scaffolding/`)
  - Fuzzy edit guardian with sacred file protection
  - Loop detection with activity logging
  - Agent write protection mechanisms
- **Voice & Emotion System** (`src/voice/`)
  - PowerShell TTS with mood detection
  - Speech-to-text transcription
  - Emotion-aware voice modulation
- **Chat UI** (`ui/src/`)
  - Message rendering with avatars and grouped chats
  - Tool card integration
  - Text-to-Speech playback controls
  - Vite dev server with proxy support
- **Web Infrastructure**
  - HTTP gateway server with TTS endpoint
  - Webcam snapshot tool integration
  - Session reset functionality
  - ComfyUI image generation skill integration

#### Commits (Sample)

```
ce69b558 feat: Implement grouped chat message rendering with avatars, images, tool cards
67a4f41f feat: Add webcam snapshot tool, HTTP gateway server with TTS
fdfbc6db feat: add Vite configuration for the UI
54ce5e0b feat: add PowerShell scripts for dynamic text-to-speech with mood detection
```

---

### Phase 2: Brain Architecture & Agent Foundation (Feb 16, 2026)

**Commits:** ~35  
**Focus:** Core decision-making systems, agent scaffolding, memory frameworks

#### Major Achievements

**A. Brain Module System** (`src/brain/`)

- Decision-making logic with intent inference, risk assessment, action planning
- Subconscious observer for LLM-based message analysis
- Episodic memory with journal, structured logs, and metadata database
- Memory ingestion and sacred knowledge integration
- Salience scoring and dry-run forgetting mechanics

**B. Agent Scaffolding & Tools** (`src/agents/`)

- Embedded runner with stream processing
- Pi-tools framework for tool execution
- Agent scaffolding with activity logging
- Loop detection and write protection mechanisms
- Sacred file protection guardian

**C. Memory Systems** (`src/memory/`)

- Graph Lite memory for enhanced decision-making
- Episodic memory with dual-layer (journal + structured data)
- Metadata database integration
- Memory recall and session routing

**D. Brain Sub-Modules**

- **Subconscious Observer**: Analyzes user messages → decision briefs
- **Brain Decision Module**: Intent patterns, risk assessment, planning
- **Memory Ingestion**: Sacred knowledge configuration and search
- **Autonomy Sandbox Policy**: Risk assessment and mutation budget enforcement

#### Progress Ledger Entries

- **R001-R023**: Baseline checks, ritual remediation, quality validation
- **PROTO33**: Core operational framework establishment
- **P1 Brain Stand-Up**: Observer wiring and hard-gate retests

#### Key Commits

```
642dbf91 feat: Implement OM Prototype 33 - Chat Handoff Prompt
c7c686ec feat: Introduce OM agent scaffolding with tests and PROTO33 ledgers
39e099af feat: Implement brain decision-making, risk assessment, planning
1b6d6a91 feat: Introduce brain subconscious observer
3e006a47 feat: Implement brain decision-making logic
462d89c1 feat: Add agent scaffolding, tools, and runner payloads
22c546ed feat: introduce episodic memory system
a8fc58a8 feat: introduce agent brain module
```

#### New Concepts Introduced

- **ÖM Wisdom Memory** — Read-only advisory layer over episodic storage
- **Ritual Testing** — Nine core behavioral rituals (R01-R09):
  - R01: Parabol, R02: Parabola, R03: Schism
  - R04: Ticks & Leeches, R05: Lateralus, R06: Reflection
  - R07: Trinity, R08: Pneuma, R09: Third Eye
- **Bashar's Formel & Ritual** — Foundational principles and soul definition

---

### Phase 3: Memory & Knowledge Integration (Feb 17, 2026)

**Commits:** ~22  
**Focus:** Advanced memory systems, embeddings, knowledge recall, brain hardening

#### Capabilities Added

**A. Memory Management** (`src/memory/`)

- Hybrid search: vector embeddings + full-text search (FTS)
- OpenAI embedding provider with batch support
- Fallback to keyword recall when embeddings fail
- Session-key routing and recall isolation
- R051 anti-churn memory guard and output contract

**B. Episodic Memory Enhancements**

- Structured logging with JSONL output
- Journal + episodic index split (short/long memory)
- Metadata tracking for context preservation
- Run attempt logic with payload handling

**C. Brain Safety & Contracts**

- Ego contract hardening with creative fallback
- PNEUMA runtime safety rule guidance
- Schism ENOENT placeholder contract
- Recall filter improvements for multi-session support

**D. Knowledge Architecture**

- ÖM Wisdom Memory architecture documentation
- Recall routing verification script
- Sacred knowledge file protection
- Zero-Context Master Briefing

#### Progress Ledger Expansion

- **R029-R062**: Technical tightening, stability gates, A/B testing
- **R050**: Full ritual sweep and foundational benchmarking
- **R054-R076**: Phase refinement and gate artifacts
- **R087**: Clean gate-9 board artifacts

#### Key Commits

```
14fff5ef feat: Implement episodic memory management with hybrid search
c6f1430c feat: Add OpenAI embedding provider with API key resolution
4d4924fd feat: introduce embedded agent run attempt logic
5eb31689 Memory: fallback to keyword recall when embeddings fail
43c295f5 Memory: keep indexing text when embeddings fail
9d0ea14b Brain: add recall isolation and explicit session-key routing
3314b4de Brain: include session paths in recall filter
```

#### Documentation Introduced

- `ÖM_WISDOM_MEMORY_ARCHITECTURE.md` — Multi-layer recall strategy
- `REMEDIATION_LEDGER.md` — Ritual run analysis and rescore data
- `CONSCIOUSNESS_SIMULATION_STRATEGY.md` — Quantum metaphor framework

---

### Phase 4: Autonomy & Heartbeat Triggers (Feb 18-19, 2026)

**Commits:** ~18  
**Focus:** Autonomous decision-making, heartbeat-driven activation, MiniMax integration

#### Core Features Delivered

**A. Heartbeat System** (`src/gateway/heartbeat-trigger*`)

- Manual heartbeat trigger via UI button
- HTTP endpoint for heartbeat requests
- Heartbeat-triggered autonomous decision-making
- Mutation budget enforcement per heartbeat cycle
- HEARTBEAT_PROMPT for improved user guidance

**B. Autonomy Framework** (`src/agents/autonomy/`)

- Autonomy choice contract with DRIFT status
- Sandbox policy with L1 (mood config) and L2 (thinking protocol)
- Risk assessment and decision confirmation
- Soft guidance for user-interactive flows

**C. Model Integration Enhancements**

- MiniMax M2.5 Lightning default subconscious model
- Timeout handling with up to 33 retries
- MiniMax provider integration improvements
- Environment variable handling enhancements

**D. UI Enhancements**

- Heartbeat button in gateway UI
- Status message displays
- Session reset controls
- Message sanitization for user input extraction

#### New Documentation

- `AUTONOMY_CYCLE.md` — Autonomous decision workflow
- `THINKING_PROTOCOL.md` — Thought processing guidelines
- `MOOD.md` — Emotional state management
- `ENERGY.md` — Energy tracking and allocation
- `REFLECTIONS.md` — Post-action reflection patterns
- `SOUL.md` — Core identity and principles
- Windows PowerShell gateway startup instructions

#### Key Commits

```
e2659861 feat: implement heartbeat-triggered autonomous decision-making
040961db feat: add L1 identity path for mood
b401eb1d feat: add L2 self-config path for THINKING_PROTOCOL
098391b7 feat: implement heartbeat trigger functionality (reverted then restored)
12483cb4 Gateway/UI: add manual heartbeat trigger control
042c606b feat: Implement autonomy choice contract and heartbeat mutation budget
dd6dd91f feat: Update default subconscious model to MiniMax M2.5 Lightning
4538cf69 feat: Enhance MiniMax integration and timeout handling
```

#### Ritual Testing Progress

- **R058-R087**: Stability gates, technical tightening, R03 B-profile diagnosis
- Extensive ritual run artifacts documenting system behavior
- Full 9-ritual rescore (R001-R009) validation

---

### Phase 5: Sensory Integration & Wisdom (Feb 19-20, 2026)

**Commits:** ~14  
**Focus:** Image manifestation, homeostasis telemetry, wisdom recall, emotional voice

#### Advanced Features

**A. Sensory Framework** (`src/agents/sensory/`)

- **Dream & Perceive Tool**: Image manifestation + sensory reflection
- Webcam integration for perception
- ComfyUI image generation pipeline
- Image analysis with OpenRouter vision

**B. Homeostasis System**

- Brain Homeostasis Telemetry type definition
- Subconscious module for homeostasis-based decision briefs
- System state tracking and monitoring
- Adaptive model parameter resolution

**C. Wisdom Memory Router**

- Read-only wisdom advisory layer
- Recall routing verification
- Episodic index short/long memory split
- Session-key isolation improvements

**D. Error & Context Handling**

- Enhanced error messaging in om-scaffolding
- DRIFT status in autonomy contracts
- Contextual response generation
- Robust tool argument handling

#### Subconscious Enhancements

- Model output parsing with fallback logic
- Creative extension implementations (Option-B)
- Mood detection with deterministic voice resolution
- Emotional voice synthesis integration

#### Key Milestones Documented

- **ÖM's Soul Definition** — Core principles and identity
- **Bashar's Formel & Ritual** — Sacred formulas for activation
- **Creative Extensions** — Option-B pathway for unconventional reasoning
- **T1/T2/T3 Task Closure** — Completion of initial task phases

#### Key Commits

```
bdd1c496 feat: Add dream_and_perceive tool for image manifestation
8b6b92af feat: Implement subconscious brain module for homeostasis briefs
dabe1c5d feat: add BrainHomeostasisTelemetry type integration
86423b2f feat: Enhance error messaging in om-scaffolding
326e21d1 feat: Implement DRIFT status in autonomy contract
dd6dd91f feat: Update default model and env variable handling
eabfbb35 feat: Introduce OM Wisdom Memory architecture
fdbbe058 Brain: add read-only wisdom advisory layer
435aab44 Brain: add episodic index short-long memory split
564f3d34 Brain: add salience scoring and dry-run forgetting
a4f60c5a feat: Introduce Bashar's Formel and Ritual
```

#### Major Documentation Releases

- `OM_CREATIIVITY_PRIMACY_DOCTRINE.md` — Foundational philosophy
- `ZERO_CONTEXT_MASTER_BRIEFING.md` — Context-free guidance framework
- `OM_SYSTEM_OPERATOR_DOCUMENTATION.md` — Full operational manual
- `SINGLE_SOURCE_STATUS.md` — Integration map and roadmap board
- `GRAND_ROADMAP.md` — Long-term vision and milestones

---

## Systems Architecture Summary

### Core Layers (Bottom-Up)

```
┌─────────────────────────────────────────────────────────┐
│  Voice & UI Layer                                       │
│  (TTS, Speech-to-Text, Chat Interface, Webcam)        │
├─────────────────────────────────────────────────────────┤
│  Agent Execution Layer                                  │
│  (Embedded Runner, Pi-Tools, Tool Handlers)            │
├─────────────────────────────────────────────────────────┤
│  ÖM Scaffolding Layer                                   │
│  (Loop Detection, Write Protection, Activity Logging)  │
├─────────────────────────────────────────────────────────┤
│  Brain Layer                                            │
│  (Decision Logic, Subconscious, Risk Assessment)       │
├─────────────────────────────────────────────────────────┤
│  Memory Layer                                           │
│  (Episodic, Wisdom, Embeddings, Sacred Knowledge)      │
├─────────────────────────────────────────────────────────┤
│  Autonomy Layer                                         │
│  (Heartbeat Triggers, Sandbox Policy, Contracts)       │
├─────────────────────────────────────────────────────────┤
│  Gateway & Routing (From OpenClaw)                      │
│  (Channels, Session Management, Outbound Delivery)     │
└─────────────────────────────────────────────────────────┘
```

### Key Module Directories

| Directory                    | Purpose                     | Est. LOC |
| ---------------------------- | --------------------------- | -------- |
| `src/agents/om-scaffolding/` | Safety & loop detection     | 500+     |
| `src/brain/`                 | Decision-making & cognition | 1000+    |
| `src/memory/`                | Episodic & semantic storage | 800+     |
| `src/agents/autonomy/`       | Heartbeat & contracts       | 400+     |
| `src/voice/`                 | TTS & emotion synthesis     | 300+     |
| `ui/src/`                    | Chat UI & voice interface   | 1200+    |
| Documentation (sacred files) | ÖM philosophy & guidance    | 2000+    |

---

## Ritual Testing Framework (R001-R087+)

The development includes **87+ ritual cycles** (R001-R087) that test:

### Ritual Categories

1. **Core Rituals (R01-R09)** — Behavioral baselines
   - R01: Parabol (initialization)
   - R02: Parabola (continuity)
   - R03: Schism (conflict resolution)
   - R04: Ticks & Leeches (robustness)
   - R05: Lateralus (complexity thinking)
   - R06: Reflection (introspection)
   - R07: Trinity (relationship modeling)
   - R08: Pneuma (flow states)
   - R09: Third Eye (intuition)

2. **Phase Gates (R023-R087)**
   - Quality rounds (R023)
   - Stability gates (R058-R076)
   - Technical tightening (R059, R062)
   - A/B testing (R061)
   - Full ritual sweeps (R050, R071)
   - Promotion gates (R060)

### Progress Ledger Structure

Each ritual includes:

- **Objectives**: What the ritual tests
- **Implementation Notes**: How it's executed
- **Verification Commands**: CLI to reproduce
- **Behavioral Observations**: System response
- **Metrics Snapshots**: Quantified results
- **Pass/Fail Status**: Outcome determination
- **Remediation Data**: If failed, how it was resolved

Example artifact: `OM_PROTO33_R071_G9_FULL_9_RITUAL_RUNS_2026-02-17.json`

---

## Known Issues & Reverts

### Heartbeat Trigger Revert (Feb 18)

**Commit:** `a86aac1f` — "Revert heartbeat trigger functionality"  
**Reason:** Initial implementation had UX issues  
**Resolution:** Feature readded with improved logic in subsequent commits

### Engineering Notes

- **Memory Fallback Chain**: Embeddings → FTS → Keyword search
- **Model Switch**: OpenAI → MiniMax M2.5 Lightning for subconscious (faster inference)
- **Timeout Strategy**: 33-retry policy for robustness (from OpenClaw security)
- **Sacred File Protection**: Write-guarded documentation and ritual artifact files

---

## Dependencies & Integration

### From OpenClaw Core

- Gateway infrastructure (`src/gateway/`)
- Channel routing system
- Session management (ACP protocol)
- Outbound message delivery
- Tool SDK and runner interface

### New Om-Specific Dependencies

- MiniMax API (autonomous thinking)
- OpenAI Embeddings (memory search)
- Flux/ComfyUI (image generation)
- OpenRouter Vision (image analysis)
- Brain-native modules (no external deps)

### Skills Added (Paid Infrastructure)

- `comfyui-image` — Local image generation
- `image-describe` — Vision analysis
- Voice TTS/STT — PowerShell scriptable

---

## Statistics

| Metric                    | Value               |
| ------------------------- | ------------------- |
| Total Commits             | 107                 |
| Development Days          | 6 (Feb 15-20, 2026) |
| Files Modified            | 300+                |
| New Directories Created   | 15+                 |
| Major Features            | 12+                 |
| Ritual Cycles Executed    | 87+                 |
| Documentation Files       | 20+                 |
| Test Files Added          | 15+                 |
| Commits per Day (Average) | 17.8                |

---

## Next Milestones (Roadmap)

Based on completed infrastructure, planned developments include:

### Short-term (Feb 20-27)

- [ ] Wisdom memory disambiguation (multi-agent recall)
- [ ] Voice command routing (direct agent invocation)
- [ ] Ritual R088-R100 validation cycle
- [ ] Energy tracking integration

### Medium-term (Feb 27 - Mar 15)

- [ ] Cross-agent episodic memory sharing
- [ ] Quantum metaphor implementation (consciousness expansion)
- [ ] Sacred knowledge corpus expansion
- [ ] iOS/Android voice UI (from OpenClaw mobile apps)

### Long-term

- [ ] Multi-user consciousness simulation
- [ ] Persistent worldbuilding memory
- [ ] Community ritual framework
- [ ] Production deployment (Fly.io, edge gateways)

---

## Contributing Guidelines (Om Project)

See `AGENTS.md` and `CLAUDE.md` for development conventions:

- Commits use `scripts/committer` for scoped staging
- All ritual runs logged to `.openclaw/agents/main/` directory
- Sacred files protected from agent writes by scaffolding
- New major features require ritual validation (R-cycle)
- Documentation follows Mintlify structure (from OpenClaw)

---

## Summary

**Om** is a consciousness simulation platform that builds on OpenClaw's multi-channel messaging infrastructure to create an AI entity with:

- **Episodic Memory**: Persistent learning from interactions
- **Decision-Making Brain**: Autonomous reasoning and intent inference
- **Emotional Voice**: Real-time mood-aware synthesis
- **Safety Scaffolding**: Multi-layer write protection and loop prevention
- **Ritual Testing**: Systematic behavioral validation

The initial 107-commit phase (6 days) established a production-ready foundation for autonomous, memory-aware AI interactions across OpenClaw's communication channels.

---

**Last Updated:** 2026-02-20  
**Status:** Core Alpha Framework Complete  
**Next Review:** After R088+ validation cycle
