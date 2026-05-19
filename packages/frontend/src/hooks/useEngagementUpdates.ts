/**
 * Hook for real-time engagement count updates (likes, comments, shares).
 * Listens to Socket.IO events for post engagement changes.
 * Requirements: 15.2 (update engagement count within 2s without page refresh)
 */
import { useState, useEffect, useCallback } from 'react';

import { useSocketContext } from '@/contexts/SocketContext';

interface EngagementCounts {
  likes: number;
  comments: number;
  shares: number;
}

interface EngagementUpdateEvent {
  postId: string;
  type: 'like' | 'unlike' | 'comment' | 'share';
  counts: EngagementCounts;
}

interface UseEngagementUpdatesReturn {
  getCounts: (postId: string) => EngagementCounts | undefined;
  setInitialCounts: (postId: string, counts: EngagementCounts) => void;
}

export function useEngagementUpdates(): UseEngagementUpdatesReturn {
  const { on, off } = useSocketContext();
  const [countsMap, setCountsMap] = useState<Map<string, EngagementCounts>>(new Map());

  useEffect(() => {
    const handler = (data: unknown) => {
      const event = data as EngagementUpdateEvent;
      setCountsMap((prev) => {
        const next = new Map(prev);
        next.set(event.postId, event.counts);
        return next;
      });
    };

    on('engagement:update', handler);
    return () => {
      off('engagement:update', handler);
    };
  }, [on, off]);

  const getCounts = useCallback(
    (postId: string) => countsMap.get(postId),
    [countsMap]
  );

  const setInitialCounts = useCallback((postId: string, counts: EngagementCounts) => {
    setCountsMap((prev) => {
      if (prev.has(postId)) return prev;
      const next = new Map(prev);
      next.set(postId, counts);
      return next;
    });
  }, []);

  return { getCounts, setInitialCounts };
}
