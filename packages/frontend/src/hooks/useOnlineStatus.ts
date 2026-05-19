/**
 * Hook for tracking user online/offline status in real-time.
 * Listens to Socket.IO 'user:status' event and maintains a map of user statuses.
 * Requirements: 15.3 (propagate status update to connected contacts within 3s)
 */
import { useState, useEffect, useCallback } from 'react';

import { useSocketContext } from '@/contexts/SocketContext';

interface StatusEvent {
  userId: string;
  status: 'online' | 'offline';
}

export function useOnlineStatus(userIds: string[]): Map<string, boolean> {
  const { on, off } = useSocketContext();
  const [onlineMap, setOnlineMap] = useState<Map<string, boolean>>(new Map());

  // Update the map when a status event arrives
  useEffect(() => {
    const handler = (data: unknown) => {
      const event = data as StatusEvent;
      setOnlineMap((prev) => {
        const next = new Map(prev);
        next.set(event.userId, event.status === 'online');
        return next;
      });
    };

    on('user:status', handler);
    return () => {
      off('user:status', handler);
    };
  }, [on, off]);

  // Filter the map to only include tracked userIds
  const getFilteredMap = useCallback(() => {
    const filtered = new Map<string, boolean>();
    for (const id of userIds) {
      filtered.set(id, onlineMap.get(id) ?? false);
    }
    return filtered;
  }, [userIds, onlineMap]);

  return getFilteredMap();
}
