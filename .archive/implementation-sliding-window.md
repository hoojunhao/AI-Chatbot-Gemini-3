# Implementation Guide: Sliding Window Context Management

## Overview

This guide details how to implement a **sliding window** approach for managing conversation context in the Gemini chatbot. Instead of sending all messages to the API, we only send the last N messages, preventing context overflow and reducing API costs.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Architecture](#solution-architecture)
3. [Implementation Steps](#implementation-steps)
4. [Code Changes](#code-changes)
5. [Configuration Options](#configuration-options)
6. [Testing](#testing)

---

## Problem Statement

### Current Behavior (`geminiService.ts:34-42`)

```typescript
if (settings.enableMemory) {
  contents = history
    .filter(msg => !msg.isError)
    .map(msg => ({
      role: msg.role,
      parts: msg.attachments
        ? [...msg.attachments.map(a => ({ inlineData: { mimeType: a.mimeType, data: a.data } })), { text: msg.text }]
        : [{ text: msg.text }]
    }));
}
```

**Issues:**
- ALL messages are sent to the Gemini API
- No limit on context size
- Will exceed Gemini's ~1M token context window
- Exponentially increasing API costs
- Slower response times with larger contexts

---

## Solution Architecture

### Sliding Window Concept

```
Total Messages: [msg1, msg2, msg3, ... msg97, msg98, msg99, msg100]
                 ←──── Discarded ────→  ←──── Window (N=20) ────→

Sent to API:                            [msg81, msg82, ... msg99, msg100]
```

### Token-Aware vs Count-Based

| Approach | Pros | Cons |
|----------|------|------|
| **Count-based** | Simple, predictable | Long messages may still overflow |
| **Token-based** | Precise control | Requires token estimation |
| **Hybrid** | Best of both | More complex |

This guide implements a **hybrid approach** with count-based limits and token estimation.

---

## Implementation Steps

### Step 1: Add Configuration Constants

Create a new file for context management configuration.

**File: `constants.ts`**

```typescript
// Add to existing constants.ts

// Context Window Configuration
export const CONTEXT_CONFIG = {
  // Maximum messages to include in context (count-based limit)
  MAX_MESSAGES: 50,

  // Maximum estimated tokens for context (token-based limit)
  MAX_CONTEXT_TOKENS: 100000,

  // Average characters per token (rough estimate for English text)
  CHARS_PER_TOKEN: 4,

  // Tokens reserved for system instruction
  SYSTEM_INSTRUCTION_BUFFER: 2000,

  // Tokens reserved for new message + response
  RESPONSE_BUFFER: 8000,

  // Minimum messages to always include (most recent)
  MIN_RECENT_MESSAGES: 5,
};
```

---

### Step 2: Create Context Manager Utility

**File: `services/contextManager.ts`**

```typescript
import { Message, Attachment } from '../types';
import { CONTEXT_CONFIG } from '../constants';

/**
 * Context Manager for Sliding Window Implementation
 *
 * Manages conversation history to fit within API context limits
 * using the Google GenAI SDK TypeScript patterns.
 */

export interface ContextWindow {
  messages: Message[];
  estimatedTokens: number;
  truncated: boolean;
  originalCount: number;
}

/**
 * Estimates token count for a message
 * Based on average of 4 characters per token for English text
 */
export function estimateMessageTokens(message: Message): number {
  let tokens = 0;

  // Text content
  tokens += Math.ceil(message.text.length / CONTEXT_CONFIG.CHARS_PER_TOKEN);

  // Attachments (images are ~258 tokens for inline data reference)
  if (message.attachments) {
    tokens += message.attachments.length * 258;

    // Base64 image data (very rough estimate)
    message.attachments.forEach(att => {
      // Base64 is ~1.37x the binary size, and images use special tokenization
      tokens += Math.ceil(att.data.length / 1000); // Rough estimate
    });
  }

  // Role overhead (~4 tokens per message for role markers)
  tokens += 4;

  return tokens;
}

/**
 * Estimates total tokens for an array of messages
 */
export function estimateTotalTokens(messages: Message[]): number {
  return messages.reduce((total, msg) => total + estimateMessageTokens(msg), 0);
}

/**
 * Creates a sliding window of messages that fits within token limits
 *
 * Strategy:
 * 1. Always include the most recent MIN_RECENT_MESSAGES
 * 2. Add older messages until we hit MAX_MESSAGES or MAX_CONTEXT_TOKENS
 * 3. Prioritize recent messages over older ones
 */
export function createSlidingWindow(
  history: Message[],
  systemInstructionTokens: number = 0
): ContextWindow {
  // Filter out error messages first
  const validMessages = history.filter(msg => !msg.isError);

  if (validMessages.length === 0) {
    return {
      messages: [],
      estimatedTokens: 0,
      truncated: false,
      originalCount: 0
    };
  }

  // Calculate available token budget
  const availableTokens = CONTEXT_CONFIG.MAX_CONTEXT_TOKENS
    - CONTEXT_CONFIG.SYSTEM_INSTRUCTION_BUFFER
    - CONTEXT_CONFIG.RESPONSE_BUFFER
    - systemInstructionTokens;

  // Start from the most recent messages
  const windowMessages: Message[] = [];
  let currentTokens = 0;

  // Iterate from newest to oldest
  for (let i = validMessages.length - 1; i >= 0; i--) {
    const message = validMessages[i];
    const messageTokens = estimateMessageTokens(message);

    // Check if adding this message would exceed limits
    const wouldExceedTokens = currentTokens + messageTokens > availableTokens;
    const wouldExceedCount = windowMessages.length >= CONTEXT_CONFIG.MAX_MESSAGES;

    // Always include minimum recent messages regardless of token count
    const isBelowMinimum = windowMessages.length < CONTEXT_CONFIG.MIN_RECENT_MESSAGES;

    if ((wouldExceedTokens || wouldExceedCount) && !isBelowMinimum) {
      break;
    }

    // Add message to the beginning of the window (maintain chronological order)
    windowMessages.unshift(message);
    currentTokens += messageTokens;
  }

  return {
    messages: windowMessages,
    estimatedTokens: currentTokens,
    truncated: windowMessages.length < validMessages.length,
    originalCount: validMessages.length
  };
}

/**
 * Creates a context window with a summary prefix for truncated conversations
 * Use this when you want to indicate that earlier messages were omitted
 */
export function createWindowWithTruncationNotice(
  history: Message[],
  systemInstructionTokens: number = 0
): { messages: Message[]; metadata: ContextWindow } {
  const window = createSlidingWindow(history, systemInstructionTokens);

  if (window.truncated && window.messages.length > 0) {
    // Add a system-like message indicating truncation
    const omittedCount = window.originalCount - window.messages.length;
    const truncationNotice: Message = {
      id: 'truncation-notice',
      role: 'user',
      text: `[Note: ${omittedCount} earlier messages were omitted to fit context limits. The conversation continues from here.]`,
      timestamp: window.messages[0].timestamp - 1,
      isError: false
    };

    // Insert truncation notice at the beginning
    window.messages.unshift(truncationNotice);
  }

  return {
    messages: window.messages,
    metadata: window
  };
}

/**
 * Validates that the context window is within acceptable limits
 */
export function validateContextWindow(window: ContextWindow): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (window.estimatedTokens > CONTEXT_CONFIG.MAX_CONTEXT_TOKENS * 0.9) {
    warnings.push('Context is approaching token limit');
  }

  if (window.messages.length >= CONTEXT_CONFIG.MAX_MESSAGES) {
    warnings.push('Context has reached message count limit');
  }

  if (window.truncated) {
    warnings.push(`${window.originalCount - window.messages.length} messages were truncated`);
  }

  return {
    valid: window.estimatedTokens <= CONTEXT_CONFIG.MAX_CONTEXT_TOKENS,
    warnings
  };
}
```

---

### Step 3: Update Gemini Service

**File: `services/geminiService.ts`**

```typescript
import { GoogleGenAI, Content, Part, GenerateContentParameters } from "@google/genai";
import { AppSettings, Message, ModelType } from "../types";
import { createSlidingWindow, estimateMessageTokens } from "./contextManager";

export const generateResponseStream = async function* (
  apiKey: string,
  settings: AppSettings,
  history: Message[],
  newMessage: string,
  attachments: { mimeType: string; data: string }[] = []
) {
  if (!apiKey) throw new Error("API Key is missing");

  const ai = new GoogleGenAI({ apiKey });

  // Construct parts for the new message
  const parts: Part[] = [];

  // Add attachments
  attachments.forEach(att => {
    parts.push({
      inlineData: {
        mimeType: att.mimeType,
        data: att.data
      }
    });
  });

  // Add text
  parts.push({ text: newMessage });

  // Construct history with SLIDING WINDOW if memory is enabled
  let contents: Content[] = [];

  if (settings.enableMemory) {
    // Calculate system instruction tokens for budget
    const systemInstructionTokens = settings.systemInstruction
      ? Math.ceil(settings.systemInstruction.length / 4)
      : 0;

    // Apply sliding window to history
    const contextWindow = createSlidingWindow(history, systemInstructionTokens);

    // Log context info for debugging (remove in production)
    console.log(`Context Window: ${contextWindow.messages.length}/${contextWindow.originalCount} messages, ~${contextWindow.estimatedTokens} tokens, truncated: ${contextWindow.truncated}`);

    // Convert windowed messages to Content format
    contents = contextWindow.messages.map(msg => ({
      role: msg.role,
      parts: msg.attachments
        ? [...msg.attachments.map(a => ({ inlineData: { mimeType: a.mimeType, data: a.data } })), { text: msg.text }]
        : [{ text: msg.text }]
    }));
  }

  // Add the new message to contents
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

  // Thinking configuration logic
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

---

### Step 4: Add Context Info to UI (Optional)

Show users how much context is being used.

**File: `components/ContextIndicator.tsx`**

```typescript
import React from 'react';
import { ContextWindow } from '../services/contextManager';

interface ContextIndicatorProps {
  contextWindow: ContextWindow | null;
}

export const ContextIndicator: React.FC<ContextIndicatorProps> = ({ contextWindow }) => {
  if (!contextWindow) return null;

  const percentage = Math.round((contextWindow.estimatedTokens / 100000) * 100);

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <div className="flex items-center gap-1">
        <span>Context:</span>
        <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              percentage > 80 ? 'bg-red-500' :
              percentage > 60 ? 'bg-yellow-500' :
              'bg-green-500'
            }`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
        <span>{percentage}%</span>
      </div>
      {contextWindow.truncated && (
        <span className="text-yellow-600 dark:text-yellow-400">
          ({contextWindow.originalCount - contextWindow.messages.length} messages truncated)
        </span>
      )}
    </div>
  );
};
```

---

## Configuration Options

### Adjustable Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `MAX_MESSAGES` | 50 | Hard limit on message count |
| `MAX_CONTEXT_TOKENS` | 100,000 | Token budget for context |
| `CHARS_PER_TOKEN` | 4 | Character-to-token ratio |
| `MIN_RECENT_MESSAGES` | 5 | Always include this many recent messages |
| `RESPONSE_BUFFER` | 8,000 | Tokens reserved for AI response |

### Model-Specific Limits

| Model | Context Window | Recommended MAX_CONTEXT_TOKENS |
|-------|---------------|-------------------------------|
| `gemini-2.0-flash` | ~1M tokens | 100,000 - 500,000 |
| `gemini-2.0-pro` | ~2M tokens | 200,000 - 1,000,000 |
| `gemini-1.5-flash` | 1M tokens | 100,000 - 500,000 |

---

## Testing

### Unit Tests for Context Manager

**File: `services/contextManager.test.ts`**

```typescript
import {
  createSlidingWindow,
  estimateMessageTokens,
  estimateTotalTokens
} from './contextManager';
import { Message } from '../types';

describe('Context Manager', () => {
  const createMockMessage = (id: number, textLength: number = 100): Message => ({
    id: `msg-${id}`,
    role: id % 2 === 0 ? 'user' : 'model',
    text: 'a'.repeat(textLength),
    timestamp: Date.now() + id,
    isError: false
  });

  describe('estimateMessageTokens', () => {
    it('estimates tokens based on text length', () => {
      const msg = createMockMessage(1, 400); // 400 chars = ~100 tokens
      const tokens = estimateMessageTokens(msg);
      expect(tokens).toBeGreaterThanOrEqual(100);
      expect(tokens).toBeLessThanOrEqual(110); // Allow for overhead
    });
  });

  describe('createSlidingWindow', () => {
    it('returns all messages when under limits', () => {
      const messages = Array.from({ length: 10 }, (_, i) => createMockMessage(i));
      const window = createSlidingWindow(messages);

      expect(window.messages.length).toBe(10);
      expect(window.truncated).toBe(false);
    });

    it('truncates when exceeding MAX_MESSAGES', () => {
      const messages = Array.from({ length: 100 }, (_, i) => createMockMessage(i));
      const window = createSlidingWindow(messages);

      expect(window.messages.length).toBeLessThanOrEqual(50);
      expect(window.truncated).toBe(true);
      expect(window.originalCount).toBe(100);
    });

    it('keeps most recent messages', () => {
      const messages = Array.from({ length: 100 }, (_, i) => createMockMessage(i));
      const window = createSlidingWindow(messages);

      // Last message should be the most recent
      const lastWindowMsg = window.messages[window.messages.length - 1];
      const lastOriginalMsg = messages[messages.length - 1];
      expect(lastWindowMsg.id).toBe(lastOriginalMsg.id);
    });

    it('filters out error messages', () => {
      const messages: Message[] = [
        createMockMessage(1),
        { ...createMockMessage(2), isError: true },
        createMockMessage(3),
      ];
      const window = createSlidingWindow(messages);

      expect(window.messages.length).toBe(2);
      expect(window.messages.every(m => !m.isError)).toBe(true);
    });
  });
});
```

### Integration Test

```typescript
import { generateResponseStream } from './geminiService';

describe('Gemini Service with Sliding Window', () => {
  it('handles large conversation history', async () => {
    const largeHistory = Array.from({ length: 200 }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'model',
      text: `Message ${i}: ${'Lorem ipsum '.repeat(50)}`,
      timestamp: Date.now() + i,
      isError: false
    }));

    // Should not throw even with 200 messages
    const stream = generateResponseStream(
      'test-api-key',
      defaultSettings,
      largeHistory,
      'New message'
    );

    // Verify stream is created (actual API call would need mocking)
    expect(stream).toBeDefined();
  });
});
```

---

## Summary

This sliding window implementation:

1. **Limits context size** - Prevents API errors from context overflow
2. **Reduces costs** - Fewer tokens = lower API bills
3. **Maintains relevance** - Recent messages are prioritized
4. **Provides visibility** - Optional UI indicator shows context usage
5. **Is configurable** - Easy to adjust limits per model or use case

The implementation uses the Google GenAI SDK's `Content` type structure and integrates seamlessly with the existing `generateContentStream` API pattern.
