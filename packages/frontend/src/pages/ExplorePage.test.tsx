import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from 'vitest';

import ExplorePage from './ExplorePage';

// --- IntersectionObserver mock ---

const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

class MockIntersectionObserver {
  observe = mockObserve;
  unobserve = vi.fn();
  disconnect = mockDisconnect;
  constructor() {}
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

// --- Mocks ---

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/components/shared/Toast', () => ({
  useToast: () => ({ addToast: vi.fn(), removeToast: vi.fn(), toasts: [] }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import api from '@/lib/api';

function createMockExploreData() {
  return {
    trendingPosts: Array.from({ length: 10 }, (_, i) => ({
      id: `post-${i}`,
      author: { id: `user-${i}`, username: `user${i}`, avatarUrl: null },
      type: 'photo',
      content: `Trending post ${i}`,
      media: [{ id: `media-${i}`, url: `https://example.com/img${i}.jpg`, type: 'image', orderIndex: 0 }],
      likeCount: 100 - i,
      commentCount: 50 - i,
      shareCount: 10,
      isLiked: false,
      isBookmarked: false,
      createdAt: new Date().toISOString(),
    })),
    trendingHashtags: Array.from({ length: 10 }, (_, i) => ({
      id: `hashtag-${i}`,
      name: `trending${i}`,
      postCount: 1000 - i * 100,
    })),
    suggestedUsers: Array.from({ length: 10 }, (_, i) => ({
      id: `suggested-${i}`,
      username: `suggested${i}`,
      displayName: `Suggested User ${i}`,
      avatarUrl: null,
      bio: `Bio for user ${i}`,
      isFollowing: false,
    })),
  };
}

/** Helper to set up the default mock that handles all API routes */
function setupDefaultMocks(exploreData = createMockExploreData()) {
  (api.get as Mock).mockImplementation((url: string) => {
    if (url === '/explore') return Promise.resolve({ data: exploreData });
    if (url === '/search') return Promise.resolve({ data: { data: [], cursor: null, hasMore: false } });
    if (url === '/search/typeahead') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
  (api.post as Mock).mockResolvedValue({});
  (api.delete as Mock).mockResolvedValue({});
}

function renderExplorePage() {
  return render(
    <MemoryRouter>
      <ExplorePage />
    </MemoryRouter>
  );
}

describe('ExplorePage', () => {
  beforeEach(() => {
    mockObserve.mockClear();
    mockDisconnect.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows skeleton loaders while loading', () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {})); // never resolves
    renderExplorePage();
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders trending hashtags after loading', async () => {
    setupDefaultMocks();
    renderExplorePage();

    await waitFor(() => {
      expect(screen.getByText('Trending')).toBeInTheDocument();
      expect(screen.getByText(/#trending0/)).toBeInTheDocument();
      expect(screen.getByText(/#trending9/)).toBeInTheDocument();
    });
  });

  it('renders suggested users section with UserCard', async () => {
    setupDefaultMocks();
    renderExplorePage();

    await waitFor(() => {
      expect(screen.getByText('Suggested for You')).toBeInTheDocument();
      expect(screen.getByText('Suggested User 0')).toBeInTheDocument();
      expect(screen.getByText('@suggested0')).toBeInTheDocument();
    });
  });

  it('renders trending posts grid with 10 posts', async () => {
    setupDefaultMocks();
    renderExplorePage();

    await waitFor(() => {
      expect(screen.getByText('Trending Posts')).toBeInTheDocument();
      const images = document.querySelectorAll('img[src*="example.com"]');
      expect(images.length).toBe(10);
    });
  });

  it('renders content type filter tabs (All, Users, Posts, Hashtags, Reels)', async () => {
    setupDefaultMocks();
    renderExplorePage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Users' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Posts' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Hashtags' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Reels' })).toBeInTheDocument();
    });
  });

  it('triggers search on Enter key with 20 results per page', async () => {
    const exploreData = createMockExploreData();
    (api.get as Mock).mockImplementation((url: string) => {
      if (url === '/explore') return Promise.resolve({ data: exploreData });
      if (url === '/search') return Promise.resolve({ data: { data: [{ type: 'post', post: exploreData.trendingPosts[0] }], cursor: null, hasMore: false } });
      if (url === '/search/typeahead') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });

    renderExplorePage();

    await waitFor(() => {
      expect(screen.getByText('Trending')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Search');
    fireEvent.change(input, { target: { value: 'test query' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/search', {
        params: { q: 'test query', limit: '20' },
      });
    });
  });

  it('shows empty state when search returns no results', async () => {
    setupDefaultMocks();
    renderExplorePage();

    await waitFor(() => {
      expect(screen.getByText('Trending')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Search');
    fireEvent.change(input, { target: { value: 'nonexistent' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument();
      expect(screen.getByText(/Try a different search term/)).toBeInTheDocument();
    });
  });

  it('passes content type filter to search API', async () => {
    setupDefaultMocks();
    renderExplorePage();

    await waitFor(() => {
      expect(screen.getByText('Trending')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Search');
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/search', {
        params: { q: 'test', limit: '20' },
      });
    });

    // Click Users filter tab
    fireEvent.click(screen.getByRole('tab', { name: 'Users' }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/search', {
        params: { q: 'test', type: 'users', limit: '20' },
      });
    });
  });

  it('typeahead triggers after 2+ characters', async () => {
    setupDefaultMocks();
    renderExplorePage();

    await waitFor(() => {
      expect(screen.getByText('Trending')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Search');
    fireEvent.change(input, { target: { value: 'te' } });

    // After debounce (200ms), typeahead should be called
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/search/typeahead', { params: { q: 'te' } });
    });
  });

  it('does not trigger typeahead for 1 character', async () => {
    const typeaheadCalls: string[] = [];
    const exploreData = createMockExploreData();
    (api.get as Mock).mockImplementation((url: string, opts?: { params?: { q?: string } }) => {
      if (url === '/explore') return Promise.resolve({ data: exploreData });
      if (url === '/search/typeahead') {
        typeaheadCalls.push(opts?.params?.q ?? '');
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: {} });
    });

    renderExplorePage();

    await waitFor(() => {
      expect(screen.getByText('Trending')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Search');
    fireEvent.change(input, { target: { value: 'a' } });

    // Wait longer than debounce
    await new Promise((r) => setTimeout(r, 350));

    // Typeahead should NOT have been called
    expect(typeaheadCalls).toHaveLength(0);
  });

  it('follows a suggested user when Follow button is clicked', async () => {
    setupDefaultMocks();
    renderExplorePage();

    await waitFor(() => {
      expect(screen.getByText('Suggested User 0')).toBeInTheDocument();
    });

    const followButtons = screen.getAllByText('Follow');
    fireEvent.click(followButtons[0]);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/users/suggested-0/follow');
    });
  });

  it('shows paginated search results', async () => {
    const exploreData = createMockExploreData();
    const searchResults = Array.from({ length: 20 }, (_, i) => ({
      type: 'post',
      post: {
        id: `result-${i}`,
        author: { id: `author-${i}`, username: `author${i}`, avatarUrl: null },
        type: 'text',
        content: `Search result ${i}`,
        likeCount: 10,
        commentCount: 5,
        shareCount: 2,
        isLiked: false,
        isBookmarked: false,
        createdAt: new Date().toISOString(),
      },
    }));

    (api.get as Mock).mockImplementation((url: string) => {
      if (url === '/explore') return Promise.resolve({ data: exploreData });
      if (url === '/search') return Promise.resolve({ data: { data: searchResults, cursor: 'next-cursor', hasMore: true } });
      if (url === '/search/typeahead') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });

    renderExplorePage();

    await waitFor(() => {
      expect(screen.getByText('Trending')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Search');
    fireEvent.change(input, { target: { value: 'search' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Search Results')).toBeInTheDocument();
      expect(screen.getByText('Search result 0')).toBeInTheDocument();
      expect(screen.getByText('Search result 19')).toBeInTheDocument();
    });
  });
});
