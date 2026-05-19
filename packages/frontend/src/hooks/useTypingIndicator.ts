/**
 * Hook for typing indicators in chat.
 * Listens to Socket.IO 'typing:indicator' event and emits typing start/stop.
 * Requirements: 7.3 (broadcast typing indicator within 500ms)
 */
import { useState, useCallback, useEffect, useRef } from 'react';

import { useSocketContext } from '@/contexts/SocketContext';

interface TypingEvent {
  chatId: string;
  userId: string;
  isTyping: boolean;
}

interface TypingIndicatorReturn {
  typingUsers: string[];
  startTyping: (chatId: string) => void;
  stopTyping: (chatId: string) => void;
}

const TYPING_TIMEOUT_MS = 3000;

export function useTypingIndicator(chatId: string): TypingIndicatorReturn {
  const { on, off, emit } = useSocketContext();
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const handler = (data: unknown) => {
      const event = data as TypingEvent;
      if (event.chatId !== chatId) return;

      if (event.isTyping) {
        setTypingUsers((prev) =>
          prev.includes(event.userId) ? prev : [...prev, event.userId]
        );

        // Auto-remove after timeout (in case stop event is missed)
        const existingTimer = typingTimersRef.current.get(event.userId);
        if (existingTimer) clearTimeout(existingTimer);

        const timer = setTimeout(() => {
          setTypingUsers((prev) => prev.filter((id) => id !== event.userId));
          typingTimersRef.current.delete(event.userId);
        }, TYPING_TIMEOUT_MS);

        typingTimersRef.current.set(event.userId, timer);
      } else {
        setTypingUsers((prev) => prev.filter((id) => id !== event.userId));
        const timer = typingTimersRef.current.get(event.userId);
        if (timer) {
          clearTimeout(timer);
          typingTimersRef.current.delete(event.userId);
        }
      }
    };

    on('typing:indicator', handler);
    return () => {
      off('typing:indicator', handler);
      // Clear all timers on unmount
      for (const timer of typingTimersRef.current.values()) {
        clearTimeout(timer);
      }
      typingTimersRef.current.clear();
    };
  }, [on, off, chatId]);

  const startTyping = useCallback(
    (targetChatId: string) => {
      emit('typing:start', { chatId: targetChatId });
    },
    [emit]
  );

  const stopTyping = useCallback(
    (targetChatId: string) => {
      emit('typing:stop', { chatId: targetChatId });
    },
    [emit]
  );

  return {
    typingUsers,
    startTyping,
    stopTyping,
  };
}
