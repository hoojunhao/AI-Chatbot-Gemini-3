# 🛠️ Gemini Chat Clone - Developer Documentation

Welcome to the internal developer documentation for the Gemini Chat Clone. This guide provides a deep dive into the architecture, state management, and implementation details of the project.

---

## 🏗️ Architecture Overview

The application follows a modern cloud-native architecture, separating concerns between a responsive UI, a persistent backend, and a streaming AI service.

### 1. Frontend: React 19 + Tailwind CSS
- **Framework**: Built with React 19 for improved performance and future compatibility.
- **Routing**: Uses `React Router 7` for session-based URL navigation (`/app/:sessionId`).
- **Styling**: Leverages Tailwind CSS with custom design tokens to match the Gemini "Google Sans" and "Inter" aesthetic. We use glassmorphism and motion transitions for a premium feel.
- **Icons**: Standardized on `lucide-react`.

### 2. Backend: Supabase
- **Authentication**: Managed via `AuthContext.tsx`. Supports Email/Password and **Google OAuth**.
- **Database**: PostgreSQL hosted on Supabase.
  - `chat_sessions`: Stores conversation titles, pinned status, and user ownership.
  - `messages`: Stores full conversation logs, including JSONB support for multimodal attachments.
  - `user_settings`: Stores model preferences, safety thresholds, and system prompts.
- **Real-time**: Leverages Supabase's auto-updating timestamps for session sorting.

### 3. AI Service: Google GenAI SDK
- **Integration**: `services/geminiService.ts` wraps the `@google/genai` SDK.
- **Streaming**: Fully asynchronous generator functions provide real-time token streaming to the UI.
- **Thinking Mode**: Specifically designed for Gemini 3 Flash, implementing a "thinking" part detection that yields specialized tags for the frontend.

---

## 🧩 Core Module Breakdown

### `components/App.tsx` (The Orchestrator)
The central component managing the intersection of Auth, Chat, and Settings.
- **URL Syncing**: Syncs the active session from the URL params to the application state.
- **Optimistic Updates**: When a message is sent, it is immediately rendered in the UI with a temporary ID before being persisted to Supabase.
- **Responsive Logic**: Manages a complex sidebar state that reacts to window resizing while respecting manual user overrides.

### `services/geminiService.ts`
The gateway to the LLM. It handles:
- **Context Construction**: Concatenates history into the `Content[]` format required by Gemini.
- **Safety Filtration**: Automatically applies user-defined thresholds from `settings`.
- **Multimodal Encoding**: Maps `attachments` (base64) to `inlineData` parts.

### `components/MarkdownRenderer.tsx` & `ChatMessage.tsx`
- **Markdown**: Uses `react-markdown` with `remark-gfm`.
- **Syntax Highlighting**: Custom implementation for code blocks within chat bubbles.
- **Thinking UI**: `ChatMessage` detects `<thinking>` blocks and renders them in a collapsible, dimmed "Reasoning" section, mimicking official Google AI releases.

---

## 💾 Data Schema & Persistence

### Chat Sessions
```sql
-- Conceptual Schema
id: uuid (PK)
user_id: uuid (FK)
title: text
is_pinned: boolean
updated_at: timestamp
```

### Messages
```sql
-- Conceptual Schema
id: uuid (PK)
session_id: uuid (FK)
role: 'user' | 'model'
content: text
attachments: jsonb (Array of {mimeType, data, name})
is_error: boolean
```

---

## 🚀 Advanced Implementation Details

### 1. Voice Input (Dictation)
We use the native `window.SpeechRecognition` API.
- **Behavior**: It appends transcriptions to the existing input field in real-time.
- **Compatibility**: Includes fallbacks for `webkitSpeechRecognition` to support Chrome and Safari.

### 2. Multimodal Handling
Images are converted to Base64 on the client side via `FileReader`. This ensures we can send them directly to the `generateContent` stream without needing an intermediate storage bucket (like S3 or Supabase Storage) for temporary previews.

### 3. Thinking Mode Parser
When `GEMINI_3_FLASH` is enabled with high thinking levels, the stream may return `thought` parts.
- **Parsing logic**: In `geminiService.ts`, we wrap these parts in `<thinking>` tags.
- **Rendering logic**: In the UI, these are treated as separate visual blocks, allowing the developer to style "AI reasoning" differently from "AI output".

---

## 🛠️ Development Workflow

### Environment Setup
A `.env.local` is required with:
- `VITE_GEMINI_API_KEY`: Found in Google AI Studio.
- `VITE_SUPABASE_URL`: Found in Supabase Project Settings > API.
- `VITE_SUPABASE_ANON_KEY`: Found in Supabase Project Settings > API.

### Common Troubleshooting
- **Streaming Cuts**: Check if the response was flagged by `safetySettings`. Look for the "I'm unable to generate a response" fallback in `geminiService.ts`.
- **Auth Redirects**: Ensure the `redirectTo` URL in `AuthContext.tsx` matches your developer origin (e.g., `localhost:5173`).

---

## 🔗 Related Resources
- [Program Flows](./programFlows.md) - Logical step-by-step of core features.
- [Google AI documentation](https://ai.google.dev/docs)
- [Supabase Documentation](https://supabase.com/docs)
