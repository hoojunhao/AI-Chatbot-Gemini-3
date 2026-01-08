# Scroll & Layout Instability Fix

**Date:** January 8, 2026
**Component:** `App.tsx`

## Problem Description
When using the "Thinking" model or generating long responses (especially with Math/LaTeX content), the application exhibited severe layout instability:
1.  **Abnormal Scrolling:** The chat container would "shake" or fight the user's scroll position.
2.  **Layout Glitches:** The entire page layout would shift upwards, pushing the fixed Header out of the viewport and misaligning the input area.

## Root Cause Analysis

### 1. Browser Scroll Chaining (`scrollIntoView`)
The previous implementation used `messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })`.
*   **The Mechanism:** When `scrollIntoView` is called on an element, the browser attempts to make that element visible by scrolling **all scrollable ancestors**.
*   **The Failure:** As content expanded rapidly (due to "Thinking" blocks or KaTeX rendering), `scrollIntoView` triggered a scroll on the main window/body element to keep the bottom visible. This bypassed our CSS layout constraints (`overflow-hidden` on the main wrapper), causing the fixed header to be pushed off-screen.

### 2. Smooth Scrolling Conflict
We were enforcing `behavior: 'smooth'` for every new token generated.
*   **The Conflict:** The Gemini API streams text extremely fast. "Smooth" scrolling is an animation that takes several hundred milliseconds.
*   **The Result:** New chunks arrived before the previous scroll animation finished. The browser got stuck in a loop of retargeting the scroll animation, resulting in a jerky, vibrating visual effect.

## The Solution

We implemented a robust fix in `components/App.tsx` involving two key architectural changes:

### 1. Targeted Container Scrolling
We replaced the recursive `scrollIntoView` with a direct scroll method on the container reference.

**Before:**
```typescript
messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
```

**After:**
```typescript
const scrollToBottom = () => {
  if (chatContainerRef.current) {
    const { scrollHeight, clientHeight } = chatContainerRef.current;
    const maxScrollTop = scrollHeight - clientHeight;
    
    // Explicitly scrolls ONLY the chat container, interfering with nothing else
    chatContainerRef.current.scrollTo({
      top: maxScrollTop,
      behavior: isGenerating ? 'auto' : 'smooth'
    });
  }
};
```

**Why it works:** `element.scrollTo()` strictly affects that specific element. It renders it impossible for the chat updates to affect the window scroll position or the main layout structure.

### 2. Conditional Scroll Behavior
We dynamically switch the scroll behavior based on the application state.
*   **During Generation (`isGenerating: true`)**: We use `behavior: 'auto'` (instant). This snaps the view to the bottom instantly for every new chunk, which looks like a stable stream to the human eye.
*   **User Actions (`isGenerating: false`)**: We use `behavior: 'smooth'` for manual actions like sending a message, preserving the polished UI feel.
