import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { ToastProvider, useToast } from './Toast';

// Helper component to trigger toasts in tests
function ToastTrigger({
  message = 'Test message',
  type = 'success' as const,
  duration,
}: {
  message?: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
}) {
  const { addToast } = useToast();
  return (
    <button onClick={() => addToast(message, type, duration)}>
      Add Toast
    </button>
  );
}

describe('Toast System', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a toast when addToast is called', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ToastProvider>
        <ToastTrigger message="Hello World" type="success" />
      </ToastProvider>
    );

    await user.click(screen.getByText('Add Toast'));
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders toast with role="alert" for accessibility', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ToastProvider>
        <ToastTrigger message="Alert message" type="error" />
      </ToastProvider>
    );

    await user.click(screen.getByText('Add Toast'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('auto-dismisses after 5 seconds by default', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ToastProvider>
        <ToastTrigger message="Auto dismiss" />
      </ToastProvider>
    );

    await user.click(screen.getByText('Add Toast'));
    expect(screen.getByText('Auto dismiss')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText('Auto dismiss')).not.toBeInTheDocument();
  });

  it('can be manually dismissed via close button', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ToastProvider>
        <ToastTrigger message="Dismiss me" />
      </ToastProvider>
    );

    await user.click(screen.getByText('Add Toast'));
    expect(screen.getByText('Dismiss me')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Dismiss notification'));
    expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument();
  });

  it('supports custom duration', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ToastProvider>
        <ToastTrigger message="Custom duration" duration={2000} />
      </ToastProvider>
    );

    await user.click(screen.getByText('Add Toast'));
    expect(screen.getByText('Custom duration')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(screen.getByText('Custom duration')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Custom duration')).not.toBeInTheDocument();
  });

  it('renders success toast with distinct styling', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ToastProvider>
        <ToastTrigger message="Success!" type="success" />
      </ToastProvider>
    );

    await user.click(screen.getByText('Add Toast'));
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('bg-green');
  });

  it('renders error toast with distinct styling', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ToastProvider>
        <ToastTrigger message="Error!" type="error" />
      </ToastProvider>
    );

    await user.click(screen.getByText('Add Toast'));
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('bg-red');
  });

  it('can display multiple toasts simultaneously', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ToastProvider>
        <ToastTrigger message="First" />
      </ToastProvider>
    );

    await user.click(screen.getByText('Add Toast'));
    await user.click(screen.getByText('Add Toast'));

    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(2);
  });

  it('has motion-reduce classes for reduced motion support', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ToastProvider>
        <ToastTrigger message="Motion test" />
      </ToastProvider>
    );

    await user.click(screen.getByText('Add Toast'));
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('motion-reduce:animate-none');
  });

  it('throws error when useToast is used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function BadComponent() {
      useToast();
      return null;
    }

    expect(() => render(<BadComponent />)).toThrow(
      'useToast must be used within a ToastProvider'
    );

    consoleSpy.mockRestore();
  });
});
