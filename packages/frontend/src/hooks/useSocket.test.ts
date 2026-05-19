import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock socket.io-client
const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  removeAllListeners: vi.fn(),
  connected: false,
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

let mockToken: string | null = 'test-jwt-token';

vi.mock('@/lib/api', () => ({
  getAccessToken: () => mockToken,
}));

import { useSocket } from './useSocket';
import { io } from 'socket.io-client';

describe('useSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockToken = 'test-jwt-token';
    mockSocket.connected = false;
    mockSocket.on.mockReset();
    mockSocket.off.mockReset();
    mockSocket.emit.mockReset();
    mockSocket.disconnect.mockReset();
    mockSocket.removeAllListeners.mockReset();
    (io as ReturnType<typeof vi.fn>).mockClear();
    (io as ReturnType<typeof vi.fn>).mockReturnValue(mockSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects with JWT token in auth handshake', () => {
    renderHook(() => useSocket());

    expect(io).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        auth: { token: 'test-jwt-token' },
        reconnection: false,
      })
    );
  });

  it('does not connect when no token is available', () => {
    mockToken = null;
    const { result } = renderHook(() => useSocket());

    expect(io).not.toHaveBeenCalled();
    expect(result.current.connectionStatus).toBe('disconnected');
  });

  it('sets status to connected on connect event', () => {
    const { result } = renderHook(() => useSocket());

    // Find the 'connect' handler
    const connectHandler = mockSocket.on.mock.calls.find(
      ([event]) => event === 'connect'
    )?.[1];

    act(() => {
      connectHandler?.();
    });

    expect(result.current.connectionStatus).toBe('connected');
    expect(result.current.isConnected).toBe(true);
  });

  it('attempts reconnection with exponential backoff on disconnect', () => {
    renderHook(() => useSocket());

    const disconnectHandler = mockSocket.on.mock.calls.find(
      ([event]) => event === 'disconnect'
    )?.[1];

    // Simulate disconnect (not server-initiated)
    act(() => {
      disconnectHandler?.('transport close');
    });

    // First reconnect attempt after 1s (1000ms * 2^0)
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Should have called io again for reconnection
    expect(io).toHaveBeenCalledTimes(2);
  });

  it('doubles backoff interval on each attempt', () => {
    renderHook(() => useSocket());

    const connectErrorHandler = mockSocket.on.mock.calls.find(
      ([event]) => event === 'connect_error'
    )?.[1];

    // First attempt: 1s
    act(() => {
      connectErrorHandler?.();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(io).toHaveBeenCalledTimes(2);

    // Reset mock calls for the new socket's handlers
    const secondConnectErrorHandler = mockSocket.on.mock.calls.find(
      ([event, handler]) => event === 'connect_error' && handler !== connectErrorHandler
    )?.[1] || connectErrorHandler;

    // Second attempt: 2s
    act(() => {
      secondConnectErrorHandler?.();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(io).toHaveBeenCalledTimes(3);
  });

  it('sets status to failed after max 5 attempts', () => {
    const { result } = renderHook(() => useSocket());

    const connectErrorHandler = mockSocket.on.mock.calls.find(
      ([event]) => event === 'connect_error'
    )?.[1];

    // Exhaust all 5 attempts
    for (let i = 0; i < 5; i++) {
      act(() => {
        connectErrorHandler?.();
      });
      const backoff = Math.min(1000 * Math.pow(2, i), 30000);
      act(() => {
        vi.advanceTimersByTime(backoff);
      });
    }

    // 6th error should set status to failed
    act(() => {
      connectErrorHandler?.();
    });

    expect(result.current.connectionStatus).toBe('failed');
  });

  it('does not reconnect when server intentionally disconnects', () => {
    renderHook(() => useSocket());

    const disconnectHandler = mockSocket.on.mock.calls.find(
      ([event]) => event === 'disconnect'
    )?.[1];

    const callCountBefore = (io as ReturnType<typeof vi.fn>).mock.calls.length;

    act(() => {
      disconnectHandler?.('io server disconnect');
    });

    // Advance time - no reconnection should happen
    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(io).toHaveBeenCalledTimes(callCountBefore);
  });

  it('queues events when disconnected and delivers on reconnection', () => {
    const { result } = renderHook(() => useSocket());

    // Emit while disconnected (socket.connected is false)
    act(() => {
      result.current.emit('message:send', { chatId: '1', content: 'hello' });
    });

    // The socket.emit should NOT have been called
    expect(mockSocket.emit).not.toHaveBeenCalled();

    // Simulate reconnection
    mockSocket.connected = true;
    const connectHandler = mockSocket.on.mock.calls.find(
      ([event]) => event === 'connect'
    )?.[1];

    act(() => {
      connectHandler?.();
    });

    // Queued event should now be delivered
    expect(mockSocket.emit).toHaveBeenCalledWith('message:send', { chatId: '1', content: 'hello' });
  });

  it('manual reconnect resets attempt counter and connects', () => {
    const { result } = renderHook(() => useSocket());

    const connectErrorHandler = mockSocket.on.mock.calls.find(
      ([event]) => event === 'connect_error'
    )?.[1];

    // Exhaust all attempts
    for (let i = 0; i < 5; i++) {
      act(() => {
        connectErrorHandler?.();
      });
      act(() => {
        vi.advanceTimersByTime(30000);
      });
    }

    act(() => {
      connectErrorHandler?.();
    });

    expect(result.current.connectionStatus).toBe('failed');

    const callCountBefore = (io as ReturnType<typeof vi.fn>).mock.calls.length;

    // Manual reconnect
    act(() => {
      result.current.reconnect();
    });

    expect(io).toHaveBeenCalledTimes(callCountBefore + 1);
  });

  it('cleans up socket on unmount', () => {
    const { unmount } = renderHook(() => useSocket());

    unmount();

    expect(mockSocket.removeAllListeners).toHaveBeenCalled();
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });
});
