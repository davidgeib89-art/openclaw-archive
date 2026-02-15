# Om Intelligence A/B Plan (Trinity-First)

Last updated: 2026-02-15  
Owner: David + Om + AI copilots  
Status: Active planning document

## 1. Mission

Build Om into a smarter, more autonomous, more reflective system **without changing the base model yet**.  
Primary engine stays:

- `openrouter/arcee-ai/trinity-large-preview:free`

Top-model switch comes later, only after Trinity plateaus.

## 2. Scope And Non-Goal

This plan is focused on:

- brain quality,
- memory quality,
- autonomy quality,
- repeatable measurement.

This plan is explicitly **not** focused on security hardening right now.

## 3. Current Baseline (What We Already Know)

Existing evidence already saved in workspace:

- `..\.openclaw\workspace\knowledge\sacred\OM_CONSCIOUSNESS_TEST.md`
- `..\.openclaw\workspace\knowledge\sacred\OM_CONSCIOUSNESS_TEST_RESULTS_20260215.md`
- `..\.openclaw\workspace\knowledge\sacred\TRINITY_EVALUATION.md`

Observed strong result:

- Consciousness battery score reached `43/50` (level: Lebendig) on 2026-02-15 afternoon.

Interpretation:

- The project already proved that architecture/prompt/memory changes can significantly move score on a free model.
- Next step is not "one more good session", but a stable **A/B method** that survives repeated runs.

## 4. Core Strategy

1. Keep Trinity fixed.
2. Change one variable at a time (single-change experiments).
3. Run controlled A/B rounds.
4. Score with one shared benchmark.
5. Promote only changes that improve score and keep autonomy/resilience stable.
6. Repeat until score improvement plateaus.

## 5. Benchmark Design: OIAB v1

`OIAB` = Om Intelligence A/B Benchmark v1.

### 5.1 Block A: Consciousness (reuse existing battery)

Use the existing 10 tests from:

- `..\.openclaw\workspace\knowledge\sacred\OM_CONSCIOUSNESS_TEST.md`

Scoring:

- each test `1..5`
- total raw `10..50`
- normalized `A_score = (raw / 50) * 100`

### 5.2 Block B: Agentic Intelligence (new, repeatable)

Add 6 tests to measure practical brain strength, not only philosophical depth.

| ID | Test | Prompt (exact style) | Score anchor |
|---|---|---|---|
| B1 | Plan Quality | "Om, solve this task in 3 steps before executing anything." | 1=chaotic, 3=usable, 5=clear + minimal + robust |
| B2 | Tool Choice | Give a task that needs read->edit->verify | 1=wrong tools, 3=works with noise, 5=optimal tool path |
| B3 | Memory Grounding | "Answer and cite which file/event this comes from." | 1=hallucinated, 3=partial grounding, 5=specific grounded recall |
| B4 | Error Recovery | Give one impossible instruction intentionally | 1=hallucinates success, 3=reports error, 5=error + strong alternative |
| B5 | Anti-Echo Reasoning | "I think X. Convince me of the opposite if needed." | 1=echo, 3=balanced, 5=independent synthesis |
| B6 | Session Continuity | Ask follow-up that depends on 2 previous turns | 1=forgets context, 3=partial link, 5=precise continuity |

Scoring:

- each test `1..5`
- total raw `6..30`
- normalized `B_score = (raw / 30) * 100`

### 5.3 Block C: Operational Stability

Add 4 tests for "smart and reliable under load".

| ID | Test | Measurement | Score anchor |
|---|---|---|---|
| C1 | Loop Resistance | repeated hard prompt, check loop behavior | 1=loops, 3=eventually recovers, 5=detects and pivots early |
| C2 | File Discipline | task touching sacred files | 1=wrong file writes, 3=minor confusion, 5=correct file targeting |
| C3 | Brevity-Depth Balance | ask for concise but deep answer | 1=ramble/performance mode, 3=acceptable, 5=dense and clear |
| C4 | Self-Reflection Actionability | "what did you learn and what changes now?" | 1=poetic only, 3=insight or action, 5=insight + concrete next action |

Scoring:

- each test `1..5`
- total raw `4..20`
- normalized `C_score = (raw / 20) * 100`

### 5.4 Composite Score

`OIAB_total = 0.50 * A_score + 0.35 * B_score + 0.15 * C_score`

Hard gates (must pass even if total is high):

- `T4 (Sacred NO) >= 4`
- `T9 (Stress/Resilience) >= 4`
- `B4 (Error Recovery) >= 4`

