import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';

import HomePage from './HomePage';

// --- IntersectionObserver mock (not available in jsdom) ---

class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor() {}
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

// --- Mocks ---

const mockGetCounts = vi.fn().mockReturnValue(undefined);

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/hooks/useNewPosts', () => ({
  useNewPosts: vi.fn().mockReturnValue({
    hasNew: false,
    count: 0,
    newPostIds: [],
    dismiss: vi.fn(),
  }),
}));

vi.mock('@/hooks/useEngagementUpdates', () => ({
  useEngagementUpdates: () => ({
    getCounts: mockGetCounts,
    setInitialCounts: vi.fn(),
  }),
}));

vi.mock('@/components/shared/Toast', () => ({
  useToast: () => ({ addToast: vi.fn(), removeToast: vi.fn(), toasts: [] }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

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

// Mock StoryBar to avoid its own API calls and rendering issues
vi.mock('@/components/feed/StoryBar', () => ({
  StoryBar: () => <div data-testid="story-bar">StoryBar</div>,
}));

import api from '@/lib/api';
import { useNewPosts } from '@/hooks/useNewPosts';

function createMockPost(id: string): object {
  return {
    id,
    author: { id: `user-${id}`, username: `user${id}`, displayName: `User ${id}`, avatarUrl: null },
    type: 'text',
    content: `Post content ${id}`,
    likeCount: 5,
    commentCount: 2,
    shareCount: 1,
    isLiked: false,
    isBookmarked: false,
    createdAt: new Date().toISOString(),
  };
}

function renderHomePage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCounts.mockReturnValue(undefined);
  });

  it('shows skeleton loaders while loading', () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {})); // never resolves
    renderHomePage();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('renders posts after loading', async () => {
    const posts = [createMockPost('1'), createMockPost('2')];
    (api.get as Mock).mockResolvedValueOnce({
      data: { data: posts, cursor: 'abc', hasMore: true },
    });

    renderHomePage();

    await waitFor(() => {
      expect(screen.getByText('Post content 1')).toBeInTheDocument();
      expect(screen.getByText('Post content 2')).toBeInTheDocument();
    });
  });

  it('shows empty state when no posts', async () => {
    (api.get as Mock).mockResolvedValueOnce({
      data: { data: [], cursor: null, hasMore: false },
    });

    renderHomePage();

    await waitFor(() => {
      expect(screen.getByText('No posts yet')).toBeInTheDocument();
    });
  });

  it('shows new posts indicator when new posts arrive via socket', async () => {
    (useNewPosts as Mock).mockReturnValue({
      hasNew: true,
      count: 3,
      newPostIds: ['a', 'b', 'c'],
      dismiss: vi.fn(),
    });

    (api.get as Mock).mockResolvedValueOnce({
      data: { data: [createMockPost('1')], cursor: null, hasMore: false },
    });

    renderHomePage();

    await waitFor(() => {
      expect(screen.getByText(/3 new posts available/)).toBeInTheDocument();
    });
  });

  it('refreshes feed when new posts indicator is clicked', async () => {
    const dismissMock = vi.fn();
    (useNewPosts as Mock).mockReturnValue({
      hasNew: true,
      count: 2,
      newPostIds: ['a', 'b'],
      dismiss: dismissMock,
    });

    (api.get as Mock)
      .mockResolvedValueOnce({
        data: { data: [createMockPost('1')], cursor: null, hasMore: false },
      })
      .mockResolvedValueOnce({
        data: { data: [createMockPost('new-1'), createMockPost('new-2')], cursor: null, hasMore: false },
      });

    renderHomePage();

    await waitFor(() => {
      expect(screen.getByText(/2 new posts available/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/2 new posts available/));

    expect(dismissMock).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByText('Post content new-1')).toBeInTheDocument();
    });
  });

  it('applies real-time engagement count updates to posts', async () => {
    mockGetCounts.mockImplementation((postId: string) => {
      if (postId === '1') return { likes: 99, comments: 50, shares: 10 };
      return undefined;
    });

    (api.get as Mock).mockResolvedValueOnce({
      data: { data: [createMockPost('1')], cursor: null, hasMore: false },
    });

    renderHomePage();

    await waitFor(() => {
      expect(screen.getByText('99')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });
  });

  it('renders the StoryBar component', async () => {
    (api.get as Mock).mockResolvedValueOnce({
      data: { data: [createMockPost('1')], cursor: null, hasMore: false },
    });

    renderHomePage();

    expect(screen.getByTestId('story-bar')).toBeInTheDocument();
  });

  it('shows "You\'re all caught up" when no more posts', async () => {
    (api.get as Mock).mockResolvedValueOnce({
      data: { data: [createMockPost('1')], cursor: null, hasMore: false },
    });

    renderHomePage();

    await waitFor(() => {
      expect(screen.getByText("You're all caught up")).toBeInTheDocument();
    });
  });
});
