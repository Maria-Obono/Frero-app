import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { PageTransition } from './PageTransition';

// Mock the useReducedMotion hook
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}));

import { useReducedMotion } from '@/hooks/useReducedMotion';

const mockedUseReducedMotion = vi.mocked(useReducedMotion);

function renderWithRouter(ui: React.ReactElement, { route = '/' } = {}) {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

describe('PageTransition', () => {
  beforeEach(() => {
    mockedUseReducedMotion.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders children', () => {
    renderWithRouter(
      <PageTransition>
        <p>Page content</p>
      </PageTransition>
    );
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('applies transition styles when motion is allowed', () => {
    const { container } = renderWithRouter(
      <PageTransition duration={200}>
        <p>Content</p>
      </PageTransition>
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.transition).toContain('200ms');
  });

  it('renders without transition when reduced motion is preferred', () => {
    mockedUseReducedMotion.mockReturnValue(true);

    const { container } = renderWithRouter(
      <PageTransition>
        <p>Content</p>
      </PageTransition>
    );
    const wrapper = container.firstChild as HTMLElement;
    // Should not have transition styles
    expect(wrapper.style.transition).toBe('');
  });

  it('accepts duration prop within 150-300ms range', () => {
    const { container } = renderWithRouter(
      <PageTransition duration={300}>
        <p>Content</p>
      </PageTransition>
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.transition).toContain('300ms');
  });

  it('defaults to 200ms duration', () => {
    const { container } = renderWithRouter(
      <PageTransition>
        <p>Content</p>
      </PageTransition>
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.transition).toContain('200ms');
  });
});
