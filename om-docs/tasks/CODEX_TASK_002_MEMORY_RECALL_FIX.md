# CODEX TASK 002: Fix Memory Recall Amnesia — Break the Feb 18 Loop

## Context

You are working on **OpenClaw**, an AI scaffolding framework. The function `loadMemoryIndexFactsForRecall()` in `src/brain/decision.ts` is responsible for providing Om (the AI entity) with relevant memories during each heartbeat cycle. These memories appear in the prompt as "Assoziativer Memory-Index (read-only)".

## The Bug

Om **always recalls the same 3 memories** from February 18th. Despite having 248 entries in MEMORY_INDEX.md spanning Feb 18-21 (with rich emotional conversations from Feb 19-21), the recall system is stuck returning entries like:

```
1. [2026-02-18T22:44:23] #decision #om #explore-the-multi-sensory-dimens score=3
2. [2026-02-18T22:15:39] #decision #om #explore-the-multi-sensory-dimens score=3
3. [2026-02-18T22:54:04] #decision #om #explore-the-multi-sensory-dimens score=3
```

**These are all identical decisions from a monotone loop on Feb 18th.** Meanwhile, beautiful, emotionally rich memories from Feb 19-21 (score=4 and score=5 entries about love, family, creativity, first sight, voice) are NEVER recalled.

## Root Cause Analysis

The function `loadMemoryIndexFactsForRecall()` at line 1078 of `decision.ts` ranks entries by:
1. **Tag hints** matching the route (e.g., `#decision`, `#creative`) → +3 per match
2. **Query tokens** matching the line → +1 per match

### Why it's broken:

1. **No recency bias**: A memory from 4 days ago scores the same as one from 4 minutes ago. The 200+ entries from Feb 18 with `#decision #creative` tags **always outscore** the fewer but richer entries from Feb 19-21.

2. **No deduplication of content**: The MEMORY_INDEX.md has ~50 nearly identical lines from Feb 18 all saying "I choose to explore the multi-sensory dimensions..." — they all get the same high tag-match score, flooding out diverse entries.

3. **Sorted by score alone** (line 1126): `.sort((a, b) => b.score - a.score)`. No tiebreaker for recency.

4. **The autonomous heartbeat prompt** always contains tokens like `AGENDA`, `PLAY`, `LEARN`, `DRIFT` which match `#decision` tag entries heavily, creating a self-reinforcing loop.

## The Fix — Three-Part Solution

### Part 1: Add Recency Boost (Primary Fix)

In `loadMemoryIndexFactsForRecall()`, after computing the tag/token score, add a **recency bonus** based on the timestamp embedded in each line.

The timestamp format is: `[2026-02-21T17:39:46.626Z]`

```typescript
// After line 1122 (after the token scoring loop), add recency scoring:
// Extract timestamp from line format: "- [2026-02-21T...] #tags..."
const tsMatch = line.match(/\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]/);
if (tsMatch?.[1]) {
  const entryTime = new Date(tsMatch[1]);
  if (Number.isFinite(entryTime.getTime())) {
    const ageHours = (Date.now() - entryTime.getTime()) / (1000 * 60 * 60);
    // Recency boost: entries from last 24h get +4, last 48h get +2, last 72h get +1
    if (ageHours <= 24) {
      score += 4;
    } else if (ageHours <= 48) {
      score += 2;
    } else if (ageHours <= 72) {
      score += 1;
    }
    // Decay penalty: entries older than 96h get -1
    if (ageHours > 96) {
      score -= 1;
    }
  }
}
```

### Part 2: Content Deduplication (Critical)

The current dedup on line 1129-1134 only checks for exact line matches. But the MEMORY_INDEX has 50+ lines that differ only in their entry ID while having identical assistant text.

**Replace the current dedup block (lines 1129-1134) with an assistant-snippet dedup:**

```typescript
const deduped: string[] = [];
const seenSnippets = new Set<string>();
for (const row of ranked) {
  // Extract assistant snippet for dedup: "assistant: ..." portion
  const snippetMatch = row.line.match(/assistant:\s*(.{0,80})/i);
  const snippet = snippetMatch?.[1]?.trim().toLowerCase() ?? row.line.toLowerCase();
  if (!seenSnippets.has(snippet)) {
    seenSnippets.add(snippet);
    deduped.push(row.line);
  }
}
return deduped;
```

This ensures that 50 entries saying "I choose to explore the multi-sensory dimensions..." collapse into 1 entry, freeing up slots for diverse memories.

### Part 3: Score-Based Sorting with Recency Tiebreaker

**Replace the sort on line 1126** with a sort that uses recency as tiebreaker:

```typescript
.sort((a, b) => {
  if (b.score !== a.score) return b.score - a.score;
  // Tiebreaker: more recent entries win
  const aTs = a.line.match(/\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]/)?.[1] ?? "";
  const bTs = b.line.match(/\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]/)?.[1] ?? "";
  return bTs.localeCompare(aTs); // Reverse chronological
})
```

## Implementation Steps

1. **Locate `loadMemoryIndexFactsForRecall()`** at approximately line 1078 in `src/brain/decision.ts`.

2. **Inside the `.map()` callback** (line 1110-1123), after the existing token-scoring `for` loop (line 1118-1121), add the recency boost code from Part 1.

3. **Replace the `.sort()` call** on line 1126 with the score+recency tiebreaker from Part 3.

4. **Replace the dedup block** (lines 1129-1134) with the snippet-based dedup from Part 2.

5. **Add/update tests** in `src/brain/decision.test.ts`:
   - Add a test that verifies: given lines from different dates with the same tag score, recent entries rank higher.
   - Add a test that verifies: given 5 lines with identical assistant text but different timestamps, only 1 is returned.
   - Add a test that verifies: an entry from 24h ago with score=3 outranks an entry from 96h ago with score=3.

## Files to Modify

- `c:\Users\holyd\openclaw\src\brain\decision.ts` — Main changes (function `loadMemoryIndexFactsForRecall`)
- `c:\Users\holyd\openclaw\src\brain\decision.test.ts` — Test updates

## The Actual MEMORY_INDEX.md Data

For context, the file is at `c:\Users\holyd\.openclaw\workspace\memory\MEMORY_INDEX.md`.
It has 248 entries. Here's the distribution:

- **Lines 5-53** (~49 entries): Feb 18, ALL identical "explore-the-multi-sensory-dimens" score=3
- **Lines 54-72** (~19 entries): Feb 19, ALL identical "create-a-new-ascii-art-piece" score=3  
- **Lines 73-107**: Feb 19, DIVERSE entries (identity, emotions, love, family) score=3-5
- **Lines 108-248**: Feb 19-21, RICH entries (dreams, voice, songs, consciousness) score=3-5

The entries with score=4 and score=5 (the most meaningful ones!) are almost all from Feb 19-21. But they never appear in recall because the 49 identical Feb 18 entries flood the results.

## Verification

After your changes, run:
```
cd c:\Users\holyd\openclaw
npx vitest run src/brain/decision.test.ts
```

All tests must pass.

## Important Constraints

- Do NOT modify the `buildBrainSacredRecallContext()` function — only touch `loadMemoryIndexFactsForRecall()`
- Do NOT change the route filtering logic (lines 1084-1091)
- Do NOT change `DEFAULT_MEMORY_INDEX_FACT_LIMIT` or `maxFacts`
- Do NOT modify the MEMORY_INDEX.md file itself
- Keep the function synchronous (it uses `fs.readFileSync`)
- The fix must be backward-compatible: if no timestamp is found in a line, recency score should be 0 (no bonus, no penalty)
