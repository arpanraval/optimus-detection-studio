import { useState, useEffect, useCallback, useRef } from 'react';

interface UseInfiniteScrollOptions<T> {
  /** All items to paginate through */
  items: T[];
  /** Number of items to load per batch */
  pageSize?: number;
  /** Threshold in pixels before bottom to trigger load (default: 200) */
  threshold?: number;
}

interface UseInfiniteScrollReturn<T> {
  /** Currently visible items (grows as user scrolls) */
  visibleItems: T[];
  /** Whether there are more items to load */
  hasMore: boolean;
  /** Whether currently loading more items */
  isLoadingMore: boolean;
  /** Ref to attach to the scrollable container */
  scrollRef: React.RefObject<HTMLElement | null>;
  /** Manually load more items */
  loadMore: () => void;
  /** Reset to initial page */
  reset: () => void;
  /** Total count of all items */
  totalCount: number;
  /** Count of currently visible items */
  visibleCount: number;
}

/**
 * Hook for client-side infinite scroll over a pre-loaded list.
 *
 * Progressively reveals items as the user scrolls, avoiding
 * the DOM cost of rendering thousands of rows at once.
 *
 * @example
 * const { visibleItems, scrollRef, hasMore } = useInfiniteScroll({
 *   items: allDetections,
 *   pageSize: 50,
 * });
 *
 * return (
 *   <div ref={scrollRef} className="overflow-y-auto h-full">
 *     {visibleItems.map(item => <Row key={item.id} {...item} />)}
 *     {hasMore && <LoadingIndicator />}
 *   </div>
 * );
 */
export function useInfiniteScroll<T>({
  items,
  pageSize = 50,
  threshold = 200,
}: UseInfiniteScrollOptions<T>): UseInfiniteScrollReturn<T> {
  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const scrollRef = useRef<HTMLElement | null>(null);
  const prevItemsRef = useRef(items);

  // Reset page when items array changes (e.g., filter/sort changed)
  useEffect(() => {
    if (prevItemsRef.current !== items) {
      setPage(1);
      prevItemsRef.current = items;
    }
  }, [items]);

  const visibleCount = Math.min(page * pageSize, items.length);
  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    // Small delay to show loading state and avoid janky scroll
    requestAnimationFrame(() => {
      setPage(prev => prev + 1);
      setIsLoadingMore(false);
    });
  }, [hasMore, isLoadingMore]);

  const reset = useCallback(() => {
    setPage(1);
  }, []);

  // Scroll event listener
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !hasMore) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop - clientHeight < threshold) {
        loadMore();
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMore, threshold, loadMore]);

  return {
    visibleItems,
    hasMore,
    isLoadingMore,
    scrollRef,
    loadMore,
    reset,
    totalCount: items.length,
    visibleCount,
  };
}
