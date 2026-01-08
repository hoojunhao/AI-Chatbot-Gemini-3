# Program Flows

This document outlines the core logical flows of the Gemini Chat Clone.

## 1. Authentication Flow
- **Initialization**: `AuthContext` checks for an existing Supabase session on mount.
- **Login/Signup**: Users can sign up with email/password or use Google OAuth.
- **State Management**: `useAuth` hook provides the user object and session status globally.
- **Protection**: `App` component redirects unauthenticated users or allows guest mode depending on the route.

## 2. Chat Persistence Flow
- **Session Creation**: When a user sends the first message in a "New Chat", `ChatService.createSession` is called to initialize a record in Supabase.
- **Message Storage**:
  1. User message is saved to the `messages` table via `ChatService.saveMessage`.
  2. Model response is streamed and displayed in the UI.
  3. Once streaming completes, the full model response is saved to the `messages` table.
- **Session Retrieval**: `ChatService.fetchSessions` loads all historical chats for the authenticated user, ordered by most recently updated.

## 3. Gemini API Integration Flow
- **Request Preparation**: `generateResponseStream` prepares the payload:
  - **System Instruction**: Applied from user settings.
  - **Memory/History**: Filters out error messages and maps previous turns to Gemini's `Content` format.
  - **Multimodal**: Attachments (images) are converted to `inlineData`.
- **Streaming**: Uses `ai.models.generateContentStream` to stream parts.
- **Thinking Mode**: If enabled for Gemini 3 Flash, the flow detects `thought` parts in the stream and wraps them in `<thinking>` tags for specialized rendering in `MarkdownRenderer`.

## 4. Settings Management Flow
- **Initialization**: Settings are fetched from the `user_settings` table in Supabase upon user login.
- **Updates**: Changes in `SettingsModal` are optimistically updated in React state and then persisted to Supabase via `SettingsService.updateSettings`.
- **Defaults**: Uses `DEFAULT_SETTINGS` from `constants.ts` if no user preferences are found.

## 5. UI/UX Interaction Flows
- **Theme Toggling**: Persists choice to `localStorage` and applies/removes the `dark` class on the root element.
- **Sidebar Responsive Logic**: Autodetects screen width to hide/show the sidebar but allows manual overrides.
- **Voice/Microphone**: Uses the browser's `SpeechRecognition` API to populate the input field in real-time.
