/**
 * Integration tests for real-time event wiring (Task 18.2).
 * Verifies that Socket.IO events are correctly handled by hooks and propagated to UI.
 *
 * Requirements: 15.1, 15.2, 15.3
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock SocketContext ---

type EventHandler = (...args: unknown[]) => void;
const eventHandlers = new Map<string, Set<EventHandler>>();

const mockOn = vi.fn((event: string, handler: EventHandler) => {
  if (!eventHandlers.has(event)) eventHandlers.set(event, new Set());
  eventHandlers.get(event)!.add(handler);
});

const mockOff = vi.fn((event: string, handler: EventHandler) => {
  eventHandlers.get(event)?.delete(handler);
});

const mockEmit = vi.fn();

vi.mock('@/contexts/SocketContext', () => ({
  useSocketContext: () => ({
    isConnected: true,
    connectionStatus: 'connected',
    on: mockOn,
    off: mockOff,
    emit: mockEmit,
    reconnect: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { count: 0 } }),
    post: vi.fn(),
    put: vi.fn(),
  },
  getAccessToken: () => 'test-token',
}));

function simulateEvent(event: string, data: unknown) {
  const handlers = eventHandlers.get(event);
  if (handlers) {
    for (const handler of handlers) {
      handler(data);
    }
  }
}

import { useNewPosts } from './useNewPosts';
import { useEngagementUpdates } from './useEngagementUpdates';
import { useOnlineStatus } from './useOnlineStatus';
import { useTypingIndicator } from './useTypingIndicator';
import { useNotificationBadge } from './useNotificationBadge';
import { useMessages } from './useMessages';

describe('Real-time event wiring integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers.clear();
  });

  describe('feed:new-post → useNewPosts (Requirement 15.1)', () => {
    it('registers listener for feed:new-post event', () => {
      renderHook(() => useNewPosts());
      expect(mockOn).toHaveBeenCalledWith('feed:new-post', expect.any(Function));
    });

    it('increments count when feed:new-post event is received', () => {
      const { result } = renderHook(() => useNewPosts());

      act(() => {
        simulateEvent('feed:new-post', { postId: 'post-1', authorId: 'user-1' });
      });

      expect(result.current.hasNew).toBe(true);
      expect(result.current.count).toBe(1);
      expect(result.current.newPostIds).toContain('post-1');
    });

    it('accumulates multiple new post events', () => {
      const { result } = renderHook(() => useNewPosts());

      act(() => {
        simulateEvent('feed:new-post', { postId: 'post-1', authorId: 'user-1' });
        simulateEvent('feed:new-post', { postId: 'post-2', authorId: 'user-2' });
        simulateEvent('feed:new-post', { postId: 'post-3', authorId: 'user-3' });
      });

      expect(result.current.count).toBe(3);
      expect(result.current.newPostIds).toEqual(['post-1', 'post-2', 'post-3']);
    });

    it('dismiss resets the new posts indicator', () => {
      const { result } = renderHook(() => useNewPosts());

      act(() => {
        simulateEvent('feed:new-post', { postId: 'post-1', authorId: 'user-1' });
      });

      expect(result.current.hasNew).toBe(true);

      act(() => {
        result.current.dismiss();
      });

      expect(result.current.hasNew).toBe(false);
      expect(result.current.count).toBe(0);
    });

    it('unregisters listener on unmount', () => {
      const { unmount } = renderHook(() => useNewPosts());
      unmount();
      expect(mockOff).toHaveBeenCalledWith('feed:new-post', expect.any(Function));
    });
  });

  describe('engagement:update → useEngagementUpdates (Requirement 15.2)', () => {
    it('registers listener for engagement:update event', () => {
      renderHook(() => useEngagementUpdates());
      expect(mockOn).toHaveBeenCalledWith('engagement:update', expect.any(Function));
    });

    it('updates counts when engagement:update event is received', () => {
      const { result } = renderHook(() => useEngagementUpdates());

      act(() => {
        simulateEvent('engagement:update', {
          postId: 'post-1',
          type: 'like',
          counts: { likes: 10, comments: 5, shares: 2 },
        });
      });

      expect(result.current.getCounts('post-1')).toEqual({
        likes: 10,
        comments: 5,
        shares: 2,
      });
    });

    it('handles multiple posts with different engagement counts', () => {
      const { result } = renderHook(() => useEngagementUpdates());

      act(() => {
        simulateEvent('engagement:update', {
          postId: 'post-1',
          type: 'like',
          counts: { likes: 10, comments: 5, shares: 2 },
        });
        simulateEvent('engagement:update', {
          postId: 'post-2',
          type: 'comment',
          counts: { likes: 3, comments: 8, shares: 0 },
        });
      });

      expect(result.current.getCounts('post-1')).toEqual({ likes: 10, comments: 5, shares: 2 });
      expect(result.current.getCounts('post-2')).toEqual({ likes: 3, comments: 8, shares: 0 });
    });

    it('overwrites previous counts for the same post', () => {
      const { result } = renderHook(() => useEngagementUpdates());

      act(() => {
        simulateEvent('engagement:update', {
          postId: 'post-1',
          type: 'like',
          counts: { likes: 5, comments: 2, shares: 1 },
        });
      });

      act(() => {
        simulateEvent('engagement:update', {
          postId: 'post-1',
          type: 'like',
          counts: { likes: 6, comments: 2, shares: 1 },
        });
      });

      expect(result.current.getCounts('post-1')).toEqual({ likes: 6, comments: 2, shares: 1 });
    });

    it('returns undefined for posts without updates', () => {
      const { result } = renderHook(() => useEngagementUpdates());
      expect(result.current.getCounts('unknown-post')).toBeUndefined();
    });

    it('unregisters listener on unmount', () => {
      const { unmount } = renderHook(() => useEngagementUpdates());
      unmount();
      expect(mockOff).toHaveBeenCalledWith('engagement:update', expect.any(Function));
    });
  });

  describe('user:status → useOnlineStatus (Requirement 15.3)', () => {
    it('registers listener for user:status event', () => {
      renderHook(() => useOnlineStatus(['user-1', 'user-2']));
      expect(mockOn).toHaveBeenCalledWith('user:status', expect.any(Function));
    });

    it('updates online status when user:status event is received', () => {
      const { result } = renderHook(() => useOnlineStatus(['user-1', 'user-2']));

      act(() => {
        simulateEvent('user:status', { userId: 'user-1', status: 'online' });
      });

      expect(result.current.get('user-1')).toBe(true);
      expect(result.current.get('user-2')).toBe(false);
    });

    it('handles offline status changes', () => {
      const { result } = renderHook(() => useOnlineStatus(['user-1']));

      act(() => {
        simulateEvent('user:status', { userId: 'user-1', status: 'online' });
      });
      expect(result.current.get('user-1')).toBe(true);

      act(() => {
        simulateEvent('user:status', { userId: 'user-1', status: 'offline' });
      });
      expect(result.current.get('user-1')).toBe(false);
    });

    it('only tracks specified user IDs', () => {
      const { result } = renderHook(() => useOnlineStatus(['user-1']));

      act(() => {
        simulateEvent('user:status', { userId: 'user-99', status: 'online' });
      });

      // user-99 is not in the tracked list, so it shouldn't appear
      expect(result.current.has('user-99')).toBe(false);
      expect(result.current.get('user-1')).toBe(false);
    });

    it('unregisters listener on unmount', () => {
      const { unmount } = renderHook(() => useOnlineStatus(['user-1']));
      unmount();
      expect(mockOff).toHaveBeenCalledWith('user:status', expect.any(Function));
    });
  });

  describe('message:new → useMessages (Requirement 7.1)', () => {
    it('registers listener for message:new event', () => {
      renderHook(() => useMessages('chat-1'));
      expect(mockOn).toHaveBeenCalledWith('message:new', expect.any(Function));
    });

    it('adds new messages to the thread when message:new event is received', () => {
      const { result } = renderHook(() => useMessages('chat-1'));

      act(() => {
        simulateEvent('message:new', {
          id: 'msg-1',
          chatId: 'chat-1',
          senderId: 'user-2',
          content: 'Hello!',
          type: 'text',
          createdAt: '2024-01-01T00:00:00Z',
        });
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].content).toBe('Hello!');
    });

    it('ignores messages for other chats', () => {
      const { result } = renderHook(() => useMessages('chat-1'));

      act(() => {
        simulateEvent('message:new', {
          id: 'msg-1',
          chatId: 'chat-2',
          senderId: 'user-2',
          content: 'Wrong chat',
          type: 'text',
          createdAt: '2024-01-01T00:00:00Z',
        });
      });

      expect(result.current.messages).toHaveLength(0);
    });

    it('emits message:send when sendMessage is called', () => {
      const { result } = renderHook(() => useMessages('chat-1'));

      act(() => {
        result.current.sendMessage('chat-1', 'Hi there', 'text');
      });

      expect(mockEmit).toHaveBeenCalledWith('message:send', {
        chatId: 'chat-1',
        content: 'Hi there',
        type: 'text',
      });
    });

    it('handles read receipts via message:read event', () => {
      const { result } = renderHook(() => useMessages('chat-1'));

      // First add a message
      act(() => {
        simulateEvent('message:new', {
          id: 'msg-1',
          chatId: 'chat-1',
          senderId: 'user-1',
          content: 'Hello',
          type: 'text',
          createdAt: '2024-01-01T00:00:00Z',
        });
      });

      // Then receive a read receipt
      act(() => {
        simulateEvent('message:read', {
          chatId: 'chat-1',
          messageId: 'msg-1',
          readBy: 'user-2',
        });
      });

      expect(result.current.readReceipts.get('msg-1')).toContain('user-2');
    });

    it('unregisters listeners on unmount', () => {
      const { unmount } = renderHook(() => useMessages('chat-1'));
      unmount();
      expect(mockOff).toHaveBeenCalledWith('message:new', expect.any(Function));
      expect(mockOff).toHaveBeenCalledWith('message:read', expect.any(Function));
    });
  });

  describe('typing:indicator → useTypingIndicator (Requirement 7.3)', () => {
    it('registers listener for typing:indicator event', () => {
      renderHook(() => useTypingIndicator('chat-1'));
      expect(mockOn).toHaveBeenCalledWith('typing:indicator', expect.any(Function));
    });

    it('adds user to typingUsers when typing starts', () => {
      const { result } = renderHook(() => useTypingIndicator('chat-1'));

      act(() => {
        simulateEvent('typing:indicator', {
          chatId: 'chat-1',
          userId: 'user-2',
          isTyping: true,
        });
      });

      expect(result.current.typingUsers).toContain('user-2');
    });

    it('removes user from typingUsers when typing stops', () => {
      const { result } = renderHook(() => useTypingIndicator('chat-1'));

      act(() => {
        simulateEvent('typing:indicator', {
          chatId: 'chat-1',
          userId: 'user-2',
          isTyping: true,
        });
      });

      act(() => {
        simulateEvent('typing:indicator', {
          chatId: 'chat-1',
          userId: 'user-2',
          isTyping: false,
        });
      });

      expect(result.current.typingUsers).not.toContain('user-2');
    });

    it('ignores typing events for other chats', () => {
      const { result } = renderHook(() => useTypingIndicator('chat-1'));

      act(() => {
        simulateEvent('typing:indicator', {
          chatId: 'chat-2',
          userId: 'user-2',
          isTyping: true,
        });
      });

      expect(result.current.typingUsers).toHaveLength(0);
    });

    it('emits typing:start when startTyping is called', () => {
      const { result } = renderHook(() => useTypingIndicator('chat-1'));

      act(() => {
        result.current.startTyping('chat-1');
      });

      expect(mockEmit).toHaveBeenCalledWith('typing:start', { chatId: 'chat-1' });
    });

    it('emits typing:stop when stopTyping is called', () => {
      const { result } = renderHook(() => useTypingIndicator('chat-1'));

      act(() => {
        result.current.stopTyping('chat-1');
      });

      expect(mockEmit).toHaveBeenCalledWith('typing:stop', { chatId: 'chat-1' });
    });

    it('unregisters listener on unmount', () => {
      const { unmount } = renderHook(() => useTypingIndicator('chat-1'));
      unmount();
      expect(mockOff).toHaveBeenCalledWith('typing:indicator', expect.any(Function));
    });
  });

  describe('notification:new → useNotificationBadge (Requirement 8.1)', () => {
    it('registers listener for notification:new event', () => {
      renderHook(() => useNotificationBadge());
      expect(mockOn).toHaveBeenCalledWith('notification:new', expect.any(Function));
    });

    it('increments unread count when notification:new event is received', async () => {
      const { result } = renderHook(() => useNotificationBadge());

      // Wait for initial fetch to complete
      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        simulateEvent('notification:new', {
          id: 'notif-1',
          eventType: 'like',
          sourceUserId: 'user-2',
          referenceId: 'post-1',
          referenceType: 'post',
          createdAt: '2024-01-01T00:00:00Z',
        });
      });

      expect(result.current.unreadCount).toBe(1);
    });

    it('stores the latest notification', async () => {
      const { result } = renderHook(() => useNotificationBadge());

      await act(async () => {
        await Promise.resolve();
      });

      const notifData = {
        id: 'notif-1',
        eventType: 'comment',
        sourceUserId: 'user-3',
        referenceId: 'post-5',
        referenceType: 'post',
        createdAt: '2024-01-01T12:00:00Z',
      };

      act(() => {
        simulateEvent('notification:new', notifData);
      });

      expect(result.current.latestNotification).toEqual(notifData);
    });

    it('unregisters listener on unmount', () => {
      const { unmount } = renderHook(() => useNotificationBadge());
      unmount();
      expect(mockOff).toHaveBeenCalledWith('notification:new', expect.any(Function));
    });
  });
});
