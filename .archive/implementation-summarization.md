# Implementation Guide: Periodic Message Summarization

## Overview

This guide details how to implement **periodic message summarization** to manage long conversations. Instead of discarding old messages, we use the Gemini API to create intelligent summaries that preserve context while reducing token usage.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Architecture](#solution-architecture)
3. [Database Schema Changes](#database-schema-changes)
4. [Implementation Steps](#implementation-steps)
5. [Code Changes](#code-changes)
6. [Summarization Strategies](#summarization-strategies)
7. [Testing](#testing)

---

## Problem Statement

### Current Behavior

When sliding window truncates old messages, valuable context is lost:

```
Original: [msg1, msg2, ... msg100]
                    ↓ Sliding Window
Sent:     [msg81, msg82, ... msg100]

Lost Context:
- Initial problem description
- Important decisions made
- Code snippets discussed
- User preferences mentioned
```

### Solution: Summarization

```
Original: [msg1, msg2, ... msg100]
                    ↓ Summarize + Window
Sent:     [SUMMARY of msg1-80] + [msg81, ... msg100]

Preserved:
- Key context from entire conversation
- Recent messages in full detail
```

---

## Solution Architecture

### Rolling Summarization Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    SUMMARIZATION PIPELINE                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Messages 1-30:   No summary needed                         │
│       ↓                                                     │
│  Messages 31-60:  Summarize msgs 1-30 → Summary v1          │
│       ↓                                                     │
│  Messages 61-90:  Summarize msgs 31-60 + Summary v1         │
│                   → Summary v2                              │
│       ↓                                                     │
│  API Call:        [Summary v2] + [msgs 61-90]               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### When to Summarize

| Trigger | Description |
|---------|-------------|
| **Message count threshold** | Every N messages (e.g., 30) |
| **Token threshold** | When context exceeds X tokens |
| **Before API call** | On-demand when sending to Gemini |
| **Background job** | Periodic cleanup (advanced) |

---

## Database Schema Changes

### New Table: `session_summaries`

```sql
-- Supabase migration
CREATE TABLE session_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,
  messages_summarized_count INTEGER NOT NULL DEFAULT 0,
  last_message_id UUID REFERENCES messages(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(session_id)
);

-- Index for fast lookups
CREATE INDEX idx_session_summaries_session_id ON session_summaries(session_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_session_summary_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER session_summaries_updated_at
  BEFORE UPDATE ON session_summaries
  FOR EACH ROW
  EXECUTE FUNCTION update_session_summary_timestamp();
```

---

## Implementation Steps

### Step 1: Add Types

**File: `types.ts`**

```typescript
// Add to existing types.ts

export interface SessionSummary {
  id: string;
  sessionId: string;
  summaryText: string;
  messagesSummarizedCount: number;
  lastMessageId?: string;
  version: number;
  updatedAt: number;
}

export interface SummarizationConfig {
  // Trigger summarization after this many new messages
  summarizeThreshold: number;
  // Number of recent messages to keep unsummarized
  recentMessagesToKeep: number;
  // Maximum length for summary text
  maxSummaryLength: number;
  // Model to use for summarization (can be cheaper/faster model)
  summarizationModel: string;
}
```

### Step 2: Add Configuration

**File: `constants.ts`**

```typescript
// Add to existing constants.ts

import { SummarizationConfig } from './types';

export const SUMMARIZATION_CONFIG: SummarizationConfig = {
  // Summarize when 30+ new messages since last summary
  summarizeThreshold: 30,

  // Always keep last 15 messages in full
  recentMessagesToKeep: 15,

  // Summary should be concise
  maxSummaryLength: 2000,

  // Use flash model for cost-effective summarization
  summarizationModel: 'gemini-2.0-flash',
};

// Prompts for summarization
export const SUMMARIZATION_PROMPTS = {
  initial: `Summarize this conversation concisely. Preserve:
- The main topic/problem being discussed
- Key decisions or solutions agreed upon
- Important code snippets or technical details
- User preferences or requirements mentioned
- Any unresolved questions or action items

Keep the summary under 500 words. Format as a clear, structured summary.

Conversation:
`,

  incremental: `You have an existing summary of an earlier conversation, and new messages to incorporate.
Create an updated comprehensive summary that:
- Integrates the new information with the existing summary
- Removes any outdated or superseded information
- Preserves the most important context
- Stays concise (under 500 words)

Existing Summary:
{existingSummary}

New Messages to Incorporate:
{newMessages}

Updated Summary:
`,
};
```

### Step 3: Create Summary Service

**File: `services/summaryService.ts`**

```typescript
import { GoogleGenAI } from "@google/genai";
import { supabase } from './supabase';
import { Message, SessionSummary } from '../types';
import { SUMMARIZATION_CONFIG, SUMMARIZATION_PROMPTS } from '../constants';

/**
 * Summary Service
 *
 * Manages conversation summaries using Google GenAI SDK
 * for intelligent context compression.
 */
export class SummaryService {

  // ============================================
  // Database Operations
  // ============================================

  /**
   * Fetch existing summary for a session
   */
  static async getSummary(sessionId: string): Promise<SessionSummary | null> {
    const { data, error } = await supabase
      .from('session_summaries')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      sessionId: data.session_id,
      summaryText: data.summary_text,
      messagesSummarizedCount: data.messages_summarized_count,
      lastMessageId: data.last_message_id,
      version: data.version,
      updatedAt: new Date(data.updated_at).getTime(),
    };
  }

  /**
   * Save or update summary for a session
   */
  static async saveSummary(
    sessionId: string,
    summaryText: string,
    messagesSummarizedCount: number,
    lastMessageId?: string
  ): Promise<void> {
    const existing = await this.getSummary(sessionId);

    if (existing) {
      // Update existing summary
      const { error } = await supabase
        .from('session_summaries')
        .update({
          summary_text: summaryText,
          messages_summarized_count: messagesSummarizedCount,
          last_message_id: lastMessageId,
          version: existing.version + 1,
        })
        .eq('session_id', sessionId);

      if (error) throw error;
    } else {
      // Create new summary
      const { error } = await supabase
        .from('session_summaries')
        .insert({
          session_id: sessionId,
          summary_text: summaryText,
          messages_summarized_count: messagesSummarizedCount,
          last_message_id: lastMessageId,
          version: 1,
        });

      if (error) throw error;
    }
  }

  /**
   * Delete summary when session is deleted
   */
  static async deleteSummary(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('session_summaries')
      .delete()
      .eq('session_id', sessionId);

    if (error) throw error;
  }

  // ============================================
  // Summarization Logic
  // ============================================

  /**
   * Check if summarization is needed
   */
  static async needsSummarization(
    sessionId: string,
    totalMessages: number
  ): Promise<boolean> {
    const summary = await this.getSummary(sessionId);
    const summarizedCount = summary?.messagesSummarizedCount || 0;
    const newMessageCount = totalMessages - summarizedCount;

    return newMessageCount >= SUMMARIZATION_CONFIG.summarizeThreshold;
  }

  /**
   * Generate summary using Gemini API
   */
  static async generateSummary(
    apiKey: string,
    messages: Message[],
    existingSummary?: string
  ): Promise<string> {
    const ai = new GoogleGenAI({ apiKey });

    // Format messages for the prompt
    const formattedMessages = messages
      .filter(msg => !msg.isError)
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
      .join('\n\n');

    let prompt: string;

    if (existingSummary) {
      // Incremental summarization
      prompt = SUMMARIZATION_PROMPTS.incremental
        .replace('{existingSummary}', existingSummary)
        .replace('{newMessages}', formattedMessages);
    } else {
      // Initial summarization
      prompt = SUMMARIZATION_PROMPTS.initial + formattedMessages;
    }

    try {
      const response = await ai.models.generateContent({
        model: SUMMARIZATION_CONFIG.summarizationModel,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature: 0.3, // Lower temperature for more consistent summaries
          maxOutputTokens: 1024,
        }
      });

      const summaryText = response.text || '';

      // Truncate if too long
      if (summaryText.length > SUMMARIZATION_CONFIG.maxSummaryLength) {
        return summaryText.substring(0, SUMMARIZATION_CONFIG.maxSummaryLength) + '...';
      }

      return summaryText;
    } catch (error) {
      console.error('Summarization failed:', error);
      throw error;
    }
  }

  /**
   * Main summarization workflow
   *
   * Checks if summarization is needed and performs it if so.
   * Returns the summary text (existing or newly generated).
   */
  static async summarizeIfNeeded(
    apiKey: string,
    sessionId: string,
    allMessages: Message[]
  ): Promise<SessionSummary | null> {
    const totalMessages = allMessages.filter(m => !m.isError).length;

    // Check if we need to summarize
    if (!(await this.needsSummarization(sessionId, totalMessages))) {
      // Return existing summary if available
      return await this.getSummary(sessionId);
    }

    console.log(`Summarizing session ${sessionId}: ${totalMessages} messages`);

    // Get existing summary
    const existingSummary = await this.getSummary(sessionId);
    const alreadySummarizedCount = existingSummary?.messagesSummarizedCount || 0;

    // Determine which messages to summarize
    // Keep the most recent messages unsummarized
    const messagesToKeep = SUMMARIZATION_CONFIG.recentMessagesToKeep;
    const cutoffIndex = Math.max(0, totalMessages - messagesToKeep);

    // Messages that need to be added to summary
    const messagesToSummarize = allMessages
      .filter(m => !m.isError)
      .slice(alreadySummarizedCount, cutoffIndex);

    if (messagesToSummarize.length === 0) {
      return existingSummary;
    }

    // Generate new summary
    const newSummary = await this.generateSummary(
      apiKey,
      messagesToSummarize,
      existingSummary?.summaryText
    );

    // Get the last message ID that was summarized
    const lastSummarizedMessage = messagesToSummarize[messagesToSummarize.length - 1];

    // Save to database
    await this.saveSummary(
      sessionId,
      newSummary,
      cutoffIndex,
      lastSummarizedMessage?.id
    );

    // Return updated summary
    return await this.getSummary(sessionId);
  }

  /**
   * Build context with summary + recent messages
   *
   * This is what gets sent to the Gemini API
   */
  static async buildContextWithSummary(
    apiKey: string,
    sessionId: string,
    allMessages: Message[]
  ): Promise<Message[]> {
    // Perform summarization if needed
    const summary = await this.summarizeIfNeeded(apiKey, sessionId, allMessages);

    const validMessages = allMessages.filter(m => !m.isError);

    if (!summary) {
      // No summary, return all messages (for short conversations)
      return validMessages;
    }

    // Get messages that weren't summarized
    const recentMessages = validMessages.slice(summary.messagesSummarizedCount);

    // Create a synthetic message containing the summary
    const summaryMessage: Message = {
      id: 'context-summary',
      role: 'user',
      text: `[Previous conversation summary]\n${summary.summaryText}\n[End of summary - conversation continues below]`,
      timestamp: recentMessages[0]?.timestamp - 1 || Date.now(),
      isError: false
    };

    // Also add an acknowledgment from the assistant
    const ackMessage: Message = {
      id: 'context-summary-ack',
      role: 'model',
      text: 'I understand the context from our previous conversation. Let me continue helping you.',
      timestamp: recentMessages[0]?.timestamp - 1 || Date.now(),
      isError: false
    };

    return [summaryMessage, ackMessage, ...recentMessages];
  }
}
```

### Step 4: Update Gemini Service

**File: `services/geminiService.ts`**

```typescript
import { GoogleGenAI, Content, Part, GenerateContentParameters } from "@google/genai";
import { AppSettings, Message, ModelType } from "../types";
import { SummaryService } from "./summaryService";

export const generateResponseStream = async function* (
  apiKey: string,
  settings: AppSettings,
  history: Message[],
  newMessage: string,
  attachments: { mimeType: string; data: string }[] = [],
  sessionId?: string  // Add sessionId parameter for summarization
) {
  if (!apiKey) throw new Error("API Key is missing");

  const ai = new GoogleGenAI({ apiKey });

  // Construct parts for the new message
  const parts: Part[] = [];

  attachments.forEach(att => {
    parts.push({
      inlineData: {
        mimeType: att.mimeType,
        data: att.data
      }
    });
  });

  parts.push({ text: newMessage });

  // Construct history with SUMMARIZATION if memory is enabled
  let contents: Content[] = [];

  if (settings.enableMemory) {
    let contextMessages: Message[];

    if (sessionId) {
      // Use summarization for context management
      contextMessages = await SummaryService.buildContextWithSummary(
        apiKey,
        sessionId,
        history
      );
      console.log(`Context: ${contextMessages.length} messages (with summary)`);
    } else {
      // Fallback: no summarization (guest users)
      contextMessages = history.filter(msg => !msg.isError);
    }

    // Convert to Content format for Gemini API
    contents = contextMessages.map(msg => ({
      role: msg.role,
      parts: msg.attachments
        ? [...msg.attachments.map(a => ({
            inlineData: { mimeType: a.mimeType, data: a.data }
          })), { text: msg.text }]
        : [{ text: msg.text }]
    }));
  }

  // Add the new message
  contents.push({ role: 'user', parts });

  // Generation Config
  const config: any = {
    systemInstruction: settings.systemInstruction,
    temperature: settings.temperature,
    safetySettings: [
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: settings.safetySettings.sexuallyExplicit },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: settings.safetySettings.hateSpeech },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: settings.safetySettings.harassment },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: settings.safetySettings.dangerousContent },
    ]
  };

  if (settings.model === ModelType.GEMINI_3_FLASH) {
    config.thinkingConfig = {
      includeThoughts: true,
      thinkingLevel: settings.thinkingLevel === 'HIGH' ? "high" : "low"
    };
  }

  try {
    const params: GenerateContentParameters = {
      model: settings.model,
      contents: contents,
      config: config
    };

    const responseStream = await ai.models.generateContentStream(params);

    let hasYielded = false;

    for await (const chunk of responseStream) {
      const parts = chunk.candidates?.[0]?.content?.parts;

      if (parts) {
        for (const part of parts) {
          // @ts-ignore
          if (part.thought) {
            // @ts-ignore
            const thoughtText = typeof part.thought === 'string' ? part.thought : part.text;
            if (thoughtText) {
              yield `<thinking>${thoughtText}</thinking>`;
            }
          } else if (part.text) {
            yield part.text;
          }
        }
      } else {
        const text = chunk.text;
        if (text) {
          hasYielded = true;
          yield text;
        }
      }

      if (parts && parts.length > 0) {
        hasYielded = true;
      }
    }

    if (!hasYielded) {
      yield "I'm unable to generate a response for this request. It might have been flagged by safety filters.";
    }

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
```

### Step 5: Update App.tsx to Pass Session ID

**File: `components/App.tsx` (partial update)**

```typescript
// In the handleSendMessage function, update the generateResponseStream call:

const stream = generateResponseStream(
  apiKey,
  settings,
  existingMessages,
  currentInput,
  currentAttachments,
  activeSessionId  // Pass session ID for summarization
);
```

---

## Summarization Strategies

### Strategy 1: Threshold-Based (Implemented Above)

Summarize every N messages.

```
Messages 1-30:  Full messages sent
Messages 31-60: Summary of 1-30 + messages 31-60
Messages 61-90: Summary of 1-60 + messages 61-90
```

**Pros:** Predictable, easy to implement
**Cons:** May summarize when not needed

### Strategy 2: Token-Based

Summarize when estimated tokens exceed threshold.

```typescript
static async needsSummarization(
  sessionId: string,
  messages: Message[]
): Promise<boolean> {
  const totalTokens = estimateTotalTokens(messages);
  const threshold = 50000; // tokens

  return totalTokens > threshold;
}
```

**Pros:** More accurate context management
**Cons:** Requires token estimation

### Strategy 3: Smart Summarization

Detect conversation topic changes and summarize at natural breakpoints.

```typescript
static async findSummarizationBreakpoint(
  apiKey: string,
  messages: Message[]
): Promise<number> {
  // Use Gemini to detect topic changes
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Analyze this conversation and identify where the main topic changes.
Return the message number where summarizing earlier content would be most natural.

${messages.map((m, i) => `${i + 1}. ${m.role}: ${m.text.slice(0, 100)}...`).join('\n')}

Best breakpoint message number:`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });

  return parseInt(response.text || '30');
}
```

**Pros:** Most natural summaries
**Cons:** Extra API calls, more complex

---

## Advanced: Background Summarization Hook

For better UX, summarize in the background after responses.

**File: `hooks/useSummarization.ts`**

```typescript
import { useEffect, useRef } from 'react';
import { SummaryService } from '../services/summaryService';
import { Message } from '../types';

export function useSummarization(
  apiKey: string | null,
  sessionId: string | null,
  messages: Message[],
  isGenerating: boolean
) {
  const summarizationTimeout = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Don't summarize while generating or if missing required data
    if (!apiKey || !sessionId || isGenerating) return;

    // Clear any pending summarization
    if (summarizationTimeout.current) {
      clearTimeout(summarizationTimeout.current);
    }

    // Wait a bit after the last message before summarizing
    // This prevents summarizing during rapid exchanges
    summarizationTimeout.current = setTimeout(async () => {
      try {
        const needsSummary = await SummaryService.needsSummarization(
          sessionId,
          messages.length
        );

        if (needsSummary) {
          console.log('Background summarization started');
          await SummaryService.summarizeIfNeeded(apiKey, sessionId, messages);
          console.log('Background summarization completed');
        }
      } catch (error) {
        console.error('Background summarization failed:', error);
        // Don't throw - this is a background operation
      }
    }, 5000); // Wait 5 seconds after last activity

    return () => {
      if (summarizationTimeout.current) {
        clearTimeout(summarizationTimeout.current);
      }
    };
  }, [apiKey, sessionId, messages.length, isGenerating]);
}

// Usage in App.tsx:
// useSummarization(apiKey, currentSessionId, currentSession?.messages || [], isGenerating);
```

---

## Testing

### Unit Tests

**File: `services/summaryService.test.ts`**

```typescript
import { SummaryService } from './summaryService';
import { Message } from '../types';

describe('SummaryService', () => {
  const createMockMessages = (count: number): Message[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'model',
      text: `This is message ${i} with some content about topic ${Math.floor(i / 10)}`,
      timestamp: Date.now() + i,
      isError: false
    }));

  describe('needsSummarization', () => {
    it('returns false for short conversations', async () => {
      const needs = await SummaryService.needsSummarization('session-1', 10);
      expect(needs).toBe(false);
    });

    it('returns true when threshold exceeded', async () => {
      const needs = await SummaryService.needsSummarization('session-1', 50);
      expect(needs).toBe(true);
    });
  });

  describe('buildContextWithSummary', () => {
    it('returns all messages for short conversations', async () => {
      const messages = createMockMessages(10);
      const context = await SummaryService.buildContextWithSummary(
        'api-key',
        'session-1',
        messages
      );

      expect(context.length).toBe(10);
    });
  });
});
```

### Integration Test

```typescript
describe('Summarization Integration', () => {
  it('summarizes and rebuilds context correctly', async () => {
    // Create a long conversation
    const messages = createMockMessages(100);

    // Build context (should trigger summarization)
    const context = await SummaryService.buildContextWithSummary(
      process.env.GEMINI_API_KEY!,
      'test-session',
      messages
    );

    // Context should be shorter than original
    expect(context.length).toBeLessThan(100);

    // First message should be the summary
    expect(context[0].text).toContain('[Previous conversation summary]');

    // Recent messages should be preserved
    const lastOriginal = messages[messages.length - 1];
    const lastContext = context[context.length - 1];
    expect(lastContext.id).toBe(lastOriginal.id);
  });
});
```

---

## Summary

This summarization implementation:

1. **Preserves context** - Important information is never lost
2. **Reduces tokens** - Summaries are much shorter than full messages
3. **Uses Gemini API** - Leverages AI for intelligent summarization
4. **Persists summaries** - Stored in database for reuse
5. **Works incrementally** - Builds on previous summaries
6. **Background processing** - Doesn't block user interactions

The implementation uses the Google GenAI SDK's `generateContent` method for summarization and integrates with the existing `generateContentStream` for chat responses.
