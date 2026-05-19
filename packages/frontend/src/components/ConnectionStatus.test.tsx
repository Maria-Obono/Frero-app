import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

const mockReconnect = vi.fn();
let mockConnectionStatus = 'connected';

vi.mock('@/contexts/SocketContext', () => ({
  useSocketContext: () => ({
    isConnected: mockConnectionStatus === 'connected',
    connectionStatus: mockConnectionStatus,
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    reconnect: mockReconnect,
  }),
}));

import { ConnectionStatus } from './ConnectionStatus';

describe('ConnectionStatus', () => {
  beforeEach(() => {
    mockConnectionStatus = 'connected';
    mockReconnect.mockClear();
  });

  it('renders nothing when connected', () => {
    mockConnectionStatus = 'connected';
    const { container } = render(<ConnectionStatus />);
    expect(container.firstChild).toBeNull();
  });

  it('shows reconnecting indicator when connecting', () => {
    mockConnectionStatus = 'connecting';
    render(<ConnectionStatus />);
    expect(screen.getByText('Reconnecting...')).toBeInTheDocument();
  });

  it('shows disconnected state', () => {
    mockConnectionStatus = 'disconnected';
    render(<ConnectionStatus />);
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('shows connection lost with reconnect button when failed', () => {
    mockConnectionStatus = 'failed';
    render(<ConnectionStatus />);
    expect(screen.getByText('Connection lost')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
  });

  it('calls reconnect when button is clicked', async () => {
    mockConnectionStatus = 'failed';
    const user = userEvent.setup();
    render(<ConnectionStatus />);

    await user.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(mockReconnect).toHaveBeenCalledTimes(1);
  });

  it('has accessible role and aria-live for screen readers', () => {
    mockConnectionStatus = 'connecting';
    render(<ConnectionStatus />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });
});
