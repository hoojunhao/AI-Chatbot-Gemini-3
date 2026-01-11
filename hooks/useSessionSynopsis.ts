import { useEffect, useRef, useCallback } from 'react';
import { ChatSession, Message } from '../types';
import { generateSynopsisIfNeeded } from '../services/synopsisService';
import { useIdleTimer } from './useIdleTimer';

interface UseSessionSynopsisOptions {
  currentSessionId: string | null;
  sessions: ChatSession[];
  apiKey: string;
  userId: string | undefined;
  enabled?: boolean;
}

/**
 * useSessionSynopsis Hook
 *
 * Manages automatic synopsis generation for sessions.
 * Triggers on:
 * 1. Session switch - when user navigates to a different session
 * 2. Idle timeout - after 60 minutes of inactivity
 *
 * The synopsis enables Session RAG for all sessions, not just those
 * exceeding the 50k token summarization threshold.
 */
export function useSessionSynopsis({
  currentSessionId,
  sessions,
  apiKey,
  userId,
  enabled = true
}: UseSessionSynopsisOptions): void {
  // Track previous session to detect session switches
  const previousSessionIdRef = useRef<string | null>(null);
  const previousMessagesRef = useRef<Message[]>([]);

  // Get messages for a session
  const getSessionMessages = useCallback((sessionId: string | null): Message[] => {
    if (!sessionId) return [];
    const session = sessions.find(s => s.id === sessionId);
    return session?.messages || [];
  }, [sessions]);

  // Generate synopsis for a session (fire-and-forget)
  const triggerSynopsis = useCallback(async (
    sessionId: string,
    messages: Message[]
  ) => {
    if (!apiKey || !userId || messages.length === 0) {
      return;
    }

    try {
      console.log(`🔄 Triggering synopsis for session ${sessionId.slice(0, 8)}...`);
      await generateSynopsisIfNeeded(sessionId, messages, apiKey);
    } catch (error) {
      console.error('Synopsis generation failed:', error);
    }
  }, [apiKey, userId]);

  // Idle timeout handler
  const handleIdle = useCallback(() => {
    if (!enabled || !currentSessionId || !userId) return;

    const messages = getSessionMessages(currentSessionId);
    if (messages.length > 0) {
      console.log('⏰ Idle timeout - generating synopsis');
      triggerSynopsis(currentSessionId, messages);
    }
  }, [enabled, currentSessionId, userId, getSessionMessages, triggerSynopsis]);

  // Set up idle timer
  useIdleTimer(handleIdle, enabled && !!currentSessionId && !!userId);

  // Session switch detection
  useEffect(() => {
    if (!enabled || !userId) return;

    const prevSessionId = previousSessionIdRef.current;
    const prevMessages = previousMessagesRef.current;

    // Detect session switch (not initial load)
    if (prevSessionId && prevSessionId !== currentSessionId) {
      // Generate synopsis for the session we're leaving
      if (prevMessages.length > 0) {
        console.log(`🔀 Session switch detected - generating synopsis for previous session`);
        triggerSynopsis(prevSessionId, prevMessages);
      }
    }

    // Update refs for next comparison
    previousSessionIdRef.current = currentSessionId;
    previousMessagesRef.current = getSessionMessages(currentSessionId);
  }, [currentSessionId, enabled, userId, getSessionMessages, triggerSynopsis]);

  // Update messages ref when messages change (for idle timeout)
  useEffect(() => {
    if (currentSessionId) {
      previousMessagesRef.current = getSessionMessages(currentSessionId);
    }
  }, [currentSessionId, sessions, getSessionMessages]);
}
