# OM Prototype 33 - Progress Ledger (Phase B Step 1 Usage Proof)

Date: 2026-02-18  
Time zone: Europe/Berlin  
Operator: David  
Assistant agent: Codex (GPT-5)  
Phase: Phase B (Memory Consolidation)  
Scope: Conflict Policy v1 validation + Predicate Routing usage proof

## Objective

Prove that Graph Memory v1 works in real usage flow (not just static code review):
1. Write fact A.
2. Overwrite with newer conflicting fact B.
3. Verify recall behavior matches the new state.

## Implementation

Added verification script:
1. `scripts/verify_memory_graph.ts`

Script flow:
1. Write `Alice manages Auth`.
2. Write `Alice manages Frontend`.
3. Verify DB relation state (`MANAGES` for `Alice`) keeps only newer target.
4. Verify recall:
   - `Who manages Auth?` -> empty
   - `Who manages Frontend?` -> `Alice manages Frontend.`

## Surgical Validation Commands

1. `pnpm test src/brain/episodic-memory.test.ts src/brain/decision.test.ts`
2. `pnpm exec tsx scripts/verify_memory_graph.ts`
3. `pnpm tsgo`

## Verification Output (script)

```json
{
  "writes": [
    { "step": "write-1", "persisted": true, "extracted": 2, "inserted": 2, "conflictsResolved": 0 },
    { "step": "write-2", "persisted": true, "extracted": 2, "inserted": 2, "conflictsResolved": 2 }
  ],
  "dbRelations": [
    { "source_entity": "Alice", "predicate": "MANAGES", "target_entity": "Frontend" }
  ],
  "recall": {
    "auth": [],
    "frontend": ["Alice manages Frontend."]
  },
  "verdict": "PASS"
}
```

## Notes

1. No full 9-ritual battery executed (Token Economy preserved).
2. Conflict Policy remains v1/simple as directed (no v2 decay logic).
