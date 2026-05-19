/**
 * Socket.IO client hook with JWT authentication and exponential backoff reconnection.
 * Implements Requirements 15.4, 15.5, 15.6, 15.7
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import { getAccessToken } from '@/lib/api';

type EventHandler = (...args: unknown[]) => void;

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'failed';

interface UseSocketReturn {
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  on: (event: string, handler: EventHandler) => void;
  off: (event: string, handler: EventHandler) => void;
  emit: (event: string, ...args: unknown[]) => void;
  reconnect: () => void;
}

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventQueueRef = useRef<Array<{ event: string; args: unknown[] }>>([]);

  const connect = useCallback(() => {
    const token = getAccessToken();
    if (!token) {
      setConnectionStatus('disconnected');
      return;
    }

    // Clean up existing socket
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    }

    setConnectionStatus('connecting');

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: false, // We handle reconnection manually with exponential backoff
    });

    socket.on('connect', () => {
      setConnectionStatus('connected');
      reconnectAttemptsRef.current = 0;

      // Deliver queued events on reconnection
      const queue = eventQueueRef.current.splice(0);
      for (const { event, args } of queue) {
        socket.emit(event, ...args);
      }
    });

    socket.on('disconnect', (reason) => {
      setConnectionStatus('disconnected');

      // If the server disconnected us intentionally, don't auto-reconnect
      if (reason === 'io server disconnect') {
        return;
      }

      attemptReconnect();
    });

    socket.on('connect_error', () => {
      setConnectionStatus('disconnected');
      attemptReconnect();
    });

    socketRef.current = socket;
  }, []);

  const attemptReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setConnectionStatus('failed');
      return;
    }

    const attempt = reconnectAttemptsRef.current;
    const backoff = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
    reconnectAttemptsRef.current += 1;

    setConnectionStatus('connecting');

    reconnectTimerRef.current = setTimeout(() => {
      connect();
    }, backoff);
  }, [connect]);

  const reconnect = useCallback(() => {
    // Manual reconnect - reset attempts and try again
    reconnectAttemptsRef.current = 0;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    connect();
  }, [connect]);

  const on = useCallback((event: string, handler: EventHandler) => {
    socketRef.current?.on(event, handler);
  }, []);

  const off = useCallback((event: string, handler: EventHandler) => {
    socketRef.current?.off(event, handler);
  }, []);

  const emit = useCallback((event: string, ...args: unknown[]) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, ...args);
    } else {
      // Queue events for delivery on reconnection
      eventQueueRef.current.push({ event, args });
    }
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [connect]);

  return {
    isConnected: connectionStatus === 'connected',
    connectionStatus,
    on,
    off,
    emit,
    reconnect,
  };
}
