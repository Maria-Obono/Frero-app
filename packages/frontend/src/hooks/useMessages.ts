/**
 * Hook for real-time incoming messages and read receipts.
 * Listens to Socket.IO 'message:new' and 'message:read' events.
 * Requirements: 7.1 (deliver message within 2s), 7.4 (read receipts within 2s)
 */
import { useState, useEffect, useCallback } from 'react';

import { useSocketContext } from '@/contexts/SocketContext';

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document';
  mediaUrl?: string;
  createdAt: string;
}

interface ReadReceiptEvent {
  chatId: string;
  messageId: string;
  readBy: string;
}

interface UseMessagesReturn {
  messages: Message[];
  readReceipts: Map<string, string[]>;
  sendMessage: (chatId: string, content: string, type?: string) => void;
  markAsRead: (chatId: string, messageId: string) => void;
  clearMessages: () => void;
}

export function useMessages(chatId: string): UseMessagesReturn {
  const { on, off, emit } = useSocketContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [readReceipts, setReadReceipts] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    const messageHandler = (data: unknown) => {
      const message = data as Message;
      if (message.chatId !== chatId) return;
      setMessages((prev) => [...prev, message]);
    };

    const readHandler = (data: unknown) => {
      const event = data as ReadReceiptEvent;
      if (event.chatId !== chatId) return;
      setReadReceipts((prev) => {
        const next = new Map(prev);
        const readers = next.get(event.messageId) ?? [];
        if (!readers.includes(event.readBy)) {
          next.set(event.messageId, [...readers, event.readBy]);
        }
        return next;
      });
    };

    on('message:new', messageHandler);
    on('message:read', readHandler);

    return () => {
      off('message:new', messageHandler);
      off('message:read', readHandler);
    };
  }, [on, off, chatId]);

  const sendMessage = useCallback(
    (targetChatId: string, content: string, type: string = 'text') => {
      emit('message:send', { chatId: targetChatId, content, type });
    },
    [emit]
  );

  const markAsRead = useCallback(
    (targetChatId: string, messageId: string) => {
      emit('message:read', { chatId: targetChatId, messageId });
    },
    [emit]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setReadReceipts(new Map());
  }, []);

  return { messages, readReceipts, sendMessage, markAsRead, clearMessages };
}
