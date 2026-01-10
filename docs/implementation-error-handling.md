# Implementation Guide: Better Error Messages & Context Overflow Detection

## Overview

This guide details how to implement **intelligent error handling** that detects context overflow and other API errors, providing users with clear, actionable feedback instead of generic error messages.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Error Types & Detection](#error-types--detection)
3. [Implementation Steps](#implementation-steps)
4. [Code Changes](#code-changes)
5. [User Interface Updates](#user-interface-updates)
6. [Recovery Strategies](#recovery-strategies)
7. [Testing](#testing)

---

## Problem Statement

### Current Behavior (`geminiService.ts:114-117`)

```typescript
catch (error) {
  console.error("Gemini API Error:", error);
  throw error;
}
```

### Current User Experience (`App.tsx:335-355`)

```typescript
catch (error) {
  const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
  lastMsg.text = `Error: ${errorMessage}. Please check your connection and API Key.`;
}
```

**Problems:**
- Generic, unhelpful error messages
- No specific handling for different error types
- Users don't know what went wrong or how to fix it
- No suggestion to start a new chat when context overflows

---

## Error Types & Detection

### Google GenAI SDK Error Patterns

| Error Type | HTTP Code | Error Message Pattern | Cause |
|------------|-----------|----------------------|-------|
| **Context Overflow** | 400 | `INVALID_ARGUMENT`, `context length` | Too many tokens |
| **Rate Limit** | 429 | `RESOURCE_EXHAUSTED`, `quota` | Too many requests |
| **Invalid API Key** | 401/403 | `PERMISSION_DENIED`, `API key` | Bad/missing key |
| **Safety Block** | 200 | `SAFETY`, `blocked` | Content filtered |
| **Model Unavailable** | 503 | `UNAVAILABLE`, `overloaded` | Server issues |
| **Network Error** | - | `ECONNREFUSED`, `timeout` | Connection failed |

### Error Response Structure

```typescript
// Typical Gemini API error structure
interface GeminiError {
  error: {
    code: number;
    message: string;
    status: string;
    details?: Array<{
      '@type': string;
      reason?: string;
      domain?: string;
      metadata?: Record<string, string>;
    }>;
  };
}
```

---

## Implementation Steps

### Step 1: Create Error Types

**File: `types.ts`**

```typescript
// Add to existing types.ts

export enum GeminiErrorType {
  CONTEXT_OVERFLOW = 'CONTEXT_OVERFLOW',
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_API_KEY = 'INVALID_API_KEY',
  SAFETY_BLOCKED = 'SAFETY_BLOCKED',
  MODEL_UNAVAILABLE = 'MODEL_UNAVAILABLE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export interface ParsedGeminiError {
  type: GeminiErrorType;
  message: string;
  userMessage: string;
  suggestion: string;
  retryable: boolean;
  httpCode?: number;
  rawError?: unknown;
}

export interface ErrorRecoveryAction {
  label: string;
  action: 'new_chat' | 'retry' | 'clear_context' | 'check_settings' | 'wait';
  primary?: boolean;
}
```

### Step 2: Create Error Parser Service

**File: `services/errorService.ts`**

```typescript
import { GeminiErrorType, ParsedGeminiError, ErrorRecoveryAction } from '../types';

/**
 * Error Service
 *
 * Parses and categorizes errors from the Google GenAI SDK,
 * providing user-friendly messages and recovery suggestions.
 */

// Error detection patterns
const ERROR_PATTERNS = {
  contextOverflow: [
    /context.*(length|limit|exceed|overflow)/i,
    /too many tokens/i,
    /maximum.*context/i,
    /input.*too (long|large)/i,
    /request.*too (long|large)/i,
    /INVALID_ARGUMENT.*length/i,
  ],
  rateLimit: [
    /rate.?limit/i,
    /quota.*exceed/i,
    /too many requests/i,
    /RESOURCE_EXHAUSTED/i,
    /429/,
  ],
  invalidApiKey: [
    /api.?key/i,
    /invalid.*key/i,
    /PERMISSION_DENIED/i,
    /UNAUTHENTICATED/i,
    /401/,
    /403/,
  ],
  safetyBlocked: [
    /safety/i,
    /blocked/i,
    /harmful/i,
    /SAFETY/i,
    /content.*filter/i,
  ],
  modelUnavailable: [
    /model.*unavailable/i,
    /overloaded/i,
    /503/i,
    /UNAVAILABLE/i,
    /capacity/i,
  ],
  networkError: [
    /network/i,
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /timeout/i,
    /fetch.*failed/i,
    /connection/i,
  ],
};

// User-friendly error configurations
const ERROR_CONFIGS: Record<GeminiErrorType, {
  userMessage: string;
  suggestion: string;
  retryable: boolean;
  actions: ErrorRecoveryAction[];
}> = {
  [GeminiErrorType.CONTEXT_OVERFLOW]: {
    userMessage: 'This conversation has become too long for the AI to process.',
    suggestion: 'Start a new chat to continue. Your conversation history is saved and you can reference it later.',
    retryable: false,
    actions: [
      { label: 'Start New Chat', action: 'new_chat', primary: true },
      { label: 'Clear Old Messages', action: 'clear_context' },
    ],
  },
  [GeminiErrorType.RATE_LIMITED]: {
    userMessage: 'Too many requests. The API rate limit has been reached.',
    suggestion: 'Please wait a moment before sending another message.',
    retryable: true,
    actions: [
      { label: 'Wait & Retry', action: 'wait', primary: true },
      { label: 'Retry Now', action: 'retry' },
    ],
  },
  [GeminiErrorType.INVALID_API_KEY]: {
    userMessage: 'There\'s a problem with your API key.',
    suggestion: 'Please check that your Gemini API key is correct and has not expired.',
    retryable: false,
    actions: [
      { label: 'Check Settings', action: 'check_settings', primary: true },
    ],
  },
  [GeminiErrorType.SAFETY_BLOCKED]: {
    userMessage: 'This request was blocked by safety filters.',
    suggestion: 'Try rephrasing your message or adjusting safety settings.',
    retryable: false,
    actions: [
      { label: 'Check Settings', action: 'check_settings', primary: true },
      { label: 'Try Again', action: 'retry' },
    ],
  },
  [GeminiErrorType.MODEL_UNAVAILABLE]: {
    userMessage: 'The AI model is temporarily unavailable.',
    suggestion: 'The service may be experiencing high demand. Please try again in a few moments.',
    retryable: true,
    actions: [
      { label: 'Retry', action: 'retry', primary: true },
      { label: 'Wait & Retry', action: 'wait' },
    ],
  },
  [GeminiErrorType.NETWORK_ERROR]: {
    userMessage: 'Unable to connect to the AI service.',
    suggestion: 'Please check your internet connection and try again.',
    retryable: true,
    actions: [
      { label: 'Retry', action: 'retry', primary: true },
    ],
  },
  [GeminiErrorType.UNKNOWN]: {
    userMessage: 'An unexpected error occurred.',
    suggestion: 'Please try again. If the problem persists, try starting a new chat.',
    retryable: true,
    actions: [
      { label: 'Retry', action: 'retry', primary: true },
      { label: 'Start New Chat', action: 'new_chat' },
    ],
  },
};

/**
 * Detect error type from error object or message
 */
function detectErrorType(error: unknown): GeminiErrorType {
  const errorString = getErrorString(error);
  const httpCode = getHttpCode(error);

  // Check each pattern category
  for (const [type, patterns] of Object.entries(ERROR_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(errorString)) {
        return type.toUpperCase().replace(/([A-Z])/g, '_$1').slice(1) as GeminiErrorType
          || GeminiErrorType[type.toUpperCase() as keyof typeof GeminiErrorType];
      }
    }
  }

  // Fallback to HTTP code detection
  if (httpCode) {
    if (httpCode === 429) return GeminiErrorType.RATE_LIMITED;
    if (httpCode === 401 || httpCode === 403) return GeminiErrorType.INVALID_API_KEY;
    if (httpCode === 503) return GeminiErrorType.MODEL_UNAVAILABLE;
    if (httpCode === 400) {
      // 400 could be context overflow - check message
      if (/length|token|context/i.test(errorString)) {
        return GeminiErrorType.CONTEXT_OVERFLOW;
      }
    }
  }

  return GeminiErrorType.UNKNOWN;
}

/**
 * Extract error string from various error formats
 */
function getErrorString(error: unknown): string {
  if (typeof error === 'string') return error;

  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  if (typeof error === 'object' && error !== null) {
    const e = error as any;

    // Google GenAI SDK error format
    if (e.error?.message) return e.error.message;
    if (e.message) return e.message;
    if (e.statusText) return e.statusText;

    // Try to stringify
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

/**
 * Extract HTTP status code from error
 */
function getHttpCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;

  const e = error as any;

  if (e.status) return e.status;
  if (e.statusCode) return e.statusCode;
  if (e.error?.code) return e.error.code;
  if (e.code && typeof e.code === 'number') return e.code;

  // Try to extract from message
  const match = getErrorString(error).match(/\b(4\d{2}|5\d{2})\b/);
  if (match) return parseInt(match[1]);

  return undefined;
}

/**
 * Main error parsing function
 *
 * Takes any error from the Gemini API and returns a structured,
 * user-friendly error object.
 */
export function parseGeminiError(error: unknown): ParsedGeminiError {
  const type = detectErrorType(error);
  const config = ERROR_CONFIGS[type];
  const httpCode = getHttpCode(error);

  return {
    type,
    message: getErrorString(error),
    userMessage: config.userMessage,
    suggestion: config.suggestion,
    retryable: config.retryable,
    httpCode,
    rawError: error,
  };
}

/**
 * Get recovery actions for an error type
 */
export function getRecoveryActions(errorType: GeminiErrorType): ErrorRecoveryAction[] {
  return ERROR_CONFIGS[errorType]?.actions || ERROR_CONFIGS[GeminiErrorType.UNKNOWN].actions;
}

/**
 * Check if an error indicates context overflow
 */
export function isContextOverflow(error: unknown): boolean {
  return detectErrorType(error) === GeminiErrorType.CONTEXT_OVERFLOW;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  const type = detectErrorType(error);
  return ERROR_CONFIGS[type]?.retryable || false;
}

/**
 * Format error for display in chat
 */
export function formatErrorForChat(parsedError: ParsedGeminiError): string {
  return `**${parsedError.userMessage}**\n\n${parsedError.suggestion}`;
}

/**
 * Get retry delay for rate-limited errors (exponential backoff)
 */
export function getRetryDelay(attemptNumber: number): number {
  const baseDelay = 1000; // 1 second
  const maxDelay = 30000; // 30 seconds
  const delay = Math.min(baseDelay * Math.pow(2, attemptNumber), maxDelay);
  return delay + Math.random() * 1000; // Add jitter
}
```

### Step 3: Update Gemini Service with Error Handling

**File: `services/geminiService.ts`**

```typescript
import { GoogleGenAI, Content, Part, GenerateContentParameters } from "@google/genai";
import { AppSettings, Message, ModelType, GeminiErrorType } from "../types";
import { parseGeminiError, isContextOverflow, isRetryableError, getRetryDelay } from "./errorService";

// Custom error class for Gemini errors
export class GeminiApiError extends Error {
  type: GeminiErrorType;
  userMessage: string;
  suggestion: string;
  retryable: boolean;
  httpCode?: number;

  constructor(parsedError: ReturnType<typeof parseGeminiError>) {
    super(parsedError.message);
    this.name = 'GeminiApiError';
    this.type = parsedError.type;
    this.userMessage = parsedError.userMessage;
    this.suggestion = parsedError.suggestion;
    this.retryable = parsedError.retryable;
    this.httpCode = parsedError.httpCode;
  }
}

export const generateResponseStream = async function* (
  apiKey: string,
  settings: AppSettings,
  history: Message[],
  newMessage: string,
  attachments: { mimeType: string; data: string }[] = [],
  sessionId?: string,
  retryAttempt: number = 0
) {
  if (!apiKey) {
    const error = parseGeminiError(new Error('API Key is missing'));
    error.type = GeminiErrorType.INVALID_API_KEY;
    error.userMessage = 'No API key provided.';
    error.suggestion = 'Please add your Gemini API key in settings.';
    throw new GeminiApiError(error);
  }

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

  // Construct history if memory is enabled
  let contents: Content[] = [];

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

      // Check for safety blocks in the response
      const finishReason = chunk.candidates?.[0]?.finishReason;
      if (finishReason === 'SAFETY') {
        const error = parseGeminiError({ message: 'Response blocked by safety filters' });
        error.type = GeminiErrorType.SAFETY_BLOCKED;
        throw new GeminiApiError(error);
      }

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
      // Check if this might be a safety filter issue
      const error = parseGeminiError({ message: 'No response generated - possibly filtered' });
      error.type = GeminiErrorType.SAFETY_BLOCKED;
      throw new GeminiApiError(error);
    }

  } catch (error) {
    console.error("Gemini API Error:", error);

    // If already a GeminiApiError, re-throw
    if (error instanceof GeminiApiError) {
      throw error;
    }

    // Parse the error
    const parsedError = parseGeminiError(error);

    // Check for context overflow specifically
    if (isContextOverflow(error)) {
      console.warn('Context overflow detected - conversation too long');
      parsedError.type = GeminiErrorType.CONTEXT_OVERFLOW;
      parsedError.userMessage = 'This conversation has become too long for the AI to process.';
      parsedError.suggestion = 'Please start a new chat to continue. Your conversation history is saved.';
    }

    // Auto-retry for retryable errors (with limit)
    if (isRetryableError(error) && retryAttempt < 3) {
      const delay = getRetryDelay(retryAttempt);
      console.log(`Retrying in ${delay}ms (attempt ${retryAttempt + 1}/3)...`);

      await new Promise(resolve => setTimeout(resolve, delay));

      // Recursive retry
      yield* generateResponseStream(
        apiKey,
        settings,
        history,
        newMessage,
        attachments,
        sessionId,
        retryAttempt + 1
      );
      return;
    }

    throw new GeminiApiError(parsedError);
  }
};
```

### Step 4: Create Error Display Component

**File: `components/ErrorMessage.tsx`**

```typescript
import React from 'react';
import { ParsedGeminiError, ErrorRecoveryAction, GeminiErrorType } from '../types';
import { getRecoveryActions } from '../services/errorService';

interface ErrorMessageProps {
  error: ParsedGeminiError;
  onAction: (action: ErrorRecoveryAction['action']) => void;
}

const ERROR_ICONS: Record<GeminiErrorType, string> = {
  [GeminiErrorType.CONTEXT_OVERFLOW]: '📚',
  [GeminiErrorType.RATE_LIMITED]: '⏱️',
  [GeminiErrorType.INVALID_API_KEY]: '🔑',
  [GeminiErrorType.SAFETY_BLOCKED]: '🛡️',
  [GeminiErrorType.MODEL_UNAVAILABLE]: '🔧',
  [GeminiErrorType.NETWORK_ERROR]: '🌐',
  [GeminiErrorType.UNKNOWN]: '⚠️',
};

const ERROR_COLORS: Record<GeminiErrorType, string> = {
  [GeminiErrorType.CONTEXT_OVERFLOW]: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800',
  [GeminiErrorType.RATE_LIMITED]: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
  [GeminiErrorType.INVALID_API_KEY]: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
  [GeminiErrorType.SAFETY_BLOCKED]: 'bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800',
  [GeminiErrorType.MODEL_UNAVAILABLE]: 'bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-700',
  [GeminiErrorType.NETWORK_ERROR]: 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800',
  [GeminiErrorType.UNKNOWN]: 'bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-700',
};

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ error, onAction }) => {
  const actions = getRecoveryActions(error.type);
  const icon = ERROR_ICONS[error.type];
  const colorClass = ERROR_COLORS[error.type];

  return (
    <div className={`rounded-lg border p-4 ${colorClass}`}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            {error.userMessage}
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {error.suggestion}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={() => onAction(action.action)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              action.primary
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Debug info (collapsible) */}
      <details className="mt-4">
        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
          Technical details
        </summary>
        <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-x-auto">
          {JSON.stringify({
            type: error.type,
            httpCode: error.httpCode,
            message: error.message,
          }, null, 2)}
        </pre>
      </details>
    </div>
  );
};
```

### Step 5: Update App.tsx Error Handling

**File: `components/App.tsx` (error handling section)**

```typescript
import { GeminiApiError, generateResponseStream } from '../services/geminiService';
import { parseGeminiError, formatErrorForChat } from '../services/errorService';
import { ErrorMessage } from './ErrorMessage';
import { GeminiErrorType, ParsedGeminiError, ErrorRecoveryAction } from '../types';

// Inside the component, add error state
const [lastError, setLastError] = useState<ParsedGeminiError | null>(null);

// Update the handleSendMessage function's catch block
const handleSendMessage = async () => {
  // ... existing code ...

  try {
    const stream = generateResponseStream(
      apiKey,
      settings,
      existingMessages,
      currentInput,
      currentAttachments,
      activeSessionId
    );

    for await (const chunk of stream) {
      fullResponse += chunk;
      // ... update UI ...
    }

    // Clear any previous error on success
    setLastError(null);

  } catch (error) {
    console.error("Error generating response:", error);

    let parsedError: ParsedGeminiError;

    if (error instanceof GeminiApiError) {
      parsedError = {
        type: error.type,
        message: error.message,
        userMessage: error.userMessage,
        suggestion: error.suggestion,
        retryable: error.retryable,
        httpCode: error.httpCode,
      };
    } else {
      parsedError = parseGeminiError(error);
    }

    // Store the error for UI display
    setLastError(parsedError);

    // Update the message in the chat to show error
    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        const msgs = [...s.messages];
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.id === modelMsgId) {
          lastMsg.text = formatErrorForChat(parsedError);
          lastMsg.isError = true;
        }
        return { ...s, messages: msgs };
      }
      return s;
    }));
  }
};

// Handle recovery actions
const handleErrorRecovery = (action: ErrorRecoveryAction['action']) => {
  switch (action) {
    case 'new_chat':
      // Navigate to new chat
      navigate('/app');
      setLastError(null);
      break;

    case 'retry':
      // Retry the last message
      if (currentSession && currentSession.messages.length >= 2) {
        const lastUserMsg = [...currentSession.messages]
          .reverse()
          .find(m => m.role === 'user' && !m.isError);
        if (lastUserMsg) {
          // Remove the error message and retry
          setSessions(prev => prev.map(s => {
            if (s.id === currentSessionId) {
              return {
                ...s,
                messages: s.messages.filter(m => !m.isError)
              };
            }
            return s;
          }));
          setInput(lastUserMsg.text);
          setLastError(null);
        }
      }
      break;

    case 'clear_context':
      // Clear older messages, keep recent
      if (currentSession) {
        const recentMessages = currentSession.messages.slice(-10);
        setSessions(prev => prev.map(s => {
          if (s.id === currentSessionId) {
            return { ...s, messages: recentMessages };
          }
          return s;
        }));
        setLastError(null);
      }
      break;

    case 'check_settings':
      // Open settings modal
      setIsSettingsOpen(true);
      setLastError(null);
      break;

    case 'wait':
      // Show countdown and auto-retry
      setTimeout(() => {
        handleErrorRecovery('retry');
      }, 5000);
      break;
  }
};

// In the JSX, show error UI when there's an error
{lastError && (
  <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 max-w-lg w-full px-4 z-50">
    <ErrorMessage
      error={lastError}
      onAction={handleErrorRecovery}
    />
  </div>
)}
```

---

## Recovery Strategies

### Context Overflow Recovery Options

| Option | Implementation | User Experience |
|--------|---------------|-----------------|
| **Start New Chat** | Navigate to `/app`, clear state | Clean slate, history saved |
| **Clear Old Messages** | Keep last N messages | Continue with recent context |
| **Summarize & Continue** | Generate summary, replace old | Preserve context, reduce tokens |

### Rate Limit Recovery

```typescript
// Exponential backoff with jitter
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error)) {
        throw error;
      }

      const delay = getRetryDelay(attempt);
      console.log(`Retry attempt ${attempt + 1}/${maxRetries} in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
```

---

## Testing

### Unit Tests for Error Service

**File: `services/errorService.test.ts`**

```typescript
import {
  parseGeminiError,
  isContextOverflow,
  isRetryableError,
  getRetryDelay,
} from './errorService';
import { GeminiErrorType } from '../types';

describe('ErrorService', () => {
  describe('parseGeminiError', () => {
    it('detects context overflow from message', () => {
      const error = new Error('Request payload size exceeds the limit: context length exceeded');
      const parsed = parseGeminiError(error);

      expect(parsed.type).toBe(GeminiErrorType.CONTEXT_OVERFLOW);
      expect(parsed.retryable).toBe(false);
    });

    it('detects rate limiting', () => {
      const error = { status: 429, message: 'RESOURCE_EXHAUSTED: quota exceeded' };
      const parsed = parseGeminiError(error);

      expect(parsed.type).toBe(GeminiErrorType.RATE_LIMITED);
      expect(parsed.retryable).toBe(true);
    });

    it('detects invalid API key', () => {
      const error = { status: 401, message: 'PERMISSION_DENIED: API key invalid' };
      const parsed = parseGeminiError(error);

      expect(parsed.type).toBe(GeminiErrorType.INVALID_API_KEY);
      expect(parsed.retryable).toBe(false);
    });

    it('detects safety blocks', () => {
      const error = { message: 'Response blocked due to SAFETY concerns' };
      const parsed = parseGeminiError(error);

      expect(parsed.type).toBe(GeminiErrorType.SAFETY_BLOCKED);
    });

    it('handles unknown errors', () => {
      const error = { message: 'Something completely unexpected' };
      const parsed = parseGeminiError(error);

      expect(parsed.type).toBe(GeminiErrorType.UNKNOWN);
      expect(parsed.userMessage).toBeTruthy();
      expect(parsed.suggestion).toBeTruthy();
    });
  });

  describe('isContextOverflow', () => {
    it('returns true for context overflow errors', () => {
      expect(isContextOverflow(new Error('context length exceeded'))).toBe(true);
      expect(isContextOverflow(new Error('too many tokens in request'))).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(isContextOverflow(new Error('network timeout'))).toBe(false);
      expect(isContextOverflow(new Error('invalid API key'))).toBe(false);
    });
  });

  describe('isRetryableError', () => {
    it('identifies retryable errors', () => {
      expect(isRetryableError({ status: 429 })).toBe(true);
      expect(isRetryableError({ status: 503 })).toBe(true);
      expect(isRetryableError(new Error('network timeout'))).toBe(true);
    });

    it('identifies non-retryable errors', () => {
      expect(isRetryableError({ status: 401 })).toBe(false);
      expect(isRetryableError(new Error('context overflow'))).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    it('increases delay with each attempt', () => {
      const delay0 = getRetryDelay(0);
      const delay1 = getRetryDelay(1);
      const delay2 = getRetryDelay(2);

      expect(delay1).toBeGreaterThan(delay0);
      expect(delay2).toBeGreaterThan(delay1);
    });

    it('caps delay at maximum', () => {
      const delay10 = getRetryDelay(10);
      expect(delay10).toBeLessThanOrEqual(31000); // 30s max + 1s jitter
    });
  });
});
```

### Integration Test

```typescript
describe('Error Handling Integration', () => {
  it('shows context overflow UI when conversation is too long', async () => {
    // Mock a very long conversation
    const longHistory = Array.from({ length: 1000 }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'model',
      text: 'x'.repeat(10000), // Very long messages
      timestamp: Date.now() + i,
      isError: false
    }));

    // Attempt to send message
    try {
      await generateResponseStream(
        'test-key',
        settings,
        longHistory,
        'New message'
      ).next();
    } catch (error) {
      expect(error).toBeInstanceOf(GeminiApiError);
      expect((error as GeminiApiError).type).toBe(GeminiErrorType.CONTEXT_OVERFLOW);
      expect((error as GeminiApiError).suggestion).toContain('new chat');
    }
  });
});
```

---

## Summary

This error handling implementation:

1. **Categorizes errors** - Identifies specific error types from API responses
2. **Provides clear messages** - Users understand what went wrong
3. **Suggests solutions** - Actionable next steps for each error type
4. **Enables recovery** - One-click actions to resolve issues
5. **Auto-retries** - Handles transient errors automatically
6. **Context overflow detection** - Special handling for long conversations

The implementation uses the Google GenAI SDK's error patterns and integrates with the existing streaming response architecture.
