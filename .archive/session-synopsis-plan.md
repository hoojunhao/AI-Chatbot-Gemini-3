# Session Synopsis Implementation Plan

## Overview

Add lightweight session synopsis generation to enable Session RAG for all sessions, not just those that exceed the 50k token summarization threshold.

---

## Problem

Currently, Session RAG only works for sessions with summaries (conversations exceeding 50k tokens). Short conversations are not searchable.

```
Session A: User mentions "初鳴" brunch place (short, ~5k tokens)
           → No summary generated (below 50k threshold)
           → No embedding stored
           → Session RAG can't find it
```

---

## Solution: Lightweight Session Synopsis

Generate a brief synopsis (~200 tokens) for sessions on:
1. **Session Switch** - When user switches to a different session
2. **Idle Timeout** - After 60 minutes of inactivity

---

## Configuration

```typescript
// constants.ts
export const SYNOPSIS_CONFIG = {
  idleTimeoutMs: 60 * 60 * 1000,  // 60 minutes
  minMessages: 1,                  // No minimum - even 1 message gets synopsis
};

export const SYNOPSIS_PROMPT = `Summarize this conversation in 2-3 sentences. Focus on:
- Key topics discussed
- Names, places, or specific items mentioned (preserve exact spelling/characters)
- Any decisions or plans made

Keep it under 100 words. Preserve non-English text exactly as written.

Conversation:
`;
```

---

## Trigger Mechanisms

### 1. Session Switch Trigger

```typescript
// App.tsx or useSessionSwitch hook
const previousSessionIdRef = useRef<string | null>(null);

useEffect(() => {
  if (previousSessionIdRef.current &&
      previousSessionIdRef.current !== currentSessionId) {
    // Generate synopsis for the session we're leaving
    generateSynopsisIfNeeded(
      previousSessionIdRef.current,
      previousSessionMessages,
      apiKey
    );
  }
  previousSessionIdRef.current = currentSessionId;
}, [currentSessionId]);
```

### 2. Idle Timeout Trigger

```typescript
// useIdleTimer hook
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

function useIdleTimer(onIdle: () => void) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(onIdle, IDLE_TIMEOUT_MS);
  }, [onIdle]);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [resetTimer]);
}
```

---

## Core Logic

### generateSynopsisIfNeeded()

Handles all cases:
1. No summary exists → Generate new synopsis
2. Summary exists, no new messages → Skip
3. Summary exists, has new messages → Append mini-synopsis

```typescript
// services/synopsisService.ts
async function generateSynopsisIfNeeded(
  sessionId: string,
  messages: Message[],
  apiKey: string
): Promise<void> {
  const existingSummary = await SummaryService.getSummary(sessionId);
  const validMessages = messages.filter(m => !m.isError);

  // Case 1: No summary exists → generate full synopsis
  if (!existingSummary) {
    if (validMessages.length === 0) return;

    const synopsis = await generateSynopsis(apiKey, validMessages);
    await SummaryService.saveSummary(
      sessionId,
      synopsis,
      validMessages.length,
      apiKey  // Generates embedding
    );
    console.log('📝 Generated synopsis for session');
    return;
  }

  // Case 2: Summary exists → check for new messages
  const summarizedCount = existingSummary.messagesSummarizedCount;
  const newMessages = validMessages.slice(summarizedCount);

  if (newMessages.length === 0) {
    console.log('✓ Session already up-to-date');
    return;
  }

  // Case 3: Append mini-synopsis for new messages
  const miniSynopsis = await generateSynopsis(apiKey, newMessages);
  const updatedText = `${existingSummary.summaryText}\n\n[Additional context:]\n${miniSynopsis}`;

  await SummaryService.saveSummary(
    sessionId,
    updatedText,
    validMessages.length,  // Update count
    apiKey  // Regenerates embedding
  );

  console.log(`📝 Appended ${newMessages.length} new messages to synopsis`);
}
```

### generateSynopsis()

Lightweight AI call for synopsis generation:

```typescript
async function generateSynopsis(
  apiKey: string,
  messages: Message[]
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  const conversationText = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n\n');

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',  // Fast, cheap
    contents: [{ role: 'user', parts: [{ text: SYNOPSIS_PROMPT + conversationText }] }],
    config: {
      temperature: 0.3,
      maxOutputTokens: 200
    }
  });

  return response.text || '';
}
```

---

## Deduplication Strategy

Use database check instead of in-memory Set (handles page refresh, multiple tabs):

```typescript
async function shouldGenerateSynopsis(
  sessionId: string,
  messageCount: number
): Promise<boolean> {
  const existing = await SummaryService.getSummary(sessionId);

  if (!existing) {
    return messageCount > 0;
  }

  return messageCount > existing.messagesSummarizedCount;
}
```

---

## Scenarios Handled

### Scenario 1: New Short Session
```
Session A: User chats 3 messages
Switch to B → Synopsis generated for A (3 messages)
```

### Scenario 2: Return to Past Session
```
Session A: Messages 1-5, synopsis generated
Switch to B
Switch back to A: Messages 6-10
Switch to C → Synopsis UPDATED (appends messages 6-10)
```

### Scenario 3: Session with Full Summary + New Messages
```
Session A: 100 messages, full summary at msg 80
User adds messages 81-90 (below re-summarization threshold)
Switch to B → Mini-synopsis appended for messages 81-90
```

### Scenario 4: Idle Timeout
```
Session A: User chats → 60 min idle → Synopsis generated
User returns → chats more → 60 min idle → Synopsis UPDATED
```

---

## State Diagram

```
Trigger (Session Switch / Idle Timeout)
              │
              ▼
      Has Summary in DB?
       ┌──────┴──────┐
       No            Yes
       │              │
       ▼              ▼
   Has Messages?   New Messages Since Last Summary?
    ┌──┴──┐        ┌──────┴──────┐
    No   Yes       No            Yes
    │     │        │              │
    ▼     ▼        ▼              ▼
  Skip  Generate  Skip      Append Mini-Synopsis
        Synopsis              │
          │                   │
          └─────────┬─────────┘
                    ▼
           Save with Embedding
           (for Session RAG)
```

---

## Files to Create/Modify

| File | Changes |
|------|---------|
| `constants.ts` | Add `SYNOPSIS_CONFIG` and `SYNOPSIS_PROMPT` |
| `services/synopsisService.ts` | NEW - Synopsis generation logic |
| `hooks/useIdleTimer.ts` | NEW - Idle timeout detection |
| `hooks/useSessionSynopsis.ts` | NEW - Combines triggers + generation |
| `components/App.tsx` | Integrate `useSessionSynopsis` hook |

---

## Cost Analysis

| Item | Cost |
|------|------|
| Synopsis generation | ~200 input + 100 output tokens per session |
| Embedding generation | 1 embedding API call per synopsis |
| Estimated cost | ~$0.0001 per session (negligible) |

---

## Verification

1. **Short session**: Create session with 2 messages, switch away → synopsis generated
2. **Return to session**: Go back to session, add messages, switch away → synopsis updated
3. **Idle timeout**: Stay on session 60 min idle → synopsis generated
4. **RAG search**: New session, ask about topic from short past session → found via RAG
5. **Chinese characters**: Mention "初鳴" in short session → preserved in synopsis, found via RAG

---

## Implementation Order

1. Add config to `constants.ts`
2. Create `synopsisService.ts` with core logic
3. Create `useIdleTimer.ts` hook
4. Create `useSessionSynopsis.ts` hook
5. Integrate in `App.tsx`
6. Test all scenarios
