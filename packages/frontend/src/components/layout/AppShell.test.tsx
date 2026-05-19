import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import AppShell from './AppShell';

vi.mock('@/contexts/SocketContext', () => ({
  useSocketContext: () => ({
    isConnected: true,
    connectionStatus: 'connected',
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    reconnect: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { count: 0 } }),
  },
}));

function renderAppShell(initialRoute = '/') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('AppShell', () => {
  it('renders the navigation bar with Frero branding', () => {
    renderAppShell();

    expect(screen.getByText('Frero')).toBeInTheDocument();
  });

  it('renders the sidebar with navigation links', () => {
    renderAppShell();

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Explore')).toBeInTheDocument();
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders the main content area', () => {
    renderAppShell();

    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
  });

  it('toggles sidebar on mobile menu button click', async () => {
    const user = userEvent.setup();
    const { container } = renderAppShell();

    const menuButton = screen.getByLabelText('Toggle menu');
    const sidebar = container.querySelector('aside')!;

    // Initially sidebar is hidden on mobile (has -translate-x-full)
    expect(sidebar.className).toContain('-translate-x-full');

    // Click menu button to open
    await user.click(menuButton);

    // Sidebar should now be visible (translate-x-0)
    expect(sidebar.className).toContain('translate-x-0');
  });

  it('closes sidebar when a nav link is clicked', async () => {
    const user = userEvent.setup();
    const { container } = renderAppShell();

    const menuButton = screen.getByLabelText('Toggle menu');

    // Open sidebar
    await user.click(menuButton);

    // Click a nav link
    await user.click(screen.getByText('Explore'));

    // Sidebar should close (back to -translate-x-full)
    const sidebar = container.querySelector('aside')!;
    expect(sidebar.className).toContain('-translate-x-full');
  });

  it('renders search input in the navbar', () => {
    renderAppShell();

    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('renders theme toggle button', () => {
    renderAppShell();

    expect(screen.getByLabelText(/Current theme/)).toBeInTheDocument();
  });

  it('renders notifications button', () => {
    renderAppShell();

    expect(screen.getByLabelText(/Notifications/)).toBeInTheDocument();
  });
});
