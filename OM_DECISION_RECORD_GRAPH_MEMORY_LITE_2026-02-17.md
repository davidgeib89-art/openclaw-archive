# OM Decision Record - Graph Memory Lite (2026-02-17)

## 1. Context & Problem

**The Issue:** "Semantic Amnesia."
Current vector search finds _similar text_ but fails to track _structural facts_.

- Example: "Alice manages Auth."
- Vector Search finds text about "Alice" and "Auth".
- It does _not_ know that `Alice` **IS_MANAGER_OF** `Auth`.

**The Constraint:**
We rejected external solutions (e.g., Cognee) to avoid Docker dependencies and keep the "Body" runtime lightweight and portable.

## 2. The Solution: "Graph Lite"

We will implement a relational graph directly in Om's existing SQLite brain (`logs/brain/episodic-memory.sqlite`), enabling fact tracking without new infrastructure.

## 3. Database Schema

We will add a single new table `semantic_relationships` to the existing DB.

```sql
CREATE TABLE semantic_relationships (
  id TEXT PRIMARY KEY,            -- UUID
  source_entity TEXT NOT NULL,    -- e.g. "Alice" (normalized)
  predicate TEXT NOT NULL,        -- e.g. "MANAGES", "IS_A", "LOCATED_IN"
  target_entity TEXT NOT NULL,    -- e.g. "Auth Team"
  confidence REAL DEFAULT 1.0,    -- 0.0 to 1.0
  source_file TEXT,               -- provenance: which file/session contained this?
  created_at INTEGER              -- timestamp
);

-- Indices for fast triple-store traversal
CREATE INDEX idx_rel_source ON semantic_relationships(source_entity);
CREATE INDEX idx_rel_target ON semantic_relationships(target_entity);
CREATE INDEX idx_rel_predicate ON semantic_relationships(predicate);
```

## 4. Integration Logic

### A. Write Path (Ingestion)

- **Where:** `src/brain/memory-ingestion.ts`
- **Trigger:** When a session is saved or a "Decision" is made.
- **Logic:**
  1.  Use a lightweight LLM pass (or strict RegEx for now) to extract triples from "Significance" turns.
  2.  _Prompt:_ "Extract facts as (Entity, Relation, Entity) triples."
  3.  _Action:_ `INSERT INTO semantic_relationships ...`

### B. Read Path (Recall)

- **Where:** `src/brain/recall.ts` (or equivalent decision logic)
- **Trigger:** When `BrainRecallRoute` is `project` or `identity`.
- **Logic:**
  1.  Extract entities from User Query (e.g., "Grant access to Alice").
  2.  Query 1: `SELECT * FROM relationships WHERE source = 'Alice'` -> returns `(Alice, MANAGES, Auth)`.
  3.  Inject into Context: "Context: Alice manages the Auth Team."

## 5. Why this is better

1.  **Zero Dep:** No Docker, no Neo4j, no Python server. Just SQLite.
2.  **Portable:** Moves with the `.openclaw` folder.
3.  **Specific:** We define the predicates relevant to Om (e.g., `DEFINES_RITUAL`, `BLOCKS_PROJECT`).

## 6. Implementation Steps (Phase B)

1.  [ ] Schema Migration (add table).
2.  [ ] Implement `GraphManager` (TS class to read/write triples).
3.  [ ] Add "Fact Extraction" step to `scoreTurnSignificance`.
4.  [ ] Add "Graph Traversal" step to `BrainRecall`.
