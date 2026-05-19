/**
 * Socket context that provides a shared Socket.IO connection to all child components.
 * Wraps the useSocket hook so all real-time hooks share the same connection.
 */
import { createContext, useContext, type ReactNode } from 'react';

import { useSocket, type ConnectionStatus } from '@/hooks/useSocket';

type EventHandler = (...args: unknown[]) => void;

interface SocketContextValue {
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  on: (event: string, handler: EventHandler) => void;
  off: (event: string, handler: EventHandler) => void;
  emit: (event: string, ...args: unknown[]) => void;
  reconnect: () => void;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

export function SocketProvider({ children }: { children: ReactNode }) {
  const socket = useSocket();

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
}

export function useSocketContext(): SocketContextValue {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocketContext must be used within a SocketProvider');
  }
  return context;
}
