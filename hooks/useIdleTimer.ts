import { useEffect, useRef, useCallback } from 'react';
import { SYNOPSIS_CONFIG } from '../constants';

/**
 * useIdleTimer Hook
 *
 * Detects user inactivity and triggers a callback after the specified timeout.
 * Resets the timer on user activity (mouse, keyboard, touch, scroll).
 *
 * @param onIdle - Callback to execute when user becomes idle
 * @param enabled - Whether the idle timer is enabled (default: true)
 */
export function useIdleTimer(
  onIdle: () => void,
  enabled: boolean = true
): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleRef = useRef(onIdle);

  // Keep callback ref updated to avoid stale closures
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      onIdleRef.current();
    }, SYNOPSIS_CONFIG.idleTimeoutMs);
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'];

    // Add listeners for activity detection
    events.forEach(event => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    // Start the initial timer
    resetTimer();

    // Cleanup
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [resetTimer, enabled]);
}
