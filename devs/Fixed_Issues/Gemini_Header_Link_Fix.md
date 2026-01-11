# Gemini Header Link Fix

**Date:** January 11, 2026
**Component:** `App.tsx`

## Problem Description
Clicking the "Gemini" header link in the main content frame should start a new chat, but it wasn't working on:
1. **Search Page:** Clicking "Gemini" did nothing - the search overlay remained visible
2. **Temporary Chat Page:** Clicking "Gemini" did nothing - the temporary chat welcome screen remained visible

The link worked correctly when in a regular chat session.

## Root Cause Analysis

### 1. Link Component Only Navigates
The "Gemini" text in the header was implemented as a React Router `<Link>` component:

```typescript
<Link to="/app" className="...">Gemini</Link>
```

This only updated the URL to `/app` without resetting application state.

### 2. State Not Being Reset
When clicking the link, these state variables were not being cleared:
- `isSearchOpen` - remained `true`, so the `<SearchPage>` component stayed visible (line 707)
- `isTemporaryMode` - remained `true`, so the temporary chat welcome screen stayed visible (line 724)

### 3. Existing Function Was Incomplete
The `createNewSession()` function properly reset some state but did not close the search page:

```typescript
const createNewSession = async () => {
  navigate('/app');
  setInput('');
  setAttachments([]);
  setIsTemporaryMode(false);  // Reset temporary mode
  // Missing: setIsSearchOpen(false)
};
```

## The Solution

We implemented a fix in `components/App.tsx` involving two changes:

### 1. Updated `createNewSession` Function
Added `setIsSearchOpen(false)` to ensure the search page closes when starting a new chat.

**Before:**
```typescript
const createNewSession = async () => {
  navigate('/app');
  setInput('');
  setAttachments([]);
  setIsTemporaryMode(false);
};
```

**After:**
```typescript
const createNewSession = async () => {
  navigate('/app');
  setInput('');
  setAttachments([]);
  setIsTemporaryMode(false);  // Reset temporary mode when starting a new chat
  setIsSearchOpen(false);     // Close search page when starting a new chat
};
```

### 2. Replaced Link with Clickable Span
Changed the `<Link>` component to a `<span>` with an `onClick` handler that calls `createNewSession()`.

**Before:**
```typescript
<Link to="/app" className="text-xl font-medium text-gray-700 dark:text-gray-200 ml-1 hover:opacity-80 transition-opacity">Gemini</Link>
```

**After:**
```typescript
<span onClick={createNewSession} className="text-xl font-medium text-gray-700 dark:text-gray-200 ml-1 hover:opacity-80 transition-opacity cursor-pointer">Gemini</span>
```

**Why it works:** The `createNewSession()` function now properly resets all relevant state (search page, temporary mode, input, attachments) before navigating to `/app`, ensuring the UI displays the new chat welcome screen regardless of which page the user was on.

## Files Changed
- `components/App.tsx` (lines 2, 263, 686)

## Verification Steps
1. Open the app in dev mode (`npm run dev`)
2. Navigate to the search page (click search icon in sidebar)
3. Click the "Gemini" header link → should close search and show new chat welcome
4. Start a temporary chat (from sidebar dropdown)
5. Click the "Gemini" header link → should exit temp mode and show normal welcome
6. Navigate to an existing chat with messages
7. Click the "Gemini" header link → should show new chat welcome screen
