import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { useToast } from '@/components/shared/Toast';
import { useNotificationBadge } from '@/hooks/useNotificationBadge';
import { useSocketContext } from '@/contexts/SocketContext';
import { SkeletonLoader } from '@/components/shared/SkeletonLoader';

interface Notification {
  id: string;
  eventType: 'like' | 'comment' | 'message' | 'follow' | 'mention' | 'friend_request';
  sourceUser: {
    id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
  };
  referenceId?: string;
  referenceType?: string;
  isRead: boolean;
  createdAt: string;
}

function NotificationsPage() {
  const { addToast } = useToast();
  const { refresh: refreshBadge } = useNotificationBadge();
  const { on, off } = useSocketContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Load notifications
  const fetchNotifications = useCallback(async (nextCursor?: string | null) => {
    try {
      const params: Record<string, string> = {};
      if (nextCursor) params.cursor = nextCursor;
      const { data } = await api.get('/notifications', { params });
      return data as { data: Notification[]; cursor: string | null; hasMore: boolean };
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const result = await fetchNotifications();
      if (result) {
        setNotifications(result.data);
        setCursor(result.cursor);
        setHasMore(result.hasMore);
      }
      setIsLoading(false);
    }
    load();
  }, [fetchNotifications]);

  // Real-time: listen for new notifications via Socket.IO
  useEffect(() => {
    const handler = (data: unknown) => {
      const notification = data as Notification;
      setNotifications((prev) => {
        // Avoid duplicates
        if (prev.some((n) => n.id === notification.id)) return prev;
        return [notification, ...prev];
      });
    };

    on('notification:new', handler);
    return () => {
      off('notification:new', handler);
    };
  }, [on, off]);

  // Infinite scroll
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || !cursor) return;
    setIsLoadingMore(true);
    const result = await fetchNotifications(cursor);
    if (result) {
      setNotifications((prev) => [...prev, ...result.data]);
      setCursor(result.cursor);
      setHasMore(result.hasMore);
    }
    setIsLoadingMore(false);
  }, [cursor, hasMore, isLoadingMore, fetchNotifications]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMore(); },
      { threshold: 0.1 }
    );
    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [loadMore]);

  // Mark single as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await api.put(`/notifications/${notificationId}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
      );
      refreshBadge();
    } catch {
      addToast('Failed to mark as read', 'error');
    }
  }, [addToast, refreshBadge]);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      refreshBadge();
      addToast('All notifications marked as read', 'success');
    } catch {
      addToast('Failed to mark all as read', 'error');
    }
  }, [addToast, refreshBadge]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {unreadCount} unread
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="text-sm text-blue-500 hover:text-blue-600 font-medium transition-colors"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Notification list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-white dark:bg-gray-800">
              <SkeletonLoader width="44px" height="44px" rounded="full" />
              <div className="flex-1 space-y-2">
                <SkeletonLoader height="14px" className="w-3/4" />
                <SkeletonLoader height="12px" className="w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🔔</div>
          <p className="text-gray-500 dark:text-gray-400">No notifications yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            When someone interacts with your content, you'll see it here
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkAsRead={markAsRead}
              onRemove={(id) => setNotifications((prev) => prev.filter((n) => n.id !== id))}
            />
          ))}

          <div ref={sentinelRef} className="h-4" />

          {isLoadingMore && (
            <div className="flex items-center gap-3 p-4">
              <SkeletonLoader width="44px" height="44px" rounded="full" />
              <div className="flex-1 space-y-2">
                <SkeletonLoader height="14px" className="w-3/4" />
                <SkeletonLoader height="12px" className="w-1/4" />
              </div>
            </div>
          )}

          {!hasMore && notifications.length > 0 && (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">
              No more notifications
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// --- Notification Item ---

function NotificationItem({
  notification,
  onMarkAsRead,
  onRemove,
}: {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { addToast } = useToast();
  const [requestHandled, setRequestHandled] = useState(false);
  const { icon, message, link } = getNotificationContent(notification);

  const handleClick = () => {
    if (!notification.isRead) {
      onMarkAsRead(notification.id);
    }
  };

  const handleAcceptRequest = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!notification.referenceId) return;
    try {
      await api.post(`/users/friend-requests/${notification.referenceId}/accept`);
      setRequestHandled(true);
      addToast('Friend request accepted!', 'success');
      // Remove from list after a brief delay
      setTimeout(() => onRemove(notification.id), 1000);
    } catch {
      addToast('Failed to accept request', 'error');
    }
  };

  const handleDeclineRequest = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!notification.referenceId) return;
    try {
      await api.post(`/users/friend-requests/${notification.referenceId}/decline`);
      setRequestHandled(true);
      // Remove from list after a brief delay
      setTimeout(() => onRemove(notification.id), 1000);
    } catch {
      addToast('Failed to decline request', 'error');
    }
  };

  const content = (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
      aria-label={`${notification.sourceUser.displayName || notification.sourceUser.username} ${message}${notification.isRead ? '' : ' (unread)'}`}
      className={`flex items-start gap-3 p-4 rounded-xl transition-colors cursor-pointer ${
        notification.isRead
          ? 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750'
          : 'bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100/50 dark:hover:bg-blue-900/20'
      }`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="w-11 h-11 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          {notification.sourceUser.avatarUrl ? (
            <img src={notification.sourceUser.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500 font-bold text-sm">
              {(notification.sourceUser.displayName || notification.sourceUser.username)[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 text-sm" aria-hidden="true">{icon}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 dark:text-gray-200">
          <span className="font-semibold">{notification.sourceUser.displayName || notification.sourceUser.username}</span>{' '}
          {message}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {getTimeAgo(notification.createdAt)}
        </p>

        {/* Accept/Reject buttons for friend requests */}
        {notification.eventType === 'friend_request' && notification.referenceId && !requestHandled && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleAcceptRequest}
              className="px-3 py-1 text-xs font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            >
              Accept
            </button>
            <button
              onClick={handleDeclineRequest}
              className="px-3 py-1 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Decline
            </button>
          </div>
        )}
        {notification.eventType === 'friend_request' && requestHandled && (
          <p className="text-xs text-green-600 dark:text-green-400 mt-2 font-medium">Handled ✓</p>
        )}
      </div>

      {/* Unread dot */}
      {!notification.isRead && (
        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0 mt-2" aria-hidden="true" />
      )}
    </div>
  );

  if (link && notification.eventType !== 'friend_request') {
    return <Link to={link}>{content}</Link>;
  }
  return content;
}

// --- Helpers ---

function getNotificationContent(notification: Notification): { icon: string; message: string; link?: string } {
  switch (notification.eventType) {
    case 'like':
      return { icon: '❤️', message: 'liked your post', link: `/posts/${notification.referenceId}` };
    case 'comment':
      return { icon: '💬', message: 'commented on your post', link: `/posts/${notification.referenceId}` };
    case 'follow':
      return { icon: '👤', message: 'started following you', link: `/profile/${notification.sourceUser.id}` };
    case 'mention':
      return { icon: '@', message: 'mentioned you in a post', link: `/posts/${notification.referenceId}` };
    case 'friend_request':
      return { icon: '🤝', message: 'sent you a friend request', link: `/profile/${notification.sourceUser.id}` };
    case 'message':
      return { icon: '✉️', message: 'sent you a message', link: '/messages' };
    default:
      return { icon: '🔔', message: 'interacted with your content' };
  }
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default NotificationsPage;
