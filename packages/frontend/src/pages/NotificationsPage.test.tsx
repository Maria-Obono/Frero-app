import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';

import NotificationsPage from './NotificationsPage';

// --- IntersectionObserver mock ---

class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor() {}
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

// --- Mocks ---

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('@/components/shared/Toast', () => ({
  useToast: () => ({ addToast: vi.fn(), removeToast: vi.fn(), toasts: [] }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockRefreshBadge = vi.fn();
vi.mock('@/hooks/useNotificationBadge', () => ({
  useNotificationBadge: () => ({
    unreadCount: 0,
    latestNotification: null,
    refresh: mockRefreshBadge,
  }),
}));

let socketHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};

vi.mock('@/contexts/SocketContext', () => ({
  useSocketContext: () => ({
    isConnected: true,
    connectionStatus: 'connected',
    on: (event: string, handler: (...args: unknown[]) => void) => {
      if (!socketHandlers[event]) socketHandlers[event] = [];
      socketHandlers[event].push(handler);
    },
    off: (event: string, handler: (...args: unknown[]) => void) => {
      if (socketHandlers[event]) {
        socketHandlers[event] = socketHandlers[event].filter((h) => h !== handler);
      }
    },
    emit: vi.fn(),
    reconnect: vi.fn(),
  }),
}));

import api from '@/lib/api';

let mockIdCounter = 0;

function createMockNotification(
  id: string,
  eventType: 'like' | 'comment' | 'message' | 'follow' | 'mention' | 'friend_request' = 'like',
  isRead = false
) {
  mockIdCounter += 1;
  return {
    id,
    eventType,
    sourceUser: {
      id: `user-${id}`,
      username: `user${id}`,
      displayName: `User ${id}`,
      avatarUrl: null,
    },
    referenceId: `post-${id}`,
    referenceType: 'post',
    isRead,
    createdAt: new Date(Date.now() - mockIdCounter * 60000).toISOString(),
  };
}

function renderNotificationsPage() {
  return render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>
  );
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketHandlers = {};
    mockIdCounter = 0;
  });

  it('shows skeleton loaders while loading', () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {}));
    const { container } = renderNotificationsPage();
    // Skeleton loaders have aria-hidden and animate-pulse class
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders notifications after loading', async () => {
    const notifications = [
      createMockNotification('1', 'like'),
      createMockNotification('2', 'comment'),
    ];
    (api.get as Mock).mockResolvedValueOnce({
      data: { data: notifications, cursor: null, hasMore: false },
    });

    renderNotificationsPage();

    await waitFor(() => {
      expect(screen.getByText('User 1')).toBeInTheDocument();
      expect(screen.getByText('liked your post')).toBeInTheDocument();
      expect(screen.getByText('User 2')).toBeInTheDocument();
      expect(screen.getByText('commented on your post')).toBeInTheDocument();
    });
  });

  it('shows empty state when no notifications', async () => {
    (api.get as Mock).mockResolvedValueOnce({
      data: { data: [], cursor: null, hasMore: false },
    });

    renderNotificationsPage();

    await waitFor(() => {
      expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    });
  });

  it('marks a single notification as read on click', async () => {
    const notifications = [createMockNotification('1', 'like', false)];
    (api.get as Mock).mockResolvedValueOnce({
      data: { data: notifications, cursor: null, hasMore: false },
    });
    (api.put as Mock).mockResolvedValueOnce({ data: { success: true } });

    renderNotificationsPage();

    await waitFor(() => {
      expect(screen.getByText('liked your post')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('liked your post'));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/notifications/1/read');
      expect(mockRefreshBadge).toHaveBeenCalled();
    });
  });

  it('marks all notifications as read', async () => {
    const notifications = [
      createMockNotification('1', 'like', false),
      createMockNotification('2', 'follow', false),
    ];
    (api.get as Mock).mockResolvedValueOnce({
      data: { data: notifications, cursor: null, hasMore: false },
    });
    (api.put as Mock).mockResolvedValueOnce({ data: { success: true } });

    renderNotificationsPage();

    await waitFor(() => {
      expect(screen.getByText('Mark all as read')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Mark all as read'));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/notifications/read-all');
      expect(mockRefreshBadge).toHaveBeenCalled();
    });
  });

  it('shows unread count', async () => {
    const notifications = [
      createMockNotification('1', 'like', false),
      createMockNotification('2', 'follow', false),
      createMockNotification('3', 'comment', true),
    ];
    (api.get as Mock).mockResolvedValueOnce({
      data: { data: notifications, cursor: null, hasMore: false },
    });

    renderNotificationsPage();

    await waitFor(() => {
      expect(screen.getByText('2 unread')).toBeInTheDocument();
    });
  });

  it('prepends new notifications received via Socket.IO', async () => {
    const notifications = [createMockNotification('1', 'like')];
    (api.get as Mock).mockResolvedValueOnce({
      data: { data: notifications, cursor: null, hasMore: false },
    });

    renderNotificationsPage();

    await waitFor(() => {
      expect(screen.getByText('User 1')).toBeInTheDocument();
    });

    // Simulate a new notification arriving via Socket.IO
    const newNotification = createMockNotification('new-1', 'follow', false);
    socketHandlers['notification:new']?.forEach((handler) => handler(newNotification));

    await waitFor(() => {
      expect(screen.getByText('User new-1')).toBeInTheDocument();
      expect(screen.getByText('started following you')).toBeInTheDocument();
    });
  });

  it('does not duplicate notifications from Socket.IO', async () => {
    const notifications = [createMockNotification('1', 'like')];
    (api.get as Mock).mockResolvedValueOnce({
      data: { data: notifications, cursor: null, hasMore: false },
    });

    renderNotificationsPage();

    await waitFor(() => {
      expect(screen.getByText('User 1')).toBeInTheDocument();
    });

    // Send the same notification again
    socketHandlers['notification:new']?.forEach((handler) => handler(notifications[0]));

    // Should still only have one instance
    await waitFor(() => {
      const items = screen.getAllByText('User 1');
      expect(items).toHaveLength(1);
    });
  });

  it('renders different notification types with correct messages', async () => {
    const notifications = [
      createMockNotification('1', 'like'),
      createMockNotification('2', 'comment'),
      createMockNotification('3', 'follow'),
      createMockNotification('4', 'mention'),
      createMockNotification('5', 'friend_request'),
      createMockNotification('6', 'message'),
    ];
    (api.get as Mock).mockResolvedValueOnce({
      data: { data: notifications, cursor: null, hasMore: false },
    });

    renderNotificationsPage();

    await waitFor(() => {
      expect(screen.getByText('liked your post')).toBeInTheDocument();
      expect(screen.getByText('commented on your post')).toBeInTheDocument();
      expect(screen.getByText('started following you')).toBeInTheDocument();
      expect(screen.getByText('mentioned you in a post')).toBeInTheDocument();
      expect(screen.getByText('sent you a friend request')).toBeInTheDocument();
      expect(screen.getByText('sent you a message')).toBeInTheDocument();
    });
  });

  it('shows "No more notifications" when all loaded', async () => {
    const notifications = [createMockNotification('1', 'like')];
    (api.get as Mock).mockResolvedValueOnce({
      data: { data: notifications, cursor: null, hasMore: false },
    });

    renderNotificationsPage();

    await waitFor(() => {
      expect(screen.getByText('No more notifications')).toBeInTheDocument();
    });
  });
});
