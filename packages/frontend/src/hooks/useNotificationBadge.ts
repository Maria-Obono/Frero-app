/**
 * Hook for real-time notification badge count.
 * Listens to Socket.IO 'notification:new' event and increments unread count.
 * Requirements: 8.1 (deliver notification via Socket.IO within 2s), 8.9 (unread count)
 */
import { useState, useEffect, useCallback } from 'react';

import { useSocketContext } from '@/contexts/SocketContext';
import api from '@/lib/api';

interface Notification {
  id: string;
  eventType: string;
  sourceUserId: string;
  referenceId: string;
  referenceType: string;
  createdAt: string;
}

interface NotificationBadgeReturn {
  unreadCount: number;
  latestNotification: Notification | null;
  refresh: () => void;
}

export function useNotificationBadge(): NotificationBadgeReturn {
  const { on, off } = useSocketContext();
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestNotification, setLatestNotification] = useState<Notification | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      setUnreadCount(data.count ?? 0);
    } catch {
      // Silently fail - badge is non-critical
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = (data: unknown) => {
      const notification = data as Notification;
      setUnreadCount((prev) => prev + 1);
      setLatestNotification(notification);
    };

    on('notification:new', handler);
    return () => {
      off('notification:new', handler);
    };
  }, [on, off]);

  return { unreadCount, latestNotification, refresh };
}