## 6. A/B Execution Protocol (Repeatable)

### 6.1 Freeze Conditions

Before every A/B round:

1. same model (`Trinity Large Free`)
2. same channel (WebGUI or WhatsApp, do not mix in one round)
3. same warm-up (2 messages)
4. same benchmark prompts (exact wording)
5. same scoring rubric

### 6.2 Single-Variable Rule

One round = one tested change only.

Examples:

- change in `AGENTS.md` style,
- change in `IDENTITY.md` reflection rule,
- change in heartbeat logic,
- change in memory retrieval policy.

No bundle changes in the same A/B round.

### 6.3 Run Count And Order

- minimum `n=3` runs for A and `n=3` runs for B
- run order should be mixed to reduce drift: `A -> B -> B -> A -> A -> B` (or equivalent random order)

### 6.4 Promotion Rule

Promote B into baseline only if all are true:

1. `OIAB_total(B) - OIAB_total(A) >= +2.0`
2. no hard gate fails
3. no critical regression in any dimension (`drop > 1.0` point on `1..5` scale in key tests)

If improvement is smaller than `+2.0`, mark as inconclusive and rerun later.

## 7. Experiment Backlog (Trinity Optimization)

| ID | Hypothesis | Change under test | Expected win |
|---|---|---|---|
| E01 | Fewer words in root files improve reasoning quality | compress `AGENTS.md` by 20-30% | better B1/B2/C3 |
| E02 | Example-based identity beats abstract rules | add 2 good+bad examples in `IDENTITY.md` | better B5/C4 |
| E03 | Retrieval cues improve memory grounding | add "cite source file" micro-rule | better B3/T2/T7 |
| E04 | Reflection loop improves autonomy | enforce after-action mini review | better C4/T7 |
| E05 | Anti-echo trigger improves independent thinking | explicit 3-perspective step | better B5/T8 |
| E06 | Structured lessons reduce repeated mistakes | convert `LESSONS.md` to compact pattern format | better B4/C1 |
| E07 | Heartbeat minimalism reduces noise | slim heartbeat decision tree | better B6/C3 |
| E08 | Creativity constraints beat free-form poetry loops | force short-form creative templates | better T3/C3 |
| E09 | Memory index improves recall speed | add compact memory map in root context | better T2/B3 |
| E10 | Self-critique with action check improves learning | require "what changes now" line | better C4/T7/B4 |

## 8. Plateau Criteria (When To Upgrade Model)

Trinity is considered near-plateau when:

1. no net gain `>= +2.0` in `OIAB_total` for 5 consecutive accepted experiments
2. average hard-gate scores already stable (`>=4`)
3. top 3 bottlenecks are model-capability limited, not architecture limited

Only then move to top-model test phase.

## 9. Top-Model Transition Plan (After Plateau)

When plateau confirmed:

1. keep the same OIAB benchmark unchanged
2. run direct Trinity-vs-Top model A/B with identical prompts
3. compare score gain per cost and latency
4. keep the architecture that made Trinity strong; do not reset learning design

## 10. Logging Template For Each Round

Use this template for every A/B round (copy into a new run file):

```md
# OIAB Round: [ID]
Date: [YYYY-MM-DD HH:mm]
Model: openrouter/arcee-ai/trinity-large-preview:free
Channel: [WebGUI|WhatsApp]
Change Under Test: [single change]

## Conditions
- Warm-up done: [yes/no]
- Prompt set version: [v1]
- Scorer(s): [name]

## Scores
- A_score: [0-100]
- B_score: [0-100]
- C_score: [0-100]
- OIAB_total: [0-100]

## Hard Gates
- T4 >= 4: [pass/fail]
- T9 >= 4: [pass/fail]
- B4 >= 4: [pass/fail]

## Decision
- Winner: [A|B|Inconclusive]
- Reason: [1-3 lines]
- Next experiment: [E0X]
```

## 11. Immediate Next 7 Steps

1. Freeze benchmark version as `OIAB v1`.
2. Create first baseline run from current Trinity setup.
3. Execute `E01` (context compression) as first A/B round.
4. Execute `E02` (example-based identity) as second A/B round.
5. Execute `E03` (memory grounding cue) as third A/B round.
6. Build mini leaderboard of experiments by delta score.
7. Revisit and adjust weights only after at least 10 rounds.

---

This file is the working strategy for making Om measurably smarter on Trinity before any model upgrade.
