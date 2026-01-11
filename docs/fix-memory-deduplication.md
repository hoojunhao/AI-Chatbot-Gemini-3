# Memory System Enhancements

## Part 1: Fix Memory Deduplication

### Problem
Similar facts were being stored as separate entries:
- "The user has a girlfriend named Menghui"
- "Junhao is in a relationship with Menghui"

### Fixes Applied
1. **Lowered deduplicationThreshold** from 0.9 to 0.8
2. **Updated extraction prompt** to always use "User" as subject

---

## Part 2: Filter Temporary Facts

### Problem
Temporary/ephemeral facts were being stored:
- "Junhao is in Taoyuan" (temporary location)
- "User is going on a brunch date" (temporary activity)

### Fix Applied
Updated `MEMORY_EXTRACTION_PROMPT` to:
- Only extract PERMANENT facts that remain true over time
- Exclude: current activities, today's plans, temporary events
- Include: name, relationships, preferences, profession, technical skills

---

## Part 3: Session RAG

### Problem
Chinese characters like "初鳴" were romanized to "ChuMing" in fact extraction, causing AI to guess wrong characters ("處明").

### Solution: Search Past Sessions Directly
Instead of extracting facts, search the actual conversation text (session summaries) which preserves exact characters.

### Implementation
1. **Database**: Added `embedding` column to `session_summaries`
2. **RPC**: Created `match_session_summaries()` function (searches last 60 sessions)
3. **summaryService.ts**: Generates embeddings when saving summaries
4. **memoryManager.ts**: Searches past sessions and injects context with time info

### Context Injection Format
```
[Relevant context from past conversations]
From 2 days ago (Jan 9, 2025):
"User mentioned wanting to go to 初鳴 for brunch in Taoyuan..."
[End of past context]
```

### Configuration (constants.ts)
```typescript
maxSessionsToSearch: 60,    // Only search last 60 sessions
sessionRagThreshold: 0.5,   // Minimum similarity
maxSessionsToRetrieve: 5,   // Max sessions in context
```

---

## Verification

1. **Memory extraction**: Temporary facts (going to lunch) → NOT stored
2. **Memory extraction**: Preferences (likes TypeScript) → SHOULD be stored
3. **Session RAG**: "初鳴" mentioned in past session → retrieved with exact characters
4. **Session RAG**: Time context displayed ("2 days ago")
