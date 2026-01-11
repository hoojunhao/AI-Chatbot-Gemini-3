# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm install        # Install dependencies
npm run dev        # Start Vite dev server
npm run build      # Production build
npm run test       # Run vitest tests
npm run preview    # Preview production build
```

## Architecture Overview

This is a Google Gemini chat interface built with React 19, Supabase, and the Google GenAI SDK (`@google/genai`).

### Core Data Flow

1. **Authentication**: `AuthContext.tsx` manages Supabase auth (email/password, Google OAuth)
2. **Chat State**: `App.tsx` orchestrates sessions, messages, and settings with optimistic UI updates
3. **AI Streaming**: `geminiService.ts` handles Gemini API calls with async generators for real-time streaming
4. **Persistence**: `chatService.ts` and `settingsService.ts` sync to Supabase PostgreSQL

### Context Management (Long Conversations)

The app uses a two-tier strategy to handle long conversations:

- **Sliding Window** (`contextManager.ts`): Always active, limits messages by count and token estimate
- **Summarization** (`summaryService.ts`): For logged-in users, generates AI summaries of older messages stored in `session_summaries` table

Key files: `constants.ts` defines `CONTEXT_CONFIG` and `SUMMARIZATION_CONFIG` thresholds.

### Token Estimation

`tokenEstimator.ts` provides language-aware estimation (CJK ~1 char/token, Latin ~4 chars/token).

### Error Handling

`errorService.ts` parses Gemini API errors into typed `ParsedGeminiError` objects with user-friendly messages and recovery actions.

## Key Patterns

### Gemini SDK Usage

Always use `@google/genai` (not deprecated `@google/generative-ai`):

```typescript
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey });
await ai.models.generateContentStream({ model, contents, config });
```

See `.agent/rules/gemini-sdk.md` for complete SDK guidelines.

### Thinking Mode

Gemini 3 Flash supports thinking mode. The service wraps `thought` parts in `<thinking>` tags, rendered specially in `ChatMessage.tsx`.

### Message Structure

```typescript
interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isError?: boolean;
  attachments?: { mimeType: string; data: string; name?: string }[];
}
```

## Supabase Tables

- `chat_sessions`: id, user_id, title, is_pinned, updated_at
- `messages`: id, session_id, role, content, attachments (JSONB), is_error
- `user_settings`: user_id, model, temperature, system_instruction, safety thresholds
- `session_summaries`: session_id, summary_text, messages_summarized_count, version

## Environment Variables

Required in `.env.local`:
```
VITE_GEMINI_API_KEY=<from aistudio.google.com>
VITE_SUPABASE_URL=<from Supabase project settings>
VITE_SUPABASE_ANON_KEY=<from Supabase project settings>
```

## Models

Default models defined in `types.ts`:
- `gemini-3-flash-preview` (GEMINI_3_FLASH) - supports thinking mode
- `gemini-3-pro-preview` (GEMINI_3_PRO)
