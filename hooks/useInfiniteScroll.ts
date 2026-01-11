import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseInfiniteScrollOptions {
  initialCount: number;
  incrementCount: number;
  rootMargin?: string;
}

export interface UseInfiniteScrollResult<T> {
  visibleItems: T[];
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  hasMore: boolean;
  reset: () => void;
}

/**
 * useInfiniteScroll Hook
 *
 * Provides lazy loading / infinite scroll functionality for lists.
 * Uses IntersectionObserver to detect when to load more items.
 *
 * @param items - The full array of items to lazy load
 * @param options - Configuration for initial count, increment, and observer margin
 * @returns Object containing visible items, sentinel ref, hasMore flag, and reset function
 */
export function useInfiniteScroll<T>(
  items: T[],
  options: UseInfiniteScrollOptions
): UseInfiniteScrollResult<T> {
  const { initialCount, incrementCount, rootMargin = '200px' } = options;

  const [visibleCount, setVisibleCount] = useState(initialCount);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Reset visible count when items array changes (e.g., search filter applied)
  useEffect(() => {
    setVisibleCount(initialCount);
  }, [items, initialCount]);

  const loadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + incrementCount, items.length));
  }, [incrementCount, items.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // Disconnect previous observer if exists
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin }
    );

    observerRef.current.observe(sentinel);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [loadMore, rootMargin]);

  const reset = useCallback(() => {
    setVisibleCount(initialCount);
  }, [initialCount]);

  return {
    visibleItems: items.slice(0, visibleCount),
    sentinelRef,
    hasMore: visibleCount < items.length,
    reset,
  };
}
